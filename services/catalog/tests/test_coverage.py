"""
Testes de cobertura para paths não cobertos pelos outros test files.
Usa function-scoped fixtures com engine patching para evitar colisão de event loops.
"""
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


# ── superadmin/admin exigem company_id explícito, owner/manager ignoram o
# parâmetro (mesmo padrão de list_payments/list_orders — mudança pra dar a
# superadmin/admin acesso pra ajustar catálogo de qualquer empresa cliente) ──

async def test_superadmin_sem_company_id_retorna_400(client, token_superadmin):
    r = await client.get("/catalog/categories", headers=auth(token_superadmin))
    assert r.status_code == 400


async def test_admin_sem_company_id_retorna_400(client, token_admin):
    r = await client.get("/catalog/categories", headers=auth(token_admin))
    assert r.status_code == 400


async def test_superadmin_com_company_id_ve_categorias_da_empresa(client, seed, token_superadmin):
    r = await client.get("/catalog/categories?company_id=1&include_inactive=true", headers=auth(token_superadmin))
    assert r.status_code == 200
    names = [c["name"] for c in r.json()["categories"]]
    assert "__cov_cat__" in names


async def test_owner_ignora_company_id_de_outra_empresa(client, seed, token_owner):
    """Owner (empresa 1) não escapa da própria empresa mesmo mandando
    company_id=2 na query — parâmetro é ignorado pra quem não é
    superadmin/admin, mesmo padrão de list_payments/list_orders."""
    r = await client.get("/catalog/categories?company_id=2&include_inactive=true", headers=auth(token_owner))
    assert r.status_code == 200
    names = [c["name"] for c in r.json()["categories"]]
    assert "__cov_cat__" in names  # viu a própria empresa (1), não a 2


async def test_superadmin_cria_categoria_em_empresa_especifica(client, token_superadmin):
    r = await client.post("/catalog/categories?company_id=1", json={"name": "__cov_sa_cat__"},
                          headers=auth(token_superadmin))
    assert r.status_code == 201
    cat_id = r.json()["id"]
    # limpeza
    await client.delete(f"/catalog/categories/{cat_id}?permanent=true&company_id=1", headers=auth(token_superadmin))


async def test_admin_cria_produto_em_empresa_especifica(client, seed, token_admin):
    r = await client.post(
        "/catalog/products?company_id=1",
        json={"name": "__cov_admin_prod__", "price": 9.9, "category_id": seed["cat_id"]},
        headers=auth(token_admin),
    )
    assert r.status_code == 201
    prod_id = r.json()["id"]
    await client.delete(f"/catalog/products/{prod_id}?permanent=true&company_id=1", headers=auth(token_admin))
