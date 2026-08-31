import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
import bcrypt
from datetime import datetime, timedelta
from httpx import AsyncClient, ASGITransport
from sqlalchemy import delete as sa_delete, select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker


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


@pytest.fixture
async def seed(client):
    """Cria empresa + terminal + usuário para testes, com token matching."""
    import main as svc
    pin_hash = bcrypt.hashpw(b"123456", bcrypt.gensalt(4)).decode()
    pw_hash  = bcrypt.hashpw(b"senha123", bcrypt.gensalt(4)).decode()
    async with svc.AsyncSessionLocal() as db:
        co = svc.Company(name="Empresa Teste", document="00000000001",
                         pin_hash=pin_hash, plan="free", payment_provider="mock", state="SP")
        db.add(co); await db.flush()
        t = svc.Terminal(company_id=co.id, label="Totem 1", terminal_code="T001",
                         paygo_terminal_id=None, environment="sandbox")
        u = svc.User(company_id=co.id, name="Owner", email="owner@test.com",
                     password_hash=pw_hash, role="owner")
        db.add_all([t, u]); await db.commit()
        co_id, t_id = co.id, t.id
        token = _make_token("owner", co_id)
        yield {"company_id": co_id, "terminal_id": t_id, "token": token}
        await db.execute(sa_delete(svc.User).where(svc.User.company_id == co_id))
        await db.execute(sa_delete(svc.Terminal).where(svc.Terminal.company_id == co_id))
        await db.execute(sa_delete(svc.Company).where(svc.Company.id == co_id))
        await db.commit()


def auth(token):
    return {"Authorization": f"Bearer {token}"}


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


async def test_list_companies_owner_forbidden(client, seed):
    r = await client.get("/companies", headers=auth(seed["token"]))
    assert r.status_code == 403


# ── ORD-135: date_to deve incluir o dia inteiro ───────────────────────────────

async def _make_company(client, created_at):
    import main as svc
    doc = f"9{os.urandom(6).hex()}"[:14]
    co = svc.Company(
        name=f"__ord135_{os.urandom(3).hex()}__", document=doc,
        pin_hash="x", state="SP", active=True, created_at=created_at,
    )
    async with svc.AsyncSessionLocal() as db:
        db.add(co)
        await db.commit()
        await db.refresh(co)
    return co.id


async def _del_company(client, co_id):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        await db.execute(sa_delete(svc.Company).where(svc.Company.id == co_id))
        await db.commit()


async def test_list_companies_date_to_inclui_fim_do_dia(client, token_superadmin):
    from datetime import datetime
    co_id = await _make_company(client, datetime(2026, 8, 28, 23, 59, 0))
    try:
        r = await client.get(
            "/companies", params={"date_from": "2026-08-28", "date_to": "2026-08-28", "limit": 200},
            headers=auth(token_superadmin),
        )
        assert r.status_code == 200
        assert any(c["id"] == co_id for c in r.json()["companies"])
    finally:
        await _del_company(client, co_id)


async def test_list_companies_date_to_nao_vaza_pro_dia_seguinte(client, token_superadmin):
    from datetime import datetime
    co_id = await _make_company(client, datetime(2026, 8, 29, 0, 0, 1))
    try:
        r = await client.get(
            "/companies", params={"date_from": "2026-08-28", "date_to": "2026-08-28", "limit": 200},
            headers=auth(token_superadmin),
        )
        assert not any(c["id"] == co_id for c in r.json()["companies"])
    finally:
        await _del_company(client, co_id)


async def test_list_companies_date_from_igual_date_to_retorna_dia_inteiro(client, token_superadmin):
    from datetime import datetime
    co1 = await _make_company(client, datetime(2026, 8, 28, 0, 0, 0))
    co2 = await _make_company(client, datetime(2026, 8, 28, 23, 59, 59))
    try:
        r = await client.get(
            "/companies", params={"date_from": "2026-08-28", "date_to": "2026-08-28", "limit": 200},
            headers=auth(token_superadmin),
        )
        ids = {c["id"] for c in r.json()["companies"]}
        assert co1 in ids and co2 in ids
    finally:
        await _del_company(client, co1)
        await _del_company(client, co2)


async def test_list_companies_sem_date_to_sem_limite_superior(client, token_superadmin):
    from datetime import datetime
    co_id = await _make_company(client, datetime(2026, 8, 29, 0, 0, 1))
    try:
        r = await client.get(
            "/companies", params={"date_from": "2026-08-28", "limit": 200},
            headers=auth(token_superadmin),
        )
        assert any(c["id"] == co_id for c in r.json()["companies"])
    finally:
        await _del_company(client, co_id)


async def test_list_companies_date_to_formato_invalido_retorna_400(client, token_superadmin):
    r = await client.get(
        "/companies", params={"date_to": "28/08/2026"},
        headers=auth(token_superadmin),
    )
    assert r.status_code == 400


# ── Terminais ─────────────────────────────────────────────────────────────────

async def test_list_terminals_owner(client, seed):
    r = await client.get(
        f"/companies/{seed['company_id']}/terminals",
        headers=auth(seed["token"]),
    )
    assert r.status_code == 200
    assert "terminals" in r.json()


