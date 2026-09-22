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


def _gtin13(base12: str) -> str:
    digits = [int(c) for c in base12]
    total = sum(d * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(digits)))
    check = (10 - total % 10) % 10
    return base12 + str(check)


async def _create_product(client, token, name="Produto", ean=None, **extra):
    body = {"name": name, "price": 9.9, **extra}
    if ean is not None:
        body["ean"] = ean
    r = await client.post("/catalog/products", json=body, headers=auth(token))
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _create_option(client, token, label="Opção", ean=None, cfop=None, group_name="Grupo", active=True):
    option_body = {"label": label, "active": active}
    if ean is not None:
        option_body["ean"] = ean
    if cfop is not None:
        option_body["cfop"] = cfop
    r = await client.post(
        "/catalog/option-groups",
        json={"name": group_name, "min_selections": 1, "max_selections": 1, "options": [option_body]},
        headers=auth(token),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    return body["id"], body["options"][0]["id"]


async def _make_guarda_chuva(client, token, product_id, option_id):
    r_group = await client.get("/catalog/option-groups", headers=auth(token))
    group_id = next(g["id"] for g in r_group.json()["option_groups"] if any(o["id"] == option_id for o in g["options"]))
    r_link = await client.put(
        f"/catalog/products/{product_id}/option-groups", json={"option_group_ids": [group_id]}, headers=auth(token),
    )
    assert r_link.status_code == 200, r_link.text


async def _entrada_manual(client, token, product_id, quantidade=1, unidade="un"):
    r = await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": quantidade, "unidade": unidade},
        headers=auth(token),
    )
    assert r.status_code == 201, r.text


async def _seed_pending_item(
    company_id=1, supplier_cnpj="12345678000195", supplier_nome="Fornecedor Teste",
    c_prod=None, c_ean=None, x_prod="Item Teste", unidade="UN",
    quantidade=Decimal(10), valor_unitario=Decimal("5.00"), valor_total=Decimal("50.00"),
    pendente_motivo=None,
):
    """Cria Supplier + SupplierInvoice + SupplierInvoiceItem (link_source=None)
    direto via ORM — C2 opera sobre itens já persistidos, não precisa recriar o
    upload de XML inteiro (isso já é responsabilidade testada de B1/C1)."""
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
            pendente_motivo=pendente_motivo,
        )
        db.add(item)
        await db.commit()
        return item.id, invoice.id, supplier.id


# ── Listagem de pendências ──────────────────────────────────────────────────

async def test_listagem_agregada_de_pendencias(client, token_owner):
    await _seed_pending_item(x_prod="Item A")
    await _seed_pending_item(x_prod="Item B")
    r = await client.get("/catalog/supplier-invoices/pending-items", headers=auth(token_owner))
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 2
    nomes = {it["x_prod"] for it in r.json()["items"]}
    assert nomes == {"Item A", "Item B"}


async def test_filtro_por_fornecedor(client, token_owner):
    await _seed_pending_item(supplier_cnpj="11122233000144", supplier_nome="Fornecedor Um")
    await _seed_pending_item(supplier_cnpj="99988877000166", supplier_nome="Fornecedor Dois")
    r = await client.get(
        "/catalog/supplier-invoices/pending-items", params={"fornecedor": "Fornecedor Um"}, headers=auth(token_owner),
    )
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 1
    assert r.json()["items"][0]["fornecedor_nome"] == "Fornecedor Um"


async def test_filtro_por_motivo(client, token_owner):
    await _seed_pending_item(pendente_motivo=None)
    await _seed_pending_item(pendente_motivo="guarda_chuva")
    r = await client.get(
        "/catalog/supplier-invoices/pending-items", params={"motivo": "guarda_chuva"}, headers=auth(token_owner),
    )
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 1
    assert r.json()["items"][0]["pendente_motivo"] == "guarda_chuva"


