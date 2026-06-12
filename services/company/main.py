from fastapi import FastAPI, HTTPException, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Column, Integer, String, Boolean, DateTime, select, func
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from pydantic import BaseModel
from typing import Optional
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

# ── Access control ────────────────────────────────────────────────────────────

def _require_superadmin(u: TokenPayload) -> None:
    if u.role != "superadmin":
        raise HTTPException(403, "Acesso restrito a super admin")

def _require_company_admin(u: TokenPayload, company_id: int) -> None:
    if u.role == "superadmin":
        return
    if u.company_id != company_id or u.role not in ("owner", "manager"):
        raise HTTPException(403, "Acesso negado")

# ── Schemas ───────────────────────────────────────────────────────────────────

class CompanyOut(BaseModel):
    id: int
    name: str
    document: Optional[str] = None
    plan: str
    active: bool
    created_at: datetime
    model_config = {"from_attributes": True}

class CompanyIn(BaseModel):
    name: str
    document: Optional[str] = None
    plan: str = "free"

class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    document: Optional[str] = None
    plan: Optional[str] = None

class CompanyListOut(BaseModel):
    companies: list[CompanyOut]
    total: int

class CompanyCreateOut(BaseModel):
    company: CompanyOut
    pin: str

class TerminalOut(BaseModel):
    id: int
    label: str
    terminal_code: Optional[str] = None
    tef_number: Optional[str] = None
    tef_serial: Optional[str] = None
    active: bool = True
    model_config = {"from_attributes": True}

class TerminalIn(BaseModel):
    label: str
    terminal_code: Optional[str] = None
    tef_number: Optional[str] = None
    tef_serial: Optional[str] = None

class TerminalUpdate(BaseModel):
    label: Optional[str] = None
    tef_number: Optional[str] = None
    tef_serial: Optional[str] = None

class TerminalListOut(BaseModel):
    terminals: list[TerminalOut]
    total: int

class UserOut(BaseModel):
    id: int
    company_id: int
    name: str
    email: str
    role: str
    active: bool
    created_at: datetime
    model_config = {"from_attributes": True}

class UserIn(BaseModel):
    name: str
    email: str
    password: str
    role: str = "cashier"

class UserUpdate(BaseModel):
    role: Optional[str] = None
    active: Optional[bool] = None

class UserListOut(BaseModel):
    users: list[UserOut]
    total: int

class RegeneratePinOut(BaseModel):
    pin: str

class HealthOut(BaseModel):
    service: str
    status: str

# ── App ───────────────────────────────────────────────────────────────────────

_tags = [
    {"name": "Empresas",  "description": "Gestão de empresas (super admin)."},
    {"name": "Terminais", "description": "Gestão de terminais por empresa (owner/manager)."},
    {"name": "Usuários",  "description": "Gestão de usuários por empresa (owner/manager)."},
]

