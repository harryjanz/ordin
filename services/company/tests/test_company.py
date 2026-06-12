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
    pw_hash  = bcrypt.hashpw(b"senha123", bcrypt.gensalt(4)).decode()
    async with AsyncSessionLocal() as db:
        co = Company(name="Empresa Teste", document="00000000000",
                     pin_hash=pin_hash, plan="free", payment_provider="mock")
        db.add(co)
        await db.flush()
        t = Terminal(company_id=co.id, label="Totem 1", terminal_code="T001",
                     paygo_terminal_id=None, environment="sandbox")
        u = User(company_id=co.id, name="Owner", email="owner@test.com",
                 password_hash=pw_hash, role="owner")
        db.add_all([t, u])
        await db.commit()
        return {"company_id": co.id, "terminal_id": t.id}


# ── Health ────────────────────────────────────────────────────────────────────

async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["service"] == "company"


# ── Empresas ──────────────────────────────────────────────────────────────────

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


# ── Terminais ─────────────────────────────────────────────────────────────────

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


async def test_update_terminal_paygo_fields(client, seed, token_owner):
    cid = seed["company_id"]
    tid = seed["terminal_id"]
    r = await client.put(
        f"/companies/{cid}/terminals/{tid}",
        json={"paygo_terminal_id": "81", "environment": "sandbox"},
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert r.status_code == 200
    assert r.json()["paygo_terminal_id"] == "81"
    assert r.json()["environment"] == "sandbox"


# ── PIN ───────────────────────────────────────────────────────────────────────

async def test_regenerate_pin(client, seed, token_owner):
    cid = seed["company_id"]
    r = await client.post(
        f"/companies/{cid}/regenerate-pin",
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert r.status_code == 200
    assert len(r.json()["pin"]) == 6
    assert r.json()["pin"].isdigit()


# ── Usuários ──────────────────────────────────────────────────────────────────

async def test_list_users_owner(client, seed, token_owner):
    cid = seed["company_id"]
    r = await client.get(
        f"/companies/{cid}/users",
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert r.status_code == 200
    assert r.json()["total"] >= 1


# ── Payment configs ───────────────────────────────────────────────────────────

async def test_create_payment_config(client, seed, token_owner):
    cid = seed["company_id"]
    r = await client.post(
        f"/companies/{cid}/payment-configs",
        json={
            "provider": "paygo",
            "environment": "sandbox",
            "api_key": "chave-real",
            "api_secret": "senha-real",
            "extra_config": {"pessoa_id": "11559"},
        },
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["provider"] == "paygo"
    assert data["api_key"] == "***"      # nunca exposta
    assert data["api_secret"] == "***"
    assert data["extra_config"]["pessoa_id"] == "11559"


async def test_list_payment_configs(client, seed, token_owner):
    cid = seed["company_id"]
    r = await client.get(
        f"/companies/{cid}/payment-configs",
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert r.status_code == 200
    assert len(r.json()["configs"]) >= 1
    # credenciais mascaradas
    for cfg in r.json()["configs"]:
        assert cfg["api_key"] == "***"


async def test_payment_config_duplicate_returns_409(client, seed, token_owner):
    cid = seed["company_id"]
    r = await client.post(
        f"/companies/{cid}/payment-configs",
        json={"provider": "paygo", "environment": "sandbox", "api_key": "outra-chave"},
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert r.status_code == 409


async def test_payment_config_wrong_company_forbidden(client, seed, token_owner):
    r = await client.get(
        "/companies/9999/payment-configs",
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert r.status_code == 403


# ── Encryption helpers ────────────────────────────────────────────────────────

def test_encrypt_decrypt_credential():
    from main import encrypt_credential, decrypt_credential
    plaintext = "minha-chave-secreta"
    encrypted = encrypt_credential(plaintext)
    assert encrypted.startswith("enc:")
    assert decrypt_credential(encrypted) == plaintext


def test_decrypt_plaintext_passthrough():
    from main import decrypt_credential
    assert decrypt_credential("plaintext-sem-prefixo") == "plaintext-sem-prefixo"
