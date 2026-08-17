import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta

import pytest
import respx
import httpx
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker


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


def _company_svc_url() -> str:
    import main as svc
    return svc.COMPANY_SVC


def _make_token(sub: str, company: int, role: str, token_type: str | None = None) -> str:
    from jose import jwt
    payload = {"sub": sub, "company": company, "role": role,
               "exp": datetime.utcnow() + timedelta(minutes=10)}
    if token_type:
        payload["type"] = token_type
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm="HS256")


# ── /auth/login com X-Device-Trust ──────────────────────────────────────────

async def test_login_com_dispositivo_confiavel_pula_mfa(client):
    base = _company_svc_url()
    with respx.mock:
        respx.post(f"{base}/internal/verify-credentials").mock(
            return_value=httpx.Response(200, json={
                "id": 5001, "company_id": 1, "role": "owner", "name": "Owner", "mfa_status": "verify",
            })
        )
        respx.post(f"{base}/internal/verify-trusted-device").mock(
            return_value=httpx.Response(200, json={"trusted": True})
        )
        r = await client.post(
            "/auth/login",
            json={"email": "owner@test.com", "password": "certa"},
            headers={"X-Device-Trust": "algum-token-de-dispositivo"},
        )
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body
    assert "mfa_required" not in body


async def test_login_com_dispositivo_nao_confiavel_pede_mfa(client):
    base = _company_svc_url()
    with respx.mock:
        respx.post(f"{base}/internal/verify-credentials").mock(
            return_value=httpx.Response(200, json={
                "id": 5002, "company_id": 1, "role": "owner", "name": "Owner", "mfa_status": "verify",
            })
        )
        respx.post(f"{base}/internal/verify-trusted-device").mock(
            return_value=httpx.Response(200, json={"trusted": False})
        )
        r = await client.post(
            "/auth/login",
            json={"email": "owner@test.com", "password": "certa"},
            headers={"X-Device-Trust": "token-de-outro-navegador"},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["mfa_required"] is True


async def test_login_sem_header_device_trust_pede_mfa_normalmente(client):
    base = _company_svc_url()
    with respx.mock:
        respx.post(f"{base}/internal/verify-credentials").mock(
            return_value=httpx.Response(200, json={
                "id": 5003, "company_id": 1, "role": "owner", "name": "Owner", "mfa_status": "verify",
            })
        )
        r = await client.post("/auth/login", json={"email": "owner@test.com", "password": "certa"})
    assert r.json()["mfa_required"] is True


# ── /auth/login/mfa-verify com trust_device ─────────────────────────────────

async def test_mfa_verify_com_trust_device_retorna_device_token(client):
    base = _company_svc_url()
    mfa_token = _make_token("5010", 1, "owner", token_type="mfa_pending")
    with respx.mock:
        respx.post(f"{base}/internal/verify-totp").mock(
            return_value=httpx.Response(200, json={"ok": True, "used_backup_code": False})
        )
        respx.post(f"{base}/internal/trust-device").mock(
            return_value=httpx.Response(200, json={"device_token": "novo-token-de-dispositivo"})
        )
        r = await client.post(
            "/auth/login/mfa-verify",
            json={"mfa_token": mfa_token, "code": "123456", "trust_device": True},
        )
    assert r.status_code == 200
    assert r.json()["device_token"] == "novo-token-de-dispositivo"


async def test_mfa_verify_sem_trust_device_nao_retorna_device_token(client):
    base = _company_svc_url()
    mfa_token = _make_token("5011", 1, "owner", token_type="mfa_pending")
    with respx.mock:
        respx.post(f"{base}/internal/verify-totp").mock(
            return_value=httpx.Response(200, json={"ok": True, "used_backup_code": False})
        )
        r = await client.post(
            "/auth/login/mfa-verify",
            json={"mfa_token": mfa_token, "code": "123456", "trust_device": False},
        )
    assert r.status_code == 200
    assert r.json()["device_token"] is None
