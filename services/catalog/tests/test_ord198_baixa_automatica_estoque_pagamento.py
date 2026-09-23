"""ORD-198 (D1): POST /internal/stock/decrement — baixa automática de estoque
na aprovação do pagamento (chamado pelo payment-service). Protegido por
X-Internal-Secret, sem autenticação de usuário (mesmo padrão de
/internal/products/{id}/fiscal, ORD-171).
"""
import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

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


def _internal_headers():
    import main as svc
    return {"X-Internal-Secret": svc.INTERNAL_SECRET}


async def _create_product(client, token, name="Produto", **extra):
    body = {"name": name, "price": 9.9, **extra}
    r = await client.post("/catalog/products", json=body, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _entrada_manual(client, token, product_id, quantidade=10, unidade="un"):
    r = await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": quantidade, "unidade": unidade},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text


# ── Happy path (Critério 1, 2) ────────────────────────────────────────────

async def test_decrementa_estoque_do_produto_vendido(client, token_owner):
    pid = await _create_product(client, token_owner, name="Coca-Cola Lata 350ml")
    await _entrada_manual(client, token_owner, pid, quantidade=10)

    r = await client.post(
        "/internal/stock/decrement",
        json={"order_ref": "ORD-D1-01", "items": [{"product_id": pid, "quantity": 1}]},
        headers=_internal_headers(),
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"processed": 1, "skipped": 0}

    state = await client.get(f"/catalog/products/{pid}/stock", headers={"Authorization": f"Bearer {token_owner}"})
    assert state.json()["quantidade_atual"] == 9

    saida = next(m for m in state.json()["movements"] if m["tipo"] == "saida")
    assert saida["quantidade"] == -1
    assert saida["criado_por"] is None


# ── Rollout — produto nunca controlado (Critério 4) ─────────────────────

async def test_produto_sem_estoque_controlado_e_pulado_sem_erro(client, token_owner):
    pid = await _create_product(client, token_owner, name="Produto Nunca Vendido")
    # sem _entrada_manual — nunca teve stock_item

    r = await client.post(
        "/internal/stock/decrement",
        json={"order_ref": "ORD-D1-02", "items": [{"product_id": pid, "quantity": 1}]},
        headers=_internal_headers(),
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"processed": 0, "skipped": 1}


# ── Concorrência — duas chamadas, ambas gravadas, saldo pode ficar negativo (Critério 6) ──

async def test_concorrencia_duas_chamadas_ambas_decrementam_mesmo_com_saldo_negativo(client, token_owner):
    import main as svc
    pid = await _create_product(client, token_owner, name="Produto Escasso")
    await _entrada_manual(client, token_owner, pid, quantidade=1)

    r1 = await client.post(
        "/internal/stock/decrement",
        json={"order_ref": "ORD-D1-03A", "items": [{"product_id": pid, "quantity": 1}]},
        headers=_internal_headers(),
    )
    r2 = await client.post(
        "/internal/stock/decrement",
        json={"order_ref": "ORD-D1-03B", "items": [{"product_id": pid, "quantity": 1}]},
        headers=_internal_headers(),
    )
    assert r1.status_code == 200, r1.text
    assert r2.status_code == 200, r2.text
    assert r1.json() == {"processed": 1, "skipped": 0}
    assert r2.json() == {"processed": 1, "skipped": 0}

    async with svc.AsyncSessionLocal() as db:
        item = (await db.execute(
            svc.select(svc.StockItem).filter_by(product_id=pid)
        )).scalars().first()
        assert item.quantidade_atual == Decimal("-1.000")  # 1 - 1 - 1, nenhuma chamada bloqueada


# ── Idempotência (Critério 7) ─────────────────────────────────────────────

async def test_reenviar_mesmo_order_ref_nao_duplica_decremento(client, token_owner):
    pid = await _create_product(client, token_owner, name="Produto Idempotente")
    await _entrada_manual(client, token_owner, pid, quantidade=10)

    body = {"order_ref": "ORD-D1-04", "items": [{"product_id": pid, "quantity": 1}]}
    r1 = await client.post("/internal/stock/decrement", json=body, headers=_internal_headers())
    r2 = await client.post("/internal/stock/decrement", json=body, headers=_internal_headers())

    assert r1.json() == {"processed": 1, "skipped": 0}
    assert r2.json() == {"processed": 0, "skipped": 1}  # já processado, não decrementa de novo

    state = await client.get(f"/catalog/products/{pid}/stock", headers={"Authorization": f"Bearer {token_owner}"})
    assert state.json()["quantidade_atual"] == 9  # não 8


# ── Isolamento multi-tenant — estrutural via product_id global (Critério 9) ──

async def test_isolamento_multi_tenant_product_id_e_pk_global(client, token_owner, token_company_b):
    pid_a = await _create_product(client, token_owner, name="Produto Empresa A")
    await _entrada_manual(client, token_owner, pid_a, quantidade=10)
    pid_b = await _create_product(client, token_company_b, name="Produto Empresa B")
    await _entrada_manual(client, token_company_b, pid_b, quantidade=10)

    r = await client.post(
        "/internal/stock/decrement",
        json={"order_ref": "ORD-D1-05", "items": [{"product_id": pid_a, "quantity": 1}]},
        headers=_internal_headers(),
    )
    assert r.status_code == 200, r.text

    state_a = await client.get(f"/catalog/products/{pid_a}/stock", headers={"Authorization": f"Bearer {token_owner}"})
    state_b = await client.get(f"/catalog/products/{pid_b}/stock", headers={"Authorization": f"Bearer {token_company_b}"})
    assert state_a.json()["quantidade_atual"] == 9
    assert state_b.json()["quantidade_atual"] == 10  # inalterado


# ── Validação de payload ─────────────────────────────────────────────────

async def test_quantity_zero_ou_negativa_e_rejeitada(client, token_owner):
    pid = await _create_product(client, token_owner, name="Produto Validação")
    await _entrada_manual(client, token_owner, pid, quantidade=10)

    r = await client.post(
        "/internal/stock/decrement",
        json={"order_ref": "ORD-D1-06", "items": [{"product_id": pid, "quantity": 0}]},
        headers=_internal_headers(),
    )
    assert r.status_code == 422, r.text

    state = await client.get(f"/catalog/products/{pid}/stock", headers={"Authorization": f"Bearer {token_owner}"})
    assert state.json()["quantidade_atual"] == 10  # nada foi aplicado


async def test_order_ref_vazio_e_rejeitado(client, token_owner):
    pid = await _create_product(client, token_owner, name="Produto Validação 2")
    r = await client.post(
        "/internal/stock/decrement",
        json={"order_ref": "", "items": [{"product_id": pid, "quantity": 1}]},
        headers=_internal_headers(),
    )
    assert r.status_code == 422, r.text


# ── Auth do endpoint interno ──────────────────────────────────────────────

async def test_sem_secret_correto_retorna_403(client):
    r = await client.post(
        "/internal/stock/decrement",
        json={"order_ref": "ORD-D1-07", "items": [{"product_id": 1, "quantity": 1}]},
        headers={"X-Internal-Secret": "secret-errado"},
    )
    assert r.status_code == 403
