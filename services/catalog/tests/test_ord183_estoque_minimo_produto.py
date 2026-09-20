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


# ── Configuração de estoque_minimo em Product ────────────────────────────

async def test_criar_produto_com_estoque_minimo(client, token_owner):
    r = await client.post(
        "/catalog/products", json={"name": "Produto", "price": 9.9, "estoque_minimo": 5},
        headers=auth(token_owner),
    )
    assert r.status_code == 201, r.text
    assert r.json()["estoque_minimo"] == 5.0


async def test_produto_sem_estoque_minimo_usa_default_zero(client, token_owner):
    r = await client.post("/catalog/products", json={"name": "Produto", "price": 9.9}, headers=auth(token_owner))
    assert r.json()["estoque_minimo"] == 0.0


async def test_estoque_minimo_negativo_rejeitado_na_criacao(client, token_owner):
    r = await client.post(
        "/catalog/products", json={"name": "Produto", "price": 9.9, "estoque_minimo": -1},
        headers=auth(token_owner),
    )
    assert r.status_code == 422


async def test_configurar_estoque_minimo_antes_de_stock_item_existir(client, token_owner):
    r = await client.post("/catalog/products", json={"name": "Produto", "price": 9.9}, headers=auth(token_owner))
    product_id = r.json()["id"]

    r = await client.put(
        f"/catalog/products/{product_id}", json={"estoque_minimo": 5}, headers=auth(token_owner),
    )
    assert r.status_code == 200
    assert r.json()["estoque_minimo"] == 5.0

    state = await client.get(f"/catalog/products/{product_id}/stock", headers=auth(token_owner))
    assert state.json()["has_stock_item"] is False
    assert state.json()["estoque_minimo"] == 5.0
    assert state.json()["abaixo_do_minimo"] is False


async def test_estoque_minimo_negativo_rejeitado_na_edicao(client, token_owner):
    r = await client.post("/catalog/products", json={"name": "Produto", "price": 9.9}, headers=auth(token_owner))
    product_id = r.json()["id"]

    r = await client.put(
        f"/catalog/products/{product_id}", json={"estoque_minimo": -1}, headers=auth(token_owner),
    )
    assert r.status_code == 422


async def test_editar_outro_campo_nao_mexe_no_estoque_minimo(client, token_owner):
    r = await client.post(
        "/catalog/products", json={"name": "Produto", "price": 9.9, "estoque_minimo": 5},
        headers=auth(token_owner),
    )
    product_id = r.json()["id"]

    r = await client.put(f"/catalog/products/{product_id}", json={"name": "Produto renomeado"}, headers=auth(token_owner))
    assert r.status_code == 200
    assert r.json()["estoque_minimo"] == 5.0  # não foi tocado


# ── Indicador "abaixo do mínimo" (<=, achado do QA) ──────────────────────

async def test_indicador_aparece_quando_quantidade_igual_ao_minimo(client, token_owner):
    r = await client.post(
        "/catalog/products", json={"name": "Produto", "price": 9.9, "estoque_minimo": 3},
        headers=auth(token_owner),
    )
    product_id = r.json()["id"]
    await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 3, "unidade": "un"},
        headers=auth(token_owner),
    )
    state = await client.get(f"/catalog/products/{product_id}/stock", headers=auth(token_owner))
    assert state.json()["abaixo_do_minimo"] is True  # <=, não só <


async def test_indicador_aparece_quando_quantidade_abaixo_do_minimo(client, token_owner):
    r = await client.post(
        "/catalog/products", json={"name": "Produto", "price": 9.9, "estoque_minimo": 3},
        headers=auth(token_owner),
    )
    product_id = r.json()["id"]
    await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 2, "unidade": "un"},
        headers=auth(token_owner),
    )
    state = await client.get(f"/catalog/products/{product_id}/stock", headers=auth(token_owner))
    assert state.json()["abaixo_do_minimo"] is True


async def test_indicador_nao_aparece_quando_quantidade_acima_do_minimo(client, token_owner):
    r = await client.post(
        "/catalog/products", json={"name": "Produto", "price": 9.9, "estoque_minimo": 3},
        headers=auth(token_owner),
    )
    product_id = r.json()["id"]
    await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 10, "unidade": "un"},
        headers=auth(token_owner),
    )
    state = await client.get(f"/catalog/products/{product_id}/stock", headers=auth(token_owner))
    assert state.json()["abaixo_do_minimo"] is False


async def test_indicador_some_apos_entrada_trazer_quantidade_de_volta(client, token_owner):
    r = await client.post(
        "/catalog/products", json={"name": "Produto", "price": 9.9, "estoque_minimo": 3},
        headers=auth(token_owner),
    )
    product_id = r.json()["id"]
    await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 2, "unidade": "un"},
        headers=auth(token_owner),
    )
    state = await client.get(f"/catalog/products/{product_id}/stock", headers=auth(token_owner))
    assert state.json()["abaixo_do_minimo"] is True

    await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 5, "unidade": "un"},
        headers=auth(token_owner),
    )
    state = await client.get(f"/catalog/products/{product_id}/stock", headers=auth(token_owner))
    assert state.json()["quantidade_atual"] == 7
    assert state.json()["abaixo_do_minimo"] is False
