"""ORD-202: cadastro profissional de fornecedor. Cobre os cenários Gherkin
do QA Explorer (docs/stories/ORD-202): dados cadastrais/endereço/contato/
responsável legal, consulta de CNPJ (endpoint próprio + auth), validação
condicional do responsável legal, isolamento multi-tenant nas 2 tabelas
novas, payload de listagem crescendo sem mudar a tela. Regressão do CRUD
mínimo de ORD-182 fica em test_ord182_cadastro_fornecedor.py, já atualizado
pra incluir `contato` (agora obrigatório) — não duplicada aqui.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx
import pytest
import respx
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


CNPJ_A = "11222333000181"
CNPJ_B = "11444777000161"

CONTATO = {"nome": "Maria Compras", "telefone": "11999998888", "email": "maria@fornecedor.com"}
RESPONSAVEL_COMPLETO = {"nome": "João Sócio", "cpf": "12345678909", "telefone": "11988887777", "email": "joao@fornecedor.com"}


def _payload(**overrides):
    body = {
        "nome": "Distribuidora ABC", "cnpj": CNPJ_A,
        "razao_social": "Distribuidora ABC Ltda", "nome_fantasia": "ABC Distribuidora",
        "inscricao_estadual": "123456789", "inscricao_municipal": None,
        "cadastral_status": "ATIVA",
        "zip_code": "01310100", "street": "Av. Paulista", "address_number": "1000",
        "complement": None, "neighborhood": "Bela Vista", "city": "São Paulo", "state": "SP",
        "contato": CONTATO, "responsavel_legal": None,
    }
    body.update(overrides)
    return body


# ── Happy path (Critério 1) ──────────────────────────────────────────────────

async def test_criacao_com_todos_os_campos_preenchidos(client, token_owner):
    r = await client.post(
        "/catalog/suppliers", json=_payload(responsavel_legal=RESPONSAVEL_COMPLETO), headers=auth(token_owner),
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["razao_social"] == "Distribuidora ABC Ltda"
    assert data["city"] == "São Paulo"
    assert data["contato"] == CONTATO
    assert data["responsavel_legal"]["nome"] == "João Sócio"
    assert data["responsavel_legal"]["cpf"] == "12345678909"


async def test_criacao_so_com_campos_obrigatorios(client, token_owner):
    r = await client.post(
        "/catalog/suppliers",
        json={"nome": "Fornecedor Mínimo", "cnpj": CNPJ_A, "contato": CONTATO},
        headers=auth(token_owner),
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["razao_social"] is None
    assert data["responsavel_legal"] is None


# ── Endpoint de consulta de CNPJ (Critério 2) ────────────────────────────────

async def test_cnpj_lookup_endpoint_retorna_dados_da_receita(client, token_owner):
    with respx.mock:
        respx.get(f"https://brasilapi.com.br/api/cnpj/v1/{CNPJ_A}").mock(
            return_value=httpx.Response(200, json={
                "descricao_situacao_cadastral": "ATIVA",
                "razao_social": "Empresa Teste LTDA", "nome_fantasia": "Empresa Teste",
                "cep": "01310100", "logradouro": "Av. Paulista", "numero": "1000",
                "complemento": "", "bairro": "Bela Vista", "municipio": "São Paulo", "uf": "SP",
            })
        )
        r = await client.get(f"/catalog/suppliers/cnpj-lookup/{CNPJ_A}", headers=auth(token_owner))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["found"] is True
    assert data["cadastral_status"] == "ATIVA"
    assert data["legal_name"] == "Empresa Teste LTDA"


# ── Degradação graciosa (Critério 3) ─────────────────────────────────────────

async def test_cnpj_lookup_indisponivel_nao_bloqueia(client, token_owner):
    with respx.mock:
        respx.get(f"https://brasilapi.com.br/api/cnpj/v1/{CNPJ_A}").mock(side_effect=httpx.ConnectError("fail"))
        respx.get(f"https://www.receitaws.com.br/v1/cnpj/{CNPJ_A}").mock(side_effect=httpx.ConnectError("fail"))
        respx.get(f"https://publica.cnpj.ws/cnpj/{CNPJ_A}").mock(side_effect=httpx.ConnectError("fail"))
        r = await client.get(f"/catalog/suppliers/cnpj-lookup/{CNPJ_A}", headers=auth(token_owner))
    assert r.status_code == 200, r.text
    assert r.json()["found"] is False
    assert r.json()["reason"] == "lookup_unavailable"

    # cadastro segue liberado mesmo assim
    r2 = await client.post("/catalog/suppliers", json=_payload(), headers=auth(token_owner))
    assert r2.status_code == 201, r2.text


async def test_cnpj_nao_encontrado_nao_bloqueia(client, token_owner):
    with respx.mock:
        respx.get(f"https://brasilapi.com.br/api/cnpj/v1/{CNPJ_A}").mock(return_value=httpx.Response(404))
        respx.get(f"https://www.receitaws.com.br/v1/cnpj/{CNPJ_A}").mock(return_value=httpx.Response(404))
        respx.get(f"https://publica.cnpj.ws/cnpj/{CNPJ_A}").mock(return_value=httpx.Response(404))
        r = await client.get(f"/catalog/suppliers/cnpj-lookup/{CNPJ_A}", headers=auth(token_owner))
    assert r.status_code == 200, r.text
    assert r.json()["found"] is False
    assert r.json()["reason"] == "cnpj_not_found"

    r2 = await client.post("/catalog/suppliers", json=_payload(), headers=auth(token_owner))
    assert r2.status_code == 201, r2.text


# ── CNPJ inativo — cadastro nunca bloqueado no backend (Critério 4) ─────────

async def test_cadastro_aceita_cnpj_com_situacao_cadastral_nao_ativa(client, token_owner):
    r = await client.post(
        "/catalog/suppliers", json=_payload(cadastral_status="BAIXADA"), headers=auth(token_owner),
    )
    assert r.status_code == 201, r.text
    assert r.json()["cadastral_status"] == "BAIXADA"


# ── Exclusão em cascata dos sub-recursos ────────────────────────────────────

async def test_exclusao_remove_contato_e_responsavel_legal(client, token_owner):
    import main as svc
    from sqlalchemy import select
    r = await client.post(
        "/catalog/suppliers", json=_payload(responsavel_legal=RESPONSAVEL_COMPLETO), headers=auth(token_owner),
    )
    supplier_id = r.json()["id"]

    r_del = await client.delete(f"/catalog/suppliers/{supplier_id}", headers=auth(token_owner))
    assert r_del.status_code == 204

    async with svc.AsyncSessionLocal() as db:
        contact = (await db.execute(select(svc.SupplierContact).filter_by(supplier_id=supplier_id))).scalars().first()
        rep = (await db.execute(select(svc.SupplierLegalRepresentative).filter_by(supplier_id=supplier_id))).scalars().first()
    assert contact is None
    assert rep is None


# ── Isolamento multi-tenant nas tabelas novas (Critério 6) ──────────────────

async def test_contato_de_fornecedor_de_outra_empresa_nao_acessivel(client, token_owner, token_company_b):
    r = await client.post("/catalog/suppliers", json=_payload(cnpj=CNPJ_B), headers=auth(token_company_b))
    supplier_id = r.json()["id"]

    r_get = await client.get(f"/catalog/suppliers/{supplier_id}", headers=auth(token_owner))
    assert r_get.status_code == 404


async def test_responsavel_legal_de_fornecedor_de_outra_empresa_nao_acessivel(client, token_owner, token_company_b):
    r = await client.post(
        "/catalog/suppliers",
        json=_payload(cnpj=CNPJ_B, responsavel_legal=RESPONSAVEL_COMPLETO),
        headers=auth(token_company_b),
    )
    assert r.status_code == 201, r.text

    r_list = await client.get("/catalog/suppliers", headers=auth(token_owner))
    nomes_responsaveis = [
        s["responsavel_legal"]["nome"] for s in r_list.json()["suppliers"] if s["responsavel_legal"]
    ]
    assert "João Sócio" not in nomes_responsaveis


# ── Auth do endpoint de CNPJ lookup (Critério 7) ─────────────────────────────

async def test_cnpj_lookup_sem_token_retorna_401(client):
    r = await client.get(f"/catalog/suppliers/cnpj-lookup/{CNPJ_A}")
    assert r.status_code == 401


async def test_cnpj_lookup_role_sem_permissao_retorna_403(client, token_kiosk):
    r = await client.get(f"/catalog/suppliers/cnpj-lookup/{CNPJ_A}", headers=auth(token_kiosk))
    assert r.status_code == 403


async def test_cnpj_lookup_nao_filtra_por_company_id(client, token_owner, token_company_b):
    with respx.mock:
        respx.get(f"https://brasilapi.com.br/api/cnpj/v1/{CNPJ_A}").mock(
            return_value=httpx.Response(200, json={
                "descricao_situacao_cadastral": "ATIVA", "razao_social": "Empresa X",
                "nome_fantasia": None, "cep": None, "logradouro": None, "numero": None,
                "complemento": None, "bairro": None, "municipio": None, "uf": None,
            })
        )
        r1 = await client.get(f"/catalog/suppliers/cnpj-lookup/{CNPJ_A}", headers=auth(token_owner))
        respx.get(f"https://brasilapi.com.br/api/cnpj/v1/{CNPJ_A}").mock(
            return_value=httpx.Response(200, json={
                "descricao_situacao_cadastral": "ATIVA", "razao_social": "Empresa X",
                "nome_fantasia": None, "cep": None, "logradouro": None, "numero": None,
                "complemento": None, "bairro": None, "municipio": None, "uf": None,
            })
        )
        r2 = await client.get(f"/catalog/suppliers/cnpj-lookup/{CNPJ_A}", headers=auth(token_company_b))
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json() == r2.json()


# ── Listagem — payload cresce, tela não muda (Critério 8) ───────────────────

async def test_payload_de_listagem_inclui_campos_novos(client, token_owner):
    await client.post("/catalog/suppliers", json=_payload(), headers=auth(token_owner))
    r = await client.get("/catalog/suppliers", headers=auth(token_owner))
    assert r.status_code == 200, r.text
    item = r.json()["suppliers"][0]
    assert "zip_code" in item and "cadastral_status" in item and "contato" in item


# ── Validação condicional do responsável legal (achado do repasse de Backend) ─

async def test_responsavel_legal_parcial_e_rejeitado(client, token_owner):
    r = await client.post(
        "/catalog/suppliers",
        json=_payload(responsavel_legal={"nome": "João", "cpf": None, "telefone": None, "email": None}),
        headers=auth(token_owner),
    )
    assert r.status_code == 422, r.text


async def test_responsavel_legal_com_cpf_em_branco_e_aceito(client, token_owner):
    responsavel_sem_cpf = {"nome": "João Sócio", "cpf": None, "telefone": "11988887777", "email": "joao@fornecedor.com"}
    r = await client.post(
        "/catalog/suppliers", json=_payload(responsavel_legal=responsavel_sem_cpf), headers=auth(token_owner),
    )
    assert r.status_code == 201, r.text
    assert r.json()["responsavel_legal"]["cpf"] is None


async def test_editar_fornecedor_limpando_responsavel_legal_remove_o_registro(client, token_owner):
    import main as svc
    from sqlalchemy import select

    r = await client.post(
        "/catalog/suppliers", json=_payload(responsavel_legal=RESPONSAVEL_COMPLETO), headers=auth(token_owner),
    )
    supplier_id = r.json()["id"]

    r_edit = await client.put(
        f"/catalog/suppliers/{supplier_id}",
        json=_payload(responsavel_legal=None),
        headers=auth(token_owner),
    )
    assert r_edit.status_code == 200, r_edit.text
    assert r_edit.json()["responsavel_legal"] is None

    async with svc.AsyncSessionLocal() as db:
        rep = (await db.execute(select(svc.SupplierLegalRepresentative).filter_by(supplier_id=supplier_id))).scalars().first()
    assert rep is None
