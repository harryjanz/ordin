"""ORD-171: endpoint interno GET /internal/orders/{order_ref} — payment-service
busca os itens do pedido pra montar o payload de emissão da NFC-e. Protegido
por X-Internal-Secret, sem autenticação de usuário (mesmo padrão de
/internal/orders/{ref}/status já existente).
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


def internal_headers():
    return {"X-Internal-Secret": "test-internal-ci"}


async def _make_order_with_items(company_id=1):
    import main as svc
    order_ref = f"O171{os.urandom(3).hex()}"
    async with svc.AsyncSessionLocal() as db:
        o = svc.Order(company_id=company_id, terminal_id=1, order_ref=order_ref, status="paid", total=41.80)
        db.add(o)
        await db.commit()
        await db.refresh(o)
        db.add_all([
            svc.OrderItem(order_id=o.id, product_id=10, product_name="X-Burger", unit_price=18.90, quantity=2, subtotal=37.80),
            svc.OrderItem(order_id=o.id, product_id=20, product_name="Refrigerante", unit_price=4.00, quantity=1, subtotal=4.00),
        ])
        await db.commit()
    return order_ref


async def test_retorna_itens_do_pedido(client):
    order_ref = await _make_order_with_items()
    r = await client.get(f"/internal/orders/{order_ref}", headers=internal_headers())
    assert r.status_code == 200
    data = r.json()
    assert data["order_ref"] == order_ref
    assert data["company_id"] == 1
    assert data["total"] == 41.80
    items = {i["product_id"]: i for i in data["items"]}
    assert items[10] == {"product_id": 10, "product_name": "X-Burger", "unit_price": 18.9, "quantity": 2}
    assert items[20]["quantity"] == 1


async def test_pedido_inexistente_retorna_404(client):
    r = await client.get("/internal/orders/NAOEXISTE", headers=internal_headers())
    assert r.status_code == 404


async def test_sem_secret_correto_retorna_403(client):
    order_ref = await _make_order_with_items()
    r = await client.get(f"/internal/orders/{order_ref}", headers={"X-Internal-Secret": "errado"})
    assert r.status_code == 403
