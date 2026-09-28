import os
import sys
from datetime import datetime

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


_company_seq = 0


async def _create_company(name: str = "Empresa Teste") -> int:
    global _company_seq
    _company_seq += 1
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        co = svc.Company(name=name, pin_hash="x" * 60, state="SP")
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


async def _deactivate_partner(client, token, partner_id: int) -> None:
    resp = await client.post(f"/commercial/partners/{partner_id}/deactivate", headers=auth(token))
    assert resp.status_code == 200, resp.text


# ── CRUD do vínculo ──────────────────────────────────────────────────────────

async def test_vincular_parceiro_pela_primeira_vez(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    partner_id = await _create_partner(client, token_superadmin, ct)
    company_id = await _create_company()

    resp = await client.put(
        f"/companies/{company_id}/partner", json={"partner_id": partner_id}, headers=auth(token_superadmin),
    )
    assert resp.status_code == 200
    assert resp.json()["partner"]["id"] == partner_id

    history = await client.get(f"/companies/{company_id}/partner/history", headers=auth(token_superadmin))
    entries = history.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["from_partner"] is None
    assert entries[0]["to_partner"]["id"] == partner_id


async def test_trocar_parceiro_vinculado(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    partner_a = await _create_partner(client, token_superadmin, ct, name="A")
    partner_b = await _create_partner(client, token_superadmin, ct, name="B")
    company_id = await _create_company()

    await client.put(f"/companies/{company_id}/partner", json={"partner_id": partner_a}, headers=auth(token_superadmin))
    resp = await client.put(f"/companies/{company_id}/partner", json={"partner_id": partner_b}, headers=auth(token_superadmin))
    assert resp.status_code == 200
    assert resp.json()["partner"]["id"] == partner_b

    history = await client.get(f"/companies/{company_id}/partner/history", headers=auth(token_superadmin))
    entries = history.json()["entries"]
    assert len(entries) == 2
    assert entries[1]["from_partner"]["id"] == partner_a
    assert entries[1]["to_partner"]["id"] == partner_b


async def test_remover_vinculo(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    partner_a = await _create_partner(client, token_superadmin, ct)
    company_id = await _create_company()

    await client.put(f"/companies/{company_id}/partner", json={"partner_id": partner_a}, headers=auth(token_superadmin))
    resp = await client.put(f"/companies/{company_id}/partner", json={"partner_id": None}, headers=auth(token_superadmin))
    assert resp.status_code == 200
    assert resp.json()["partner"] is None

    history = await client.get(f"/companies/{company_id}/partner/history", headers=auth(token_superadmin))
    entries = history.json()["entries"]
    assert len(entries) == 2
    assert entries[1]["from_partner"]["id"] == partner_a
    assert entries[1]["to_partner"] is None


async def test_mesmo_parceiro_repetido_e_idempotente(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    partner_a = await _create_partner(client, token_superadmin, ct)
    company_id = await _create_company()

    await client.put(f"/companies/{company_id}/partner", json={"partner_id": partner_a}, headers=auth(token_superadmin))
    resp = await client.put(f"/companies/{company_id}/partner", json={"partner_id": partner_a}, headers=auth(token_superadmin))
    assert resp.status_code == 200

    history = await client.get(f"/companies/{company_id}/partner/history", headers=auth(token_superadmin))
    assert len(history.json()["entries"]) == 1


async def test_reenviar_null_numa_empresa_ja_sem_parceiro_e_idempotente(client, token_superadmin):
    company_id = await _create_company()

    resp = await client.put(f"/companies/{company_id}/partner", json={"partner_id": None}, headers=auth(token_superadmin))
    assert resp.status_code == 200
    assert resp.json()["partner"] is None

    history = await client.get(f"/companies/{company_id}/partner/history", headers=auth(token_superadmin))
    assert history.json()["entries"] == []


async def test_vincular_parceiro_ja_inativo_e_permitido_via_api(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    partner_id = await _create_partner(client, token_superadmin, ct)
    await _deactivate_partner(client, token_superadmin, partner_id)
    company_id = await _create_company()

    resp = await client.put(
        f"/companies/{company_id}/partner", json={"partner_id": partner_id}, headers=auth(token_superadmin),
    )
    assert resp.status_code == 200
    assert resp.json()["partner"]["status"] == "inativo"


# ── Erros ────────────────────────────────────────────────────────────────────

async def test_erro_vincular_parceiro_inexistente(client, token_superadmin):
    company_id = await _create_company()
    resp = await client.put(
        f"/companies/{company_id}/partner", json={"partner_id": 999999}, headers=auth(token_superadmin),
    )
    assert resp.status_code == 404


async def test_erro_vincular_empresa_inexistente(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    partner_id = await _create_partner(client, token_superadmin, ct)
    resp = await client.put(
        "/companies/999999/partner", json={"partner_id": partner_id}, headers=auth(token_superadmin),
    )
    assert resp.status_code == 404


# ── Consulta e histórico ─────────────────────────────────────────────────────

async def test_consultar_vinculo_atual(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    partner_id = await _create_partner(client, token_superadmin, ct)
    company_id = await _create_company()
    await client.put(f"/companies/{company_id}/partner", json={"partner_id": partner_id}, headers=auth(token_superadmin))

    resp = await client.get(f"/companies/{company_id}/partner", headers=auth(token_superadmin))
    assert resp.status_code == 200
    assert resp.json()["partner"]["id"] == partner_id


async def test_consultar_vinculo_de_empresa_sem_parceiro(client, token_superadmin):
    company_id = await _create_company()
    resp = await client.get(f"/companies/{company_id}/partner", headers=auth(token_superadmin))
    assert resp.status_code == 200
    assert resp.json()["partner"] is None


async def test_historico_vazio_retorna_200_lista_vazia(client, token_superadmin):
    company_id = await _create_company()
    resp = await client.get(f"/companies/{company_id}/partner/history", headers=auth(token_superadmin))
    assert resp.status_code == 200
    assert resp.json()["entries"] == []


async def test_historico_multiplas_trocas_em_ordem_cronologica(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    partner_a = await _create_partner(client, token_superadmin, ct, name="A")
    partner_b = await _create_partner(client, token_superadmin, ct, name="B")
    partner_c = await _create_partner(client, token_superadmin, ct, name="C")
    company_id = await _create_company()

    await client.put(f"/companies/{company_id}/partner", json={"partner_id": partner_a}, headers=auth(token_superadmin))
    await client.put(f"/companies/{company_id}/partner", json={"partner_id": partner_b}, headers=auth(token_superadmin))
    await client.put(f"/companies/{company_id}/partner", json={"partner_id": partner_c}, headers=auth(token_superadmin))

    history = await client.get(f"/companies/{company_id}/partner/history", headers=auth(token_superadmin))
    entries = history.json()["entries"]
    assert len(entries) == 3
    timestamps = [datetime.fromisoformat(e["created_at"]) for e in entries]
    assert timestamps == sorted(timestamps)
    assert entries[0]["to_partner"]["id"] == partner_a
    assert entries[1]["to_partner"]["id"] == partner_b
    assert entries[2]["to_partner"]["id"] == partner_c


async def test_historico_registra_entrada_e_remocao(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    partner_a = await _create_partner(client, token_superadmin, ct)
    company_id = await _create_company()

    await client.put(f"/companies/{company_id}/partner", json={"partner_id": partner_a}, headers=auth(token_superadmin))
    await client.put(f"/companies/{company_id}/partner", json={"partner_id": None}, headers=auth(token_superadmin))

    history = await client.get(f"/companies/{company_id}/partner/history", headers=auth(token_superadmin))
    entries = history.json()["entries"]
    assert len(entries) == 2
    assert entries[0]["from_partner"] is None and entries[0]["to_partner"]["id"] == partner_a
    assert entries[1]["from_partner"]["id"] == partner_a and entries[1]["to_partner"] is None


# ── Independência do status do parceiro ──────────────────────────────────────

async def test_desativar_parceiro_nao_desfaz_vinculo(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    partner_id = await _create_partner(client, token_superadmin, ct)
    company_id = await _create_company()
    await client.put(f"/companies/{company_id}/partner", json={"partner_id": partner_id}, headers=auth(token_superadmin))

    await _deactivate_partner(client, token_superadmin, partner_id)

    resp = await client.get(f"/companies/{company_id}/partner", headers=auth(token_superadmin))
    assert resp.json()["partner"]["id"] == partner_id
    assert resp.json()["partner"]["status"] == "inativo"

    history = await client.get(f"/companies/{company_id}/partner/history", headers=auth(token_superadmin))
    assert len(history.json()["entries"]) == 1


# ── Listagem de parceiros disponíveis (reaproveita GET /commercial/partners) ─

async def test_listagem_de_parceiros_disponiveis_esconde_inativos(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    ativo_id = await _create_partner(client, token_superadmin, ct, name="Ativo")
    inativo_id = await _create_partner(client, token_superadmin, ct, name="Inativo")
    await _deactivate_partner(client, token_superadmin, inativo_id)

    resp = await client.get("/commercial/partners", headers=auth(token_superadmin))
    ids = [p["id"] for p in resp.json()["partners"]]
    assert ativo_id in ids
    assert inativo_id not in ids


# ── Acesso ───────────────────────────────────────────────────────────────────

async def test_owner_recebe_403(client, token_owner):
    company_id = 1
    resp = await client.get(f"/companies/{company_id}/partner", headers=auth(token_owner))
    assert resp.status_code == 403


async def test_sem_token_recebe_401(client):
    resp = await client.get("/companies/1/partner")
    assert resp.status_code == 401
