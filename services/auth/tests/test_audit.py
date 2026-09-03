import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

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


def _audit_lines(captured: str) -> list[dict]:
    return [json.loads(l) for l in captured.splitlines() if '"audit"' in l]


# CA-001 + CA-003: login_failure é logado antes do 401
async def test_login_failure_emite_audit(client, capsys):
    base = _company_svc_url()
    with respx.mock:
        respx.post(f"{base}/internal/verify-credentials").mock(
            return_value=httpx.Response(401)
        )
        r = await client.post("/auth/login", json={"email": "x@x.com", "password": "errado"})
    assert r.status_code == 401
    entries = _audit_lines(capsys.readouterr().out)
    assert any(e["event"] == "login_failure" for e in entries), "login_failure não encontrado no audit log"
    entry = next(e for e in entries if e["event"] == "login_failure")
    assert entry["actor"] == "x@x.com"          # CA-005
    assert entry["actor_id"] is None              # CA-005
    assert entry["result"] == "failure"
    assert "timestamp" in entry                   # CA-002
    assert entry["audit"] is True                 # CA-006


# CA-001: login_success é logado
async def test_login_success_emite_audit(client, capsys):
    base = _company_svc_url()
    with respx.mock:
        respx.post(f"{base}/internal/verify-credentials").mock(
            return_value=httpx.Response(200, json={"id": 2, "company_id": 1, "role": "admin"})
        )
        r = await client.post("/auth/login", json={"email": "carlos@burgerhouse.com", "password": "burger123"})
    assert r.status_code == 200
    entries = _audit_lines(capsys.readouterr().out)
    assert any(e["event"] == "login_success" for e in entries)
    entry = next(e for e in entries if e["event"] == "login_success")
    assert entry["actor"] == "carlos@burgerhouse.com"
    assert entry["actor_id"] == 2
    assert entry["company_id"] == 1
    assert entry["result"] == "success"


# CA-001: pin_login_failure é logado
async def test_pin_login_failure_emite_audit(client, capsys):
    base = _company_svc_url()
    with respx.mock:
        respx.post(f"{base}/internal/verify-pin").mock(
            return_value=httpx.Response(401)
        )
        r = await client.post("/auth/pin-login", json={"pin": "0000", "terminal_id": 1})
    assert r.status_code == 401
    entries = _audit_lines(capsys.readouterr().out)
    assert any(e["event"] == "pin_login_failure" for e in entries)
    entry = next(e for e in entries if e["event"] == "pin_login_failure")
    assert entry["actor_id"] is None
    assert entry["result"] == "failure"


# CA-001: pin_login_success é logado
async def test_pin_login_success_emite_audit(client, capsys):
    base = _company_svc_url()
    with respx.mock:
        respx.post(f"{base}/internal/verify-pin").mock(
            return_value=httpx.Response(200, json={
                "company": {"id": 1, "name": "Burger House", "plan": "free"},
                "terminal": {"id": 1, "label": "Totem 1"},
            })
        )
        r = await client.post("/auth/pin-login", json={"pin": "1234", "terminal_id": 1})
    assert r.status_code == 200
    entries = _audit_lines(capsys.readouterr().out)
    assert any(e["event"] == "pin_login_success" for e in entries)
    entry = next(e for e in entries if e["event"] == "pin_login_success")
    assert entry["company_id"] == 1
    assert entry["result"] == "success"


# CA-001: logout é logado (usa token gerado localmente, sem inserir no DB)
async def test_logout_emite_audit(client, capsys):
    from datetime import timedelta

    import main as svc
    fake_refresh = svc.make_token(
        {"sub": "2", "type": "refresh", "company": 1, "role": "admin"},
        timedelta(days=7),
    )
    r = await client.post("/auth/logout", json={"refresh_token": fake_refresh})
    assert r.status_code == 200
    entries = _audit_lines(capsys.readouterr().out)
    assert any(e["event"] == "logout" for e in entries)
    entry = next(e for e in entries if e["event"] == "logout")
    assert entry["result"] == "success"
