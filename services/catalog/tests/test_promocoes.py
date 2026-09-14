"""ORD-166: promoções no catálogo — desconto percentual por período, com
composição de categoria/produto/combo e override por item. Cobre os
cenários Gherkin do QA Explorer (docs/stories/ORD-166-promocoes-catalogo.md).
Mesmo padrão de fixtures de tests/test_combos.py.
"""
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


@pytest.fixture
async def client():
    import main as svc
    db_url = os.environ["DB_URL"]
    test_engine = create_async_engine(db_url, echo=False)
    test_session = async_sessionmaker(test_engine, expire_on_commit=False)
    orig_engine, orig_session = svc.engine, svc.AsyncSessionLocal
    svc.engine = test_engine
    svc.AsyncSessionLocal = test_session
    async with test_engine.begin() as conn:
        await conn.run_sync(svc.Base.metadata.create_all)
    async with AsyncClient(transport=ASGITransport(app=svc.app), base_url="http://test") as c:
        yield c
    await test_engine.dispose()
    svc.engine, svc.AsyncSessionLocal = orig_engine, orig_session


@pytest.fixture
async def seed(client):
    """Empresa 1: categorias Lanches/Bebidas, produtos X-Bacon/X-Salada
    (Lanches) e Suco/Milkshake (Bebidas), combo Combo Família (X-Bacon +
    Suco). Empresa 2: 1 produto, só pra isolamento multi-tenant."""
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        cat_lanches = svc.Category(company_id=1, name="__promo_lanches__", active=True)
        cat_bebidas = svc.Category(company_id=1, name="__promo_bebidas__", active=True)
        db.add_all([cat_lanches, cat_bebidas])
        await db.flush()

        burger = svc.Product(company_id=1, category_id=cat_lanches.id, name="__promo_xbacon__", price=27.90, active=True)
        salada = svc.Product(company_id=1, category_id=cat_lanches.id, name="__promo_xsalada__", price=21.90, active=True)
        suco = svc.Product(company_id=1, category_id=cat_bebidas.id, name="__promo_suco__", price=8.00, active=True)
        milkshake = svc.Product(company_id=1, category_id=cat_bebidas.id, name="__promo_milkshake__", price=12.00, active=True)
        other_company_prod = svc.Product(company_id=2, category_id=None, name="__promo_other_company__", price=9.90, active=True)
        db.add_all([burger, salada, suco, milkshake, other_company_prod])
        await db.flush()

        combo = svc.Combo(company_id=1, name="__promo_combo_familia__", price=34.90, active=True)
        db.add(combo)
        await db.flush()
        db.add_all([
            svc.ComboItem(combo_id=combo.id, product_id=burger.id),
            svc.ComboItem(combo_id=combo.id, product_id=suco.id),
        ])
        await db.commit()

        yield {
            "cat_lanches": cat_lanches.id, "cat_bebidas": cat_bebidas.id,
            "burger": burger.id, "salada": salada.id, "suco": suco.id,
            "milkshake": milkshake.id, "combo": combo.id,
            "other_company_product": other_company_prod.id,
        }


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _future_window():
    now = datetime.utcnow()
    return _iso(now - timedelta(minutes=5)), _iso(now + timedelta(hours=1))


async def _create_promo(client, token, name, items, general_discount_percent=10.0, starts_at=None, ends_at=None):
    if starts_at is None or ends_at is None:
        starts_at, ends_at = _future_window()
    body = {
        "name": name, "starts_at": starts_at, "ends_at": ends_at,
        "general_discount_percent": general_discount_percent, "items": items,
    }
    return await client.post("/catalog/promotions", json=body, headers=auth(token))


async def _enable(client, token, promo_id, enabled=True):
    return await client.patch(f"/catalog/promotions/{promo_id}", json={"is_enabled": enabled}, headers=auth(token))


# ── Happy path ──────────────────────────────────────────────────────────────

