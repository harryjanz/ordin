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


# Token isolado do resto do seed real/outros arquivos de teste — mesmo padrão
# do TOKEN em test_ord061_filtros_edicao_cadastro.py.
TOKEN = "Zzord084xListagem"


@pytest.fixture
async def empresas_status(client):
    """Três empresas com um contract_status cada — usadas pros testes de
    resumo (summary ignora o filtro de contract_status, mostra os 3)."""
    import main as svc
    pin_hash = bcrypt.hashpw(b"1234", bcrypt.gensalt(4)).decode()
    async with svc.AsyncSessionLocal() as db:
        pendente = svc.Company(
            name=f"{TOKEN} Pendente", document="72835450755173",
            pin_hash=pin_hash, plan="free", contract_status="pendente", state="SP",
        )
        enviado = svc.Company(
            name=f"{TOKEN} Enviado", document="67525081250650",
            pin_hash=pin_hash, plan="free", contract_status="enviado", state="SP",
        )
        assinado = svc.Company(
            name=f"{TOKEN} Assinado", document="22644575952997",
            pin_hash=pin_hash, plan="free", contract_status="assinado", state="SP",
        )
        db.add_all([pendente, enviado, assinado])
        await db.commit()
        ids = {"pendente": pendente.id, "enviado": enviado.id, "assinado": assinado.id}
        yield ids
        await db.execute(sa_delete(svc.Company).where(svc.Company.id.in_(ids.values())))
        await db.commit()


@pytest.fixture
async def empresas_datadas(client):
    """Duas empresas com created_at explícito, bem separadas no tempo, pra
    testar filtro de período e ordenação sem depender de timing de teste
    (DATETIME do MySQL não guarda frações de segundo — duas inserções na
    mesma rodada de teste podem colidir no mesmo segundo)."""
    import main as svc
    pin_hash = bcrypt.hashpw(b"1234", bcrypt.gensalt(4)).decode()
    antiga_data = datetime.utcnow() - timedelta(days=30)
    recente_data = datetime.utcnow() - timedelta(days=1)
    async with svc.AsyncSessionLocal() as db:
        antiga = svc.Company(
            name=f"{TOKEN} Antiga", document="11444777000161",
            pin_hash=pin_hash, plan="free", contract_status="pendente", state="SP",
            created_at=antiga_data,
        )
        recente = svc.Company(
            name=f"{TOKEN} Recente", document="11444777000242",
            pin_hash=pin_hash, plan="free", contract_status="pendente", state="SP",
            created_at=recente_data,
        )
        db.add_all([antiga, recente])
        await db.commit()
        ids = {"antiga": antiga.id, "recente": recente.id}
        yield {**ids, "antiga_data": antiga_data, "recente_data": recente_data}
        await db.execute(sa_delete(svc.Company).where(svc.Company.id.in_(ids.values())))
        await db.commit()


# ── Resumo por status do contrato (ORD-084) ───────────────────────────────────

async def test_summary_reflete_distribuicao_por_status(client, token_superadmin, empresas_status):
    r = await client.get(f"/companies?q={TOKEN}", headers=auth(token_superadmin))
    assert r.status_code == 200
    summary = r.json()["summary"]
    assert summary["pendente"] == 1
    assert summary["enviado"] == 1
    assert summary["assinado"] == 1


async def test_summary_ignora_filtro_de_contract_status(client, token_superadmin, empresas_status):
    r = await client.get(f"/companies?q={TOKEN}&contract_status=pendente", headers=auth(token_superadmin))
    assert r.status_code == 200
    data = r.json()
    # A lista paginada respeita o filtro (só 1 empresa)...
    assert data["total"] == 1
    # ...mas o resumo mostra a distribuição completa entre os 3 status.
    assert data["summary"] == {"pendente": 1, "enviado": 1, "assinado": 1}


# ── Filtro de período de cadastro (ORD-084) ───────────────────────────────────

async def test_filtro_periodo_inclui_empresas_no_intervalo(client, token_superadmin, empresas_datadas):
    date_from = (empresas_datadas["antiga_data"] - timedelta(days=1)).strftime("%Y-%m-%d")
    date_to = (empresas_datadas["recente_data"] + timedelta(days=1)).strftime("%Y-%m-%d")
    r = await client.get(
        f"/companies?q={TOKEN}&date_from={date_from}&date_to={date_to}", headers=auth(token_superadmin)
    )
    assert r.status_code == 200
    ids = {c["id"] for c in r.json()["companies"]}
    assert ids == {empresas_datadas["antiga"], empresas_datadas["recente"]}


async def test_filtro_periodo_exclui_empresas_fora_do_intervalo(client, token_superadmin, empresas_datadas):
    date_from = (empresas_datadas["recente_data"] - timedelta(hours=1)).strftime("%Y-%m-%d")
    r = await client.get(f"/companies?q={TOKEN}&date_from={date_from}", headers=auth(token_superadmin))
    assert r.status_code == 200
    ids = {c["id"] for c in r.json()["companies"]}
    assert ids == {empresas_datadas["recente"]}
    assert empresas_datadas["antiga"] not in ids


async def test_filtro_periodo_sem_correspondencia_retorna_vazio(client, token_superadmin, empresas_datadas):
    date_from = (datetime.utcnow() + timedelta(days=10)).strftime("%Y-%m-%d")
    r = await client.get(f"/companies?q={TOKEN}&date_from={date_from}", headers=auth(token_superadmin))
    assert r.status_code == 200
    assert r.json()["companies"] == []


# ── Ordenação padrão (ORD-084, Achado 7) ──────────────────────────────────────

async def test_ordenacao_padrao_mais_recente_primeiro(client, token_superadmin, empresas_datadas):
    r = await client.get(f"/companies?q={TOKEN}", headers=auth(token_superadmin))
    assert r.status_code == 200
    ids_em_ordem = [c["id"] for c in r.json()["companies"]]
    assert ids_em_ordem == [empresas_datadas["recente"], empresas_datadas["antiga"]]
