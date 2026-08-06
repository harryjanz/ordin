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


# CNPJ próprio deste arquivo, exclusivo, pra não colidir com dados de outros
# testes/e2e rodando contra o mesmo MySQL de dev compartilhado.
CNPJ_UNICO = "67525081250650"


async def test_cnpj_duplicado_retorna_422_amigavel(client, superadmin_token, _cleanup_company):
    r1 = await client.post("/companies", headers=auth(superadmin_token), json={
        "name": "Empresa Original ORD065", "document": CNPJ_UNICO, "state": "SP",
    })
    assert r1.status_code == 201
    _cleanup_company.append(r1.json()["company"]["id"])

    r2 = await client.post("/companies", headers=auth(superadmin_token), json={
        "name": "Empresa Duplicada ORD065", "document": CNPJ_UNICO, "state": "SP",
    })
    assert r2.status_code == 422
    assert r2.json()["detail"] == "CNPJ já cadastrado para outra empresa"


async def test_cnpj_duplicado_nao_cria_linha_nova(client, superadmin_token, _cleanup_company):
    r1 = await client.post("/companies", headers=auth(superadmin_token), json={
        "name": "Empresa Original ORD065 B", "document": CNPJ_UNICO, "state": "SP",
    })
    _cleanup_company.append(r1.json()["company"]["id"])

    await client.post("/companies", headers=auth(superadmin_token), json={
        "name": "Empresa Duplicada ORD065 B", "document": CNPJ_UNICO, "state": "SP",
    })

    r_list = await client.get(f"/companies?document={CNPJ_UNICO}", headers=auth(superadmin_token))
    assert r_list.json()["total"] == 1


async def test_cnpj_diferente_cadastra_normalmente(client, superadmin_token, _cleanup_company):
    r1 = await client.post("/companies", headers=auth(superadmin_token), json={
        "name": "Empresa A ORD065", "document": "22644575952997", "state": "SP",
    })
    assert r1.status_code == 201
    _cleanup_company.append(r1.json()["company"]["id"])

    r2 = await client.post("/companies", headers=auth(superadmin_token), json={
        "name": "Empresa B ORD065", "document": "72835450755173", "state": "SP",
    })
    assert r2.status_code == 201
    _cleanup_company.append(r2.json()["company"]["id"])


async def test_cnpj_duplicado_mascarado_tambem_e_bloqueado(client, superadmin_token, _cleanup_company):
    # Mesmo CNPJ, com e sem máscara — normalize_cnpj() precisa igualar os dois
    # antes de bater no UNIQUE constraint (senão o índice não pegaria).
    from domain.cnpj import format_cnpj
    r1 = await client.post("/companies", headers=auth(superadmin_token), json={
        "name": "Empresa Sem Mascara ORD065", "document": CNPJ_UNICO, "state": "SP",
    })
    _cleanup_company.append(r1.json()["company"]["id"])

    r2 = await client.post("/companies", headers=auth(superadmin_token), json={
        "name": "Empresa Com Mascara ORD065", "document": format_cnpj(CNPJ_UNICO), "state": "SP",
    })
    assert r2.status_code == 422
    assert r2.json()["detail"] == "CNPJ já cadastrado para outra empresa"
