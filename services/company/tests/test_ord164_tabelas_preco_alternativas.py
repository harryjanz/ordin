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


# ── Marcação de kind ─────────────────────────────────────────────────────────

async def test_marcar_tabela_ativa_como_alternativa(client, token_superadmin):
    table_id = await _seed_price_table(status="active")
    r = await client.patch(
        f"/commercial/price-tables/{table_id}/kind",
        json={"kind": "alternativa"},
        headers=auth(token_superadmin),
    )
    assert r.status_code == 200
    assert r.json()["kind"] == "alternativa"
    assert r.json()["status"] == "active"


async def test_marcar_tabela_historica_como_promocional(client, token_superadmin):
    table_id = await _seed_price_table(status="historical")
    r = await client.patch(
        f"/commercial/price-tables/{table_id}/kind",
        json={"kind": "promocional"},
        headers=auth(token_superadmin),
    )
    assert r.status_code == 200
    assert r.json()["kind"] == "promocional"
    assert r.json()["status"] == "historical"


async def test_bloqueado_marcar_kind_em_rascunho(client, token_superadmin):
    table_id = await _seed_price_table(status="draft")
    r = await client.patch(
        f"/commercial/price-tables/{table_id}/kind",
        json={"kind": "alternativa"},
        headers=auth(token_superadmin),
    )
    assert r.status_code == 422


async def test_multiplas_tabelas_com_kind_simultaneo(client, token_superadmin):
    a = await _seed_price_table(status="historical", name="Tabela A", kind="alternativa")
    b = await _seed_price_table(status="active", name="Tabela Vigente")
    await client.patch(f"/commercial/price-tables/{b}/kind", json={"kind": "promocional"}, headers=auth(token_superadmin))

    r = await client.get("/commercial/price-tables", headers=auth(token_superadmin))
    by_id = {t["id"]: t["kind"] for t in r.json()["price_tables"]}
    assert by_id[a] == "alternativa"
    assert by_id[b] == "promocional"


async def test_desmarcar_kind_sem_vinculo(client, token_superadmin):
    table_id = await _seed_price_table(status="historical", kind="promocional")
    r = await client.patch(
        f"/commercial/price-tables/{table_id}/kind",
        json={"kind": None},
        headers=auth(token_superadmin),
    )
    assert r.status_code == 200
    assert r.json()["kind"] is None


async def test_desmarcar_kind_de_tabela_vinculada_nao_desfaz_vinculo(client, token_superadmin):
    table_id = await _seed_price_table(status="historical", kind="promocional")
    await _seed_company(20)
    await _seed_company_plan(20, table_id)

    r = await client.patch(
        f"/commercial/price-tables/{table_id}/kind",
        json={"kind": None},
        headers=auth(token_superadmin),
    )
    assert r.status_code == 200

    r2 = await client.get("/companies/20/plan", headers=auth(token_superadmin))
    assert r2.json()["price_table"]["id"] == table_id


# ── Isolamento entre kind e editable (ORD-162) ──────────────────────────────

async def test_marcar_kind_nao_altera_editable_sem_vinculo(client, token_superadmin):
    table_id = await _seed_price_table(status="active")
    await client.patch(f"/commercial/price-tables/{table_id}/kind", json={"kind": "alternativa"}, headers=auth(token_superadmin))
    r = await client.get(f"/commercial/price-tables/{table_id}", headers=auth(token_superadmin))
    assert r.json()["editable"] is True


async def test_tabela_com_kind_e_vinculada_continua_bloqueada_para_edicao(client, token_superadmin):
    table_id = await _seed_price_table(status="historical", kind="promocional")
    await _seed_company(20)
    await _seed_company_plan(20, table_id)

    payload = {
        "name": "Tentativa de edição",
        "totem_price_1": 300.0,
        "totem_multiplier_2": 0.5,
        "totem_multiplier_3_5": 0.3,
        "transaction_tiers": [{"min_transactions": 0, "max_transactions": None, "price_per_transaction": 0.1}],
    }
    r = await client.put(f"/commercial/price-tables/{table_id}", json=payload, headers=auth(token_superadmin))
    assert r.status_code == 409


