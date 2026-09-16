"""ORD-171: emissão de NFC-e no fluxo de pagamento. Cobre os cenários Gherkin
do QA Explorer (docs/stories/ORD-171-emissao-nfce-pagamento.md): módulo
inativo não chama nada, emissão com sucesso grava chave/DANFE/QR, falha e
timeout nunca bloqueiam (viram "pendente"), e os 4 casos de
compute_icms_situacao_tributaria. Toda chamada externa (company-service,
order-service, catalog-service, Focus NFe) é mockada via respx.
"""
import os
import sys

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


_ORDER_BODY = {
    "order_ref": "ORD-NFCE01",
    "company_id": 1,
    "total": 26.00,
    "items": [{"product_id": 1, "product_name": "X-Burger", "unit_price": 26.00, "quantity": 1}],
}

_CREDS_ATIVO_HOMOLOG = {
    "ativo": True,
    "ambiente": "homologacao",
    "cnpj": "12345678000123",
    "legal_name": "Burger House Ltda",
    "endereco": {"logradouro": "Rua X", "numero": "1", "complemento": None, "bairro": "Centro", "municipio": "São Paulo", "uf": "SP", "cep": "01310100"},
    "tax_regime": "simples_nacional",
    "token": "TOKEN_HOMOLOG",
    "csc": "CSC123",
    "id_token_csc": "1",
}

_FOCUS_NFE_SUCESSO = {
    "status": "autorizado",
    "chave_nfe": "35260912345678000123650010000000011234567890",
    "caminho_danfe": "https://focusnfe.com.br/danfe/x.html",
    "qrcode_url": "https://focusnfe.com.br/qrcode/x",
}


# ── compute_icms_situacao_tributaria — 4 casos ───────────────────────────────

def test_csosn_simples_nacional_sem_cest():
    import main as svc
    assert svc.compute_icms_situacao_tributaria("simples_nacional", False) == "102"


def test_csosn_simples_nacional_com_cest():
    import main as svc
    assert svc.compute_icms_situacao_tributaria("simples_nacional", True) == "500"


def test_cst_lucro_presumido_sem_cest():
    import main as svc
    assert svc.compute_icms_situacao_tributaria("lucro_presumido", False) == "000"


def test_cst_lucro_real_com_cest():
    import main as svc
    assert svc.compute_icms_situacao_tributaria("lucro_real", True) == "060"


def test_mei_usa_csosn_como_simples():
    import main as svc
    assert svc.compute_icms_situacao_tributaria("mei", False) == "102"


# ── emit_nfce_if_active — módulo inativo ─────────────────────────────────────

async def test_modulo_inativo_nao_chama_order_nem_catalog_nem_focus_nfe(client):
    import main as svc
    with respx.mock:
        creds_route = respx.get(f"{_company_url()}/internal/companies/1/fiscal-credentials").mock(
            return_value=httpx.Response(200, json={"ativo": False})
        )
        order_route = respx.get(f"{_order_url()}/internal/orders/ORD-NFCE01")
        nfce_route = respx.post("https://homologacao.focusnfe.com.br/v2/nfce")

        await svc.emit_nfce_if_active(1, "ORD-NFCE01", "credit", 26.00)

        assert creds_route.call_count == 1
        assert order_route.call_count == 0
        assert nfce_route.call_count == 0

    async with svc.AsyncSessionLocal() as db:
        docs = (await db.execute(select(svc.FiscalDocument))).scalars().all()
        assert docs == []


# ── emit_nfce_if_active — sucesso ────────────────────────────────────────────

