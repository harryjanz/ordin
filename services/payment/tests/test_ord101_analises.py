import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import delete as sa_delete
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


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# Datas fixas no passado — evita flakiness de teste rodando perto da meia-noite
# (mesmo raciocínio de outros testes que evitam "hoje" como referência).
DAY = "2024-01-15"
DAY_BEFORE = "2024-01-14"


@pytest.fixture
async def analytics_seed(client):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        txs = [
            # Empresa 1, dia DAY: 2 aprovadas em terminais diferentes (revenue 500, volume 2)
            svc.Transaction(
                company_id=1, terminal_id=10, order_ref="ORDANL001",
                method="credit", amount=300.00, status="approved", provider="mock",
                created_at=datetime(2024, 1, 15, 9, 0, 0),
            ),
            svc.Transaction(
                company_id=1, terminal_id=11, order_ref="ORDANL002",
                method="pix", amount=200.00, status="approved", provider="mock",
                created_at=datetime(2024, 1, 15, 14, 30, 0),
            ),
            # Empresa 1, dia DAY: uma recusada — não deve entrar em nenhum agregado
            svc.Transaction(
                company_id=1, terminal_id=10, order_ref="ORDANL003",
                method="credit", amount=999.00, status="refused", provider="mock",
                created_at=datetime(2024, 1, 15, 10, 0, 0),
            ),
            # Empresa 1, dia DAY_BEFORE (período anterior): 1 aprovada (revenue 400, volume 1)
            svc.Transaction(
                company_id=1, terminal_id=10, order_ref="ORDANL004",
                method="credit", amount=400.00, status="approved", provider="mock",
                created_at=datetime(2024, 1, 14, 8, 0, 0),
            ),
            # Empresa 2 — isolamento multi-tenant
            svc.Transaction(
                company_id=2, terminal_id=20, order_ref="ORDANL005",
                method="credit", amount=1000.00, status="approved", provider="mock",
                created_at=datetime(2024, 1, 15, 9, 0, 0),
            ),
        ]
        db.add_all(txs)
        await db.commit()
        yield
        await db.execute(sa_delete(svc.Transaction).where(svc.Transaction.order_ref.like("ORDANL%")))
        await db.commit()


