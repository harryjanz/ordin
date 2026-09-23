"""ORD-200 (D2): estorno automático de pagamento quando a baixa de estoque
(D1, ORD-198) falha de verdade. Cobre os cenários Gherkin do QA Explorer
(docs/stories/ORD-200): _decrementar_estoque_venda vira -> bool, dispatcher
_estornar_pagamento_automatico decide entre _cancel_transaction_core
(PayGo/mock) e _refund_transaction_core (Mercado Pago), falha dupla nunca
propaga. Regressão de POST /payments/{id}/cancel e /refund (comportamento
idêntico após a extração) é coberta pela suíte já existente em
test_payment.py, inalterada — não duplicada aqui.
"""
import os
import sys
from datetime import datetime
from unittest.mock import AsyncMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx
import pytest
import respx
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
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


def _company_url():
    import main as svc
    return svc.COMPANY_SVC


def _order_url():
    import main as svc
    return svc.ORDER_SVC


def _catalog_url():
    import main as svc
    return svc.CATALOG_SVC


_MP_TERMINAL_CONFIG = {
    "paygo_terminal_id": None,
    "mp_device_id": "PAX_A910__SMARTPOS123",
    "payment_provider": "mercadopago",
    "environment": "sandbox",
    "config": {"api_key": "TEST-token", "api_secret": None, "extra_config": {}},
}

_MOCK_TERMINAL_CONFIG = {
    "paygo_terminal_id": None,
    "payment_provider": "mock",
    "environment": "sandbox",
    "config": None,
}

_ORDER_BODY = {
    "order_ref": "ORD-D2-01",
    "company_id": 1,
    "total": 12.00,
    "items": [{"product_id": 1, "product_name": "Coca-Cola Lata 350ml", "unit_price": 6.00, "quantity": 2}],
}


async def _make_tx(order_ref, provider="mock", provider_transaction_id=None, company_id=1, status="approved"):
    import main as svc
    tx = svc.Transaction(
        company_id=company_id, order_ref=order_ref, terminal_id=1, method="credit",
        amount=12.00, status=status, provider=provider, environment="sandbox",
        provider_transaction_id=provider_transaction_id, created_at=datetime.utcnow(),
    )
    async with svc.AsyncSessionLocal() as db:
        db.add(tx)
        await db.commit()
        await db.refresh(tx)
    return tx.id


async def _get_tx(tx_id):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        result = await db.execute(select(svc.Transaction).where(svc.Transaction.id == tx_id))
        return result.scalars().first()


async def _del_tx(tx_id):
    import main as svc
    from sqlalchemy import delete as sa_delete
    async with svc.AsyncSessionLocal() as db:
        await db.execute(sa_delete(svc.Transaction).where(svc.Transaction.id == tx_id))
        await db.commit()


# ── _estornar_pagamento_automatico — PayGo/mock (Critérios 1, 5) ────────────

async def test_estorno_automatico_cancela_transacao_paygo_mock(client):
    """Provider mock/PayGo é best-effort — sempre cancela local. Dispatcher
    chama _notify_order (achado de PM: já era comportamento do cancelamento
    manual). cancelled_by fica None (achado de Backend — ator é o sistema)."""
    import main as svc
    tx_id = await _make_tx("ORD-D2-01", provider="mock")
    try:
        with patch.object(svc, "save_audit", new=AsyncMock()) as mock_audit, \
             patch.object(svc, "_notify_order", new=AsyncMock()) as mock_notify:
            await svc._estornar_pagamento_automatico(tx_id, "Falha ao decrementar estoque na venda")

        tx = await _get_tx(tx_id)
        assert tx.status == "cancelled"
        mock_notify.assert_awaited_once_with("ORD-D2-01", "cancelled")

        cancel_call = next(c for c in mock_audit.await_args_list if c.args[0].get("final_status") == "cancelled")
        assert cancel_call.args[0]["cancelled_by"] is None
        assert cancel_call.args[0]["company_id"] == 1
    finally:
        await _del_tx(tx_id)


# ── _estornar_pagamento_automatico — Mercado Pago (Critérios 1, 6) ──────────

