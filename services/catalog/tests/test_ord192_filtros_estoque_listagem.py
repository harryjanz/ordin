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


async def _create_product(client, token, *, name="Produto", estoque_minimo=0):
    r = await client.post(
        "/catalog/products", json={"name": name, "price": 9.9, "estoque_minimo": estoque_minimo},
        headers=auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _entrada(client, token, product_id, quantidade):
    r = await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": quantidade, "unidade": "un"},
        headers=auth(token),
    )
    assert r.status_code == 201, r.text


async def _ajuste(client, token, product_id, delta, motivo="ajuste de teste"):
    r = await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "ajuste", "quantidade": delta, "motivo": motivo},
        headers=auth(token),
    )
    assert r.status_code == 201, r.text


async def _list_ids(client, token, **params):
    params.setdefault("include_inactive", True)
    r = await client.get("/catalog/products", params=params, headers=auth(token))
    assert r.status_code == 200, r.text
    return [p["id"] for p in r.json()["products"]]


# ── 4 estados mutuamente exclusivos ──────────────────────────────────────

async def test_produto_indefinido_sem_stock_item(client, token_owner):
    product_id = await _create_product(client, token_owner, estoque_minimo=5)

    assert product_id in await _list_ids(client, token_owner, stock_filter="indefinido")
    assert product_id not in await _list_ids(client, token_owner, stock_filter="esgotado")
    assert product_id not in await _list_ids(client, token_owner, stock_filter="baixo")
    assert product_id not in await _list_ids(client, token_owner, stock_filter="com_estoque")


async def test_produto_esgotado_quantidade_zero(client, token_owner):
    product_id = await _create_product(client, token_owner, estoque_minimo=5)
    await _entrada(client, token_owner, product_id, 3)
    await _ajuste(client, token_owner, product_id, -3)

    assert product_id in await _list_ids(client, token_owner, stock_filter="esgotado")
    assert product_id not in await _list_ids(client, token_owner, stock_filter="indefinido")
    assert product_id not in await _list_ids(client, token_owner, stock_filter="baixo")
    assert product_id not in await _list_ids(client, token_owner, stock_filter="com_estoque")


async def test_produto_baixo_entre_zero_e_minimo(client, token_owner):
    product_id = await _create_product(client, token_owner, estoque_minimo=5)
    await _entrada(client, token_owner, product_id, 2)

    assert product_id in await _list_ids(client, token_owner, stock_filter="baixo")
    assert product_id not in await _list_ids(client, token_owner, stock_filter="esgotado")
    assert product_id not in await _list_ids(client, token_owner, stock_filter="indefinido")
    assert product_id not in await _list_ids(client, token_owner, stock_filter="com_estoque")


async def test_produto_com_estoque_acima_do_minimo(client, token_owner):
    product_id = await _create_product(client, token_owner, estoque_minimo=5)
    await _entrada(client, token_owner, product_id, 10)

    assert product_id in await _list_ids(client, token_owner, stock_filter="com_estoque")
    assert product_id not in await _list_ids(client, token_owner, stock_filter="baixo")
    assert product_id not in await _list_ids(client, token_owner, stock_filter="esgotado")
    assert product_id not in await _list_ids(client, token_owner, stock_filter="indefinido")


# ── Bordas ────────────────────────────────────────────────────────────────

async def test_quantidade_igual_ao_minimo_cai_em_baixo_nao_com_estoque(client, token_owner):
    product_id = await _create_product(client, token_owner, estoque_minimo=3)
    await _entrada(client, token_owner, product_id, 3)

    assert product_id in await _list_ids(client, token_owner, stock_filter="baixo")
    assert product_id not in await _list_ids(client, token_owner, stock_filter="com_estoque")


async def test_quantidade_zero_com_minimo_maior_que_zero_cai_em_esgotado_nao_baixo(client, token_owner):
    product_id = await _create_product(client, token_owner, estoque_minimo=5)
    await _entrada(client, token_owner, product_id, 5)
    await _ajuste(client, token_owner, product_id, -5)

    assert product_id in await _list_ids(client, token_owner, stock_filter="esgotado")
    assert product_id not in await _list_ids(client, token_owner, stock_filter="baixo")


async def test_quantidade_zero_com_minimo_zero_cai_em_esgotado_nao_baixo(client, token_owner):
    # caso mais comum: produto sem estoque_minimo configurado (default 0) que
    # zera — "esgotado" tem precedência sobre "baixo" mesmo com 0<=0 (achado de QA)
    product_id = await _create_product(client, token_owner, estoque_minimo=0)
    await _entrada(client, token_owner, product_id, 5)
    await _ajuste(client, token_owner, product_id, -5)

    assert product_id in await _list_ids(client, token_owner, stock_filter="esgotado")
    assert product_id not in await _list_ids(client, token_owner, stock_filter="baixo")


# ── Combinação com category_id ───────────────────────────────────────────

