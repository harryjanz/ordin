import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta

import httpx
import pytest
import respx
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def _make_token(role: str, company_id: int) -> str:
    from jose import jwt
    secret = os.environ.get("JWT_SECRET", "test-secret-ci")
    return jwt.encode(
        {"sub": "1", "company": company_id, "role": role,
         "exp": datetime.utcnow() + timedelta(hours=1)},
        secret, algorithm="HS256"
    )


def auth(token):
    return {"Authorization": f"Bearer {token}"}


CNPJ_VALIDO = "11.222.333/0001-81"
CNPJ_VALIDO_NORMALIZADO = "11222333000181"


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


@pytest.fixture
def superadmin_token():
    return _make_token("superadmin", 0)


@pytest.fixture
async def _cleanup_company(client):
    import main as svc
    created_ids = []
    yield created_ids
    if created_ids:
        async with svc.AsyncSessionLocal() as db:
            await db.execute(sa_delete(svc.Company).where(svc.Company.id.in_(created_ids)))
            await db.commit()


def _mock_lookup(monkeypatch, *, found, cadastral_status="NAO_VERIFICADA", reason=None, **extra):
    import main as svc
    from infrastructure.cnpj_lookup import CnpjLookupResult

    async def _fake(cnpj):
        return CnpjLookupResult(found=found, cadastral_status=cadastral_status, reason=reason, **extra)

    monkeypatch.setattr(svc, "lookup_cnpj", _fake)


# ── infrastructure/cnpj_lookup.py — testes de integração HTTP (respx) ────────

async def test_lookup_cnpj_brasilapi_sucesso():
    from infrastructure.cnpj_lookup import lookup_cnpj
    with respx.mock:
        respx.get(f"https://brasilapi.com.br/api/cnpj/v1/{CNPJ_VALIDO_NORMALIZADO}").mock(
            return_value=httpx.Response(200, json={
                "descricao_situacao_cadastral": "ATIVA",
                "razao_social": "Empresa Teste LTDA",
                "nome_fantasia": "Empresa Teste",
                "cep": "01310100", "logradouro": "Av. Paulista", "numero": "1000",
                "complemento": "", "bairro": "Bela Vista", "municipio": "São Paulo", "uf": "SP",
            })
        )
        result = await lookup_cnpj(CNPJ_VALIDO_NORMALIZADO)
    assert result.found is True
    assert result.cadastral_status == "ATIVA"
    assert result.legal_name == "Empresa Teste LTDA"
    assert result.city == "São Paulo"


async def test_lookup_cnpj_brasilapi_404_nao_encontrado():
    from infrastructure.cnpj_lookup import lookup_cnpj
    with respx.mock:
        respx.get(f"https://brasilapi.com.br/api/cnpj/v1/{CNPJ_VALIDO_NORMALIZADO}").mock(
            return_value=httpx.Response(404)
        )
        result = await lookup_cnpj(CNPJ_VALIDO_NORMALIZADO)
    assert result.found is False
    assert result.reason == "cnpj_not_found"


async def test_lookup_cnpj_fallback_receitaws_quando_brasilapi_falha():
    from infrastructure.cnpj_lookup import lookup_cnpj
    with respx.mock:
        respx.get(f"https://brasilapi.com.br/api/cnpj/v1/{CNPJ_VALIDO_NORMALIZADO}").mock(
            side_effect=httpx.ConnectTimeout("timeout")
        )
        respx.get(f"https://www.receitaws.com.br/v1/cnpj/{CNPJ_VALIDO_NORMALIZADO}").mock(
            return_value=httpx.Response(200, json={
                "situacao": "ATIVA", "nome": "Empresa Fallback LTDA", "fantasia": "Fallback",
                "cep": "01310100", "logradouro": "Av. Paulista", "numero": "1000",
                "complemento": "", "bairro": "Bela Vista", "municipio": "São Paulo", "uf": "SP",
            })
        )
        result = await lookup_cnpj(CNPJ_VALIDO_NORMALIZADO)
    assert result.found is True
    assert result.legal_name == "Empresa Fallback LTDA"


async def test_lookup_cnpj_todas_apis_indisponiveis_degrada_graciosamente():
    # ORD-064 acrescentou um terceiro provedor (cnpj.ws) — os três precisam
    # falhar pra chegar em lookup_unavailable.
    from infrastructure.cnpj_lookup import lookup_cnpj
    with respx.mock:
        respx.get(f"https://brasilapi.com.br/api/cnpj/v1/{CNPJ_VALIDO_NORMALIZADO}").mock(
            side_effect=httpx.ConnectTimeout("timeout")
        )
        respx.get(f"https://www.receitaws.com.br/v1/cnpj/{CNPJ_VALIDO_NORMALIZADO}").mock(
            side_effect=httpx.ConnectTimeout("timeout")
        )
        respx.get(f"https://publica.cnpj.ws/cnpj/{CNPJ_VALIDO_NORMALIZADO}").mock(
            side_effect=httpx.ConnectTimeout("timeout")
        )
        result = await lookup_cnpj(CNPJ_VALIDO_NORMALIZADO)
    assert result.found is False
    assert result.reason == "lookup_unavailable"
    assert result.cadastral_status == "NAO_VERIFICADA"  # CNPJ numérico — sem promoção automática (Gap 3 é só alfanumérico)


