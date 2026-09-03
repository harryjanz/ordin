import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def _token_owner_empresa_b():
    # token_company_b (conftest.py) é role="admin" — bypassa o filtro de
    # tenant por design (ORD-093, staff de plataforma vê pedido de qualquer
    # empresa). Isolamento de verdade precisa de um papel não-admin.
    from jose import jwt
    secret = os.environ.get("JWT_SECRET", "test-secret-ci")
    payload = {"sub": "1", "company": 2, "role": "owner", "exp": datetime.utcnow() + timedelta(hours=1)}
    return jwt.encode(payload, secret, algorithm="HS256")


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


async def _create_order(client, token, items, **extra):
    return await client.post("/orders", json={"items": items, **extra}, headers=auth(token))


async def test_opcao_unica_persiste_e_aparece_no_ticket(client, token_kiosk, token_owner):
    r = await _create_order(client, token_kiosk, [{
        "product_id": 501, "name": "Refrigerante lata 350ml", "qty": 1, "unit_price": 6.00,
        "selected_options": [{"group_name": "Sabor", "option_label": "Guaraná Antarctica", "price_delta": 0}],
    }])
    assert r.status_code in (200, 201)
    order_ref = r.json()["order_ref"]

    r2 = await client.get(f"/orders/{order_ref}/tickets", headers=auth(token_owner))
    assert r2.status_code == 200
    ticket = r2.json()["tickets"][0]
    assert ticket["selected_options"] == [
        {"group_name": "Sabor", "option_label": "Guaraná Antarctica", "price_delta": 0.0}
    ]


async def test_opcoes_multiplas_persiste_todas(client, token_kiosk, token_owner):
    r = await _create_order(client, token_kiosk, [{
        "product_id": 502, "name": "Pizza G", "qty": 1, "unit_price": 55.00,
        "selected_options": [
            {"group_name": "Sabores", "option_label": "Marguerita", "price_delta": 0},
            {"group_name": "Sabores", "option_label": "Calabresa", "price_delta": 5.00},
        ],
    }])
    order_ref = r.json()["order_ref"]

    r2 = await client.get(f"/orders/{order_ref}/tickets", headers=auth(token_owner))
    labels = {o["option_label"] for o in r2.json()["tickets"][0]["selected_options"]}
    assert labels == {"Marguerita", "Calabresa"}


async def test_multiplos_itens_opcoes_independentes(client, token_kiosk, token_owner):
    r = await _create_order(client, token_kiosk, [
        {"product_id": 501, "name": "Refrigerante — Coca-Cola", "qty": 1, "unit_price": 6.00,
         "selected_options": [{"group_name": "Sabor", "option_label": "Coca-Cola", "price_delta": 0}]},
        {"product_id": 501, "name": "Refrigerante — Guaraná", "qty": 1, "unit_price": 6.00,
         "selected_options": [{"group_name": "Sabor", "option_label": "Guaraná Antarctica", "price_delta": 0}]},
    ])
    order_ref = r.json()["order_ref"]

    r2 = await client.get(f"/orders/{order_ref}/tickets", headers=auth(token_owner))
    tickets = r2.json()["tickets"]
    assert len(tickets) == 2
    opts = sorted(t["selected_options"][0]["option_label"] for t in tickets)
    assert opts == ["Coca-Cola", "Guaraná Antarctica"]


async def test_item_sem_opcao_nao_regride(client, token_kiosk, token_owner):
    r = await _create_order(client, token_kiosk, [
        {"product_id": 900, "name": "Água mineral", "qty": 1, "unit_price": 4.00},
    ])
    assert r.status_code in (200, 201)
    order_ref = r.json()["order_ref"]

    r2 = await client.get(f"/orders/{order_ref}/tickets", headers=auth(token_owner))
    assert r2.json()["tickets"][0]["selected_options"] == []


async def test_total_mantem_formula_com_opcao(client, token_kiosk, token_owner):
    r = await _create_order(client, token_kiosk, [
        {"product_id": 502, "name": "Batata G", "qty": 2, "unit_price": 12.00,
         "selected_options": [{"group_name": "Tamanho", "option_label": "G", "price_delta": 6.00}]},
    ], discount=1.00)
    order_ref = r.json()["order_ref"]

    r2 = await client.get("/orders", headers=auth(token_owner))
    order = next(o for o in r2.json()["orders"] if o["order_ref"] == order_ref)
    assert order["total"] == pytest.approx(2 * 12.00 - 1.00)


async def test_isolamento_multitenant_tickets_com_opcao(client, token_kiosk):
    r = await _create_order(client, token_kiosk, [{
        "product_id": 501, "name": "Refrigerante lata 350ml", "qty": 1, "unit_price": 6.00,
        "selected_options": [{"group_name": "Sabor", "option_label": "Coca-Cola", "price_delta": 0}],
    }])
    order_ref = r.json()["order_ref"]

    r2 = await client.get(f"/orders/{order_ref}/tickets", headers=auth(_token_owner_empresa_b()))
    assert r2.status_code == 404
