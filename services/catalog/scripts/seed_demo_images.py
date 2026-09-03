"""Sobe as fotos de demonstração da Burger House pro bucket (ORD-117).

Passo manual, opcional — roda depois da migration de seed do catálogo
(20260824_0930_seed_burger_house_demo.py), que só cria as linhas de produto
sem imagem. Migrations do Alembic aqui não fazem I/O de rede (ver decisão
técnica na história), então o upload fica neste script separado.

Uso (dentro do container do catalog-service, ou local com as mesmas env vars
de DB_URL/S3_*):

    python -m scripts.seed_demo_images

Idempotente: roda de novo a qualquer momento, sobrescreve as imagens
existentes (mesmo comportamento do upload manual via admin).
"""
import asyncio
import io
import sys
from pathlib import Path

from PIL import Image
from sqlalchemy import select, update

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from infrastructure.image_storage import (
    delete_object,
    ensure_bucket,
    upload_product_image,
    upload_product_thumbnail,
)
from main import AsyncSessionLocal, Product

ASSETS_DIR = Path(__file__).resolve().parent.parent / "seed_assets" / "burger_house_demo"
THUMBNAIL_SIZE = (200, 200)


def make_thumbnail(content: bytes) -> bytes:
    img = Image.open(io.BytesIO(content))
    img.thumbnail(THUMBNAIL_SIZE)
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


async def main() -> None:
    ensure_bucket()

    image_files = {p.stem: p for p in ASSETS_DIR.glob("*.jpg")}
    if not image_files:
        print(f"Nenhuma imagem encontrada em {ASSETS_DIR}", file=sys.stderr)
        return

    ok, skipped = 0, 0
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Product).filter(Product.sku.in_(image_files.keys()), Product.deleted.is_(False))
        )
        products = result.scalars().all()
        found_skus = {p.sku for p in products}

        for sku in sorted(image_files.keys() - found_skus):
            print(f"PULAR {sku}: sem produto correspondente no banco", file=sys.stderr)
            skipped += 1

        for p in products:
            content = image_files[p.sku].read_bytes()
            thumb_content = make_thumbnail(content)

            if p.image_url:
                delete_object(p.image_url)
            if p.thumbnail_url:
                delete_object(p.thumbnail_url)

            image_key = upload_product_image(p.category_id, p.id, "jpg", content)
            thumb_key = upload_product_thumbnail(p.category_id, p.id, "jpg", thumb_content)
            await db.execute(
                update(Product)
                .where(Product.id == p.id)
                .values(image_url=image_key, thumbnail_url=thumb_key)
            )
            ok += 1
            print(f"OK {p.sku} (id={p.id})", file=sys.stderr)

        await db.commit()

    print(f"\nTotal: {ok} imagens enviadas, {skipped} puladas (sem produto correspondente)", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
