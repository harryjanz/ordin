import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import update as sa_update
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


def auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _create_product(client, token, name="Produto"):
    r = await client.post("/catalog/products", json={"name": name, "price": 9.9}, headers=auth(token))
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _create_group_with_option(client, token, option, name="Sabor"):
    r = await client.post(
        "/catalog/option-groups",
        json={"name": name, "min_selections": 1, "max_selections": 1, "options": [option]},
        headers=auth(token),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    return body["id"], body["options"][0]["id"]


async def _set_product_conversion(product_id, *, unidade_compra, fator_conversao):
    """A5 (ORD-184) ainda não expõe isso via API — grava direto no banco pra
    testar que _get_stock_state/_create_stock_movement (generalizadas nesta
    história) já funcionam pro caminho Product também, sem esperar a A5."""
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        await db.execute(
            sa_update(svc.Product).where(svc.Product.id == product_id)
            .values(unidade_compra=unidade_compra, fator_conversao=fator_conversao)
        )
        await db.commit()


async def _set_product_estoque_minimo(product_id, valor):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        await db.execute(
            sa_update(svc.Product).where(svc.Product.id == product_id).values(estoque_minimo=valor)
        )
        await db.commit()


# ── Estoque mínimo em Option ─────────────────────────────────────────────

async def test_option_estoque_minimo_configuravel_antes_de_stock_item(client, token_owner):
    _, option_id = await _create_group_with_option(client, token_owner, {"label": "Coca-Cola", "estoque_minimo": 5})

    r = await client.get(f"/catalog/options/{option_id}/stock", headers=auth(token_owner))
    assert r.status_code == 200
    assert r.json()["estoque_minimo"] == 5.0
    assert r.json()["has_stock_item"] is False
    assert r.json()["abaixo_do_minimo"] is False


async def test_option_estoque_minimo_negativo_rejeitado(client, token_owner):
    r = await client.post(
        "/catalog/option-groups",
        json={"name": "Sabor", "min_selections": 1, "max_selections": 1,
              "options": [{"label": "Coca-Cola", "estoque_minimo": -1}]},
        headers=auth(token_owner),
    )
    assert r.status_code == 422


async def test_option_abaixo_do_minimo_independente_do_produto(client, token_owner):
    product_id = await _create_product(client, token_owner)
    await _set_product_estoque_minimo(product_id, 10)
    await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 7, "unidade": "un"},
        headers=auth(token_owner),
    )

    _, option_id = await _create_group_with_option(client, token_owner, {"label": "Coca-Cola", "estoque_minimo": 5})
    await client.post(
        f"/catalog/options/{option_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 7, "unidade": "un"},
        headers=auth(token_owner),
    )

    prod_state = await client.get(f"/catalog/products/{product_id}/stock", headers=auth(token_owner))
    assert prod_state.json()["abaixo_do_minimo"] is True  # 7 <= 10

    opt_state = await client.get(f"/catalog/options/{option_id}/stock", headers=auth(token_owner))
    assert opt_state.json()["abaixo_do_minimo"] is False  # 7 > 5


# ── Conversão de unidade em Option ───────────────────────────────────────

async def test_option_conversao_campos_precisam_vir_juntos(client, token_owner):
    r = await client.post(
        "/catalog/option-groups",
        json={"name": "Sabor", "min_selections": 1, "max_selections": 1,
              "options": [{"label": "Coca-Cola", "unidade_compra": "caixa"}]},
        headers=auth(token_owner),
    )
    assert r.status_code == 422

    r = await client.post(
        "/catalog/option-groups",
        json={"name": "Sabor", "min_selections": 1, "max_selections": 1,
              "options": [{"label": "Coca-Cola", "fator_conversao": 12}]},
        headers=auth(token_owner),
    )
    assert r.status_code == 422


async def test_option_fator_conversao_zero_ou_negativo_rejeitado(client, token_owner):
    for fator in (0, -5):
        r = await client.post(
            "/catalog/option-groups",
            json={"name": "Sabor", "min_selections": 1, "max_selections": 1,
                  "options": [{"label": "Coca-Cola", "unidade_compra": "caixa", "fator_conversao": fator}]},
            headers=auth(token_owner),
        )
        assert r.status_code == 422


