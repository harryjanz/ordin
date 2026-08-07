import io

from fastapi import FastAPI, File, HTTPException, Depends, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from sqlalchemy import Column, Integer, String, Numeric, Boolean, DateTime, ForeignKey, select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime
from config import require_env, get_cors_origins
from auth import get_current_user, TokenPayload
from infrastructure.image_storage import (
    delete_object,
    ensure_bucket,
    presigned_download_url,
    upload_product_image,
    upload_product_thumbnail,
)

# ── Upload de imagem de produto ──────────────────────────────────────────────

_IMAGE_CONTENT_TYPES = {"image/jpeg": "jpg", "image/png": "png"}
_IMAGE_MAX_BYTES = 2 * 1024 * 1024  # 2 MB
_THUMBNAIL_SIZE = (200, 200)

_WRITE_ROLES = {"admin", "owner", "manager"}

def require_write_role(current_user: TokenPayload = Depends(get_current_user)) -> TokenPayload:
    if current_user.role not in _WRITE_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Permissão insuficiente")
    return current_user

DB_URL = require_env("DB_URL")
engine = create_async_engine(DB_URL.replace("mysql+pymysql://", "mysql+aiomysql://"), pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase): pass

class Category(Base):
    __tablename__ = "categories"
    id         = Column(Integer, primary_key=True)
    company_id = Column(Integer, nullable=False, index=True)
    name       = Column(String(80), nullable=False)
    active     = Column(Boolean, default=True)
    # Exclusão definitiva — diferente de `active` (que é reversível via
    # reativação). Uma vez True nunca aparece de novo em nenhuma consulta,
    # mesmo com include_inactive=true. A linha continua no banco só pra
    # manter o vínculo histórico com vendas já realizadas.
    deleted    = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Product(Base):
    __tablename__ = "products"
    id          = Column(Integer, primary_key=True)
    company_id  = Column(Integer, nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"))
    name        = Column(String(120), nullable=False)
    description = Column(String(500))
    price       = Column(Numeric(10, 2), nullable=False)
    image_url   = Column(String(500))  # key do objeto no bucket, não uma URL — ver infrastructure/image_storage.py
    thumbnail_url = Column(String(500))  # idem, key do thumbnail
    active      = Column(Boolean, default=True)
    deleted     = Column(Boolean, default=False, nullable=False)  # ver Category.deleted
    created_at  = Column(DateTime, default=datetime.utcnow)

async def get_db():
    async with AsyncSessionLocal() as db:
        yield db

def _serialize_product(p: "Product") -> dict:
    """Monta o dict de saída trocando as keys de S3 guardadas no banco por
    URLs assinadas (temporárias) — o cliente nunca vê a key crua."""
    return {
        "id": p.id,
        "category_id": p.category_id,
        "name": p.name,
        "description": p.description,
        "price": float(p.price),
        "image_url": presigned_download_url(p.image_url) if p.image_url else None,
        "thumbnail_url": presigned_download_url(p.thumbnail_url) if p.thumbnail_url else None,
        "active": p.active,
    }

# ── Response schemas ──────────────────────────────────────────────────────────

class CategoryOut(BaseModel):
    id: int
    name: str
    active: bool

class CategoryListOut(BaseModel):
    categories: list[CategoryOut]

class CategoryIn(BaseModel):
    name: str

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    active: Optional[bool] = None

class ProductOut(BaseModel):
    id: int
    category_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    price: float
    image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    active: bool = True

class ProductListOut(BaseModel):
    products: list[ProductOut]

class ProductIn(BaseModel):
    name: str
    description: Optional[str] = None
    price: float
    category_id: Optional[int] = None

    @field_validator("price")
    @classmethod
    def price_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Preço deve ser positivo")
        return v

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    category_id: Optional[int] = None
    active: Optional[bool] = None

    @field_validator("price")
    @classmethod
    def price_positive(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v <= 0:
            raise ValueError("Preço deve ser positivo")
        return v

class HealthOut(BaseModel):
    service: str
    status: str

# ── App ───────────────────────────────────────────────────────────────────────

_tags = [
    {
        "name": "Catálogo",
        "description": (
            "Catálogo de produtos e categorias da empresa autenticada. "
            "Todos os endpoints são filtrados automaticamente por `company_id` do JWT — "
            "nunca é possível acessar o catálogo de outra empresa."
        ),
    },
]

app = FastAPI(
    title="Ordin — Catalog Service",
    description=(
        "Serviço de catálogo de produtos da plataforma Ordin.\n\n"
        "Expõe o cardápio de cada empresa para os totens de autoatendimento e painel administrativo. "
        "O isolamento multi-tenant é garantido pelo `company_id` extraído do JWT — "
        "nunca aceito via query string ou body.\n\n"
        "**Autenticação:** todos os endpoints exigem `Authorization: Bearer <token>`."
    ),
    version="1.0.0",
    openapi_tags=_tags,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Internal-Secret"],
    allow_credentials=True,
)

@app.on_event("startup")
async def _create_catalog_bucket_if_local() -> None:
    ensure_bucket()

@app.get(
    "/catalog/categories",
    response_model=CategoryListOut,
    tags=["Catálogo"],
    summary="Listar categorias do cardápio",
)
async def list_categories(
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """Retorna categorias da empresa autenticada. Por padrão só as ativas
    (usado pelo totem); `include_inactive=true` também traz as desativadas
    (usado pela gestão de catálogo no admin). Categorias excluídas
    definitivamente (`deleted=True`) nunca aparecem, nem com include_inactive."""
    q = select(Category).filter_by(company_id=current_user.company_id, deleted=False)
    if not include_inactive:
        q = q.filter_by(active=True)
    result = await db.execute(q)
    cats = result.scalars().all()
    return {"categories": [{"id": c.id, "name": c.name, "active": c.active} for c in cats]}

@app.get(
    "/catalog/products",
    response_model=ProductListOut,
    tags=["Catálogo"],
    summary="Listar produtos do cardápio",
)
async def list_products(
    category_id: Optional[int] = None,
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """Retorna produtos da empresa. Filtrável por `category_id`. Por padrão só
    produtos ativos (usado pelo totem); `include_inactive=true` também traz os
    desativados (usado pela gestão de catálogo no admin). Produtos excluídos
    definitivamente (`deleted=True`) nunca aparecem, nem com include_inactive."""
    q = select(Product).filter_by(company_id=current_user.company_id, deleted=False)
    if not include_inactive:
        q = q.filter_by(active=True)
    if category_id:
        q = q.filter_by(category_id=category_id)
    result = await db.execute(q)
    products = result.scalars().all()
    return {"products": [_serialize_product(p) for p in products]}

@app.get(
    "/catalog/products/{product_id}",
    response_model=ProductOut,
    tags=["Catálogo"],
    summary="Detalhes de um produto",
    responses={404: {"description": "Produto não encontrado ou de outra empresa"}},
)
async def get_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """Retorna os detalhes de um produto. Isolamento multi-tenant aplicado: 404 se o produto for de outra empresa."""
    result = await db.execute(select(Product).filter_by(id=product_id, company_id=current_user.company_id, deleted=False))
    p = result.scalars().first()
    if not p: raise HTTPException(404)
    return _serialize_product(p)

@app.post(
    "/catalog/categories",
    status_code=201,
    response_model=CategoryOut,
    tags=["Catálogo"],
    summary="Criar categoria",
)
async def create_category(
    body: CategoryIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_write_role),
):
    cat = Category(company_id=current_user.company_id, name=body.name)
    db.add(cat); await db.commit(); await db.refresh(cat)
    return {"id": cat.id, "name": cat.name, "active": cat.active}

@app.put(
    "/catalog/categories/{category_id}",
    response_model=CategoryOut,
    tags=["Catálogo"],
    summary="Editar categoria",
    responses={404: {"description": "Categoria não encontrada"}},
)
async def update_category(
    category_id: int,
    body: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_write_role),
):
    result = await db.execute(select(Category).filter_by(id=category_id, company_id=current_user.company_id, deleted=False))
    cat = result.scalars().first()
    if not cat: raise HTTPException(404)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(cat, field, value)
    await db.commit(); await db.refresh(cat)
    return {"id": cat.id, "name": cat.name, "active": cat.active}

@app.delete(
    "/catalog/categories/{category_id}",
    status_code=204,
    tags=["Catálogo"],
    summary="Desativar ou excluir definitivamente uma categoria",
    responses={404: {"description": "Categoria não encontrada"}},
)
async def delete_category(
    category_id: int,
    permanent: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_write_role),
):
    """Por padrão só desativa (`active=False`), reversível via PUT com
    `active: true`. Com `permanent=true`, marca `deleted=True` na categoria
    e em todos os seus produtos — ação irreversível, essas linhas nunca mais
    aparecem em nenhuma consulta, mas continuam no banco (vínculo com vendas
    já realizadas)."""
    result = await db.execute(select(Category).filter_by(id=category_id, company_id=current_user.company_id, deleted=False))
    cat = result.scalars().first()
    if not cat: raise HTTPException(404)
    if permanent:
        cat.deleted = True
        cat.active = False
        products = (await db.execute(
            select(Product).filter_by(category_id=category_id, company_id=current_user.company_id, deleted=False)
        )).scalars().all()
        for p in products:
            p.deleted = True
            p.active = False
    else:
        cat.active = False
    await db.commit()

@app.post(
    "/catalog/products",
    status_code=201,
    response_model=ProductOut,
    tags=["Catálogo"],
    summary="Criar produto",
    responses={400: {"description": "category_id não pertence à empresa"}},
)
async def create_product(
    body: ProductIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_write_role),
):
    if body.category_id is not None:
        cat = (await db.execute(
            select(Category).filter_by(id=body.category_id, company_id=current_user.company_id, active=True, deleted=False)
        )).scalars().first()
        if not cat:
            raise HTTPException(400, detail="category_id não pertence à empresa ou não existe")
    p = Product(
        company_id=current_user.company_id,
        category_id=body.category_id,
        name=body.name,
        description=body.description,
        price=body.price,
    )
    db.add(p); await db.commit(); await db.refresh(p)
    return _serialize_product(p)