async def test_emissao_com_sucesso_grava_chave_danfe_qrcode(client):
    import main as svc
    with respx.mock:
        respx.get(f"{_company_url()}/internal/companies/1/fiscal-credentials").mock(
            return_value=httpx.Response(200, json=_CREDS_ATIVO_HOMOLOG)
        )
        respx.get(f"{_order_url()}/internal/orders/ORD-NFCE01").mock(
            return_value=httpx.Response(200, json=_ORDER_BODY)
        )
        respx.get(f"{_catalog_url()}/internal/products/1/fiscal").mock(
            return_value=httpx.Response(200, json={"ncm": "19059090", "cfop": "5101", "cest": None})
        )
        nfce_route = respx.post("https://homologacao.focusnfe.com.br/v2/nfce").mock(
            return_value=httpx.Response(200, json=_FOCUS_NFE_SUCESSO)
        )

        await svc.emit_nfce_if_active(1, "ORD-NFCE01", "credit", 26.00)

        assert nfce_route.call_count == 1
        sent_payload = _json_body(nfce_route.calls[0].request)
        assert sent_payload["items"][0]["codigo_ncm"] == "19059090"
        assert sent_payload["items"][0]["icms_situacao_tributaria"] == "102"  # simples_nacional, sem CEST
        assert sent_payload["formas_pagamento"][0]["forma_pagamento"] == "03"  # credit

    async with svc.AsyncSessionLocal() as db:
        doc = (await db.execute(select(svc.FiscalDocument).filter_by(order_ref="ORD-NFCE01"))).scalars().first()
        assert doc.status == "autorizada"
        assert doc.chave_nfe == _FOCUS_NFE_SUCESSO["chave_nfe"]
        assert doc.caminho_danfe == _FOCUS_NFE_SUCESSO["caminho_danfe"]
        assert doc.qrcode_url == _FOCUS_NFE_SUCESSO["qrcode_url"]
        assert doc.ambiente == "homologacao"


def _json_body(request) -> dict:
    import json
    return json.loads(request.content)


# ── emit_nfce_if_active — falha/timeout nunca bloqueiam ──────────────────────

async def test_erro_da_focus_nfe_vira_pendente(client):
    import main as svc
    with respx.mock:
        respx.get(f"{_company_url()}/internal/companies/1/fiscal-credentials").mock(
            return_value=httpx.Response(200, json=_CREDS_ATIVO_HOMOLOG)
        )
        respx.get(f"{_order_url()}/internal/orders/ORD-NFCE02").mock(
            return_value=httpx.Response(200, json={**_ORDER_BODY, "order_ref": "ORD-NFCE02"})
        )
        respx.get(f"{_catalog_url()}/internal/products/1/fiscal").mock(
            return_value=httpx.Response(200, json={"ncm": None, "cfop": None, "cest": None})
        )
        respx.post("https://homologacao.focusnfe.com.br/v2/nfce").mock(
            return_value=httpx.Response(422, json={"codigo": "erro_validacao", "mensagem": "NCM inválido"})
        )

        await svc.emit_nfce_if_active(1, "ORD-NFCE02", "credit", 26.00)

    async with svc.AsyncSessionLocal() as db:
        doc = (await db.execute(select(svc.FiscalDocument).filter_by(order_ref="ORD-NFCE02"))).scalars().first()
        assert doc.status == "pendente"
        assert doc.chave_nfe is None
        assert "erro_validacao" in doc.erro_mensagem


async def test_timeout_na_focus_nfe_vira_pendente_sem_travar(client):
    import main as svc
    with respx.mock:
        respx.get(f"{_company_url()}/internal/companies/1/fiscal-credentials").mock(
            return_value=httpx.Response(200, json=_CREDS_ATIVO_HOMOLOG)
        )
        respx.get(f"{_order_url()}/internal/orders/ORD-NFCE03").mock(
            return_value=httpx.Response(200, json={**_ORDER_BODY, "order_ref": "ORD-NFCE03"})
        )
        respx.get(f"{_catalog_url()}/internal/products/1/fiscal").mock(
            return_value=httpx.Response(200, json={"ncm": "19059090", "cfop": "5101", "cest": None})
        )
        respx.post("https://homologacao.focusnfe.com.br/v2/nfce").mock(
            side_effect=httpx.TimeoutException("timeout")
        )

        await svc.emit_nfce_if_active(1, "ORD-NFCE03", "credit", 26.00)

    async with svc.AsyncSessionLocal() as db:
        doc = (await db.execute(select(svc.FiscalDocument).filter_by(order_ref="ORD-NFCE03"))).scalars().first()
        assert doc.status == "pendente"
        assert "timeout" in doc.erro_mensagem.lower()


