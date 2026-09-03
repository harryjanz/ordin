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


async def test_criar_pedido_sem_consumption_type_fica_null(client, token_kiosk):
    r = await client.post(
        "/orders",
        json={"items": [{"product_id": 1, "name": "X-Burger", "qty": 1, "unit_price": 25.90}]},
        headers=auth(token_kiosk),
    )
    assert r.status_code == 201
    ref = r.json()["order_ref"]

    listed = await client.get("/orders", headers=auth(token_kiosk))
    order = next(o for o in listed.json()["orders"] if o["order_ref"] == ref)
    assert order["consumption_type"] is None


async def test_criar_pedido_para_levar(client, token_kiosk):
    r = await client.post(
        "/orders",
        json={
            "items": [{"product_id": 1, "name": "X-Burger", "qty": 1, "unit_price": 25.90}],
            "consumption_type": "viagem",
        },
        headers=auth(token_kiosk),
    )
    assert r.status_code == 201
    ref = r.json()["order_ref"]

    listed = await client.get("/orders", headers=auth(token_kiosk))
    order = next(o for o in listed.json()["orders"] if o["order_ref"] == ref)
    assert order["consumption_type"] == "viagem"


async def test_criar_pedido_no_local(client, token_kiosk):
    r = await client.post(
        "/orders",
        json={
            "items": [{"product_id": 1, "name": "X-Burger", "qty": 1, "unit_price": 25.90}],
            "consumption_type": "local",
        },
        headers=auth(token_kiosk),
    )
    assert r.status_code == 201
    ref = r.json()["order_ref"]

    listed = await client.get("/orders", headers=auth(token_kiosk))
    order = next(o for o in listed.json()["orders"] if o["order_ref"] == ref)
    assert order["consumption_type"] == "local"
