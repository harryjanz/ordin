"""ORD-159 — combo_instance_key/combo_name agrupam de volta os componentes
de um mesmo combo explodido (App.tsx handleCpfDone) no ticket."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def _token_owner_empresa_b():
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


async def test_componentes_do_mesmo_combo_compartilham_instance_key(client, token_kiosk, token_owner):
    r = await _create_order(client, token_kiosk, [
        {"product_id": 1, "name": "Classic Cheddar Burger (Combo Classic Cheddar)", "qty": 1, "unit_price": 24.90,
         "combo_instance_key": "combo-abc123", "combo_name": "Combo Classic Cheddar"},
        {"product_id": 6, "name": "Refrigerante Lata 350ml (Combo Classic Cheddar) — Guaraná Antarctica",
         "qty": 1, "unit_price": 6.90, "combo_instance_key": "combo-abc123", "combo_name": "Combo Classic Cheddar",
         "selected_options": [{"group_name": "Refrigerantes Lata 350ml", "option_label": "Guaraná Antarctica", "price_delta": 0}]},
    ], discount=2.90)
    order_ref = r.json()["order_ref"]

    r2 = await client.get(f"/orders/{order_ref}/tickets", headers=auth(token_owner))
    tickets = r2.json()["tickets"]
    assert len(tickets) == 2
    assert all(t["combo_instance_key"] == "combo-abc123" for t in tickets)
    assert all(t["combo_name"] == "Combo Classic Cheddar" for t in tickets)


async def test_dois_combos_iguais_geram_instance_keys_distintas(client, token_kiosk, token_owner):
    """Mesmo racional do ORD-141 pra key de carrinho: 2 instâncias do mesmo
    combo nunca compartilham o mesmo agrupamento, mesmo com componentes e
    opções idênticos — cada clique em "adicionar combo" gera uma key nova
    no totem, aqui simulado diretamente na chamada da API."""
    r = await _create_order(client, token_kiosk, [
        {"product_id": 1, "name": "Classic Cheddar Burger (Combo Classic Cheddar)", "qty": 1, "unit_price": 24.90,
         "combo_instance_key": "combo-instance-1", "combo_name": "Combo Classic Cheddar"},
        {"product_id": 6, "name": "Refrigerante Lata 350ml (Combo Classic Cheddar)", "qty": 1, "unit_price": 6.90,
         "combo_instance_key": "combo-instance-1", "combo_name": "Combo Classic Cheddar"},
        {"product_id": 1, "name": "Classic Cheddar Burger (Combo Classic Cheddar)", "qty": 1, "unit_price": 24.90,
         "combo_instance_key": "combo-instance-2", "combo_name": "Combo Classic Cheddar"},
        {"product_id": 6, "name": "Refrigerante Lata 350ml (Combo Classic Cheddar)", "qty": 1, "unit_price": 6.90,
         "combo_instance_key": "combo-instance-2", "combo_name": "Combo Classic Cheddar"},
    ])
    order_ref = r.json()["order_ref"]

    r2 = await client.get(f"/orders/{order_ref}/tickets", headers=auth(token_owner))
    keys = {t["combo_instance_key"] for t in r2.json()["tickets"]}
    assert keys == {"combo-instance-1", "combo-instance-2"}


async def test_produto_avulso_sem_combo_instance_key_nao_regride(client, token_kiosk, token_owner):
    r = await _create_order(client, token_kiosk, [
        {"product_id": 900, "name": "Água mineral", "qty": 1, "unit_price": 4.00},
    ])
    order_ref = r.json()["order_ref"]

    r2 = await client.get(f"/orders/{order_ref}/tickets", headers=auth(token_owner))
    ticket = r2.json()["tickets"][0]
    assert ticket["combo_instance_key"] is None
    assert ticket["combo_name"] is None


async def test_qr_data_nao_trunca_nome_com_opcao_de_combo(client, token_kiosk, token_owner):
    """Bug real encontrado testando manualmente (2026-09-04): _make_qr_data
    cortava o nome em 50 chars — "Refrigerante Lata 350ml (Combo Classic
    Cheddar) — " sozinho já bate 50 chars, cortando a opção inteira sempre,
    silenciosamente. Corrigido pra 100."""
    long_name = "Refrigerante Lata 350ml (Combo Classic Cheddar) — Guaraná Antarctica"
    assert len(long_name) > 50  # confirma que o cenário de regressão é real
    r = await _create_order(client, token_kiosk, [
        {"product_id": 6, "name": long_name, "qty": 1, "unit_price": 6.90,
         "combo_instance_key": "combo-abc", "combo_name": "Combo Classic Cheddar",
         "selected_options": [{"group_name": "Refrigerantes Lata 350ml", "option_label": "Guaraná Antarctica", "price_delta": 0}]},
    ])
    order_ref = r.json()["order_ref"]

    r2 = await client.get(f"/orders/{order_ref}/tickets", headers=auth(token_owner))
    qr_data = r2.json()["tickets"][0]["qr_data"]
    product_name_in_qr = qr_data.split("|")[1]
    assert product_name_in_qr == long_name


async def test_isolamento_multitenant_ticket_com_combo_instance_key(client, token_kiosk):
    r = await _create_order(client, token_kiosk, [
        {"product_id": 1, "name": "Classic Cheddar Burger (Combo Classic Cheddar)", "qty": 1, "unit_price": 24.90,
         "combo_instance_key": "combo-xyz", "combo_name": "Combo Classic Cheddar"},
    ])
    order_ref = r.json()["order_ref"]

    r2 = await client.get(f"/orders/{order_ref}/tickets", headers=auth(_token_owner_empresa_b()))
    assert r2.status_code == 404
