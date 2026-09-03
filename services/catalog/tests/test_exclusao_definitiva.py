import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import boto3
import pytest
from httpx import ASGITransport, AsyncClient
from moto import mock_aws
from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


@pytest.fixture(autouse=True)
def _s3_bucket():
    with mock_aws():
        boto3.client("s3", region_name=os.environ["AWS_REGION"]).create_bucket(
            Bucket=os.environ["S3_BUCKET"]
        )
        yield


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
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        cat = svc.Category(company_id=1, name="__excl_cat__", active=True)
        db.add(cat)
        await db.flush()
        prod1 = svc.Product(company_id=1, category_id=cat.id, name="__excl_prod1__", price=10.0, active=True)
        prod2 = svc.Product(company_id=1, category_id=cat.id, name="__excl_prod2__", price=20.0, active=False)
        db.add_all([prod1, prod2])
        await db.commit()
        ids = {"cat_id": cat.id, "prod1_id": prod1.id, "prod2_id": prod2.id}
        yield ids
        await db.execute(sa_delete(svc.Product).where(svc.Product.category_id == cat.id))
        await db.execute(sa_delete(svc.Category).where(svc.Category.id == cat.id))
        await db.commit()


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── exclusão definitiva de categoria — cascata pros produtos ─────────────────

async def test_excluir_categoria_permanent_marca_deleted_na_categoria_e_produtos(client, seed, token_owner):
    r = await client.delete(f"/catalog/categories/{seed['cat_id']}?permanent=true", headers=auth(token_owner))
    assert r.status_code == 204

    import main as svc
    async with svc.AsyncSessionLocal() as db:
        from sqlalchemy import select
        cat = (await db.execute(select(svc.Category).where(svc.Category.id == seed["cat_id"]))).scalars().first()
        assert cat.deleted is True
        assert cat.active is False
        for prod_id in (seed["prod1_id"], seed["prod2_id"]):
            p = (await db.execute(select(svc.Product).where(svc.Product.id == prod_id))).scalars().first()
            assert p.deleted is True
            assert p.active is False


async def test_categoria_excluida_permanent_nao_aparece_nem_com_include_inactive(client, seed, token_owner):
    await client.delete(f"/catalog/categories/{seed['cat_id']}?permanent=true", headers=auth(token_owner))
    r = await client.get("/catalog/categories?include_inactive=true", headers=auth(token_owner))
    ids = [c["id"] for c in r.json()["categories"]]
    assert seed["cat_id"] not in ids


async def test_produtos_da_categoria_excluida_nao_aparecem_nem_com_include_inactive(client, seed, token_owner):
    await client.delete(f"/catalog/categories/{seed['cat_id']}?permanent=true", headers=auth(token_owner))
    r = await client.get(f"/catalog/products?category_id={seed['cat_id']}&include_inactive=true", headers=auth(token_owner))
    ids = [p["id"] for p in r.json()["products"]]
    assert seed["prod1_id"] not in ids
    assert seed["prod2_id"] not in ids


async def test_categoria_excluida_permanent_retorna_404_em_operacoes_seguintes(client, seed, token_owner):
    await client.delete(f"/catalog/categories/{seed['cat_id']}?permanent=true", headers=auth(token_owner))
    r_put = await client.put(f"/catalog/categories/{seed['cat_id']}", json={"name": "X"}, headers=auth(token_owner))
    assert r_put.status_code == 404
    r_delete_again = await client.delete(f"/catalog/categories/{seed['cat_id']}", headers=auth(token_owner))
    assert r_delete_again.status_code == 404


async def test_produto_excluido_permanent_via_categoria_retorna_404(client, seed, token_owner):
    await client.delete(f"/catalog/categories/{seed['cat_id']}?permanent=true", headers=auth(token_owner))
    r = await client.get(f"/catalog/products/{seed['prod1_id']}", headers=auth(token_owner))
    assert r.status_code == 404


# ── exclusão definitiva de produto individual ────────────────────────────────

