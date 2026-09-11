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


async def _seed_price_table(status: str = "active", name: str = "Tabela", kind: str | None = None) -> int:
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        pt = svc.PriceTable(
            name=name, status=status, kind=kind, totem_price_1=249.00,
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


async def _seed_company_plan(company_id: int, price_table_id: int, expires_at=None) -> None:
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        db.add(svc.CompanyPlan(
            company_id=company_id,
            price_table_id=price_table_id,
            started_at=datetime.utcnow(),
            expires_at=expires_at or (datetime.utcnow() + timedelta(days=365)),
        ))
        await db.commit()


# ── Registro de histórico ao trocar price_table_id ──────────────────────────

async def test_renovar_com_tabela_vigente_padrao_grava_historico(client, token_superadmin):
    table_id = await _seed_price_table(status="active")
    await _seed_company(20)
    await _seed_company_plan(20, table_id)

    r = await client.post("/companies/20/plan/renew", headers=auth(token_superadmin))
    assert r.status_code == 200

    r2 = await client.get("/companies/20/plan/history", headers=auth(token_superadmin))
    assert r2.status_code == 200
    entries = r2.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["action"] == "renew"
    assert entries[0]["from_price_table"]["id"] == table_id
    assert entries[0]["to_price_table"]["id"] == table_id
    assert entries[0]["created_at"] is not None


async def test_renovar_escolhendo_tabela_promocional_grava_historico(client, token_superadmin):
    vigente = await _seed_price_table(status="active", name="Tabela Vigente")
    promo = await _seed_price_table(status="historical", name="Tabela Promo", kind="promocional")
    await _seed_company(20)
    await _seed_company_plan(20, vigente)

    r = await client.post(
        "/companies/20/plan/renew", json={"price_table_id": promo}, headers=auth(token_superadmin)
    )
    assert r.status_code == 200

    r2 = await client.get("/companies/20/plan/history", headers=auth(token_superadmin))
    entries = r2.json()["entries"]
    assert entries[0]["from_price_table"]["id"] == vigente
    assert entries[0]["to_price_table"]["id"] == promo
    assert entries[0]["action"] == "renew"


async def test_aplicar_tabela_sem_renovar_grava_historico_com_acao_apply(client, token_superadmin):
    vigente = await _seed_price_table(status="active", name="Tabela Vigente")
    alt = await _seed_price_table(status="active", name="Tabela Alt", kind="alternativa")
    await _seed_company(20)
    await _seed_company_plan(20, vigente)

    r = await client.patch(
        "/companies/20/plan", json={"price_table_id": alt}, headers=auth(token_superadmin)
    )
    assert r.status_code == 200

    r2 = await client.get("/companies/20/plan/history", headers=auth(token_superadmin))
    entries = r2.json()["entries"]
    assert entries[0]["action"] == "apply"
    assert entries[0]["to_price_table"]["id"] == alt


async def test_consultar_historico_retorna_registros_em_ordem_cronologica(client, token_superadmin):
    a = await _seed_price_table(status="active", name="Tabela A")
    b = await _seed_price_table(status="active", name="Tabela B", kind="alternativa")
    c = await _seed_price_table(status="active", name="Tabela C", kind="promocional")
    await _seed_company(20)
    await _seed_company_plan(20, a)

    await client.patch("/companies/20/plan", json={"price_table_id": b}, headers=auth(token_superadmin))
    await client.patch("/companies/20/plan", json={"price_table_id": c}, headers=auth(token_superadmin))

    r = await client.get("/companies/20/plan/history", headers=auth(token_superadmin))
    entries = r.json()["entries"]
    assert len(entries) == 2
    # mais recente primeiro
    assert entries[0]["to_price_table"]["id"] == c
    assert entries[1]["to_price_table"]["id"] == b


async def test_falha_ao_gravar_historico_nao_impede_renovacao(client, token_superadmin, monkeypatch):
    import main as svc

    table_id = await _seed_price_table(status="active")
    await _seed_company(20)
    await _seed_company_plan(20, table_id)

    async def boom(*args, **kwargs):
        raise RuntimeError("falha simulada de gravação")

    monkeypatch.setattr(svc, "_record_plan_history", boom)

    r = await client.post("/companies/20/plan/renew", headers=auth(token_superadmin))
    assert r.status_code == 200
    body = r.json()
    assert body["renewed_at"] is not None

    # nenhum registro de histórico foi gravado (a falha aconteceu antes do insert)
    r2 = await client.get("/companies/20/plan/history", headers=auth(token_superadmin))
    assert r2.json()["entries"] == []


# ── editable com 3 estados ───────────────────────────────────────────────────

async def test_tabela_nunca_usada_continua_editavel_e_excluivel(client, token_superadmin):
    table_id = await _seed_price_table(status="active", name="Tabela Nova")
    r = await client.get(f"/commercial/price-tables/{table_id}", headers=auth(token_superadmin))
    assert r.json()["editable"] is True

    r2 = await client.delete(f"/commercial/price-tables/{table_id}", headers=auth(token_superadmin))
    assert r2.status_code == 204


async def test_tabela_ja_utilizada_sem_vinculo_hoje_permanece_travada(client, token_superadmin):
    antiga = await _seed_price_table(status="historical", name="Tabela Antiga")
    nova = await _seed_price_table(status="active", name="Tabela Nova")
    await _seed_company(20)
    await _seed_company_plan(20, antiga)

    # move o plano pra outra tabela — "Tabela Antiga" fica sem vínculo atual
    await client.patch("/companies/20/plan", json={"price_table_id": nova}, headers=auth(token_superadmin))

    r = await client.get(f"/commercial/price-tables/{antiga}", headers=auth(token_superadmin))
    assert r.json()["editable"] is False

    payload = {
        "name": "Tentativa", "totem_price_1": 300.0, "totem_multiplier_2": 0.5,
        "totem_multiplier_3_5": 0.3,
        "transaction_tiers": [{"min_transactions": 0, "max_transactions": None, "price_per_transaction": 0.1}],
    }
    r2 = await client.put(f"/commercial/price-tables/{antiga}", json=payload, headers=auth(token_superadmin))
    assert r2.status_code == 409

    r3 = await client.delete(f"/commercial/price-tables/{antiga}", headers=auth(token_superadmin))
    assert r3.status_code == 409


async def test_tabela_com_vinculo_atual_continua_travada(client, token_superadmin):
    table_id = await _seed_price_table(status="active")
    await _seed_company(20)
    await _seed_company_plan(20, table_id)

    r = await client.get(f"/commercial/price-tables/{table_id}", headers=auth(token_superadmin))
    assert r.json()["editable"] is False


async def test_desmarcar_kind_permitido_em_tabela_ja_utilizada(client, token_superadmin):
    antiga = await _seed_price_table(status="historical", name="Tabela Antiga", kind="promocional")
    nova = await _seed_price_table(status="active", name="Tabela Nova")
    await _seed_company(20)
    await _seed_company_plan(20, antiga)
    await client.patch("/companies/20/plan", json={"price_table_id": nova}, headers=auth(token_superadmin))

    r = await client.patch(
        f"/commercial/price-tables/{antiga}/kind", json={"kind": None}, headers=auth(token_superadmin)
    )
    assert r.status_code == 200
    assert r.json()["kind"] is None
    assert r.json()["editable"] is False


# ── Contador de empresas vinculadas ─────────────────────────────────────────

async def test_listagem_mostra_contador_de_empresas_vinculadas(client, token_superadmin):
    vigente = await _seed_price_table(status="active", name="Tabela Vigente")
    antiga = await _seed_price_table(status="historical", name="Tabela Antiga")
    await _seed_company(20)
    await _seed_company_plan(20, vigente)
    await _seed_company(21)
    await _seed_company_plan(21, vigente)

    r = await client.get("/commercial/price-tables", headers=auth(token_superadmin))
    by_id = {t["id"]: t["linked_companies_count"] for t in r.json()["price_tables"]}
    assert by_id[vigente] == 2
    assert by_id[antiga] == 0


# ── emit_audit continua sendo chamado ────────────────────────────────────────

async def test_emit_audit_chamado_na_renovacao_e_aplicacao(client, token_superadmin, monkeypatch):
    import main as svc

    calls = []
    monkeypatch.setattr(svc, "emit_audit", lambda event, *a, **kw: calls.append(event))

    vigente = await _seed_price_table(status="active", name="Tabela Vigente")
    alt = await _seed_price_table(status="historical", name="Tabela Alt", kind="alternativa")
    await _seed_company(20)
    await _seed_company_plan(20, vigente)

    await client.post("/companies/20/plan/renew", headers=auth(token_superadmin))
    await client.patch("/companies/20/plan", json={"price_table_id": alt}, headers=auth(token_superadmin))

    assert "company_plan_renewed" in calls
    assert "company_plan_table_applied" in calls


# ── Controle de acesso e isolamento ──────────────────────────────────────────

async def test_owner_consulta_historico_da_propria_empresa(client, token_superadmin):
    table_id = await _seed_price_table(status="active")
    await _seed_company(20)
    await _seed_company_plan(20, table_id)
    await client.post("/companies/20/plan/renew", headers=auth(token_superadmin))

    r = await client.get("/companies/20/plan/history", headers=auth(make_token("owner", 20)))
    assert r.status_code == 200


async def test_owner_nao_consulta_historico_de_outra_empresa(client, token_superadmin):
    table_id = await _seed_price_table(status="active")
    await _seed_company(20)
    await _seed_company_plan(20, table_id)

    r = await client.get("/companies/20/plan/history", headers=auth(make_token("owner", 21)))
    assert r.status_code == 403


async def test_admin_consulta_historico_de_qualquer_empresa(client, token_superadmin):
    table_id = await _seed_price_table(status="active")
    await _seed_company(20)
    await _seed_company_plan(20, table_id)

    r = await client.get("/companies/20/plan/history", headers=auth(token_superadmin))
    assert r.status_code == 200


async def test_sem_token_nao_consulta_historico(client):
    r = await client.get("/companies/20/plan/history")
    assert r.status_code == 401