async def test_criar_promocao_rascunho_sem_desconto_aplicado(client, seed, token_owner):
    r = await _create_promo(
        client, token_owner, "__Happy Hour__",
        items=[{"item_type": "category", "category_id": seed["cat_lanches"]}],
        general_discount_percent=20.0,
    )
    assert r.status_code == 201
    data = r.json()
    assert data["status"] == "rascunho"
    assert data["is_enabled"] is False

    prod = await client.get(f"/catalog/products/{seed['burger']}", headers=auth(token_owner))
    assert prod.json()["promotion"] is None


async def test_override_precedencia_produto_sobre_categoria(client, seed, token_owner):
    r = await _create_promo(
        client, token_owner, "__Combo do Dia__",
        items=[
            {"item_type": "category", "category_id": seed["cat_lanches"]},
            {"item_type": "product", "product_id": seed["burger"], "discount_percent_override": 25.0},
        ],
        general_discount_percent=10.0,
    )
    promo_id = r.json()["id"]
    r = await _enable(client, token_owner, promo_id)
    assert r.status_code == 200
    assert r.json()["status"] == "ativa"

    burger = (await client.get(f"/catalog/products/{seed['burger']}", headers=auth(token_owner))).json()
    assert burger["promotion"]["discount_percent"] == 25.0
    assert burger["promotion"]["final_price"] == round(27.90 * 0.75, 2)

    salada = (await client.get(f"/catalog/products/{seed['salada']}", headers=auth(token_owner))).json()
    assert salada["promotion"]["discount_percent"] == 10.0
    assert salada["promotion"]["final_price"] == round(21.90 * 0.90, 2)


async def test_combo_isolado_de_produto_avulso(client, seed, token_owner):
    r = await _create_promo(
        client, token_owner, "__Promo Combo__",
        items=[{"item_type": "combo", "combo_id": seed["combo"]}],
        general_discount_percent=15.0,
    )
    await _enable(client, token_owner, r.json()["id"])

    combo = (await client.get("/catalog/combos", headers=auth(token_owner))).json()["combos"]
    combo_data = next(c for c in combo if c["id"] == seed["combo"])
    assert combo_data["promotion"]["discount_percent"] == 15.0
    assert combo_data["promotion"]["final_price"] == round(34.90 * 0.85, 2)

    burger = (await client.get(f"/catalog/products/{seed['burger']}", headers=auth(token_owner))).json()
    assert burger["promotion"] is None


# ── Validação de cadastro ─────────────────────────────────────────────────────

@pytest.mark.parametrize("overrides", [
    {"name": ""},
    {"general_discount_percent": -1},
    {"general_discount_percent": 101},
])
async def test_criar_promocao_dados_invalidos_rejeitados(client, seed, token_owner, overrides):
    starts_at, ends_at = _future_window()
    body = {
        "name": "__promo_invalida__", "starts_at": starts_at, "ends_at": ends_at,
        "general_discount_percent": 10.0,
        "items": [{"item_type": "product", "product_id": seed["burger"]}],
    }
    body.update(overrides)
    r = await client.post("/catalog/promotions", json=body, headers=auth(token_owner))
    assert r.status_code == 422  # validação Pydantic


async def test_criar_promocao_fim_antes_do_inicio_rejeitado(client, seed, token_owner):
    now = datetime.utcnow()
    r = await _create_promo(
        client, token_owner, "__promo_periodo_invertido__",
        items=[{"item_type": "product", "product_id": seed["burger"]}],
        starts_at=_iso(now + timedelta(hours=1)), ends_at=_iso(now),
    )
    assert r.status_code == 422


async def test_criar_promocao_sem_composicao_rejeitada(client, seed, token_owner):
    r = await _create_promo(client, token_owner, "__promo_vazia__", items=[])
    assert r.status_code == 400


# ── Conflito ──────────────────────────────────────────────────────────────────

async def test_cadastro_permitido_com_conflito_mas_ativacao_bloqueada(client, seed, token_owner):
    promo_a = (await _create_promo(
        client, token_owner, "__Promo A__",
        items=[{"item_type": "product", "product_id": seed["burger"]}],
    )).json()
    await _enable(client, token_owner, promo_a["id"])

    r = await _create_promo(
        client, token_owner, "__Promo B__",
        items=[{"item_type": "product", "product_id": seed["burger"]}],
    )
    assert r.status_code == 201  # cadastro sempre permitido

    listing = (await client.get("/catalog/promotions", headers=auth(token_owner))).json()["promotions"]
    promo_b = next(p for p in listing if p["id"] == r.json()["id"])
    assert promo_b["status"] == "conflito"

    r2 = await _enable(client, token_owner, promo_b["id"])
    assert r2.status_code == 409
    assert "Promo A" in r2.json()["detail"]


