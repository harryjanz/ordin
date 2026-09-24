"""ORD-205: filtros de nome, CNPJ e status de cadastro na listagem de
fornecedores (GET /catalog/suppliers) — antes só listava tudo sem nenhum
filtro, diferente de Notas de compra e Pendências (mesma área de Estoque),
que já tinham. Cobre: match parcial case-insensitive em nome/cnpj (com ou
sem máscara), filtro exato por cadastro_pendente, combinação dos três, e
isolamento multi-tenant já coberto pelo isolamento padrão de company_id.
"""
import os
import sys
from pathlib import Path

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


def auth(token):
    return {"Authorization": f"Bearer {token}"}


FIXTURES = Path(__file__).parent / "fixtures" / "nfe"
CNPJ_EMITENTE = "59594315000157"  # emit CNPJ real de nfe_pequena.xml (mesmo usado em test_ord204)

CONTATO = {"nome": "Contato Padrão", "telefone": "11999998888", "email": "contato@fornecedor.com"}


async def _create_supplier(client, token, *, nome, cnpj):
    return await client.post(
        "/catalog/suppliers",
        json={"nome": nome, "cnpj": cnpj, "contato": CONTATO},
        headers=auth(token),
    )


async def _create_pending_supplier_via_nf(client, token):
    # Mesmo padrão de test_ord204 — só a importação de NF gera
    # cadastro_pendente=True; criação manual sempre nasce False.
    files = {"file": ("nfe_pequena.xml", (FIXTURES / "nfe_pequena.xml").read_bytes(), "application/xml")}
    r = await client.post("/catalog/supplier-invoices", files=files, headers=auth(token))
    assert r.status_code == 201, r.text


async def test_filtro_por_nome_match_parcial_case_insensitive(client, token_owner):
    await _create_supplier(client, token_owner, nome="Distribuidora Alfa", cnpj="11222333000181")
    await _create_supplier(client, token_owner, nome="Comércio Beta", cnpj="11444777000161")

    r = await client.get("/catalog/suppliers", params={"nome": "distri"}, headers=auth(token_owner))
    nomes = [s["nome"] for s in r.json()["suppliers"]]
    assert nomes == ["Distribuidora Alfa"]


async def test_filtro_por_cnpj_match_parcial_normaliza_mascara(client, token_owner):
    await _create_supplier(client, token_owner, nome="Fornecedor A", cnpj="11222333000181")
    await _create_supplier(client, token_owner, nome="Fornecedor B", cnpj="11444777000161")

    # Envia com máscara — normalize_cnpj precisa limpar antes do ilike.
    r = await client.get("/catalog/suppliers", params={"cnpj": "11.222.333"}, headers=auth(token_owner))
    cnpjs = [s["cnpj"] for s in r.json()["suppliers"]]
    assert cnpjs == ["11222333000181"]


async def test_filtro_cadastro_pendente_true(client, token_owner):
    await _create_supplier(client, token_owner, nome="Manual Completo", cnpj="11222333000181")
    await _create_pending_supplier_via_nf(client, token_owner)

    r = await client.get("/catalog/suppliers", params={"cadastro_pendente": "true"}, headers=auth(token_owner))
    suppliers = r.json()["suppliers"]
    assert len(suppliers) == 1
    assert suppliers[0]["cnpj"] == CNPJ_EMITENTE
    assert suppliers[0]["cadastro_pendente"] is True


async def test_filtro_cadastro_pendente_false(client, token_owner):
    await _create_supplier(client, token_owner, nome="Manual Completo", cnpj="11222333000181")
    await _create_pending_supplier_via_nf(client, token_owner)

    r = await client.get("/catalog/suppliers", params={"cadastro_pendente": "false"}, headers=auth(token_owner))
    suppliers = r.json()["suppliers"]
    assert len(suppliers) == 1
    assert suppliers[0]["nome"] == "Manual Completo"
    assert suppliers[0]["cadastro_pendente"] is False


async def test_filtros_combinados_nome_e_cadastro_pendente(client, token_owner):
    await _create_supplier(client, token_owner, nome="Distribuidora Alfa", cnpj="11222333000181")
    await _create_pending_supplier_via_nf(client, token_owner)  # nome do emitente da NF, não "Distribuidora"

    r = await client.get(
        "/catalog/suppliers",
        params={"nome": "Distribuidora", "cadastro_pendente": "false"},
        headers=auth(token_owner),
    )
    nomes = [s["nome"] for s in r.json()["suppliers"]]
    assert nomes == ["Distribuidora Alfa"]


async def test_filtro_sem_correspondencia_retorna_lista_vazia(client, token_owner):
    await _create_supplier(client, token_owner, nome="Distribuidora Alfa", cnpj="11222333000181")

    r = await client.get("/catalog/suppliers", params={"nome": "Inexistente"}, headers=auth(token_owner))
    assert r.json()["suppliers"] == []


async def test_isolamento_multitenant_com_filtro(client, token_owner, token_company_b):
    await _create_supplier(client, token_owner, nome="Fornecedor Compartilhado", cnpj="11222333000181")
    await _create_supplier(client, token_company_b, nome="Fornecedor Compartilhado", cnpj="11444777000161")

    r = await client.get("/catalog/suppliers", params={"nome": "Compartilhado"}, headers=auth(token_owner))
    suppliers = r.json()["suppliers"]
    assert len(suppliers) == 1
    assert suppliers[0]["cnpj"] == "11222333000181"
