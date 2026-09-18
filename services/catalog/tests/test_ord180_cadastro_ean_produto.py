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


# ── Checksum GTIN — unitário puro, sem precisar de client/DB ────────────────

def test_is_valid_gtin_unitario():
    import main as svc

    # vetores válidos, um por comprimento suportado (Scenario Outline da ORD-180)
    assert svc._is_valid_gtin("96385074") is True       # GTIN-8
    assert svc._is_valid_gtin("036000291452") is True   # GTIN-12
    assert svc._is_valid_gtin("7891000100103") is True  # GTIN-13 (o mais comum no Brasil)
    assert svc._is_valid_gtin("17891000100100") is True  # GTIN-14

    # dígito verificador incorreto (último dígito de um vetor válido alterado)
    assert svc._is_valid_gtin("7891000100104") is False

    # comprimento fora do padrão GTIN (nem 8, 12, 13 nem 14)
    assert svc._is_valid_gtin("1234567890") is False

    # não numérico
    assert svc._is_valid_gtin("789100010010A") is False


# ── Cadastro com EAN válido, em todos os comprimentos GTIN suportados ───────

@pytest.mark.parametrize(
    "ean",
    ["96385074", "036000291452", "7891000100103", "17891000100100"],
    ids=["gtin-8", "gtin-12", "gtin-13", "gtin-14"],
)
async def test_cadastro_com_ean_valido_todos_comprimentos(client, token_owner, ean):
    r = await client.post(
        "/catalog/products",
        json={"name": "Produto com EAN", "price": 9.9, "ean": ean},
        headers=auth(token_owner),
    )
    assert r.status_code == 201
    assert r.json()["ean"] == ean


async def test_cadastro_com_checksum_invalido_e_rejeitado(client, token_owner):
    r = await client.post(
        "/catalog/products",
        json={"name": "Produto EAN inválido", "price": 9.9, "ean": "7891000100104"},
        headers=auth(token_owner),
    )
    assert r.status_code == 400
    assert "inválido" in r.json()["detail"]


async def test_cadastro_com_comprimento_fora_do_padrao_e_rejeitado(client, token_owner):
    r = await client.post(
        "/catalog/products",
        json={"name": "Produto EAN 10 dígitos", "price": 9.9, "ean": "1234567890"},
        headers=auth(token_owner),
    )
    assert r.status_code == 400
    assert "inválido" in r.json()["detail"]


async def test_cadastro_sem_ean_continua_funcionando(client, token_owner):
    r = await client.post(
        "/catalog/products",
        json={"name": "Produto sem EAN", "price": 9.9},
        headers=auth(token_owner),
    )
    assert r.status_code == 201
    assert r.json()["ean"] is None


# ── String vazia tratada como ausente (mesmo padrão do cest) ────────────────

async def test_ean_string_vazia_no_cadastro_vira_null(client, token_owner):
    r = await client.post(
        "/catalog/products",
        json={"name": "Produto EAN string vazia", "price": 9.9, "ean": ""},
        headers=auth(token_owner),
    )
    assert r.status_code == 201
    assert r.json()["ean"] is None


async def test_ean_apagado_na_edicao_vira_null(client, token_owner):
    created = await client.post(
        "/catalog/products",
        json={"name": "Produto com EAN pra apagar", "price": 9.9, "ean": "96385074"},
        headers=auth(token_owner),
    )
    product_id = created.json()["id"]
    assert created.json()["ean"] == "96385074"

    r = await client.put(
        f"/catalog/products/{product_id}",
        json={"ean": ""},
        headers=auth(token_owner),
    )
    assert r.status_code == 200
    assert r.json()["ean"] is None


# ── Conflito de EAN — mesma empresa bloqueia, empresas diferentes não ───────

async def test_ean_duplicado_na_mesma_empresa_e_rejeitado(client, token_owner):
    ean = "96385074"
    r1 = await client.post(
        "/catalog/products",
        json={"name": "Produto A", "price": 9.9, "ean": ean},
        headers=auth(token_owner),
    )
    assert r1.status_code == 201

    r2 = await client.post(
        "/catalog/products",
        json={"name": "Produto B", "price": 12.9, "ean": ean},
        headers=auth(token_owner),
    )
    assert r2.status_code == 400
    assert "cadastrado" in r2.json()["detail"]
    # garante que a mensagem de erro é sobre EAN, não sobre SKU (achado da
    # revisão de backend — reaproveitar o except genérico mostraria a
    # mensagem errada sem essa distinção)
    assert "código de barras" in r2.json()["detail"]


async def test_ean_duplicado_na_edicao_e_rejeitado(client, token_owner):
    ean_a = "96385074"
    ean_b = "036000291452"
    await client.post(
        "/catalog/products", json={"name": "Produto A", "price": 9.9, "ean": ean_a}, headers=auth(token_owner)
    )
    created_b = await client.post(
        "/catalog/products", json={"name": "Produto B", "price": 12.9, "ean": ean_b}, headers=auth(token_owner)
    )
    product_b_id = created_b.json()["id"]

    r = await client.put(
        f"/catalog/products/{product_b_id}",
        json={"ean": ean_a},
        headers=auth(token_owner),
    )
    assert r.status_code == 400
    assert "código de barras" in r.json()["detail"]


async def test_mesmo_ean_em_empresas_diferentes_nao_conflita(client, token_owner, token_company_b):
    ean = "96385074"
    r1 = await client.post(
        "/catalog/products",
        json={"name": "Produto empresa X", "price": 9.9, "ean": ean},
        headers=auth(token_owner),
    )
    r2 = await client.post(
        "/catalog/products",
        json={"name": "Produto empresa Y", "price": 12.9, "ean": ean},
        headers=auth(token_company_b),
    )
    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.json()["ean"] == r2.json()["ean"] == ean