@app.put(
    "/catalog/products/{product_id}",
    response_model=ProductOut,
    tags=["Catálogo"],
    summary="Editar produto",
    responses={
        400: {"description": "category_id não pertence à empresa"},
        404: {"description": "Produto não encontrado"},
    },
)
async def update_product(
    product_id: int,
    body: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_write_role),
):
    result = await db.execute(select(Product).filter_by(id=product_id, company_id=current_user.company_id, deleted=False))
    p = result.scalars().first()
    if not p: raise HTTPException(404)
    if body.category_id is not None:
        cat = (await db.execute(
            select(Category).filter_by(id=body.category_id, company_id=current_user.company_id, active=True, deleted=False)
        )).scalars().first()
        if not cat:
            raise HTTPException(400, detail="category_id não pertence à empresa ou não existe")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(p, field, value)
    await db.commit(); await db.refresh(p)
    return _serialize_product(p)

@app.delete(
    "/catalog/products/{product_id}",
    status_code=204,
    tags=["Catálogo"],
    summary="Desativar ou excluir definitivamente um produto",
    responses={404: {"description": "Produto não encontrado"}},
)
async def delete_product(
    product_id: int,
    permanent: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_write_role),
):
    """Por padrão só desativa (`active=False`), reversível via PUT com
    `active: true`. Com `permanent=true`, marca `deleted=True` — ação
    irreversível, nunca mais aparece em nenhuma consulta, mas continua no
    banco (vínculo com vendas já realizadas). Também remove a imagem do bucket."""
    result = await db.execute(select(Product).filter_by(id=product_id, company_id=current_user.company_id, deleted=False))
    p = result.scalars().first()
    if not p: raise HTTPException(404)
    if permanent:
        if p.image_url: delete_object(p.image_url)
        if p.thumbnail_url: delete_object(p.thumbnail_url)
        p.deleted = True
        p.active = False
    else:
        p.active = False
    await db.commit()

