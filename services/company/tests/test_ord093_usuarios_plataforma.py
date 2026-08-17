import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta

import bcrypt
import pytest
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


TOKEN = "Zzord093xPlataforma"


@pytest.fixture
async def cenario(client):
    """Reproduz o estado pós-migration: uma empresa interna (is_platform=True)
    com um superadmin e um admin, mais uma empresa cliente isolada por
    prefixo com um owner. Migration em si (schema+dado real) é verificada
    ao vivo contra o banco de dev, não neste fixture baseado em ORM."""
    import main as svc
    pin_hash = bcrypt.hashpw(b"1234", bcrypt.gensalt(4)).decode()
    pw_hash = bcrypt.hashpw(b"senhaSegura123!", bcrypt.gensalt(4)).decode()
    async with svc.AsyncSessionLocal() as db:
        platform_co = svc.Company(
            name=f"{TOKEN} Ordin Plataforma", document=None,
            pin_hash=pin_hash, plan="internal", state="SP", is_platform=True,
        )
        client_co = svc.Company(
            name=f"{TOKEN} Empresa Cliente", document="10000000000766",
            pin_hash=pin_hash, plan="free", state="SP", is_platform=False,
        )
        db.add_all([platform_co, client_co])
        await db.flush()

        superadmin = svc.User(
            company_id=platform_co.id, name=f"{TOKEN} Superadmin",
            email=f"{TOKEN.lower()}.superadmin@teste.com",
            password_hash=pw_hash, role="superadmin", active=True,
        )
        admin = svc.User(
            company_id=platform_co.id, name=f"{TOKEN} Admin",
            email=f"{TOKEN.lower()}.admin@teste.com",
            password_hash=pw_hash, role="admin", active=True,
        )
        owner = svc.User(
            company_id=client_co.id, name=f"{TOKEN} Owner",
            email=f"{TOKEN.lower()}.owner@teste.com",
            password_hash=pw_hash, role="owner", active=True,
        )
        db.add_all([superadmin, admin, owner])
        await db.commit()
        await db.refresh(superadmin)
        await db.refresh(admin)
        await db.refresh(owner)

        platform_co_id, client_co_id = platform_co.id, client_co.id
        ids = {"superadmin": superadmin.id, "admin": admin.id, "owner": owner.id}

        yield {
            "platform_company_id": platform_co_id,
            "client_company_id": client_co_id,
            "superadmin_token": make_jwt(str(superadmin.id), "superadmin", platform_co_id),
            "admin_token": make_jwt(str(admin.id), "admin", platform_co_id),
            "owner_token": make_jwt(str(owner.id), "owner", client_co_id),
            "ids": ids,
        }

        await db.execute(sa_delete(svc.User).where(svc.User.company_id.in_([platform_co_id, client_co_id])))
        await db.execute(sa_delete(svc.Company).where(svc.Company.id.in_([platform_co_id, client_co_id])))
        await db.commit()


# ── Empresa interna nunca aparece pra clientes ──────────────────────────────

async def test_empresa_interna_nunca_aparece_na_listagem_geral(client, cenario):
    r = await client.get("/companies", headers=auth(cenario["superadmin_token"]))
    assert r.status_code == 200
    ids = [c["id"] for c in r.json()["companies"]]
    assert cenario["platform_company_id"] not in ids
    assert cenario["client_company_id"] in ids


# ── Aba Usuários de empresa cliente nunca mostra plataforma ─────────────────

async def test_lista_usuarios_empresa_nunca_mostra_plataforma(client, cenario):
    r = await client.get(
        f"/companies/{cenario['client_company_id']}/users",
        params={"status": "all"},
        headers=auth(cenario["superadmin_token"]),
    )
    assert r.status_code == 200
    roles = {u["role"] for u in r.json()["users"]}
    assert "superadmin" not in roles
    assert "admin" not in roles


async def test_owner_tambem_nunca_ve_plataforma(client, cenario):
    r = await client.get(
        f"/companies/{cenario['client_company_id']}/users",
        params={"status": "all"},
        headers=auth(cenario["owner_token"]),
    )
    assert r.status_code == 200
    roles = {u["role"] for u in r.json()["users"]}
    assert "superadmin" not in roles


