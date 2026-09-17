"""ORD-173: cancelamento fiscal integrado ao cancelamento/reembolso de
pagamento. Cobre os cenários Gherkin do QA Explorer
(docs/stories/ORD-173-cancelamento-fiscal.md): dentro da janela de 30min
cancela a nota, fora da janela ou sem nota não tenta nada, justificativa
curta é complementada, e falha na Focus NFe nunca impede o
cancelamento/reembolso do pagamento em si (best-effort, mesmo padrão do
cancelamento PayGo). Toda chamada externa é mockada via respx.
"""
import os
import sys
from datetime import datetime, timedelta

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


_CREDS_ATIVO_HOMOLOG = {
    "ativo": True,
    "ambiente": "homologacao",
    "cnpj": "12345678000123",
    "tax_regime": "simples_nacional",
    "token": "TOKEN_HOMOLOG",
}

_MP_TERMINAL_CONFIG = {
    "paygo_terminal_id": None,
    "mp_device_id": "PAX_A910__SMARTPOS123",
    "payment_provider": "mercadopago",
    "environment": "sandbox",
    "config": {"api_key": "TEST-token", "api_secret": None, "extra_config": {}},
}


async def _make_tx(order_ref, provider="mock", provider_transaction_id=None, company_id=1):
    import main as svc
    tx = svc.Transaction(
        company_id=company_id, order_ref=order_ref, terminal_id=1, method="credit",
        amount=26.00, status="approved", provider=provider, environment="sandbox",
        provider_transaction_id=provider_transaction_id, created_at=datetime.utcnow(),
    )
    async with svc.AsyncSessionLocal() as db:
        db.add(tx)
        await db.commit()
        await db.refresh(tx)
    return tx.id


async def _make_fiscal_doc(order_ref, criado_em, status="autorizada", company_id=1, ambiente="homologacao"):
    import main as svc
    doc = svc.FiscalDocument(
        order_ref=order_ref, company_id=company_id, status=status, ambiente=ambiente,
        chave_nfe="35260912345678000123650010000000011234567890",
        criado_em=criado_em,
    )
    async with svc.AsyncSessionLocal() as db:
        db.add(doc)
        await db.commit()
        await db.refresh(doc)
    return doc.id


async def _get_fiscal_doc(order_ref):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        result = await db.execute(select(svc.FiscalDocument).filter_by(order_ref=order_ref))
        return result.scalars().first()


def _mock_delete_route(order_ref, **kwargs):
    route = respx.delete(f"https://homologacao.focusnfe.com.br/v2/nfce/{order_ref}")
    if kwargs:
        route = route.mock(**kwargs)
    return route


# ── Dentro da janela cancela a nota ──────────────────────────────────────────

async def test_cancelamento_dentro_da_janela_cancela_a_nota(client, token_owner):
    order_ref = f"F173C{os.urandom(3).hex()}"
    tx_id = await _make_tx(order_ref)
    await _make_fiscal_doc(order_ref, datetime.utcnow() - timedelta(minutes=10))
    with respx.mock:
        respx.get(f"{_company_url()}/internal/companies/1/fiscal-credentials").mock(
            return_value=httpx.Response(200, json=_CREDS_ATIVO_HOMOLOG)
        )
        respx.patch(f"{_order_url()}/internal/orders/{order_ref}/status").mock(return_value=httpx.Response(200))
        delete_route = _mock_delete_route(order_ref, return_value=httpx.Response(200, json={"status": "cancelado"}))

        r = await client.post(
            f"/payments/{tx_id}/cancel",
            json={"reason": "Pedido cancelado pelo cliente"},
            headers={"Authorization": f"Bearer {token_owner}"},
        )
        assert r.status_code == 200
        assert delete_route.call_count == 1
        sent = delete_route.calls[0].request.content
        assert b"Pedido cancelado pelo cliente" in sent

    doc = await _get_fiscal_doc(order_ref)
    assert doc.status == "cancelada"


# ── Fora da janela não tenta cancelar ────────────────────────────────────────

