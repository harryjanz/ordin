"""ORD-153: imagem do combo. Mesmo padrão de tests/test_upload_imagem.py
(produto) — só que sem a exigência de category_id, decisão deliberada
documentada no Tech Explorer da história.
"""
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
        p1 = svc.Product(company_id=1, name="__combo_img_p1__", price=10.0, active=True)
        p2 = svc.Product(company_id=1, name="__combo_img_p2__", price=10.0, active=True)
        db.add_all([p1, p2])
        await db.flush()
        combo = svc.Combo(company_id=1, name="__combo_img__", price=15.0, active=True)
        combo_sem_cat = svc.Combo(company_id=1, category_id=None, name="__combo_img_sem_cat__", price=15.0, active=True)
        db.add_all([combo, combo_sem_cat])
        await db.flush()
        db.add_all([
            svc.ComboItem(combo_id=combo.id, product_id=p1.id),
            svc.ComboItem(combo_id=combo.id, product_id=p2.id),
        ])
        await db.commit()
        ids = {"combo_id": combo.id, "combo_sem_cat_id": combo_sem_cat.id, "p1_id": p1.id, "p2_id": p2.id}
        yield ids
        await db.execute(sa_delete(svc.ComboItem).where(svc.ComboItem.combo_id == combo.id))
        await db.execute(sa_delete(svc.Combo).where(svc.Combo.id.in_([combo.id, combo_sem_cat.id])))
        await db.execute(sa_delete(svc.Product).where(svc.Product.id.in_([p1.id, p2.id])))
        await db.commit()


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── upload: sucesso ───────────────────────────────────────────────────────────

