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


def make_jwt(role: str, company_id: int) -> str:
    from jose import jwt
    secret = os.environ.get("JWT_SECRET", "test-secret-ci")
    return jwt.encode(
        {"sub": "1", "company": company_id, "role": role,
         "exp": datetime.utcnow() + timedelta(hours=1)},
        secret, algorithm="HS256",
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


# Prefixo isolado do resto do seed real/outros arquivos de teste — mesmo
# padrão do TOKEN em test_ord084_padrao_listagem_empresas.py.
TOKEN = "Zzord089xFiltro"


@pytest.fixture
async def usuarios_variados(client):
    """Empresa A com 3 usuários (owner ativo, manager ativo, cashier
    inativo) + empresa B com 1 usuário — cobre filtro por nome/e-mail/papel/
    status e isolamento multi-tenant."""
    import main as svc
    pin_hash = bcrypt.hashpw(b"1234", bcrypt.gensalt(4)).decode()
    pw_hash = bcrypt.hashpw(b"senha123", bcrypt.gensalt(4)).decode()
    async with svc.AsyncSessionLocal() as db:
        co_a = svc.Company(
            name=f"{TOKEN} Empresa A", document="10000000000191",
            pin_hash=pin_hash, plan="free", state="SP",
        )
        co_b = svc.Company(
            name=f"{TOKEN} Empresa B", document="10000000000282",
            pin_hash=pin_hash, plan="free", state="SP",
        )
        db.add_all([co_a, co_b])
        await db.flush()

        owner = svc.User(
            company_id=co_a.id, name=f"{TOKEN} Ana Souza",
            email=f"{TOKEN.lower()}.ana@teste.com",
            password_hash=pw_hash, role="owner", active=True,
        )
        manager = svc.User(
            company_id=co_a.id, name=f"{TOKEN} Bruno Lima",
            email=f"{TOKEN.lower()}.bruno@teste.com",
            password_hash=pw_hash, role="manager", active=True,
        )
        cashier_inativo = svc.User(
            company_id=co_a.id, name=f"{TOKEN} Carla Dias",
            email=f"{TOKEN.lower()}.carla@teste.com",
            password_hash=pw_hash, role="cashier", active=False,
        )
        user_b = svc.User(
            company_id=co_b.id, name=f"{TOKEN} Outra Empresa",
            email=f"{TOKEN.lower()}.outra@teste.com",
            password_hash=pw_hash, role="owner", active=True,
        )
        db.add_all([owner, manager, cashier_inativo, user_b])
        await db.commit()
        await db.refresh(owner)
        await db.refresh(manager)
        await db.refresh(cashier_inativo)

        co_a_id, co_b_id = co_a.id, co_b.id
        ids = {"owner": owner.id, "manager": manager.id, "cashier_inativo": cashier_inativo.id}
        token_a = make_jwt("owner", co_a_id)
        token_b = make_jwt("owner", co_b_id)

        yield {
            "company_a_id": co_a_id, "company_b_id": co_b_id,
            "token_a": token_a, "token_b": token_b, "ids": ids,
        }

        await db.execute(sa_delete(svc.User).where(svc.User.company_id.in_([co_a_id, co_b_id])))
        await db.execute(sa_delete(svc.Company).where(svc.Company.id.in_([co_a_id, co_b_id])))
        await db.commit()


async def test_filtro_por_nome(client, usuarios_variados):
    r = await client.get(
        f"/companies/{usuarios_variados['company_a_id']}/users",
        params={"name": "Ana", "status": "all"},
        headers=auth(usuarios_variados["token_a"]),
    )
    assert r.status_code == 200
    nomes = [u["name"] for u in r.json()["users"]]
    assert nomes == [f"{TOKEN} Ana Souza"]


async def test_filtro_por_email(client, usuarios_variados):
    r = await client.get(
        f"/companies/{usuarios_variados['company_a_id']}/users",
        params={"email": "bruno", "status": "all"},
        headers=auth(usuarios_variados["token_a"]),
    )
    assert r.status_code == 200
    emails = [u["email"] for u in r.json()["users"]]
    assert emails == [f"{TOKEN.lower()}.bruno@teste.com"]


async def test_filtro_por_papel(client, usuarios_variados):
    r = await client.get(
        f"/companies/{usuarios_variados['company_a_id']}/users",
        params={"role": "manager", "status": "all"},
        headers=auth(usuarios_variados["token_a"]),
    )
    assert r.status_code == 200
    roles = {u["role"] for u in r.json()["users"]}
    assert roles == {"manager"}


async def test_status_default_esconde_inativos(client, usuarios_variados):
    r = await client.get(
        f"/companies/{usuarios_variados['company_a_id']}/users",
        headers=auth(usuarios_variados["token_a"]),
    )
    assert r.status_code == 200
    nomes = {u["name"] for u in r.json()["users"]}
    assert f"{TOKEN} Carla Dias" not in nomes
    assert f"{TOKEN} Ana Souza" in nomes


async def test_status_inactive_mostra_so_inativos(client, usuarios_variados):
    r = await client.get(
        f"/companies/{usuarios_variados['company_a_id']}/users",
        params={"status": "inactive"},
        headers=auth(usuarios_variados["token_a"]),
    )
    assert r.status_code == 200
    nomes = {u["name"] for u in r.json()["users"]}
    assert nomes == {f"{TOKEN} Carla Dias"}


async def test_status_all_mostra_ambos(client, usuarios_variados):
    r = await client.get(
        f"/companies/{usuarios_variados['company_a_id']}/users",
        params={"status": "all", "name": TOKEN},
        headers=auth(usuarios_variados["token_a"]),
    )
    assert r.status_code == 200
    assert r.json()["total"] == 3


async def test_reativar_usuario_reaparece_em_ativos(client, usuarios_variados):
    cashier_id = usuarios_variados["ids"]["cashier_inativo"]
    r = await client.put(
        f"/companies/{usuarios_variados['company_a_id']}/users/{cashier_id}",
        json={"active": True},
        headers=auth(usuarios_variados["token_a"]),
    )
    assert r.status_code == 200
    assert r.json()["active"] is True

    r2 = await client.get(
        f"/companies/{usuarios_variados['company_a_id']}/users",
        params={"name": "Carla"},
        headers=auth(usuarios_variados["token_a"]),
    )
    assert r2.status_code == 200
    assert [u["name"] for u in r2.json()["users"]] == [f"{TOKEN} Carla Dias"]


async def test_combinacao_de_filtros(client, usuarios_variados):
    r = await client.get(
        f"/companies/{usuarios_variados['company_a_id']}/users",
        params={"role": "cashier", "status": "active", "name": TOKEN},
        headers=auth(usuarios_variados["token_a"]),
    )
    assert r.status_code == 200
    assert r.json()["total"] == 0  # Carla (cashier) está inativa por padrão nesta fixture


async def test_isolamento_multi_tenant(client, usuarios_variados):
    r = await client.get(
        f"/companies/{usuarios_variados['company_a_id']}/users",
        params={"status": "all"},
        headers=auth(usuarios_variados["token_a"]),
    )
    assert r.status_code == 200
    nomes = {u["name"] for u in r.json()["users"]}
    assert f"{TOKEN} Outra Empresa" not in nomes
