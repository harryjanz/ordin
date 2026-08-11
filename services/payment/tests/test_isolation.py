import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from httpx import AsyncClient, ASGITransport
from datetime import datetime
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


@pytest.fixture
async def ids(client):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        tx_b = svc.Transaction(
            company_id=2, terminal_id=2, order_ref="ISOPAYB01",
            method="credit", amount=40.00, status="approved",
            provider="mock", provider_transaction_id="TXISOB001",
            nsu="NSU002", authorization="AUTHB01",
            created_at=datetime.utcnow(),
        )
        db.add(tx_b)
        await db.commit()
        yield {"tx_b_id": tx_b.id}
        await db.execute(sa_delete(svc.Transaction).where(svc.Transaction.id == tx_b.id))
        await db.commit()


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# CA-001: listagem não vaza transações de outra empresa
async def test_list_payments_nao_retorna_transacoes_de_empresa_b(client, ids, token_owner):
    r = await client.get("/payments", headers=auth(token_owner))
    assert r.status_code == 200
    tx_ids = [p["id"] for p in r.json()["items"]]
    assert ids["tx_b_id"] not in tx_ids


# CA-003: cancelar transação de outra empresa retorna 404
async def test_cancel_transacao_alheia_retorna_404(client, ids, token_owner):
    r = await client.post(
        f"/payments/{ids['tx_b_id']}/cancel",
        json={"reason": "tentativa de acesso cruzado"},
        headers=auth(token_owner),
    )
    assert r.status_code == 404


# CA-005: sem token retorna 401
async def test_sem_token_retorna_401(client):
    r = await client.get("/payments")
    assert r.status_code == 401


# ORD-079: cancelamento passa a exigir role de escrita (admin/owner/manager)
# — antes qualquer JWT válido da empresa cancelava via API direta. O 403 vem
# do Depends(require_write_role), avaliado antes do handler rodar, então nem
# precisa existir uma transação com esse id pra reproduzir.
async def test_cancel_sem_role_de_escrita_retorna_403(client, token_kiosk):
    r = await client.post(
        "/payments/9999/cancel",
        json={"reason": "teste"},
        headers=auth(token_kiosk),
    )
    assert r.status_code == 403


# Empresa B enxerga apenas suas próprias transações
async def test_empresa_b_enxerga_apenas_suas_transacoes(client, ids, token_company_b):
    r = await client.get("/payments", headers=auth(token_company_b))
    assert r.status_code == 200
    tx_ids = [p["id"] for p in r.json()["items"]]
    assert ids["tx_b_id"] in tx_ids