# ── Nova tela de plataforma ──────────────────────────────────────────────────

async def test_lista_usuarios_plataforma_so_superadmin_admin(client, cenario):
    r = await client.get("/platform-users", headers=auth(cenario["superadmin_token"]))
    assert r.status_code == 200
    roles = {u["role"] for u in r.json()["users"]}
    assert roles == {"superadmin", "admin"}
    assert r.json()["total"] == 2


async def test_owner_nao_acessa_platform_users(client, cenario):
    r = await client.get("/platform-users", headers=auth(cenario["owner_token"]))
    assert r.status_code == 403


# ── Validação de papel nos dois sentidos ────────────────────────────────────

async def test_api_empresa_rejeita_role_plataforma(client, cenario):
    r = await client.post(
        f"/companies/{cenario['client_company_id']}/users",
        json={"name": "Invasor", "email": f"{TOKEN.lower()}.invasor@teste.com", "role": "superadmin"},
        headers=auth(cenario["owner_token"]),
    )
    assert r.status_code == 422


async def test_api_plataforma_rejeita_role_empresa(client, cenario):
    r = await client.post(
        "/platform-users",
        json={"name": "Invasor", "email": f"{TOKEN.lower()}.invasor2@teste.com", "role": "owner"},
        headers=auth(cenario["superadmin_token"]),
    )
    assert r.status_code == 422


# ── Hierarquia de criação/promoção ──────────────────────────────────────────

async def test_admin_nao_cria_superadmin(client, cenario):
    r = await client.post(
        "/platform-users",
        json={"name": "Novo", "email": f"{TOKEN.lower()}.novo1@teste.com", "role": "superadmin"},
        headers=auth(cenario["admin_token"]),
    )
    assert r.status_code == 403


async def test_admin_cria_outro_admin(client, cenario):
    r = await client.post(
        "/platform-users",
        json={"name": "Novo Admin", "email": f"{TOKEN.lower()}.novo2@teste.com", "role": "admin"},
        headers=auth(cenario["admin_token"]),
    )
    assert r.status_code == 201


async def test_superadmin_cria_superadmin_e_admin(client, cenario):
    r1 = await client.post(
        "/platform-users",
        json={"name": "Novo Super", "email": f"{TOKEN.lower()}.novo3@teste.com", "role": "superadmin"},
        headers=auth(cenario["superadmin_token"]),
    )
    r2 = await client.post(
        "/platform-users",
        json={"name": "Novo Admin B", "email": f"{TOKEN.lower()}.novo4@teste.com", "role": "admin"},
        headers=auth(cenario["superadmin_token"]),
    )
    assert r1.status_code == 201
    assert r2.status_code == 201


async def test_admin_nao_promove_a_superadmin(client, cenario):
    r = await client.put(
        f"/platform-users/{cenario['ids']['admin']}",
        json={"role": "superadmin"},
        headers=auth(cenario["admin_token"]),
    )
    assert r.status_code == 403


# ── Isolamento e demais operações do CRUD de plataforma ────────────────────

async def test_delete_platform_user_nao_desativa_a_si_mesmo(client, cenario):
    r = await client.delete(
        f"/platform-users/{cenario['ids']['superadmin']}",
        headers=auth(cenario["superadmin_token"]),
    )
    assert r.status_code == 403


async def test_delete_platform_user_desativa_outro(client, cenario):
    r = await client.delete(
        f"/platform-users/{cenario['ids']['admin']}",
        headers=auth(cenario["superadmin_token"]),
    )
    assert r.status_code == 204
    r2 = await client.get(
        "/platform-users", params={"status": "inactive"}, headers=auth(cenario["superadmin_token"])
    )
    assert cenario["ids"]["admin"] in [u["id"] for u in r2.json()["users"]]


async def test_mfa_reset_platform_user(client, cenario):
    r = await client.post(
        f"/platform-users/{cenario['ids']['admin']}/mfa/reset",
        headers=auth(cenario["superadmin_token"]),
    )
    assert r.status_code == 200