async def test_lista_vazia_sem_pendentes(client, token_owner):
    r = await client.get("/catalog/supplier-invoices/pending-items", headers=auth(token_owner))
    assert r.status_code == 200, r.text
    assert r.json() == {"items": [], "total": 0}


async def test_isolamento_multitenant_listagem_pendencias(client, token_owner, token_company_b):
    await _seed_pending_item(company_id=1)
    r = await client.get("/catalog/supplier-invoices/pending-items", headers=auth(token_company_b))
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 0


# ── Vincular a existente ────────────────────────────────────────────────────

async def test_busca_produto_por_nome_sku_ean(client, token_owner):
    await _create_product(client, token_owner, name="Coca-Cola Lata 350ml", sku="COCA-350", ean=_gtin13("789490001001"))
    for query in ("Coca-Cola", "COCA-350", _gtin13("789490001001")):
        r = await client.get("/catalog/products", params={"q": query}, headers=auth(token_owner))
        assert r.status_code == 200, r.text
        assert len(r.json()["products"]) == 1, query


async def test_vincular_a_produto_existente_sucesso(client, token_owner):
    pid = await _create_product(client, token_owner, name="Coca-Cola Lata 350ml")
    await _entrada_manual(client, token_owner, pid, quantidade=1, unidade="un")
    item_id, _, _ = await _seed_pending_item(x_prod="COCA-COLA LATA 350ML", quantidade=Decimal(10))

    r = await client.post(
        f"/catalog/supplier-invoices/items/{item_id}/link",
        json={"product_id": pid, "quantidade": 10}, headers=auth(token_owner),
    )
    assert r.status_code == 200, r.text
    assert r.json()["item"]["pendente_motivo"] is None
    assert r.json()["retroactive_candidates"] == []

    state = await client.get(f"/catalog/products/{pid}/stock", headers=auth(token_owner))
    assert state.json()["quantidade_atual"] == 11  # 1 manual + 10 da resolução


async def test_vincular_a_produto_de_outra_empresa_isolamento(client, token_owner, token_company_b):
    pid_b = await _create_product(client, token_company_b, name="Produto da empresa B")
    item_id, _, _ = await _seed_pending_item(company_id=1)
    r = await client.post(
        f"/catalog/supplier-invoices/items/{item_id}/link",
        json={"product_id": pid_b, "quantidade": 1, "unidade": "un"}, headers=auth(token_owner),
    )
    assert r.status_code in (400, 404), r.text


async def test_vincular_a_uma_opcao_existente(client, token_owner):
    _, option_id = await _create_option(client, token_owner, label="Coca-Cola")
    item_id, _, _ = await _seed_pending_item(x_prod="Coca-Cola avulsa")
    r = await client.post(
        f"/catalog/supplier-invoices/items/{item_id}/link",
        json={"option_id": option_id, "quantidade": 5, "unidade": "un"}, headers=auth(token_owner),
    )
    assert r.status_code == 200, r.text
    assert r.json()["item"]["pendente_motivo"] is None


async def test_vincular_grava_gtin_de_embalagem(client, token_owner):
    import main as svc
    pid = await _create_product(client, token_owner, name="Coca-Cola Lata 350ml")
    await _entrada_manual(client, token_owner, pid, quantidade=1, unidade="un")
    gtin = _gtin13("789490001134")
    item_id, _, _ = await _seed_pending_item(c_ean=gtin, x_prod="FARDO COCA-COLA 12X", quantidade=Decimal(2))

    r = await client.post(
        f"/catalog/supplier-invoices/items/{item_id}/link",
        json={"product_id": pid, "quantidade": 24, "quantidade_por_unidade": 12}, headers=auth(token_owner),
    )
    assert r.status_code == 200, r.text

    async with svc.AsyncSessionLocal() as db:
        alt = (await db.execute(
            svc.select(svc.ProductGtinAlt).filter_by(company_id=1, gtin=gtin)
        )).scalars().first()
        assert alt is not None
        assert alt.product_id == pid
        assert alt.quantidade_por_unidade == Decimal(12)


