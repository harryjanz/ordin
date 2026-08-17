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


TOKEN = "Zzord092xDispositivo"
INTERNAL_HEADERS = {"X-Internal-Secret": os.environ.get("INTERNAL_SECRET", "test-internal-secret-ci")}


@pytest.fixture
async def empresa(client):
    import main as svc
    pin_hash = bcrypt.hashpw(b"1234", bcrypt.gensalt(4)).decode()
    pw_hash = bcrypt.hashpw(b"senhaSegura123!", bcrypt.gensalt(4)).decode()
    async with svc.AsyncSessionLocal() as db:
        co = svc.Company(
            name=f"{TOKEN} Empresa", document="10000000000766",
            pin_hash=pin_hash, plan="free", state="SP", mfa_policy="optional",
        )
        db.add(co)
        await db.flush()

        owner = svc.User(
            company_id=co.id, name=f"{TOKEN} Owner",
            email=f"{TOKEN.lower()}.owner@teste.com",
            password_hash=pw_hash, role="owner", active=True,
        )
        outro = svc.User(
            company_id=co.id, name=f"{TOKEN} Outro",
            email=f"{TOKEN.lower()}.outro@teste.com",
            password_hash=pw_hash, role="manager", active=True,
        )
        db.add_all([owner, outro])
        await db.commit()
        await db.refresh(owner)
        await db.refresh(outro)

        co_id = co.id
        ids = {"owner": owner.id, "outro": outro.id}

        yield {
            "company_id": co_id,
            "owner_token": make_jwt(str(owner.id), "owner", co_id),
            "outro_token": make_jwt(str(outro.id), "manager", co_id),
            "ids": ids,
            "owner_email": f"{TOKEN.lower()}.owner@teste.com",
        }

        await db.execute(sa_delete(svc.TrustedDevice).where(svc.TrustedDevice.user_id.in_([owner.id, outro.id])))
        await db.execute(sa_delete(svc.UserBackupCode).where(svc.UserBackupCode.user_id.in_([owner.id, outro.id])))
        await db.execute(sa_delete(svc.User).where(svc.User.company_id == co_id))
        await db.execute(sa_delete(svc.Company).where(svc.Company.id == co_id))
        await db.commit()


async def _ativar_2fa(client, empresa, token_key="owner_token"):
    setup = await client.post("/users/me/mfa/setup", headers=auth(empresa[token_key]))
    code = pyotp.TOTP(setup.json()["secret"]).now()
    await client.post("/users/me/mfa/confirm", json={"code": code}, headers=auth(empresa[token_key]))


# ── /internal/trust-device + /internal/verify-trusted-device ───────────────

async def test_trust_device_emite_token(client, empresa):
    r = await client.post(
        "/internal/trust-device",
        json={"user_id": empresa["ids"]["owner"], "device_label": "Chrome no Linux"},
        headers=INTERNAL_HEADERS,
    )
    assert r.status_code == 200
    assert len(r.json()["device_token"]) > 20


