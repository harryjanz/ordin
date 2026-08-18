import os
import sys
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta

import bcrypt
import httpx
import pytest
import respx
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


TOKEN = "Zzord097xRecuperacao"


@pytest.fixture(autouse=True)
def _limpa_rate_limit_redis():
    # Redis real e compartilhado entre execuções (mesmo padrão de flakiness
    # já documentado no projeto pra rate limit de PIN) — sem isso, o teste
    # de rate limit bloqueia o IP de teste pros testes seguintes.
    import main as svc
    keys = svc.redis_client.keys("pwreset_*")
    if keys:
        svc.redis_client.delete(*keys)
    yield
    keys = svc.redis_client.keys("pwreset_*")
    if keys:
        svc.redis_client.delete(*keys)


def _reset_email_url(svc) -> str:
    return f"{svc.NOTIFICATION_SERVICE_URL}/internal/send-password-reset"


def _revoke_sessions_url(svc) -> str:
    return f"{svc.AUTH_SERVICE_URL}/internal/revoke-sessions"


def _extract_token(set_password_url: str) -> str:
    return parse_qs(urlparse(set_password_url).query)["token"][0]


@pytest.fixture
async def duas_empresas(client):
    import main as svc
    pin_hash = bcrypt.hashpw(b"1234", bcrypt.gensalt(4)).decode()
    pw_hash = bcrypt.hashpw(b"senhaAntiga123!", bcrypt.gensalt(4)).decode()
    async with svc.AsyncSessionLocal() as db:
        co_a = svc.Company(
            name=f"{TOKEN} Empresa A", document="10000000000766",
            pin_hash=pin_hash, plan="free", state="SP",
        )
        co_b = svc.Company(
            name=f"{TOKEN} Empresa B", document="10000000000600",
            pin_hash=pin_hash, plan="free", state="SP",
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
        db.add_all([owner_a, cashier_a, owner_b])
        await db.commit()
        for u in (owner_a, cashier_a, owner_b):
            await db.refresh(u)

        co_a_id, co_b_id = co_a.id, co_b.id
        ids = {"owner_a": owner_a.id, "cashier_a": cashier_a.id, "owner_b": owner_b.id}
        emails = {
            "owner_a": f"{TOKEN.lower()}.ownera@teste.com",
            "cashier_a": f"{TOKEN.lower()}.cashiera@teste.com",
        }

        yield {
            "company_a_id": co_a_id,
            "company_b_id": co_b_id,
            "owner_a_token": make_jwt(str(owner_a.id), "owner", co_a_id),
            "ids": ids,
            "emails": emails,
        }

        all_ids = list(ids.values())
        await db.execute(sa_delete(svc.UserInviteToken).where(svc.UserInviteToken.user_id.in_(all_ids)))
        await db.execute(sa_delete(svc.TrustedDevice).where(svc.TrustedDevice.user_id.in_(all_ids)))
        await db.execute(sa_delete(svc.User).where(svc.User.company_id.in_([co_a_id, co_b_id])))
        await db.execute(sa_delete(svc.Company).where(svc.Company.id.in_([co_a_id, co_b_id])))
        await db.commit()


# ── POST /users/forgot-password ─────────────────────────────────────────────

async def test_forgot_password_email_existente_envia_email(client, duas_empresas):
    import main as svc
    with respx.mock:
        route = respx.post(_reset_email_url(svc)).mock(return_value=httpx.Response(200, json={"sent": True}))
        r = await client.post("/users/forgot-password", json={"email": duas_empresas["emails"]["owner_a"]})
    assert r.status_code == 200
    assert r.json() == {"sent": True}
    assert route.called


async def test_forgot_password_email_inexistente_resposta_identica(client, duas_empresas):
    import main as svc
    with respx.mock:
        route = respx.post(_reset_email_url(svc)).mock(return_value=httpx.Response(200, json={"sent": True}))
        r = await client.post("/users/forgot-password", json={"email": f"{TOKEN.lower()}.naoexiste@teste.com"})
    assert r.status_code == 200
    assert r.json() == {"sent": True}
    assert not route.called


async def test_forgot_password_rate_limit_bloqueia_apos_limite(client, duas_empresas):
    import main as svc
    email = f"{TOKEN.lower()}.ratelimit@teste.com"
    with respx.mock:
        respx.post(_reset_email_url(svc)).mock(return_value=httpx.Response(200, json={"sent": True}))
        # mesma semântica do check_rate_limit original (pin_attempts): a
        # N-ésima tentativa (== RATE_MAX) já é a que bloqueia, não a N+1-ésima.
        for _ in range(svc.FORGOT_PASSWORD_RATE_MAX - 1):
            r = await client.post("/users/forgot-password", json={"email": email})
            assert r.status_code == 200
        r = await client.post("/users/forgot-password", json={"email": email})
    assert r.status_code == 429


# ── POST /users/complete-registration (reaproveitado pra reset) ────────────

async def test_reset_de_senha_atualiza_senha_e_revoga_dispositivo_sem_tocar_mfa(client, duas_empresas):
    import main as svc
    owner_id = duas_empresas["ids"]["owner_a"]
    owner_email = duas_empresas["emails"]["owner_a"]

    # simula 2FA ativo + dispositivo confiável, sem passar pelo fluxo de
    # login completo (só testando o efeito colateral do reset)
    async with svc.AsyncSessionLocal() as db:
        u = await db.get(svc.User, owner_id)
        u.totp_secret = "JBSWY3DPEHPK3PXP"
        u.totp_enabled_at = datetime.utcnow()
        db.add(svc.TrustedDevice(
            user_id=owner_id, token_hash="x" * 64,
            device_label="Chrome", expires_at=datetime.utcnow() + timedelta(days=7),
        ))
        await db.commit()

    with respx.mock:
        email_route = respx.post(_reset_email_url(svc)).mock(return_value=httpx.Response(200, json={"sent": True}))
        sessions_route = respx.post(_revoke_sessions_url(svc)).mock(return_value=httpx.Response(200, json={"ok": True}))
        r = await client.post("/users/forgot-password", json={"email": owner_email})
        assert r.status_code == 200
        set_password_url = email_route.calls.last.request.content
        import json as jsonlib
        raw_token = _extract_token(jsonlib.loads(set_password_url)["set_password_url"])

        r2 = await client.post("/users/complete-registration", json={"token": raw_token, "password": "senhaNova123!"})
        assert r2.status_code == 200
        assert sessions_route.called

    async with svc.AsyncSessionLocal() as db:
        u = await db.get(svc.User, owner_id)
        assert bcrypt.checkpw(b"senhaNova123!", u.password_hash.encode())
        assert u.mfa_enabled is True  # MFA intacto — reset de senha não mexe nele

        from sqlalchemy import select as sa_select
        devices = (await db.execute(
            sa_select(svc.TrustedDevice).where(
                svc.TrustedDevice.user_id == owner_id, svc.TrustedDevice.revoked_at.is_(None)
            )
        )).scalars().all()
        assert devices == []  # dispositivo confiável revogado


async def test_link_reset_ja_usado_nao_pode_ser_reutilizado(client, duas_empresas):
    import main as svc
    owner_email = duas_empresas["emails"]["owner_a"]
    with respx.mock:
        respx.post(_reset_email_url(svc)).mock(return_value=httpx.Response(200, json={"sent": True}))
        respx.post(_revoke_sessions_url(svc)).mock(return_value=httpx.Response(200, json={"ok": True}))
        email_route = respx.post(_reset_email_url(svc))
        r = await client.post("/users/forgot-password", json={"email": owner_email})
        assert r.status_code == 200
        import json as jsonlib
        raw_token = _extract_token(jsonlib.loads(email_route.calls.last.request.content)["set_password_url"])

        r2 = await client.post("/users/complete-registration", json={"token": raw_token, "password": "outraSenha123!"})
        assert r2.status_code == 200
        r3 = await client.post("/users/complete-registration", json={"token": raw_token, "password": "maisOutra123!"})
        assert r3.status_code == 400


# ── Disparo administrativo ──────────────────────────────────────────────────

async def test_owner_dispara_reset_para_usuario_da_propria_empresa(client, duas_empresas):
    import main as svc
    with respx.mock:
        route = respx.post(_reset_email_url(svc)).mock(return_value=httpx.Response(200, json={"sent": True}))
        r = await client.post(
            f"/companies/{duas_empresas['company_a_id']}/users/{duas_empresas['ids']['cashier_a']}/send-password-reset",
            headers=auth(duas_empresas["owner_a_token"]),
        )
    assert r.status_code == 200
    assert route.called


async def test_owner_nao_dispara_reset_para_usuario_de_outra_empresa(client, duas_empresas):
    r = await client.post(
        f"/companies/{duas_empresas['company_a_id']}/users/{duas_empresas['ids']['owner_b']}/send-password-reset",
        headers=auth(duas_empresas["owner_a_token"]),
    )
    assert r.status_code == 404