async def test_vincular_grava_codigo_do_fornecedor(client, token_owner):
    import main as svc
    pid = await _create_product(client, token_owner, name="Coca-Cola Lata 350ml")
    await _entrada_manual(client, token_owner, pid, quantidade=1, unidade="un")
    item_id, _, supplier_id = await _seed_pending_item(c_prod="REF-X-350", x_prod="COCA-COLA LATA 350ML")

    r = await client.post(
        f"/catalog/supplier-invoices/items/{item_id}/link",
        json={"product_id": pid, "quantidade": 10}, headers=auth(token_owner),
    )
    assert r.status_code == 200, r.text

    async with svc.AsyncSessionLocal() as db:
        spc = (await db.execute(
            svc.select(svc.SupplierProductCode).filter_by(company_id=1, supplier_id=supplier_id, c_prod="REF-X-350")
        )).scalars().first()
        assert spc is not None
        assert spc.product_id == pid


# ── Criar produto novo ──────────────────────────────────────────────────────

async def test_criar_produto_novo_sucesso(client, token_owner):
    item_id, _, _ = await _seed_pending_item(x_prod="Item Novo")
    r = await client.post(
        f"/catalog/supplier-invoices/items/{item_id}/create-product",
        json={"name": "Item Novo", "price": 12.5, "quantidade": 10, "unidade": "un"},
        headers=auth(token_owner),
    )
    assert r.status_code == 201, r.text
    assert r.json()["product"]["name"] == "Item Novo"
    assert r.json()["item"]["pendente_motivo"] is None

    state = await client.get(f"/catalog/products/{r.json()['product']['id']}/stock", headers=auth(token_owner))
    assert state.json()["quantidade_atual"] == 10


async def test_criar_produto_novo_sem_categoria_sucesso(client, token_owner):
    item_id, _, _ = await _seed_pending_item()
    r = await client.post(
        f"/catalog/supplier-invoices/items/{item_id}/create-product",
        json={"name": "Sem Categoria", "price": 5.0, "quantidade": 1, "unidade": "un"},
        headers=auth(token_owner),
    )
    assert r.status_code == 201, r.text
    assert r.json()["product"]["category_id"] is None


async def test_criar_produto_novo_sem_preco_erro(client, token_owner):
    item_id, _, _ = await _seed_pending_item()
    r = await client.post(
        f"/catalog/supplier-invoices/items/{item_id}/create-product",
        json={"name": "Sem Preço", "quantidade": 1, "unidade": "un"},
        headers=auth(token_owner),
    )
    assert r.status_code == 422, r.text


# ── Ignorar ──────────────────────────────────────────────────────────────────

async def test_ignorar_item_pendente(client, token_owner):
    item_id, _, _ = await _seed_pending_item()
    r = await client.post(f"/catalog/supplier-invoices/items/{item_id}/ignore", headers=auth(token_owner))
    assert r.status_code == 200, r.text
    assert r.json()["item"]["pendente_motivo"] is None

    listagem = await client.get("/catalog/supplier-invoices/pending-items", headers=auth(token_owner))
    assert listagem.json()["total"] == 0


async def test_item_ignorado_nao_gera_movimentacao(client, token_owner):
    import main as svc
    item_id, _, _ = await _seed_pending_item()
    await client.post(f"/catalog/supplier-invoices/items/{item_id}/ignore", headers=auth(token_owner))
    async with svc.AsyncSessionLocal() as db:
        total = (await db.execute(svc.select(svc.func.count()).select_from(svc.StockMovement))).scalar_one()
        assert total == 0


async def test_ignorar_item_de_outra_empresa_erro(client, token_owner, token_company_b):
    item_id, _, _ = await _seed_pending_item(company_id=1)
    r = await client.post(f"/catalog/supplier-invoices/items/{item_id}/ignore", headers=auth(token_company_b))
    assert r.status_code == 404, r.text


# ── Aplicação retroativa ─────────────────────────────────────────────────────

