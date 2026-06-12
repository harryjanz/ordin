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
    assert r.json()["service"] == "payment"


async def test_create_payment_sem_token(client):
    r = await client.post("/payments", json={})
    assert r.status_code == 401


async def test_create_payment_mock(client, token_kiosk):
    with respx.mock:
        respx.patch("http://localhost:8004/internal/orders/ORD-TEST01/status").mock(
            return_value=httpx.Response(200)
        )
        r = await client.post(
            "/payments",
            json={
                "order_ref": "ORD-TEST01",
                "tef_number": "81",
                "method": "credit",
                "amount": 26.00,
                "items": [{"product_id": 1, "name": "X-Burger", "qty": 1, "unit_price": 26.00}],
            },
            headers={"Authorization": f"Bearer {token_kiosk}"},
        )
    assert r.status_code == 201
    assert "transaction_id" in r.json()
    assert r.json()["status"] in ("approved", "refused")


async def test_list_payments(client, token_owner):
    r = await client.get("/payments", headers={"Authorization": f"Bearer {token_owner}"})
    assert r.status_code == 200
    assert "items" in r.json()


async def test_cancel_inexistente(client, token_owner):
    r = await client.post(
        "/payments/9999/cancel",
        json={"reason": "teste"},
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert r.status_code == 404