async def test_ativacao_aceita_sem_conflito(client, seed, token_owner):
    r = await _create_promo(
        client, token_owner, "__Promo C__",
        items=[{"item_type": "product", "product_id": seed["salada"]}],
    )
    r2 = await _enable(client, token_owner, r.json()["id"])
    assert r2.status_code == 200
    assert r2.json()["status"] == "ativa"


async def test_conflito_deixa_de_existir_quando_promocao_concorrente_expira(client, seed, token_owner):
    now = datetime.utcnow()
    past_start, past_end = _iso(now - timedelta(hours=2)), _iso(now - timedelta(hours=1))

    promo_a = (await _create_promo(
        client, token_owner, "__Promo A Expirada__",
        items=[{"item_type": "product", "product_id": seed["burger"]}],
        starts_at=past_start, ends_at=past_end,
    )).json()
    # ativa "no passado" diretamente no banco pra simular uma promoção que
    # já foi habilitada e cujo período só terminou depois — sem sleep real.
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        from sqlalchemy import update
        await db.execute(update(svc.Promotion).where(svc.Promotion.id == promo_a["id"]).values(is_enabled=True))
        await db.commit()

    promo_b = (await _create_promo(
        client, token_owner, "__Promo B__",
        items=[{"item_type": "product", "product_id": seed["burger"]}],
        starts_at=past_start, ends_at=past_end,
    )).json()
    r = await _enable(client, token_owner, promo_b["id"])
    assert r.status_code == 200  # A já expirou (ends_at no passado), não conflita mais
    assert r.json()["status"] == "expirada"  # a própria B também já passou do fim


# ── Expiração automática ──────────────────────────────────────────────────────

async def test_promocao_expirada_nao_aplica_desconto(client, seed, token_owner):
    now = datetime.utcnow()
    promo = (await _create_promo(
        client, token_owner, "__Promo Expirada__",
        items=[{"item_type": "product", "product_id": seed["burger"]}],
        starts_at=_iso(now - timedelta(hours=2)), ends_at=_iso(now - timedelta(hours=1)),
    )).json()
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        from sqlalchemy import update
        await db.execute(update(svc.Promotion).where(svc.Promotion.id == promo["id"]).values(is_enabled=True))
        await db.commit()

    detail = (await client.get(f"/catalog/promotions/{promo['id']}", headers=auth(token_owner))).json()
    assert detail["status"] == "expirada"
    burger = (await client.get(f"/catalog/products/{seed['burger']}", headers=auth(token_owner))).json()
    assert burger["promotion"] is None


async def test_promocao_com_inicio_futuro_nao_aplica_desconto_ainda(client, seed, token_owner):
    now = datetime.utcnow()
    promo = (await _create_promo(
        client, token_owner, "__Promo Futura__",
        items=[{"item_type": "product", "product_id": seed["burger"]}],
        starts_at=_iso(now + timedelta(hours=1)), ends_at=_iso(now + timedelta(hours=2)),
    )).json()
    r = await _enable(client, token_owner, promo["id"])
    assert r.status_code == 200
    assert r.json()["status"] == "ativa"  # habilitada, só ainda não chegou a hora

    burger = (await client.get(f"/catalog/products/{seed['burger']}", headers=auth(token_owner))).json()
    assert burger["promotion"] is None


# ── Item indisponível ─────────────────────────────────────────────────────────

