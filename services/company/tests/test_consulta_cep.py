import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta

import httpx
import pytest
import respx
from httpx import ASGITransport, AsyncClient
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


CEP_VALIDO = "01310-100"
CEP_VALIDO_NORMALIZADO = "01310100"


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


def _mock_lookup(monkeypatch, *, found, reason=None, **extra):
    import main as svc
    from infrastructure.cep_lookup import CepLookupResult

    async def _fake(cep):
        return CepLookupResult(found=found, reason=reason, **extra)

    monkeypatch.setattr(svc, "lookup_cep", _fake)


# ── infrastructure/cep_lookup.py — testes de integração HTTP (respx) ────────

async def test_lookup_cep_brasilapi_sucesso():
    from infrastructure.cep_lookup import lookup_cep
    with respx.mock:
        respx.get(f"https://brasilapi.com.br/api/cep/v2/{CEP_VALIDO_NORMALIZADO}").mock(
            return_value=httpx.Response(200, json={
                "cep": CEP_VALIDO_NORMALIZADO, "state": "SP", "city": "São Paulo",
                "neighborhood": "Bela Vista", "street": "Avenida Paulista",
            })
        )
        result = await lookup_cep(CEP_VALIDO_NORMALIZADO)
    assert result.found is True
    assert result.street == "Avenida Paulista"
    assert result.city == "São Paulo"
    assert result.state == "SP"


async def test_lookup_cep_brasilapi_404_fallback_viacep():
    from infrastructure.cep_lookup import lookup_cep
    with respx.mock:
        respx.get(f"https://brasilapi.com.br/api/cep/v2/{CEP_VALIDO_NORMALIZADO}").mock(
            return_value=httpx.Response(404)
        )
        respx.get(f"https://viacep.com.br/ws/{CEP_VALIDO_NORMALIZADO}/json/").mock(
            return_value=httpx.Response(200, json={
                "cep": "01310-100", "logradouro": "Avenida Paulista", "bairro": "Bela Vista",
                "localidade": "São Paulo", "uf": "SP",
            })
        )
        result = await lookup_cep(CEP_VALIDO_NORMALIZADO)
    assert result.found is True
    assert result.street == "Avenida Paulista"


async def test_lookup_cep_todos_provedores_negam_e_so_entao_e_nao_encontrado():
    from infrastructure.cep_lookup import lookup_cep
    with respx.mock:
        respx.get(f"https://brasilapi.com.br/api/cep/v2/{CEP_VALIDO_NORMALIZADO}").mock(
            return_value=httpx.Response(404)
        )
        respx.get(f"https://viacep.com.br/ws/{CEP_VALIDO_NORMALIZADO}/json/").mock(
            return_value=httpx.Response(200, json={"erro": True})
        )
        respx.get(f"https://opencep.com/v1/{CEP_VALIDO_NORMALIZADO}").mock(
            return_value=httpx.Response(404)
        )
        result = await lookup_cep(CEP_VALIDO_NORMALIZADO)
    assert result.found is False
    assert result.reason == "cep_not_found"


async def test_lookup_cep_viacep_corpo_de_erro_sozinho_ainda_tenta_opencep():
    from infrastructure.cep_lookup import lookup_cep
    with respx.mock:
        respx.get(f"https://brasilapi.com.br/api/cep/v2/{CEP_VALIDO_NORMALIZADO}").mock(
            side_effect=httpx.ConnectTimeout("timeout")
        )
        respx.get(f"https://viacep.com.br/ws/{CEP_VALIDO_NORMALIZADO}/json/").mock(
            return_value=httpx.Response(200, json={"erro": True})
        )
        respx.get(f"https://opencep.com/v1/{CEP_VALIDO_NORMALIZADO}").mock(
            return_value=httpx.Response(200, json={
                "cep": "01310-100", "logradouro": "Avenida Paulista", "bairro": "Bela Vista",
                "localidade": "São Paulo", "uf": "SP",
            })
        )
        result = await lookup_cep(CEP_VALIDO_NORMALIZADO)
    assert result.found is True
    assert result.city == "São Paulo"