async def test_estorno_automatico_reembolsa_transacao_mercadopago(client):
    """Fecha a assimetria de refund_payment manual (achado de PM): o
    caminho automático sempre chama _notify_order em caso de sucesso,
    mesmo pra Mercado Pago."""
    import main as svc
    tx_id = await _make_tx("ORD-D2-02", provider="mercadopago", provider_transaction_id="ORDTESTD200")
    try:
        with respx.mock:
            respx.get(f"{_company_url()}/internal/terminals/1").mock(
                return_value=httpx.Response(200, json=_MP_TERMINAL_CONFIG)
            )
            respx.post("https://api.mercadopago.com/v1/orders/ORDTESTD200/refund").mock(
                return_value=httpx.Response(201, json={"id": "ORDTESTD200", "status": "refunded"})
            )
            with patch.object(svc, "_notify_order", new=AsyncMock()) as mock_notify:
                await svc._estornar_pagamento_automatico(tx_id, "Falha ao decrementar estoque na venda")

        tx = await _get_tx(tx_id)
        assert tx.status == "refunded"
        mock_notify.assert_awaited_once_with("ORD-D2-02", "cancelled")
    finally:
        await _del_tx(tx_id)


# ── Reembolso recusado pelo provider — falha simples, não dupla ─────────────

async def test_estorno_automatico_reembolso_recusado_grava_falha(client):
    """Provider recusa o reembolso (ex: saldo insuficiente) — _refund_
    transaction_core retorna sucesso=False sem levantar exceção; o
    dispatcher trata isso como falha do estorno, grava audit, tx não muda."""
    import main as svc
    tx_id = await _make_tx("ORD-D2-03", provider="mercadopago", provider_transaction_id="ORDTESTD203")
    try:
        with respx.mock:
            respx.get(f"{_company_url()}/internal/terminals/1").mock(
                return_value=httpx.Response(200, json=_MP_TERMINAL_CONFIG)
            )
            respx.post("https://api.mercadopago.com/v1/orders/ORDTESTD203/refund").mock(
                return_value=httpx.Response(400, json={"message": "Saldo insuficiente"})
            )
            with patch.object(svc, "save_audit", new=AsyncMock()) as mock_audit:
                await svc._estornar_pagamento_automatico(tx_id, "Falha ao decrementar estoque na venda")

        tx = await _get_tx(tx_id)
        assert tx.status == "approved"  # não muda — reembolso não confirmado

        falha_call = next(c for c in mock_audit.await_args_list if c.args[0].get("event") == "estorno_automatico_falhou")
        assert falha_call.args[0]["transaction_id"] == tx_id
        assert "Saldo insuficiente" in falha_call.args[0]["erro"]
    finally:
        await _del_tx(tx_id)


# ── Falha dupla — nunca propaga (Critério 7) ─────────────────────────────────

async def test_estorno_automatico_falha_dupla_paygo_nunca_propaga(client):
    import main as svc
    tx_id = await _make_tx("ORD-D2-04", provider="mock")
    try:
        with patch.object(svc, "_cancel_transaction_core", new=AsyncMock(side_effect=RuntimeError("boom"))), \
             patch.object(svc, "save_audit", new=AsyncMock()) as mock_audit:
            await svc._estornar_pagamento_automatico(tx_id, "Falha ao decrementar estoque na venda")  # não levanta

        falha_call = next(c for c in mock_audit.await_args_list if c.args[0].get("event") == "estorno_automatico_falhou")
        assert falha_call.args[0]["transaction_id"] == tx_id
        assert "boom" in falha_call.args[0]["erro"]
    finally:
        await _del_tx(tx_id)


