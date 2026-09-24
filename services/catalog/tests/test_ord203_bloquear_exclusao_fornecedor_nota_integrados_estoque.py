"""ORD-203: bloquear exclusão de fornecedor e nota de compra quando já
integrados com estoque. Cobre os cenários Gherkin do QA Explorer
(docs/stories/ORD-203): _has_stock_integrated_items, 409 nos dois
endpoints, cascata quando permitido, isolamento multi-tenant. Fornecedor/
nota/item são criados direto via ORM (sem XML real), mesmo padrão já
usado em test_ord197_correlacao_unidade_nota_fiscal.py.
"""
import os
import sys
import uuid

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


async def _create_supplier(company_id: int, cnpj: str, nome="Fornecedor Teste") -> int:
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        s = svc.Supplier(company_id=company_id, nome=nome, cnpj=cnpj)
        db.add(s)
        await db.commit()
        await db.refresh(s)
        return s.id


async def _create_invoice(supplier_id: int, company_id: int) -> int:
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        invoice = svc.SupplierInvoice(
            company_id=company_id, supplier_id=supplier_id,
            chave_acesso=uuid.uuid4().hex[:44].ljust(44, "0"),
            numero="1", serie="1", data_emissao=None, valor_total=100, xml_raw=b"<x/>",
            imported_by=1,
        )
        db.add(invoice)
        await db.commit()
        await db.refresh(invoice)
        return invoice.id


async def _add_item(invoice_id: int, *, n_item=1, link_source=None, pendente_motivo=None) -> int:
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        item = svc.SupplierInvoiceItem(
            supplier_invoice_id=invoice_id, n_item=n_item, c_prod=f"P{n_item}", c_ean=None,
            x_prod="Produto Teste", unidade="un", quantidade=1, valor_unitario=10, valor_total=10,
            link_source=link_source, pendente_motivo=pendente_motivo,
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)
        return item.id


CNPJ_A = "11222333000181"
CNPJ_B = "11444777000161"


# ── Regressão — comportamento hoje correto continua correto ─────────────────

async def test_fornecedor_sem_nenhuma_nota_continua_excluivel(client, token_owner):
    supplier_id = await _create_supplier(1, CNPJ_A)
    r = await client.delete(f"/catalog/suppliers/{supplier_id}", headers=auth(token_owner))
    assert r.status_code == 204


# ── Bloqueio — fornecedor (Critérios 1, 5) ───────────────────────────────────

async def test_fornecedor_com_nota_vinculada_por_ean_nao_pode_ser_excluido(client, token_owner):
    supplier_id = await _create_supplier(1, CNPJ_A)
    invoice_id = await _create_invoice(supplier_id, 1)
    await _add_item(invoice_id, link_source="ean")

    r = await client.delete(f"/catalog/suppliers/{supplier_id}", headers=auth(token_owner))
    assert r.status_code == 409, r.text

    r_get = await client.get(f"/catalog/suppliers/{supplier_id}", headers=auth(token_owner))
    assert r_get.status_code == 200  # fornecedor continua existindo


async def test_fornecedor_com_nota_vinculada_manualmente_nao_pode_ser_excluido(client, token_owner):
    supplier_id = await _create_supplier(1, CNPJ_A)
    invoice_id = await _create_invoice(supplier_id, 1)
    await _add_item(invoice_id, link_source="manual")

    r = await client.delete(f"/catalog/suppliers/{supplier_id}", headers=auth(token_owner))
    assert r.status_code == 409, r.text


async def test_fornecedor_com_duas_notas_so_uma_integrada_nao_pode_ser_excluido(client, token_owner):
    supplier_id = await _create_supplier(1, CNPJ_A)
    invoice_1 = await _create_invoice(supplier_id, 1)
    await _add_item(invoice_1, pendente_motivo="sem_estoque_iniciado")
    invoice_2 = await _create_invoice(supplier_id, 1)
    await _add_item(invoice_2, link_source="supplier_code")

    r = await client.delete(f"/catalog/suppliers/{supplier_id}", headers=auth(token_owner))
    assert r.status_code == 409, r.text


# ── Falsos positivos — não podem bloquear indevidamente (Critério 3) ────────

async def test_fornecedor_com_nota_todos_itens_pendentes_e_excluivel(client, token_owner):
    supplier_id = await _create_supplier(1, CNPJ_A)
    invoice_id = await _create_invoice(supplier_id, 1)
    await _add_item(invoice_id, pendente_motivo="sem_estoque_iniciado")

    r = await client.delete(f"/catalog/suppliers/{supplier_id}", headers=auth(token_owner))
    assert r.status_code == 204, r.text