async def test_kpis_comparados_com_periodo_anterior(client, analytics_seed, token_owner):
    r = await client.get(
        "/payments/analytics",
        params={"date_from": DAY, "date_to": DAY},
        headers=auth(token_owner),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["current"] == {"revenue": 500.0, "ticket_medio": 250.0, "volume": 2}
    assert body["previous"] == {"revenue": 400.0, "ticket_medio": 400.0, "volume": 1}
    assert body["change_pct"]["revenue"] == 25.0
    assert body["change_pct"]["volume"] == 100.0
    assert body["change_pct"]["ticket_medio"] == -37.5


async def test_periodo_anterior_sem_transacao_nao_gera_percentual(client, token_owner):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        db.add(svc.Transaction(
            company_id=1, terminal_id=10, order_ref="ORDANL010",
            method="credit", amount=100.00, status="approved", provider="mock",
            created_at=datetime(2024, 3, 1, 9, 0, 0),
        ))
        await db.commit()

    r = await client.get(
        "/payments/analytics",
        params={"date_from": "2024-03-01", "date_to": "2024-03-01"},
        headers=auth(token_owner),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["current"]["revenue"] == 100.0
    assert body["change_pct"] == {"revenue": None, "ticket_medio": None, "volume": None}

    async with svc.AsyncSessionLocal() as db:
        await db.execute(sa_delete(svc.Transaction).where(svc.Transaction.order_ref == "ORDANL010"))
        await db.commit()


async def test_receita_por_hora(client, analytics_seed, token_owner):
    r = await client.get(
        "/payments/analytics",
        params={"date_from": DAY, "date_to": DAY},
        headers=auth(token_owner),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["granularity"] == "hour"
    series = body["series"]
    assert len(series) == 24
    by_label = {s["label"]: s["revenue"] for s in series}
    assert by_label["09h"] == 300.0
    assert by_label["14h"] == 200.0
    assert by_label["00h"] == 0.0


async def test_granularidade_dia_zero_preenchida(client, token_owner):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        db.add_all([
            svc.Transaction(
                company_id=1, terminal_id=10, order_ref="ORDANL020",
                method="credit", amount=100.00, status="approved", provider="mock",
                created_at=datetime(2024, 5, 1, 9, 0, 0),
            ),
            svc.Transaction(
                company_id=1, terminal_id=10, order_ref="ORDANL021",
                method="credit", amount=50.00, status="approved", provider="mock",
                created_at=datetime(2024, 5, 3, 9, 0, 0),
            ),
        ])
        await db.commit()

    r = await client.get(
        "/payments/analytics",
        params={"date_from": "2024-05-01", "date_to": "2024-05-03", "granularity": "day"},
        headers=auth(token_owner),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["granularity"] == "day"
    series = body["series"]
    assert len(series) == 3
    by_label = {s["label"]: s["revenue"] for s in series}
    assert by_label["01/05"] == 100.0
    assert by_label["02/05"] == 0.0
    assert by_label["03/05"] == 50.0

    async with svc.AsyncSessionLocal() as db:
        await db.execute(sa_delete(svc.Transaction).where(svc.Transaction.order_ref.in_(["ORDANL020", "ORDANL021"])))
        await db.commit()


async def test_granularidade_mes(client, token_owner):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        db.add_all([
            svc.Transaction(
                company_id=1, terminal_id=10, order_ref="ORDANL030",
                method="credit", amount=100.00, status="approved", provider="mock",
                created_at=datetime(2024, 6, 15, 9, 0, 0),
            ),
            svc.Transaction(
                company_id=1, terminal_id=10, order_ref="ORDANL031",
                method="credit", amount=200.00, status="approved", provider="mock",
                created_at=datetime(2024, 7, 5, 9, 0, 0),
            ),
        ])
        await db.commit()

    r = await client.get(
        "/payments/analytics",
        params={"date_from": "2024-06-01", "date_to": "2024-07-31", "granularity": "month"},
        headers=auth(token_owner),
    )
    assert r.status_code == 200
    series = r.json()["series"]
    assert len(series) == 2
    by_label = {s["label"]: s["revenue"] for s in series}
    assert by_label["06/2024"] == 100.0
    assert by_label["07/2024"] == 200.0

    async with svc.AsyncSessionLocal() as db:
        await db.execute(sa_delete(svc.Transaction).where(svc.Transaction.order_ref.in_(["ORDANL030", "ORDANL031"])))
        await db.commit()


async def test_receita_por_forma_de_pagamento(client, analytics_seed, token_owner):
    r = await client.get(
        "/payments/analytics",
        params={"date_from": DAY, "date_to": DAY},
        headers=auth(token_owner),
    )
    assert r.status_code == 200
    by_method = r.json()["by_method"]
    assert [m["method"] for m in by_method] == ["credit", "pix"]
    assert by_method[0]["revenue"] == 300.0
    assert by_method[0]["volume"] == 1
    assert by_method[1]["revenue"] == 200.0


async def test_venda_por_terminal_ordenada_por_receita(client, analytics_seed, token_owner):
    r = await client.get(
        "/payments/analytics",
        params={"date_from": DAY, "date_to": DAY},
        headers=auth(token_owner),
    )
    assert r.status_code == 200
    by_terminal = r.json()["by_terminal"]
    assert [t["terminal_id"] for t in by_terminal] == [10, 11]
    assert by_terminal[0]["revenue"] == 300.0
    assert by_terminal[1]["revenue"] == 200.0


async def test_isolamento_multi_tenant(client, analytics_seed, token_owner):
    r = await client.get(
        "/payments/analytics",
        params={"date_from": DAY, "date_to": DAY},
        headers=auth(token_owner),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["current"]["revenue"] == 500.0  # não inclui os 1000 da empresa 2
    assert all(t["terminal_id"] != 20 for t in body["by_terminal"])
    # empresa 2 só tem transação "credit" de 1000 — se vazasse, o total de
    # "credit" em by_method seria 1300 (300 + 1000) em vez de 300.
    by_method = {m["method"]: m["revenue"] for m in body["by_method"]}
    assert by_method["credit"] == 300.0


async def test_data_invalida_retorna_422(client, token_owner):
    r = await client.get(
        "/payments/analytics",
        params={"date_from": "15-01-2024", "date_to": DAY},
        headers=auth(token_owner),
    )
    assert r.status_code == 422


async def test_sem_token_retorna_401(client):
    r = await client.get("/payments/analytics", params={"date_from": DAY, "date_to": DAY})
    assert r.status_code == 401