async def test_reembolso_fora_da_janela_fiscal_nao_tenta_cancelar_a_nota(client, token_owner):
    order_ref = f"F173F{os.urandom(3).hex()}"
    tx_id = await _make_tx(order_ref, provider="mercadopago", provider_transaction_id="ORDTEST173F")
    await _make_fiscal_doc(order_ref, datetime.utcnow() - timedelta(days=45))
    with respx.mock:
        respx.get(f"{_company_url()}/internal/terminals/1").mock(return_value=httpx.Response(200, json=_MP_TERMINAL_CONFIG))
        respx.post("https://api.mercadopago.com/v1/orders/ORDTEST173F/refund").mock(
            return_value=httpx.Response(201, json={"id": "ORDTEST173F", "status": "refunded"})
        )
        creds_route = respx.get(f"{_company_url()}/internal/companies/1/fiscal-credentials")
        delete_route = _mock_delete_route(order_ref)

        r = await client.post(
            f"/payments/{tx_id}/refund",
            json={"reason": "Contestação do cliente"},
            headers={"Authorization": f"Bearer {token_owner}"},
        )
        assert r.status_code == 200
        assert delete_route.call_count == 0
        assert creds_route.call_count == 0  # nem chega a buscar credenciais — corta antes, pela janela

    doc = await _get_fiscal_doc(order_ref)
    assert doc.status == "autorizada"


# ── Sem nota fiscal associada ────────────────────────────────────────────────

async def test_cancelamento_sem_nota_fiscal_associada(client, token_owner):
    order_ref = f"F173S{os.urandom(3).hex()}"
    tx_id = await _make_tx(order_ref)
    with respx.mock:
        respx.patch(f"{_order_url()}/internal/orders/{order_ref}/status").mock(return_value=httpx.Response(200))
        creds_route = respx.get(f"{_company_url()}/internal/companies/1/fiscal-credentials")
        delete_route = _mock_delete_route(order_ref)

        r = await client.post(
            f"/payments/{tx_id}/cancel",
            json={"reason": "Pedido cancelado pelo cliente"},
            headers={"Authorization": f"Bearer {token_owner}"},
        )
        assert r.status_code == 200
        assert delete_route.call_count == 0
        assert creds_route.call_count == 0


# ── Justificativa curta é complementada ──────────────────────────────────────

async def test_justificativa_curta_e_complementada(client, token_owner):
    order_ref = f"F173J{os.urandom(3).hex()}"
    tx_id = await _make_tx(order_ref)
    await _make_fiscal_doc(order_ref, datetime.utcnow() - timedelta(minutes=5))
    with respx.mock:
        respx.get(f"{_company_url()}/internal/companies/1/fiscal-credentials").mock(
            return_value=httpx.Response(200, json=_CREDS_ATIVO_HOMOLOG)
        )
        respx.patch(f"{_order_url()}/internal/orders/{order_ref}/status").mock(return_value=httpx.Response(200))
        delete_route = _mock_delete_route(order_ref, return_value=httpx.Response(200, json={"status": "cancelado"}))

        r = await client.post(
            f"/payments/{tx_id}/cancel",
            json={"reason": "erro"},
            headers={"Authorization": f"Bearer {token_owner}"},
        )
        assert r.status_code == 200
        sent = delete_route.calls[0].request.content
        import json as _json
        justificativa = _json.loads(sent)["justificativa"]
        assert len(justificativa) >= 15
        assert justificativa.startswith("Cancelamento de pagamento - erro")


# ── Falha na Focus NFe não impede o cancelamento do pagamento ───────────────

async def test_falha_na_focus_nfe_nao_impede_o_cancelamento_do_pagamento(client, token_owner):
    order_ref = f"F173E{os.urandom(3).hex()}"
    tx_id = await _make_tx(order_ref)
    await _make_fiscal_doc(order_ref, datetime.utcnow() - timedelta(minutes=10))
    with respx.mock:
        respx.get(f"{_company_url()}/internal/companies/1/fiscal-credentials").mock(
            return_value=httpx.Response(200, json=_CREDS_ATIVO_HOMOLOG)
        )
        respx.patch(f"{_order_url()}/internal/orders/{order_ref}/status").mock(return_value=httpx.Response(200))
        _mock_delete_route(order_ref, side_effect=httpx.TimeoutException("timeout"))

        r = await client.post(
            f"/payments/{tx_id}/cancel",
            json={"reason": "Pedido cancelado pelo cliente"},
            headers={"Authorization": f"Bearer {token_owner}"},
        )
        assert r.status_code == 200

    doc = await _get_fiscal_doc(order_ref)
    assert doc.status == "autorizada"  # não sabemos se cancelou do lado deles — fica pendente de reconciliação
