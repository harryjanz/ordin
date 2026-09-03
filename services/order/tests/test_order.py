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


async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["service"] == "order"


async def test_list_orders_sem_token(client):
    r = await client.get("/orders")
    assert r.status_code == 401


# ── ORD-135: date_to deve incluir o dia inteiro ───────────────────────────────

async def _make_order(client, created_at, company_id=1):
    import main as svc
    order_ref = f"O135{os.urandom(3).hex()}"
    o = svc.Order(
        company_id=company_id, terminal_id=1, order_ref=order_ref,
        status="paid", total=10.00, created_at=created_at,
    )
    async with svc.AsyncSessionLocal() as db:
        db.add(o)
        await db.commit()
        await db.refresh(o)
    return o.order_ref


async def _del_order(client, order_ref):
    import main as svc
    from sqlalchemy import delete as sa_delete
    async with svc.AsyncSessionLocal() as db:
        await db.execute(sa_delete(svc.Order).where(svc.Order.order_ref == order_ref))
        await db.commit()


async def test_list_orders_date_to_inclui_fim_do_dia(client, token_owner):
    from datetime import datetime
    o_id = await _make_order(client, datetime(2026, 8, 28, 23, 59, 0))
    try:
        r = await client.get(
            "/orders", params={"date_from": "2026-08-28", "date_to": "2026-08-28", "limit": 200},
            headers={"Authorization": f"Bearer {token_owner}"},
        )
        assert r.status_code == 200
        assert any(o["order_ref"] == o_id for o in r.json()["orders"])
    finally:
        await _del_order(client, o_id)


async def test_list_orders_date_to_nao_vaza_pro_dia_seguinte(client, token_owner):
    from datetime import datetime
    o_id = await _make_order(client, datetime(2026, 8, 29, 0, 0, 1))
    try:
        r = await client.get(
            "/orders", params={"date_from": "2026-08-28", "date_to": "2026-08-28", "limit": 200},
            headers={"Authorization": f"Bearer {token_owner}"},
        )
        assert not any(o["order_ref"] == o_id for o in r.json()["orders"])
    finally:
        await _del_order(client, o_id)


async def test_list_orders_date_from_igual_date_to_retorna_dia_inteiro(client, token_owner):
    from datetime import datetime
    o1 = await _make_order(client, datetime(2026, 8, 28, 0, 0, 0))
    o2 = await _make_order(client, datetime(2026, 8, 28, 23, 59, 59))
    try:
        r = await client.get(
            "/orders", params={"date_from": "2026-08-28", "date_to": "2026-08-28", "limit": 200},
            headers={"Authorization": f"Bearer {token_owner}"},
        )
        ids = {o["order_ref"] for o in r.json()["orders"]}
        assert o1 in ids and o2 in ids
    finally:
        await _del_order(client, o1)
        await _del_order(client, o2)


async def test_list_orders_hour_to_nao_afetado_pela_correcao(client, token_owner):
    """Regressão: hour_to compara func.time(created_at) — comparação de
    hora do dia, não de data — e não deve mudar com a correção de date_to."""
    from datetime import datetime
    o_10h = await _make_order(client, datetime(2026, 8, 28, 10, 0, 0))
    o_15h = await _make_order(client, datetime(2026, 8, 28, 15, 0, 0))
    try:
        r = await client.get(
            "/orders",
            params={"date_from": "2026-08-28", "hour_to": "12:00", "limit": 200},
            headers={"Authorization": f"Bearer {token_owner}"},
        )
        ids = {o["order_ref"] for o in r.json()["orders"]}
        assert o_10h in ids
        assert o_15h not in ids
    finally:
        await _del_order(client, o_10h)
        await _del_order(client, o_15h)


async def test_list_orders_date_to_formato_invalido_retorna_400(client, token_owner):
    r = await client.get(
        "/orders", params={"date_to": "28/08/2026"},
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert r.status_code == 400


async def test_list_orders_isolamento_multitenant_com_filtro_data(client, token_owner):
    from datetime import datetime
    o_id = await _make_order(client, datetime(2026, 8, 28, 23, 59, 0), company_id=2)
    try:
        r = await client.get(
            "/orders", params={"date_from": "2026-08-28", "date_to": "2026-08-28", "limit": 200},
            headers={"Authorization": f"Bearer {token_owner}"},
        )
        assert not any(o["order_ref"] == o_id for o in r.json()["orders"])
    finally:
        await _del_order(client, o_id)


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