async def test_excluir_produto_permanent_marca_deleted(client, seed, token_owner):
    r = await client.delete(f"/catalog/products/{seed['prod1_id']}?permanent=true", headers=auth(token_owner))
    assert r.status_code == 204
    import main as svc
    from sqlalchemy import select
    async with svc.AsyncSessionLocal() as db:
        p = (await db.execute(select(svc.Product).where(svc.Product.id == seed["prod1_id"]))).scalars().first()
        assert p.deleted is True
        assert p.active is False


async def test_produto_excluido_permanent_nao_aparece_nem_com_include_inactive(client, seed, token_owner):
    await client.delete(f"/catalog/products/{seed['prod1_id']}?permanent=true", headers=auth(token_owner))
    r = await client.get(f"/catalog/products?category_id={seed['cat_id']}&include_inactive=true", headers=auth(token_owner))
    ids = [p["id"] for p in r.json()["products"]]
    assert seed["prod1_id"] not in ids
    assert seed["prod2_id"] in ids  # o outro produto da categoria não foi afetado


async def test_produto_excluido_permanent_retorna_404_em_operacoes_seguintes(client, seed, token_owner):
    await client.delete(f"/catalog/products/{seed['prod1_id']}?permanent=true", headers=auth(token_owner))
    r_put = await client.put(f"/catalog/products/{seed['prod1_id']}", json={"name": "X"}, headers=auth(token_owner))
    assert r_put.status_code == 404
    r_upload = await client.post(
        f"/catalog/products/{seed['prod1_id']}/image",
        files={"image": ("x.jpg", b"conteudo", "image/jpeg")},
        headers=auth(token_owner),
    )
    assert r_upload.status_code == 404


async def test_excluir_produto_permanent_remove_imagem_do_bucket(client, seed, token_owner):
    import io

    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color=(0, 255, 0)).save(buf, format="JPEG")
    r_upload = await client.post(
        f"/catalog/products/{seed['prod1_id']}/image",
        files={"image": ("produto.jpg", buf.getvalue(), "image/jpeg")},
        headers=auth(token_owner),
    )
    assert r_upload.status_code == 200

    r_delete = await client.delete(f"/catalog/products/{seed['prod1_id']}?permanent=true", headers=auth(token_owner))
    assert r_delete.status_code == 204

    s3 = boto3.client("s3", region_name=os.environ["AWS_REGION"])
    keys = {o["Key"] for o in s3.list_objects_v2(Bucket=os.environ["S3_BUCKET"]).get("Contents", [])}
    assert not any(f"produto-{seed['prod1_id']}" in k for k in keys)


# ── soft delete (permanent=false, padrão) continua funcionando como antes ────

async def test_excluir_categoria_sem_permanent_so_desativa(client, seed, token_owner):
    r = await client.delete(f"/catalog/categories/{seed['cat_id']}", headers=auth(token_owner))
    assert r.status_code == 204
    import main as svc
    from sqlalchemy import select
    async with svc.AsyncSessionLocal() as db:
        cat = (await db.execute(select(svc.Category).where(svc.Category.id == seed["cat_id"]))).scalars().first()
        assert cat.deleted is False
        assert cat.active is False
        # produtos não são afetados pelo soft delete de categoria
        p = (await db.execute(select(svc.Product).where(svc.Product.id == seed["prod1_id"]))).scalars().first()
        assert p.active is True


async def test_excluir_produto_sem_permanent_so_desativa(client, seed, token_owner):
    r = await client.delete(f"/catalog/products/{seed['prod1_id']}", headers=auth(token_owner))
    assert r.status_code == 204
    import main as svc
    from sqlalchemy import select
    async with svc.AsyncSessionLocal() as db:
        p = (await db.execute(select(svc.Product).where(svc.Product.id == seed["prod1_id"]))).scalars().first()
        assert p.deleted is False
        assert p.active is False


async def test_categoria_desativada_soft_ainda_aparece_com_include_inactive(client, seed, token_owner):
    await client.delete(f"/catalog/categories/{seed['cat_id']}", headers=auth(token_owner))
    r = await client.get("/catalog/categories?include_inactive=true", headers=auth(token_owner))
    ids = [c["id"] for c in r.json()["categories"]]
    assert seed["cat_id"] in ids
