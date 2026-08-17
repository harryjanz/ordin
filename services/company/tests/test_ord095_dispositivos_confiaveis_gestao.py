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


TOKEN = "Zzord095xDispositivos"
INTERNAL_HEADERS = {"X-Internal-Secret": os.environ.get("INTERNAL_SECRET", "test-internal-secret-ci")}


@pytest.fixture
async def duas_empresas(client):
    """Duas empresas isoladas, cada uma com owner + cashier — pra cobrir
    isolamento multi-tenant sem depender da empresa interna da plataforma
    (ORD-093), que já é compartilhada/real no banco de dev e não deve ser
    tocada por este arquivo."""
    import main as svc
    pin_hash = bcrypt.hashpw(b"1234", bcrypt.gensalt(4)).decode()
    pw_hash = bcrypt.hashpw(b"senhaSegura123!", bcrypt.gensalt(4)).decode()
    async with svc.AsyncSessionLocal() as db:
        co_a = svc.Company(
            name=f"{TOKEN} Empresa A", document="10000000000766",
            pin_hash=pin_hash, plan="free", state="SP", mfa_policy="optional",
        )
        co_b = svc.Company(
            name=f"{TOKEN} Empresa B", document="10000000000600",
            pin_hash=pin_hash, plan="free", state="SP", mfa_policy="optional",
        )
        db.add_all([co_a, co_b])
        await db.flush()

        owner_a = svc.User(
            company_id=co_a.id, name=f"{TOKEN} Owner A",
            email=f"{TOKEN.lower()}.ownera@teste.com",
            password_hash=pw_hash, role="owner", active=True,
        )
        cashier_a = svc.User(
            company_id=co_a.id, name=f"{TOKEN} Cashier A",
            email=f"{TOKEN.lower()}.cashiera@teste.com",
            password_hash=pw_hash, role="cashier", active=True,
        )
        owner_b = svc.User(
            company_id=co_b.id, name=f"{TOKEN} Owner B",
            email=f"{TOKEN.lower()}.ownerb@teste.com",
            password_hash=pw_hash, role="owner", active=True,
        )
        cashier_b = svc.User(
            company_id=co_b.id, name=f"{TOKEN} Cashier B",
            email=f"{TOKEN.lower()}.cashierb@teste.com",
            password_hash=pw_hash, role="cashier", active=True,
        )
        db.add_all([owner_a, cashier_a, owner_b, cashier_b])
        await db.commit()
        for u in (owner_a, cashier_a, owner_b, cashier_b):
            await db.refresh(u)

        co_a_id, co_b_id = co_a.id, co_b.id
        ids = {"owner_a": owner_a.id, "cashier_a": cashier_a.id,
               "owner_b": owner_b.id, "cashier_b": cashier_b.id}
        emails = {"cashier_a": f"{TOKEN.lower()}.cashiera@teste.com"}

        yield {
            "company_a_id": co_a_id,
            "company_b_id": co_b_id,
            "owner_a_token": make_jwt(str(owner_a.id), "owner", co_a_id),
            "owner_b_token": make_jwt(str(owner_b.id), "owner", co_b_id),
            "ids": ids,
            "emails": emails,
        }

        all_ids = list(ids.values())
        await db.execute(sa_delete(svc.TrustedDevice).where(svc.TrustedDevice.user_id.in_(all_ids)))
        await db.execute(sa_delete(svc.UserBackupCode).where(svc.UserBackupCode.user_id.in_(all_ids)))
        await db.execute(sa_delete(svc.User).where(svc.User.company_id.in_([co_a_id, co_b_id])))
        await db.execute(sa_delete(svc.Company).where(svc.Company.id.in_([co_a_id, co_b_id])))
        await db.commit()


async def _trust(client, user_id: int, label: str = "Chrome"):
    r = await client.post(
        "/internal/trust-device",
        json={"user_id": user_id, "device_label": label},
        headers=INTERNAL_HEADERS,
    )
    return r.json()["device_token"]


async def _is_trusted(client, email: str, token: str) -> bool:
    r = await client.post(
        "/internal/verify-trusted-device",
        json={"email": email, "device_token": token},
        headers=INTERNAL_HEADERS,
    )
    return r.json()["trusted"]


# ── has_trusted_device na listagem de usuários ──────────────────────────────

async def test_has_trusted_device_false_por_padrao(client, duas_empresas):
    r = await client.get(
        f"/companies/{duas_empresas['company_a_id']}/users",
        headers=auth(duas_empresas["owner_a_token"]),
    )
    assert r.status_code == 200
    users = {u["id"]: u for u in r.json()["users"]}
    assert users[duas_empresas["ids"]["cashier_a"]]["has_trusted_device"] is False


async def test_has_trusted_device_true_apos_trust_device(client, duas_empresas):
    await _trust(client, duas_empresas["ids"]["cashier_a"])
    r = await client.get(
        f"/companies/{duas_empresas['company_a_id']}/users",
        headers=auth(duas_empresas["owner_a_token"]),
    )
    users = {u["id"]: u for u in r.json()["users"]}
    assert users[duas_empresas["ids"]["cashier_a"]]["has_trusted_device"] is True