async def test_filtro_combinado_com_category_id(client, token_owner):
    cat_a = (await client.post("/catalog/categories", json={"name": "Categoria A"}, headers=auth(token_owner))).json()["id"]
    cat_b = (await client.post("/catalog/categories", json={"name": "Categoria B"}, headers=auth(token_owner))).json()["id"]

    r_a = await client.post(
        "/catalog/products", json={"name": "Esgotado A", "price": 9.9, "category_id": cat_a},
        headers=auth(token_owner),
    )
    product_a = r_a.json()["id"]
    await _entrada(client, token_owner, product_a, 5)
    await _ajuste(client, token_owner, product_a, -5)

    r_b = await client.post(
        "/catalog/products", json={"name": "Esgotado B", "price": 9.9, "category_id": cat_b},
        headers=auth(token_owner),
    )
    product_b = r_b.json()["id"]
    await _entrada(client, token_owner, product_b, 5)
    await _ajuste(client, token_owner, product_b, -5)

    ids = await _list_ids(client, token_owner, stock_filter="esgotado", category_id=cat_a)
    assert product_a in ids
    assert product_b not in ids


# ── Sem filtro — sem regressão ────────────────────────────────────────────

async def test_sem_filtro_mantem_comportamento_de_hoje(client, token_owner):
    indefinido = await _create_product(client, token_owner, name="Indefinido", estoque_minimo=5)
    esgotado = await _create_product(client, token_owner, name="Esgotado", estoque_minimo=5)
    await _entrada(client, token_owner, esgotado, 5)
    await _ajuste(client, token_owner, esgotado, -5)
    com_estoque = await _create_product(client, token_owner, name="Com estoque", estoque_minimo=3)
    await _entrada(client, token_owner, com_estoque, 10)

    ids = await _list_ids(client, token_owner)
    assert indefinido in ids
    assert esgotado in ids
    assert com_estoque in ids


# ── Produto guarda-chuva (G4) — limitação conhecida, não bug ─────────────

async def test_produto_guarda_chuva_aparece_em_indefinido_mesmo_com_opcoes_esgotadas(client, token_owner):
    product_id = await _create_product(client, token_owner, name="Refrigerante Lata 350ml")
    r_group = await client.post(
        "/catalog/option-groups",
        json={"name": "Sabor", "min_selections": 1, "max_selections": 1, "options": [{"label": "Guaraná"}]},
        headers=auth(token_owner),
    )
    assert r_group.status_code == 201, r_group.text
    group_id, option_id = r_group.json()["id"], r_group.json()["options"][0]["id"]
    r_link = await client.put(
        f"/catalog/products/{product_id}/option-groups",
        json={"option_group_ids": [group_id]},
        headers=auth(token_owner),
    )
    assert r_link.status_code == 200, r_link.text

    # opção vira guarda-chuva ao ganhar movimentação própria (mesmo padrão G4/ORD-189)
    r_mov = await client.post(
        f"/catalog/options/{option_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 5, "unidade": "un"},
        headers=auth(token_owner),
    )
    assert r_mov.status_code == 201, r_mov.text
    r_ajuste = await client.post(
        f"/catalog/options/{option_id}/stock/movements",
        json={"tipo": "ajuste", "quantidade": -5, "motivo": "zera opção"},
        headers=auth(token_owner),
    )
    assert r_ajuste.status_code == 201, r_ajuste.text

    # produto guarda-chuva nunca tem stock_item próprio (rejeitado por G4) —
    # mesmo com a opção zerada, o produto cai em "indefinido", não "esgotado"
    assert product_id in await _list_ids(client, token_owner, stock_filter="indefinido")
    assert product_id not in await _list_ids(client, token_owner, stock_filter="esgotado")


# ── N+1 — reuso do batch fetch já existente (achado de QA) ───────────────

async def test_stock_filter_reaproveita_stock_items_by_product_uma_unica_vez(client, token_owner, monkeypatch):
    import main as svc

    for i in range(10):
        product_id = await _create_product(client, token_owner, name=f"Produto {i}", estoque_minimo=3)
        if i % 2 == 0:
            await _entrada(client, token_owner, product_id, 10)
        else:
            await _entrada(client, token_owner, product_id, 1)

    call_count = 0
    original = svc._stock_items_by_product

    async def _spy(db, product_ids):
        nonlocal call_count
        call_count += 1
        return await original(db, product_ids)

    monkeypatch.setattr(svc, "_stock_items_by_product", _spy)

    r = await client.get(
        "/catalog/products", params={"include_inactive": True, "stock_filter": "baixo"}, headers=auth(token_owner),
    )
    assert r.status_code == 200
    assert len(r.json()["products"]) == 5
    assert call_count == 1


async def test_combinacao_include_inactive_false_com_stock_filter_nao_duplica_batch_fetch(client, token_owner, monkeypatch):
    # combinação teórica citada no Tech Explorer — não é um fluxo real da UI
    # admin, mas o backend precisa lidar com ela sem disparar a query 2x.
    import main as svc

    product_id = await _create_product(client, token_owner, estoque_minimo=3)
    await _entrada(client, token_owner, product_id, 10)

    call_count = 0
    original = svc._stock_items_by_product

    async def _spy(db, product_ids):
        nonlocal call_count
        call_count += 1
        return await original(db, product_ids)

    monkeypatch.setattr(svc, "_stock_items_by_product", _spy)

    r = await client.get(
        "/catalog/products", params={"include_inactive": False, "stock_filter": "com_estoque"}, headers=auth(token_owner),
    )
    assert r.status_code == 200
    assert call_count == 1
