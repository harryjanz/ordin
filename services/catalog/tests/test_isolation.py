import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import delete as sa_delete
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
async def ids(client):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        cat_b = svc.Category(company_id=2, name="__iso_cat_b__", active=True)
        db.add(cat_b)
        await db.flush()
        prod_b = svc.Product(company_id=2, category_id=cat_b.id,
                             name="__iso_prod_b__", price=40.0, active=True)
        db.add(prod_b)
        await db.commit()
        yield {"cat_b_id": cat_b.id, "prod_b_id": prod_b.id}
        await db.execute(sa_delete(svc.Product).where(svc.Product.id == prod_b.id))
        await db.execute(sa_delete(svc.Category).where(svc.Category.id == cat_b.id))
        await db.commit()


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# CA-001: listagem não vaza IDs de empresa alheia
async def test_list_categories_nao_retorna_ids_de_empresa_b(client, ids, token_owner):
    r = await client.get("/catalog/categories", headers=auth(token_owner))
    assert r.status_code == 200
    id_list = [c["id"] for c in r.json()["categories"]]
    assert ids["cat_b_id"] not in id_list


async def test_list_products_nao_retorna_ids_de_empresa_b(client, ids, token_owner):
    r = await client.get("/catalog/products", headers=auth(token_owner))
    assert r.status_code == 200
    id_list = [p["id"] for p in r.json()["products"]]
    assert ids["prod_b_id"] not in id_list


# CA-002: GET por ID alheio retorna 404
async def test_get_produto_de_outra_empresa_retorna_404(client, ids, token_owner):
    r = await client.get(f"/catalog/products/{ids['prod_b_id']}", headers=auth(token_owner))
    assert r.status_code == 404


# CA-003: escrita em recurso alheio retorna 404
async def test_update_categoria_alheia_retorna_404(client, ids, token_owner):
    r = await client.put(
        f"/catalog/categories/{ids['cat_b_id']}",
        json={"name": "Invadida"},
        headers=auth(token_owner),
    )
    assert r.status_code == 404


async def test_delete_categoria_alheia_retorna_404(client, ids, token_owner):
    r = await client.delete(
        f"/catalog/categories/{ids['cat_b_id']}",
        headers=auth(token_owner),
    )
    assert r.status_code == 404


async def test_delete_produto_alheio_retorna_404(client, ids, token_owner):
    r = await client.delete(
        f"/catalog/products/{ids['prod_b_id']}",
        headers=auth(token_owner),
    )
    assert r.status_code == 404


# CA-005: sem token retorna 401
async def test_sem_token_retorna_401(client):
    r = await client.get("/catalog/categories")
    assert r.status_code == 401


# CA-006: criação vincula company_id do JWT
async def test_create_categoria_vincula_company_do_jwt(client, token_owner):
    import main as svc
    from sqlalchemy import select, delete as sa_del
    r = await client.post(
        "/catalog/categories",
        json={"name": "__iso_create_test__"},
        headers=auth(token_owner),
    )
    assert r.status_code == 201
    cat_id = r.json()["id"]
    async with svc.AsyncSessionLocal() as db:
        cat = (await db.execute(select(svc.Category).where(svc.Category.id == cat_id))).scalars().first()
        assert cat is not None
        assert cat.company_id == 1
        await db.execute(sa_del(svc.Category).where(svc.Category.id == cat_id))
        await db.commit()


# Verificação bidirecional: empresa B não enxerga dados de A
async def test_empresa_b_nao_enxerga_categoria_de_empresa_a(client, token_owner, token_company_b):
    import main as svc
    from sqlalchemy import delete as sa_del
    r_create = await client.post(
        "/catalog/categories",
        json={"name": "__iso_cat_a_only__"},
        headers=auth(token_owner),
    )
    assert r_create.status_code == 201
    cat_a_id = r_create.json()["id"]

    r_b = await client.get("/catalog/categories", headers=auth(token_company_b))
    assert r_b.status_code == 200
    assert cat_a_id not in [c["id"] for c in r_b.json()["categories"]]

    async with svc.AsyncSessionLocal() as db:
        await db.execute(sa_del(svc.Category).where(svc.Category.id == cat_a_id))
        await db.commit()