# ── DELETE /companies/{id}/users/{uid}/trusted-devices ──────────────────────

async def test_revogar_dispositivo_mantem_2fa_intacto(client, duas_empresas):
    import main as svc
    cashier_id = duas_empresas["ids"]["cashier_a"]
    cashier_token = make_jwt(str(cashier_id), "cashier", duas_empresas["company_a_id"])

    setup = await client.post("/users/me/mfa/setup", headers=auth(cashier_token))
    code = pyotp.TOTP(setup.json()["secret"]).now()
    await client.post("/users/me/mfa/confirm", json={"code": code}, headers=auth(cashier_token))
    token = await _trust(client, cashier_id)
    assert await _is_trusted(client, duas_empresas["emails"]["cashier_a"], token) is True

    r = await client.delete(
        f"/companies/{duas_empresas['company_a_id']}/users/{cashier_id}/trusted-devices",
        headers=auth(duas_empresas["owner_a_token"]),
    )
    assert r.status_code == 200
    assert await _is_trusted(client, duas_empresas["emails"]["cashier_a"], token) is False

    async with svc.AsyncSessionLocal() as db:
        u = await db.get(svc.User, cashier_id)
        assert u.mfa_enabled is True  # 2FA continua ativo — só o dispositivo saiu


async def test_revogar_dispositivo_isolamento_multitenant(client, duas_empresas):
    cashier_b_id = duas_empresas["ids"]["cashier_b"]
    await _trust(client, cashier_b_id)

    r = await client.delete(
        f"/companies/{duas_empresas['company_a_id']}/users/{cashier_b_id}/trusted-devices",
        headers=auth(duas_empresas["owner_a_token"]),
    )
    assert r.status_code == 404


async def test_revogar_dispositivo_usuario_inexistente_na_empresa(client, duas_empresas):
    r = await client.delete(
        f"/companies/{duas_empresas['company_a_id']}/users/999999/trusted-devices",
        headers=auth(duas_empresas["owner_a_token"]),
    )
    assert r.status_code == 404


# ── Cascata: desativar mfa_policy da empresa ────────────────────────────────

async def test_desativar_politica_limpa_mfa_e_dispositivos_de_todos_usuarios(client, duas_empresas):
    import main as svc
    owner_id = duas_empresas["ids"]["owner_a"]
    cashier_id = duas_empresas["ids"]["cashier_a"]

    for uid, role in ((owner_id, "owner"), (cashier_id, "cashier")):
        tok = make_jwt(str(uid), role, duas_empresas["company_a_id"])
        setup = await client.post("/users/me/mfa/setup", headers=auth(tok))
        code = pyotp.TOTP(setup.json()["secret"]).now()
        await client.post("/users/me/mfa/confirm", json={"code": code}, headers=auth(tok))
        await _trust(client, uid)

    r = await client.put(
        f"/companies/{duas_empresas['company_a_id']}/security",
        json={"mfa_policy": "disabled"},
        headers=auth(duas_empresas["owner_a_token"]),
    )
    assert r.status_code == 200

    async with svc.AsyncSessionLocal() as db:
        owner = await db.get(svc.User, owner_id)
        cashier = await db.get(svc.User, cashier_id)
        assert owner.mfa_enabled is False
        assert cashier.mfa_enabled is False

        from sqlalchemy import select as sa_select
        rows = (await db.execute(
            sa_select(svc.TrustedDevice).where(
                svc.TrustedDevice.user_id.in_([owner_id, cashier_id]),
                svc.TrustedDevice.revoked_at.is_(None),
            )
        )).scalars().all()
        assert rows == []


async def test_desativar_politica_sem_ninguem_com_mfa_e_idempotente(client, duas_empresas):
    r = await client.put(
        f"/companies/{duas_empresas['company_a_id']}/security",
        json={"mfa_policy": "disabled"},
        headers=auth(duas_empresas["owner_a_token"]),
    )
    assert r.status_code == 200
    r2 = await client.put(
        f"/companies/{duas_empresas['company_a_id']}/security",
        json={"mfa_policy": "disabled"},
        headers=auth(duas_empresas["owner_a_token"]),
    )
    assert r2.status_code == 200


async def test_trocar_entre_opcional_e_obrigatorio_nao_afeta_mfa_individual(client, duas_empresas):
    import main as svc
    owner_id = duas_empresas["ids"]["owner_a"]
    owner_token = duas_empresas["owner_a_token"]

    setup = await client.post("/users/me/mfa/setup", headers=auth(owner_token))
    code = pyotp.TOTP(setup.json()["secret"]).now()
    await client.post("/users/me/mfa/confirm", json={"code": code}, headers=auth(owner_token))

    await client.put(
        f"/companies/{duas_empresas['company_a_id']}/security",
        json={"mfa_policy": "required"},
        headers=auth(owner_token),
    )

    async with svc.AsyncSessionLocal() as db:
        owner = await db.get(svc.User, owner_id)
        assert owner.mfa_enabled is True