async def test_candidatos_retroativos_por_gtin_de_embalagem(client, token_owner):
    pid = await _create_product(client, token_owner, name="Coca-Cola Lata 350ml")
    await _entrada_manual(client, token_owner, pid, quantidade=1, unidade="un")
    gtin = _gtin13("789490001134")
    item_id_a, _, _ = await _seed_pending_item(c_ean=gtin, x_prod="Fardo A")
    item_id_b, _, _ = await _seed_pending_item(c_ean=gtin, x_prod="Fardo B")

    r = await client.post(
        f"/catalog/supplier-invoices/items/{item_id_a}/link",
        json={"product_id": pid, "quantidade": 24, "quantidade_por_unidade": 12}, headers=auth(token_owner),
    )
    assert r.status_code == 200, r.text
    candidates = r.json()["retroactive_candidates"]
    assert len(candidates) == 1
    assert candidates[0]["id"] == item_id_b


async def test_candidatos_retroativos_por_fornecedor_codigo(client, token_owner):
    pid = await _create_product(client, token_owner, name="Coca-Cola Lata 350ml")
    await _entrada_manual(client, token_owner, pid, quantidade=1, unidade="un")
    item_id_a, _, _ = await _seed_pending_item(c_prod="COD-01", x_prod="Item A")
    item_id_b, _, _ = await _seed_pending_item(
        c_prod="COD-01", x_prod="Item B", supplier_cnpj="12345678000195",
    )

    r = await client.post(
        f"/catalog/supplier-invoices/items/{item_id_a}/link",
        json={"product_id": pid, "quantidade": 10}, headers=auth(token_owner),
    )
    assert r.status_code == 200, r.text
    candidates = r.json()["retroactive_candidates"]
    assert len(candidates) == 1
    assert candidates[0]["id"] == item_id_b


async def test_nenhum_candidato_retroativo(client, token_owner):
    pid = await _create_product(client, token_owner, name="Produto Único")
    await _entrada_manual(client, token_owner, pid, quantidade=1, unidade="un")
    item_id, _, _ = await _seed_pending_item(c_prod="UNICO-001")
    r = await client.post(
        f"/catalog/supplier-invoices/items/{item_id}/link",
        json={"product_id": pid, "quantidade": 10}, headers=auth(token_owner),
    )
    assert r.status_code == 200, r.text
    assert r.json()["retroactive_candidates"] == []


async def test_aceitar_aplicacao_retroativa(client, token_owner):
    pid = await _create_product(client, token_owner, name="Coca-Cola Lata 350ml")
    await _entrada_manual(client, token_owner, pid, quantidade=0.001, unidade="un")
    gtin = _gtin13("789490001134")
    item_id_a, _, _ = await _seed_pending_item(c_ean=gtin, x_prod="Fardo A", quantidade=Decimal(24))
    item_id_b, _, _ = await _seed_pending_item(c_ean=gtin, x_prod="Fardo B", quantidade=Decimal(36))
    item_id_c, _, _ = await _seed_pending_item(c_ean=gtin, x_prod="Fardo C", quantidade=Decimal(12))

    r = await client.post(
        f"/catalog/supplier-invoices/items/{item_id_a}/link",
        json={"product_id": pid, "quantidade": 24, "quantidade_por_unidade": 12}, headers=auth(token_owner),
    )
    candidate_ids = [c["id"] for c in r.json()["retroactive_candidates"]]
    assert set(candidate_ids) == {item_id_b, item_id_c}

    r2 = await client.post(
        "/catalog/supplier-invoices/items/retroactive/apply",
        json={"source_item_id": item_id_a, "item_ids": candidate_ids, "action": "link"},
        headers=auth(token_owner),
    )
    assert r2.status_code == 200, r2.text
    assert r2.json() == {"aplicados": 2, "falhas": 0}

    listagem = await client.get("/catalog/supplier-invoices/pending-items", headers=auth(token_owner))
    assert listagem.json()["total"] == 0

    # quantidade_por_unidade=12 nesta nota — cada candidato precisa ser
    # multiplicado, não lançado com o quantidade bruto do item (achado ao
    # escrever este teste, ver fix em apply_retroactive): B (36 fardos × 12)
    # + C (12 fardos × 12) = 432 + 144. Mais 0.001 (entrada manual) + 24 (A).
    state = await client.get(f"/catalog/products/{pid}/stock", headers=auth(token_owner))
    assert state.json()["quantidade_atual"] == pytest.approx(600.001)


