"""ORD-174: custo do módulo fiscal como add-on separado da PriceTable. Cobre
os cenários Gherkin do QA Explorer (docs/stories/ORD-174-custo-modulo-fiscal-pricing.md):
CRUD de planos restrito a superadmin/admin, ativação exige plano vinculado,
desativação preserva o vínculo (histórico), plano em uso não pode ser
excluído/editado, e a aba "Plano" reflete contratado/não contratado via
FiscalConfigOut.fiscal_addon_plan.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from httpx import ASGITransport, AsyncClient
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


def _payload(name: str = "Fiscal Básico") -> dict:
    return {"name": name, "monthly_price": 59.90, "price_per_document": 0.05}


async def _seed_plan(name: str = "Fiscal Básico") -> int:
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        plan = svc.FiscalAddonPlan(name=name, monthly_price=59.90, price_per_document=0.05)
        db.add(plan)
        await db.commit()
        await db.refresh(plan)
        return plan.id


async def _seed_company_cadastrada_focus_nfe(company_id: int) -> None:
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        db.add(svc.Company(
            id=company_id, name="Burger House", pin_hash="x" * 60, state="SP",
            legal_name="Burger House Ltda", document="12345678000123",
            state_registration="1234567", tax_regime="simples_nacional",
            street="Rua Exemplo", address_number="100", neighborhood="Centro",
            city="São Paulo", zip_code="01310100",
        ))
        db.add(svc.CompanyFiscalConfig(
            company_id=company_id,
            certificado_arquivo_enc=svc.encrypt_field("CERT_BASE64"),
            csc_producao_enc=svc.encrypt_field("CSC_PROD"), id_token_producao="1",
            csc_homologacao_enc=svc.encrypt_field("CSC_HOMOLOG"), id_token_homologacao="1",
            token_producao_enc=svc.encrypt_field("TOKEN_PRODUCAO"),
            token_homologacao_enc=svc.encrypt_field("TOKEN_HOMOLOGACAO"),
            focus_nfe_cadastrado_em=svc.datetime.utcnow(),
        ))
        await db.commit()


# ── Cadastro de plano de add-on ──────────────────────────────────────────────

async def test_cadastrar_plano_de_addon_fiscal(client, token_superadmin):
    r = await client.post("/commercial/fiscal-addon-plans", headers=auth(token_superadmin), json=_payload())
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Fiscal Básico"
    assert data["monthly_price"] == 59.90
    assert data["price_per_document"] == 0.05
    assert data["linked_companies_count"] == 0
    assert data["editable"] is True

    r = await client.get("/commercial/fiscal-addon-plans", headers=auth(token_superadmin))
    assert any(p["id"] == data["id"] for p in r.json()["plans"])


async def test_owner_nao_gerencia_planos_de_addon_fiscal(client, token_owner):
    r = await client.get("/commercial/fiscal-addon-plans", headers=auth(token_owner))
    assert r.status_code == 403
    r = await client.post("/commercial/fiscal-addon-plans", headers=auth(token_owner), json=_payload())
    assert r.status_code == 403


# ── Ativação exige plano vinculado ───────────────────────────────────────────

async def test_ativar_modulo_fiscal_exige_escolher_um_plano(client, token_superadmin):
    await _seed_company_cadastrada_focus_nfe(1)
    plan_id = await _seed_plan()

    r = await client.put("/companies/1/fiscal-config", headers=auth(token_superadmin), json={"ativo": True})
    assert r.status_code == 400

    r = await client.put(
        "/companies/1/fiscal-config", headers=auth(token_superadmin),
        json={"ativo": True, "fiscal_addon_plan_id": plan_id},
    )
    assert r.status_code == 200
    assert r.json()["ativo"] is True
    assert r.json()["fiscal_addon_plan"]["id"] == plan_id
    assert r.json()["fiscal_addon_plan"]["name"] == "Fiscal Básico"


async def test_empresa_com_modulo_inativo_mostra_nao_contratado(client, token_superadmin):
    await _seed_company_cadastrada_focus_nfe(1)
    r = await client.get("/companies/1/fiscal-config", headers=auth(token_superadmin))
    assert r.status_code == 200
    assert r.json()["fiscal_addon_plan"] is None


async def test_desativar_modulo_nao_desvincula_o_plano(client, token_superadmin):
    await _seed_company_cadastrada_focus_nfe(1)
    plan_id = await _seed_plan()
    await client.put(
        "/companies/1/fiscal-config", headers=auth(token_superadmin),
        json={"ativo": True, "fiscal_addon_plan_id": plan_id},
    )

    r = await client.put("/companies/1/fiscal-config", headers=auth(token_superadmin), json={"ativo": False})
    assert r.status_code == 200
    assert r.json()["ativo"] is False
    assert r.json()["fiscal_addon_plan"]["id"] == plan_id  # histórico preservado


# ── Plano em uso não pode ser excluído/editado ───────────────────────────────

async def test_plano_em_uso_nao_pode_ser_excluido(client, token_superadmin):
    await _seed_company_cadastrada_focus_nfe(1)
    plan_id = await _seed_plan()
    await client.put(
        "/companies/1/fiscal-config", headers=auth(token_superadmin),
        json={"ativo": True, "fiscal_addon_plan_id": plan_id},
    )

    r = await client.delete(f"/commercial/fiscal-addon-plans/{plan_id}", headers=auth(token_superadmin))
    assert r.status_code == 409

    r = await client.get(f"/commercial/fiscal-addon-plans/{plan_id}", headers=auth(token_superadmin))
    assert r.json()["editable"] is False
    assert r.json()["linked_companies_count"] == 1


async def test_plano_em_uso_nao_pode_ser_editado(client, token_superadmin):
    await _seed_company_cadastrada_focus_nfe(1)
    plan_id = await _seed_plan()
    await client.put(
        "/companies/1/fiscal-config", headers=auth(token_superadmin),
        json={"ativo": True, "fiscal_addon_plan_id": plan_id},
    )

    r = await client.put(
        f"/commercial/fiscal-addon-plans/{plan_id}", headers=auth(token_superadmin),
        json=_payload(name="Fiscal Básico Renomeado"),
    )
    assert r.status_code == 409


async def test_plano_sem_uso_pode_ser_excluido(client, token_superadmin):
    plan_id = await _seed_plan()
    r = await client.delete(f"/commercial/fiscal-addon-plans/{plan_id}", headers=auth(token_superadmin))
    assert r.status_code == 204


# ── Bloco "Módulo fiscal" na aba Plano (GET /companies/{id}/plan) ───────────
# Endpoint diferente de /fiscal-config: acessível a owner/manager da própria
# empresa (_require_company_admin), não só superadmin/admin — por isso o
# bloco fica embutido em CompanyPlanOut, não em FiscalConfigOut.

async def _seed_company_plan(company_id: int = 1) -> None:
    from datetime import datetime, timedelta

    import main as svc
    async with svc.AsyncSessionLocal() as db:
        pt = svc.PriceTable(
            name="Tabela Padrão", status="active", totem_price_1=249.00,
            totem_multiplier_2=0.5, totem_multiplier_3_5=0.3, activated_at=datetime.utcnow(),
        )
        db.add(pt)
        await db.flush()
        db.add(svc.CompanyPlan(
            company_id=company_id, price_table_id=pt.id,
            started_at=datetime.utcnow(), expires_at=datetime.utcnow() + timedelta(days=365),
        ))
        await db.commit()


async def test_aba_plano_mostra_bloco_modulo_fiscal_preenchido(client, token_owner, token_superadmin):
    await _seed_company_cadastrada_focus_nfe(1)
    await _seed_company_plan(1)
    plan_id = await _seed_plan()
    # Vincular/ativar é restrito a superadmin/admin (_require_platform_admin)
    # — a leitura do bloco na aba Plano, abaixo, é que testa a visibilidade
    # de owner/manager (_require_company_admin no GET /plan).
    await client.put(
        "/companies/1/fiscal-config", headers=auth(token_superadmin),
        json={"ativo": True, "fiscal_addon_plan_id": plan_id},
    )

    r = await client.get("/companies/1/plan", headers=auth(token_owner))
    assert r.status_code == 200
    data = r.json()
    assert data["fiscal_module_ativo"] is True
    assert data["fiscal_addon_plan"]["name"] == "Fiscal Básico"
    assert data["fiscal_addon_plan"]["monthly_price"] == 59.90


async def test_aba_plano_mostra_nao_contratado_quando_modulo_nunca_ativado(client, token_owner):
    await _seed_company_cadastrada_focus_nfe(1)
    await _seed_company_plan(1)

    r = await client.get("/companies/1/plan", headers=auth(token_owner))
    assert r.status_code == 200
    data = r.json()
    assert data["fiscal_module_ativo"] is False
    assert data["fiscal_addon_plan"] is None
