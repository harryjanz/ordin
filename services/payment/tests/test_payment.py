import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
import respx
import httpx
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

_MOCK_TERMINAL_CONFIG = {
    "paygo_terminal_id": None,
    "payment_provider": "mock",
    "environment": "sandbox",
    "config": None,
}

_PAYGO_TERMINAL_CONFIG = {
    "paygo_terminal_id": "81",
    "payment_provider": "paygo",
    "environment": "sandbox",
    "config": {
        "api_key": "test-key",
        "api_secret": "test-secret",
        "extra_config": {"pessoa_id": "11559"},
    },
}


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


def _company_url():
    import main as svc
    return svc.COMPANY_SVC


def _order_url():
    import main as svc
    return svc.ORDER_SVC


def _paygo_base():
    return os.environ.get("PAYGO_BASE_URL", "https://sandbox.controlpay.com.br/webapi/")


# ── Health ────────────────────────────────────────────────────────────────────

async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["service"] == "payment"


# ── Auth guard ────────────────────────────────────────────────────────────────

async def test_create_payment_sem_token(client):
    r = await client.post("/payments", json={})
    assert r.status_code == 401


# ── MockProvider — pagamento aprovado ─────────────────────────────────────────

async def test_create_payment_mock_approved(client, token_kiosk):
    with respx.mock:
        respx.get(f"{_company_url()}/internal/terminals/1").mock(
            return_value=httpx.Response(200, json=_MOCK_TERMINAL_CONFIG)
        )
        respx.patch(f"{_order_url()}/internal/orders/ORD-MOCK01/status").mock(
            return_value=httpx.Response(200)
        )
        import random
        original = random.random
        random.random = lambda: 0.01
        try:
            r = await client.post(
                "/payments",
                json={"order_ref": "ORD-MOCK01", "method": "credit", "amount": 26.00,
                      "items": [{"product_id": 1, "name": "X-Burger", "qty": 1, "unit_price": 26.00}]},
                headers={"Authorization": f"Bearer {token_kiosk}"},
            )
        finally:
            random.random = original
    assert r.status_code == 201
    data = r.json()
    assert data["ok"] is True
    assert data["status"] == "approved"
    assert "transaction_id" in data
    assert data["nsu"] is not None


# ── MockProvider — pagamento recusado ─────────────────────────────────────────

async def test_create_payment_mock_refused(client, token_kiosk):
    with respx.mock:
        respx.get(f"{_company_url()}/internal/terminals/1").mock(
            return_value=httpx.Response(200, json=_MOCK_TERMINAL_CONFIG)
        )
        import random
        original = random.random
        random.random = lambda: 0.99
        try:
            r = await client.post(
                "/payments",
                json={"order_ref": "ORD-MOCK02", "method": "credit", "amount": 10.00,
                      "items": [{"product_id": 1, "name": "Produto", "qty": 1, "unit_price": 10.00}]},
                headers={"Authorization": f"Bearer {token_kiosk}"},
            )
        finally:
            random.random = original
    assert r.status_code == 201
    assert r.json()["ok"] is False
    assert r.json()["status"] == "refused"


# ── Terminal sem JWT de kiosk ─────────────────────────────────────────────────

async def test_create_payment_sem_terminal_jwt(client, token_owner):
    r = await client.post(
        "/payments",
        json={"order_ref": "ORD-X", "method": "credit", "amount": 5.00, "items": []},
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert r.status_code == 400


# ── Terminal sem paygo_terminal_id quando provider=paygo ─────────────────────

async def test_paygo_sem_terminal_id_retorna_400(client, token_kiosk):
    config_sem_terminal = {
        "paygo_terminal_id": None,
        "payment_provider": "paygo",
        "environment": "sandbox",
        "config": {"api_key": "k", "api_secret": "s", "extra_config": {}},
    }
    with respx.mock:
        respx.get(f"{_company_url()}/internal/terminals/1").mock(
            return_value=httpx.Response(200, json=config_sem_terminal)
        )
        r = await client.post(
            "/payments",
            json={"order_ref": "ORD-P1", "method": "credit", "amount": 5.00, "items": []},
            headers={"Authorization": f"Bearer {token_kiosk}"},
        )
    assert r.status_code == 400


# ── PayGoProvider — aprovado ──────────────────────────────────────────────────

async def test_create_payment_paygo_approved(client, token_kiosk):
    base = _paygo_base()
    with respx.mock:
        respx.get(f"{_company_url()}/internal/terminals/1").mock(
            return_value=httpx.Response(200, json=_PAYGO_TERMINAL_CONFIG)
        )
        respx.post(f"{base}Venda/Vender/").mock(
            return_value=httpx.Response(200, json={
                "intencaoVenda": {
                    "id": 23454,
                    "intencaoVendaStatus": {"id": 6, "nome": "Em Pagamento"},
                }
            })
        )
        respx.post(f"{base}IntencaoVenda/GetById").mock(
            return_value=httpx.Response(200, json={
                "intencaoVenda": {
                    "id": 23454,
                    "intencaoVendaStatus": {"id": 10, "nome": "Creditado"},
                    "pagamentosExternos": [{
                        "autorizacao": "019501",
                        "nsu": "000123",
                        "adquirente": "VISANET",
                    }],
                }
            })
        )
        respx.patch(f"{_order_url()}/internal/orders/ORD-PG01/status").mock(
            return_value=httpx.Response(200)
        )
        r = await client.post(
            "/payments",
            json={"order_ref": "ORD-PG01", "method": "credit", "amount": 26.00,
                  "items": [{"product_id": 1, "name": "X-Burger", "qty": 1, "unit_price": 26.00}]},
            headers={"Authorization": f"Bearer {token_kiosk}"},
        )
    assert r.status_code == 201
    data = r.json()
    assert data["ok"] is True
    assert data["status"] == "approved"
    assert data["nsu"] == "000123"
    assert data["authorization"] == "019501"


# ── PayGoProvider — expirado ──────────────────────────────────────────────────

async def test_create_payment_paygo_expired(client, token_kiosk):
    base = _paygo_base()
    with respx.mock:
        respx.get(f"{_company_url()}/internal/terminals/1").mock(
            return_value=httpx.Response(200, json=_PAYGO_TERMINAL_CONFIG)
        )
        respx.post(f"{base}Venda/Vender/").mock(
            return_value=httpx.Response(200, json={
                "intencaoVenda": {"id": 99999, "intencaoVendaStatus": {"id": 6}}
            })
        )
        respx.post(f"{base}IntencaoVenda/GetById").mock(
            return_value=httpx.Response(200, json={
                "intencaoVenda": {
                    "id": 99999,
                    "intencaoVendaStatus": {"id": 15, "nome": "Expirado"},
                }
            })
        )
        r = await client.post(
            "/payments",
            json={"order_ref": "ORD-EXP01", "method": "credit", "amount": 5.00, "items": []},
            headers={"Authorization": f"Bearer {token_kiosk}"},
        )
    assert r.status_code == 201
    assert r.json()["ok"] is False
    assert r.json()["status"] == "expired"


# ── Listar e cancelar ─────────────────────────────────────────────────────────

async def test_list_payments(client, token_owner):
    r = await client.get("/payments", headers={"Authorization": f"Bearer {token_owner}"})
    assert r.status_code == 200
    assert "items" in r.json()
    for item in r.json()["items"]:
        assert "provider" in item


async def test_cancel_inexistente(client, token_owner):
    r = await client.post(
        "/payments/9999/cancel",
        json={"reason": "teste"},
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert r.status_code == 404
