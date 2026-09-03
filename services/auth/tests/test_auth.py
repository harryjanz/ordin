import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx
import pytest
import respx
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


def _company_svc_url() -> str:
    import main as svc
    return svc.COMPANY_SVC


async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["service"] == "auth"


async def test_login_user_not_found(client):
    base = _company_svc_url()
    with respx.mock:
        respx.post(f"{base}/internal/verify-credentials").mock(
            return_value=httpx.Response(401)
        )
        r = await client.post("/auth/login", json={"email": "nao@existe.com", "password": "errado"})
    assert r.status_code == 401


async def test_login_wrong_password(client):
    base = _company_svc_url()
    with respx.mock:
        respx.post(f"{base}/internal/verify-credentials").mock(
            return_value=httpx.Response(401)
        )
        r = await client.post("/auth/login", json={"email": "user@test.com", "password": "wrong"})
    assert r.status_code == 401


async def test_refresh_invalid_token(client):
    r = await client.post("/auth/refresh", json={"refresh_token": "token.invalido.aqui"})
    assert r.status_code == 401


async def test_kiosk_pin_validate_invalid(client):
    base = _company_svc_url()
    with respx.mock:
        respx.post(f"{base}/internal/validate-pin").mock(
            return_value=httpx.Response(401, json={"detail": "PIN inválido"})
        )
        r = await client.post("/auth/validate-pin", json={"pin": "000000"})
    assert r.status_code == 401


async def test_pin_login_invalid(client):
    base = _company_svc_url()
    with respx.mock:
        respx.post(f"{base}/internal/verify-pin").mock(
            return_value=httpx.Response(401, json={"detail": "PIN inválido"})
        )
        r = await client.post("/auth/pin-login", json={"pin": "000000", "terminal_id": 1})
    assert r.status_code == 401
