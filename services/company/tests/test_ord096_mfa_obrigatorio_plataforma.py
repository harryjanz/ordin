import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta

import bcrypt
import pyotp
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def make_jwt(sub: str, role: str, company_id: int) -> str:
    from jose import jwt
    secret = os.environ.get("JWT_SECRET", "test-secret-ci")
    payload = {"sub": sub, "company": company_id, "role": role,
               "exp": datetime.utcnow() + timedelta(hours=1)}
    return jwt.encode(payload, secret, algorithm="HS256")


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


TOKEN = "Zzord096xMfaObrigatorio"
INTERNAL_HEADERS = {"X-Internal-Secret": os.environ.get("INTERNAL_SECRET", "test-internal-secret-ci")}


@pytest.fixture
async def cenario(client):
    """Empresa interna isolada por prefixo (NÃO usa/depende da empresa
    interna real do ambiente — is_platform=True aqui é só pra exercitar a
    trava, os endpoints usados nestes testes recebem company_id/user_id
    direto, nunca resolvem "a" empresa interna via _get_platform_company_id,
    que hoje já tem um bug conhecido de ambiguidade quando mais de uma linha
    is_platform=True existe — não é escopo desta história, ver ORD-093/095).
    Também cria uma empresa cliente comum, pra confirmar que nada muda lá."""
    import main as svc
    pin_hash = bcrypt.hashpw(b"1234", bcrypt.gensalt(4)).decode()
    pw_hash = bcrypt.hashpw(b"senhaSegura123!", bcrypt.gensalt(4)).decode()
    async with svc.AsyncSessionLocal() as db:
        platform_co = svc.Company(
            name=f"{TOKEN} Plataforma", document=None,
            pin_hash=pin_hash, plan="internal", state="SP",
            is_platform=True, mfa_policy="required",
        )
        client_co = svc.Company(
            name=f"{TOKEN} Cliente", document="10000000000766",
            pin_hash=pin_hash, plan="free", state="SP", mfa_policy="optional",
        )
        db.add_all([platform_co, client_co])
        await db.flush()

        superadmin = svc.User(
            company_id=platform_co.id, name=f"{TOKEN} Superadmin",
            email=f"{TOKEN.lower()}.superadmin@teste.com",
            password_hash=pw_hash, role="superadmin", active=True,
        )
        owner = svc.User(
            company_id=client_co.id, name=f"{TOKEN} Owner",
            email=f"{TOKEN.lower()}.owner@teste.com",
            password_hash=pw_hash, role="owner", active=True,
        )
        db.add_all([superadmin, owner])
        await db.commit()
        await db.refresh(superadmin)
        await db.refresh(owner)

        platform_co_id, client_co_id = platform_co.id, client_co.id
        ids = {"superadmin": superadmin.id, "owner": owner.id}

        yield {
            "platform_company_id": platform_co_id,
            "client_company_id": client_co_id,
            "superadmin_token": make_jwt(str(superadmin.id), "superadmin", platform_co_id),
            "owner_token": make_jwt(str(owner.id), "owner", client_co_id),
            "ids": ids,
        }

        await db.execute(sa_delete(svc.UserBackupCode).where(
            svc.UserBackupCode.user_id.in_([superadmin.id, owner.id])))
        await db.execute(sa_delete(svc.User).where(svc.User.company_id.in_([platform_co_id, client_co_id])))
        await db.execute(sa_delete(svc.Company).where(svc.Company.id.in_([platform_co_id, client_co_id])))
        await db.commit()


# ── PUT /companies/{id}/security ────────────────────────────────────────────

async def test_nao_consegue_mudar_politica_da_empresa_interna(client, cenario):
    r = await client.put(
        f"/companies/{cenario['platform_company_id']}/security",
        json={"mfa_policy": "optional"},
        headers=auth(cenario["superadmin_token"]),
    )
    assert r.status_code == 409

    r2 = await client.get(
        f"/companies/{cenario['platform_company_id']}", headers=auth(cenario["superadmin_token"])
    )
    assert r2.json()["mfa_policy"] == "required"


async def test_manter_required_na_empresa_interna_e_aceito(client, cenario):
    r = await client.put(
        f"/companies/{cenario['platform_company_id']}/security",
        json={"mfa_policy": "required"},
        headers=auth(cenario["superadmin_token"]),
    )
    assert r.status_code == 200


async def test_empresa_cliente_nao_e_afetada(client, cenario):
    r = await client.put(
        f"/companies/{cenario['client_company_id']}/security",
        json={"mfa_policy": "disabled"},
        headers=auth(cenario["owner_token"]),
    )
    assert r.status_code == 200
    assert r.json()["mfa_policy"] == "disabled"


# ── POST /users/me/mfa/disable ──────────────────────────────────────────────

async def test_superadmin_nao_consegue_autodesativar_2fa(client, cenario):
    setup = await client.post("/users/me/mfa/setup", headers=auth(cenario["superadmin_token"]))
    code = pyotp.TOTP(setup.json()["secret"]).now()
    await client.post("/users/me/mfa/confirm", json={"code": code}, headers=auth(cenario["superadmin_token"]))

    r = await client.post(
        "/users/me/mfa/disable",
        json={"password": "senhaSegura123!"},
        headers=auth(cenario["superadmin_token"]),
    )
    assert r.status_code == 403


async def test_owner_empresa_cliente_ainda_consegue_desativar_2fa(client, cenario):
    await client.put(
        f"/companies/{cenario['client_company_id']}/security",
        json={"mfa_policy": "optional"},
        headers=auth(cenario["owner_token"]),
    )
    setup = await client.post("/users/me/mfa/setup", headers=auth(cenario["owner_token"]))
    code = pyotp.TOTP(setup.json()["secret"]).now()
    await client.post("/users/me/mfa/confirm", json={"code": code}, headers=auth(cenario["owner_token"]))

    r = await client.post(
        "/users/me/mfa/disable",
        json={"password": "senhaSegura123!"},
        headers=auth(cenario["owner_token"]),
    )
    assert r.status_code == 200


# ── Login força setup quando a empresa é a interna ──────────────────────────

async def test_login_forca_setup_para_superadmin_sem_totp(client, cenario):
    r = await client.post(
        "/internal/verify-credentials",
        json={"email": f"{TOKEN.lower()}.superadmin@teste.com", "password": "senhaSegura123!"},
        headers=INTERNAL_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["mfa_status"] == "setup_required"
