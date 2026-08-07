import io
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import boto3
import pytest
from httpx import ASGITransport, AsyncClient
from moto import mock_aws
from PIL import Image
from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def _img_bytes(fmt: str = "JPEG", size: tuple[int, int] = (10, 10)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color=(255, 0, 0)).save(buf, format=fmt)
    return buf.getvalue()


@pytest.fixture(autouse=True)
def _s3_bucket():
    """moto mocka a API do S3 pra esses testes não dependerem de MinIO real
    rodando. Mesmo padrão do conftest.py do company-service para
    contract_storage — S3_ENDPOINT_URL fica deliberadamente sem valor
    (setado só em dev/prod), porque moto só intercepta o boto3 quando o
    client usa o endpoint padrão da AWS."""
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
        cat = svc.Category(company_id=1, name="__img_cat__", active=True)
        db.add(cat)
        await db.flush()
        prod = svc.Product(company_id=1, category_id=cat.id, name="__img_prod__",
                           price=10.0, active=True)
        prod_sem_cat = svc.Product(company_id=1, category_id=None, name="__img_prod_sem_cat__",
                                   price=10.0, active=True)
        db.add_all([prod, prod_sem_cat])
        await db.commit()
        ids = {"cat_id": cat.id, "prod_id": prod.id, "prod_sem_cat_id": prod_sem_cat.id}
        yield ids
        await db.execute(sa_delete(svc.Product).where(svc.Product.category_id == cat.id))
        await db.execute(sa_delete(svc.Product).where(svc.Product.id == prod_sem_cat.id))
        await db.execute(sa_delete(svc.Category).where(svc.Category.id == cat.id))
        await db.commit()


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── upload: sucesso ───────────────────────────────────────────────────────────

