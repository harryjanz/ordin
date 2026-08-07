import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete as sa_delete
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


@pytest.fixture
async def seed(client):
    """Categoria por empresa (1 e 2) + dois alérgenos oficiais pra empresa 1
    montar cenários de multiseleção sem depender do seed de produção."""
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        cat = svc.Category(company_id=1, name="__ord075_cat__", active=True)
        cat_b = svc.Category(company_id=2, name="__ord075_cat_b__", active=True)
        db.add_all([cat, cat_b])
        await db.flush()
        allergen_trigo = svc.Allergen(code="trigo", name="Trigo", active=True)
        allergen_leite = svc.Allergen(code="leite", name="Leite de todos os mamíferos", active=True)
        db.add_all([allergen_trigo, allergen_leite])
        await db.commit()
        ids = {
            "cat_id": cat.id,
            "cat_b_id": cat_b.id,
            "allergen_trigo_id": allergen_trigo.id,
            "allergen_leite_id": allergen_leite.id,
        }
        yield ids
        await db.execute(sa_delete(svc.ProductAllergen))
        await db.execute(sa_delete(svc.Product).where(svc.Product.category_id.in_([cat.id, cat_b.id])))
        await db.execute(sa_delete(svc.Category).where(svc.Category.id.in_([cat.id, cat_b.id])))
        await db.execute(
            sa_delete(svc.Allergen).where(svc.Allergen.id.in_([allergen_trigo.id, allergen_leite.id]))
        )
        await db.commit()


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── GET /catalog/allergens ──────────────────────────────────────────────────

async def test_list_allergens(client, seed, token_owner):
    r = await client.get("/catalog/allergens", headers=auth(token_owner))
    assert r.status_code == 200
    codes = {a["code"] for a in r.json()["allergens"]}
    assert {"trigo", "leite"} <= codes


# ── Cadastro continua mínimo ─────────────────────────────────────────────────

async def test_cadastro_produto_continua_minimo(client, seed, token_owner):
    r = await client.post(
        "/catalog/products",
        json={"name": "X-Burguer", "price": 18.9, "category_id": seed["cat_id"]},
        headers=auth(token_owner),
    )
    assert r.status_code == 201
    data = r.json()
    assert data["calories"] is None
    assert data["sku"] is None
    assert data["tags"] is None
    assert data["allergens"] == []


# ── Edição salva todos os campos novos ──────────────────────────────────────

async def test_edicao_salva_todos_campos_novos(client, seed, token_owner):
    created = await client.post(
        "/catalog/products",
        json={"name": "X-Bacon", "price": 22.9, "category_id": seed["cat_id"]},
        headers=auth(token_owner),
    )
    product_id = created.json()["id"]

    r = await client.put(
        f"/catalog/products/{product_id}",
        json={
            "description": "Hambúrguer com bacon",
            "description_long": "Hambúrguer 180g, bacon crocante, queijo cheddar e molho especial da casa.",
            "calories": 650,
            "sku": "LAN-002",
            "tags": ["mais vendido", "picante"],
            "allergen_ids": [seed["allergen_trigo_id"], seed["allergen_leite_id"]],
        },
        headers=auth(token_owner),
    )
    assert r.status_code == 200

    got = await client.get(f"/catalog/products/{product_id}", headers=auth(token_owner))
    data = got.json()
    assert data["description"] == "Hambúrguer com bacon"
    assert data["description_long"].startswith("Hambúrguer 180g")
    assert data["calories"] == 650
    assert data["sku"] == "LAN-002"
    assert set(data["tags"]) == {"mais vendido", "picante"}
    assert {a["code"] for a in data["allergens"]} == {"trigo", "leite"}


async def test_edicao_allergen_id_inexistente_retorna_400(client, seed, token_owner):
    created = await client.post(
        "/catalog/products",
        json={"name": "X-Salada", "price": 17.9, "category_id": seed["cat_id"]},
        headers=auth(token_owner),
    )
    product_id = created.json()["id"]
    r = await client.put(
        f"/catalog/products/{product_id}",
        json={"allergen_ids": [999999]},
        headers=auth(token_owner),
    )
    assert r.status_code == 400


async def test_edicao_remove_allergenos_com_lista_vazia(client, seed, token_owner):
    created = await client.post(
        "/catalog/products",
        json={"name": "Suco", "price": 8.9, "category_id": seed["cat_id"]},
        headers=auth(token_owner),
    )
    product_id = created.json()["id"]
    await client.put(
        f"/catalog/products/{product_id}",
        json={"allergen_ids": [seed["allergen_trigo_id"]]},
        headers=auth(token_owner),
    )
    r = await client.put(
        f"/catalog/products/{product_id}",
        json={"allergen_ids": []},
        headers=auth(token_owner),
    )
    assert r.status_code == 200
    assert r.json()["allergens"] == []