app = FastAPI(
    title="Ordin — Company Service",
    description=(
        "Serviço de gerenciamento de empresas, usuários e terminais da plataforma Ordin.\n\n"
        "Mantém o cadastro multi-tenant: cada empresa possui seu próprio catálogo, terminais e usuários. "
        "O PIN da empresa é armazenado com **bcrypt rounds=12**.\n\n"
        "Os endpoints `/internal/*` são consumidos exclusivamente pelo `auth-service` via rede interna "
        "(header `X-Internal-Secret`). Eles são bloqueados no Kong e **não aparecem nesta documentação**."
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

# ── Endpoints internos — acessíveis apenas via VPC (ORD-003) ─────────────────

@app.post("/internal/validate-pin", include_in_schema=False)
async def validate_pin(body: dict, db: AsyncSession = Depends(get_db), _: None = Depends(require_internal)):
    # bcrypt não é buscável por índice; iteração é aceitável para piloto (< 100 empresas)
    result = await db.execute(select(Company).filter_by(active=True))
    companies = result.scalars().all()
    co = next((c for c in companies if bcrypt.checkpw(body["pin"].encode(), c.pin_hash.encode())), None)
    if not co: raise HTTPException(401, "PIN inválido")
    return {"company": {"id": co.id, "name": co.name, "plan": co.plan}}

@app.post("/internal/verify-pin", include_in_schema=False)
async def verify_pin(body: dict, db: AsyncSession = Depends(get_db), _: None = Depends(require_internal)):
    result = await db.execute(select(Company).filter_by(active=True))
    companies = result.scalars().all()
    co = next((c for c in companies if bcrypt.checkpw(body["pin"].encode(), c.pin_hash.encode())), None)
    if not co: raise HTTPException(401, "PIN inválido")
    t_result = await db.execute(select(Terminal).filter_by(id=body["terminal_id"], company_id=co.id, active=True))
    t = t_result.scalars().first()
    if not t: raise HTTPException(404, "Terminal não encontrado")
    return {
        "company":  {"id": co.id, "name": co.name, "plan": co.plan},
        "terminal": {"id": t.id, "label": t.label, "tef_number": t.tef_number},
    }

@app.post("/internal/verify-credentials", include_in_schema=False)
async def verify_credentials(body: dict, db: AsyncSession = Depends(get_db), _: None = Depends(require_internal)):
    result = await db.execute(select(User).filter_by(email=body["email"], active=True))
    u = result.scalars().first()
    if not u: raise HTTPException(401)
    if not bcrypt.checkpw(body["password"].encode(), u.password_hash.encode()): raise HTTPException(401)
    return {"id": u.id, "company_id": u.company_id, "role": u.role, "name": u.name}

# ── Empresas (super admin) ────────────────────────────────────────────────────

@app.get("/companies", response_model=CompanyListOut, tags=["Empresas"], summary="Listar empresas")
async def list_companies(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_superadmin(current_user)
    total = (await db.execute(select(func.count()).select_from(Company).where(Company.active == True))).scalar()
    result = await db.execute(select(Company).where(Company.active == True).offset(skip).limit(limit))
    return {"companies": result.scalars().all(), "total": total}

@app.post("/companies", response_model=CompanyCreateOut, status_code=201, tags=["Empresas"], summary="Criar empresa")
async def create_company(
    body: CompanyIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_superadmin(current_user)
    pin = str(secrets.randbelow(900000) + 100000)
    co = Company(
        name=body.name,
        document=body.document,
        plan=body.plan,
        pin_hash=bcrypt.hashpw(pin.encode(), bcrypt.gensalt(12)).decode(),
    )
    db.add(co)
    await db.commit()
    await db.refresh(co)
    return {"company": co, "pin": pin}

@app.get("/companies/{company_id}", response_model=CompanyOut, tags=["Empresas"], summary="Detalhe da empresa")
async def get_company(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_superadmin(current_user)
    co = await db.get(Company, company_id)
    if not co or not co.active: raise HTTPException(404, "Empresa não encontrada")
    return co

@app.put("/companies/{company_id}", response_model=CompanyOut, tags=["Empresas"], summary="Editar empresa")
async def update_company(
    company_id: int,
    body: CompanyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_superadmin(current_user)
    co = await db.get(Company, company_id)
    if not co or not co.active: raise HTTPException(404, "Empresa não encontrada")
    if body.name is not None: co.name = body.name
    if body.document is not None: co.document = body.document
    if body.plan is not None: co.plan = body.plan
    await db.commit()
    await db.refresh(co)
    return co

@app.delete("/companies/{company_id}", status_code=204, tags=["Empresas"], summary="Desativar empresa")
async def delete_company(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_superadmin(current_user)
    co = await db.get(Company, company_id)
    if not co or not co.active: raise HTTPException(404, "Empresa não encontrada")
    co.active = False
    await db.commit()

@app.post(
    "/companies/{company_id}/regenerate-pin",
    response_model=RegeneratePinOut,
    tags=["Empresas"],
    summary="Regenerar PIN da empresa",
    responses={403: {"description": "Acesso negado"}, 404: {"description": "Empresa não encontrada"}},
)
async def regenerate_pin(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    if current_user.company_id != company_id and current_user.role not in ("superadmin",):
        raise HTTPException(403, "Acesso negado")
    co = await db.get(Company, company_id)
    if not co or not co.active: raise HTTPException(404, "Empresa não encontrada")
    new_pin = str(secrets.randbelow(900000) + 100000)
    co.pin_hash = bcrypt.hashpw(new_pin.encode(), bcrypt.gensalt(12)).decode()
    await db.commit()
    return {"pin": new_pin}

# ── Terminais (owner/manager da empresa) ─────────────────────────────────────

@app.get(
    "/companies/{company_id}/terminals",
    response_model=TerminalListOut,
    tags=["Terminais"],
    summary="Listar terminais da empresa",
)
async def list_terminals(
    company_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    total = (await db.execute(
        select(func.count()).select_from(Terminal).where(Terminal.company_id == company_id, Terminal.active == True)
    )).scalar()
    result = await db.execute(
        select(Terminal).where(Terminal.company_id == company_id, Terminal.active == True).offset(skip).limit(limit)
    )
    return {"terminals": result.scalars().all(), "total": total}

@app.post(
    "/companies/{company_id}/terminals",
    response_model=TerminalOut,
    status_code=201,
    tags=["Terminais"],
    summary="Criar terminal",
)
async def create_terminal(
    company_id: int,
    body: TerminalIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    co = await db.get(Company, company_id)
    if not co or not co.active: raise HTTPException(404, "Empresa não encontrada")
    terminal_code = body.terminal_code or f"T{company_id}{secrets.token_hex(3).upper()}"
    t = Terminal(
        company_id=company_id,
        label=body.label,
        terminal_code=terminal_code,
        tef_number=body.tef_number,
        tef_serial=body.tef_serial,
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t

@app.put(
    "/companies/{company_id}/terminals/{terminal_id}",
    response_model=TerminalOut,
    tags=["Terminais"],
    summary="Editar terminal",
)
async def update_terminal(
    company_id: int,
    terminal_id: int,
    body: TerminalUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    result = await db.execute(select(Terminal).filter_by(id=terminal_id, company_id=company_id, active=True))
    t = result.scalars().first()
    if not t: raise HTTPException(404, "Terminal não encontrado")
    if body.label is not None: t.label = body.label
    if body.tef_number is not None: t.tef_number = body.tef_number
    if body.tef_serial is not None: t.tef_serial = body.tef_serial
    await db.commit()
    await db.refresh(t)
    return t

@app.delete(
    "/companies/{company_id}/terminals/{terminal_id}",
    status_code=204,
    tags=["Terminais"],
    summary="Desativar terminal",
)
async def delete_terminal(
    company_id: int,
    terminal_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    result = await db.execute(select(Terminal).filter_by(id=terminal_id, company_id=company_id, active=True))
    t = result.scalars().first()
    if not t: raise HTTPException(404, "Terminal não encontrado")
    t.active = False
    await db.commit()

# ── Usuários (owner/manager da empresa) ──────────────────────────────────────

@app.get(
    "/companies/{company_id}/users",
    response_model=UserListOut,
    tags=["Usuários"],
    summary="Listar usuários da empresa",
)
async def list_users(
    company_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    total = (await db.execute(
        select(func.count()).select_from(User).where(User.company_id == company_id, User.active == True)
    )).scalar()
    result = await db.execute(
        select(User).where(User.company_id == company_id, User.active == True).offset(skip).limit(limit)
    )
    return {"users": result.scalars().all(), "total": total}

@app.post(
    "/companies/{company_id}/users",
    response_model=UserOut,
    status_code=201,
    tags=["Usuários"],
    summary="Criar usuário",
)
async def create_user(
    company_id: int,
    body: UserIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    if body.role == "owner" and current_user.role == "manager":
        raise HTTPException(403, "Manager não pode criar usuários com role owner")
    co = await db.get(Company, company_id)
    if not co or not co.active: raise HTTPException(404, "Empresa não encontrada")
    existing = (await db.execute(select(User).filter_by(email=body.email))).scalars().first()
    if existing: raise HTTPException(409, "E-mail já cadastrado")
    u = User(
        company_id=company_id,
        name=body.name,
        email=body.email,
        password_hash=bcrypt.hashpw(body.password.encode(), bcrypt.gensalt(12)).decode(),
        role=body.role,
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u

@app.put(
    "/companies/{company_id}/users/{user_id}",
    response_model=UserOut,
    tags=["Usuários"],
    summary="Editar usuário (role / ativo)",
)
async def update_user(
    company_id: int,
    user_id: int,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    result = await db.execute(select(User).filter_by(id=user_id, company_id=company_id))
    u = result.scalars().first()
    if not u: raise HTTPException(404, "Usuário não encontrado")
    if body.role is not None:
        if str(u.id) == current_user.sub and u.role != body.role:
            raise HTTPException(403, "Owner não pode alterar o próprio role")
        if body.role == "owner" and current_user.role == "manager":
            raise HTTPException(403, "Manager não pode promover usuário a owner")
        u.role = body.role
    if body.active is not None:
        u.active = body.active
    await db.commit()
    await db.refresh(u)
    return u

@app.delete(
    "/companies/{company_id}/users/{user_id}",
    status_code=204,
    tags=["Usuários"],
    summary="Desativar usuário",
)
async def delete_user(
    company_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    result = await db.execute(select(User).filter_by(id=user_id, company_id=company_id, active=True))
    u = result.scalars().first()
    if not u: raise HTTPException(404, "Usuário não encontrado")
    if str(u.id) == current_user.sub:
        raise HTTPException(403, "Não é possível desativar o próprio usuário")
    u.active = False
    await db.commit()

# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthOut, tags=["Empresas"], summary="Healthcheck")
def health(): return {"service": "company", "status": "ok"}