async def test_verify_trusted_device_token_valido(client, empresa):
    trust = await client.post(
        "/internal/trust-device",
        json={"user_id": empresa["ids"]["owner"], "device_label": "Chrome"},
        headers=INTERNAL_HEADERS,
    )
    token = trust.json()["device_token"]
    r = await client.post(
        "/internal/verify-trusted-device",
        json={"email": empresa["owner_email"], "device_token": token},
        headers=INTERNAL_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["trusted"] is True


async def test_verify_trusted_device_token_invalido(client, empresa):
    r = await client.post(
        "/internal/verify-trusted-device",
        json={"email": empresa["owner_email"], "device_token": "token-que-nao-existe"},
        headers=INTERNAL_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["trusted"] is False


async def test_verify_trusted_device_expirado(client, empresa):
    import main as svc
    trust = await client.post(
        "/internal/trust-device",
        json={"user_id": empresa["ids"]["owner"], "device_label": "Chrome"},
        headers=INTERNAL_HEADERS,
    )
    token = trust.json()["device_token"]
    async with svc.AsyncSessionLocal() as db:
        from sqlalchemy import update as sa_update
        await db.execute(
            sa_update(svc.TrustedDevice)
            .where(svc.TrustedDevice.user_id == empresa["ids"]["owner"])
            .values(expires_at=datetime.utcnow() - timedelta(days=1))
        )
        await db.commit()
    r = await client.post(
        "/internal/verify-trusted-device",
        json={"email": empresa["owner_email"], "device_token": token},
        headers=INTERNAL_HEADERS,
    )
    assert r.json()["trusted"] is False


async def test_verify_trusted_device_renova_janela(client, empresa):
    import main as svc
    trust = await client.post(
        "/internal/trust-device",
        json={"user_id": empresa["ids"]["owner"], "device_label": "Chrome"},
        headers=INTERNAL_HEADERS,
    )
    token = trust.json()["device_token"]
    async with svc.AsyncSessionLocal() as db:
        from sqlalchemy import update as sa_update
        await db.execute(
            sa_update(svc.TrustedDevice)
            .where(svc.TrustedDevice.user_id == empresa["ids"]["owner"])
            .values(expires_at=datetime.utcnow() + timedelta(days=1))
        )
        await db.commit()

    await client.post(
        "/internal/verify-trusted-device",
        json={"email": empresa["owner_email"], "device_token": token},
        headers=INTERNAL_HEADERS,
    )

    async with svc.AsyncSessionLocal() as db:
        from sqlalchemy import select as sa_select
        result = await db.execute(sa_select(svc.TrustedDevice).filter_by(user_id=empresa["ids"]["owner"]))
        device = result.scalars().first()
        assert device.expires_at > datetime.utcnow() + timedelta(days=6)


async def test_verify_trusted_device_de_outro_usuario_nao_serve(client, empresa):
    """Isolamento: token de dispositivo do owner não pode ser usado no e-mail de outro usuário."""
    trust = await client.post(
        "/internal/trust-device",
        json={"user_id": empresa["ids"]["owner"], "device_label": "Chrome"},
        headers=INTERNAL_HEADERS,
    )
    token = trust.json()["device_token"]
    r = await client.post(
        "/internal/verify-trusted-device",
        json={"email": f"{TOKEN.lower()}.outro@teste.com", "device_token": token},
        headers=INTERNAL_HEADERS,
    )
    assert r.json()["trusted"] is False


# ── GET/DELETE /users/me/trusted-devices ────────────────────────────────────

async def test_listar_dispositivos_confiaveis(client, empresa):
    await client.post(
        "/internal/trust-device",
        json={"user_id": empresa["ids"]["owner"], "device_label": "Chrome no Linux"},
        headers=INTERNAL_HEADERS,
    )
    r = await client.get("/users/me/trusted-devices", headers=auth(empresa["owner_token"]))
    assert r.status_code == 200
    devices = r.json()["devices"]
    assert len(devices) == 1
    assert devices[0]["device_label"] == "Chrome no Linux"


async def test_revogar_dispositivo_proprio(client, empresa):
    trust = await client.post(
        "/internal/trust-device",
        json={"user_id": empresa["ids"]["owner"], "device_label": "Chrome"},
        headers=INTERNAL_HEADERS,
    )
    token = trust.json()["device_token"]
    devices = await client.get("/users/me/trusted-devices", headers=auth(empresa["owner_token"]))
    device_id = devices.json()["devices"][0]["id"]

    r = await client.delete(f"/users/me/trusted-devices/{device_id}", headers=auth(empresa["owner_token"]))
    assert r.status_code == 200

    verify = await client.post(
        "/internal/verify-trusted-device",
        json={"email": empresa["owner_email"], "device_token": token},
        headers=INTERNAL_HEADERS,
    )
    assert verify.json()["trusted"] is False


async def test_revogar_dispositivo_de_outro_usuario_retorna_404(client, empresa):
    await client.post(
        "/internal/trust-device",
        json={"user_id": empresa["ids"]["owner"], "device_label": "Chrome"},
        headers=INTERNAL_HEADERS,
    )
    devices = await client.get("/users/me/trusted-devices", headers=auth(empresa["owner_token"]))
    device_id = devices.json()["devices"][0]["id"]

    r = await client.delete(f"/users/me/trusted-devices/{device_id}", headers=auth(empresa["outro_token"]))
    assert r.status_code == 404


# ── Desativar 2FA limpa dispositivos confiáveis ─────────────────────────────

async def test_desativar_2fa_self_service_limpa_dispositivos(client, empresa):
    await _ativar_2fa(client, empresa)
    await client.post(
        "/internal/trust-device",
        json={"user_id": empresa["ids"]["owner"], "device_label": "Chrome"},
        headers=INTERNAL_HEADERS,
    )
    await client.post(
        "/users/me/mfa/disable", json={"password": "senhaSegura123!"}, headers=auth(empresa["owner_token"])
    )
    r = await client.get("/users/me/trusted-devices", headers=auth(empresa["owner_token"]))
    assert r.json()["devices"] == []


async def test_override_administrativo_limpa_dispositivos(client, empresa):
    await _ativar_2fa(client, empresa, token_key="outro_token")
    await client.post(
        "/internal/trust-device",
        json={"user_id": empresa["ids"]["outro"], "device_label": "Chrome"},
        headers=INTERNAL_HEADERS,
    )
    await client.post(
        f"/companies/{empresa['company_id']}/users/{empresa['ids']['outro']}/mfa/reset",
        headers=auth(empresa["owner_token"]),
    )
    r = await client.get("/users/me/trusted-devices", headers=auth(empresa["outro_token"]))
    assert r.json()["devices"] == []