async def test_lookup_cep_fallback_opencep_quando_os_dois_primeiros_falham():
    from infrastructure.cep_lookup import lookup_cep
    with respx.mock:
        respx.get(f"https://brasilapi.com.br/api/cep/v2/{CEP_VALIDO_NORMALIZADO}").mock(
            side_effect=httpx.ConnectTimeout("timeout")
        )
        respx.get(f"https://viacep.com.br/ws/{CEP_VALIDO_NORMALIZADO}/json/").mock(
            side_effect=httpx.ConnectTimeout("timeout")
        )
        respx.get(f"https://opencep.com/v1/{CEP_VALIDO_NORMALIZADO}").mock(
            return_value=httpx.Response(200, json={
                "cep": "01310-100", "logradouro": "Avenida Paulista", "bairro": "Bela Vista",
                "localidade": "São Paulo", "uf": "SP",
            })
        )
        result = await lookup_cep(CEP_VALIDO_NORMALIZADO)
    assert result.found is True
    assert result.city == "São Paulo"


async def test_lookup_cep_todas_apis_indisponiveis_degrada_graciosamente():
    from infrastructure.cep_lookup import lookup_cep
    with respx.mock:
        respx.get(f"https://brasilapi.com.br/api/cep/v2/{CEP_VALIDO_NORMALIZADO}").mock(
            side_effect=httpx.ConnectTimeout("timeout")
        )
        respx.get(f"https://viacep.com.br/ws/{CEP_VALIDO_NORMALIZADO}/json/").mock(
            side_effect=httpx.ConnectTimeout("timeout")
        )
        respx.get(f"https://opencep.com/v1/{CEP_VALIDO_NORMALIZADO}").mock(
            side_effect=httpx.ConnectTimeout("timeout")
        )
        result = await lookup_cep(CEP_VALIDO_NORMALIZADO)
    assert result.found is False
    assert result.reason == "lookup_unavailable"


async def test_lookup_cep_429_nao_e_tratado_como_nao_encontrado():
    from infrastructure.cep_lookup import lookup_cep
    with respx.mock:
        respx.get(f"https://brasilapi.com.br/api/cep/v2/{CEP_VALIDO_NORMALIZADO}").mock(
            return_value=httpx.Response(429)
        )
        respx.get(f"https://viacep.com.br/ws/{CEP_VALIDO_NORMALIZADO}/json/").mock(
            return_value=httpx.Response(200, json={
                "cep": "01310-100", "logradouro": "Avenida Paulista", "bairro": "Bela Vista",
                "localidade": "São Paulo", "uf": "SP",
            })
        )
        result = await lookup_cep(CEP_VALIDO_NORMALIZADO)
    assert result.found is True


# ── GET /companies/cep-lookup/{cep} ───────────────────────────────────────────

async def test_endpoint_lookup_cep_sucesso(client, superadmin_token, monkeypatch):
    _mock_lookup(monkeypatch, found=True, street="Avenida Paulista", city="São Paulo", state="SP")
    r = await client.get(f"/companies/cep-lookup/{CEP_VALIDO_NORMALIZADO}", headers=auth(superadmin_token))
    assert r.status_code == 200
    assert r.json()["street"] == "Avenida Paulista"
    assert r.json()["state"] == "SP"


async def test_endpoint_lookup_cep_nao_encontrado_retorna_404(client, superadmin_token, monkeypatch):
    _mock_lookup(monkeypatch, found=False, reason="cep_not_found")
    r = await client.get(f"/companies/cep-lookup/{CEP_VALIDO_NORMALIZADO}", headers=auth(superadmin_token))
    assert r.status_code == 404


async def test_endpoint_lookup_cep_indisponivel_retorna_200_sem_bloquear(client, superadmin_token, monkeypatch):
    _mock_lookup(monkeypatch, found=False, reason="lookup_unavailable")
    r = await client.get(f"/companies/cep-lookup/{CEP_VALIDO_NORMALIZADO}", headers=auth(superadmin_token))
    assert r.status_code == 200
    body = r.json()
    assert body["found"] is False
    assert body["reason"] == "lookup_unavailable"


async def test_endpoint_lookup_cep_formato_invalido_retorna_422_sem_chamar_api(client, superadmin_token, monkeypatch):
    chamou = {"valor": False}

    async def _nao_deveria_ser_chamado(cep):
        chamou["valor"] = True
        raise AssertionError("lookup não deveria ser chamado para CEP com formato inválido")

    import main as svc
    monkeypatch.setattr(svc, "lookup_cep", _nao_deveria_ser_chamado)
    r = await client.get("/companies/cep-lookup/123", headers=auth(superadmin_token))
    assert r.status_code == 422
    assert chamou["valor"] is False


async def test_endpoint_lookup_cep_forbidden_para_nao_superadmin(client):
    owner_token = _make_token("owner", 1)
    r = await client.get(f"/companies/cep-lookup/{CEP_VALIDO_NORMALIZADO}", headers=auth(owner_token))
    assert r.status_code == 403
