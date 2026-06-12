import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
import bcrypt
from httpx import AsyncClient, ASGITransport


@pytest.fixture(scope="module")
async def client():
    from main import app, Base, engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture(scope="module")
async def seed(client):
    from main import AsyncSessionLocal, Company, Terminal, User
    pin_hash = bcrypt.hashpw(b"123456", bcrypt.gensalt(4)).decode()
    pw_hash = bcrypt.hashpw(b"senha123", bcrypt.gensalt(4)).decode()
    async with AsyncSessionLocal() as db:
        co = Company(name="Empresa Teste", document="00000000000", pin_hash=pin_hash, plan="free")
        db.add(co)
        await db.flush()
        t = Terminal(company_id=co.id, label="Totem 1", terminal_code="T001")
        u = User(company_id=co.id, name="Owner", email="owner@test.com",
                 password_hash=pw_hash, role="owner")
        db.add_all([t, u])
        await db.commit()
        return {"company_id": co.id, "terminal_id": t.id}


async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["service"] == "company"


async def test_list_companies_sem_token(client):
    r = await client.get("/companies")
    assert r.status_code == 401


async def test_list_companies_token_invalido(client):
    r = await client.get("/companies", headers={"Authorization": "Bearer token.invalido"})
    assert r.status_code == 401


async def test_list_companies_superadmin(client, seed, token_superadmin):
    r = await client.get("/companies", headers={"Authorization": f"Bearer {token_superadmin}"})
    assert r.status_code == 200
    assert "companies" in r.json()
    assert "total" in r.json()


async def test_list_companies_owner_forbidden(client, seed, token_owner):
    r = await client.get("/companies", headers={"Authorization": f"Bearer {token_owner}"})
    assert r.status_code == 403


async def test_list_terminals_owner(client, seed, token_owner):
    cid = seed["company_id"]
    r = await client.get(
        f"/companies/{cid}/terminals",
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert r.status_code == 200
    assert "terminals" in r.json()


async def test_list_terminals_wrong_company(client, seed, token_owner):
    r = await client.get(
        "/companies/9999/terminals",
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert r.status_code == 403


async def test_regenerate_pin(client, seed, token_owner):
    cid = seed["company_id"]
    r = await client.post(
        f"/companies/{cid}/regenerate-pin",
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert r.status_code == 200
    assert len(r.json()["pin"]) == 6
    assert r.json()["pin"].isdigit()


async def test_list_users_owner(client, seed, token_owner):
    cid = seed["company_id"]
    r = await client.get(
        f"/companies/{cid}/users",
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert r.status_code == 200
    assert r.json()["total"] >= 1
