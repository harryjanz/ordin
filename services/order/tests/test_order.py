import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker


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


async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["service"] == "order"


async def test_list_orders_sem_token(client):
    r = await client.get("/orders")
    assert r.status_code == 401


async def test_create_order(client, token_kiosk):
    r = await client.post(
        "/orders",
        json={"items": [{"product_id": 1, "name": "X-Burger", "qty": 1, "unit_price": 25.90}]},
        headers={"Authorization": f"Bearer {token_kiosk}"},
    )
    assert r.status_code in (200, 201)


async def test_collect_ticket_inexistente(client, token_owner):
    r = await client.post(
        "/tickets/CODE-INEXISTENTE/collect",
        json={"collected_by": "test"},
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert r.status_code in (404, 422)


async def test_order_status_inexistente(client, token_owner):
    r = await client.patch(
        "/orders/REF-NAOEXISTE/status",
        json={"status": "cancelled"},
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert r.status_code == 404


async def test_list_order_tickets_inexistente(client, token_owner):
    r = await client.get(
        "/orders/REF-NAOEXISTE/tickets",
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert r.status_code == 404