async def test_estorno_automatico_falha_dupla_mercadopago_httpexception_nao_propaga(client):
    """Achado do repasse de Backend: _refund_transaction_core não engole
    HTTPException de _get_terminal_config (diferente de _cancel_transaction_
    core, que já era best-effort antes da extração) — o dispatcher precisa
    cobrir isso. Aqui simulamos via terminal inexistente (company-service
    responde 404), que _get_terminal_config converte em HTTPException."""
    import main as svc
    tx_id = await _make_tx("ORD-D2-05", provider="mercadopago", provider_transaction_id="ORDTESTD205")
    try:
        with respx.mock:
            respx.get(f"{_company_url()}/internal/terminals/1").mock(return_value=httpx.Response(404))
            with patch.object(svc, "save_audit", new=AsyncMock()) as mock_audit:
                await svc._estornar_pagamento_automatico(tx_id, "Falha ao decrementar estoque na venda")  # não levanta

        tx = await _get_tx(tx_id)
        assert tx.status == "approved"  # nada mudou

        falha_call = next(c for c in mock_audit.await_args_list if c.args[0].get("event") == "estorno_automatico_falhou")
        assert falha_call.args[0]["transaction_id"] == tx_id
    finally:
        await _del_tx(tx_id)


# ── Guarda de idempotência do dispatcher ─────────────────────────────────────

async def test_estorno_automatico_transacao_ja_nao_aprovada_nao_faz_nada(client):
    import main as svc
    tx_id = await _make_tx("ORD-D2-06", provider="mock", status="cancelled")
    try:
        with patch.object(svc, "_cancel_transaction_core", new=AsyncMock()) as mock_core, \
             patch.object(svc, "_notify_order", new=AsyncMock()) as mock_notify:
            await svc._estornar_pagamento_automatico(tx_id, "motivo")

        mock_core.assert_not_awaited()
        mock_notify.assert_not_awaited()
    finally:
        await _del_tx(tx_id)


# ── _decrementar_estoque_venda — bool (Critérios 2, 3, 4) ────────────────────

async def test_decrementar_estoque_retorna_true_quando_pedido_nao_encontrado(client):
    import main as svc
    with respx.mock:
        respx.get(f"{_order_url()}/internal/orders/ORD-D2-NF").mock(return_value=httpx.Response(404))
        result = await svc._decrementar_estoque_venda("ORD-D2-NF")
    assert result is True


async def test_decrementar_estoque_retorna_true_quando_sem_item_cfop_5102(client):
    import main as svc
    with respx.mock:
        respx.get(f"{_order_url()}/internal/orders/ORD-D2-5101").mock(
            return_value=httpx.Response(200, json={**_ORDER_BODY, "order_ref": "ORD-D2-5101"})
        )
        respx.get(f"{_catalog_url()}/internal/products/1/fiscal").mock(
            return_value=httpx.Response(200, json={"ncm": "19059090", "cfop": "5101", "cest": None})
        )
        result = await svc._decrementar_estoque_venda("ORD-D2-5101")
    assert result is True


async def test_decrementar_estoque_retorna_false_quando_catalog_indisponivel(client):
    import main as svc
    with respx.mock:
        respx.get(f"{_order_url()}/internal/orders/ORD-D2-FAIL").mock(
            return_value=httpx.Response(200, json={**_ORDER_BODY, "order_ref": "ORD-D2-FAIL"})
        )
        respx.get(f"{_catalog_url()}/internal/products/1/fiscal").mock(
            return_value=httpx.Response(200, json={"ncm": "22021000", "cfop": "5102", "cest": None})
        )
        respx.post(f"{_catalog_url()}/internal/stock/decrement").mock(
            side_effect=httpx.TimeoutException("timeout")
        )
        result = await svc._decrementar_estoque_venda("ORD-D2-FAIL")
    assert result is False


async def test_decrementar_estoque_retorna_true_com_saldo_negativo_por_concorrencia(client):
    """catalog-service sempre responde 200 mesmo com saldo negativo (D1) —
    do ponto de vista do payment-service isso é sucesso, nunca aciona D2."""
    import main as svc
    with respx.mock:
        respx.get(f"{_order_url()}/internal/orders/ORD-D2-NEG").mock(
            return_value=httpx.Response(200, json={**_ORDER_BODY, "order_ref": "ORD-D2-NEG"})
        )
        respx.get(f"{_catalog_url()}/internal/products/1/fiscal").mock(
            return_value=httpx.Response(200, json={"ncm": "22021000", "cfop": "5102", "cest": None})
        )
        respx.post(f"{_catalog_url()}/internal/stock/decrement").mock(
            return_value=httpx.Response(200, json={"processed": 1, "skipped": 0})
        )
        result = await svc._decrementar_estoque_venda("ORD-D2-NEG")
    assert result is True


