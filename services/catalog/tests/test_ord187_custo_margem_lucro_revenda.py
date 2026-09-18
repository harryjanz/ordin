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


# ── Cadastro e edição com custo ──────────────────────────────────────────────

async def test_cadastro_com_custo_valido(client, token_owner):
    r = await client.post(
        "/catalog/products",
        json={"name": "Refrigerante Lata", "price": 6.5, "cfop": "5102", "custo": 3.49},
        headers=auth(token_owner),
    )
    assert r.status_code == 201
    assert r.json()["custo"] == 3.49


async def test_cadastro_sem_custo_continua_funcionando(client, token_owner):
    r = await client.post(
        "/catalog/products",
        json={"name": "Produto sem custo", "price": 9.9},
        headers=auth(token_owner),
    )
    assert r.status_code == 201
    assert r.json()["custo"] is None


async def test_custo_negativo_e_rejeitado_no_cadastro(client, token_owner):
    r = await client.post(
        "/catalog/products",
        json={"name": "Produto custo negativo", "price": 9.9, "custo": -1.0},
        headers=auth(token_owner),
    )
    assert r.status_code == 422


async def test_custo_negativo_e_rejeitado_na_edicao(client, token_owner):
    created = await client.post(
        "/catalog/products",
        json={"name": "Produto", "price": 9.9, "custo": 5.0},
        headers=auth(token_owner),
    )
    product_id = created.json()["id"]
    r = await client.put(
        f"/catalog/products/{product_id}",
        json={"custo": -2.0},
        headers=auth(token_owner),
    )
    assert r.status_code == 422


# ── Custo maior que o preço é permitido (margem negativa é decisão de negócio, não erro) ───

async def test_custo_maior_que_preco_e_permitido(client, token_owner):
    r = await client.post(
        "/catalog/products",
        json={"name": "Vendido no prejuízo", "price": 5.0, "cfop": "5102", "custo": 7.0},
        headers=auth(token_owner),
    )
    assert r.status_code == 201
    assert r.json()["custo"] == 7.0


# ── Custo sobrevive a troca de CFOP ──────────────────────────────────────────

async def test_custo_preservado_ao_trocar_cfop(client, token_owner):
    created = await client.post(
        "/catalog/products",
        json={"name": "Produto revenda", "price": 6.5, "cfop": "5102", "custo": 3.49},
        headers=auth(token_owner),
    )
    product_id = created.json()["id"]
    assert created.json()["custo"] == 3.49

    r1 = await client.put(
        f"/catalog/products/{product_id}",
        json={"cfop": "5101"},
        headers=auth(token_owner),
    )
    assert r1.status_code == 200
    assert r1.json()["cfop"] == "5101"
    assert r1.json()["custo"] == 3.49  # continua salvo, mesmo com CFOP diferente

    r2 = await client.put(
        f"/catalog/products/{product_id}",
        json={"cfop": "5102"},
        headers=auth(token_owner),
    )
    assert r2.status_code == 200
    assert r2.json()["custo"] == 3.49


# ── Custo zero é um valor válido (produto obtido de graça, por exemplo) ─────

async def test_custo_zero_e_aceito(client, token_owner):
    r = await client.post(
        "/catalog/products",
        json={"name": "Produto custo zero", "price": 9.9, "custo": 0},
        headers=auth(token_owner),
    )
    assert r.status_code == 201
    assert r.json()["custo"] == 0
