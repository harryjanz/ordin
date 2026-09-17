"""Correção: collect_order (POST /orders/{ref}/collect) e mark_order_ready
(POST /orders/{ref}/ready) sempre filtravam por Order.company_id ==
current_user.company_id, sem o bypass que list_orders já tem pra
superadmin/admin agirem sobre qualquer empresa (ex. board do admin com
seletor de empresa trocada pra uma diferente da própria) — resultava em 404
"Pedido não encontrado" mesmo com o pedido existindo, reportado ao vivo
(order_ref P571341). Owner/manager/cashier de outra empresa continuam
bloqueados — isolamento multi-tenant preservado, mesmo padrão de
test_isolation.py.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime

import pytest
from conftest import make_jwt
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


async def _seed_order(order_ref: str, status: str, company_id: int = 2) -> None:
    """Pedido com um item + ticket, pertencente à empresa 2 — sempre
    "outra empresa" em relação aos tokens de company_id=1 usados nos testes."""
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        order = svc.Order(
            company_id=company_id, order_ref=order_ref, terminal_id=1,
            total=26.00, discount=0, status=status, cpf=None,
            created_at=datetime.utcnow(),
        )
        db.add(order)
        await db.flush()
        item = svc.OrderItem(
            order_id=order.id, product_id=1, product_name="X-Burger",
            unit_price=26.00, quantity=1, subtotal=26.00,
        )
        db.add(item)
        await db.flush()
        db.add(svc.Ticket(
            order_item_id=item.id, ticket_code=f"{order_ref}-T1",
            qr_data=f"{order_ref}-T1|X-Burger|{order_ref}|ts|hmac",
            order_ref=order_ref, unit_number=1, total_units=1,
            status="printed", printed_at=datetime.utcnow(),
        ))
        await db.commit()


# ── superadmin/admin agindo em empresa diferente da própria ─────────────────

async def test_superadmin_coleta_pedido_de_outra_empresa(client):
    await _seed_order("P571341", status="paid")
    token = make_jwt(role="superadmin", company_id=1)  # própria empresa != 2
    r = await client.post("/orders/P571341/collect", json={}, headers=auth(token))
    assert r.status_code == 200
    assert r.json()["order_ref"] == "P571341"


async def test_admin_marca_pronto_pedido_de_outra_empresa(client):
    await _seed_order("P571342", status="paid")
    token = make_jwt(role="admin", company_id=1)
    r = await client.post("/orders/P571342/ready", headers=auth(token))
    assert r.status_code == 200
    assert r.json()["status"] == "ready"


# ── isolamento preservado pra roles não-plataforma ───────────────────────────

async def test_owner_nao_coleta_pedido_de_outra_empresa(client):
    await _seed_order("P571343", status="paid")
    token = make_jwt(role="owner", company_id=1)  # empresa 1, pedido é da 2
    r = await client.post("/orders/P571343/collect", json={}, headers=auth(token))
    assert r.status_code == 404


async def test_manager_nao_marca_pronto_pedido_de_outra_empresa(client):
    await _seed_order("P571344", status="paid")
    token = make_jwt(role="manager", company_id=1)
    r = await client.post("/orders/P571344/ready", headers=auth(token))
    assert r.status_code == 404


# ── mesma empresa continua funcionando normalmente ───────────────────────────

async def test_owner_coleta_pedido_da_propria_empresa(client):
    await _seed_order("P571345", status="paid", company_id=1)
    token = make_jwt(role="owner", company_id=1)
    r = await client.post("/orders/P571345/collect", json={}, headers=auth(token))
    assert r.status_code == 200