# ── Integração ponta a ponta via POST /payments (Critério 1, hook) ──────────

async def test_payment_aprovado_com_falha_real_aciona_estorno_automatico(client, token_kiosk):
    """Falha real na baixa de estoque, dentro do fluxo síncrono de aprovação
    (create_payment) — POST /payments ainda retorna sucesso ao totem (a
    cobrança já aconteceu fisicamente), mas a transação é cancelada
    automaticamente logo em seguida."""
    import main as svc
    with respx.mock:
        respx.get(f"{svc.COMPANY_SVC}/internal/terminals/1").mock(
            return_value=httpx.Response(200, json=_MOCK_TERMINAL_CONFIG)
        )
        respx.patch(f"{_order_url()}/internal/orders/ORD-D2-E2E/status").mock(return_value=httpx.Response(200))
        respx.get(f"{svc.COMPANY_SVC}/internal/companies/1/fiscal-credentials").mock(
            return_value=httpx.Response(200, json={"ativo": False})
        )
        respx.get(f"{_order_url()}/internal/orders/ORD-D2-E2E").mock(
            return_value=httpx.Response(200, json={**_ORDER_BODY, "order_ref": "ORD-D2-E2E"})
        )
        respx.get(f"{_catalog_url()}/internal/products/1/fiscal").mock(
            return_value=httpx.Response(200, json={"ncm": "22021000", "cfop": "5102", "cest": None})
        )
        respx.post(f"{_catalog_url()}/internal/stock/decrement").mock(
            return_value=httpx.Response(500)
        )

        import random
        original = random.random
        random.random = lambda: 0.01
        try:
            r = await client.post(
                "/payments",
                json={"order_ref": "ORD-D2-E2E", "method": "credit", "amount": 12.00,
                      "items": [{"product_id": 1, "name": "Coca-Cola Lata 350ml", "qty": 2, "unit_price": 6.00}]},
                headers={"Authorization": f"Bearer {token_kiosk}"},
            )
        finally:
            random.random = original

    assert r.status_code == 201, r.text  # sucesso pro totem, independente do estorno

    tx_id = r.json()["transaction_id"]
    tx = await _get_tx(tx_id)
    assert tx.status == "cancelled"  # estornado automaticamente logo em seguida


async def test_payment_aprovado_sem_falha_nao_aciona_estorno(client, token_kiosk):
    import main as svc
    with respx.mock:
        respx.get(f"{svc.COMPANY_SVC}/internal/terminals/1").mock(
            return_value=httpx.Response(200, json=_MOCK_TERMINAL_CONFIG)
        )
        respx.patch(f"{_order_url()}/internal/orders/ORD-D2-OK/status").mock(return_value=httpx.Response(200))
        respx.get(f"{svc.COMPANY_SVC}/internal/companies/1/fiscal-credentials").mock(
            return_value=httpx.Response(200, json={"ativo": False})
        )
        respx.get(f"{_order_url()}/internal/orders/ORD-D2-OK").mock(
            return_value=httpx.Response(200, json={**_ORDER_BODY, "order_ref": "ORD-D2-OK"})
        )
        respx.get(f"{_catalog_url()}/internal/products/1/fiscal").mock(
            return_value=httpx.Response(200, json={"ncm": "22021000", "cfop": "5102", "cest": None})
        )
        respx.post(f"{_catalog_url()}/internal/stock/decrement").mock(
            return_value=httpx.Response(200, json={"processed": 1, "skipped": 0})
        )

        import random
        original = random.random
        random.random = lambda: 0.01
        try:
            r = await client.post(
                "/payments",
                json={"order_ref": "ORD-D2-OK", "method": "credit", "amount": 12.00,
                      "items": [{"product_id": 1, "name": "Coca-Cola Lata 350ml", "qty": 2, "unit_price": 6.00}]},
                headers={"Authorization": f"Bearer {token_kiosk}"},
            )
        finally:
            random.random = original

    assert r.status_code == 201, r.text
    tx_id = r.json()["transaction_id"]
    tx = await _get_tx(tx_id)
    assert tx.status == "approved"  # nunca estornado
