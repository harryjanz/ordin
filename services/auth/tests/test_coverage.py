"""
Testes de cobertura para paths não cobertos pelos outros test files.
- Rate limit blocked (linhas 22-24)
- Rate limit exceeded (linhas 31-33)
- Health check redis down (linha 300)
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
import respx
import httpx
from unittest.mock import patch, MagicMock
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


def _svc_url() -> str:
    import main as svc
    return svc.COMPANY_SVC


# ── Rate limit: IP já bloqueado (linhas 22-24) ────────────────────────────────

async def test_rate_limit_ip_bloqueado_retorna_429(client):
    """Simula IP já bloqueado no Redis (ttl > 0) → 429 antes de chamar company-service."""
    import main as svc
    with patch.object(svc.redis_client, 'ttl', return_value=900):
        r = await client.post("/auth/pin-login", json={"pin": "0000", "terminal_id": 1})
    assert r.status_code == 429
    assert "Bloqueado" in r.json()["detail"]


# ── Rate limit: tentativas excedidas (linhas 31-33) ──────────────────────────

async def test_rate_limit_tentativas_excedidas_retorna_429(client):
    """Simula incr retornando >= RATE_MAX → bloqueia IP → 429."""
    import main as svc
    mock_redis = MagicMock()
    mock_redis.ttl.return_value = 0
    mock_redis.incr.return_value = svc.RATE_MAX  # 5ª tentativa → bloqueia
    mock_redis.expire.return_value = True
    mock_redis.set.return_value = True
    mock_redis.delete.return_value = 1
    with patch.object(svc, 'redis_client', mock_redis):
        r = await client.post("/auth/pin-login", json={"pin": "9999", "terminal_id": 1})
    assert r.status_code == 429
    assert "bloqueado" in r.json()["detail"].lower()


# ── validate_pin sucesso (linhas 173-174) ────────────────────────────────────

async def test_validate_pin_sucesso(client):
    """Moca company-service retornando 200 → cobre reset_rate_limit + return."""
    base = _svc_url()
    with respx.mock:
        respx.post(f"{base}/internal/validate-pin").mock(
            return_value=httpx.Response(200, json={
                "company": {"id": 1, "name": "Burger House", "plan": "free"}
            })
        )
        r = await client.post("/auth/validate-pin", json={"pin": "1234"})
    assert r.status_code == 200
    assert r.json()["ok"] is True


# ── Health: Redis fora do ar (linha 300) ─────────────────────────────────────

async def test_health_redis_indisponivel(client):
    """Simula redis_client.ping() lançando exceção → redis: false no retorno."""
    import main as svc
    with patch.object(svc.redis_client, 'ping', side_effect=Exception("connection refused")):
        r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["redis"] is False
