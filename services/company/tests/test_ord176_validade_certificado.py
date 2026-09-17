"""ORD-176: monitoramento de validade do certificado digital A1. Cobre os
cenários Gherkin do QA Explorer (docs/stories/ORD-176-monitoramento-validade-certificado.md):
job diário dispara e-mail nos marcos 30/15/7/1 dia(s), nunca duplica no
mesmo marco, cai no owner sem contato técnico, ignora empresa com módulo
inativo, marca "vencido" (marco 0), indicador na aba Fiscal e na listagem
de empresas, e o reset do controle de alerta quando o certificado é
renovado (achado desta sessão: resolvido no mesmo commit, não é dependência
cruzada com a ORD-170).
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


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _notification_url(svc) -> str:
    return f"{svc.NOTIFICATION_SERVICE_URL}/internal/send-certificate-expiry-alert"


async def _seed_company_com_certificado(
    company_id: int = 1, *, ativo: bool = True, dias_ate_vencer: int = 30,
    ultimo_alerta: int | None = None, com_contato_tecnico: bool = True,
) -> None:
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        db.add(svc.Company(
            id=company_id, name="Burger House", pin_hash="x" * 60, state="SP",
        ))
        db.add(svc.CompanyFiscalConfig(
            company_id=company_id, ativo=ativo, ambiente="homologacao",
            certificado_valido_ate=datetime.utcnow() + timedelta(days=dias_ate_vencer),
            certificado_ultimo_alerta_dias=ultimo_alerta,
        ))
        if com_contato_tecnico:
            db.add(svc.CompanyContact(
                company_id=company_id, contact_type="tecnico",
                name_enc=svc.encrypt_field("Fulano TI"),
                email_enc=svc.encrypt_field("tecnico@burgerhouse.com"),
            ))
        else:
            db.add(svc.User(
                id=1, company_id=company_id, name="Dono", email="owner@burgerhouse.com",
                role="owner", active=True, password_hash="x",
            ))
        await db.commit()


async def _get_cfg(company_id: int = 1):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        result = await db.execute(select(svc.CompanyFiscalConfig).filter_by(company_id=company_id))
        return result.scalars().first()


# ── Happy path — marco de 30 dias ────────────────────────────────────────────

async def test_alerta_disparado_ao_cruzar_marco_de_30_dias(client):
    import main as svc
    await _seed_company_com_certificado(dias_ate_vencer=30)
    with respx.mock:
        route = respx.post(_notification_url(svc)).mock(return_value=httpx.Response(200, json={"sent": True}))
        await svc.check_certificate_expirations()
        assert route.call_count == 1
        body = route.calls[0].request.content
        assert b"tecnico@burgerhouse.com" in body
        assert b"Burger House" in body

    cfg = await _get_cfg()
    assert cfg.certificado_ultimo_alerta_dias == 30


async def test_alerta_nao_duplica_no_mesmo_marco(client):
    import main as svc
    await _seed_company_com_certificado(dias_ate_vencer=29, ultimo_alerta=30)
    with respx.mock:
        route = respx.post(_notification_url(svc)).mock(return_value=httpx.Response(200, json={"sent": True}))
        await svc.check_certificate_expirations()
        assert route.call_count == 0


async def test_alerta_dispara_de_novo_ao_cruzar_marco_mais_apertado(client):
    """29 dias restantes com marco 30 já avisado não dispara — mas ao
    avançar pra 15 dias restantes, cruza um marco novo e dispara de novo."""
    import main as svc
    await _seed_company_com_certificado(dias_ate_vencer=15, ultimo_alerta=30)
    with respx.mock:
        route = respx.post(_notification_url(svc)).mock(return_value=httpx.Response(200, json={"sent": True}))
        await svc.check_certificate_expirations()
        assert route.call_count == 1

    cfg = await _get_cfg()
    assert cfg.certificado_ultimo_alerta_dias == 15


# ── Bordas ────────────────────────────────────────────────────────────────────

async def test_sem_contato_tecnico_cai_no_owner(client):
    import main as svc
    await _seed_company_com_certificado(dias_ate_vencer=7, com_contato_tecnico=False)
    with respx.mock:
        route = respx.post(_notification_url(svc)).mock(return_value=httpx.Response(200, json={"sent": True}))
        await svc.check_certificate_expirations()
        assert route.call_count == 1
        assert b"owner@burgerhouse.com" in route.calls[0].request.content


async def test_modulo_fiscal_inativo_nao_gera_alerta(client):
    import main as svc
    await _seed_company_com_certificado(dias_ate_vencer=10, ativo=False)
    with respx.mock:
        route = respx.post(_notification_url(svc)).mock(return_value=httpx.Response(200, json={"sent": True}))
        await svc.check_certificate_expirations()
        assert route.call_count == 0


async def test_certificado_ja_vencido_dispara_alerta_marco_zero(client):
    import main as svc
    await _seed_company_com_certificado(dias_ate_vencer=-2)
    with respx.mock:
        route = respx.post(_notification_url(svc)).mock(return_value=httpx.Response(200, json={"sent": True}))
        await svc.check_certificate_expirations()
        assert route.call_count == 1
        body = route.calls[0].request.content
        assert b'"dias_restantes": -2' in body

    cfg = await _get_cfg()
    assert cfg.certificado_ultimo_alerta_dias == 0


async def test_certificado_vence_hoje_conta_como_marco_zero(client):
    """dias_restantes=0 (vence hoje, ainda não passou) é marco 0 (vencido),
    não marco 1 — achado ao corrigir a ordem de checagem dos thresholds:
    iterar em ordem crescente evita que 0<=1 seja lido como "marco 1"."""
    import main as svc
    await _seed_company_com_certificado(dias_ate_vencer=0)
    with respx.mock:
        route = respx.post(_notification_url(svc)).mock(return_value=httpx.Response(200, json={"sent": True}))
        await svc.check_certificate_expirations()
        assert route.call_count == 1
        assert b'"dias_restantes": 0' in route.calls[0].request.content

    cfg = await _get_cfg()
    assert cfg.certificado_ultimo_alerta_dias == 0


async def test_certificado_vencido_ja_avisado_nao_duplica(client):
    import main as svc
    await _seed_company_com_certificado(dias_ate_vencer=-5, ultimo_alerta=0)
    with respx.mock:
        route = respx.post(_notification_url(svc)).mock(return_value=httpx.Response(200, json={"sent": True}))
        await svc.check_certificate_expirations()
        assert route.call_count == 0


async def test_sem_validade_conhecida_e_ignorado(client):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        db.add(svc.Company(id=1, name="Burger House", pin_hash="x" * 60, state="SP"))
        db.add(svc.CompanyFiscalConfig(company_id=1, ativo=True, ambiente="homologacao"))
        await db.commit()
    with respx.mock:
        route = respx.post(_notification_url(svc))
        await svc.check_certificate_expirations()
        assert route.call_count == 0


# ── Visibilidade pro time Ordin ──────────────────────────────────────────────

async def test_aba_fiscal_mostra_validade_e_dias_restantes(client, token_superadmin):
    await _seed_company_com_certificado(dias_ate_vencer=20)
    r = await client.get("/companies/1/fiscal-config", headers=auth(token_superadmin))
    assert r.status_code == 200
    data = r.json()
    assert data["certificado_valido_ate"] is not None
    assert data["certificado_dias_restantes"] == 20


async def test_listagem_de_empresas_sinaliza_certificado_vencendo(client, token_superadmin):
    await _seed_company_com_certificado(company_id=1, dias_ate_vencer=10)
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        db.add(svc.Company(id=2, name="Pasta & Co", pin_hash="y" * 60, state="SP"))
        db.add(svc.CompanyFiscalConfig(company_id=2, ativo=True, ambiente="homologacao",
                                        certificado_valido_ate=datetime.utcnow() + timedelta(days=200)))
        await db.commit()

    r = await client.get("/companies", headers=auth(token_superadmin))
    assert r.status_code == 200
    by_id = {c["id"]: c for c in r.json()["companies"]}
    assert by_id[1]["certificado_dias_restantes"] == 10
    assert by_id[2]["certificado_dias_restantes"] == 200


# ── Reset do controle de alerta ao renovar o certificado ────────────────────

async def test_reenvio_de_cadastro_reseta_ultimo_alerta(client, token_superadmin):
    import main as svc
    await _seed_company_com_certificado(dias_ate_vencer=5, ultimo_alerta=7)
    async with svc.AsyncSessionLocal() as db:
        co = await db.get(svc.Company, 1)
        co.legal_name = "Burger House Ltda"
        co.state_registration = "123456"
        co.tax_regime = "simples_nacional"
        co.street = "Rua X"
        co.document = "12345678000123"
        cfg = (await db.execute(select(svc.CompanyFiscalConfig).filter_by(company_id=1))).scalars().first()
        cfg.certificado_arquivo_enc = svc.encrypt_field("CERT_BASE64")
        cfg.csc_producao_enc = svc.encrypt_field("CSC_PROD")
        cfg.csc_homologacao_enc = svc.encrypt_field("CSC_HOMOLOG")
        await db.commit()

    with respx.mock:
        respx.post(svc.FOCUS_NFE_EMPRESAS_URL).mock(return_value=httpx.Response(200, json={
            "id": 1, "client_app_id": 1,
            "token_producao": "TP", "token_homologacao": "TH",
            "certificado_valido_de": "2026-01-01T00:00:00",
            "certificado_valido_ate": (datetime.utcnow() + timedelta(days=365)).isoformat(),
        }))
        r = await client.post(
            "/companies/1/fiscal-config/focus-nfe-onboarding", headers=auth(token_superadmin),
        )
        assert r.status_code == 200

    cfg = await _get_cfg()
    assert cfg.certificado_ultimo_alerta_dias is None