async def test_recusar_aplicacao_retroativa(client, token_owner):
    pid = await _create_product(client, token_owner, name="Coca-Cola Lata 350ml")
    await _entrada_manual(client, token_owner, pid, quantidade=1, unidade="un")
    gtin = _gtin13("789490001134")
    item_id_a, _, _ = await _seed_pending_item(c_ean=gtin, x_prod="Fardo A")
    item_id_b, _, _ = await _seed_pending_item(c_ean=gtin, x_prod="Fardo B")

    await client.post(
        f"/catalog/supplier-invoices/items/{item_id_a}/link",
        json={"product_id": pid, "quantidade": 24, "quantidade_por_unidade": 12}, headers=auth(token_owner),
    )
    # frontend simplesmente não chama retroactive/apply — item_id_b continua pendente
    listagem = await client.get("/catalog/supplier-invoices/pending-items", headers=auth(token_owner))
    assert listagem.json()["total"] == 1
    assert listagem.json()["items"][0]["id"] == item_id_b


async def test_isolamento_multitenant_candidatos_retroativos(client, token_owner, token_company_b):
    pid = await _create_product(client, token_owner, name="Coca-Cola Lata 350ml")
    await _entrada_manual(client, token_owner, pid, quantidade=1, unidade="un")
    gtin = _gtin13("789490001134")
    item_id_a, _, _ = await _seed_pending_item(company_id=1, c_ean=gtin, x_prod="Fardo empresa A")
    await _seed_pending_item(company_id=2, c_ean=gtin, x_prod="Fardo empresa B (mesmo GTIN)")

    r = await client.post(
        f"/catalog/supplier-invoices/items/{item_id_a}/link",
        json={"product_id": pid, "quantidade": 12, "quantidade_por_unidade": 12}, headers=auth(token_owner),
    )
    assert r.status_code == 200, r.text
    assert r.json()["retroactive_candidates"] == []


async def test_aplicacao_retroativa_com_falha_parcial(client, token_owner):
    pid = await _create_product(client, token_owner, name="Coca-Cola Lata 350ml")
    await _entrada_manual(client, token_owner, pid, quantidade=1, unidade="un")
    gtin = _gtin13("789490001134")
    item_id_a, _, _ = await _seed_pending_item(c_ean=gtin, x_prod="Fardo A")
    item_id_b, _, _ = await _seed_pending_item(c_ean=gtin, x_prod="Fardo B")
    item_id_falho, _, _ = await _seed_pending_item(c_ean=gtin, x_prod="Fardo já resolvido")
    # simula corrida: este candidato já foi resolvido por outra requisição antes do apply chegar
    await client.post(
        f"/catalog/supplier-invoices/items/{item_id_falho}/ignore", headers=auth(token_owner),
    )

    await client.post(
        f"/catalog/supplier-invoices/items/{item_id_a}/link",
        json={"product_id": pid, "quantidade": 12, "quantidade_por_unidade": 12}, headers=auth(token_owner),
    )
    r2 = await client.post(
        "/catalog/supplier-invoices/items/retroactive/apply",
        json={"source_item_id": item_id_a, "item_ids": [item_id_b, item_id_falho], "action": "link"},
        headers=auth(token_owner),
    )
    assert r2.status_code == 200, r2.text
    # item_id_falho já não estava mais pendente (ignorado antes) — pulado sem erro, não conta como falha
    assert r2.json()["aplicados"] == 1


# ── Casos herdados de C1 ─────────────────────────────────────────────────────

