import os
import sys
import uuid
from decimal import Decimal

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


async def _seed_pending_item(
    company_id=1, supplier_cnpj="12345678000195", supplier_nome="Fornecedor Teste",
    c_prod=None, c_ean=None, x_prod="Item Teste", unidade="UN",
    quantidade=Decimal(10), valor_unitario=Decimal("5.00"), valor_total=Decimal("50.00"),
):
    """Mesmo helper de test_ord196/test_ord197 — cria Supplier + SupplierInvoice
    + SupplierInvoiceItem direto via ORM, sem precisar de XML de verdade."""
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        supplier = (await db.execute(
            svc.select(svc.Supplier).filter_by(company_id=company_id, cnpj=supplier_cnpj)
        )).scalars().first()
        if not supplier:
            supplier = svc.Supplier(company_id=company_id, nome=supplier_nome, cnpj=supplier_cnpj)
            db.add(supplier)
            await db.flush()
        invoice = svc.SupplierInvoice(
            company_id=company_id, supplier_id=supplier.id,
            chave_acesso=uuid.uuid4().hex[:44].ljust(44, "0"),
            numero="1", serie="1", data_emissao=None, valor_total=valor_total, xml_raw=b"<x/>",
            imported_by=1,
        )
        db.add(invoice)
        await db.flush()
        item = svc.SupplierInvoiceItem(
            supplier_invoice_id=invoice.id, n_item=1, c_prod=c_prod, c_ean=c_ean, x_prod=x_prod,
            unidade=unidade, quantidade=quantidade, valor_unitario=valor_unitario, valor_total=valor_total,
        )
        db.add(item)
        await db.commit()
        return item.id


async def test_bulk_ignore_ignora_multiplos_itens(client, token_owner):
    id1 = await _seed_pending_item(x_prod="Item A")
    id2 = await _seed_pending_item(x_prod="Item B")
    id3 = await _seed_pending_item(x_prod="Item C")

    r = await client.post(
        "/catalog/supplier-invoices/items/bulk-ignore",
        json={"item_ids": [id1, id2, id3]},
        headers=auth(token_owner),
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"ignorados": 3, "ja_resolvidos": 0}

    r_list = await client.get("/catalog/supplier-invoices/pending-items", headers=auth(token_owner))
    ids_pendentes = {i["id"] for i in r_list.json()["items"]}
    assert {id1, id2, id3}.isdisjoint(ids_pendentes)


async def test_bulk_ignore_pula_item_ja_resolvido_sem_quebrar_o_lote(client, token_owner):
    id1 = await _seed_pending_item(x_prod="Item A")
    id2 = await _seed_pending_item(x_prod="Item B")

    r_ignore_um = await client.post(
        f"/catalog/supplier-invoices/items/{id1}/ignore", headers=auth(token_owner),
    )
    assert r_ignore_um.status_code == 200, r_ignore_um.text

    r = await client.post(
        "/catalog/supplier-invoices/items/bulk-ignore",
        json={"item_ids": [id1, id2]},
        headers=auth(token_owner),
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"ignorados": 1, "ja_resolvidos": 1}


async def test_bulk_ignore_item_de_outra_empresa_retorna_404_sem_aplicar_nada(client, token_owner, token_company_b):
    id_empresa_a = await _seed_pending_item(company_id=1, x_prod="Item empresa A")
    id_empresa_b = await _seed_pending_item(company_id=2, supplier_cnpj="98765432000199", x_prod="Item empresa B")

    r = await client.post(
        "/catalog/supplier-invoices/items/bulk-ignore",
        json={"item_ids": [id_empresa_a, id_empresa_b]},
        headers=auth(token_owner),
    )
    assert r.status_code == 404, r.text

    # nada foi commitado — fail-closed, nem o item válido da própria empresa foi ignorado
    r_list = await client.get("/catalog/supplier-invoices/pending-items", headers=auth(token_owner))
    ids_pendentes = {i["id"] for i in r_list.json()["items"]}
    assert id_empresa_a in ids_pendentes
