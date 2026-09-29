import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# ORD-210 — visibilidade cruzada Parceiro <-> Empresas indicadas. Não cria
# vínculo novo (reaproveita PUT /companies/{id}/partner do ORD-208) — só
# expõe leitura em mais 2 lugares: referred_companies_count/GET .../companies
# em Partner, e referred_by_partner em list_companies.


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


_company_seq = 0


async def _create_company(name: str = "Empresa Teste") -> int:
    global _company_seq
    _company_seq += 1
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        co = svc.Company(name=f"{name} {_company_seq}", pin_hash="x" * 60, state="SP")
        db.add(co)
        await db.commit()
        await db.refresh(co)
        return co.id


async def _create_commission_table(client, token, name: str = "Padrão") -> int:
    resp = await client.post(
        "/commercial/commission-tables",
        json={
            "name": name,
            "setup_fee_per_totem": 150.00,
            "recurring_percent": 3.5,
            "vigente_desde": "2026-01-01T00:00:00",
        },
        headers=auth(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


_doc_seq = 0


def _gen_valid_cpf(seq: int) -> str:
    def calc_digit(digits: str) -> str:
        s = sum(int(d) * w for d, w in zip(digits, range(len(digits) + 1, 1, -1)))
        r = s % 11
        return "0" if r < 2 else str(11 - r)

    base = str(100000000 + seq * 111111).zfill(9)[-9:]
    d1 = calc_digit(base)
    d2 = calc_digit(base + d1)
    return base + d1 + d2


async def _create_partner(client, token, commission_table_id: int, name: str = "Parceiro Teste") -> int:
    global _doc_seq
    _doc_seq += 1
    document = _gen_valid_cpf(_doc_seq)
    resp = await client.post(
        "/commercial/partners",
        json={
            "name": name,
            "partner_type": "PF",
            "document": document,
            "email": f"parceiro{_doc_seq}@teste.com",
            "phone": "11999999999",
            "acceptance_reference": "referência de teste automatizado",
            "commission_table_id": commission_table_id,
            "confirm_clickwrap": True,
        },
        headers=auth(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _link(client, token, company_id: int, partner_id: int | None) -> None:
    resp = await client.put(
        f"/companies/{company_id}/partner", json={"partner_id": partner_id}, headers=auth(token),
    )
    assert resp.status_code == 200, resp.text


# ── Contagem e lista nominal (Partner -> Companies) ─────────────────────────

async def test_parceiro_sem_empresa_indicada(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    partner_id = await _create_partner(client, token_superadmin, ct)

    resp = await client.get("/commercial/partners", headers=auth(token_superadmin))
    partner = next(p for p in resp.json()["partners"] if p["id"] == partner_id)
    assert partner["referred_companies_count"] == 0

    companies_resp = await client.get(f"/commercial/partners/{partner_id}/companies", headers=auth(token_superadmin))
    assert companies_resp.status_code == 200
    assert companies_resp.json()["companies"] == []


async def test_parceiro_com_uma_empresa_indicada(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    partner_id = await _create_partner(client, token_superadmin, ct)
    company_id = await _create_company("Burger House")
    await _link(client, token_superadmin, company_id, partner_id)

    resp = await client.get("/commercial/partners", headers=auth(token_superadmin))
    partner = next(p for p in resp.json()["partners"] if p["id"] == partner_id)
    assert partner["referred_companies_count"] == 1

    companies_resp = await client.get(f"/commercial/partners/{partner_id}/companies", headers=auth(token_superadmin))
    companies = companies_resp.json()["companies"]
    assert len(companies) == 1
    assert companies[0]["id"] == company_id
    assert companies[0]["vinculado_desde"] is not None


async def test_parceiro_com_multiplas_empresas(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    partner_id = await _create_partner(client, token_superadmin, ct)
    company_a = await _create_company("A")
    company_b = await _create_company("B")
    await _link(client, token_superadmin, company_a, partner_id)
    await _link(client, token_superadmin, company_b, partner_id)

    resp = await client.get("/commercial/partners", headers=auth(token_superadmin))
    partner = next(p for p in resp.json()["partners"] if p["id"] == partner_id)
    assert partner["referred_companies_count"] == 2

    companies_resp = await client.get(f"/commercial/partners/{partner_id}/companies", headers=auth(token_superadmin))
    ids = {c["id"] for c in companies_resp.json()["companies"]}
    assert ids == {company_a, company_b}


async def test_empresa_que_trocou_de_parceiro_so_aparece_no_atual(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    partner_a = await _create_partner(client, token_superadmin, ct, name="A")
    partner_b = await _create_partner(client, token_superadmin, ct, name="B")
    company_id = await _create_company()

    await _link(client, token_superadmin, company_id, partner_a)
    await _link(client, token_superadmin, company_id, partner_b)

    a_companies = await client.get(f"/commercial/partners/{partner_a}/companies", headers=auth(token_superadmin))
    b_companies = await client.get(f"/commercial/partners/{partner_b}/companies", headers=auth(token_superadmin))
    assert a_companies.json()["companies"] == []
    assert [c["id"] for c in b_companies.json()["companies"]] == [company_id]


async def test_parceiro_desativado_continua_contando_empresas_indicadas(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    partner_id = await _create_partner(client, token_superadmin, ct)
    company_id = await _create_company()
    await _link(client, token_superadmin, company_id, partner_id)

    await client.post(f"/commercial/partners/{partner_id}/deactivate", headers=auth(token_superadmin))

    resp = await client.get("/commercial/partners", params={"include_inactive": True}, headers=auth(token_superadmin))
    partner = next(p for p in resp.json()["partners"] if p["id"] == partner_id)
    assert partner["status"] == "inativo"
    assert partner["referred_companies_count"] == 1


# ── Coluna Parceiro na listagem de empresas (Company -> Partner) ───────────

async def test_empresa_sem_parceiro_aparece_com_referred_by_partner_nulo(client, token_superadmin):
    company_id = await _create_company("Sweet Corner")

    resp = await client.get("/companies", headers=auth(token_superadmin))
    company = next(c for c in resp.json()["companies"] if c["id"] == company_id)
    assert company["referred_by_partner"] is None


async def test_pagina_com_multiplos_parceiros_distintos_resolve_todos(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    partner_a = await _create_partner(client, token_superadmin, ct, name="Parceiro A")
    partner_b = await _create_partner(client, token_superadmin, ct, name="Parceiro B")
    company_a = await _create_company("Empresa A")
    company_b = await _create_company("Empresa B")
    company_c = await _create_company("Empresa C")
    await _link(client, token_superadmin, company_a, partner_a)
    await _link(client, token_superadmin, company_b, partner_b)

    resp = await client.get("/companies", params={"limit": 200}, headers=auth(token_superadmin))
    by_id = {c["id"]: c for c in resp.json()["companies"]}
    assert by_id[company_a]["referred_by_partner"]["id"] == partner_a
    assert by_id[company_b]["referred_by_partner"]["id"] == partner_b
    assert by_id[company_c]["referred_by_partner"] is None


# ── Acesso ───────────────────────────────────────────────────────────────────

async def test_consultar_empresas_de_parceiro_owner_recebe_403(client, token_owner):
    resp = await client.get("/commercial/partners/1/companies", headers=auth(token_owner))
    assert resp.status_code == 403


async def test_consultar_empresas_de_parceiro_sem_token_recebe_401(client):
    resp = await client.get("/commercial/partners/1/companies")
    assert resp.status_code == 401
