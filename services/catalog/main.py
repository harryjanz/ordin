# services/catalog/main.py
# Serviço de catálogo de produtos

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Column, Integer, String, Numeric, Boolean, DateTime, ForeignKey, select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from config import require_env, get_cors_origins
from auth import get_current_user, TokenPayload

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
    created_at = Column(DateTime, default=datetime.utcnow)

class Product(Base):
    __tablename__ = "products"
    id          = Column(Integer, primary_key=True)
    company_id  = Column(Integer, nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"))
    name        = Column(String(120), nullable=False)
    description = Column(String(500))
    price       = Column(Numeric(10, 2), nullable=False)
    image_url   = Column(String(500))
    active      = Column(Boolean, default=True)
    created_at  = Column(DateTime, default=datetime.utcnow)

async def get_db():
    async with AsyncSessionLocal() as db:
        yield db

app = FastAPI(title="Catalog Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Internal-Secret"],
    allow_credentials=True,
)

@app.get("/catalog/categories")
async def list_categories(
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    result = await db.execute(select(Category).filter_by(company_id=current_user.company_id, active=True))
    cats = result.scalars().all()
    return {"categories": [{"id": c.id, "name": c.name} for c in cats]}

@app.get("/catalog/products")
async def list_products(
    category_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    q = select(Product).filter_by(company_id=current_user.company_id, active=True)
    if category_id:
        q = q.filter_by(category_id=category_id)
    result = await db.execute(q)
    products = result.scalars().all()
    return {"products": [{"id": p.id, "category_id": p.category_id, "name": p.name,
                          "description": p.description, "price": float(p.price),
                          "image_url": p.image_url} for p in products]}

@app.get("/catalog/products/{product_id}")
async def get_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    result = await db.execute(select(Product).filter_by(id=product_id, company_id=current_user.company_id))
    p = result.scalars().first()
    if not p: raise HTTPException(404)
    return {"id": p.id, "name": p.name, "description": p.description,
            "price": float(p.price), "image_url": p.image_url}

@app.get("/health")
def health(): return {"service": "catalog", "status": "ok"}
