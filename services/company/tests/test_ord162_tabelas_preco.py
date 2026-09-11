import os
import sys

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


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _payload(name: str = "Tabela 2026-Q4", tiers=None) -> dict:
    return {
        "name": name,
        "totem_price_1": 249.00,
        "totem_multiplier_2": 0.5,
        "totem_multiplier_3_5": 0.3,
        "transaction_tiers": tiers if tiers is not None else [
            {"min_transactions": 0, "max_transactions": 1000, "price_per_transaction": 0.12},
            {"min_transactions": 1001, "max_transactions": 3000, "price_per_transaction": 0.10},
            {"min_transactions": 3001, "max_transactions": None, "price_per_transaction": 0.08},
        ],
    }


async def _seed_price_table(status: str, name: str = "Tabela", activated_at=None, archived_at=None):
    from datetime import datetime

    import main as svc
    async with svc.AsyncSessionLocal() as db:
        pt = svc.PriceTable(
            name=name, status=status, totem_price_1=249.00,
            totem_multiplier_2=0.5, totem_multiplier_3_5=0.3,
            activated_at=activated_at or (datetime.utcnow() if status != "draft" else None),
            archived_at=archived_at,
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


# ── Criação ──────────────────────────────────────────────────────────────────

async def test_criar_tabela_em_rascunho(client, token_superadmin):
    r = await client.post("/commercial/price-tables", json=_payload(), headers=auth(token_superadmin))
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "draft"
    assert len(body["transaction_tiers"]) == 3


async def test_criar_tabela_sem_preco_do_1o_totem_bloqueado(client, token_superadmin):
    payload = _payload()
    del payload["totem_price_1"]
    r = await client.post("/commercial/price-tables", json=payload, headers=auth(token_superadmin))
    assert r.status_code == 422  # validação de campo obrigatório do Pydantic


async def test_criar_tabela_com_faixas_sobrepostas_bloqueado(client, token_superadmin):
    tiers = [
        {"min_transactions": 0, "max_transactions": 1000, "price_per_transaction": 0.12},
        {"min_transactions": 800, "max_transactions": 3000, "price_per_transaction": 0.10},
    ]
    r = await client.post("/commercial/price-tables", json=_payload(tiers=tiers), headers=auth(token_superadmin))
    assert r.status_code == 422
    assert "sobrepor" in r.text


async def test_criar_tabela_com_lacuna_entre_faixas_bloqueado(client, token_superadmin):
    tiers = [
        {"min_transactions": 0, "max_transactions": 1000, "price_per_transaction": 0.12},
        {"min_transactions": 1500, "max_transactions": 3000, "price_per_transaction": 0.10},
    ]
    r = await client.post("/commercial/price-tables", json=_payload(tiers=tiers), headers=auth(token_superadmin))
    assert r.status_code == 422
    assert "lacuna" in r.text


async def test_faixa_aberta_no_meio_da_lista_bloqueado(client, token_superadmin):
    tiers = [
        {"min_transactions": 0, "max_transactions": None, "price_per_transaction": 0.12},
        {"min_transactions": 1001, "max_transactions": 3000, "price_per_transaction": 0.10},
    ]
    r = await client.post("/commercial/price-tables", json=_payload(tiers=tiers), headers=auth(token_superadmin))
    assert r.status_code == 422


# ── Edição ───────────────────────────────────────────────────────────────────

async def test_editar_tabela_em_rascunho(client, token_superadmin):
    r = await client.post("/commercial/price-tables", json=_payload(), headers=auth(token_superadmin))
    table_id = r.json()["id"]
    body = _payload(name="Tabela Ajustada")
    body["totem_price_1"] = 259.00
    r = await client.put(f"/commercial/price-tables/{table_id}", json=body, headers=auth(token_superadmin))
    assert r.status_code == 200
    assert r.json()["name"] == "Tabela Ajustada"
    assert float(r.json()["totem_price_1"]) == 259.00


async def test_editar_tabela_vigente_bloqueado(client, token_superadmin):
    table_id = await _seed_price_table(status="active")
    r = await client.put(f"/commercial/price-tables/{table_id}", json=_payload(), headers=auth(token_superadmin))
    assert r.status_code == 409


async def test_editar_tabela_historica_bloqueado(client, token_superadmin):
    table_id = await _seed_price_table(status="historical")
    r = await client.put(f"/commercial/price-tables/{table_id}", json=_payload(), headers=auth(token_superadmin))
    assert r.status_code == 409


# ── Ativação ─────────────────────────────────────────────────────────────────

async def test_ativar_primeira_tabela_sem_vigente_anterior(client, token_superadmin):
    r = await client.post("/commercial/price-tables", json=_payload(), headers=auth(token_superadmin))
    table_id = r.json()["id"]
    r = await client.post(f"/commercial/price-tables/{table_id}/activate", json={}, headers=auth(token_superadmin))
    assert r.status_code == 200
    assert r.json()["status"] == "active"


async def test_ativar_nova_tabela_sem_confirmacao_pede_confirmacao(client, token_superadmin):
    await _seed_price_table(status="active", name="Tabela Antiga")
    r = await client.post("/commercial/price-tables", json=_payload(name="Tabela Nova"), headers=auth(token_superadmin))
    table_id = r.json()["id"]
    r = await client.post(f"/commercial/price-tables/{table_id}/activate", json={}, headers=auth(token_superadmin))
    assert r.status_code == 409


async def test_ativar_nova_tabela_com_confirmacao_move_anterior_para_historica(client, token_superadmin):
    old_id = await _seed_price_table(status="active", name="Tabela Antiga")
    r = await client.post("/commercial/price-tables", json=_payload(name="Tabela Nova"), headers=auth(token_superadmin))
    new_id = r.json()["id"]

    r = await client.post(
        f"/commercial/price-tables/{new_id}/activate",
        json={"confirm_replace": True},
        headers=auth(token_superadmin),
    )
    assert r.status_code == 200
    assert r.json()["status"] == "active"

    r = await client.get(f"/commercial/price-tables/{old_id}", headers=auth(token_superadmin))
    assert r.json()["status"] == "historical"


async def test_ativacao_bloqueada_sem_faixa_de_transacao(client, token_superadmin):
    r = await client.post("/commercial/price-tables", json=_payload(tiers=[]), headers=auth(token_superadmin))
    table_id = r.json()["id"]
    r = await client.post(f"/commercial/price-tables/{table_id}/activate", json={}, headers=auth(token_superadmin))
    assert r.status_code == 400


# ── Duplicação e exclusão ────────────────────────────────────────────────────

async def test_duplicar_tabela_vigente_gera_novo_rascunho(client, token_superadmin):
    active_id = await _seed_price_table(status="active", name="Tabela Vigente")
    r = await client.post(f"/commercial/price-tables/{active_id}/duplicate", headers=auth(token_superadmin))
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "draft"
    assert body["id"] != active_id
    assert len(body["transaction_tiers"]) == 1

    # original permanece inalterada
    r = await client.get(f"/commercial/price-tables/{active_id}", headers=auth(token_superadmin))
    assert r.json()["status"] == "active"


async def test_excluir_tabela_em_rascunho(client, token_superadmin):
    r = await client.post("/commercial/price-tables", json=_payload(), headers=auth(token_superadmin))
    table_id = r.json()["id"]
    r = await client.delete(f"/commercial/price-tables/{table_id}", headers=auth(token_superadmin))
    assert r.status_code == 204
    r = await client.get(f"/commercial/price-tables/{table_id}", headers=auth(token_superadmin))
    assert r.status_code == 404


async def test_excluir_tabela_vigente_bloqueado(client, token_superadmin):
    table_id = await _seed_price_table(status="active")
    r = await client.delete(f"/commercial/price-tables/{table_id}", headers=auth(token_superadmin))
    assert r.status_code == 409


async def test_excluir_tabela_historica_bloqueado(client, token_superadmin):
    table_id = await _seed_price_table(status="historical")
    r = await client.delete(f"/commercial/price-tables/{table_id}", headers=auth(token_superadmin))
    assert r.status_code == 409


# ── Listagem ─────────────────────────────────────────────────────────────────

async def test_lista_mostra_status_e_data_de_ativacao(client, token_superadmin):
    await _seed_price_table(status="historical", name="Tabela Antiga")
    await _seed_price_table(status="active", name="Tabela Atual")
    r = await client.get("/commercial/price-tables", headers=auth(token_superadmin))
    assert r.status_code == 200
    names_status = {t["name"]: t["status"] for t in r.json()["price_tables"]}
    assert names_status == {"Tabela Antiga": "historical", "Tabela Atual": "active"}


# ── Controle de acesso ───────────────────────────────────────────────────────

async def test_acesso_negado_para_owner(client, token_owner):
    r = await client.get("/commercial/price-tables", headers=auth(token_owner))
    assert r.status_code == 403


async def test_acesso_negado_sem_token(client):
    r = await client.get("/commercial/price-tables")
    assert r.status_code == 401