# ── SKU único por empresa ────────────────────────────────────────────────────

async def test_sku_duplicado_mesma_empresa_e_rejeitado(client, seed, token_owner):
    await client.post(
        "/catalog/products",
        json={"name": "Combo 1", "price": 29.9, "category_id": seed["cat_id"], "sku": "LAN-001"},
        headers=auth(token_owner),
    )
    r = await client.post(
        "/catalog/products",
        json={"name": "Combo 2", "price": 34.9, "category_id": seed["cat_id"], "sku": "LAN-001"},
        headers=auth(token_owner),
    )
    assert r.status_code == 400


async def test_sku_duplicado_em_outra_empresa_e_permitido(client, seed, token_owner, token_company_b):
    await client.post(
        "/catalog/products",
        json={"name": "Combo A", "price": 29.9, "category_id": seed["cat_id"], "sku": "LAN-777"},
        headers=auth(token_owner),
    )
    r = await client.post(
        "/catalog/products",
        json={"name": "Combo B", "price": 31.9, "category_id": seed["cat_b_id"], "sku": "LAN-777"},
        headers=auth(token_company_b),
    )
    assert r.status_code == 201


async def test_atualizar_sku_para_um_ja_usado_e_rejeitado(client, seed, token_owner):
    await client.post(
        "/catalog/products",
        json={"name": "Fritas P", "price": 8.9, "category_id": seed["cat_id"], "sku": "EXT-001"},
        headers=auth(token_owner),
    )
    other = await client.post(
        "/catalog/products",
        json={"name": "Fritas G", "price": 12.9, "category_id": seed["cat_id"]},
        headers=auth(token_owner),
    )
    other_id = other.json()["id"]
    r = await client.put(
        f"/catalog/products/{other_id}",
        json={"sku": "EXT-001"},
        headers=auth(token_owner),
    )
    assert r.status_code == 400


# ── Reordenação (sort_order) ────────────────────────────────────────────────

async def test_reordenar_produtos_persiste(client, seed, token_owner):
    ids = []
    for name in ["Item 1", "Item 2", "Item 3", "Item 4"]:
        r = await client.post(
            "/catalog/products",
            json={"name": name, "price": 10.0, "category_id": seed["cat_id"]},
            headers=auth(token_owner),
        )
        ids.append(r.json()["id"])

    new_order = [ids[3], ids[0], ids[1], ids[2]]
    r = await client.put(
        "/catalog/products/reorder",
        json={"category_id": seed["cat_id"], "product_ids": new_order},
        headers=auth(token_owner),
    )
    assert r.status_code == 204

    listed = await client.get(
        f"/catalog/products?category_id={seed['cat_id']}", headers=auth(token_owner)
    )
    listed_ids = [p["id"] for p in listed.json()["products"]]
    assert listed_ids == new_order


async def test_reordenar_com_product_id_de_outra_categoria_retorna_400(client, seed, token_owner):
    r1 = await client.post(
        "/catalog/products",
        json={"name": "Da categoria certa", "price": 10.0, "category_id": seed["cat_id"]},
        headers=auth(token_owner),
    )
    r = await client.put(
        "/catalog/products/reorder",
        json={"category_id": seed["cat_id"], "product_ids": [r1.json()["id"], 999999]},
        headers=auth(token_owner),
    )
    assert r.status_code == 400


async def test_produto_sem_sort_order_nao_quebra_listagem(client, seed, token_owner):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        legacy = svc.Product(
            company_id=1, category_id=seed["cat_id"], name="__legacy_sem_sort_order__",
            price=9.9, active=True, sort_order=None,
        )
        db.add(legacy)
        await db.commit()

    r = await client.get(f"/catalog/products?category_id={seed['cat_id']}", headers=auth(token_owner))
    assert r.status_code == 200
    names = [p["name"] for p in r.json()["products"]]
    assert "__legacy_sem_sort_order__" in names


# ── Tags livres ──────────────────────────────────────────────────────────────

async def test_tags_livres_alem_das_sugeridas(client, seed, token_owner):
    created = await client.post(
        "/catalog/products",
        json={"name": "Espaguete", "price": 32.9, "category_id": seed["cat_id"]},
        headers=auth(token_owner),
    )
    product_id = created.json()["id"]
    r = await client.put(
        f"/catalog/products/{product_id}",
        json={"tags": ["contém glúten na massa artesanal"]},
        headers=auth(token_owner),
    )
    assert r.status_code == 200
    assert r.json()["tags"] == ["contém glúten na massa artesanal"]