async def test_fornecedor_com_item_ignorado_e_excluivel(client, token_owner):
    supplier_id = await _create_supplier(1, CNPJ_A)
    invoice_id = await _create_invoice(supplier_id, 1)
    await _add_item(invoice_id, link_source="ignorado")

    r = await client.delete(f"/catalog/suppliers/{supplier_id}", headers=auth(token_owner))
    assert r.status_code == 204, r.text


# ── Cascata — confirma o que acontece com a nota, não só o status ───────────

async def test_excluir_fornecedor_com_nota_sem_integracao_apaga_a_nota_em_cascata(client, token_owner):
    import main as svc
    from sqlalchemy import select

    supplier_id = await _create_supplier(1, CNPJ_A)
    invoice_id = await _create_invoice(supplier_id, 1)
    item_id = await _add_item(invoice_id, pendente_motivo="sem_estoque_iniciado")

    r = await client.delete(f"/catalog/suppliers/{supplier_id}", headers=auth(token_owner))
    assert r.status_code == 204, r.text

    async with svc.AsyncSessionLocal() as db:
        invoice = (await db.execute(select(svc.SupplierInvoice).filter_by(id=invoice_id))).scalars().first()
        item = (await db.execute(select(svc.SupplierInvoiceItem).filter_by(id=item_id))).scalars().first()
    assert invoice is None
    assert item is None


async def test_ordem_da_cascata_e_robusta_com_duas_notas(client, token_owner):
    supplier_id = await _create_supplier(1, CNPJ_A)
    invoice_1 = await _create_invoice(supplier_id, 1)
    await _add_item(invoice_1, n_item=1, pendente_motivo="sem_estoque_iniciado")
    await _add_item(invoice_1, n_item=2, link_source="ignorado")
    invoice_2 = await _create_invoice(supplier_id, 1)
    await _add_item(invoice_2, n_item=1, pendente_motivo="guarda_chuva")

    r = await client.delete(f"/catalog/suppliers/{supplier_id}", headers=auth(token_owner))
    assert r.status_code == 204, r.text  # sem IntegrityError de FK


# ── Nota de compra — mesma regra no outro ponto de entrada (Critério 2) ─────

async def test_excluir_nota_diretamente_com_item_integrado_e_bloqueado(client, token_owner):
    supplier_id = await _create_supplier(1, CNPJ_A)
    invoice_id = await _create_invoice(supplier_id, 1)
    await _add_item(invoice_id, link_source="ean")

    r = await client.delete(f"/catalog/supplier-invoices/{invoice_id}", headers=auth(token_owner))
    assert r.status_code == 409, r.text


async def test_excluir_nota_sem_item_integrado_continua_permitido(client, token_owner):
    supplier_id = await _create_supplier(1, CNPJ_A)
    invoice_id = await _create_invoice(supplier_id, 1)
    await _add_item(invoice_id, link_source="ignorado")

    r = await client.delete(f"/catalog/supplier-invoices/{invoice_id}", headers=auth(token_owner))
    assert r.status_code == 204, r.text


# ── Mensagem de erro (Critério 4) ────────────────────────────────────────────

async def test_mensagem_de_erro_fala_da_consequencia_nao_do_mecanismo(client, token_owner):
    supplier_id = await _create_supplier(1, CNPJ_A)
    invoice_id = await _create_invoice(supplier_id, 1)
    await _add_item(invoice_id, link_source="ean")

    r = await client.delete(f"/catalog/suppliers/{supplier_id}", headers=auth(token_owner))
    detail = r.json()["detail"]
    assert "estoque" in detail.lower()
    assert "histórico" in detail.lower()
    for termo_tecnico in ("link_source", "supplier_invoice_items", "pendente_motivo"):
        assert termo_tecnico not in detail


# ── Isolamento multi-tenant ───────────────────────────────────────────────────

async def test_checagem_de_integracao_nao_vaza_dado_de_outra_empresa(client, token_owner, token_company_b):
    supplier_b = await _create_supplier(2, CNPJ_B, nome="Fornecedor Empresa B")
    invoice_b = await _create_invoice(supplier_b, 2)
    await _add_item(invoice_b, link_source="ean")

    # admin da empresa 1 nunca vê nem é afetado pelo fornecedor da empresa 2
    r = await client.delete(f"/catalog/suppliers/{supplier_b}", headers=auth(token_owner))
    assert r.status_code == 404

    # dono de verdade (empresa 2) continua bloqueado corretamente
    r_owner = await client.delete(f"/catalog/suppliers/{supplier_b}", headers=auth(token_company_b))
    assert r_owner.status_code == 409
