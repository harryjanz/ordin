import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
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
    assert r.json()["service"] == "order"


async def test_list_orders_sem_token(client):
    r = await client.get("/orders/REF-0001/status")
    assert r.status_code == 401


async def test_create_order(client, token_kiosk):
    r = await client.post(
        "/orders",
        json={
            "items": [
                {"product_id": 1, "name": "X-Burger", "qty": 1, "unit_price": 25.90}
            ]
        },
        headers={"Authorization": f"Bearer {token_kiosk}"},
    )
    assert r.status_code in (200, 201)


async def test_collect_ticket_inexistente(client, token_owner):
    r = await client.post(
        "/tickets/CODE-INEXISTENTE/collect",
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert r.status_code in (404, 422)


async def test_order_status_inexistente(client, token_owner):
    r = await client.get(
        "/orders/REF-NAOEXISTE/status",
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert r.status_code in (404, 200)
