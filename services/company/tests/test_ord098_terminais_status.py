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
# padrão do TOKEN em test_ord089_filtro_usuarios.py.
TOKEN = "Zzord098xTerm"


@pytest.fixture
async def terminais_variados(client):
    """Empresa A com 2 terminais (1 ativo, 1 inativo) + empresa B com 1
    terminal ativo — cobre filtro de status e isolamento multi-tenant."""
    import main as svc
    pin_hash = bcrypt.hashpw(b"1234", bcrypt.gensalt(4)).decode()
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

        ativo = svc.Terminal(
            company_id=co_a.id, label=f"{TOKEN} Caixa 1",
            terminal_code=f"{TOKEN}A1", environment="sandbox", active=True,
        )
        inativo = svc.Terminal(
            company_id=co_a.id, label=f"{TOKEN} Caixa 2",
            terminal_code=f"{TOKEN}A2", environment="sandbox", active=False,
        )
        producao = svc.Terminal(
            company_id=co_a.id, label=f"{TOKEN} Entrada Produção",
            terminal_code=f"{TOKEN}A3", environment="production", active=True,
        )
        terminal_b = svc.Terminal(
            company_id=co_b.id, label=f"{TOKEN} Outra Empresa",
            terminal_code=f"{TOKEN}B1", environment="sandbox", active=True,
        )
        db.add_all([ativo, inativo, producao, terminal_b])
        await db.commit()
        await db.refresh(ativo)
        await db.refresh(inativo)
        await db.refresh(producao)

        co_a_id, co_b_id = co_a.id, co_b.id
        ids = {"ativo": ativo.id, "inativo": inativo.id, "producao": producao.id}
        token_a = make_jwt("owner", co_a_id)

        yield {"company_a_id": co_a_id, "company_b_id": co_b_id, "token_a": token_a, "ids": ids}

        await db.execute(sa_delete(svc.Terminal).where(svc.Terminal.company_id.in_([co_a_id, co_b_id])))
        await db.execute(sa_delete(svc.Company).where(svc.Company.id.in_([co_a_id, co_b_id])))
        await db.commit()


async def test_status_default_esconde_inativos(client, terminais_variados):
    r = await client.get(
        f"/companies/{terminais_variados['company_a_id']}/terminals",
        headers=auth(terminais_variados["token_a"]),
    )
    assert r.status_code == 200
    labels = {t["label"] for t in r.json()["terminals"]}
    assert f"{TOKEN} Caixa 1" in labels
    assert f"{TOKEN} Caixa 2" not in labels


async def test_status_inactive_mostra_so_inativos(client, terminais_variados):
    r = await client.get(
        f"/companies/{terminais_variados['company_a_id']}/terminals",
        params={"status": "inactive"},
        headers=auth(terminais_variados["token_a"]),
    )
    assert r.status_code == 200
    labels = {t["label"] for t in r.json()["terminals"]}
    assert labels == {f"{TOKEN} Caixa 2"}


async def test_status_all_mostra_ambos(client, terminais_variados):
    r = await client.get(
        f"/companies/{terminais_variados['company_a_id']}/terminals",
        params={"status": "all"},
        headers=auth(terminais_variados["token_a"]),
    )
    assert r.status_code == 200
    assert r.json()["total"] == 3


async def test_filtro_por_label(client, terminais_variados):
    r = await client.get(
        f"/companies/{terminais_variados['company_a_id']}/terminals",
        params={"label": "Caixa 1"},
        headers=auth(terminais_variados["token_a"]),
    )
    assert r.status_code == 200
    labels = [t["label"] for t in r.json()["terminals"]]
    assert labels == [f"{TOKEN} Caixa 1"]


async def test_filtro_por_environment(client, terminais_variados):
    r = await client.get(
        f"/companies/{terminais_variados['company_a_id']}/terminals",
        params={"environment": "production", "status": "all"},
        headers=auth(terminais_variados["token_a"]),
    )
    assert r.status_code == 200
    labels = [t["label"] for t in r.json()["terminals"]]
    assert labels == [f"{TOKEN} Entrada Produção"]


async def test_combinacao_label_environment_status(client, terminais_variados):
    r = await client.get(
        f"/companies/{terminais_variados['company_a_id']}/terminals",
        params={"label": TOKEN, "environment": "sandbox", "status": "all"},
        headers=auth(terminais_variados["token_a"]),
    )
    assert r.status_code == 200
    labels = {t["label"] for t in r.json()["terminals"]}
    assert labels == {f"{TOKEN} Caixa 1", f"{TOKEN} Caixa 2"}


async def test_reativar_terminal_reaparece_em_ativos(client, terminais_variados):
    inativo_id = terminais_variados["ids"]["inativo"]
    r = await client.put(
        f"/companies/{terminais_variados['company_a_id']}/terminals/{inativo_id}",
        json={"active": True},
        headers=auth(terminais_variados["token_a"]),
    )
    assert r.status_code == 200
    assert r.json()["active"] is True

    r2 = await client.get(
        f"/companies/{terminais_variados['company_a_id']}/terminals",
        headers=auth(terminais_variados["token_a"]),
    )
    assert r2.status_code == 200
    labels = {t["label"] for t in r2.json()["terminals"]}
    assert f"{TOKEN} Caixa 2" in labels


async def test_desativar_terminal_some_de_ativos(client, terminais_variados):
    ativo_id = terminais_variados["ids"]["ativo"]
    r = await client.delete(
        f"/companies/{terminais_variados['company_a_id']}/terminals/{ativo_id}",
        headers=auth(terminais_variados["token_a"]),
    )
    assert r.status_code == 204

    r2 = await client.get(
        f"/companies/{terminais_variados['company_a_id']}/terminals",
        params={"status": "inactive"},
        headers=auth(terminais_variados["token_a"]),
    )
    assert r2.status_code == 200
    labels = {t["label"] for t in r2.json()["terminals"]}
    assert f"{TOKEN} Caixa 1" in labels


async def test_editar_mp_device_id_via_update(client, terminais_variados):
    ativo_id = terminais_variados["ids"]["ativo"]
    r = await client.put(
        f"/companies/{terminais_variados['company_a_id']}/terminals/{ativo_id}",
        json={"mp_device_id": "PAX_A910__SMARTPOS123"},
        headers=auth(terminais_variados["token_a"]),
    )
    assert r.status_code == 200
    assert r.json()["mp_device_id"] == "PAX_A910__SMARTPOS123"


async def test_isolamento_multi_tenant(client, terminais_variados):
    r = await client.get(
        f"/companies/{terminais_variados['company_a_id']}/terminals",
        params={"status": "all"},
        headers=auth(terminais_variados["token_a"]),
    )
    assert r.status_code == 200
    labels = {t["label"] for t in r.json()["terminals"]}
    assert f"{TOKEN} Outra Empresa" not in labels
