import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete as sa_delete
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
    """Categoria da empresa 1 + dois códigos NCM fake (__ord169_*__) pra não
    depender do seed de produção (ver mesmo cuidado do test_ord075, incidente
    de 2026-08-11 com códigos reais colidindo)."""
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        cat = svc.Category(company_id=1, name="__ord169_cat__", active=True)
        ncm_boi = svc.NcmCode(codigo="02013000", descricao="Carnes de bovino, desossadas, congeladas")
        ncm_batata = svc.NcmCode(codigo="20041000", descricao="Batatas preparadas ou conservadas, congeladas")
        db.add_all([cat, ncm_boi, ncm_batata])
        await db.commit()
        ids = {"cat_id": cat.id, "ncm_boi": ncm_boi.codigo, "ncm_batata": ncm_batata.codigo}
        yield ids
        await db.execute(sa_delete(svc.Product).where(svc.Product.category_id == cat.id))
        await db.execute(sa_delete(svc.Category).where(svc.Category.id == cat.id))
        await db.execute(sa_delete(svc.NcmCode).where(svc.NcmCode.codigo.in_([ncm_boi.codigo, ncm_batata.codigo])))
        await db.commit()


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── Cadastro com NCM/CFOP/CEST válidos ──────────────────────────────────────

async def test_cadastro_com_classificacao_fiscal_valida(client, seed, token_owner):
    r = await client.post(
        "/catalog/products",
        json={
            "name": "X-Burguer",
            "price": 18.9,
            "category_id": seed["cat_id"],
            "ncm": seed["ncm_boi"],
            "cfop": "5101",
            "cest": "1234567",
        },
        headers=auth(token_owner),
    )
    assert r.status_code == 201
    data = r.json()
    assert data["ncm"] == seed["ncm_boi"]
    assert data["ncm_descricao"] == "Carnes de bovino, desossadas, congeladas"
    assert data["cfop"] == "5101"
    assert data["cest"] == "1234567"


async def test_cadastro_sem_classificacao_fiscal_continua_opcional(client, seed, token_owner):
    r = await client.post(
        "/catalog/products",
        json={"name": "Suco", "price": 8.9, "category_id": seed["cat_id"]},
        headers=auth(token_owner),
    )
    assert r.status_code == 201
    data = r.json()
    assert data["ncm"] is None
    assert data["ncm_descricao"] is None
    assert data["cfop"] is None
    assert data["cest"] is None


# ── Validação de NCM ─────────────────────────────────────────────────────────

async def test_cadastro_com_ncm_inexistente_e_rejeitado(client, seed, token_owner):
    r = await client.post(
        "/catalog/products",
        json={"name": "X-Salada", "price": 17.9, "category_id": seed["cat_id"], "ncm": "99999999"},
        headers=auth(token_owner),
    )
    assert r.status_code == 400


async def test_edicao_com_ncm_inexistente_e_rejeitada(client, seed, token_owner):
    created = await client.post(
        "/catalog/products",
        json={"name": "Fritas", "price": 12.9, "category_id": seed["cat_id"]},
        headers=auth(token_owner),
    )
    product_id = created.json()["id"]
    r = await client.put(
        f"/catalog/products/{product_id}",
        json={"ncm": "99999999"},
        headers=auth(token_owner),
    )
    assert r.status_code == 400


async def test_edicao_salva_ncm_valido(client, seed, token_owner):
    created = await client.post(
        "/catalog/products",
        json={"name": "Batata Frita", "price": 12.9, "category_id": seed["cat_id"]},
        headers=auth(token_owner),
    )
    product_id = created.json()["id"]
    r = await client.put(
        f"/catalog/products/{product_id}",
        json={"ncm": seed["ncm_batata"]},
        headers=auth(token_owner),
    )
    assert r.status_code == 200
    assert r.json()["ncm"] == seed["ncm_batata"]


# ── Validação de CFOP ────────────────────────────────────────────────────────

async def test_cadastro_com_cfop_invalido_e_rejeitado(client, seed, token_owner):
    r = await client.post(
        "/catalog/products",
        json={"name": "X-Tudo", "price": 24.9, "category_id": seed["cat_id"], "cfop": "9999"},
        headers=auth(token_owner),
    )
    assert r.status_code == 422


async def test_cadastro_com_cfop_5102_e_aceito(client, seed, token_owner):
    r = await client.post(
        "/catalog/products",
        json={"name": "Refrigerante", "price": 6.9, "category_id": seed["cat_id"], "cfop": "5102"},
        headers=auth(token_owner),
    )
    assert r.status_code == 201
    assert r.json()["cfop"] == "5102"


# ── CEST sempre livre ────────────────────────────────────────────────────────

async def test_cest_aceita_qualquer_texto_sem_validacao(client, seed, token_owner):
    r = await client.post(
        "/catalog/products",
        json={"name": "Sorvete", "price": 9.9, "category_id": seed["cat_id"], "cest": "abc"},
        headers=auth(token_owner),
    )
    assert r.status_code == 201
    assert r.json()["cest"] == "abc"


# ── GET /catalog/ncm/search ──────────────────────────────────────────────────

async def test_busca_ncm_por_codigo(client, seed, token_owner):
    r = await client.get("/catalog/ncm/search?q=0201", headers=auth(token_owner))
    assert r.status_code == 200
    codigos = {item["codigo"] for item in r.json()["results"]}
    assert seed["ncm_boi"] in codigos
    assert seed["ncm_batata"] not in codigos


async def test_busca_ncm_por_descricao(client, seed, token_owner):
    r = await client.get("/catalog/ncm/search?q=batatas", headers=auth(token_owner))
    assert r.status_code == 200
    codigos = {item["codigo"] for item in r.json()["results"]}
    assert seed["ncm_batata"] in codigos


async def test_busca_ncm_sem_resultado_retorna_lista_vazia(client, seed, token_owner):
    r = await client.get("/catalog/ncm/search?q=zzzznada", headers=auth(token_owner))
    assert r.status_code == 200
    assert r.json()["results"] == []