async def test_list_terminals_wrong_company(client, seed):
    r = await client.get(
        "/companies/9999/terminals",
        headers=auth(seed["token"]),
    )
    assert r.status_code == 403


async def test_update_terminal_paygo_fields(client, seed):
    r = await client.put(
        f"/companies/{seed['company_id']}/terminals/{seed['terminal_id']}",
        json={"paygo_terminal_id": "81", "environment": "sandbox"},
        headers=auth(seed["token"]),
    )
    assert r.status_code == 200
    assert r.json()["paygo_terminal_id"] == "81"


# ── PIN ───────────────────────────────────────────────────────────────────────

async def test_regenerate_pin(client, seed):
    r = await client.post(
        f"/companies/{seed['company_id']}/regenerate-pin",
        headers=auth(seed["token"]),
    )
    assert r.status_code == 200
    assert len(r.json()["pin"]) == 6


# ── Usuários ──────────────────────────────────────────────────────────────────

async def test_list_users_owner(client, seed):
    r = await client.get(
        f"/companies/{seed['company_id']}/users",
        headers=auth(seed["token"]),
    )
    assert r.status_code == 200
    assert r.json()["total"] >= 1


# ── Payment configs ───────────────────────────────────────────────────────────

async def test_create_payment_config(client, seed):
    r = await client.post(
        f"/companies/{seed['company_id']}/payment-configs",
        json={"provider": "paygo", "environment": "sandbox",
              "api_key": "chave-real", "api_secret": "senha-real",
              "extra_config": {"pessoa_id": "11559"}},
        headers=auth(seed["token"]),
    )
    assert r.status_code == 201
    assert r.json()["api_key"] == "***"


async def test_list_payment_configs(client, seed):
    r = await client.get(
        f"/companies/{seed['company_id']}/payment-configs",
        headers=auth(seed["token"]),
    )
    assert r.status_code == 200


async def test_payment_config_duplicate_returns_409(client, seed):
    # First create
    await client.post(
        f"/companies/{seed['company_id']}/payment-configs",
        json={"provider": "mock", "environment": "sandbox", "api_key": "key1"},
        headers=auth(seed["token"]),
    )
    # Second create same provider+env → 409
    r = await client.post(
        f"/companies/{seed['company_id']}/payment-configs",
        json={"provider": "mock", "environment": "sandbox", "api_key": "key2"},
        headers=auth(seed["token"]),
    )
    assert r.status_code == 409


async def test_payment_config_wrong_company_forbidden(client, seed):
    r = await client.get(
        "/companies/9999/payment-configs",
        headers=auth(seed["token"]),
    )
    assert r.status_code == 403


# ── Webhook secret por empresa (ORD-131) ──────────────────────────────────────

async def test_create_payment_config_com_webhook_secret(client, seed):
    r = await client.post(
        f"/companies/{seed['company_id']}/payment-configs",
        json={"provider": "mercadopago", "environment": "sandbox",
              "api_key": "TEST-token", "webhook_secret": "chave-secreta-webhook"},
        headers=auth(seed["token"]),
    )
    assert r.status_code == 201
    assert r.json()["webhook_secret"] == "***"


async def test_internal_get_payment_config_retorna_secret_descriptografado(client, seed):
    import os
    internal_headers = {"X-Internal-Secret": os.environ.get("INTERNAL_SECRET", "test-internal-secret-ci")}

    create = await client.post(
        f"/companies/{seed['company_id']}/payment-configs",
        json={"provider": "mercadopago", "environment": "production",
              "api_key": "APP_USR-token", "webhook_secret": "segredo-real-123"},
        headers=auth(seed["token"]),
    )
    config_id = create.json()["id"]
    await client.patch(
        f"/companies/{seed['company_id']}/payment-configs/{config_id}/activate",
        headers=auth(seed["token"]),
    )

    r = await client.get(
        f"/internal/companies/{seed['company_id']}/payment-config",
        params={"provider": "mercadopago"},
        headers=internal_headers,
    )
    assert r.status_code == 200
    assert r.json()["webhook_secret"] == "segredo-real-123"


async def test_internal_get_payment_config_sem_config_retorna_404(client, seed):
    import os
    internal_headers = {"X-Internal-Secret": os.environ.get("INTERNAL_SECRET", "test-internal-secret-ci")}
    r = await client.get(
        "/internal/companies/999999/payment-config",
        params={"provider": "mercadopago"},
        headers=internal_headers,
    )
    assert r.status_code == 404


async def test_internal_get_payment_config_secret_errado_retorna_403(client, seed):
    r = await client.get(
        f"/internal/companies/{seed['company_id']}/payment-config",
        params={"provider": "mercadopago"},
        headers={"X-Internal-Secret": "errado"},
    )
    assert r.status_code == 403


# ── Encryption helpers ────────────────────────────────────────────────────────

def test_encrypt_decrypt_field():
    from main import encrypt_field, decrypt_field
    plaintext = "minha-chave-secreta"
    encrypted = encrypt_field(plaintext)
    assert encrypted.startswith("enc:")
    assert decrypt_field(encrypted) == plaintext


def test_decrypt_plaintext_passthrough():
    from main import decrypt_field
    assert decrypt_field("plaintext-sem-prefixo") == "plaintext-sem-prefixo"