async def test_excluir_tabela_com_kind_sem_vinculo_permitido(client, token_superadmin):
    table_id = await _seed_price_table(status="historical", kind="alternativa")
    r = await client.delete(f"/commercial/price-tables/{table_id}", headers=auth(token_superadmin))
    assert r.status_code == 204


async def test_excluir_tabela_com_kind_vinculada_bloqueado(client, token_superadmin):
    table_id = await _seed_price_table(status="historical", kind="promocional")
    await _seed_company(20)
    await _seed_company_plan(20, table_id)
    r = await client.delete(f"/commercial/price-tables/{table_id}", headers=auth(token_superadmin))
    assert r.status_code == 409


async def test_ativar_tabela_marcada_como_alternativa_preserva_kind(client, token_superadmin):
    table_id = await _seed_price_table(status="historical", kind="alternativa")
    r = await client.post(
        f"/commercial/price-tables/{table_id}/activate",
        json={"confirm_replace": True},
        headers=auth(token_superadmin),
    )
    assert r.status_code == 200
    assert r.json()["status"] == "active"
    assert r.json()["kind"] == "alternativa"


# ── Criação de empresa — inalterada ─────────────────────────────────────────

async def test_criar_empresa_ignora_tabelas_com_kind_usa_vigente(client, token_superadmin):
    vigente = await _seed_price_table(status="active", name="Tabela Vigente")
    await _seed_price_table(status="historical", name="Tabela Promo", kind="promocional")

    r = await client.post("/companies", json={"name": "Pizza Express", "state": "SP"}, headers=auth(token_superadmin))
    assert r.status_code == 201
    company_id = r.json()["company"]["id"]

    r2 = await client.get(f"/companies/{company_id}/plan", headers=auth(token_superadmin))
    assert r2.json()["price_table"]["id"] == vigente


# ── Renovação — escolha manual vs. padrão ───────────────────────────────────

async def test_renovar_sem_price_table_id_usa_vigente(client, token_superadmin):
    vigente = await _seed_price_table(status="active", name="Tabela Vigente")
    await _seed_price_table(status="historical", name="Tabela Promo", kind="promocional")
    await _seed_company(20)
    await _seed_company_plan(20, vigente)

    r = await client.post("/companies/20/plan/renew", headers=auth(token_superadmin))
    assert r.status_code == 200
    assert r.json()["price_table"]["id"] == vigente
    assert r.json()["renewed_at"] is not None


async def test_renovar_escolhendo_tabela_promocional(client, token_superadmin):
    vigente = await _seed_price_table(status="active", name="Tabela Vigente")
    promo = await _seed_price_table(status="historical", name="Tabela Promo", kind="promocional")
    await _seed_company(20)
    await _seed_company_plan(20, vigente)

    r = await client.post(
        "/companies/20/plan/renew",
        json={"price_table_id": promo},
        headers=auth(token_superadmin),
    )
    assert r.status_code == 200
    assert r.json()["price_table"]["id"] == promo

    # tabela vigente continua active pras demais empresas
    r2 = await client.get(f"/commercial/price-tables/{vigente}", headers=auth(token_superadmin))
    assert r2.json()["status"] == "active"


async def test_renovar_escolhendo_tabela_sem_kind_e_nao_vigente_bloqueado(client, token_superadmin):
    await _seed_price_table(status="active", name="Tabela Vigente")
    orfa = await _seed_price_table(status="historical", name="Tabela Órfã")
    await _seed_company(20)
    await _seed_company_plan(20, orfa)

    r = await client.post(
        "/companies/20/plan/renew",
        json={"price_table_id": orfa},
        headers=auth(token_superadmin),
    )
    assert r.status_code == 422


async def test_renovar_escolhendo_tabela_draft_bloqueado(client, token_superadmin):
    vigente = await _seed_price_table(status="active", name="Tabela Vigente")
    rascunho = await _seed_price_table(status="draft", name="Tabela Rascunho")
    await _seed_company(20)
    await _seed_company_plan(20, vigente)

    r = await client.post(
        "/companies/20/plan/renew",
        json={"price_table_id": rascunho},
        headers=auth(token_superadmin),
    )
    assert r.status_code == 422


