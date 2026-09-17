"""ORD-175: retry e reconciliação de notas fiscais pendentes. Cobre os
cenários Gherkin do QA Explorer (docs/stories/ORD-175-contingencia-reconciliacao.md):
retry bem-sucedido dentro da janela, falha continuada vira "falha_definitiva"
após 24h, pedido cancelado/reembolsado ou módulo desativado no meio tempo
não gera retry, e falha continuada dentro da janela permanece "pendente".
Cobre também o caminho de segurança adicionado nesta implementação (não
estava no Tech Explorer original): consulta GET /nfce/{ref} ANTES de
qualquer reenvio — nunca um POST /nfce direto num retry, por não haver
confirmação de idempotência desse endpoint na Focus NFe.
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


def _catalog_url():
    import main as svc
    return svc.CATALOG_SVC


_CREDS_ATIVO_HOMOLOG = {
    "ativo": True,
    "ambiente": "homologacao",
    "cnpj": "12345678000123",
    "tax_regime": "simples_nacional",
    "token": "TOKEN_HOMOLOG",
}

_ORDER_BODY = {
    "order_ref": "ORD-RECON01",
    "company_id": 1,
    "total": 26.00,
    "cpf": None,
    "items": [{"product_id": 1, "product_name": "X-Burger", "unit_price": 26.00, "quantity": 1}],
}


async def _make_tx(order_ref: str, status: str = "approved") -> None:
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        db.add(svc.Transaction(
            company_id=1, order_ref=order_ref, terminal_id=1, method="credit",
            amount=26.00, status=status, provider="mock", environment="sandbox",
            created_at=datetime.utcnow(),
        ))
        await db.commit()


async def _make_fiscal_doc(order_ref: str, criado_em: datetime, status: str = "pendente", ambiente: str = "homologacao") -> None:
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        db.add(svc.FiscalDocument(
            order_ref=order_ref, company_id=1, status=status, ambiente=ambiente,
            criado_em=criado_em, erro_mensagem="timeout na Focus NFe",
        ))
        await db.commit()


async def _get_doc(order_ref: str):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        result = await db.execute(select(svc.FiscalDocument).filter_by(order_ref=order_ref))
        return result.scalars().first()


def _catalog_route():
    return respx.get(f"{_catalog_url()}/internal/products/1/fiscal").mock(
        return_value=httpx.Response(200, json={"ncm": "19059090", "cfop": "5101", "cest": None})
    )


# ── Retry bem-sucedido dentro da janela ──────────────────────────────────────

async def test_retry_bem_sucedido_dentro_da_janela(client):
    import main as svc
    order_ref = "ORD-RECON01"
    await _make_tx(order_ref)
    await _make_fiscal_doc(order_ref, datetime.utcnow() - timedelta(minutes=10))

    with respx.mock:
        respx.get(f"{_company_url()}/internal/companies/1/fiscal-credentials").mock(
            return_value=httpx.Response(200, json=_CREDS_ATIVO_HOMOLOG)
        )
        consult_route = respx.get("https://homologacao.focusnfe.com.br/v2/nfce/ORD-RECON01").mock(
            return_value=httpx.Response(404)  # ainda não emitida do lado deles
        )
        respx.get(f"{_order_url()}/internal/orders/{order_ref}").mock(
            return_value=httpx.Response(200, json=_ORDER_BODY)
        )
        _catalog_route()
        post_route = respx.post("https://homologacao.focusnfe.com.br/v2/nfce").mock(
            return_value=httpx.Response(200, json={
                "status": "autorizado", "chave_nfe": "35260912345678000123650010000000011234567890",
                "caminho_danfe": "https://focusnfe.com.br/danfe/x.html", "qrcode_url": "https://focusnfe.com.br/qrcode/x",
            })
        )

        await svc.reconcile_pending_fiscal_documents()

        assert consult_route.call_count == 1
        assert post_route.call_count == 1

    doc = await _get_doc(order_ref)
    assert doc.status == "autorizada"
    assert doc.chave_nfe == "35260912345678000123650010000000011234567890"


# ── Consulta prévia evita reenvio (segurança de idempotência) ───────────────

async def test_consulta_previa_ja_autorizada_nao_reemite(client):
    import main as svc
    order_ref = "ORD-RECON01"
    await _make_tx(order_ref)
    await _make_fiscal_doc(order_ref, datetime.utcnow() - timedelta(minutes=10))

    with respx.mock:
        respx.get(f"{_company_url()}/internal/companies/1/fiscal-credentials").mock(
            return_value=httpx.Response(200, json=_CREDS_ATIVO_HOMOLOG)
        )
        respx.get("https://homologacao.focusnfe.com.br/v2/nfce/ORD-RECON01").mock(
            return_value=httpx.Response(200, json={
                "status": "autorizado", "chave_nfe": "35260912345678000123650010000000011234567890",
                "caminho_danfe": "https://focusnfe.com.br/danfe/x.html", "qrcode_url": "https://focusnfe.com.br/qrcode/x",
            })
        )
        post_route = respx.post("https://homologacao.focusnfe.com.br/v2/nfce")

        await svc.reconcile_pending_fiscal_documents()

        assert post_route.call_count == 0  # nunca reemite quando a consulta já confirma autorizada

    doc = await _get_doc(order_ref)
    assert doc.status == "autorizada"
    assert doc.chave_nfe == "35260912345678000123650010000000011234567890"


# ── Falha continuada além de 24h vira falha_definitiva ───────────────────────

async def test_falha_continuada_alem_de_24h_vira_falha_definitiva(client):
    import main as svc
    order_ref = "ORD-RECON01"
    await _make_tx(order_ref)
    await _make_fiscal_doc(order_ref, datetime.utcnow() - timedelta(hours=25))

    with respx.mock:
        creds_route = respx.get(f"{_company_url()}/internal/companies/1/fiscal-credentials")
        await svc.reconcile_pending_fiscal_documents()
        assert creds_route.call_count == 0  # expira antes de qualquer tentativa

    doc = await _get_doc(order_ref)
    assert doc.status == "falha_definitiva"


# ── Pedido cancelado/reembolsado no meio tempo não gera retry ───────────────

async def test_pedido_cancelado_nao_gera_retry(client):
    import main as svc
    order_ref = "ORD-RECON01"
    await _make_tx(order_ref, status="cancelled")
    await _make_fiscal_doc(order_ref, datetime.utcnow() - timedelta(minutes=10))

    with respx.mock:
        creds_route = respx.get(f"{_company_url()}/internal/companies/1/fiscal-credentials")
        await svc.reconcile_pending_fiscal_documents()
        assert creds_route.call_count == 0

    doc = await _get_doc(order_ref)
    assert doc.status == "pendente"


async def test_pedido_reembolsado_nao_gera_retry(client):
    import main as svc
    order_ref = "ORD-RECON01"
    await _make_tx(order_ref, status="refunded")
    await _make_fiscal_doc(order_ref, datetime.utcnow() - timedelta(minutes=10))

    with respx.mock:
        creds_route = respx.get(f"{_company_url()}/internal/companies/1/fiscal-credentials")
        await svc.reconcile_pending_fiscal_documents()
        assert creds_route.call_count == 0

    doc = await _get_doc(order_ref)
    assert doc.status == "pendente"


# ── Módulo fiscal desativado no meio tempo não gera retry ───────────────────

async def test_modulo_desativado_nao_gera_retry(client):
    import main as svc
    order_ref = "ORD-RECON01"
    await _make_tx(order_ref)
    await _make_fiscal_doc(order_ref, datetime.utcnow() - timedelta(minutes=10))

    with respx.mock:
        respx.get(f"{_company_url()}/internal/companies/1/fiscal-credentials").mock(
            return_value=httpx.Response(200, json={"ativo": False})
        )
        consult_route = respx.get("https://homologacao.focusnfe.com.br/v2/nfce/ORD-RECON01")
        await svc.reconcile_pending_fiscal_documents()
        assert consult_route.call_count == 0

    doc = await _get_doc(order_ref)
    assert doc.status == "pendente"


# ── Retry continua falhando dentro da janela: permanece pendente ────────────

async def test_retry_continua_falhando_permanece_pendente(client):
    import main as svc
    order_ref = "ORD-RECON01"
    await _make_tx(order_ref)
    await _make_fiscal_doc(order_ref, datetime.utcnow() - timedelta(hours=2))

    with respx.mock:
        respx.get(f"{_company_url()}/internal/companies/1/fiscal-credentials").mock(
            return_value=httpx.Response(200, json=_CREDS_ATIVO_HOMOLOG)
        )
        respx.get("https://homologacao.focusnfe.com.br/v2/nfce/ORD-RECON01").mock(return_value=httpx.Response(404))
        respx.get(f"{_order_url()}/internal/orders/{order_ref}").mock(return_value=httpx.Response(200, json=_ORDER_BODY))
        _catalog_route()
        respx.post("https://homologacao.focusnfe.com.br/v2/nfce").mock(
            return_value=httpx.Response(422, json={"codigo": "erro_validacao", "mensagem": "SEFAZ indisponível"})
        )

        await svc.reconcile_pending_fiscal_documents()

    doc = await _get_doc(order_ref)
    assert doc.status == "pendente"  # continua tentando nas próximas execuções, só expira depois de 24h
    assert "erro_validacao" in doc.erro_mensagem
