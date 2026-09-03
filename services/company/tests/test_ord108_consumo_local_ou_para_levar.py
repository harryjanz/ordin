import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta

import bcrypt
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
async def seed(client):
    import main as svc
    pin_hash = bcrypt.hashpw(b"123456", bcrypt.gensalt(4)).decode()
    async with svc.AsyncSessionLocal() as db:
        co = svc.Company(name="Empresa Teste", document="00000000001",
                         pin_hash=pin_hash, plan="free", payment_provider="mock", state="SP")
        db.add(co); await db.commit()
        co_id = co.id
        token = _make_token("owner", co_id)
        yield {"company_id": co_id, "token": token}
        await db.execute(sa_delete(svc.Company).where(svc.Company.id == co_id))
        await db.commit()


def auth(token):
    return {"Authorization": f"Bearer {token}"}


async def test_consumption_mode_padrao_desligado(client, seed):
    r = await client.get(f"/companies/{seed['company_id']}", headers=auth(seed["token"]))
    assert r.status_code == 200
    assert r.json()["consumption_mode_enabled"] is False


async def test_liga_consumption_mode(client, seed):
    r = await client.patch(
        f"/companies/{seed['company_id']}/behavior",
        json={"consumption_mode_enabled": True},
        headers=auth(seed["token"]),
    )
    assert r.status_code == 200
    assert r.json() == {"ok": True, "consumption_mode_enabled": True}

    r2 = await client.get(f"/companies/{seed['company_id']}", headers=auth(seed["token"]))
    assert r2.json()["consumption_mode_enabled"] is True


async def test_desliga_consumption_mode_depois_de_ligado(client, seed):
    await client.patch(
        f"/companies/{seed['company_id']}/behavior",
        json={"consumption_mode_enabled": True},
        headers=auth(seed["token"]),
    )
    r = await client.patch(
        f"/companies/{seed['company_id']}/behavior",
        json={"consumption_mode_enabled": False},
        headers=auth(seed["token"]),
    )
    assert r.status_code == 200
    assert r.json()["consumption_mode_enabled"] is False


async def test_behavior_outra_empresa_forbidden(client, seed):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        pin_hash = bcrypt.hashpw(b"654321", bcrypt.gensalt(4)).decode()
        co2 = svc.Company(name="Empresa B", document="00000000002",
                          pin_hash=pin_hash, plan="free", payment_provider="mock", state="RJ")
        db.add(co2); await db.commit()
        co2_id = co2.id

    r = await client.patch(
        f"/companies/{co2_id}/behavior",
        json={"consumption_mode_enabled": True},
        headers=auth(seed["token"]),  # token é da empresa `seed`, não de co2
    )
    assert r.status_code == 403

    async with svc.AsyncSessionLocal() as db:
        await db.execute(sa_delete(svc.Company).where(svc.Company.id == co2_id))
        await db.commit()


async def test_behavior_sem_token_retorna_401(client, seed):
    r = await client.patch(
        f"/companies/{seed['company_id']}/behavior",
        json={"consumption_mode_enabled": True},
    )
    assert r.status_code == 401
