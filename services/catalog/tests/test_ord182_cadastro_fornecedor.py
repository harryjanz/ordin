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


def auth(token):
    return {"Authorization": f"Bearer {token}"}


CNPJ_VALIDO = "11222333000181"  # mesmo CNPJ real já usado nos testes de company-service
CNPJ_ALFANUMERICO_VALIDO = "12ABC34501DE35"  # mesmo vetor oficial usado em test_ord064_cnpj_alfanumerico.py


async def _create_supplier(client, token, *, nome="Fornecedor", cnpj=CNPJ_VALIDO):
    return await client.post(
        "/catalog/suppliers", json={"nome": nome, "cnpj": cnpj}, headers=auth(token),
    )


# ── Cadastro ──────────────────────────────────────────────────────────────

async def test_cadastro_com_cnpj_numerico_valido(client, token_owner):
    r = await _create_supplier(client, token_owner)
    assert r.status_code == 201, r.text
    assert r.json()["cnpj"] == CNPJ_VALIDO


async def test_cadastro_com_cnpj_alfanumerico_valido(client, token_owner):
    r = await _create_supplier(client, token_owner, cnpj=CNPJ_ALFANUMERICO_VALIDO)
    assert r.status_code == 201, r.text
    assert r.json()["cnpj"] == CNPJ_ALFANUMERICO_VALIDO


async def test_cnpj_alfanumerico_minusculo_normalizado(client, token_owner):
    r = await _create_supplier(client, token_owner, cnpj=CNPJ_ALFANUMERICO_VALIDO.lower())
    assert r.status_code == 201, r.text
    assert r.json()["cnpj"] == CNPJ_ALFANUMERICO_VALIDO


async def test_cnpj_com_letra_no_digito_verificador_rejeitado(client, token_owner):
    r = await _create_supplier(client, token_owner, cnpj="12ABC3450000AB")
    assert r.status_code == 400, r.text


async def test_cadastro_sem_cnpj_rejeitado(client, token_owner):
    r = await client.post("/catalog/suppliers", json={"nome": "Fornecedor"}, headers=auth(token_owner))
    assert r.status_code == 422


async def test_cnpj_com_checksum_invalido_rejeitado(client, token_owner):
    r = await _create_supplier(client, token_owner, cnpj="11222333000199")
    assert r.status_code == 400, r.text
    assert "CNPJ inválido" in r.text


async def test_cnpj_duplicado_na_mesma_empresa_rejeitado(client, token_owner):
    r1 = await _create_supplier(client, token_owner, nome="Fornecedor A")
    assert r1.status_code == 201, r1.text
    r2 = await _create_supplier(client, token_owner, nome="Fornecedor B")
    assert r2.status_code == 400, r2.text


async def test_mesmo_cnpj_em_empresas_diferentes_nao_conflita(client, token_owner, token_company_b):
    r1 = await _create_supplier(client, token_owner)
    r2 = await _create_supplier(client, token_company_b)
    assert r1.status_code == 201, r1.text
    assert r2.status_code == 201, r2.text


async def test_nome_vazio_rejeitado(client, token_owner):
    r = await _create_supplier(client, token_owner, nome="   ")
    assert r.status_code == 422


# ── Isolamento multi-tenant ───────────────────────────────────────────────

async def test_isolamento_na_listagem(client, token_owner, token_company_b):
    await _create_supplier(client, token_owner, nome="Fornecedor Empresa 1")
    await _create_supplier(client, token_company_b, nome="Fornecedor Empresa 2", cnpj="11444777000161")

    r = await client.get("/catalog/suppliers", headers=auth(token_owner))
    nomes = [s["nome"] for s in r.json()["suppliers"]]
    assert nomes == ["Fornecedor Empresa 1"]


async def test_isolamento_na_edicao_e_exclusao(client, token_owner, token_company_b):
    r = await _create_supplier(client, token_company_b)
    supplier_id = r.json()["id"]

    r_edit = await client.put(
        f"/catalog/suppliers/{supplier_id}", json={"nome": "Hack", "cnpj": CNPJ_VALIDO},
        headers=auth(token_owner),
    )
    assert r_edit.status_code == 404

    r_del = await client.delete(f"/catalog/suppliers/{supplier_id}", headers=auth(token_owner))
    assert r_del.status_code == 404


# GET /catalog/suppliers/{id} — achado em teste manual do usuário (ORD-194):
# a tela de edição sempre chamou esse endpoint pra pré-carregar o form, mas
# ele nunca existiu (só list/create/update/delete) — 405, não 404, porque o
# path casava (PUT/DELETE do mesmo id) mas não o método GET. Nunca tinha
# sido clicado "Editar" ao vivo antes até agora.
async def test_busca_fornecedor_por_id(client, token_owner):
    r = await _create_supplier(client, token_owner, nome="Distribuidora XYZ")
    supplier_id = r.json()["id"]

    r_get = await client.get(f"/catalog/suppliers/{supplier_id}", headers=auth(token_owner))
    assert r_get.status_code == 200, r_get.text
    assert r_get.json()["nome"] == "Distribuidora XYZ"


async def test_busca_fornecedor_inexistente_retorna_404(client, token_owner):
    r = await client.get("/catalog/suppliers/999999", headers=auth(token_owner))
    assert r.status_code == 404


async def test_isolamento_na_busca_por_id(client, token_owner, token_company_b):
    r = await _create_supplier(client, token_company_b)
    supplier_id = r.json()["id"]

    r_get = await client.get(f"/catalog/suppliers/{supplier_id}", headers=auth(token_owner))
    assert r_get.status_code == 404


async def test_role_sem_permissao_de_escrita_bloqueado(client, token_kiosk):
    # kiosk usa o mesmo _WRITE_ROLES check que cashier (nenhum dos dois está
    # em _WRITE_ROLES) — não existe fixture token_cashier no conftest, kiosk
    # exercita o mesmo bloqueio de role de escrita (nem GET passa).
    r = await client.get("/catalog/suppliers", headers=auth(token_kiosk))
    assert r.status_code == 403


# ── Fluxo completo ────────────────────────────────────────────────────────

async def test_lista_edita_e_exclui_fornecedor(client, token_owner):
    r = await _create_supplier(client, token_owner, nome="Distribuidora ABC")
    supplier_id = r.json()["id"]

    r_list = await client.get("/catalog/suppliers", headers=auth(token_owner))
    assert supplier_id in [s["id"] for s in r_list.json()["suppliers"]]

    r_edit = await client.put(
        f"/catalog/suppliers/{supplier_id}",
        json={"nome": "Distribuidora ABC Ltda", "cnpj": CNPJ_VALIDO, "telefone": "11999999999"},
        headers=auth(token_owner),
    )
    assert r_edit.status_code == 200, r_edit.text
    assert r_edit.json()["nome"] == "Distribuidora ABC Ltda"
    assert r_edit.json()["telefone"] == "11999999999"

    r_del = await client.delete(f"/catalog/suppliers/{supplier_id}", headers=auth(token_owner))
    assert r_del.status_code == 204

    r_list2 = await client.get("/catalog/suppliers", headers=auth(token_owner))
    assert supplier_id not in [s["id"] for s in r_list2.json()["suppliers"]]
