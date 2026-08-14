import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta

import bcrypt
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def make_jwt(role: str, company_id: int) -> str:
    from jose import jwt
    secret = os.environ.get("JWT_SECRET", "test-secret-ci")
    return jwt.encode(
        {"sub": "1", "company": company_id, "role": role,
         "exp": datetime.utcnow() + timedelta(hours=1)},
        secret, algorithm="HS256",
    )


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


TOKEN = "Zzord091xSuperadminOculto"


@pytest.fixture
async def empresa_com_superadmin_associado(client):
    """Reproduz o achado: superadmin/admin são usuários da plataforma, mas
    o schema exige company_id NOT NULL em User, então o seed real acaba
    associando o superadmin a uma empresa qualquer (Burger House, id=1) —
    aqui simulado com uma empresa isolada por prefixo."""
    import main as svc
    pin_hash = bcrypt.hashpw(b"1234", bcrypt.gensalt(4)).decode()
    pw_hash = bcrypt.hashpw(b"senha123", bcrypt.gensalt(4)).decode()
    async with svc.AsyncSessionLocal() as db:
        co = svc.Company(
            name=f"{TOKEN} Empresa", document="10000000000766",
            pin_hash=pin_hash, plan="free", state="SP",
        )
        db.add(co)
        await db.flush()

        owner = svc.User(
            company_id=co.id, name=f"{TOKEN} Owner",
            email=f"{TOKEN.lower()}.owner@teste.com",
            password_hash=pw_hash, role="owner", active=True,
        )
        superadmin = svc.User(
            company_id=co.id, name=f"{TOKEN} Admin Ordin",
            email=f"{TOKEN.lower()}.superadmin@teste.com",
            password_hash=pw_hash, role="superadmin", active=True,
        )
        admin = svc.User(
            company_id=co.id, name=f"{TOKEN} Admin Plataforma",
            email=f"{TOKEN.lower()}.admin@teste.com",
            password_hash=pw_hash, role="admin", active=True,
        )
        db.add_all([owner, superadmin, admin])
        await db.commit()
        await db.refresh(owner)
        await db.refresh(superadmin)
        await db.refresh(admin)

        co_id = co.id
        ids = {"owner": owner.id, "superadmin": superadmin.id, "admin": admin.id}

        yield {
            "company_id": co_id,
            "owner_token": make_jwt("owner", co_id),
            "manager_token": make_jwt("manager", co_id),
            "superadmin_token": make_jwt("superadmin", co_id),
            "admin_token": make_jwt("admin", co_id),
            "ids": ids,
        }

        await db.execute(sa_delete(svc.User).where(svc.User.company_id == co_id))
        await db.execute(sa_delete(svc.Company).where(svc.Company.id == co_id))
        await db.commit()


async def test_owner_nao_ve_superadmin_nem_admin_na_listagem(client, empresa_com_superadmin_associado):
    r = await client.get(
        f"/companies/{empresa_com_superadmin_associado['company_id']}/users",
        params={"status": "all"},
        headers=auth(empresa_com_superadmin_associado["owner_token"]),
    )
    assert r.status_code == 200
    roles = {u["role"] for u in r.json()["users"]}
    assert roles == {"owner"}


async def test_manager_nao_ve_superadmin_nem_admin_na_listagem(client, empresa_com_superadmin_associado):
    r = await client.get(
        f"/companies/{empresa_com_superadmin_associado['company_id']}/users",
        params={"status": "all"},
        headers=auth(empresa_com_superadmin_associado["manager_token"]),
    )
    assert r.status_code == 200
    roles = {u["role"] for u in r.json()["users"]}
    assert roles == {"owner"}


async def test_superadmin_ve_todos_incluindo_superadmin_e_admin(client, empresa_com_superadmin_associado):
    r = await client.get(
        f"/companies/{empresa_com_superadmin_associado['company_id']}/users",
        params={"status": "all"},
        headers=auth(empresa_com_superadmin_associado["superadmin_token"]),
    )
    assert r.status_code == 200
    roles = {u["role"] for u in r.json()["users"]}
    assert roles == {"owner", "superadmin", "admin"}


async def test_admin_ve_todos_incluindo_superadmin_e_admin(client, empresa_com_superadmin_associado):
    r = await client.get(
        f"/companies/{empresa_com_superadmin_associado['company_id']}/users",
        params={"status": "all"},
        headers=auth(empresa_com_superadmin_associado["admin_token"]),
    )
    assert r.status_code == 200
    roles = {u["role"] for u in r.json()["users"]}
    assert roles == {"owner", "superadmin", "admin"}