# ── GET /companies/cnpj-lookup/{cnpj} ─────────────────────────────────────────

async def test_endpoint_lookup_cnpj_ativo(client, superadmin_token, monkeypatch):
    _mock_lookup(monkeypatch, found=True, cadastral_status="ATIVA", legal_name="Empresa X LTDA")
    r = await client.get(f"/companies/cnpj-lookup/{CNPJ_VALIDO_NORMALIZADO}", headers=auth(superadmin_token))
    assert r.status_code == 200
    assert r.json()["cadastral_status"] == "ATIVA"
    assert r.json()["legal_name"] == "Empresa X LTDA"


async def test_endpoint_lookup_cnpj_nao_encontrado_retorna_404(client, superadmin_token, monkeypatch):
    _mock_lookup(monkeypatch, found=False, reason="cnpj_not_found")
    r = await client.get(f"/companies/cnpj-lookup/{CNPJ_VALIDO_NORMALIZADO}", headers=auth(superadmin_token))
    assert r.status_code == 404


async def test_endpoint_lookup_cnpj_indisponivel_retorna_200_sem_bloquear(client, superadmin_token, monkeypatch):
    _mock_lookup(monkeypatch, found=False, reason="lookup_unavailable", cadastral_status="NAO_VERIFICADA")
    r = await client.get(f"/companies/cnpj-lookup/{CNPJ_VALIDO_NORMALIZADO}", headers=auth(superadmin_token))
    assert r.status_code == 200
    body = r.json()
    assert body["found"] is False
    assert body["reason"] == "lookup_unavailable"


async def test_endpoint_lookup_cnpj_formato_invalido_retorna_422_sem_chamar_api(client, superadmin_token, monkeypatch):
    chamou = {"valor": False}

    async def _nao_deveria_ser_chamado(cnpj):
        chamou["valor"] = True
        raise AssertionError("lookup não deveria ser chamado para CNPJ com formato inválido")

    import main as svc
    monkeypatch.setattr(svc, "lookup_cnpj", _nao_deveria_ser_chamado)
    r = await client.get("/companies/cnpj-lookup/123456", headers=auth(superadmin_token))
    assert r.status_code == 422
    assert chamou["valor"] is False


async def test_endpoint_lookup_cnpj_forbidden_para_nao_superadmin(client):
    owner_token = _make_token("owner", 1)
    r = await client.get(f"/companies/cnpj-lookup/{CNPJ_VALIDO_NORMALIZADO}", headers=auth(owner_token))
    assert r.status_code == 403


# ── POST /companies — reconsulta server-side e bloqueio por situação ────────

async def test_post_companies_situacao_ativa_persiste_cadastral_status(client, superadmin_token, monkeypatch, _cleanup_company):
    _mock_lookup(monkeypatch, found=True, cadastral_status="ATIVA")
    r = await client.post("/companies", headers=auth(superadmin_token),
                          json={"name": "Empresa Ativa", "document": CNPJ_VALIDO})
    assert r.status_code == 201
    co_id = r.json()["company"]["id"]
    _cleanup_company.append(co_id)
    assert r.json()["company"]["cadastral_status"] == "ATIVA"


async def test_post_companies_situacao_inativa_bloqueia_cadastro(client, superadmin_token, monkeypatch):
    _mock_lookup(monkeypatch, found=True, cadastral_status="BAIXADA")
    r = await client.post("/companies", headers=auth(superadmin_token),
                          json={"name": "Empresa Baixada", "document": CNPJ_VALIDO})
    assert r.status_code == 422
    assert "BAIXADA" in r.json()["detail"]


async def test_post_companies_cnpj_nao_encontrado_bloqueia_cadastro(client, superadmin_token, monkeypatch):
    _mock_lookup(monkeypatch, found=False, reason="cnpj_not_found")
    r = await client.post("/companies", headers=auth(superadmin_token),
                          json={"name": "Empresa Fantasma", "document": CNPJ_VALIDO})
    assert r.status_code == 422


async def test_post_companies_lookup_indisponivel_permite_cadastro_manual(client, superadmin_token, monkeypatch, _cleanup_company):
    _mock_lookup(monkeypatch, found=False, reason="lookup_unavailable", cadastral_status="NAO_VERIFICADA")
    r = await client.post("/companies", headers=auth(superadmin_token),
                          json={"name": "Empresa CNPJ Alfanumérico", "document": CNPJ_VALIDO})
    assert r.status_code == 201
    co_id = r.json()["company"]["id"]
    _cleanup_company.append(co_id)
    assert r.json()["company"]["cadastral_status"] == "NAO_VERIFICADA"


async def test_post_companies_sem_document_nao_chama_lookup(client, superadmin_token, monkeypatch, _cleanup_company):
    chamou = {"valor": False}

    async def _fake(cnpj):
        chamou["valor"] = True
        from infrastructure.cnpj_lookup import CnpjLookupResult
        return CnpjLookupResult(found=True, cadastral_status="ATIVA")

    import main as svc
    monkeypatch.setattr(svc, "lookup_cnpj", _fake)
    r = await client.post("/companies", headers=auth(superadmin_token), json={"name": "Empresa Sem CNPJ"})
    assert r.status_code == 201
    co_id = r.json()["company"]["id"]
    _cleanup_company.append(co_id)
    assert chamou["valor"] is False
    assert r.json()["company"]["cadastral_status"] == "NAO_VERIFICADA"
