import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta

import bcrypt
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


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def make_token(role: str, company_id: int) -> str:
    from jose import jwt
    secret = os.environ.get("JWT_SECRET", "test-secret-ci")
    return jwt.encode(
        {"sub": "1", "company": company_id, "role": role, "exp": datetime.utcnow() + timedelta(hours=1)},
        secret, algorithm="HS256",
    )


async def _seed_price_table(status: str = "active", name: str = "Tabela A") -> int:
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        pt = svc.PriceTable(
            name=name, status=status, totem_price_1=249.00,
            totem_multiplier_2=0.5, totem_multiplier_3_5=0.3,
            activated_at=datetime.utcnow() if status != "draft" else None,
        )
        db.add(pt)
        await db.flush()
        db.add(svc.PriceTableTransactionTier(
            price_table_id=pt.id, min_transactions=0, max_transactions=None,
            price_per_transaction=0.10, sort_order=0,
        ))
        await db.commit()
        await db.refresh(pt)
        return pt.id


async def _seed_company(company_id: int, name: str = "Empresa Teste") -> None:
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        pin_hash = bcrypt.hashpw(b"1234", bcrypt.gensalt(4)).decode()
        db.add(svc.Company(id=company_id, name=name, pin_hash=pin_hash, state="SP"))
        await db.commit()


async def _seed_company_plan(company_id: int, price_table_id: int, expires_at=None, renewed_at=None) -> None:
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        db.add(svc.CompanyPlan(
            company_id=company_id,
            price_table_id=price_table_id,
            started_at=datetime.utcnow(),
            expires_at=expires_at or (datetime.utcnow() + timedelta(days=365)),
            renewed_at=renewed_at,
        ))
        await db.commit()


# ── Criação de empresa gera plano ───────────────────────────────────────────

async def test_criar_empresa_gera_plano_vinculado_a_tabela_vigente(client, token_superadmin):
    table_id = await _seed_price_table()
    r = await client.post("/companies", json={"name": "Burger House", "state": "SP"}, headers=auth(token_superadmin))
    assert r.status_code == 201
    company_id = r.json()["company"]["id"]

    r2 = await client.get(f"/companies/{company_id}/plan", headers=auth(token_superadmin))
    assert r2.status_code == 200
    body = r2.json()
    assert body["price_table"]["id"] == table_id
    assert body["status"] == "Ativo"
    assert body["renewed_at"] is None


async def test_criar_empresa_bloqueada_sem_tabela_vigente(client, token_superadmin):
    r = await client.post("/companies", json={"name": "Pasta & Co", "state": "SP"}, headers=auth(token_superadmin))
    assert r.status_code == 400


# ── Status calculado ─────────────────────────────────────────────────────────

async def test_plano_dentro_do_prazo_status_ativo(client, token_superadmin):
    table_id = await _seed_price_table()
    await _seed_company(10)
    await _seed_company_plan(10, table_id, expires_at=datetime.utcnow() + timedelta(days=180))
    r = await client.get("/companies/10/plan", headers=auth(token_superadmin))
    assert r.json()["status"] == "Ativo"


async def test_plano_vencido_status_vencido(client, token_superadmin):
    table_id = await _seed_price_table()
    await _seed_company(10)
    await _seed_company_plan(10, table_id, expires_at=datetime.utcnow() - timedelta(days=10))
    r = await client.get("/companies/10/plan", headers=auth(token_superadmin))
    assert r.json()["status"] == "Vencido"


# ── Não afetado por troca de tabela vigente até renovar (cenário central) ──

async def test_plano_nao_afetado_por_troca_de_tabela_vigente(client, token_superadmin):
    table_a = await _seed_price_table(status="active", name="Tabela A")
    await _seed_company(10)
    await _seed_company_plan(10, table_a)

    table_b = await _seed_price_table(status="draft", name="Tabela B")
    r = await client.post(
        f"/commercial/price-tables/{table_b}/activate",
        json={"confirm_replace": True},
        headers=auth(token_superadmin),
    )
    assert r.status_code == 200

    r2 = await client.get("/companies/10/plan", headers=auth(token_superadmin))
    assert r2.json()["price_table"]["id"] == table_a


# ── Renovação ────────────────────────────────────────────────────────────────

async def test_renovar_plano_vencido_assume_tabela_vigente_atual(client, token_superadmin):
    table_a = await _seed_price_table(status="active", name="Tabela A")
    await _seed_company(10)
    await _seed_company_plan(10, table_a, expires_at=datetime.utcnow() - timedelta(days=5))

    table_b = await _seed_price_table(status="draft", name="Tabela B")
    await client.post(
        f"/commercial/price-tables/{table_b}/activate",
        json={"confirm_replace": True},
        headers=auth(token_superadmin),
    )

    r = await client.post("/companies/10/plan/renew", headers=auth(token_superadmin))
    assert r.status_code == 200
    body = r.json()
    assert body["price_table"]["id"] == table_b
    assert body["status"] == "Ativo"
    assert body["renewed_at"] is not None


async def test_renovacao_antecipada_permitida(client, token_superadmin):
    table_a = await _seed_price_table(status="active", name="Tabela A")
    await _seed_company(10)
    await _seed_company_plan(10, table_a, expires_at=datetime.utcnow() + timedelta(days=90))

    r = await client.post("/companies/10/plan/renew", headers=auth(token_superadmin))
    assert r.status_code == 200


async def test_renovacao_com_tabela_vigente_igual_a_original(client, token_superadmin):
    table_a = await _seed_price_table(status="active", name="Tabela A")
    await _seed_company(10)
    await _seed_company_plan(10, table_a, expires_at=datetime.utcnow() - timedelta(days=1))

    r = await client.post("/companies/10/plan/renew", headers=auth(token_superadmin))
    assert r.status_code == 200
    assert r.json()["price_table"]["id"] == table_a


# ── Controle de acesso ───────────────────────────────────────────────────────

async def test_owner_visualiza_proprio_plano(client):
    table_id = await _seed_price_table()
    await _seed_company(10)
    await _seed_company_plan(10, table_id)
    r = await client.get("/companies/10/plan", headers=auth(make_token("owner", 10)))
    assert r.status_code == 200


async def test_owner_nao_consegue_renovar(client):
    table_id = await _seed_price_table()
    await _seed_company(10)
    await _seed_company_plan(10, table_id)
    r = await client.post("/companies/10/plan/renew", headers=auth(make_token("owner", 10)))
    assert r.status_code == 403


async def test_isolamento_owner_nao_ve_plano_de_outra_empresa(client):
    table_id = await _seed_price_table()
    await _seed_company(10)
    await _seed_company_plan(10, table_id)
    r = await client.get("/companies/10/plan", headers=auth(make_token("owner", 11)))
    assert r.status_code == 403


async def test_acesso_negado_sem_token(client):
    r = await client.get("/companies/10/plan")
    assert r.status_code == 401
