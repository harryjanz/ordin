import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta

import httpx
import pytest
import respx
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


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


def _make_token(sub: str, company: int, role: str, token_type: str | None = None, expires_in_minutes: int = 60) -> str:
    from jose import jwt
    payload = {"sub": sub, "company": company, "role": role,
               "exp": datetime.utcnow() + timedelta(minutes=expires_in_minutes)}
    if token_type:
        payload["type"] = token_type
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm="HS256")


# ── /auth/login — bifurcação por mfa_status ─────────────────────────────────

async def test_login_sem_mfa_retorna_tokens_finais(client):
    base = _company_svc_url()
    with respx.mock:
        respx.post(f"{base}/internal/verify-credentials").mock(
            return_value=httpx.Response(200, json={
                "id": 1, "company_id": 1, "role": "owner", "name": "Owner", "mfa_status": "none",
            })
        )
        r = await client.post("/auth/login", json={"email": "owner@test.com", "password": "certa"})
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body
    assert "mfa_required" not in body


async def test_login_com_totp_ativo_retorna_mfa_required(client):
    base = _company_svc_url()
    with respx.mock:
        respx.post(f"{base}/internal/verify-credentials").mock(
            return_value=httpx.Response(200, json={
                "id": 2, "company_id": 1, "role": "owner", "name": "Owner", "mfa_status": "verify",
            })
        )
        r = await client.post("/auth/login", json={"email": "owner2fa@test.com", "password": "certa"})
    assert r.status_code == 200
    body = r.json()
    assert body["mfa_required"] is True
    assert body["mfa_status"] == "verify"
    assert "access_token" not in body
    assert body["mfa_token"]


async def test_login_com_politica_obrigatoria_retorna_setup_required(client):
    base = _company_svc_url()
    with respx.mock:
        respx.post(f"{base}/internal/verify-credentials").mock(
            return_value=httpx.Response(200, json={
                "id": 3, "company_id": 1, "role": "cashier", "name": "Caixa", "mfa_status": "setup_required",
            })
        )
        r = await client.post("/auth/login", json={"email": "caixa@test.com", "password": "certa"})
    assert r.status_code == 200
    body = r.json()
    assert body["mfa_required"] is True
    assert body["mfa_status"] == "setup_required"


# ── /auth/login/mfa-verify ───────────────────────────────────────────────────

async def test_mfa_verify_codigo_correto_emite_tokens_finais(client):
    base = _company_svc_url()
    mfa_token = _make_token("42", 1, "owner", token_type="mfa_pending")
    with respx.mock:
        respx.post(f"{base}/internal/verify-totp").mock(
            return_value=httpx.Response(200, json={"ok": True, "used_backup_code": False})
        )
        r = await client.post("/auth/login/mfa-verify", json={"mfa_token": mfa_token, "code": "123456"})
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body
    assert "refresh_token" in body


async def test_mfa_verify_codigo_errado_retorna_401(client):
    base = _company_svc_url()
    mfa_token = _make_token("43", 1, "owner", token_type="mfa_pending")
    with respx.mock:
        respx.post(f"{base}/internal/verify-totp").mock(return_value=httpx.Response(401))
        r = await client.post("/auth/login/mfa-verify", json={"mfa_token": mfa_token, "code": "000000"})
    assert r.status_code == 401


async def test_mfa_verify_rejeita_token_sem_type_mfa_pending(client):
    """Um access token normal (sem "type") não pode ser usado pra completar
    o segundo fator — só um mfa_token de verdade serve aqui."""
    normal_token = _make_token("44", 1, "owner")
    r = await client.post("/auth/login/mfa-verify", json={"mfa_token": normal_token, "code": "123456"})
    assert r.status_code == 401


async def test_mfa_verify_rejeita_refresh_token(client):
    refresh_like = _make_token("45", 1, "owner", token_type="refresh")
    r = await client.post("/auth/login/mfa-verify", json={"mfa_token": refresh_like, "code": "123456"})
    assert r.status_code == 401


async def test_mfa_verify_rejeita_token_expirado(client):
    expired = _make_token("46", 1, "owner", token_type="mfa_pending", expires_in_minutes=-1)
    r = await client.post("/auth/login/mfa-verify", json={"mfa_token": expired, "code": "123456"})
    assert r.status_code == 401


# ── Totem (PIN) não é afetado ────────────────────────────────────────────────

async def test_pin_login_nao_pede_totp(client):
    base = _company_svc_url()
    with respx.mock:
        respx.post(f"{base}/internal/verify-pin").mock(
            return_value=httpx.Response(200, json={
                "company": {"id": 1, "name": "Burger House", "plan": "free",
                            "visual_theme": "ordin", "visual_mode": "light"},
                "terminal": {"id": 1, "label": "Caixa 1", "tef_number": None},
            })
        )
        r = await client.post("/auth/pin-login", json={"pin": "1234", "terminal_id": 1})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert "mfa_required" not in body
