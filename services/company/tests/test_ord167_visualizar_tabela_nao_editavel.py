"""ORD-167: visualização somente-leitura de tabela de preço não editável.
Cobre os cenários Gherkin do QA Explorer
(docs/stories/ORD-167-visualizar-tabela-preco-nao-editavel.md) — o campo
novo é `linked_companies` (nomes) em PriceTableOut, complementando
`linked_companies_count` (já existia, ORD-165). Mesmo padrão de fixtures
de test_ord165_auditoria_guardrails.py.
"""
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


async def _seed_price_table(status: str = "active", name: str = "Tabela") -> int:
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        pt = svc.PriceTable(
            name=name, status=status, totem_price_1=249.00,
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


async def _seed_company(company_id: int, name: str) -> None:
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        pin_hash = bcrypt.hashpw(b"1234", bcrypt.gensalt(4)).decode()
        db.add(svc.Company(id=company_id, name=name, pin_hash=pin_hash, state="SP"))
        await db.commit()


async def _seed_company_plan(company_id: int, price_table_id: int) -> None:
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        db.add(svc.CompanyPlan(
            company_id=company_id, price_table_id=price_table_id,
            started_at=datetime.utcnow(), expires_at=datetime.utcnow() + timedelta(days=365),
        ))
        await db.commit()


# ── Happy path ────────────────────────────────────────────────────────────────

async def test_detalhe_tabela_nao_editavel_retorna_nomes_das_empresas_vinculadas(client, token_superadmin):
    table_id = await _seed_price_table(status="active", name="Tabela 2026-Q4")
    await _seed_company(30, "Burger House")
    await _seed_company_plan(30, table_id)
    await _seed_company(31, "Pasta & Co")
    await _seed_company_plan(31, table_id)

    r = await client.get(f"/commercial/price-tables/{table_id}", headers=auth(token_superadmin))
    assert r.status_code == 200
    data = r.json()
    assert data["editable"] is False
    assert data["linked_companies_count"] == 2
    names = {c["name"] for c in data["linked_companies"]}
    assert names == {"Burger House", "Pasta & Co"}


async def test_detalhe_tabela_editavel_lista_empresas_vazia(client, token_superadmin):
    table_id = await _seed_price_table(status="draft", name="Tabela Rascunho")

    r = await client.get(f"/commercial/price-tables/{table_id}", headers=auth(token_superadmin))
    data = r.json()
    assert data["editable"] is True
    assert data["linked_companies"] == []


# ── Bordas ────────────────────────────────────────────────────────────────────

async def test_tabela_ja_utilizada_sem_vinculo_hoje_lista_vazia_mas_permanece_travada(client, token_superadmin):
    """Regra "editable grudento" da ORD-165: tabela que já foi vinculada
    alguma vez fica travada pra sempre, mesmo sem nenhuma empresa hoje —
    aqui confirmamos que linked_companies acompanha esse mesmo critério
    (lista vazia, não travada por engano nem destravada por engano). Migração
    de plano via PATCH /companies/{id}/plan (não update direto no banco) —
    é essa chamada que grava o CompanyPlanHistory que _price_table_ever_linked
    consulta, mesmo padrão de test_ord165_auditoria_guardrails.py."""
    table_id = await _seed_price_table(status="active", name="Tabela Historicamente Usada")
    await _seed_company(32, "Empresa que saiu")
    await _seed_company_plan(32, table_id)

    outra_tabela = await _seed_price_table(status="active", name="Tabela Nova")
    await client.patch("/companies/32/plan", json={"price_table_id": outra_tabela}, headers=auth(token_superadmin))

    r = await client.get(f"/commercial/price-tables/{table_id}", headers=auth(token_superadmin))
    data = r.json()
    assert data["editable"] is False  # continua travada (histórico)
    assert data["linked_companies_count"] == 0
    assert data["linked_companies"] == []  # sem erro, lista vazia


# ── Regressão de controle de acesso já existente (não requisito novo) ────────

async def test_owner_nao_acessa_detalhe_de_tabela_de_preco(client, token_owner):
    table_id = await _seed_price_table(status="active", name="Tabela Qualquer")

    r = await client.get(f"/commercial/price-tables/{table_id}", headers=auth(token_owner))
    assert r.status_code == 403
