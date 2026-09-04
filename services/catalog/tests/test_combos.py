"""ORD-112: cadastro de combo/bundle no admin (catalog-service).
Cobre os cenários Gherkin do QA Explorer (docs/stories/ORD-112-combo-bundle-totem.md).
Mesmo padrão de fixtures de tests/test_coverage.py — sem S3 (combo não tem imagem).

ATENÇÃO: quando DB_URL aponta pro banco real de dev (fk_catalog, sem banco de
teste isolado neste setup), o teardown do `seed` só apaga produtos/categoria
pelos ids específicos que ele mesmo criou (nunca um delete sem WHERE) — mesmo
cuidado documentado em test_grupos_opcao.py depois do incidente de 2026-09-01
que apagou dado real de produção durante um teste.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete as sa_delete
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


@pytest.fixture
async def client():
    import main as svc
    db_url = os.environ["DB_URL"].replace("mysql+pymysql://", "mysql+aiomysql://")
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
    """3 produtos da empresa 1 (preços batendo com o protótipo validado) +
    1 produto da empresa 2, pra isolamento multi-tenant."""
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        before_combo_ids = set((await db.execute(select(svc.Combo.id))).scalars().all())

        cat1 = svc.Category(company_id=1, name="__combo_cat1__", active=True)
        cat2 = svc.Category(company_id=2, name="__combo_cat2__", active=True)
        db.add_all([cat1, cat2])
        await db.flush()
        burger = svc.Product(company_id=1, category_id=cat1.id, name="__combo_burger__", price=24.90, active=True)
        fries = svc.Product(company_id=1, category_id=cat1.id, name="__combo_fries__", price=10.90, active=True)
        soda = svc.Product(company_id=1, category_id=cat1.id, name="__combo_soda__", price=6.90, active=True)
        inactive_prod = svc.Product(company_id=1, category_id=cat1.id, name="__combo_inactive__", price=5.00, active=False)
        other_company_prod = svc.Product(company_id=2, category_id=cat2.id, name="__combo_other_company__", price=9.90, active=True)
        db.add_all([burger, fries, soda, inactive_prod, other_company_prod])
        await db.commit()
        ids = {
            "cat1_id": cat1.id, "cat2_id": cat2.id,
            "burger_id": burger.id, "fries_id": fries.id, "soda_id": soda.id,
            "inactive_id": inactive_prod.id, "other_company_id": other_company_prod.id,
        }
        yield ids

        after_combo_ids = set((await db.execute(select(svc.Combo.id))).scalars().all())
        new_combo_ids = after_combo_ids - before_combo_ids
        if new_combo_ids:
            await db.execute(sa_delete(svc.ComboItem).where(svc.ComboItem.combo_id.in_(new_combo_ids)))
            await db.execute(sa_delete(svc.Combo).where(svc.Combo.id.in_(new_combo_ids)))
        product_ids = [burger.id, fries.id, soda.id, inactive_prod.id, other_company_prod.id]
        await db.execute(sa_delete(svc.Product).where(svc.Product.id.in_(product_ids)))
        await db.execute(sa_delete(svc.Category).where(svc.Category.id.in_([cat1.id, cat2.id])))
        await db.commit()


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _create_combo(client, token, seed, price=34.90, name="__combo_classico__", product_ids=None, category_id=None, upsell_enabled=None):
    product_ids = product_ids if product_ids is not None else [seed["burger_id"], seed["fries_id"], seed["soda_id"]]
    body = {"name": name, "description": "combo de teste", "price": price, "items": [{"product_id": pid} for pid in product_ids]}
    if category_id is not None:
        body["category_id"] = category_id
    if upsell_enabled is not None:
        body["upsell_enabled"] = upsell_enabled
    return await client.post("/catalog/combos", json=body, headers=auth(token))


# ── Happy path ────────────────────────────────────────────────────────────────

async def test_criar_combo_com_itens_denormalizados(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed)
    assert r.status_code == 201
    data = r.json()
    assert data["price"] == 34.90
    assert data["active"] is True
    items = {i["product_id"]: i["price"] for i in data["items"]}
    assert items == {seed["burger_id"]: 24.90, seed["fries_id"]: 10.90, seed["soda_id"]: 6.90}


# ── ORD-157: toggle de sugestão automática de upsell ────────────────────────

async def test_criar_combo_sem_especificar_upsell_vem_ativado_por_padrao(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed)
    assert r.status_code == 201
    assert r.json()["upsell_enabled"] is True


async def test_criar_combo_com_upsell_desativado_explicitamente(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed, upsell_enabled=False)
    assert r.status_code == 201
    assert r.json()["upsell_enabled"] is False


async def test_editar_combo_desativa_upsell_sem_afetar_active(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed)
    combo_id = r.json()["id"]
    r2 = await client.put(
        f"/catalog/combos/{combo_id}",
        json={
            "name": "__combo_classico__", "price": 34.90,
            "items": [{"product_id": seed["burger_id"]}, {"product_id": seed["fries_id"]}, {"product_id": seed["soda_id"]}],
            "upsell_enabled": False,
        },
        headers=auth(token_owner),
    )
    assert r2.status_code == 200
    assert r2.json()["upsell_enabled"] is False
    assert r2.json()["active"] is True


async def test_editar_combo_sem_passar_upsell_volta_pro_default_true(client, seed, token_owner):
    """ComboIn é replace completo (PUT) — se o campo não vier no payload,
    Pydantic aplica o default (True), mesmo que o combo estivesse com
    upsell_enabled=False antes. Documenta o comportamento atual do replace
    completo (mesmo padrão já usado pelos outros campos do combo)."""
    r = await _create_combo(client, token_owner, seed, upsell_enabled=False)
    combo_id = r.json()["id"]
    r2 = await client.put(
        f"/catalog/combos/{combo_id}",
        json={
            "name": "__combo_classico__", "price": 34.90,
            "items": [{"product_id": seed["burger_id"]}, {"product_id": seed["fries_id"]}, {"product_id": seed["soda_id"]}],
        },
        headers=auth(token_owner),
    )
    assert r2.status_code == 200
    assert r2.json()["upsell_enabled"] is True


async def test_criar_combo_item_sem_especificar_triggers_upsell_vem_ativado_por_padrao(client, seed, token_owner):
    r = await client.post(
        "/catalog/combos",
        json={
            "name": "__combo_classico__", "price": 34.90,
            "items": [{"product_id": seed["burger_id"]}, {"product_id": seed["fries_id"]}],
        },
        headers=auth(token_owner),
    )
    assert r.status_code == 201
    assert all(i["triggers_upsell"] is True for i in r.json()["items"])


async def test_criar_combo_com_um_item_nao_disparando_upsell(client, seed, token_owner):
    """Caso motivador da história: burger indica o combo, refrigerante (item
    genérico, componente de vários combos possíveis) não."""
    r = await client.post(
        "/catalog/combos",
        json={
            "name": "__combo_classico__", "price": 34.90,
            "items": [
                {"product_id": seed["burger_id"], "triggers_upsell": True},
                {"product_id": seed["soda_id"], "triggers_upsell": False},
                {"product_id": seed["fries_id"], "triggers_upsell": True},
            ],
        },
        headers=auth(token_owner),
    )
    assert r.status_code == 201
    by_id = {i["product_id"]: i["triggers_upsell"] for i in r.json()["items"]}
    assert by_id[seed["burger_id"]] is True
    assert by_id[seed["soda_id"]] is False
    assert by_id[seed["fries_id"]] is True


async def test_editar_combo_muda_triggers_upsell_de_um_item_especifico(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed)
    combo_id = r.json()["id"]
    r2 = await client.put(
        f"/catalog/combos/{combo_id}",
        json={
            "name": "__combo_classico__", "price": 34.90,
            "items": [
                {"product_id": seed["burger_id"], "triggers_upsell": True},
                {"product_id": seed["fries_id"], "triggers_upsell": True},
                {"product_id": seed["soda_id"], "triggers_upsell": False},
            ],
        },
        headers=auth(token_owner),
    )
    assert r2.status_code == 200
    by_id = {i["product_id"]: i["triggers_upsell"] for i in r2.json()["items"]}
    assert by_id[seed["soda_id"]] is False
    assert by_id[seed["burger_id"]] is True


async def test_criar_combo_vinculado_a_categoria(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed, category_id=seed["cat1_id"])
    assert r.status_code == 201
    assert r.json()["category_id"] == seed["cat1_id"]


async def test_editar_combo_troca_categoria(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed, category_id=seed["cat1_id"])
    combo_id = r.json()["id"]
    r2 = await client.put(
        f"/catalog/combos/{combo_id}",
        json={
            "name": "__combo_classico__", "price": 34.90, "category_id": None,
            "items": [{"product_id": seed["burger_id"]}, {"product_id": seed["fries_id"]}, {"product_id": seed["soda_id"]}],
        },
        headers=auth(token_owner),
    )
    assert r2.status_code == 200
    assert r2.json()["category_id"] is None


async def test_categoria_de_outra_empresa_rejeitada(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed, category_id=seed["cat2_id"])
    assert r.status_code == 400


async def test_listar_combos_da_empresa(client, seed, token_owner):
    await _create_combo(client, token_owner, seed, name="__combo_a__")
    r = await client.get("/catalog/combos", headers=auth(token_owner))
    assert r.status_code == 200
    names = {c["name"] for c in r.json()["combos"]}
    assert "__combo_a__" in names


async def test_editar_combo_troca_produtos_componentes(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed, product_ids=[seed["burger_id"], seed["fries_id"]], price=30.0)
    combo_id = r.json()["id"]
    r2 = await client.put(
        f"/catalog/combos/{combo_id}",
        json={
            "name": "__combo_editado__", "price": 30.0,
            "items": [{"product_id": seed["burger_id"]}, {"product_id": seed["soda_id"]}],
        },
        headers=auth(token_owner),
    )
    assert r2.status_code == 200
    ids = {i["product_id"] for i in r2.json()["items"]}
    assert ids == {seed["burger_id"], seed["soda_id"]}


async def test_ativar_desativar_combo_sem_reeditar_resto(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed)
    combo_id = r.json()["id"]
    r2 = await client.patch(f"/catalog/combos/{combo_id}", json={"active": False}, headers=auth(token_owner))
    assert r2.status_code == 200
    assert r2.json()["active"] is False
    assert r2.json()["name"] == "__combo_classico__"
    r3 = await client.patch(f"/catalog/combos/{combo_id}", json={"active": True}, headers=auth(token_owner))
    assert r3.status_code == 200
    assert r3.json()["active"] is True


async def test_excluir_definitivamente_some_da_listagem(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed)
    combo_id = r.json()["id"]
    r2 = await client.delete(f"/catalog/combos/{combo_id}", headers=auth(token_owner))
    assert r2.status_code == 204
    r3 = await client.get("/catalog/combos?include_inactive=true", headers=auth(token_owner))
    assert combo_id not in {c["id"] for c in r3.json()["combos"]}


async def test_combo_inativo_some_da_listagem_padrao_mas_aparece_com_include_inactive(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed)
    combo_id = r.json()["id"]
    await client.patch(f"/catalog/combos/{combo_id}", json={"active": False}, headers=auth(token_owner))
    r2 = await client.get("/catalog/combos", headers=auth(token_owner))
    assert combo_id not in {c["id"] for c in r2.json()["combos"]}
    r3 = await client.get("/catalog/combos?include_inactive=true", headers=auth(token_owner))
    assert combo_id in {c["id"] for c in r3.json()["combos"]}


# ── Bordas / validação ──────────────────────────────────────────────────────

async def test_cadastro_trava_sem_economia_real(client, seed, token_owner):
    # soma avulsa = 24.90 + 10.90 + 6.90 = 42.70
    r = await _create_combo(client, token_owner, seed, price=42.70)
    assert r.status_code == 400
    r2 = await _create_combo(client, token_owner, seed, price=50.0)
    assert r2.status_code == 400


async def test_cadastro_trava_com_menos_de_2_produtos(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed, product_ids=[seed["burger_id"]])
    assert r.status_code == 422  # rejeitado no schema (ComboIn.at_least_two_products)


async def test_cadastro_trava_com_zero_produtos(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed, product_ids=[])
    assert r.status_code == 422


async def test_produto_inativo_nao_pode_compor_combo(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed, product_ids=[seed["burger_id"], seed["inactive_id"]])
    assert r.status_code == 404


# ── Erros ─────────────────────────────────────────────────────────────────

async def test_produto_de_outra_empresa_nao_pode_compor_combo(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed, product_ids=[seed["burger_id"], seed["other_company_id"]])
    assert r.status_code == 404


async def test_role_sem_permissao_nao_cria_combo(client, seed, token_kiosk):
    r = await _create_combo(client, token_kiosk, seed)
    assert r.status_code == 403


# ── Isolamento multi-tenant ──────────────────────────────────────────────

async def test_empresa_nao_enxerga_combo_de_outra_empresa(client, seed, token_owner, token_company_b):
    r = await _create_combo(client, token_owner, seed)
    combo_id = r.json()["id"]
    r2 = await client.get("/catalog/combos?include_inactive=true", headers=auth(token_company_b))
    assert combo_id not in {c["id"] for c in r2.json()["combos"]}


async def test_empresa_nao_edita_combo_de_outra_empresa(client, seed, token_owner, token_company_b):
    r = await _create_combo(client, token_owner, seed)
    combo_id = r.json()["id"]
    r2 = await client.put(
        f"/catalog/combos/{combo_id}",
        json={"name": "hackeado", "price": 1.0, "items": [{"product_id": seed["burger_id"]}, {"product_id": seed["fries_id"]}]},
        headers=auth(token_company_b),
    )
    assert r2.status_code == 404
    r3 = await client.get("/catalog/combos?include_inactive=true", headers=auth(token_owner))
    combo = next(c for c in r3.json()["combos"] if c["id"] == combo_id)
    assert combo["name"] == "__combo_classico__"


async def test_empresa_nao_remove_combo_de_outra_empresa(client, seed, token_owner, token_company_b):
    r = await _create_combo(client, token_owner, seed)
    combo_id = r.json()["id"]
    r2 = await client.delete(f"/catalog/combos/{combo_id}", headers=auth(token_company_b))
    assert r2.status_code == 404
    r3 = await client.get("/catalog/combos?include_inactive=true", headers=auth(token_owner))
    assert combo_id in {c["id"] for c in r3.json()["combos"]}


# ── ORD-151: alerta ao desativar produto vinculado a combo ativo ────────────

async def test_desativar_produto_sem_vinculo_combo_nao_gera_alerta(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed, product_ids=[seed["burger_id"], seed["fries_id"]])
    assert r.status_code == 201
    r2 = await client.put(f"/catalog/products/{seed['soda_id']}", json={"active": False}, headers=auth(token_owner))
    assert r2.status_code == 200
    assert r2.json()["active"] is False


async def test_desativar_produto_vinculado_sem_confirmar_retorna_409(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed)
    combo_id = r.json()["id"]
    r2 = await client.put(f"/catalog/products/{seed['burger_id']}", json={"active": False}, headers=auth(token_owner))
    assert r2.status_code == 409
    assert "__combo_classico__" in r2.json()["detail"]
    r3 = await client.get(f"/catalog/products/{seed['burger_id']}", headers=auth(token_owner))
    assert r3.json()["active"] is True
    r4 = await client.get("/catalog/combos", headers=auth(token_owner))
    combo = next(c for c in r4.json()["combos"] if c["id"] == combo_id)
    assert combo["active"] is True


async def test_confirmar_desativacao_aplica_cascata_no_produto_e_no_combo(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed)
    combo_id = r.json()["id"]
    r2 = await client.put(
        f"/catalog/products/{seed['burger_id']}",
        json={"active": False, "confirm_deactivate_combos": True},
        headers=auth(token_owner),
    )
    assert r2.status_code == 200
    assert r2.json()["active"] is False
    r3 = await client.get("/catalog/combos?include_inactive=true", headers=auth(token_owner))
    combo = next(c for c in r3.json()["combos"] if c["id"] == combo_id)
    assert combo["active"] is False
    # os outros componentes do combo não são afetados
    r4 = await client.get(f"/catalog/products/{seed['fries_id']}", headers=auth(token_owner))
    assert r4.json()["active"] is True


async def test_produto_vinculado_a_multiplos_combos_lista_e_desativa_todos(client, seed, token_owner):
    r1 = await _create_combo(client, token_owner, seed, name="__combo_a__",
                              product_ids=[seed["burger_id"], seed["fries_id"]])
    r2 = await _create_combo(client, token_owner, seed, name="__combo_b__", price=28.0,
                              product_ids=[seed["burger_id"], seed["soda_id"]])  # soma=31.80
    assert r1.status_code == 201 and r2.status_code == 201
    combo_a_id, combo_b_id = r1.json()["id"], r2.json()["id"]

    r3 = await client.put(f"/catalog/products/{seed['burger_id']}", json={"active": False}, headers=auth(token_owner))
    assert r3.status_code == 409
    assert "__combo_a__" in r3.json()["detail"] and "__combo_b__" in r3.json()["detail"]

    r4 = await client.put(
        f"/catalog/products/{seed['burger_id']}",
        json={"active": False, "confirm_deactivate_combos": True},
        headers=auth(token_owner),
    )
    assert r4.status_code == 200
    r5 = await client.get("/catalog/combos?include_inactive=true", headers=auth(token_owner))
    combos_by_id = {c["id"]: c for c in r5.json()["combos"]}
    assert combos_by_id[combo_a_id]["active"] is False
    assert combos_by_id[combo_b_id]["active"] is False


async def test_produto_vinculado_so_a_combo_ja_inativo_desativa_sem_alerta(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed)
    combo_id = r.json()["id"]
    await client.patch(f"/catalog/combos/{combo_id}", json={"active": False}, headers=auth(token_owner))

    r2 = await client.put(f"/catalog/products/{seed['burger_id']}", json={"active": False}, headers=auth(token_owner))
    assert r2.status_code == 200
    assert r2.json()["active"] is False


async def test_reativar_produto_nao_reativa_combo_automaticamente(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed)
    combo_id = r.json()["id"]
    await client.put(
        f"/catalog/products/{seed['burger_id']}",
        json={"active": False, "confirm_deactivate_combos": True},
        headers=auth(token_owner),
    )
    r2 = await client.put(f"/catalog/products/{seed['burger_id']}", json={"active": True}, headers=auth(token_owner))
    assert r2.status_code == 200
    assert r2.json()["active"] is True
    # ORD-152: reativar o produto não reativa o combo sozinho, mas a resposta
    # já sugere o combo pra reativação manual do admin
    assert [c["id"] for c in r2.json()["inactive_combos"]] == [combo_id]
    r3 = await client.get("/catalog/combos?include_inactive=true", headers=auth(token_owner))
    combo = next(c for c in r3.json()["combos"] if c["id"] == combo_id)
    assert combo["active"] is False


# ── ORD-152: sugerir reativação de combos ao ativar produto ─────────────────

async def test_ativar_produto_sem_combo_inativo_nao_sugere_nada(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed, product_ids=[seed["burger_id"], seed["fries_id"]])
    assert r.status_code == 201
    await client.put(f"/catalog/products/{seed['soda_id']}", json={"active": False}, headers=auth(token_owner))
    r2 = await client.put(f"/catalog/products/{seed['soda_id']}", json={"active": True}, headers=auth(token_owner))
    assert r2.status_code == 200
    assert r2.json()["inactive_combos"] == []


async def test_ativar_produto_vinculado_a_multiplos_combos_inativos_lista_todos(client, seed, token_owner):
    r1 = await _create_combo(client, token_owner, seed, name="__combo_a__",
                              product_ids=[seed["burger_id"], seed["fries_id"]])
    r2 = await _create_combo(client, token_owner, seed, name="__combo_b__", price=28.0,
                              product_ids=[seed["burger_id"], seed["soda_id"]])
    combo_a_id, combo_b_id = r1.json()["id"], r2.json()["id"]
    await client.put(
        f"/catalog/products/{seed['burger_id']}",
        json={"active": False, "confirm_deactivate_combos": True},
        headers=auth(token_owner),
    )
    r3 = await client.put(f"/catalog/products/{seed['burger_id']}", json={"active": True}, headers=auth(token_owner))
    assert r3.status_code == 200
    ids = {c["id"] for c in r3.json()["inactive_combos"]}
    assert ids == {combo_a_id, combo_b_id}


async def test_combo_excluido_definitivamente_nunca_aparece_na_sugestao(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed)
    combo_id = r.json()["id"]
    await client.put(
        f"/catalog/products/{seed['burger_id']}",
        json={"active": False, "confirm_deactivate_combos": True},
        headers=auth(token_owner),
    )
    await client.delete(f"/catalog/combos/{combo_id}", headers=auth(token_owner))
    r2 = await client.put(f"/catalog/products/{seed['burger_id']}", json={"active": True}, headers=auth(token_owner))
    assert r2.status_code == 200
    assert combo_id not in {c["id"] for c in r2.json()["inactive_combos"]}


async def test_admin_reativa_so_o_combo_escolhido(client, seed, token_owner):
    """Simula o frontend: sugestão traz 2 combos, admin desmarca um e só
    confirma o outro via PATCH — mesmo endpoint do ORD-112/151."""
    r1 = await _create_combo(client, token_owner, seed, name="__combo_a__",
                              product_ids=[seed["burger_id"], seed["fries_id"]])
    r2 = await _create_combo(client, token_owner, seed, name="__combo_b__", price=28.0,
                              product_ids=[seed["burger_id"], seed["soda_id"]])
    combo_a_id, combo_b_id = r1.json()["id"], r2.json()["id"]
    await client.put(
        f"/catalog/products/{seed['burger_id']}",
        json={"active": False, "confirm_deactivate_combos": True},
        headers=auth(token_owner),
    )
    await client.put(f"/catalog/products/{seed['burger_id']}", json={"active": True}, headers=auth(token_owner))

    r3 = await client.patch(f"/catalog/combos/{combo_a_id}", json={"active": True}, headers=auth(token_owner))
    assert r3.status_code == 200
    r4 = await client.get("/catalog/combos?include_inactive=true", headers=auth(token_owner))
    combos_by_id = {c["id"]: c for c in r4.json()["combos"]}
    assert combos_by_id[combo_a_id]["active"] is True
    assert combos_by_id[combo_b_id]["active"] is False


# Botão "Desativar" do admin usa DELETE (não PUT) — mesma regra precisa valer lá.

async def test_delete_sem_permanent_com_vinculo_sem_confirmar_retorna_409(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed)
    combo_id = r.json()["id"]
    r2 = await client.delete(f"/catalog/products/{seed['burger_id']}", headers=auth(token_owner))
    assert r2.status_code == 409
    assert "__combo_classico__" in r2.json()["detail"]
    r3 = await client.get("/catalog/combos", headers=auth(token_owner))
    combo = next(c for c in r3.json()["combos"] if c["id"] == combo_id)
    assert combo["active"] is True


async def test_delete_com_confirm_deactivate_combos_aplica_cascata(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed)
    combo_id = r.json()["id"]
    r2 = await client.delete(
        f"/catalog/products/{seed['burger_id']}",
        params={"confirm_deactivate_combos": "true"},
        headers=auth(token_owner),
    )
    assert r2.status_code == 204
    r3 = await client.get(f"/catalog/products/{seed['burger_id']}", headers=auth(token_owner))
    assert r3.json()["active"] is False
    r4 = await client.get("/catalog/combos?include_inactive=true", headers=auth(token_owner))
    combo = next(c for c in r4.json()["combos"] if c["id"] == combo_id)
    assert combo["active"] is False


async def test_ativar_combo_com_produto_inativo_e_recusado(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed)
    combo_id = r.json()["id"]
    await client.delete(
        f"/catalog/products/{seed['burger_id']}",
        params={"confirm_deactivate_combos": "true"},
        headers=auth(token_owner),
    )
    # combo e produto já estão inativos aqui — tentar reativar só o combo direto
    r2 = await client.patch(f"/catalog/combos/{combo_id}", json={"active": True}, headers=auth(token_owner))
    assert r2.status_code == 409
    assert "__combo_burger__" in r2.json()["detail"]
    r3 = await client.get("/catalog/combos?include_inactive=true", headers=auth(token_owner))
    combo = next(c for c in r3.json()["combos"] if c["id"] == combo_id)
    assert combo["active"] is False

    # reativa o produto primeiro — agora o combo pode ser reativado
    await client.put(f"/catalog/products/{seed['burger_id']}", json={"active": True}, headers=auth(token_owner))
    r4 = await client.patch(f"/catalog/combos/{combo_id}", json={"active": True}, headers=auth(token_owner))
    assert r4.status_code == 200
    assert r4.json()["active"] is True


# ── Regressão ────────────────────────────────────────────────────────────

async def test_listagem_de_produtos_continua_funcionando_com_combos_cadastrados(client, seed, token_owner):
    await _create_combo(client, token_owner, seed)
    r = await client.get("/catalog/products", headers=auth(token_owner))
    assert r.status_code == 200
    names = {p["name"] for p in r.json()["products"]}
    assert "__combo_burger__" in names


# ── ORD-159: option_groups por componente do combo ──────────────────────────

async def test_item_de_combo_com_grupo_vinculado_expoe_option_groups(client, seed, token_owner):
    g = await client.post(
        "/catalog/option-groups",
        json={
            "name": "__sabores_combo__", "min_selections": 1, "max_selections": 1,
            "options": [{"label": "Guaraná Antarctica", "price_delta": 0}, {"label": "Coca-Cola", "price_delta": 0}],
        },
        headers=auth(token_owner),
    )
    gid = g.json()["id"]
    try:
        await client.put(
            f"/catalog/products/{seed['soda_id']}/option-groups",
            json={"option_group_ids": [gid]},
            headers=auth(token_owner),
        )

        r = await _create_combo(client, token_owner, seed)
        assert r.status_code == 201
        items = {i["product_id"]: i for i in r.json()["items"]}

        soda_groups = items[seed["soda_id"]]["option_groups"]
        assert len(soda_groups) == 1
        assert soda_groups[0]["name"] == "__sabores_combo__"
        assert {o["label"] for o in soda_groups[0]["options"]} == {"Guaraná Antarctica", "Coca-Cola"}

        # componente sem grupo vinculado retorna lista vazia — mudança aditiva,
        # sem quebrar consumidor que ignora o campo.
        assert items[seed["burger_id"]]["option_groups"] == []
        assert items[seed["fries_id"]]["option_groups"] == []
    finally:
        # Mesmo cuidado de test_grupos_opcao.py (incidente de 2026-09-01):
        # sem banco de teste isolado neste setup, limpa explicitamente o que
        # este teste criou em vez de confiar em rollback.
        import main as svc
        async with svc.AsyncSessionLocal() as db:
            await db.execute(sa_delete(svc.ProductOptionGroup).where(svc.ProductOptionGroup.option_group_id == gid))
            await db.execute(sa_delete(svc.Option).where(svc.Option.option_group_id == gid))
            await db.execute(sa_delete(svc.OptionGroup).where(svc.OptionGroup.id == gid))
            await db.commit()


async def test_combo_sem_nenhum_item_com_grupo_option_groups_todos_vazios(client, seed, token_owner):
    r = await _create_combo(client, token_owner, seed)
    assert r.status_code == 201
    assert all(i["option_groups"] == [] for i in r.json()["items"])
