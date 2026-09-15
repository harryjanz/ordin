"""ORD-168: cadastro fiscal da empresa (certificado A1 + CSC).

Razão social/IE/regime/endereço já existem em Company — não duplicados na
FiscalConfig, só espelhados como leitura. Cobre os cenários Gherkin do QA
Explorer (docs/stories/ORD-168-cadastro-fiscal-empresa.md): cadastro completo,
parcial, edição isolada de um campo, controle de acesso (só
superadmin/admin), certificado/CSC nunca em texto puro.
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


async def _seed_company(company_id: int, *, fiscal_completo: bool = True) -> None:
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        co = svc.Company(
            id=company_id, name="Burger House", pin_hash="x", state="SP",
        )
        if fiscal_completo:
            co.legal_name = "Burger House Ltda"
            co.state_registration = "1234567"
            co.tax_regime = "simples_nacional"
            co.street = "Rua Exemplo"
            co.address_number = "100"
            co.neighborhood = "Centro"
            co.city = "São Paulo"
        db.add(co)
        await db.commit()


# ── Happy path ──────────────────────────────────────────────────────────────

async def test_get_fiscal_config_empresa_sem_dado_fiscal_novo(client, token_superadmin):
    await _seed_company(1)

    r = await client.get("/companies/1/fiscal-config", headers=auth(token_superadmin))
    assert r.status_code == 200
    data = r.json()
    assert data["legal_name"] == "Burger House Ltda"
    assert data["state_registration"] == "1234567"
    assert data["tax_regime"] == "simples_nacional"
    assert data["address_summary"] == "Rua Exemplo, 100, Centro, São Paulo/SP"
    assert data["certificado_cadastrado"] is False
    assert data["csc_producao_cadastrado"] is False
    assert data["csc_homologacao_cadastrado"] is False
    assert data["completo"] is False


async def test_put_cadastra_certificado_e_csc_completo(client, token_superadmin):
    await _seed_company(1)

    r = await client.put("/companies/1/fiscal-config", headers=auth(token_superadmin), json={
        "certificado_base64": "MIIj4gIBAzCC...",
        "certificado_senha": "segredo123",
        "certificado_nome_arquivo": "burgerhouse.pfx",
        "csc_producao": "ABCDEF123456",
        "id_token_producao": "1",
        "csc_homologacao": "GHIJKL789012",
        "id_token_homologacao": "1",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["certificado_cadastrado"] is True
    assert data["certificado_nome_arquivo"] == "burgerhouse.pfx"
    assert data["certificado_enviado_em"] is not None
    assert data["csc_producao_cadastrado"] is True
    assert data["csc_homologacao_cadastrado"] is True
    assert data["completo"] is True

    r2 = await client.get("/companies/1/fiscal-config", headers=auth(token_superadmin))
    assert r2.json()["completo"] is True


# ── Bordas ──────────────────────────────────────────────────────────────────

async def test_put_parcial_sem_certificado_marca_incompleto(client, token_superadmin):
    await _seed_company(1)

    r = await client.put("/companies/1/fiscal-config", headers=auth(token_superadmin), json={
        "csc_producao": "ABCDEF123456",
        "id_token_producao": "1",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["csc_producao_cadastrado"] is True
    assert data["certificado_cadastrado"] is False
    assert data["completo"] is False


async def test_atualizar_so_csc_homologacao_preserva_certificado_ja_salvo(client, token_superadmin):
    await _seed_company(1)
    await client.put("/companies/1/fiscal-config", headers=auth(token_superadmin), json={
        "certificado_base64": "MIIj4gIBAzCC...",
        "certificado_senha": "segredo123",
        "certificado_nome_arquivo": "burgerhouse.pfx",
    })

    r = await client.put("/companies/1/fiscal-config", headers=auth(token_superadmin), json={
        "csc_homologacao": "NOVOCSC999",
        "id_token_homologacao": "2",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["certificado_cadastrado"] is True  # não foi apagado
    assert data["certificado_nome_arquivo"] == "burgerhouse.pfx"
    assert data["csc_homologacao_cadastrado"] is True


async def test_completo_false_quando_company_sem_ie_regime_mesmo_com_certificado(client, token_superadmin):
    await _seed_company(2, fiscal_completo=False)

    await client.put("/companies/2/fiscal-config", headers=auth(token_superadmin), json={
        "certificado_base64": "MIIj4gIBAzCC...",
        "certificado_senha": "segredo123",
        "csc_producao": "ABCDEF123456",
        "csc_homologacao": "GHIJKL789012",
    })
    r = await client.get("/companies/2/fiscal-config", headers=auth(token_superadmin))
    data = r.json()
    assert data["certificado_cadastrado"] is True
    assert data["completo"] is False  # falta legal_name/IE/regime/endereço em Company


# ── Certificado/CSC nunca em texto puro ──────────────────────────────────────

async def test_certificado_e_csc_nunca_retornam_em_texto_puro(client, token_superadmin):
    await _seed_company(1)
    await client.put("/companies/1/fiscal-config", headers=auth(token_superadmin), json={
        "certificado_base64": "SEGREDO_CERTIFICADO_BRUTO",
        "certificado_senha": "SENHA_SECRETA",
        "csc_producao": "CSC_SECRETO_PRODUCAO",
    })

    r = await client.get("/companies/1/fiscal-config", headers=auth(token_superadmin))
    body_text = r.text
    assert "SEGREDO_CERTIFICADO_BRUTO" not in body_text
    assert "SENHA_SECRETA" not in body_text
    assert "CSC_SECRETO_PRODUCAO" not in body_text


async def test_certificado_persistido_criptografado_no_banco(client, token_superadmin):
    import main as svc
    await _seed_company(1)
    await client.put("/companies/1/fiscal-config", headers=auth(token_superadmin), json={
        "certificado_base64": "SEGREDO_CERTIFICADO_BRUTO",
        "certificado_senha": "SENHA_SECRETA",
    })

    async with svc.AsyncSessionLocal() as db:
        from sqlalchemy import select
        cfg = (await db.execute(
            select(svc.CompanyFiscalConfig).filter_by(company_id=1)
        )).scalars().first()
        assert cfg.certificado_arquivo_enc != "SEGREDO_CERTIFICADO_BRUTO"
        assert cfg.certificado_arquivo_enc.startswith("enc:")
        assert svc.decrypt_field(cfg.certificado_arquivo_enc) == "SEGREDO_CERTIFICADO_BRUTO"


# ── Controle de acesso ────────────────────────────────────────────────────────

async def test_owner_da_propria_empresa_nao_acessa_get(client, token_owner):
    await _seed_company(1)
    r = await client.get("/companies/1/fiscal-config", headers=auth(token_owner))
    assert r.status_code == 403


async def test_owner_da_propria_empresa_nao_acessa_put(client, token_owner):
    await _seed_company(1)
    r = await client.put("/companies/1/fiscal-config", headers=auth(token_owner), json={
        "csc_producao": "ABCDEF123456",
    })
    assert r.status_code == 403


async def test_manager_de_outra_empresa_recebe_403(client):
    await _seed_company(1)
    token_manager = make_jwt(role="manager", company_id=2)
    r = await client.get("/companies/1/fiscal-config", headers=auth(token_manager))
    assert r.status_code == 403
