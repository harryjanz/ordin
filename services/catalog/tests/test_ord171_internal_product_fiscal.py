"""ORD-171: endpoint interno GET /internal/products/{id}/fiscal — payment-service
busca NCM/CFOP/CEST na emissão de NFC-e. Protegido por X-Internal-Secret, sem
autenticação de usuário (mesmo padrão de /internal/* em order-service/company-service).
"""
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


async def test_retorna_ncm_cfop_cest_do_produto(client):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        p = svc.Product(company_id=1, name="X-Burger", price=18.9, ncm="19059090", cfop="5101", cest="1706200")
        db.add(p)
        await db.commit()
        await db.refresh(p)
        product_id = p.id

    r = await client.get(
        f"/internal/products/{product_id}/fiscal",
        headers={"X-Internal-Secret": "test-internal-ci"},
    )
    assert r.status_code == 200
    assert r.json() == {"ncm": "19059090", "cfop": "5101", "cest": "1706200"}


async def test_produto_sem_classificacao_fiscal_retorna_nulos(client):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        p = svc.Product(company_id=1, name="Suco", price=8.9)
        db.add(p)
        await db.commit()
        await db.refresh(p)
        product_id = p.id

    r = await client.get(
        f"/internal/products/{product_id}/fiscal",
        headers={"X-Internal-Secret": "test-internal-ci"},
    )
    assert r.status_code == 200
    assert r.json() == {"ncm": None, "cfop": None, "cest": None}


async def test_produto_inexistente_retorna_404(client):
    r = await client.get(
        "/internal/products/999999/fiscal",
        headers={"X-Internal-Secret": "test-internal-ci"},
    )
    assert r.status_code == 404


async def test_sem_secret_correto_retorna_403(client):
    r = await client.get(
        "/internal/products/1/fiscal",
        headers={"X-Internal-Secret": "secret-errado"},
    )
    assert r.status_code == 403


async def test_sem_header_retorna_403(client):
    r = await client.get("/internal/products/1/fiscal")
    assert r.status_code == 403
