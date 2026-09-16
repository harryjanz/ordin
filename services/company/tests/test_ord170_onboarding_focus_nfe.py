"""ORD-170: onboarding da empresa na Focus NFe (POST /empresas).

Cobre os cenários Gherkin do QA Explorer (docs/stories/ORD-170-onboarding-focus-nfe.md):
cadastro com sucesso, dados fiscais incompletos, múltiplos erros de validação,
certificado que não pertence ao CNPJ, controle de acesso, tokens nunca em texto
puro. A chamada real à Focus NFe é mockada via respx — nunca bate na rede.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx
import pytest
import respx
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
    """Empresa com todos os pré-requisitos da ORD-168 já cadastrados —
    estado de partida pra cadastrar na Focus NFe."""
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
            certificado_nome_arquivo="burgerhouse.pfx",
            csc_producao_enc=svc.encrypt_field("CSC_PROD"),
            id_token_producao="1",
            csc_homologacao_enc=svc.encrypt_field("CSC_HOMOLOG"),
            id_token_homologacao="1",
        )
        db.add(cfg)
        await db.commit()


FOCUS_NFE_SUCCESS_BODY = {
    "id": 555,
    "client_app_id": 999,
    "token_producao": "TOKEN_PRODUCAO_SECRETO",
    "token_homologacao": "TOKEN_HOMOLOGACAO_SECRETO",
    "certificado_valido_de": "2026-01-01T00:00:00",
    "certificado_valido_ate": "2027-01-01T00:00:00",
}


# ── Happy path ────────────────────────────────────────────────────────────────

async def test_cadastro_com_sucesso_persiste_tokens_criptografados(client, token_superadmin):
    await _seed_company_completa(1)

    with respx.mock:
        respx.post(FOCUS_NFE_URL).mock(return_value=httpx.Response(200, json=FOCUS_NFE_SUCCESS_BODY))
        r = await client.post("/companies/1/fiscal-config/focus-nfe-onboarding", headers=auth(token_superadmin))

    assert r.status_code == 200
    data = r.json()
    assert data["cadastrado"] is True
    assert data["focus_nfe_cadastrado_em"] is not None

    import main as svc
    from sqlalchemy import select
    async with svc.AsyncSessionLocal() as db:
        cfg = (await db.execute(select(svc.CompanyFiscalConfig).filter_by(company_id=1))).scalars().first()
        assert cfg.focus_nfe_empresa_id == 555
        assert cfg.focus_nfe_client_app_id == 999
        assert cfg.token_producao_enc.startswith("enc:")
        assert svc.decrypt_field(cfg.token_producao_enc) == "TOKEN_PRODUCAO_SECRETO"
        assert svc.decrypt_field(cfg.token_homologacao_enc) == "TOKEN_HOMOLOGACAO_SECRETO"
        assert cfg.certificado_valido_ate is not None


async def test_status_focus_nfe_cadastrado_aparece_na_leitura(client, token_superadmin):
    await _seed_company_completa(1)
    with respx.mock:
        respx.post(FOCUS_NFE_URL).mock(return_value=httpx.Response(200, json=FOCUS_NFE_SUCCESS_BODY))
        await client.post("/companies/1/fiscal-config/focus-nfe-onboarding", headers=auth(token_superadmin))

    r = await client.get("/companies/1/fiscal-config", headers=auth(token_superadmin))
    data = r.json()
    assert data["focus_nfe_cadastrado"] is True
    assert data["focus_nfe_cadastrado_em"] is not None


async def test_reenviar_cadastro_e_so_um_post_de_novo(client, token_superadmin):
    """Upsert confirmado ao vivo (Explorer) — reenviar é o mesmo POST,
    sem endpoint nem lógica diferentes."""
    await _seed_company_completa(1)
    with respx.mock:
        route = respx.post(FOCUS_NFE_URL).mock(return_value=httpx.Response(200, json=FOCUS_NFE_SUCCESS_BODY))
        await client.post("/companies/1/fiscal-config/focus-nfe-onboarding", headers=auth(token_superadmin))
        r2 = await client.post("/companies/1/fiscal-config/focus-nfe-onboarding", headers=auth(token_superadmin))
    assert r2.status_code == 200
    assert route.call_count == 2


# ── Bordas ────────────────────────────────────────────────────────────────────

async def test_dados_fiscais_incompletos_retorna_400_sem_chamar_focus_nfe(client, token_superadmin):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        co = svc.Company(id=2, name="Pasta & Co", pin_hash="x", state="SP")
        db.add(co)
        await db.commit()

    with respx.mock:
        route = respx.post(FOCUS_NFE_URL).mock(return_value=httpx.Response(200, json=FOCUS_NFE_SUCCESS_BODY))
        r = await client.post("/companies/2/fiscal-config/focus-nfe-onboarding", headers=auth(token_superadmin))

    assert r.status_code == 400
    assert route.call_count == 0


async def test_multiplos_erros_de_validacao_sao_repassados(client, token_superadmin):
    await _seed_company_completa(1)
    erro_body = {
        "codigo": "erro_validacao",
        "mensagem": "Erro de validação",
        "erros": [
            {"mensagem": "Município inválido"},
            {"mensagem": "CEP inválido"},
        ],
    }
    with respx.mock:
        respx.post(FOCUS_NFE_URL).mock(return_value=httpx.Response(422, json=erro_body))
        r = await client.post("/companies/1/fiscal-config/focus-nfe-onboarding", headers=auth(token_superadmin))

    assert r.status_code == 422
    detail = r.json()["detail"]
    assert len(detail["erros"]) == 2


async def test_certificado_nao_pertence_ao_cnpj(client, token_superadmin):
    await _seed_company_completa(1)
    erro_body = {
        "codigo": "erro_validacao",
        "mensagem": "Certificado não pertence ao CNPJ informado",
        "erros": [],
    }
    with respx.mock:
        respx.post(FOCUS_NFE_URL).mock(return_value=httpx.Response(422, json=erro_body))
        r = await client.post("/companies/1/fiscal-config/focus-nfe-onboarding", headers=auth(token_superadmin))

    assert r.status_code == 422
    assert "CNPJ" in r.json()["detail"]["mensagem"]


async def test_falha_de_conectividade_retorna_502(client, token_superadmin):
    await _seed_company_completa(1)
    with respx.mock:
        respx.post(FOCUS_NFE_URL).mock(side_effect=httpx.ConnectTimeout("timeout"))
        r = await client.post("/companies/1/fiscal-config/focus-nfe-onboarding", headers=auth(token_superadmin))

    assert r.status_code == 502


# ── Controle de acesso ────────────────────────────────────────────────────────

async def test_owner_recebe_403(client, token_owner):
    await _seed_company_completa(1)
    with respx.mock:
        route = respx.post(FOCUS_NFE_URL).mock(return_value=httpx.Response(200, json=FOCUS_NFE_SUCCESS_BODY))
        r = await client.post("/companies/1/fiscal-config/focus-nfe-onboarding", headers=auth(token_owner))
    assert r.status_code == 403
    assert route.call_count == 0


# ── Tokens nunca em texto puro ────────────────────────────────────────────────

async def test_tokens_nunca_aparecem_em_texto_puro_na_leitura(client, token_superadmin):
    await _seed_company_completa(1)
    with respx.mock:
        respx.post(FOCUS_NFE_URL).mock(return_value=httpx.Response(200, json=FOCUS_NFE_SUCCESS_BODY))
        await client.post("/companies/1/fiscal-config/focus-nfe-onboarding", headers=auth(token_superadmin))

    r = await client.get("/companies/1/fiscal-config", headers=auth(token_superadmin))
    assert "TOKEN_PRODUCAO_SECRETO" not in r.text
    assert "TOKEN_HOMOLOGACAO_SECRETO" not in r.text
