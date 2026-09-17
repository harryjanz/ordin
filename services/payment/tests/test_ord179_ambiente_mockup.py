"""ORD-179: ambiente "mockup" pra visualizar a impressão da NFC-e (ORD-172)
sem depender de certificado A1 real. Só fabrica dado com FISCAL_MOCKUP_ENABLED
ligado (env var de plataforma, nunca por empresa) — sem isso, cai no mesmo
caminho de homologação (nunca fabrica).
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


_CREDS_MOCKUP = {
    "ativo": True,
    "ambiente": "mockup",
    "cnpj": "12345678000123",
    "legal_name": "Burger House Ltda",
    "endereco": {"logradouro": "Rua X", "numero": "1", "complemento": None, "bairro": "Centro", "municipio": "São Paulo", "uf": "SP", "cep": "01310100"},
    "tax_regime": "simples_nacional",
    "token": "TOKEN_QUALQUER",
    "csc": "CSC_QUALQUER",
    "id_token_csc": "1",
}


async def test_mockup_com_flag_ligada_fabrica_sem_chamar_rede(client, monkeypatch):
    import main as svc
    monkeypatch.setattr(svc, "FISCAL_MOCKUP_ENABLED", True)

    with respx.mock:
        respx.get(f"{_company_url()}/internal/companies/1/fiscal-credentials").mock(
            return_value=httpx.Response(200, json=_CREDS_MOCKUP)
        )
        # Nenhuma rota de order-service/catalog-service/Focus NFe mockada —
        # se o código tentar qualquer uma dessas, respx recusa e o teste falha.
        await svc.emit_nfce_if_active(1, "ORD-MOCKUP01", "credit", 26.00)

    async with svc.AsyncSessionLocal() as db:
        doc = (await db.execute(select(svc.FiscalDocument).filter_by(order_ref="ORD-MOCKUP01"))).scalars().first()
        assert doc is not None
        assert doc.status == "autorizada"
        assert doc.ambiente == "mockup"
        assert doc.chave_nfe is not None
        assert len(doc.chave_nfe) == 44
        assert doc.chave_nfe.isdigit()
        assert doc.qrcode_url == f"https://mockup.ordin.local/qrcode/{doc.chave_nfe}"


async def test_mockup_sem_flag_ligada_nao_fabrica_tenta_caminho_real(client, monkeypatch):
    import main as svc
    monkeypatch.setattr(svc, "FISCAL_MOCKUP_ENABLED", False)

    with respx.mock:
        respx.get(f"{_company_url()}/internal/companies/1/fiscal-credentials").mock(
            return_value=httpx.Response(200, json=_CREDS_MOCKUP)
        )
        order_route = respx.get(f"{svc.ORDER_SVC}/internal/orders/ORD-MOCKUP02")
        await svc.emit_nfce_if_active(1, "ORD-MOCKUP02", "credit", 26.00)
        # Sem a flag, cai no fluxo normal — tenta buscar o pedido de verdade
        # (aqui não mockado de propósito, então a chamada falha e cai no
        # except best-effort — o ponto do teste é confirmar que NÃO fabricou).
        assert order_route.call_count == 1

    async with svc.AsyncSessionLocal() as db:
        docs = (await db.execute(select(svc.FiscalDocument).filter_by(order_ref="ORD-MOCKUP02"))).scalars().all()
        assert docs == []


def test_build_mockup_chave_e_deterministico_e_tem_44_digitos():
    import main as svc
    chave1 = svc._build_mockup_chave("ORD-ABC123")
    chave2 = svc._build_mockup_chave("ORD-ABC123")
    chave3 = svc._build_mockup_chave("ORD-XYZ999")
    assert chave1 == chave2
    assert chave1 != chave3
    assert len(chave1) == 44
    assert chave1.isdigit()