async def test_option_conversao_funciona_sem_produto_ter_conversao(client, token_owner):
    product_id = await _create_product(client, token_owner)
    _, option_id = await _create_group_with_option(
        client, token_owner, {"label": "Coca-Cola", "unidade_compra": "caixa", "fator_conversao": 12},
    )
    await client.put(
        f"/catalog/products/{product_id}/option-groups",
        json={"option_group_ids": []}, headers=auth(token_owner),
    )  # produto sem grupo nenhum — garante que ele não é guarda-chuva (G4) pro teste seguinte não colidir

    r = await client.post(
        f"/catalog/options/{option_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 2, "em_unidade_compra": True, "unidade": "un"},
        headers=auth(token_owner),
    )
    assert r.status_code == 201, r.text
    assert Decimal(str(r.json()["quantidade_atual"])) == Decimal(24)

    # produto continua sem conversão nenhuma — não herdou da opção
    r_prod = await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 2, "em_unidade_compra": True, "unidade": "un"},
        headers=auth(token_owner),
    )
    assert r_prod.status_code == 400
    assert "conversão" in r_prod.json()["detail"]


async def test_produto_conversao_funciona_sem_opcao_ter_conversao(client, token_owner):
    product_id = await _create_product(client, token_owner)
    await _set_product_conversion(product_id, unidade_compra="fardo", fator_conversao=6)
    _, option_id = await _create_group_with_option(client, token_owner, {"label": "Coca-Cola"})

    r_prod = await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 2, "em_unidade_compra": True, "unidade": "un"},
        headers=auth(token_owner),
    )
    assert r_prod.status_code == 201, r_prod.text
    assert Decimal(str(r_prod.json()["quantidade_atual"])) == Decimal(12)

    # opção não herdou a conversão do produto pai
    r_opt = await client.post(
        f"/catalog/options/{option_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 2, "em_unidade_compra": True, "unidade": "un"},
        headers=auth(token_owner),
    )
    assert r_opt.status_code == 400
    assert "conversão" in r_opt.json()["detail"]


async def test_conversao_independente_entre_produto_e_opcao_do_mesmo_produto(client, token_owner):
    product_id = await _create_product(client, token_owner)
    await _set_product_conversion(product_id, unidade_compra="fardo", fator_conversao=6)
    _, option_id = await _create_group_with_option(
        client, token_owner, {"label": "Coca-Cola", "unidade_compra": "caixa", "fator_conversao": 12},
    )

    r_prod = await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 2, "em_unidade_compra": True, "unidade": "un"},
        headers=auth(token_owner),
    )
    r_opt = await client.post(
        f"/catalog/options/{option_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 2, "em_unidade_compra": True, "unidade": "un"},
        headers=auth(token_owner),
    )
    assert Decimal(str(r_prod.json()["quantidade_atual"])) == Decimal(12)  # 2×6
    assert Decimal(str(r_opt.json()["quantidade_atual"])) == Decimal(24)   # 2×12 — não usou o fator do produto


async def test_historico_guarda_quantidade_original_e_unidade_original(client, token_owner):
    _, option_id = await _create_group_with_option(
        client, token_owner, {"label": "Coca-Cola", "unidade_compra": "caixa", "fator_conversao": 12},
    )
    await client.post(
        f"/catalog/options/{option_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 2, "em_unidade_compra": True, "unidade": "un"},
        headers=auth(token_owner),
    )
    r = await client.get(f"/catalog/options/{option_id}/stock", headers=auth(token_owner))
    mov = r.json()["movements"][0]
    assert Decimal(str(mov["quantidade"])) == Decimal(24)
    assert Decimal(str(mov["quantidade_original"])) == Decimal(2)
    assert mov["unidade_original"] == "caixa"


async def test_conversao_arredondamento_fator_feio(client, token_owner):
    _, option_id = await _create_group_with_option(
        client, token_owner, {"label": "Café em grão", "unidade_compra": "saco", "fator_conversao": 0.333},
    )
    r = await client.post(
        f"/catalog/options/{option_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 2, "em_unidade_compra": True, "unidade": "kg"},
        headers=auth(token_owner),
    )
    assert r.status_code == 201, r.text
    assert Decimal(str(r.json()["quantidade_atual"])) == Decimal("0.666")


async def test_mudanca_de_fator_nao_recalcula_movimentacoes_antigas(client, token_owner):
    group_id, option_id = await _create_group_with_option(
        client, token_owner, {"label": "Coca-Cola", "unidade_compra": "caixa", "fator_conversao": 12},
    )
    await client.post(
        f"/catalog/options/{option_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 2, "em_unidade_compra": True, "unidade": "un"},
        headers=auth(token_owner),
    )

    await client.put(
        f"/catalog/option-groups/{group_id}/options",
        json={"options": [{"id": option_id, "label": "Coca-Cola", "unidade_compra": "caixa", "fator_conversao": 24}]},
        headers=auth(token_owner),
    )

    r = await client.get(f"/catalog/options/{option_id}/stock", headers=auth(token_owner))
    assert Decimal(str(r.json()["movements"][0]["quantidade"])) == Decimal(24)  # histórico antigo intocado
    assert Decimal(str(r.json()["quantidade_atual"])) == Decimal(24)  # saldo também não é recalculado
