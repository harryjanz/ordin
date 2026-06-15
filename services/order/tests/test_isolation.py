import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from httpx import AsyncClient, ASGITransport
from datetime import datetime
from sqlalchemy import delete as sa_delete
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


@pytest.fixture
async def ids(client):
    """Cria Order → OrderItem → Ticket para company_id=2 (empresa B)."""
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        order_b = svc.Order(
            company_id=2, order_ref="ISOB001", terminal_id=2,
            total=40.00, discount=0, status="paid", cpf=None,
            created_at=datetime.utcnow(),
        )
        db.add(order_b)
        await db.flush()

        item_b = svc.OrderItem(
            order_id=order_b.id, product_id=99,
            product_name="iso product b", unit_price=40.0,
            quantity=1, subtotal=40.0,
        )
        db.add(item_b)
        await db.flush()

        ticket_b = svc.Ticket(
            order_item_id=item_b.id, ticket_code="TKTSOB001",
            qr_data="TKTSOB001|iso product b|ISOB001|ts|hmac",
            order_ref="ISOB001", unit_number=1, total_units=1,
            status="printed", printed_at=datetime.utcnow(),
        )
        db.add(ticket_b)
        await db.commit()

        yield {
            "order_ref_b": "ISOB001",
            "ticket_code_b": "TKTSOB001",
            "order_b_id": order_b.id,
            "item_b_id": item_b.id,
        }

        await db.execute(sa_delete(svc.Ticket).where(svc.Ticket.order_ref == "ISOB001"))
        await db.execute(sa_delete(svc.OrderItem).where(svc.OrderItem.order_id == order_b.id))
        await db.execute(sa_delete(svc.Order).where(svc.Order.id == order_b.id))
        await db.commit()


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# CA-001: listagem não vaza pedidos de outra empresa
async def test_list_orders_nao_retorna_pedido_de_empresa_b(client, ids, token_owner):
    r = await client.get("/orders", headers=auth(token_owner))
    assert r.status_code == 200
    refs = [o["order_ref"] for o in r.json()["orders"]]
    assert ids["order_ref_b"] not in refs


# CA-002: GET tickets de pedido alheio retorna 404
async def test_get_tickets_de_pedido_alheio_retorna_404(client, ids, token_owner):
    r = await client.get(f"/orders/{ids['order_ref_b']}/tickets", headers=auth(token_owner))
    assert r.status_code == 404


# CA-003: coletar ticket de outra empresa retorna 404
async def test_collect_ticket_alheio_retorna_404(client, ids, token_owner):
    r = await client.post(
        f"/tickets/{ids['ticket_code_b']}/collect",
        json={"collected_by": "balcao", "qr_data": None},
        headers=auth(token_owner),
    )
    assert r.status_code == 404


# CA-005: sem token retorna 401
async def test_sem_token_retorna_401(client):
    r = await client.get("/orders")
    assert r.status_code == 401


# Empresa B enxerga apenas seus próprios pedidos
async def test_empresa_b_enxerga_apenas_seus_pedidos(client, ids, token_company_b):
    r = await client.get("/orders", headers=auth(token_company_b))
    assert r.status_code == 200
    refs = [o["order_ref"] for o in r.json()["orders"]]
    assert ids["order_ref_b"] in refs