async def test_desmarcar_kind_bloqueia_novas_escolhas_mas_nao_afeta_planos_existentes(client, token_superadmin):
    vigente = await _seed_price_table(status="active", name="Tabela Vigente")
    promo = await _seed_price_table(status="historical", name="Tabela Promo", kind="promocional")
    await _seed_company(20)
    await _seed_company_plan(20, promo)
    await _seed_company(21)
    await _seed_company_plan(21, vigente)

    await client.patch(f"/commercial/price-tables/{promo}/kind", json={"kind": None}, headers=auth(token_superadmin))

    r = await client.post(
        "/companies/21/plan/renew",
        json={"price_table_id": promo},
        headers=auth(token_superadmin),
    )
    assert r.status_code == 422

    r2 = await client.get("/companies/20/plan", headers=auth(token_superadmin))
    assert r2.json()["price_table"]["id"] == promo


# ── Aplicar tabela sem renovar ───────────────────────────────────────────────

async def test_aplicar_tabela_sem_renovar_mantem_expires_at(client, token_superadmin):
    vigente = await _seed_price_table(status="active", name="Tabela Vigente")
    negociada = await _seed_price_table(status="active", name="Tabela Negociada", kind="alternativa")
    await _seed_company(20)
    expires = datetime.utcnow() + timedelta(days=200)
    await _seed_company_plan(20, vigente, expires_at=expires)

    r = await client.patch(
        "/companies/20/plan",
        json={"price_table_id": negociada},
        headers=auth(token_superadmin),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["price_table"]["id"] == negociada
    assert body["renewed_at"] is None
    assert abs((datetime.fromisoformat(body["expires_at"]) - expires).total_seconds()) < 2


async def test_aplicar_tabela_invalida_bloqueado(client, token_superadmin):
    vigente = await _seed_price_table(status="active", name="Tabela Vigente")
    orfa = await _seed_price_table(status="historical", name="Tabela Órfã")
    await _seed_company(20)
    await _seed_company_plan(20, vigente)

    r = await client.patch(
        "/companies/20/plan",
        json={"price_table_id": orfa},
        headers=auth(token_superadmin),
    )
    assert r.status_code == 422


# ── Controle de acesso ───────────────────────────────────────────────────────

async def test_owner_nao_pode_marcar_kind(client):
    table_id = await _seed_price_table(status="active")
    r = await client.patch(
        f"/commercial/price-tables/{table_id}/kind",
        json={"kind": "alternativa"},
        headers=auth(make_token("owner", 1)),
    )
    assert r.status_code == 403


async def test_sem_token_marcar_kind(client):
    table_id = await _seed_price_table(status="active")
    r = await client.patch(f"/commercial/price-tables/{table_id}/kind", json={"kind": "alternativa"})
    assert r.status_code == 401


async def test_sem_token_renovar_com_price_table_id(client):
    r = await client.post("/companies/20/plan/renew", json={"price_table_id": 1})
    assert r.status_code == 401


async def test_owner_nao_pode_escolher_tabela_na_renovacao(client):
    vigente = await _seed_price_table(status="active")
    promo = await _seed_price_table(status="historical", kind="promocional")
    await _seed_company(20)
    await _seed_company_plan(20, vigente)

    r = await client.post(
        "/companies/20/plan/renew",
        json={"price_table_id": promo},
        headers=auth(make_token("owner", 20)),
    )
    assert r.status_code == 403


async def test_owner_nao_pode_aplicar_tabela_sem_renovar(client):
    vigente = await _seed_price_table(status="active")
    alt = await _seed_price_table(status="historical", kind="alternativa")
    await _seed_company(20)
    await _seed_company_plan(20, vigente)

    r = await client.patch(
        "/companies/20/plan",
        json={"price_table_id": alt},
        headers=auth(make_token("owner", 20)),
    )
    assert r.status_code == 403