async def test_upload_imagem_combo_sucesso(client, seed, token_owner):
    r = await client.post(
        f"/catalog/combos/{seed['combo_id']}/image",
        files={"image": ("combo.jpg", _img_bytes("JPEG"), "image/jpeg")},
        headers=auth(token_owner),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["image_url"] is not None
    assert data["thumbnail_url"] is not None


async def test_upload_imagem_combo_sem_category_id_funciona(client, seed, token_owner):
    """Diferença deliberada de produto — combo não exige category_id."""
    r = await client.post(
        f"/catalog/combos/{seed['combo_sem_cat_id']}/image",
        files={"image": ("combo.png", _img_bytes("PNG"), "image/png")},
        headers=auth(token_owner),
    )
    assert r.status_code == 200


async def test_upload_imagem_combo_fica_visivel_na_listagem(client, seed, token_owner):
    await client.post(
        f"/catalog/combos/{seed['combo_id']}/image",
        files={"image": ("combo.jpg", _img_bytes("JPEG"), "image/jpeg")},
        headers=auth(token_owner),
    )
    r = await client.get("/catalog/combos", headers=auth(token_owner))
    combo = next(c for c in r.json()["combos"] if c["id"] == seed["combo_id"])
    assert combo["thumbnail_url"] is not None


# ── upload: validações ────────────────────────────────────────────────────────

async def test_upload_imagem_combo_inexistente_retorna_404(client, token_owner):
    r = await client.post(
        "/catalog/combos/999999/image",
        files={"image": ("combo.jpg", _img_bytes("JPEG"), "image/jpeg")},
        headers=auth(token_owner),
    )
    assert r.status_code == 404


async def test_upload_imagem_combo_de_outra_empresa_retorna_404(client, seed, token_company_b):
    r = await client.post(
        f"/catalog/combos/{seed['combo_id']}/image",
        files={"image": ("combo.jpg", _img_bytes("JPEG"), "image/jpeg")},
        headers=auth(token_company_b),
    )
    assert r.status_code == 404


async def test_upload_imagem_combo_content_type_nao_aceito_retorna_415(client, seed, token_owner):
    r = await client.post(
        f"/catalog/combos/{seed['combo_id']}/image",
        files={"image": ("combo.gif", b"qualquer coisa", "image/gif")},
        headers=auth(token_owner),
    )
    assert r.status_code == 415


async def test_upload_imagem_combo_maior_que_limite_retorna_413(client, seed, token_owner):
    conteudo_grande = os.urandom(2 * 1024 * 1024 + 1024)
    r = await client.post(
        f"/catalog/combos/{seed['combo_id']}/image",
        files={"image": ("combo.jpg", conteudo_grande, "image/jpeg")},
        headers=auth(token_owner),
    )
    assert r.status_code == 413


async def test_upload_imagem_combo_arquivo_corrompido_retorna_422(client, seed, token_owner):
    r = await client.post(
        f"/catalog/combos/{seed['combo_id']}/image",
        files={"image": ("combo.jpg", b"isso nao e uma imagem", "image/jpeg")},
        headers=auth(token_owner),
    )
    assert r.status_code == 422


async def test_upload_imagem_combo_role_kiosk_retorna_403(client, seed, token_kiosk):
    r = await client.post(
        f"/catalog/combos/{seed['combo_id']}/image",
        files={"image": ("combo.jpg", _img_bytes("JPEG"), "image/jpeg")},
        headers=auth(token_kiosk),
    )
    assert r.status_code == 403


# ── re-upload substitui a imagem anterior (sem deixar lixo órfão) ────────────

async def test_reupload_combo_substitui_imagem_anterior(client, seed, token_owner):
    await client.post(
        f"/catalog/combos/{seed['combo_id']}/image",
        files={"image": ("combo.jpg", _img_bytes("JPEG"), "image/jpeg")},
        headers=auth(token_owner),
    )
    r2 = await client.post(
        f"/catalog/combos/{seed['combo_id']}/image",
        files={"image": ("combo.png", _img_bytes("PNG"), "image/png")},
        headers=auth(token_owner),
    )
    assert r2.status_code == 200

    s3 = boto3.client("s3", region_name=os.environ["AWS_REGION"])
    keys = {o["Key"] for o in s3.list_objects_v2(Bucket=os.environ["S3_BUCKET"]).get("Contents", [])}
    assert not any(k.endswith(".jpg") for k in keys)
    assert any(k.endswith(".png") for k in keys)


# ── remover imagem ────────────────────────────────────────────────────────────

async def test_remover_imagem_combo_sucesso(client, seed, token_owner):
    await client.post(
        f"/catalog/combos/{seed['combo_id']}/image",
        files={"image": ("combo.jpg", _img_bytes("JPEG"), "image/jpeg")},
        headers=auth(token_owner),
    )
    r = await client.delete(f"/catalog/combos/{seed['combo_id']}/image", headers=auth(token_owner))
    assert r.status_code == 200
    data = r.json()
    assert data["image_url"] is None
    assert data["thumbnail_url"] is None


async def test_remover_imagem_combo_sem_imagem_e_idempotente(client, seed, token_owner):
    r = await client.delete(f"/catalog/combos/{seed['combo_id']}/image", headers=auth(token_owner))
    assert r.status_code == 200
    assert r.json()["image_url"] is None


async def test_remover_imagem_combo_inexistente_retorna_404(client, token_owner):
    r = await client.delete("/catalog/combos/999999/image", headers=auth(token_owner))
    assert r.status_code == 404


async def test_remover_imagem_combo_de_outra_empresa_retorna_404(client, seed, token_owner, token_company_b):
    await client.post(
        f"/catalog/combos/{seed['combo_id']}/image",
        files={"image": ("combo.jpg", _img_bytes("JPEG"), "image/jpeg")},
        headers=auth(token_owner),
    )
    r = await client.delete(f"/catalog/combos/{seed['combo_id']}/image", headers=auth(token_company_b))
    assert r.status_code == 404
    r2 = await client.get("/catalog/combos", headers=auth(token_owner))
    combo = next(c for c in r2.json()["combos"] if c["id"] == seed["combo_id"])
    assert combo["image_url"] is not None


async def test_excluir_definitivamente_combo_remove_imagem_do_bucket(client, seed, token_owner):
    await client.post(
        f"/catalog/combos/{seed['combo_id']}/image",
        files={"image": ("combo.jpg", _img_bytes("JPEG"), "image/jpeg")},
        headers=auth(token_owner),
    )
    r = await client.delete(f"/catalog/combos/{seed['combo_id']}", headers=auth(token_owner))
    assert r.status_code == 204

    s3 = boto3.client("s3", region_name=os.environ["AWS_REGION"])
    keys = {o["Key"] for o in s3.list_objects_v2(Bucket=os.environ["S3_BUCKET"]).get("Contents", [])}
    assert not any(k.startswith(f"combos/combo-{seed['combo_id']}") for k in keys)
