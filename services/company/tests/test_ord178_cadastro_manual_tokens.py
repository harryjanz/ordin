"""ORD-178: cadastro manual de tokens já existentes na Focus NFe — via
alternativa ao onboarding automatizado da ORD-170 (empresa que já tinha conta
própria na Focus NFe, ou token de teste gerado direto no painel deles).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx
import pytest
import respx
from conftest import make_jwt
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

FOCUS_NFE_URL = "https://api.focusnfe.com.br/v2/empresas"


@pytest.fixture
async def client():
    import main as svc
    test_engine = create_async_engine(os.environ["DB_URL"], echo=False)
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


async def _seed_company_completa(company_id: int) -> None:
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        co = svc.Company(
            id=company_id, name="Burger House", pin_hash="x", state="SP",
            legal_name="Burger House Ltda", document="12345678000123",
            state_registration="1234567", tax_regime="simples_nacional",
            street="Rua Exemplo", address_number="100", neighborhood="Centro",
            city="São Paulo", zip_code="01310100",
        )
        db.add(co)
        cfg = svc.CompanyFiscalConfig(
            company_id=company_id,
            certificado_arquivo_enc=svc.encrypt_field("CERT_BASE64"),
            certificado_senha_enc=svc.encrypt_field("senha123"),
            csc_producao_enc=svc.encrypt_field("CSC_PROD"),
            id_token_producao="1",
            csc_homologacao_enc=svc.encrypt_field("CSC_HOMOLOG"),
            id_token_homologacao="1",
        )
        db.add(cfg)
        await db.commit()


# ── Happy path ────────────────────────────────────────────────────────────────

async def test_cadastrar_os_dois_tokens_manualmente(client, token_superadmin):
    await _seed_company_completa(1)
    r = await client.put("/companies/1/fiscal-config", headers=auth(token_superadmin), json={
        "token_producao_manual": "TOKEN_PROD_MANUAL",
        "token_homologacao_manual": "TOKEN_HOMOLOG_MANUAL",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["focus_nfe_cadastrado"] is True
    assert data["focus_nfe_cadastro_manual"] is True

    import main as svc
    from sqlalchemy import select
    async with svc.AsyncSessionLocal() as db:
        cfg = (await db.execute(select(svc.CompanyFiscalConfig).filter_by(company_id=1))).scalars().first()
        assert svc.decrypt_field(cfg.token_producao_enc) == "TOKEN_PROD_MANUAL"
        assert svc.decrypt_field(cfg.token_homologacao_enc) == "TOKEN_HOMOLOG_MANUAL"


async def test_cadastrar_so_token_homologacao(client, token_superadmin):
    await _seed_company_completa(1)
    r = await client.put("/companies/1/fiscal-config", headers=auth(token_superadmin), json={
        "token_homologacao_manual": "SO_HOMOLOG",
    })
    assert r.status_code == 200
    assert r.json()["focus_nfe_cadastro_manual"] is True

    import main as svc
    from sqlalchemy import select
    async with svc.AsyncSessionLocal() as db:
        cfg = (await db.execute(select(svc.CompanyFiscalConfig).filter_by(company_id=1))).scalars().first()
        assert svc.decrypt_field(cfg.token_homologacao_enc) == "SO_HOMOLOG"
        assert cfg.token_producao_enc is None


async def test_habilita_toggle_ativo_apos_cadastro_manual(client, token_superadmin):
    await _seed_company_completa(1)
    await client.put("/companies/1/fiscal-config", headers=auth(token_superadmin), json={
        "token_homologacao_manual": "TOKEN_HOMOLOG",
    })
    r = await client.put("/companies/1/fiscal-config", headers=auth(token_superadmin), json={"ativo": True})
    assert r.status_code == 200
    assert r.json()["ativo"] is True


# ── Bordas ────────────────────────────────────────────────────────────────────

async def test_nenhum_token_informado_e_rejeitado(client, token_superadmin):
    await _seed_company_completa(1)
    r = await client.put("/companies/1/fiscal-config", headers=auth(token_superadmin), json={
        "token_producao_manual": "",
        "token_homologacao_manual": "   ",
    })
    assert r.status_code == 400


async def test_reenvio_sobrescreve_token_existente(client, token_superadmin):
    await _seed_company_completa(1)
    await client.put("/companies/1/fiscal-config", headers=auth(token_superadmin), json={
        "token_producao_manual": "TOKEN_ANTIGO",
    })
    r = await client.put("/companies/1/fiscal-config", headers=auth(token_superadmin), json={
        "token_producao_manual": "TOKEN_NOVO",
    })
    assert r.status_code == 200

    import main as svc
    from sqlalchemy import select
    async with svc.AsyncSessionLocal() as db:
        cfg = (await db.execute(select(svc.CompanyFiscalConfig).filter_by(company_id=1))).scalars().first()
        assert svc.decrypt_field(cfg.token_producao_enc) == "TOKEN_NOVO"


async def test_cadastro_via_api_depois_de_manual_reverte_origem(client, token_superadmin):
    await _seed_company_completa(1)
    await client.put("/companies/1/fiscal-config", headers=auth(token_superadmin), json={
        "token_producao_manual": "TOKEN_MANUAL",
    })
    assert (await client.get("/companies/1/fiscal-config", headers=auth(token_superadmin))).json()["focus_nfe_cadastro_manual"] is True

    with respx.mock:
        respx.post(FOCUS_NFE_URL).mock(return_value=httpx.Response(200, json={
            "id": 1, "client_app_id": 1,
            "token_producao": "TOKEN_API", "token_homologacao": "TOKEN_API_HOMOLOG",
        }))
        r = await client.post("/companies/1/fiscal-config/focus-nfe-onboarding", headers=auth(token_superadmin))
    assert r.status_code == 200

    final = await client.get("/companies/1/fiscal-config", headers=auth(token_superadmin))
    assert final.json()["focus_nfe_cadastro_manual"] is False


# ── Controle de acesso / tokens nunca em texto puro ──────────────────────────

async def test_owner_nao_cadastra_token_manual(client):
    await _seed_company_completa(1)
    token_owner = make_jwt(role="owner", company_id=1)
    r = await client.put("/companies/1/fiscal-config", headers=auth(token_owner), json={
        "token_producao_manual": "X",
    })
    assert r.status_code == 403


async def test_tokens_manuais_nunca_aparecem_em_texto_puro(client, token_superadmin):
    await _seed_company_completa(1)
    await client.put("/companies/1/fiscal-config", headers=auth(token_superadmin), json={
        "token_producao_manual": "SEGREDO_TOKEN_PRODUCAO",
    })
    r = await client.get("/companies/1/fiscal-config", headers=auth(token_superadmin))
    assert "SEGREDO_TOKEN_PRODUCAO" not in r.text
