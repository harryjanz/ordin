import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from httpx import AsyncClient, ASGITransport


@pytest.fixture(scope="module")
async def client():
    from main import app, Base, engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture(scope="module")
async def seed(client):
    from main import AsyncSessionLocal, Category, Product
    async with AsyncSessionLocal() as db:
        cat = Category(company_id=1, name="Lanches", active=True)
        db.add(cat)
        await db.flush()
        prod = Product(company_id=1, category_id=cat.id, name="X-Burger",
                       price=25.90, active=True)
        db.add(prod)
        await db.commit()
        return {"category_id": cat.id, "product_id": prod.id}


async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["service"] == "catalog"


async def test_list_categories_sem_token(client):
    r = await client.get("/catalog/categories")
    assert r.status_code == 401


async def test_list_categories(client, seed, token_owner):
    r = await client.get("/catalog/categories", headers={"Authorization": f"Bearer {token_owner}"})
    assert r.status_code == 200
    data = r.json()
    assert "categories" in data or isinstance(data, list)


async def test_list_products(client, seed, token_owner):
    r = await client.get("/catalog/products", headers={"Authorization": f"Bearer {token_owner}"})
    assert r.status_code == 200


async def test_create_category(client, token_owner):
    r = await client.post(
        "/catalog/categories",
        json={"name": "Bebidas"},
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert r.status_code in (200, 201)


async def test_create_product(client, seed, token_owner):
    r = await client.post(
        "/catalog/products",
        json={"name": "Refrigerante", "price": 6.0, "category_id": seed["category_id"]},
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert r.status_code in (200, 201)
