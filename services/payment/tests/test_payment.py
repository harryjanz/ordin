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

_MP_TERMINAL_CONFIG = {
    "paygo_terminal_id": None,
    "mp_device_id": "PAX_A910__SMARTPOS123",
    "payment_provider": "mercadopago",
    "environment": "sandbox",
    "config": {
        "api_key": "TEST-token",
        "api_secret": None,
        "extra_config": {},
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


# ── MercadoPagoProvider (Point/Orders API) — aprovado ────────────────────────
# ORD-129: migração da API legada de Payment Intents para a API de Orders.

async def test_create_payment_mercadopago_card_approved(client, token_kiosk):
    with respx.mock:
        respx.get(f"{_company_url()}/internal/terminals/1").mock(
            return_value=httpx.Response(200, json=_MP_TERMINAL_CONFIG)
        )
        respx.post("https://api.mercadopago.com/v1/orders").mock(
            return_value=httpx.Response(201, json={
                "id": "ORDTEST00005",
                "status": "created",
                "transactions": {"payments": [{"id": "PAYTEST005", "status": "created"}]},
            })
        )
        respx.get("https://api.mercadopago.com/v1/orders/ORDTEST00005").mock(
            return_value=httpx.Response(200, json={
                "id": "ORDTEST00005",
                "status": "processed",
                "transactions": {"payments": [{
                    "id": "PAYTEST005", "status": "processed", "status_detail": "accredited",
                }]},
            })
        )
        respx.patch(f"{_order_url()}/internal/orders/ORD-MP01/status").mock(
            return_value=httpx.Response(200)
        )
        r = await client.post(
            "/payments",
            json={"order_ref": "ORD-MP01", "method": "credit", "amount": 26.00,
                  "items": [{"product_id": 1, "name": "X-Burger", "qty": 1, "unit_price": 26.00}]},
            headers={"Authorization": f"Bearer {token_kiosk}"},
        )
    assert r.status_code == 201
    data = r.json()
    assert data["ok"] is True
    assert data["status"] == "approved"
    assert data["nsu"] == "PAYTEST005"
    assert data["authorization"] == "accredited"


# ── MercadoPagoProvider (Point/Orders API) — recusado ────────────────────────

async def test_create_payment_mercadopago_card_refused(client, token_kiosk):
    with respx.mock:
        respx.get(f"{_company_url()}/internal/terminals/1").mock(
            return_value=httpx.Response(200, json=_MP_TERMINAL_CONFIG)
        )
        respx.post("https://api.mercadopago.com/v1/orders").mock(
            return_value=httpx.Response(201, json={
                "id": "ORDTEST00006",
                "status": "created",
                "transactions": {"payments": [{"id": "PAYTEST006", "status": "created"}]},
            })
        )
        respx.get("https://api.mercadopago.com/v1/orders/ORDTEST00006").mock(
            return_value=httpx.Response(200, json={
                "id": "ORDTEST00006",
                "status": "failed",
                "transactions": {"payments": [{
                    "id": "PAYTEST006", "status": "failed", "status_detail": "insufficient_amount",
                }]},
            })
        )
        r = await client.post(
            "/payments",
            json={"order_ref": "ORD-MP02", "method": "debit", "amount": 10.00, "items": []},
            headers={"Authorization": f"Bearer {token_kiosk}"},
        )
    assert r.status_code == 201
    assert r.json()["ok"] is False
    assert r.json()["status"] == "refused"


# ── Mercado Pago sem mp_device_id configurado ────────────────────────────────

async def test_mercadopago_sem_mp_device_id_retorna_400(client, token_kiosk):
    config_sem_device = {**_MP_TERMINAL_CONFIG, "mp_device_id": None}
    with respx.mock:
        respx.get(f"{_company_url()}/internal/terminals/1").mock(
            return_value=httpx.Response(200, json=config_sem_device)
        )
        r = await client.post(
            "/payments",
            json={"order_ref": "ORD-MP03", "method": "credit", "amount": 5.00, "items": []},
            headers={"Authorization": f"Bearer {token_kiosk}"},
        )
    assert r.status_code == 400


async def test_mercadopago_mp_device_id_fora_do_formato_retorna_400(client, token_kiosk):
    """mp_device_id sem "__" (ex.: só o serial, sem o prefixo do tipo de
    terminal) nunca chega à maquininha via push — bloqueia antes de criar
    a order pra evitar que o operador dependa do botão Atualizar."""
    config_device_invalido = {**_MP_TERMINAL_CONFIG, "mp_device_id": "SMARTPOS123"}
    with respx.mock:
        respx.get(f"{_company_url()}/internal/terminals/1").mock(
            return_value=httpx.Response(200, json=config_device_invalido)
        )
        r = await client.post(
            "/payments",
            json={"order_ref": "ORD-MP04", "method": "credit", "amount": 5.00, "items": []},
            headers={"Authorization": f"Bearer {token_kiosk}"},
        )
    assert r.status_code == 400
    assert "formato" in r.json()["detail"]


# ── Listar e cancelar ─────────────────────────────────────────────────────────

async def test_list_payments(client, token_owner):
    r = await client.get("/payments", headers={"Authorization": f"Bearer {token_owner}"})
    assert r.status_code == 200
    assert "items" in r.json()
    for item in r.json()["items"]:
        assert "provider" in item


# ── ORD-134: date_to deve incluir o dia inteiro, não só até meia-noite ────────

async def _make_tx(client, order_ref, created_at, company_id=1):
    import main as svc
    tx = svc.Transaction(
        company_id=company_id, order_ref=order_ref, terminal_id=1, method="pix",
        amount=1.00, status="approved", provider="mercadopago", created_at=created_at,
    )
    async with svc.AsyncSessionLocal() as db:
        db.add(tx)
        await db.commit()
        await db.refresh(tx)
    return tx.id


async def _del_tx(client, tx_id):
    import main as svc
    from sqlalchemy import delete as sa_delete
    async with svc.AsyncSessionLocal() as db:
        await db.execute(sa_delete(svc.Transaction).where(svc.Transaction.id == tx_id))
        await db.commit()


async def test_list_payments_date_to_inclui_fim_do_dia(client, token_owner):
    import os
    from datetime import datetime
    order_ref = f"ORD134{os.urandom(3).hex()}"
    tx_id = await _make_tx(client, order_ref, datetime(2026, 8, 28, 23, 59, 0))
    try:
        r = await client.get(
            "/payments", params={"date_from": "2026-08-28", "date_to": "2026-08-28", "limit": 200},
            headers={"Authorization": f"Bearer {token_owner}"},
        )
        assert r.status_code == 200
        assert any(i["order_ref"] == order_ref for i in r.json()["items"])
    finally:
        await _del_tx(client, tx_id)


async def test_list_payments_date_to_nao_vaza_pro_dia_seguinte(client, token_owner):
    import os
    from datetime import datetime
    order_ref = f"ORD134{os.urandom(3).hex()}"
    tx_id = await _make_tx(client, order_ref, datetime(2026, 8, 29, 0, 0, 1))
    try:
        r = await client.get(
            "/payments", params={"date_from": "2026-08-28", "date_to": "2026-08-28", "limit": 200},
            headers={"Authorization": f"Bearer {token_owner}"},
        )
        assert not any(i["order_ref"] == order_ref for i in r.json()["items"])
    finally:
        await _del_tx(client, tx_id)


async def test_list_payments_meia_noite_do_date_to_continua_incluida(client, token_owner):
    """Regressão: transação exatamente à meia-noite do date_to já funcionava
    antes (created_at <= date_to inclui '00:00:00' exato) — não pode parar
    de funcionar com o limite exclusivo do dia seguinte."""
    import os
    from datetime import datetime
    order_ref = f"ORD134{os.urandom(3).hex()}"
    tx_id = await _make_tx(client, order_ref, datetime(2026, 8, 28, 0, 0, 0))
    try:
        r = await client.get(
            "/payments", params={"date_from": "2026-08-28", "date_to": "2026-08-28", "limit": 200},
            headers={"Authorization": f"Bearer {token_owner}"},
        )
        assert any(i["order_ref"] == order_ref for i in r.json()["items"])
    finally:
        await _del_tx(client, tx_id)


async def test_list_payments_date_from_igual_date_to_retorna_dia_inteiro(client, token_owner):
    import os
    from datetime import datetime
    ref_inicio = f"ORD134{os.urandom(3).hex()}"
    ref_fim = f"ORD134{os.urandom(3).hex()}"
    tx1 = await _make_tx(client, ref_inicio, datetime(2026, 8, 28, 0, 0, 0))
    tx2 = await _make_tx(client, ref_fim, datetime(2026, 8, 28, 23, 59, 59))
    try:
        r = await client.get(
            "/payments", params={"date_from": "2026-08-28", "date_to": "2026-08-28", "limit": 200},
            headers={"Authorization": f"Bearer {token_owner}"},
        )
        refs = {i["order_ref"] for i in r.json()["items"]}
        assert ref_inicio in refs and ref_fim in refs
    finally:
        await _del_tx(client, tx1)
        await _del_tx(client, tx2)


async def test_list_payments_date_from_sem_mudanca_de_comportamento(client, token_owner):
    """date_from continua sendo comparação simples, sem tratamento especial —
    só o limite superior (date_to) muda nesta história."""
    import os
    from datetime import datetime
    order_ref = f"ORD134{os.urandom(3).hex()}"
    tx_id = await _make_tx(client, order_ref, datetime(2026, 8, 27, 23, 59, 59))
    try:
        r = await client.get(
            "/payments", params={"date_from": "2026-08-28", "limit": 200},
            headers={"Authorization": f"Bearer {token_owner}"},
        )
        assert not any(i["order_ref"] == order_ref for i in r.json()["items"])
    finally:
        await _del_tx(client, tx_id)


async def test_list_payments_sem_date_to_sem_limite_superior(client, token_owner):
    import os
    from datetime import datetime
    order_ref = f"ORD134{os.urandom(3).hex()}"
    tx_id = await _make_tx(client, order_ref, datetime(2026, 8, 29, 0, 0, 1))
    try:
        r = await client.get(
            "/payments", params={"date_from": "2026-08-28", "limit": 200},
            headers={"Authorization": f"Bearer {token_owner}"},
        )
        assert any(i["order_ref"] == order_ref for i in r.json()["items"])
    finally:
        await _del_tx(client, tx_id)


async def test_list_payments_date_to_formato_invalido_retorna_400(client, token_owner):
    r = await client.get(
        "/payments", params={"date_to": "28/08/2026"},
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert r.status_code == 400


async def test_list_payments_isolamento_multitenant_com_filtro_data(client, token_owner, token_company_b):
    """A correção de date_to não deve vazar transações de outra empresa."""
    import os
    from datetime import datetime
    order_ref = f"ORD134{os.urandom(3).hex()}"
    tx_id = await _make_tx(client, order_ref, datetime(2026, 8, 28, 23, 59, 0), company_id=2)
    try:
        r = await client.get(
            "/payments", params={"date_from": "2026-08-28", "date_to": "2026-08-28", "limit": 200},
            headers={"Authorization": f"Bearer {token_owner}"},
        )
        assert not any(i["order_ref"] == order_ref for i in r.json()["items"])
    finally:
        await _del_tx(client, tx_id)


async def test_cancel_inexistente(client, token_owner):
    r = await client.post(
        "/payments/9999/cancel",
        json={"reason": "teste"},
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert r.status_code == 404


# ── Webhooks por provider (ORD-130/ORD-131) ───────────────────────────────────

def _mock_mp_payment_config(company_id: int, webhook_secret: str | None):
    return respx.get(
        f"{_company_url()}/internal/companies/{company_id}/payment-config",
        params={"provider": "mercadopago"},
    ).mock(return_value=httpx.Response(200, json={"webhook_secret": webhook_secret}))


async def test_webhook_mercadopago_empresa_sem_config_nao_processa(client):
    """Empresa sem nenhuma config MP ativa (404 no company-service) — aceita
    (200) mas não processa nada, sem quebrar."""
    with respx.mock:
        respx.get(f"{_company_url()}/internal/companies/1/payment-config", params={"provider": "mercadopago"}).mock(
            return_value=httpx.Response(404)
        )
        r = await client.post(
            "/payments/webhook/mercadopago/1?type=payment&data.id=123",
            json={"type": "payment", "data": {"id": "123"}},
        )
    assert r.status_code == 200
    assert r.json()["ok"] is True


async def test_webhook_mercadopago_config_sem_secret_ainda_aceita(client):
    """Empresa com config MP ativa mas webhook_secret ainda não preenchido —
    comportamento permissivo (mesmo de antes da ORD-131), sem validar assinatura."""
    with respx.mock:
        _mock_mp_payment_config(1, None)
        r = await client.post(
            "/payments/webhook/mercadopago/1?type=payment&data.id=123",
            json={"type": "payment", "data": {"id": "123"}},
        )
    assert r.status_code == 200
    assert r.json()["ok"] is True


async def test_webhook_mercadopago_assinatura_valida_aceita(client):
    import hmac, hashlib

    secret = "test-secret"
    data_id = "ORD01M10M7YZ1CN8NJRVX32EX1B76"
    request_id = "req-abc-123"
    ts = "1787801538"
    manifest = f"id:{data_id.lower()};request-id:{request_id};ts:{ts};"
    v1 = hmac.new(secret.encode(), manifest.encode(), hashlib.sha256).hexdigest()

    with respx.mock:
        _mock_mp_payment_config(1, secret)
        r = await client.post(
            f"/payments/webhook/mercadopago/1?type=order&data.id={data_id}",
            json={"type": "order", "action": "order.processed", "data": {"id": data_id}},
            headers={"x-signature": f"ts={ts},v1={v1}", "x-request-id": request_id},
        )
    assert r.status_code == 200
    assert r.json()["ok"] is True


async def test_webhook_mercadopago_assinatura_invalida_retorna_401(client):
    with respx.mock:
        _mock_mp_payment_config(1, "test-secret")
        r = await client.post(
            "/payments/webhook/mercadopago/1?type=order&data.id=ORD01",
            json={"type": "order", "data": {"id": "ORD01"}},
            headers={"x-signature": "ts=123,v1=hash-forjado", "x-request-id": "req-x"},
        )
    assert r.status_code == 401


async def test_webhook_mercadopago_secret_da_empresa_2_nao_valida_empresa_1(client):
    """ORD-131, isolamento multi-tenant: uma assinatura calculada com o
    secret da empresa 2 não deve bater na validação da empresa 1, mesmo que
    a URL/company_id da requisição seja da empresa 1."""
    import hmac, hashlib

    secret_empresa_2 = "secret-da-empresa-2"
    data_id = "ORD02"
    request_id = "req-1"
    ts = "1787801538"
    manifest = f"id:{data_id.lower()};request-id:{request_id};ts:{ts};"
    v1_calculado_com_secret_errado = hmac.new(secret_empresa_2.encode(), manifest.encode(), hashlib.sha256).hexdigest()

    with respx.mock:
        _mock_mp_payment_config(1, "secret-da-empresa-1")  # empresa 1 tem outro secret
        r = await client.post(
            f"/payments/webhook/mercadopago/1?type=order&data.id={data_id}",
            json={"type": "order", "data": {"id": data_id}},
            headers={"x-signature": f"ts={ts},v1={v1_calculado_com_secret_errado}", "x-request-id": request_id},
        )
    assert r.status_code == 401


async def test_webhook_paygo_aceita_placeholder(client):
    r = await client.post("/payments/webhook/paygo", json={"qualquer": "coisa"})
    assert r.status_code == 200
    assert r.json()["ok"] is True


# ── ORD-132: auditoria de payloads de webhook no Mongo ────────────────────────

async def test_webhook_mercadopago_type_payment_correlacionado_grava_audit(client):
    """Webhook type=payment correlacionado a uma transação existente grava
    documento com correlated=True, transaction_id e company_id preenchidos."""
    import main as svc
    from unittest.mock import AsyncMock, patch

    # provider_transaction_id único por execução — evita colisão com
    # resíduo de execuções anteriores no banco de dev compartilhado.
    payment_id = f"1759{os.urandom(4).hex()}"
    order_ref = f"P-WH{os.urandom(3).hex()}"
    tx = svc.Transaction(
        company_id=1, order_ref=order_ref, terminal_id=1, method="pix",
        amount=15.00, status="processing", provider="mercadopago",
        provider_transaction_id=payment_id,
    )
    async with svc.AsyncSessionLocal() as db:
        db.add(tx)
        await db.commit()
        await db.refresh(tx)

    with respx.mock:
        _mock_mp_payment_config(1, None)
        respx.get(f"{_company_url()}/internal/terminals/1").mock(
            return_value=httpx.Response(200, json=_MP_TERMINAL_CONFIG)
        )
        respx.get(f"https://api.mercadopago.com/v1/payments/{payment_id}").mock(
            return_value=httpx.Response(200, json={"status": "approved"})
        )
        respx.patch(f"{_order_url()}/internal/orders/{order_ref}/status").mock(
            return_value=httpx.Response(200)
        )
        with patch.object(svc, "save_audit", new=AsyncMock()) as mock_audit:
            r = await client.post(
                f"/payments/webhook/mercadopago/1?type=payment&data.id={payment_id}",
                json={"type": "payment", "data": {"id": payment_id}},
            )
    assert r.status_code == 200
    received_docs = [
        c.args[0] for c in mock_audit.await_args_list if c.args[0].get("event") == "webhook_received"
    ]
    assert len(received_docs) == 1
    doc = received_docs[0]
    assert doc["correlated"] is True
    assert doc["transaction_id"] == tx.id
    assert doc["company_id"] == 1
    assert doc["signature_valid"] is True
    assert doc["webhook_type"] == "payment"


async def test_webhook_mercadopago_nao_correlacionavel_grava_audit(client):
    """Webhook sem transação correspondente ainda é gravado — rastro
    forense, não deve ser descartado silenciosamente."""
    import main as svc
    from unittest.mock import AsyncMock, patch

    with respx.mock:
        _mock_mp_payment_config(1, None)
        with patch.object(svc, "save_audit", new=AsyncMock()) as mock_audit:
            r = await client.post(
                "/payments/webhook/mercadopago/1?type=payment&data.id=999999999",
                json={"type": "payment", "data": {"id": "999999999"}},
            )
    assert r.status_code == 200
    mock_audit.assert_awaited_once()
    doc = mock_audit.await_args.args[0]
    assert doc["correlated"] is False
    assert doc["transaction_id"] is None
    assert doc["company_id"] == 1


async def test_webhook_mercadopago_assinatura_invalida_grava_audit(client):
    """Tentativa com assinatura inválida é rejeitada (401) mas ainda auditada
    — valor forense/segurança, decisão tomada no QA Explorer do ORD-132."""
    import main as svc
    from unittest.mock import AsyncMock, patch

    with respx.mock:
        _mock_mp_payment_config(1, "test-secret")
        with patch.object(svc, "save_audit", new=AsyncMock()) as mock_audit:
            r = await client.post(
                "/payments/webhook/mercadopago/1?type=order&data.id=ORD01",
                json={"type": "order", "data": {"id": "ORD01"}},
                headers={"x-signature": "ts=123,v1=hash-forjado", "x-request-id": "req-x"},
            )
    assert r.status_code == 401
    mock_audit.assert_awaited_once()
    doc = mock_audit.await_args.args[0]
    assert doc["signature_valid"] is False
    assert doc["correlated"] is False
    assert doc["company_id"] == 1


async def test_webhook_paygo_grava_audit(client):
    import main as svc
    from unittest.mock import AsyncMock, patch

    with patch.object(svc, "save_audit", new=AsyncMock()) as mock_audit:
        r = await client.post("/payments/webhook/paygo", json={"qualquer": "coisa"})
    assert r.status_code == 200
    mock_audit.assert_awaited_once()
    doc = mock_audit.await_args.args[0]
    assert doc["provider"] == "paygo"


async def test_webhook_rota_antiga_nao_existe_mais(client):
    # 405 (não 404): "/payments/webhook" bate estruturalmente com a rota
    # pré-existente DELETE /payments/{tx_id} (sem tipo no path string), que
    # só aceita DELETE — de qualquer forma, não processa mais nada como webhook.
    r = await client.post("/payments/webhook?source=mercadopago", json={})
    assert r.status_code in (404, 405)