async def test_vincular_item_guarda_chuva_a_opcao_sucesso(client, token_owner):
    pid = await _create_product(client, token_owner, name="Refrigerantes")
    _, option_id = await _create_option(client, token_owner, label="Coca-Cola", ean="7891991010924")
    await _make_guarda_chuva(client, token_owner, pid, option_id)
    item_id, _, _ = await _seed_pending_item(pendente_motivo="guarda_chuva")

    r = await client.post(
        f"/catalog/supplier-invoices/items/{item_id}/link",
        json={"option_id": option_id, "quantidade": 5, "unidade": "un"}, headers=auth(token_owner),
    )
    assert r.status_code == 200, r.text


async def test_vincular_item_guarda_chuva_ao_produto_erro(client, token_owner):
    pid = await _create_product(client, token_owner, name="Refrigerantes")
    _, option_id = await _create_option(client, token_owner, label="Coca-Cola", ean="7891991010924")
    await _make_guarda_chuva(client, token_owner, pid, option_id)
    item_id, _, _ = await _seed_pending_item(pendente_motivo="guarda_chuva")

    r = await client.post(
        f"/catalog/supplier-invoices/items/{item_id}/link",
        json={"product_id": pid, "quantidade": 5, "unidade": "un"}, headers=auth(token_owner),
    )
    assert r.status_code == 400, r.text
    assert "guarda-chuva" in r.text


async def test_vincular_sem_estoque_iniciado_informando_unidade(client, token_owner):
    pid = await _create_product(client, token_owner, name="Produto Novo")
    item_id, _, _ = await _seed_pending_item(pendente_motivo="sem_estoque_iniciado")

    r = await client.post(
        f"/catalog/supplier-invoices/items/{item_id}/link",
        json={"product_id": pid, "quantidade": 10, "unidade": "un"}, headers=auth(token_owner),
    )
    assert r.status_code == 200, r.text


async def test_vincular_sem_estoque_iniciado_sem_unidade_erro(client, token_owner):
    pid = await _create_product(client, token_owner, name="Produto Novo")
    item_id, _, _ = await _seed_pending_item(pendente_motivo="sem_estoque_iniciado")

    r = await client.post(
        f"/catalog/supplier-invoices/items/{item_id}/link",
        json={"product_id": pid, "quantidade": 10}, headers=auth(token_owner),
    )
    assert r.status_code == 400, r.text


async def test_vincular_item_ja_resolvido_erro(client, token_owner):
    pid = await _create_product(client, token_owner, name="Produto")
    await _entrada_manual(client, token_owner, pid, quantidade=1, unidade="un")
    item_id, _, _ = await _seed_pending_item()

    r1 = await client.post(
        f"/catalog/supplier-invoices/items/{item_id}/link",
        json={"product_id": pid, "quantidade": 5}, headers=auth(token_owner),
    )
    assert r1.status_code == 200, r1.text

    r2 = await client.post(
        f"/catalog/supplier-invoices/items/{item_id}/link",
        json={"product_id": pid, "quantidade": 5}, headers=auth(token_owner),
    )
    assert r2.status_code == 400, r2.text

    state = await client.get(f"/catalog/products/{pid}/stock", headers=auth(token_owner))
    assert state.json()["quantidade_atual"] == 6  # 1 manual + 5 (não duplicou)


async def test_item_vinculado_some_da_fila(client, token_owner):
    pid = await _create_product(client, token_owner, name="Produto")
    await _entrada_manual(client, token_owner, pid, quantidade=1, unidade="un")
    item_id, _, _ = await _seed_pending_item()

    await client.post(
        f"/catalog/supplier-invoices/items/{item_id}/link",
        json={"product_id": pid, "quantidade": 5}, headers=auth(token_owner),
    )
    listagem = await client.get("/catalog/supplier-invoices/pending-items", headers=auth(token_owner))
    assert listagem.json()["total"] == 0


# ── Busca de opções (endpoint novo) ─────────────────────────────────────────