def _make_thumbnail(content: bytes, pillow_format: str) -> bytes:
    img = Image.open(io.BytesIO(content))
    img.thumbnail(_THUMBNAIL_SIZE)
    if pillow_format == "JPEG" and img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format=pillow_format)
    return buf.getvalue()

@app.post(
    "/catalog/products/{product_id}/image",
    response_model=ProductOut,
    tags=["Catálogo"],
    summary="Enviar imagem do produto (gera também o thumbnail)",
    responses={
        404: {"description": "Produto não encontrado"},
        400: {"description": "Produto sem categoria — não é possível montar o caminho da imagem"},
        415: {"description": "Formato de arquivo não aceito (só jpg/png)"},
        413: {"description": "Arquivo maior que 2 MB"},
        422: {"description": "Arquivo não é uma imagem válida"},
    },
)
async def upload_product_image_endpoint(
    product_id: int,
    image: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_write_role),
):
    result = await db.execute(select(Product).filter_by(id=product_id, company_id=current_user.company_id, deleted=False))
    p = result.scalars().first()
    if not p: raise HTTPException(404)
    if p.category_id is None:
        raise HTTPException(400, detail="Produto sem categoria — não é possível montar o caminho da imagem")

    ext = _IMAGE_CONTENT_TYPES.get(image.content_type)
    if not ext:
        raise HTTPException(415, detail="Formato de arquivo não aceito — envie jpg ou png")

    content = await image.read()
    if len(content) > _IMAGE_MAX_BYTES:
        raise HTTPException(413, detail=f"Arquivo maior que {_IMAGE_MAX_BYTES // (1024 * 1024)} MB")

    pillow_format = "JPEG" if ext == "jpg" else "PNG"
    try:
        thumb_content = _make_thumbnail(content, pillow_format)
    except Exception:
        raise HTTPException(422, detail="Arquivo não é uma imagem válida")

    # Remove os objetos antigos primeiro pra não deixar lixo órfão no bucket
    # se a extensão trocar (ex: era .png, virou .jpg).
    if p.image_url: delete_object(p.image_url)
    if p.thumbnail_url: delete_object(p.thumbnail_url)

    image_key = upload_product_image(p.category_id, p.id, ext, content)
    thumb_key = upload_product_thumbnail(p.category_id, p.id, ext, thumb_content)
    p.image_url = image_key
    p.thumbnail_url = thumb_key
    await db.commit(); await db.refresh(p)
    return _serialize_product(p)

@app.delete(
    "/catalog/products/{product_id}/image",
    response_model=ProductOut,
    tags=["Catálogo"],
    summary="Remover imagem do produto",
    responses={404: {"description": "Produto não encontrado"}},
)
async def delete_product_image(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_write_role),
):
    result = await db.execute(select(Product).filter_by(id=product_id, company_id=current_user.company_id, deleted=False))
    p = result.scalars().first()
    if not p: raise HTTPException(404)
    if p.image_url: delete_object(p.image_url)
    if p.thumbnail_url: delete_object(p.thumbnail_url)
    p.image_url = None
    p.thumbnail_url = None
    await db.commit(); await db.refresh(p)
    return _serialize_product(p)

@app.get("/health", response_model=HealthOut, tags=["Catálogo"], summary="Healthcheck")
def health(): return {"service": "catalog", "status": "ok"}
