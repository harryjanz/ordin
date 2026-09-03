import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
import bcrypt
from datetime import datetime, timedelta
from httpx import AsyncClient, ASGITransport
from sqlalchemy import delete as sa_delete
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
    import main as svc
    pin_hash = bcrypt.hashpw(b"123456", bcrypt.gensalt(4)).decode()
    async with svc.AsyncSessionLocal() as db:
        co = svc.Company(name="Empresa Teste", document="00000000001",
                         pin_hash=pin_hash, plan="free", payment_provider="mock", state="SP")
        db.add(co); await db.commit()
        co_id = co.id
        token = _make_token("owner", co_id)
        yield {"company_id": co_id, "token": token}
        await db.execute(sa_delete(svc.Company).where(svc.Company.id == co_id))
        await db.commit()


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _appearance_body(**overrides):
    body = {"theme": "ordin", "mode": "light", "menu_layout": "horizontal",
            "inactivity_timeout_min": 5, "inactivity_warn_sec": 30}
    body.update(overrides)
    return body


async def test_empresa_sem_configuracao_usa_default_5min_30s(client, seed):
    r = await client.get(f"/companies/{seed['company_id']}", headers=auth(seed["token"]))
    assert r.status_code == 200
    assert r.json()["inactivity_timeout_min"] == 5
    assert r.json()["inactivity_warn_sec"] == 30


async def test_admin_configura_novo_valor_e_persiste(client, seed):
    r = await client.patch(
        f"/companies/{seed['company_id']}/appearance",
        json=_appearance_body(inactivity_timeout_min=4, inactivity_warn_sec=20),
        headers=auth(seed["token"]),
    )
    assert r.status_code == 200
    assert r.json()["inactivity_timeout_min"] == 4
    assert r.json()["inactivity_warn_sec"] == 20

    r2 = await client.get(f"/companies/{seed['company_id']}", headers=auth(seed["token"]))
    assert r2.json()["inactivity_timeout_min"] == 4
    assert r2.json()["inactivity_warn_sec"] == 20


async def test_aviso_maior_ou_igual_ao_timeout_e_recusado(client, seed):
    r = await client.patch(
        f"/companies/{seed['company_id']}/appearance",
        json=_appearance_body(inactivity_timeout_min=2, inactivity_warn_sec=120),
        headers=auth(seed["token"]),
    )
    assert r.status_code == 422
    assert "aviso" in r.json()["detail"].lower()


async def test_aviso_igual_ao_timeout_tambem_e_recusado(client, seed):
    """Borda: 3 min de timeout com 180s de aviso — aviso não pode ser >= ao
    timeout total, nem igual (senão o aviso "some" no instante do reset)."""
    r = await client.patch(
        f"/companies/{seed['company_id']}/appearance",
        json=_appearance_body(inactivity_timeout_min=3, inactivity_warn_sec=180),
        headers=auth(seed["token"]),
    )
    assert r.status_code == 422


async def test_timeout_fora_do_range_e_recusado(client, seed):
    r = await client.patch(
        f"/companies/{seed['company_id']}/appearance",
        json=_appearance_body(inactivity_timeout_min=31, inactivity_warn_sec=10),
        headers=auth(seed["token"]),
    )
    assert r.status_code == 422


async def test_warn_sec_fora_do_range_e_recusado(client, seed):
    r = await client.patch(
        f"/companies/{seed['company_id']}/appearance",
        json=_appearance_body(inactivity_timeout_min=5, inactivity_warn_sec=200),
        headers=auth(seed["token"]),
    )
    assert r.status_code == 422


async def test_valores_de_borda_validos_sao_aceitos(client, seed):
    r = await client.patch(
        f"/companies/{seed['company_id']}/appearance",
        json=_appearance_body(inactivity_timeout_min=1, inactivity_warn_sec=5),
        headers=auth(seed["token"]),
    )
    assert r.status_code == 200


async def test_isolamento_multi_tenant(client, seed):
    import main as svc
    pin_hash = bcrypt.hashpw(b"654321", bcrypt.gensalt(4)).decode()
    async with svc.AsyncSessionLocal() as db:
        co2 = svc.Company(name="Empresa B", document="00000000002",
                          pin_hash=pin_hash, plan="free", payment_provider="mock", state="RJ")
        db.add(co2); await db.commit()
        co2_id = co2.id

    await client.patch(
        f"/companies/{seed['company_id']}/appearance",
        json=_appearance_body(inactivity_timeout_min=2, inactivity_warn_sec=10),
        headers=auth(seed["token"]),
    )

    r = await client.get(f"/companies/{co2_id}", headers=auth(_make_token("owner", co2_id)))
    assert r.json()["inactivity_timeout_min"] == 5
    assert r.json()["inactivity_warn_sec"] == 30

    async with svc.AsyncSessionLocal() as db:
        await db.execute(sa_delete(svc.Company).where(svc.Company.id == co2_id))
        await db.commit()


async def test_appearance_outra_empresa_forbidden(client, seed):
    import main as svc
    pin_hash = bcrypt.hashpw(b"654321", bcrypt.gensalt(4)).decode()
    async with svc.AsyncSessionLocal() as db:
        co2 = svc.Company(name="Empresa B", document="00000000003",
                          pin_hash=pin_hash, plan="free", payment_provider="mock", state="RJ")
        db.add(co2); await db.commit()
        co2_id = co2.id

    r = await client.patch(
        f"/companies/{co2_id}/appearance",
        json=_appearance_body(),
        headers=auth(seed["token"]),  # token é da empresa `seed`, não de co2
    )
    assert r.status_code == 403

    async with svc.AsyncSessionLocal() as db:
        await db.execute(sa_delete(svc.Company).where(svc.Company.id == co2_id))
        await db.commit()
