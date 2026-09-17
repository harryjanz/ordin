"""ORD-171: interruptor de emissão (`ativo`) + `ambiente` em CompanyFiscalConfig,
e o endpoint interno GET /internal/companies/{id}/fiscal-credentials que o
payment-service usa pra montar a emissão da NFC-e.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from conftest import make_jwt
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


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


def internal_headers() -> dict:
    return {"X-Internal-Secret": "test-internal-ci"}


async def _seed_company_cadastrada_focus_nfe(company_id: int) -> None:
    """Empresa completa e já cadastrada na Focus NFe (ORD-170) — estado de
    partida pra poder ligar o interruptor `ativo`."""
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
            csc_producao_enc=svc.encrypt_field("CSC_PROD"),
            id_token_producao="1",
            csc_homologacao_enc=svc.encrypt_field("CSC_HOMOLOG"),
            id_token_homologacao="1",
            token_producao_enc=svc.encrypt_field("TOKEN_PRODUCAO"),
            token_homologacao_enc=svc.encrypt_field("TOKEN_HOMOLOGACAO"),
            focus_nfe_cadastrado_em=svc.datetime.utcnow(),
        )
        db.add(cfg)
        await db.commit()


async def _seed_fiscal_addon_plan() -> int:
    """ORD-174 — ativar (`ativo=True`) exige plano de add-on vinculado."""
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        plan = svc.FiscalAddonPlan(name="Fiscal Básico", monthly_price=59.90, price_per_document=0.05)
        db.add(plan)
        await db.commit()
        await db.refresh(plan)
        return plan.id


# ── Ativar exige cadastro prévio na Focus NFe ────────────────────────────────

async def test_ativar_sem_cadastro_focus_nfe_e_rejeitado(client, token_superadmin):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        co = svc.Company(
            id=1, name="Pasta & Co", pin_hash="x", state="SP",
            legal_name="Pasta & Co Ltda", state_registration="123", tax_regime="simples_nacional",
            street="Rua X",
        )
        db.add(co)
        await db.commit()

    r = await client.put("/companies/1/fiscal-config", headers=auth(token_superadmin), json={"ativo": True})
    assert r.status_code == 400


async def test_ativar_apos_cadastro_focus_nfe_funciona(client, token_superadmin):
    await _seed_company_cadastrada_focus_nfe(1)
    plan_id = await _seed_fiscal_addon_plan()
    r = await client.put(
        "/companies/1/fiscal-config", headers=auth(token_superadmin),
        json={"ativo": True, "fiscal_addon_plan_id": plan_id},
    )
    assert r.status_code == 200
    assert r.json()["ativo"] is True


async def test_ativar_sem_plano_de_addon_e_rejeitado(client, token_superadmin):
    """ORD-174 — ativar exige plano de add-on fiscal vinculado, mesmo com
    cadastro na Focus NFe completo."""
    await _seed_company_cadastrada_focus_nfe(1)
    r = await client.put("/companies/1/fiscal-config", headers=auth(token_superadmin), json={"ativo": True})
    assert r.status_code == 400


async def test_ambiente_default_e_homologacao(client, token_superadmin):
    await _seed_company_cadastrada_focus_nfe(1)
    r = await client.get("/companies/1/fiscal-config", headers=auth(token_superadmin))
    assert r.json()["ambiente"] == "homologacao"


async def test_trocar_para_producao(client, token_superadmin):
    await _seed_company_cadastrada_focus_nfe(1)
    r = await client.put("/companies/1/fiscal-config", headers=auth(token_superadmin), json={"ambiente": "producao"})
    assert r.status_code == 200
    assert r.json()["ambiente"] == "producao"


async def test_ambiente_invalido_e_rejeitado(client, token_superadmin):
    await _seed_company_cadastrada_focus_nfe(1)
    r = await client.put("/companies/1/fiscal-config", headers=auth(token_superadmin), json={"ambiente": "staging"})
    assert r.status_code == 422


# ── GET /internal/companies/{id}/fiscal-credentials ──────────────────────────

async def test_internal_credentials_inativo_so_retorna_ativo_false(client, token_superadmin):
    await _seed_company_cadastrada_focus_nfe(1)
    r = await client.get("/internal/companies/1/fiscal-credentials", headers=internal_headers())
    assert r.status_code == 200
    assert r.json() == {"ativo": False}


async def test_internal_credentials_ativo_retorna_token_homologacao_por_padrao(client, token_superadmin):
    await _seed_company_cadastrada_focus_nfe(1)
    plan_id = await _seed_fiscal_addon_plan()
    await client.put(
        "/companies/1/fiscal-config", headers=auth(token_superadmin),
        json={"ativo": True, "fiscal_addon_plan_id": plan_id},
    )

    r = await client.get("/internal/companies/1/fiscal-credentials", headers=internal_headers())
    assert r.status_code == 200
    data = r.json()
    assert data["ativo"] is True
    assert data["ambiente"] == "homologacao"
    assert data["token"] == "TOKEN_HOMOLOGACAO"
    assert data["csc"] == "CSC_HOMOLOG"
    assert data["cnpj"] == "12345678000123"
    assert data["tax_regime"] == "simples_nacional"
    assert data["endereco"]["uf"] == "SP"


async def test_internal_credentials_ambiente_producao_retorna_token_producao(client, token_superadmin):
    await _seed_company_cadastrada_focus_nfe(1)
    plan_id = await _seed_fiscal_addon_plan()
    await client.put(
        "/companies/1/fiscal-config", headers=auth(token_superadmin),
        json={"ativo": True, "ambiente": "producao", "fiscal_addon_plan_id": plan_id},
    )

    r = await client.get("/internal/companies/1/fiscal-credentials", headers=internal_headers())
    data = r.json()
    assert data["ambiente"] == "producao"
    assert data["token"] == "TOKEN_PRODUCAO"
    assert data["csc"] == "CSC_PROD"


async def test_internal_credentials_sem_secret_retorna_403(client, token_superadmin):
    await _seed_company_cadastrada_focus_nfe(1)
    r = await client.get("/internal/companies/1/fiscal-credentials", headers={"X-Internal-Secret": "errado"})
    assert r.status_code == 403


async def test_internal_credentials_empresa_inexistente_retorna_404(client):
    r = await client.get("/internal/companies/999999/fiscal-credentials", headers=internal_headers())
    assert r.status_code == 404


async def test_manager_nao_altera_ativo(client):
    await _seed_company_cadastrada_focus_nfe(1)
    token_manager = make_jwt(role="manager", company_id=1)
    r = await client.put("/companies/1/fiscal-config", headers=auth(token_manager), json={"ativo": True})
    assert r.status_code == 403
