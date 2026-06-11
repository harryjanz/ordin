# services/company/main.py
# Gerencia empresas, usuários e terminais
# Endpoints internos usados pelo auth-service:
#   POST /internal/validate-pin
#   POST /internal/verify-pin
#   POST /internal/verify-credentials

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Column, Integer, String, Boolean, DateTime, select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from datetime import datetime
import bcrypt, secrets
from config import require_env, get_cors_origins
from auth import get_current_user, TokenPayload

DB_URL          = require_env("DB_URL")
INTERNAL_SECRET = require_env("INTERNAL_SECRET")

def require_internal(x_internal_secret: str = Header(default="")) -> None:
    if not secrets.compare_digest(x_internal_secret, INTERNAL_SECRET):
        raise HTTPException(403, detail="Acesso interno não autorizado")

engine = create_async_engine(DB_URL.replace("mysql+pymysql://", "mysql+aiomysql://"), pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase): pass

class Company(Base):
    __tablename__ = "companies"
    id         = Column(Integer, primary_key=True)
    name       = Column(String(120))
    document   = Column(String(20))
    pin_hash   = Column(String(128), nullable=False)
    plan       = Column(String(20), default="free")
    active     = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class User(Base):
    __tablename__ = "users"
    id            = Column(Integer, primary_key=True)
    company_id    = Column(Integer)
    name          = Column(String(80))
    email         = Column(String(120))
    password_hash = Column(String(128))
    role          = Column(String(20), default="cashier")
    active        = Column(Boolean, default=True)
    created_at    = Column(DateTime, default=datetime.utcnow)

class Terminal(Base):
    __tablename__ = "terminals"
    id            = Column(Integer, primary_key=True)
    company_id    = Column(Integer)
    label         = Column(String(80))
    terminal_code = Column(String(20))
    tef_number    = Column(String(40))
    tef_serial    = Column(String(40))
    active        = Column(Boolean, default=True)
    created_at    = Column(DateTime, default=datetime.utcnow)

async def get_db():
    async with AsyncSessionLocal() as db:
        yield db

app = FastAPI(title="Company Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Internal-Secret"],
    allow_credentials=True,
)

# ── Endpoints internos — autenticados por X-Internal-Secret (ORD-003) ─────────

@app.post("/internal/validate-pin")
async def validate_pin(body: dict, db: AsyncSession = Depends(get_db), _: None = Depends(require_internal)):
    # bcrypt não é buscável por índice; iteração é aceitável para piloto (< 100 empresas)
    result = await db.execute(select(Company).filter_by(active=True))
    companies = result.scalars().all()
    co = next((c for c in companies if bcrypt.checkpw(body["pin"].encode(), c.pin_hash.encode())), None)
    if not co: raise HTTPException(401,"PIN inválido")
    return {"company":{"id":co.id,"name":co.name,"plan":co.plan}}

@app.post("/internal/verify-pin")
async def verify_pin(body: dict, db: AsyncSession = Depends(get_db), _: None = Depends(require_internal)):
    result = await db.execute(select(Company).filter_by(active=True))
    companies = result.scalars().all()
    co = next((c for c in companies if bcrypt.checkpw(body["pin"].encode(), c.pin_hash.encode())), None)
    if not co: raise HTTPException(401,"PIN inválido")
    t_result = await db.execute(select(Terminal).filter_by(id=body["terminal_id"],company_id=co.id,active=True))
    t = t_result.scalars().first()
    if not t:  raise HTTPException(404,"Terminal não encontrado")
    return {"company":{"id":co.id,"name":co.name,"plan":co.plan},
            "terminal":{"id":t.id,"label":t.label,"tef_number":t.tef_number}}

@app.post("/internal/verify-credentials")
async def verify_credentials(body: dict, db: AsyncSession = Depends(get_db), _: None = Depends(require_internal)):
    result = await db.execute(select(User).filter_by(email=body["email"],active=True))
    u = result.scalars().first()
    if not u: raise HTTPException(401)
    if not bcrypt.checkpw(body["password"].encode(),u.password_hash.encode()): raise HTTPException(401)
    return {"id":u.id,"company_id":u.company_id,"role":u.role,"name":u.name}

# ── Endpoints protegidos por JWT ───────────────────────────────────────────────

@app.get("/companies/{company_id}/terminals")
async def list_terminals(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    if current_user.company_id != company_id and current_user.role not in ("superadmin",):
        raise HTTPException(403, "Acesso negado")
    result = await db.execute(select(Terminal).filter_by(company_id=company_id,active=True))
    ts = result.scalars().all()
    return {"terminals":[{"id":t.id,"label":t.label,"terminal_code":t.terminal_code,"tef_number":t.tef_number} for t in ts]}

@app.post("/companies/{company_id}/regenerate-pin")
async def regenerate_pin(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    if current_user.company_id != company_id and current_user.role not in ("superadmin",):
        raise HTTPException(403, "Acesso negado")
    co = await db.get(Company, company_id)
    if not co: raise HTTPException(404)
    new_pin = str(secrets.randbelow(900000)+100000)
    co.pin_hash = bcrypt.hashpw(new_pin.encode(), bcrypt.gensalt(12)).decode()
    await db.commit()
    return {"pin":new_pin}

@app.get("/health")
def health(): return {"service":"company","status":"ok"}
