import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from httpx import ASGITransport, AsyncClient
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


async def _create_product(client, token, *, name="Produto", estoque_minimo=0):
    r = await client.post(
        "/catalog/products", json={"name": name, "price": 9.9, "estoque_minimo": estoque_minimo},
        headers=auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _entrada(client, token, product_id, quantidade):
    r = await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": quantidade, "unidade": "un"},
        headers=auth(token),
    )
    assert r.status_code == 201, r.text


# ── Filtro de estoque no caminho totem ───────────────────────────────────

async def test_produto_controlado_abaixo_do_minimo_some_da_listagem(client, token_owner):
    product_id = await _create_product(client, token_owner, estoque_minimo=3)
    await _entrada(client, token_owner, product_id, 2)

    r = await client.get("/catalog/products", headers=auth(token_owner))
    ids = [p["id"] for p in r.json()["products"]]
    assert product_id not in ids


async def test_produto_controlado_exatamente_no_minimo_tambem_some(client, token_owner):
    product_id = await _create_product(client, token_owner, estoque_minimo=3)
    await _entrada(client, token_owner, product_id, 3)

    r = await client.get("/catalog/products", headers=auth(token_owner))
    ids = [p["id"] for p in r.json()["products"]]
    assert product_id not in ids  # achado de QA: <=, não só <


async def test_produto_controlado_acima_do_minimo_aparece_normalmente(client, token_owner):
    product_id = await _create_product(client, token_owner, estoque_minimo=3)
    await _entrada(client, token_owner, product_id, 10)

    r = await client.get("/catalog/products", headers=auth(token_owner))
    ids = [p["id"] for p in r.json()["products"]]
    assert product_id in ids


async def test_produto_sem_stock_item_aparece_mesmo_com_minimo_configurado(client, token_owner):
    product_id = await _create_product(client, token_owner, estoque_minimo=5)

    r = await client.get("/catalog/products", headers=auth(token_owner))
    ids = [p["id"] for p in r.json()["products"]]
    assert product_id in ids  # regra de rollout — nunca teve movimentação


async def test_listagem_do_admin_nao_e_afetada(client, token_owner):
    product_id = await _create_product(client, token_owner, estoque_minimo=3)
    await _entrada(client, token_owner, product_id, 2)

    r = await client.get("/catalog/products", params={"include_inactive": True}, headers=auth(token_owner))
    ids = [p["id"] for p in r.json()["products"]]
    assert product_id in ids


async def test_produto_reaparece_apos_entrada_trazer_de_volta_acima_do_minimo(client, token_owner):
    product_id = await _create_product(client, token_owner, estoque_minimo=3)
    await _entrada(client, token_owner, product_id, 2)

    r = await client.get("/catalog/products", headers=auth(token_owner))
    assert product_id not in [p["id"] for p in r.json()["products"]]

    await _entrada(client, token_owner, product_id, 5)  # quantidade_atual vira 7

    r = await client.get("/catalog/products", headers=auth(token_owner))
    assert product_id in [p["id"] for p in r.json()["products"]]


# ── N+1 (achado de QA) ────────────────────────────────────────────────────
# _serialize_product já faz consultas por produto (allergens/option_groups/
# related/promotion, pré-existente, fora de escopo desta história) — então o
# total de queries do endpoint inteiro já escala com N antes mesmo da A4.
# O que esta história garante é que a etapa de FILTRO por estoque em si não
# vira mais uma fonte de N+1 — _stock_items_by_product roda exatamente 1 vez
# por chamada, não 1 vez por produto, não importa quantos produtos existam.

async def test_filtro_de_estoque_chama_stock_items_by_product_uma_unica_vez(client, token_owner, monkeypatch):
    import main as svc

    for i in range(10):
        product_id = await _create_product(client, token_owner, name=f"Produto {i}", estoque_minimo=3)
        if i % 2 == 0:
            await _entrada(client, token_owner, product_id, 10)  # acima do mínimo — visível
        else:
            await _entrada(client, token_owner, product_id, 1)  # abaixo do mínimo — some

    call_count = 0
    original = svc._stock_items_by_product

    async def _spy(db, product_ids):
        nonlocal call_count
        call_count += 1
        return await original(db, product_ids)

    monkeypatch.setattr(svc, "_stock_items_by_product", _spy)

    r = await client.get("/catalog/products", headers=auth(token_owner))
    assert r.status_code == 200
    assert len(r.json()["products"]) == 5  # só os pares (i%2==0) ficam acima do mínimo
    assert call_count == 1  # não 1 por produto
