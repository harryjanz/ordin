import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta

import pytest
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


@pytest.fixture(autouse=True)
def _mock_cnpj_lookup_ativa(monkeypatch):
    """ORD-057 faz create_company reconsultar a Receita — nos testes do ORD-056,
    que só validam formato/DV localmente, mocka a consulta como sempre ATIVA
    para não depender de rede real nem se acoplar ao ORD-057."""
    import main as svc
    from infrastructure.cnpj_lookup import CnpjLookupResult

    async def _fake_lookup(cnpj):
        return CnpjLookupResult(found=True, cadastral_status="ATIVA")

    monkeypatch.setattr(svc, "lookup_cnpj", _fake_lookup)


@pytest.fixture
async def _cleanup_company(client):
    import main as svc
    created_ids = []
    yield created_ids
    if created_ids:
        async with svc.AsyncSessionLocal() as db:
            await db.execute(sa_delete(svc.Company).where(svc.Company.id.in_(created_ids)))
            await db.commit()


# ── CNPJ numérico ────────────────────────────────────────────────────────────

async def test_cnpj_numerico_valido_e_aceito(client, superadmin_token, _cleanup_company):
    r = await client.post("/companies", headers=auth(superadmin_token), json={
        "name": "Empresa Numérica", "document": "11.222.333/0001-81", "state": "SP",
    })
    assert r.status_code == 201
    _cleanup_company.append(r.json()["company"]["id"])


async def test_cnpj_numerico_dv_invalido_e_rejeitado(client, superadmin_token):
    r = await client.post("/companies", headers=auth(superadmin_token), json={
        "name": "Empresa Inválida", "document": "11.222.333/0001-80", "state": "SP",
    })
    assert r.status_code == 422


# ── CNPJ alfanumérico ─────────────────────────────────────────────────────────

async def test_cnpj_alfanumerico_valido_e_aceito(client, superadmin_token, _cleanup_company):
    # gerado a partir do mesmo algoritmo implementado em domain/cnpj.py (ver risco documentado em ORD-056)
    r = await client.post("/companies", headers=auth(superadmin_token), json={
        "name": "Empresa Alfanumérica", "document": "12ABC34501DE35", "state": "SP",
    })
    assert r.status_code == 201
    _cleanup_company.append(r.json()["company"]["id"])


async def test_cnpj_alfanumerico_dv_invalido_e_rejeitado(client, superadmin_token):
    r = await client.post("/companies", headers=auth(superadmin_token), json={
        "name": "Empresa Alfanumérica Inválida", "document": "12ABC34501DE99", "state": "SP",
    })
    assert r.status_code == 422


# ── Formato inválido ──────────────────────────────────────────────────────────

async def test_cnpj_com_letra_minuscula_fora_do_charset_apos_normalizacao_ok(client, superadmin_token, _cleanup_company):
    r = await client.post("/companies", headers=auth(superadmin_token), json={
        "name": "Empresa Minúscula", "document": "12abc34501de35", "state": "SP",
    })
    assert r.status_code == 201
    _cleanup_company.append(r.json()["company"]["id"])


async def test_cnpj_tamanho_invalido_e_rejeitado(client, superadmin_token):
    r = await client.post("/companies", headers=auth(superadmin_token), json={
        "name": "Empresa Curta", "document": "123456", "state": "SP",
    })
    assert r.status_code == 422


# ── Persistência sem máscara ──────────────────────────────────────────────────

async def test_cnpj_e_persistido_sem_mascara_no_banco(client, superadmin_token, _cleanup_company):
    import main as svc
    r = await client.post("/companies", headers=auth(superadmin_token), json={
        "name": "Empresa Sem Máscara", "document": "11.222.333/0001-81", "state": "SP",
    })
    assert r.status_code == 201
    co_id = r.json()["company"]["id"]
    _cleanup_company.append(co_id)
    async with svc.AsyncSessionLocal() as db:
        co = await db.get(svc.Company, co_id)
        assert co.document == "11222333000181"  # sem pontuação


async def test_cep_e_persistido_sem_mascara_no_banco(client, superadmin_token, _cleanup_company):
    import main as svc
    r = await client.post("/companies", headers=auth(superadmin_token), json={
        "name": "Empresa CEP", "document": "11.222.333/0001-81", "zip_code": "01310-100", "state": "SP",
    })
    assert r.status_code == 201
    co_id = r.json()["company"]["id"]
    _cleanup_company.append(co_id)
    async with svc.AsyncSessionLocal() as db:
        co = await db.get(svc.Company, co_id)
        assert co.zip_code == "01310100"  # sem hífen


async def test_cep_invalido_e_rejeitado(client, superadmin_token):
    r = await client.post("/companies", headers=auth(superadmin_token), json={
        "name": "Empresa CEP Inválido", "document": "11.222.333/0001-81", "zip_code": "123", "state": "SP",
    })
    assert r.status_code == 422


# ── Dados cadastrais e endereço completos ─────────────────────────────────────

async def test_dados_cadastrais_e_endereco_persistidos_e_retornados(client, superadmin_token, _cleanup_company):
    payload = {
        "name": "Burger House Ipiranga", "document": "11.222.333/0001-81",
        "legal_name": "Burger House Alimentos LTDA",
        "state_registration": "ISENTO",
        "tax_regime": "simples_nacional",
        "company_size": "ME",
        "zip_code": "01310-100", "street": "Av. Paulista", "address_number": "1000",
        "neighborhood": "Bela Vista", "city": "São Paulo", "state": "SP",
    }
    r = await client.post("/companies", headers=auth(superadmin_token), json=payload)
    assert r.status_code == 201
    co_id = r.json()["company"]["id"]
    _cleanup_company.append(co_id)

    r2 = await client.get(f"/companies/{co_id}", headers=auth(superadmin_token))
    assert r2.status_code == 200
    body = r2.json()
    assert body["legal_name"] == "Burger House Alimentos LTDA"
    assert body["state_registration"] == "ISENTO"
    assert body["street"] == "Av. Paulista"
    assert body["city"] == "São Paulo"
    assert body["state"] == "SP"


async def test_inscricao_estadual_isenta_distinguivel_de_vazio(client, superadmin_token, _cleanup_company):
    r = await client.post("/companies", headers=auth(superadmin_token), json={
        "name": "Empresa Isenta", "document": "11.222.333/0001-81", "state_registration": "ISENTO", "state": "SP",
    })
    co_id = r.json()["company"]["id"]
    _cleanup_company.append(co_id)
    r2 = await client.get(f"/companies/{co_id}", headers=auth(superadmin_token))
    assert r2.json()["state_registration"] == "ISENTO"


# ── Retrocompatibilidade e controle de acesso ─────────────────────────────────

async def test_payload_minimo_legado_continua_funcionando(client, superadmin_token, _cleanup_company):
    r = await client.post("/companies", headers=auth(superadmin_token), json={
        "name": "Empresa Mínima", "document": "11.222.333/0001-81",
        "plan": "free", "payment_provider": "mock", "state": "SP",
    })
    assert r.status_code == 201
    body = r.json()["company"]
    assert body["legal_name"] is None
    _cleanup_company.append(body["id"])


async def test_create_company_owner_forbidden(client):
    owner_token = _make_token("owner", 1)
    r = await client.post("/companies", headers=auth(owner_token), json={
        "name": "Não deveria criar", "document": "11.222.333/0001-81", "state": "SP",
    })
    assert r.status_code == 403