async def test_upload_imagem_sucesso(client, seed, token_owner):
    r = await client.post(
        f"/catalog/products/{seed['prod_id']}/image",
        files={"image": ("produto.jpg", _img_bytes("JPEG"), "image/jpeg")},
        headers=auth(token_owner),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["image_url"] is not None
    assert data["thumbnail_url"] is not None


async def test_upload_imagem_png_sucesso(client, seed, token_owner):
    r = await client.post(
        f"/catalog/products/{seed['prod_id']}/image",
        files={"image": ("produto.png", _img_bytes("PNG"), "image/png")},
        headers=auth(token_owner),
    )
    assert r.status_code == 200


async def test_upload_imagem_fica_visivel_na_listagem(client, seed, token_owner):
    await client.post(
        f"/catalog/products/{seed['prod_id']}/image",
        files={"image": ("produto.jpg", _img_bytes("JPEG"), "image/jpeg")},
        headers=auth(token_owner),
    )
    r = await client.get(f"/catalog/products/{seed['prod_id']}", headers=auth(token_owner))
    assert r.status_code == 200
    assert r.json()["thumbnail_url"] is not None


# ── upload: validações ────────────────────────────────────────────────────────

async def test_upload_imagem_produto_sem_categoria_retorna_400(client, seed, token_owner):
    r = await client.post(
        f"/catalog/products/{seed['prod_sem_cat_id']}/image",
        files={"image": ("produto.jpg", _img_bytes("JPEG"), "image/jpeg")},
        headers=auth(token_owner),
    )
    assert r.status_code == 400


async def test_upload_imagem_produto_inexistente_retorna_404(client, token_owner):
    r = await client.post(
        "/catalog/products/999999/image",
        files={"image": ("produto.jpg", _img_bytes("JPEG"), "image/jpeg")},
        headers=auth(token_owner),
    )
    assert r.status_code == 404


async def test_upload_imagem_produto_de_outra_empresa_retorna_404(client, seed, token_company_b):
    r = await client.post(
        f"/catalog/products/{seed['prod_id']}/image",
        files={"image": ("produto.jpg", _img_bytes("JPEG"), "image/jpeg")},
        headers=auth(token_company_b),
    )
    assert r.status_code == 404


async def test_upload_imagem_content_type_nao_aceito_retorna_415(client, seed, token_owner):
    r = await client.post(
        f"/catalog/products/{seed['prod_id']}/image",
        files={"image": ("produto.gif", b"qualquer coisa", "image/gif")},
        headers=auth(token_owner),
    )
    assert r.status_code == 415


async def test_upload_imagem_maior_que_limite_retorna_413(client, seed, token_owner):
    conteudo_grande = os.urandom(2 * 1024 * 1024 + 1024)
    r = await client.post(
        f"/catalog/products/{seed['prod_id']}/image",
        files={"image": ("produto.jpg", conteudo_grande, "image/jpeg")},
        headers=auth(token_owner),
    )
    assert r.status_code == 413


async def test_upload_imagem_arquivo_corrompido_retorna_422(client, seed, token_owner):
    r = await client.post(
        f"/catalog/products/{seed['prod_id']}/image",
        files={"image": ("produto.jpg", b"isso nao e uma imagem", "image/jpeg")},
        headers=auth(token_owner),
    )
    assert r.status_code == 422


async def test_upload_imagem_role_cashier_retorna_403(client, seed, token_kiosk):
    r = await client.post(
        f"/catalog/products/{seed['prod_id']}/image",
        files={"image": ("produto.jpg", _img_bytes("JPEG"), "image/jpeg")},
        headers=auth(token_kiosk),
    )
    assert r.status_code == 403


# ── re-upload substitui a imagem anterior (sem deixar lixo órfão) ────────────

async def test_reupload_substitui_imagem_anterior(client, seed, token_owner):
    r1 = await client.post(
        f"/catalog/products/{seed['prod_id']}/image",
        files={"image": ("produto.jpg", _img_bytes("JPEG"), "image/jpeg")},
        headers=auth(token_owner),
    )
    key_antiga = r1.json()["image_url"]

    r2 = await client.post(
        f"/catalog/products/{seed['prod_id']}/image",
        files={"image": ("produto.png", _img_bytes("PNG"), "image/png")},
        headers=auth(token_owner),
    )
    assert r2.status_code == 200
    assert r2.json()["image_url"] != key_antiga

    s3 = boto3.client("s3", region_name=os.environ["AWS_REGION"])
    keys = {o["Key"] for o in s3.list_objects_v2(Bucket=os.environ["S3_BUCKET"]).get("Contents", [])}
    assert not any(k.endswith(".jpg") for k in keys)
    assert any(k.endswith(".png") for k in keys)


# ── remover imagem ────────────────────────────────────────────────────────────

async def test_remover_imagem_sucesso(client, seed, token_owner):
    await client.post(
        f"/catalog/products/{seed['prod_id']}/image",
        files={"image": ("produto.jpg", _img_bytes("JPEG"), "image/jpeg")},
        headers=auth(token_owner),
    )
    r = await client.delete(f"/catalog/products/{seed['prod_id']}/image", headers=auth(token_owner))
    assert r.status_code == 200
    data = r.json()
    assert data["image_url"] is None
    assert data["thumbnail_url"] is None


async def test_remover_imagem_produto_sem_imagem_e_idempotente(client, seed, token_owner):
    r = await client.delete(f"/catalog/products/{seed['prod_id']}/image", headers=auth(token_owner))
    assert r.status_code == 200
    assert r.json()["image_url"] is None


async def test_remover_imagem_produto_inexistente_retorna_404(client, token_owner):
    r = await client.delete("/catalog/products/999999/image", headers=auth(token_owner))
    assert r.status_code == 404


async def test_remover_imagem_role_cashier_retorna_403(client, seed, token_kiosk):
    r = await client.delete(f"/catalog/products/{seed['prod_id']}/image", headers=auth(token_kiosk))
    assert r.status_code == 403
