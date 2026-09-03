import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
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


def _internal_headers():
    return {"X-Internal-Secret": os.environ.get("INTERNAL_SECRET", "test-internal-ci")}


async def test_revoke_sessions_revoga_todos_os_refresh_tokens_do_usuario(client):
    from datetime import datetime, timedelta

    import main as svc
    async with svc.AsyncSessionLocal() as db:
        db.add_all([
            svc.RefreshToken(user_id=9001, token_hash="a" * 64, revoked=False,
                              expires_at=datetime.utcnow() + timedelta(days=7)),
            svc.RefreshToken(user_id=9001, token_hash="b" * 64, revoked=False,
                              expires_at=datetime.utcnow() + timedelta(days=7)),
            svc.RefreshToken(user_id=9002, token_hash="c" * 64, revoked=False,
                              expires_at=datetime.utcnow() + timedelta(days=7)),
        ])
        await db.commit()

    r = await client.post("/internal/revoke-sessions", json={"user_id": 9001}, headers=_internal_headers())
    assert r.status_code == 200

    async with svc.AsyncSessionLocal() as db:
        from sqlalchemy import select
        rows = (await db.execute(select(svc.RefreshToken))).scalars().all()
        by_user = {t.user_id: [] for t in rows}
        for t in rows:
            by_user[t.user_id].append(t.revoked)
        assert all(by_user[9001])       # todos revogados
        assert not any(by_user[9002])   # outro usuário intacto


async def test_revoke_sessions_exige_internal_secret(client):
    r = await client.post("/internal/revoke-sessions", json={"user_id": 9001}, headers={"X-Internal-Secret": "errado"})
    assert r.status_code == 403
