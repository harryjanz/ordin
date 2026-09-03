import json
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


def _audit_lines(captured: str) -> list[dict]:
    return [json.loads(l) for l in captured.splitlines() if '"audit"' in l]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# CA-001 + CA-007: regenerate-pin emite audit com actor do JWT
async def test_regenerate_pin_emite_audit(client, capsys):
    import main as svc
    # Cria empresa dinâmica + token matching
    async with svc.AsyncSessionLocal() as db:
        pin_hash = bcrypt.hashpw(b"9999", bcrypt.gensalt(4)).decode()
        co = svc.Company(name="__audit_test__", document="99999999999",
                         pin_hash=pin_hash, plan="free", payment_provider="mock", state="SP")
        db.add(co); await db.commit()
        company_id = co.id

    token = _make_token("owner", company_id)
    r = await client.post(f"/companies/{company_id}/regenerate-pin", headers=auth(token))
    assert r.status_code == 200
    assert "pin" in r.json()

    entries = _audit_lines(capsys.readouterr().out)
    assert any(e["event"] == "pin_regenerated" for e in entries), "pin_regenerated não encontrado"
    entry = next(e for e in entries if e["event"] == "pin_regenerated")
    assert entry["result"] == "success"
    assert entry["detail"]["company_id_alvo"] == company_id
    assert entry["audit"] is True
    assert "timestamp" in entry

    # cleanup
    async with svc.AsyncSessionLocal() as db:
        await db.execute(sa_delete(svc.Company).where(svc.Company.id == company_id))
        await db.commit()