async def test_busca_opcoes_isolamento_multitenant(client, token_owner, token_company_b):
    await _create_option(client, token_owner, label="Coca-Cola Empresa A")
    r = await client.get("/catalog/options/search", params={"q": "Coca-Cola"}, headers=auth(token_company_b))
    assert r.status_code == 200, r.text
    assert r.json() == []


# ── Criar opção nova em grupo existente ─────────────────────────────────────
# Achado do usuário revisando C2 já implementado: "Vincular a existente" já
# busca produto OU opção, mas "Criar produto novo" só cobria produto — item
# pendente pode ser um sabor novo de um grupo já existente, não um produto.

async def test_criar_opcao_nova_em_grupo_existente_sucesso(client, token_owner):
    group_id, existing_option_id = await _create_option(client, token_owner, label="Coca-Cola", group_name="Refrigerantes")
    item_id, _, _ = await _seed_pending_item(x_prod="Guaraná Antarctica")

    r = await client.post(
        f"/catalog/supplier-invoices/items/{item_id}/create-option",
        json={"option_group_id": group_id, "label": "Guaraná Antarctica", "quantidade": 10, "unidade": "un"},
        headers=auth(token_owner),
    )
    assert r.status_code == 201, r.text
    assert r.json()["option_label"] == "Guaraná Antarctica"
    assert r.json()["option_group_id"] == group_id
    new_option_id = r.json()["option_id"]
    assert new_option_id != existing_option_id

    # a opção existente do grupo não foi apagada nem alterada (_set_option_group_options é replace completo)
    r_group = await client.get("/catalog/option-groups", headers=auth(token_owner))
    group = next(g for g in r_group.json()["option_groups"] if g["id"] == group_id)
    labels = {o["label"] for o in group["options"]}
    assert labels == {"Coca-Cola", "Guaraná Antarctica"}

    state = await client.get(f"/catalog/options/{new_option_id}/stock", headers=auth(token_owner))
    assert state.json()["quantidade_atual"] == 10


async def test_criar_opcao_grava_gtin_de_embalagem(client, token_owner):
    import main as svc
    group_id, _ = await _create_option(client, token_owner, label="Coca-Cola", group_name="Refrigerantes")
    gtin = _gtin13("789490003300")
    item_id, _, _ = await _seed_pending_item(c_ean=gtin, x_prod="Guaraná Fardo C/12")

    r = await client.post(
        f"/catalog/supplier-invoices/items/{item_id}/create-option",
        json={
            # backend não multiplica sozinho — quantidade já vem calculada pelo
            # frontend (2 fardos x 12), mesmo contrato de /link e /create-product.
            "option_group_id": group_id, "label": "Guaraná Antarctica", "quantidade": 24,
            "unidade": "un", "quantidade_por_unidade": 12,
        },
        headers=auth(token_owner),
    )
    assert r.status_code == 201, r.text
    option_id = r.json()["option_id"]

    async with svc.AsyncSessionLocal() as db:
        alt = (await db.execute(
            svc.select(svc.ProductGtinAlt).filter_by(company_id=1, gtin=gtin)
        )).scalars().first()
        assert alt is not None
        assert alt.option_id == option_id
        assert alt.product_id is None

    state = await client.get(f"/catalog/options/{option_id}/stock", headers=auth(token_owner))
    assert state.json()["quantidade_atual"] == 24  # 2 x 12


async def test_criar_opcao_em_grupo_de_outra_empresa_erro(client, token_owner, token_company_b):
    group_id, _ = await _create_option(client, token_company_b, label="Opção da empresa B", group_name="Grupo B")
    item_id, _, _ = await _seed_pending_item(company_id=1)

    r = await client.post(
        f"/catalog/supplier-invoices/items/{item_id}/create-option",
        json={"option_group_id": group_id, "label": "Tentativa", "quantidade": 1, "unidade": "un"},
        headers=auth(token_owner),
    )
    assert r.status_code == 404, r.text
