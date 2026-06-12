import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
import respx
import httpx
from httpx import AsyncClient, ASGITransport

# Resposta mock do company-service para terminal com MockProvider
_MOCK_TERMINAL_CONFIG = {
    "paygo_terminal_id": None,
    "payment_provider": "mock",
    "environment": "sandbox",
    "config": None,
}

# Resposta mock do company-service para terminal com PayGoProvider
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


@pytest.fixture(scope="module")
async def client():
    from main import app, Base, engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


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
        respx.get("http://localhost:8002/internal/terminals/1").mock(
            return_value=httpx.Response(200, json=_MOCK_TERMINAL_CONFIG)
        )
        respx.patch("http://localhost:8004/internal/orders/ORD-MOCK01/status").mock(
            return_value=httpx.Response(200)
        )
        # Forçar aprovação fixando a semente do random
        import random
        original = random.random
        random.random = lambda: 0.01  # < 0.95 → aprovado
        try:
            r = await client.post(
                "/payments",
                json={
                    "order_ref": "ORD-MOCK01",
                    "method": "credit",
                    "amount": 26.00,
                    "items": [{"product_id": 1, "name": "X-Burger", "qty": 1, "unit_price": 26.00}],
                },
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
        respx.get("http://localhost:8002/internal/terminals/1").mock(
            return_value=httpx.Response(200, json=_MOCK_TERMINAL_CONFIG)
        )
        import random
        original = random.random
        random.random = lambda: 0.99  # >= 0.95 → recusado
        try:
            r = await client.post(
                "/payments",
                json={
                    "order_ref": "ORD-MOCK02",
                    "method": "credit",
                    "amount": 10.00,
                    "items": [{"product_id": 1, "name": "Produto", "qty": 1, "unit_price": 10.00}],
                },
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
        respx.get("http://localhost:8002/internal/terminals/1").mock(
            return_value=httpx.Response(200, json=config_sem_terminal)
        )
        r = await client.post(
            "/payments",
            json={"order_ref": "ORD-P1", "method": "credit", "amount": 5.00, "items": []},
            headers={"Authorization": f"Bearer {token_kiosk}"},
        )
    assert r.status_code == 400


# ── PayGoProvider — aprovado (mock das chamadas HTTP ao PayGo) ────────────────

async def test_create_payment_paygo_approved(client, token_kiosk):
    with respx.mock:
        respx.get("http://localhost:8002/internal/terminals/1").mock(
            return_value=httpx.Response(200, json=_PAYGO_TERMINAL_CONFIG)
        )
        # Mock Venda/Vender
        respx.post("https://sandbox.controlpay.com.br/webapi/Venda/Vender/").mock(
            return_value=httpx.Response(200, json={
                "intencaoVenda": {
                    "id": 23454,
                    "intencaoVendaStatus": {"id": 6, "nome": "Em Pagamento"},
                }
            })
        )
        # Mock polling — retorna aprovado imediatamente
        respx.post("https://sandbox.controlpay.com.br/webapi/IntencaoVenda/GetById").mock(
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
        respx.patch("http://localhost:8004/internal/orders/ORD-PG01/status").mock(
            return_value=httpx.Response(200)
        )

        r = await client.post(
            "/payments",
            json={
                "order_ref": "ORD-PG01",
                "method": "credit",
                "amount": 26.00,
                "items": [{"product_id": 1, "name": "X-Burger", "qty": 1, "unit_price": 26.00}],
            },
            headers={"Authorization": f"Bearer {token_kiosk}"},
        )

    assert r.status_code == 201
    data = r.json()
    assert data["ok"] is True
    assert data["status"] == "approved"
    assert data["nsu"] == "000123"
    assert data["authorization"] == "019501"


# ── PayGoProvider — timeout ───────────────────────────────────────────────────

async def test_create_payment_paygo_expired(client, token_kiosk):
    """Quando PayGo retorna sempre 'Em Pagamento', deve expirar — mas o timeout real é 90s.
    Mockamos para retornar status 15 (Expirado) diretamente."""
    with respx.mock:
        respx.get("http://localhost:8002/internal/terminals/1").mock(
            return_value=httpx.Response(200, json=_PAYGO_TERMINAL_CONFIG)
        )
        respx.post("https://sandbox.controlpay.com.br/webapi/Venda/Vender/").mock(
            return_value=httpx.Response(200, json={
                "intencaoVenda": {"id": 99999, "intencaoVendaStatus": {"id": 6}}
            })
        )
        respx.post("https://sandbox.controlpay.com.br/webapi/IntencaoVenda/GetById").mock(
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