async def test_produto_inativado_fica_indisponivel_na_promocao_sem_quebrar_o_resto(client, seed, token_owner):
    r = await _create_promo(
        client, token_owner, "__Promo Bebidas__",
        items=[
            {"item_type": "product", "product_id": seed["suco"]},
            {"item_type": "product", "product_id": seed["milkshake"]},
        ],
    )
    promo_id = r.json()["id"]
    await _enable(client, token_owner, promo_id)

    await client.put(
        f"/catalog/products/{seed['milkshake']}",
        json={"name": "__promo_milkshake__", "price": 12.0, "active": False},
        headers=auth(token_owner),
    )

    detail = (await client.get(f"/catalog/promotions/{promo_id}", headers=auth(token_owner))).json()
    items_by_product = {i["product_id"]: i for i in detail["items"] if i["item_type"] == "product"}
    assert items_by_product[seed["milkshake"]]["available"] is False
    assert items_by_product[seed["suco"]]["available"] is True
    assert detail["status"] == "ativa"  # não invalida a promoção inteira: resto segue funcionando

    # suco (o item que segue disponível) continua recebendo o desconto normalmente
    suco = (await client.get(f"/catalog/products/{seed['suco']}", headers=auth(token_owner))).json()
    assert suco["promotion"] is not None

    # milkshake inativo some da listagem padrão do totem (comportamento já
    # existente do catálogo pra qualquer item active=False, não específico
    # de promoção) — aqui só confirmamos que a promoção não impede isso.
    listing = (await client.get("/catalog/products", params={"category_id": seed["cat_bebidas"]}, headers=auth(token_owner))).json()
    listed_ids = {p["id"] for p in listing["products"]}
    assert seed["milkshake"] not in listed_ids
    assert seed["suco"] in listed_ids


# ── Edição de promoção ativa ──────────────────────────────────────────────────

async def test_promocao_ativa_nao_pode_ser_editada_direto(client, seed, token_owner):
    promo = (await _create_promo(
        client, token_owner, "__Promo Editar__",
        items=[{"item_type": "product", "product_id": seed["burger"]}],
    )).json()
    await _enable(client, token_owner, promo["id"])

    r = await client.put(
        f"/catalog/promotions/{promo['id']}",
        json={
            "name": "__Promo Editada__", **dict(zip(["starts_at", "ends_at"], _future_window())),
            "general_discount_percent": 30.0,
            "items": [{"item_type": "product", "product_id": seed["burger"]}],
        },
        headers=auth(token_owner),
    )
    assert r.status_code == 409


async def test_editar_promocao_exige_inativar_antes(client, seed, token_owner):
    promo = (await _create_promo(
        client, token_owner, "__Promo Ciclo__",
        items=[{"item_type": "product", "product_id": seed["burger"]}],
        general_discount_percent=20.0,
    )).json()
    await _enable(client, token_owner, promo["id"])
    await _enable(client, token_owner, promo["id"], enabled=False)

    starts_at, ends_at = _future_window()
    r = await client.put(
        f"/catalog/promotions/{promo['id']}",
        json={
            "name": "__Promo Ciclo__", "starts_at": starts_at, "ends_at": ends_at,
            "general_discount_percent": 30.0,
            "items": [{"item_type": "product", "product_id": seed["burger"]}],
        },
        headers=auth(token_owner),
    )
    assert r.status_code == 200

    r2 = await _enable(client, token_owner, promo["id"])
    assert r2.status_code == 200
    assert r2.json()["general_discount_percent"] == 30.0


# ── Isolamento multi-tenant ────────────────────────────────────────────────────

async def test_empresa_nao_acessa_promocao_de_outra_empresa(client, seed, token_owner, token_company_b):
    promo = (await _create_promo(
        client, token_owner, "__Promo Empresa 1__",
        items=[{"item_type": "product", "product_id": seed["burger"]}],
    )).json()

    r_get = await client.get(f"/catalog/promotions/{promo['id']}", headers=auth(token_company_b))
    assert r_get.status_code == 404

    r_patch = await _enable(client, token_company_b, promo["id"])
    assert r_patch.status_code == 404

    r_put = await client.put(
        f"/catalog/promotions/{promo['id']}",
        json={
            "name": "__hack__", **dict(zip(["starts_at", "ends_at"], _future_window())),
            "general_discount_percent": 99.0,
            "items": [{"item_type": "product", "product_id": seed["other_company_product"]}],
        },
        headers=auth(token_company_b),
    )
    assert r_put.status_code == 404
