"""ORD-204: fluxo de pendência de cadastro quando fornecedor é criado
automaticamente na importação de NF. Cobre os cenários Gherkin do QA
Explorer (docs/stories/ORD-204): cadastro_pendente=True só no auto-create,
False em criação manual e ao salvar via PUT, nunca alterado no
reaproveitamento, import nunca bloqueado, isolamento multi-tenant.
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
CNPJ_EMITENTE = "59594315000157"  # emit CNPJ real de nfe_pequena.xml/nfe_devolucao.xml


def _upload_file(name: str) -> dict:
    return {"file": (name, (FIXTURES / name).read_bytes(), "application/xml")}


async def _confirm(client, token, fname):
    return await client.post("/catalog/supplier-invoices", files=_upload_file(fname), headers=auth(token))


CONTATO = {"nome": "Contato", "telefone": "11999998888", "email": "contato@fornecedor.com"}


# ── Auto-criado nasce pendente (Critério 1) ──────────────────────────────────

async def test_fornecedor_criado_automaticamente_nasce_pendente(client, token_owner):
    r = await _confirm(client, token_owner, "nfe_pequena.xml")
    assert r.status_code == 201, r.text

    r_list = await client.get("/catalog/suppliers", headers=auth(token_owner))
    supplier = next(s for s in r_list.json()["suppliers"] if s["cnpj"] == CNPJ_EMITENTE)
    assert supplier["cadastro_pendente"] is True


# ── Manual nunca nasce pendente (Critério 2) ─────────────────────────────────

async def test_fornecedor_criado_manualmente_nunca_nasce_pendente(client, token_owner):
    r = await client.post(
        "/catalog/suppliers",
        json={"nome": "Fornecedor Manual", "cnpj": CNPJ_EMITENTE, "contato": CONTATO},
        headers=auth(token_owner),
    )
    assert r.status_code == 201, r.text
    assert r.json()["cadastro_pendente"] is False


# ── Reaproveitado nunca tem o flag alterado (Critério 3) ─────────────────────

async def test_fornecedor_existente_reaproveitado_nao_e_afetado(client, token_owner):
    r_create = await client.post(
        "/catalog/suppliers",
        json={"nome": "Fornecedor Existente", "cnpj": CNPJ_EMITENTE, "contato": CONTATO},
        headers=auth(token_owner),
    )
    assert r_create.status_code == 201, r_create.text

    r = await _confirm(client, token_owner, "nfe_pequena.xml")
    assert r.status_code == 201, r.text

    r_list = await client.get("/catalog/suppliers", headers=auth(token_owner))
    suppliers = r_list.json()["suppliers"]
    assert len(suppliers) == 1  # nenhum fornecedor novo criado
    assert suppliers[0]["cadastro_pendente"] is False


async def test_segunda_nota_pro_mesmo_fornecedor_pendente_nao_altera_o_flag(client, token_owner):
    r1 = await _confirm(client, token_owner, "nfe_pequena.xml")
    assert r1.status_code == 201, r1.text

    # Fixtures deste diretório compartilham a mesma chave de acesso (são
    # variações da mesma nota-base pra testar casos negativos específicos,
    # não notas independentes) — segunda nota "de verdade" pro mesmo CNPJ
    # emitente é construída trocando um dígito da chave e recalculando o
    # dígito verificador mod-11 (mesmo algoritmo de _valida_chave_acesso).
    old_chave = "35200159594315000157550010000000012062777161"
    new_chave = "35200159594315000157550010000090012062777162"
    raw = (FIXTURES / "nfe_pequena.xml").read_bytes().replace(
        old_chave.encode(), new_chave.encode(),
    )
    r2 = await client.post(
        "/catalog/supplier-invoices",
        files={"file": ("nfe_pequena_segunda.xml", raw, "application/xml")},
        headers=auth(token_owner),
    )
    assert r2.status_code == 201, r2.text

    r_list = await client.get("/catalog/suppliers", headers=auth(token_owner))
    suppliers = [s for s in r_list.json()["suppliers"] if s["cnpj"] == CNPJ_EMITENTE]
    assert len(suppliers) == 1  # nenhum fornecedor novo criado na segunda nota
    assert suppliers[0]["cadastro_pendente"] is True


# ── Import nunca bloqueado (Critério 4) ───────────────────────────────────────

async def test_importacao_com_fornecedor_novo_continua_funcionando(client, token_owner):
    r = await _confirm(client, token_owner, "nfe_pequena.xml")
    assert r.status_code == 201, r.text
    assert "id" in r.json()


# ── Listagem — indicador visual (Critério 5, checado via payload que alimenta a Tag) ──

async def test_listagem_sinaliza_fornecedor_pendente(client, token_owner):
    await _confirm(client, token_owner, "nfe_pequena.xml")
    r_list = await client.get("/catalog/suppliers", headers=auth(token_owner))
    supplier = next(s for s in r_list.json()["suppliers"] if s["cnpj"] == CNPJ_EMITENTE)
    assert supplier["cadastro_pendente"] is True


async def test_listagem_nao_sinaliza_fornecedor_completo(client, token_owner):
    r = await client.post(
        "/catalog/suppliers",
        json={"nome": "Fornecedor Completo", "cnpj": CNPJ_EMITENTE, "contato": CONTATO},
        headers=auth(token_owner),
    )
    assert r.status_code == 201, r.text
    r_list = await client.get("/catalog/suppliers", headers=auth(token_owner))
    supplier = next(s for s in r_list.json()["suppliers"] if s["cnpj"] == CNPJ_EMITENTE)
    assert supplier["cadastro_pendente"] is False


# ── Resolver = salvar, sem exigir completude total (Critério 6) ─────────────

async def test_salvar_com_contato_preenchido_zera_o_flag_mesmo_sem_endereco(client, token_owner):
    r_create = await _confirm(client, token_owner, "nfe_pequena.xml")
    assert r_create.status_code == 201, r_create.text
    r_list = await client.get("/catalog/suppliers", headers=auth(token_owner))
    supplier_id = next(s for s in r_list.json()["suppliers"] if s["cnpj"] == CNPJ_EMITENTE)["id"]

    r_edit = await client.put(
        f"/catalog/suppliers/{supplier_id}",
        json={"nome": "Fornecedor Revisado", "cnpj": CNPJ_EMITENTE, "contato": CONTATO},
        headers=auth(token_owner),
    )
    assert r_edit.status_code == 200, r_edit.text
    assert r_edit.json()["cadastro_pendente"] is False
    assert r_edit.json()["street"] is None  # endereço continua vazio, não impede zerar o flag


# ── Isolamento multi-tenant (Critério 7) ─────────────────────────────────────

async def test_listagem_de_uma_empresa_nao_mistura_flag_de_outra(client, token_owner, token_company_b):
    await client.post(
        "/catalog/suppliers",
        json={"nome": "Fornecedor Empresa B", "cnpj": "11444777000161", "contato": CONTATO},
        headers=auth(token_company_b),
    )
    r_list = await client.get("/catalog/suppliers", headers=auth(token_owner))
    assert all(s["cnpj"] != "11444777000161" for s in r_list.json()["suppliers"])
