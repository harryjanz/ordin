import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import bcrypt
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete as sa_delete
from sqlalchemy import select
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


@pytest.fixture
async def ids(client):
    """
    Usa as empresas do seed (company_id=1 e 2) quando existem.
    Em CI com banco limpo, cria empresa B temporária.
    Sempre cria um terminal de teste para empresa B e faz cleanup.
    """
    import main as svc
    created_company_id = None
    async with svc.AsyncSessionLocal() as db:
        co_b = (await db.execute(select(svc.Company).where(svc.Company.id == 2))).scalars().first()
        if co_b is None:
            # Banco de teste é sqlite in-memory vazio (forçado sempre pelo
            # conftest.py) — nunca tem o seed de empresas real. id=2 é
            # forçado explicitamente (sqlite aceita PK explícita em coluna
            # autoincrement) pra garantir company_b_id != company_a_id (que é
            # sempre 1, hardcoded no token_owner). Sem isso, o autoincrement
            # dava id=1 pra empresa B no banco vazio — mesmo id da empresa A,
            # fazendo os testes de isolamento passarem "sem querer" mesmo com
            # a checagem quebrada (ou, como aqui, falharem por não haver
            # isolamento nenhum sendo exercitado de verdade).
            pin_b = bcrypt.hashpw(b"5678", bcrypt.gensalt(4)).decode()
            co_b = svc.Company(id=2, name="__test_pasta__", document="99999999999",
                               pin_hash=pin_b, plan="free", payment_provider="mock", state="SP")
            db.add(co_b)
            await db.commit()
            created_company_id = co_b.id

        t_b = svc.Terminal(company_id=co_b.id, label="__test_terminal_b__",
                           terminal_code="__TB99__", paygo_terminal_id=None, environment="sandbox")
        db.add(t_b)
        await db.commit()
        yield {"company_a_id": 1, "company_b_id": co_b.id, "terminal_b_id": t_b.id}
        await db.execute(sa_delete(svc.Terminal).where(svc.Terminal.id == t_b.id))
        if created_company_id:
            await db.execute(sa_delete(svc.Company).where(svc.Company.id == created_company_id))
        await db.commit()


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# CA-004: leitura de terminais de empresa alheia retorna 403
async def test_list_terminais_empresa_alheia_retorna_403(client, ids, token_owner):
    r = await client.get(f"/companies/{ids['company_b_id']}/terminals", headers=auth(token_owner))
    assert r.status_code == 403


# CA-004: leitura de usuários de empresa alheia retorna 403
async def test_list_usuarios_empresa_alheia_retorna_403(client, ids, token_owner):
    r = await client.get(f"/companies/{ids['company_b_id']}/users", headers=auth(token_owner))
    assert r.status_code == 403


# CA-004: leitura de payment-configs de empresa alheia retorna 403
async def test_list_payment_configs_empresa_alheia_retorna_403(client, ids, token_owner):
    r = await client.get(f"/companies/{ids['company_b_id']}/payment-configs", headers=auth(token_owner))
    assert r.status_code == 403


# CA-004: regenerar PIN de empresa alheia retorna 403
async def test_regenerar_pin_empresa_alheia_retorna_403(client, ids, token_owner):
    r = await client.post(f"/companies/{ids['company_b_id']}/regenerate-pin", headers=auth(token_owner))
    assert r.status_code == 403


# Acesso à própria empresa funciona normalmente
async def test_acesso_propria_empresa_funciona(client, ids, token_owner):
    r = await client.get(f"/companies/{ids['company_a_id']}/terminals", headers=auth(token_owner))
    assert r.status_code == 200
    assert "terminals" in r.json()


# CA-005: sem token retorna 401
async def test_sem_token_retorna_401(client, ids):
    r = await client.get(f"/companies/{ids['company_a_id']}/terminals")
    assert r.status_code == 401