async def test_company_service_indisponivel_nao_propaga_excecao(client):
    """Nenhuma rota mockada pra fiscal-credentials — respx recusa a chamada
    (simula company-service fora do ar). emit_nfce_if_active não deve
    propagar exceção nem travar o chamador."""
    import main as svc
    with respx.mock:
        await svc.emit_nfce_if_active(1, "ORD-NFCE04", "credit", 26.00)

    async with svc.AsyncSessionLocal() as db:
        docs = (await db.execute(select(svc.FiscalDocument))).scalars().all()
        assert docs == []


# ── Ambiente produção usa o token de produção ────────────────────────────────

async def test_ambiente_producao_chama_host_de_producao(client):
    import main as svc
    creds_producao = {**_CREDS_ATIVO_HOMOLOG, "ambiente": "producao", "token": "TOKEN_PRODUCAO"}
    with respx.mock:
        respx.get(f"{_company_url()}/internal/companies/1/fiscal-credentials").mock(
            return_value=httpx.Response(200, json=creds_producao)
        )
        respx.get(f"{_order_url()}/internal/orders/ORD-NFCE05").mock(
            return_value=httpx.Response(200, json={**_ORDER_BODY, "order_ref": "ORD-NFCE05"})
        )
        respx.get(f"{_catalog_url()}/internal/products/1/fiscal").mock(
            return_value=httpx.Response(200, json={"ncm": "19059090", "cfop": "5101", "cest": None})
        )
        producao_route = respx.post("https://api.focusnfe.com.br/v2/nfce").mock(
            return_value=httpx.Response(200, json=_FOCUS_NFE_SUCESSO)
        )
        homolog_route = respx.post("https://homologacao.focusnfe.com.br/v2/nfce")

        await svc.emit_nfce_if_active(1, "ORD-NFCE05", "credit", 26.00)

        assert producao_route.call_count == 1
        assert homolog_route.call_count == 0
        assert producao_route.calls[0].request.headers["Authorization"].startswith("Basic")


# ── Integração via /payments — fluxo completo ────────────────────────────────

async def test_payment_aprovado_dispara_emissao_e_grava_fiscal_document(client, token_kiosk):
    import main as svc
    with respx.mock:
        respx.get(f"{_company_url()}/internal/terminals/1").mock(
            return_value=httpx.Response(200, json={
                "paygo_terminal_id": None, "payment_provider": "mock", "environment": "sandbox", "config": None,
            })
        )
        respx.patch(f"{_order_url()}/internal/orders/ORD-NFCE06/status").mock(return_value=httpx.Response(200))
        respx.get(f"{_company_url()}/internal/companies/1/fiscal-credentials").mock(
            return_value=httpx.Response(200, json=_CREDS_ATIVO_HOMOLOG)
        )
        respx.get(f"{_order_url()}/internal/orders/ORD-NFCE06").mock(
            return_value=httpx.Response(200, json={**_ORDER_BODY, "order_ref": "ORD-NFCE06"})
        )
        respx.get(f"{_catalog_url()}/internal/products/1/fiscal").mock(
            return_value=httpx.Response(200, json={"ncm": "19059090", "cfop": "5101", "cest": None})
        )
        respx.post("https://homologacao.focusnfe.com.br/v2/nfce").mock(
            return_value=httpx.Response(200, json=_FOCUS_NFE_SUCESSO)
        )

        import random
        original = random.random
        random.random = lambda: 0.01
        try:
            r = await client.post(
                "/payments",
                json={"order_ref": "ORD-NFCE06", "method": "credit", "amount": 26.00,
                      "items": [{"product_id": 1, "name": "X-Burger", "qty": 1, "unit_price": 26.00}]},
                headers={"Authorization": f"Bearer {token_kiosk}"},
            )
        finally:
            random.random = original
    assert r.status_code == 201

    async with svc.AsyncSessionLocal() as db:
        doc = (await db.execute(select(svc.FiscalDocument).filter_by(order_ref="ORD-NFCE06"))).scalars().first()
        assert doc is not None
        assert doc.status == "autorizada"
