"""
Testes de cobertura para paths não cobertos pelos outros test files.
Usa function-scoped fixtures com engine patching para evitar colisão de event loops.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import delete as sa_delete, select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker


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
    """Semeia categoria e produto para empresa 1."""
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        cat = svc.Category(company_id=1, name="__cov_cat__", active=True)
        db.add(cat)
        await db.flush()
        prod = svc.Product(company_id=1, category_id=cat.id,
                           name="__cov_prod__", price=10.0, active=True)
        db.add(prod)
        await db.commit()
        cat_id, prod_id = cat.id, prod.id
        yield {"cat_id": cat_id, "prod_id": prod_id}
        # Deleta todos os produtos da categoria (incluindo soft-deletes de testes)
        await db.execute(sa_delete(svc.Product).where(svc.Product.category_id == cat_id))
        await db.execute(sa_delete(svc.Category).where(svc.Category.id == cat_id))
        await db.commit()


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── require_write_role 403 (role cashier = read-only) ────────────────────────

async def test_create_categoria_role_cashier_retorna_403(client, token_kiosk):
    r = await client.post("/catalog/categories", json={"name": "X"}, headers=auth(token_kiosk))
    assert r.status_code == 403


async def test_update_categoria_role_cashier_retorna_403(client, seed, token_kiosk):
    r = await client.put(f"/catalog/categories/{seed['cat_id']}", json={"name": "X"}, headers=auth(token_kiosk))
    assert r.status_code == 403


async def test_delete_categoria_role_cashier_retorna_403(client, seed, token_kiosk):
    r = await client.delete(f"/catalog/categories/{seed['cat_id']}", headers=auth(token_kiosk))
    assert r.status_code == 403


# ── get_product 404 ───────────────────────────────────────────────────────────

async def test_get_produto_inexistente_retorna_404(client, token_owner):
    r = await client.get("/catalog/products/999999", headers=auth(token_owner))
    assert r.status_code == 404


# ── update_category 404 ───────────────────────────────────────────────────────

async def test_update_categoria_inexistente_retorna_404(client, token_owner):
    r = await client.put("/catalog/categories/999999", json={"name": "X"}, headers=auth(token_owner))
    assert r.status_code == 404


# ── delete_category success + 404 ─────────────────────────────────────────────

async def test_delete_categoria_success(client, token_owner):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        cat = svc.Category(company_id=1, name="__to_delete__", active=True)
        db.add(cat); await db.commit()
        cat_id = cat.id
    r = await client.delete(f"/catalog/categories/{cat_id}", headers=auth(token_owner))
    assert r.status_code == 204


async def test_delete_categoria_inexistente_retorna_404(client, token_owner):
    r = await client.delete("/catalog/categories/999999", headers=auth(token_owner))
    assert r.status_code == 404


# ── delete_product success + 404 ──────────────────────────────────────────────

async def test_delete_produto_success(client, seed, token_owner):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        prod = svc.Product(company_id=1, category_id=seed["cat_id"],
                           name="__to_delete__", price=5.0, active=True)
        db.add(prod); await db.commit()
        prod_id = prod.id
    r = await client.delete(f"/catalog/products/{prod_id}", headers=auth(token_owner))
    assert r.status_code == 204


async def test_delete_produto_inexistente_retorna_404(client, token_owner):
    r = await client.delete("/catalog/products/999999", headers=auth(token_owner))
    assert r.status_code == 404


# ── create_product validation (category_id de outra empresa) ─────────────────

async def test_create_product_categoria_alheia_retorna_400(client, token_owner):
    r = await client.post("/catalog/products", json={"name": "X", "price": 5.0,
                                                       "category_id": 999999},
                          headers=auth(token_owner))
    assert r.status_code == 400


# ── update_product paths ──────────────────────────────────────────────────────

async def test_update_produto_success(client, seed, token_owner):
    r = await client.put(f"/catalog/products/{seed['prod_id']}",
                         json={"name": "__updated__", "price": 12.0},
                         headers=auth(token_owner))
    assert r.status_code == 200
    assert r.json()["name"] == "__updated__"


async def test_update_produto_com_categoria_alheia_retorna_400(client, seed, token_owner):
    r = await client.put(f"/catalog/products/{seed['prod_id']}",
                         json={"category_id": 999999},
                         headers=auth(token_owner))
    assert r.status_code == 400


async def test_update_produto_inexistente_retorna_404(client, token_owner):
    r = await client.put("/catalog/products/999999",
                         json={"name": "X"},
                         headers=auth(token_owner))
    assert r.status_code == 404


# ── list_products with category_id filter ─────────────────────────────────────

async def test_list_products_filter_by_category(client, seed, token_owner):
    r = await client.get(f"/catalog/products?category_id={seed['cat_id']}", headers=auth(token_owner))
    assert r.status_code == 200
    assert len(r.json()["products"]) >= 1


# ── token inválido → 401 (cobre auth.py 34-36) ───────────────────────────────

async def test_token_invalido_retorna_401(client):
    r = await client.get("/catalog/categories", headers={"Authorization": "Bearer token.invalido.assinatura"})
    assert r.status_code == 401


# ── preço inválido → 422 (cobre main.py 84 e 98) ────────────────────────────

async def test_create_product_preco_invalido_retorna_422(client, token_owner):
    r = await client.post("/catalog/products",
                          json={"name": "X", "price": -1.0},
                          headers=auth(token_owner))
    assert r.status_code == 422


async def test_update_produto_preco_invalido_retorna_422(client, seed, token_owner):
    r = await client.put(f"/catalog/products/{seed['prod_id']}",
                         json={"price": 0.0},
                         headers=auth(token_owner))
    assert r.status_code == 422
