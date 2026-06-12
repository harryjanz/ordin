import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
import respx
import httpx
from httpx import AsyncClient, ASGITransport


@pytest.fixture(scope="module")
async def client():
    from main import app, Base, engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["service"] == "auth"


async def test_login_user_not_found(client):
    with respx.mock:
        respx.post("http://localhost:8002/internal/verify-credentials").mock(
            return_value=httpx.Response(401)
        )
        r = await client.post("/auth/login", json={"email": "nao@existe.com", "password": "errado"})
    assert r.status_code == 401


async def test_login_wrong_password(client):
    with respx.mock:
        respx.post("http://localhost:8002/internal/verify-credentials").mock(
            return_value=httpx.Response(401)
        )
        r = await client.post("/auth/login", json={"email": "user@test.com", "password": "wrong"})
    assert r.status_code == 401


async def test_refresh_invalid_token(client):
    r = await client.post("/auth/refresh", json={"refresh_token": "token.invalido.aqui"})
    assert r.status_code == 401


async def test_kiosk_pin_validate_invalid(client):
    with respx.mock:
        respx.post("http://localhost:8002/internal/validate-pin").mock(
            return_value=httpx.Response(401, json={"detail": "PIN inválido"})
        )
        r = await client.post("/auth/validate-pin", json={"pin": "000000"})
    assert r.status_code == 401


async def test_pin_login_invalid(client):
    with respx.mock:
        respx.post("http://localhost:8002/internal/verify-pin").mock(
            return_value=httpx.Response(401, json={"detail": "PIN inválido"})
        )
        r = await client.post("/auth/pin-login", json={"pin": "000000", "terminal_id": 1})
    assert r.status_code == 401
