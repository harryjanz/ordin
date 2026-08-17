from fastapi import FastAPI, HTTPException, Depends, Request, Response, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Column, Integer, String, Boolean, DateTime, select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from pydantic import BaseModel
from typing import Optional, Union
from datetime import datetime, timedelta
from jose import jwt, JWTError
import hashlib, json, os, secrets, redis, httpx, string
from config import require_env, get_cors_origins
from audit import emit_audit

redis_client = redis.from_url(require_env("REDIS_URL"), decode_responses=True)
RATE_MAX             = 5
RATE_TTL             = 15 * 60
DEVICE_CHALLENGE_TTL = 300
DEVICE_APPROVED_TTL  = 60
ADMIN_BASE_URL       = os.getenv("ADMIN_BASE_URL", "http://localhost:3001")
_CHARSET             = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sem I/O/0/1

def check_rate_limit(ip, key, response):
    bk = f"pin_blocked:{ip}"
    ttl = redis_client.ttl(bk)
    if ttl > 0:
        response.headers["X-RateLimit-Blocked"] = "true"
        response.headers["X-RateLimit-Reset-In"] = str(ttl)
        raise HTTPException(429, f"Bloqueado. Tente em {ttl//60}min {ttl%60}s.")
    rk = f"pin_attempts:{ip}:{hashlib.md5(key.encode()).hexdigest()}"
    attempts = redis_client.incr(rk)
    if attempts == 1: redis_client.expire(rk, RATE_TTL)
    remaining = max(0, RATE_MAX - attempts)
    response.headers["X-RateLimit-Attempts-Remaining"] = str(remaining)
    if attempts >= RATE_MAX:
        redis_client.set(bk, "1", ex=RATE_TTL)
        redis_client.delete(rk)
        raise HTTPException(429, f"IP bloqueado por {RATE_TTL//60} minutos.")

def reset_rate_limit(ip, key):
    redis_client.delete(f"pin_attempts:{ip}:{hashlib.md5(key.encode()).hexdigest()}")
    redis_client.delete(f"pin_blocked:{ip}")

DB_URL           = require_env("DB_URL")
SECRET           = require_env("JWT_SECRET")
ALGO             = "HS256"
ACCESS_EX        = int(os.getenv("JWT_ACCESS_EXP_MINUTES", 60))
COMPANY_SVC      = require_env("COMPANY_SERVICE_URL")
INTERNAL_SECRET  = require_env("INTERNAL_SECRET")
INTERNAL_HEADERS = {"X-Internal-Secret": INTERNAL_SECRET}

engine = create_async_engine(DB_URL.replace("mysql+pymysql://", "mysql+aiomysql://"), pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase): pass

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, index=True)
    token_hash = Column(String(64), unique=True)
    revoked    = Column(Boolean, default=False)
    expires_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

async def get_db():
    async with AsyncSessionLocal() as db:
        yield db

# ── Request schemas ───────────────────────────────────────────────────────────

class LoginReq(BaseModel):
    email: str
    password: str

class PinLoginReq(BaseModel):
    pin: str
    terminal_id: int

class ValidatePinReq(BaseModel):
    pin: str

class RefreshReq(BaseModel):
    refresh_token: str

class MfaVerifyReq(BaseModel):
    mfa_token: str
    code: str
    trust_device: bool = False

# ── Response schemas ──────────────────────────────────────────────────────────

class CompanyInfo(BaseModel):
    id: int
    name: str
    plan: str
    visual_theme: str = "ordin"
    visual_mode: str = "light"

class TerminalInfo(BaseModel):
    id: int
    label: str
    tef_number: Optional[str] = None

class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    # ORD-092: presente só quando o login terminou com "confiar neste
    # dispositivo" marcado — frontend guarda numa chave de localStorage à
    # parte, que sobrevive a logout (é sobre o navegador, não a sessão).
    device_token: Optional[str] = None

class MfaRequiredOut(BaseModel):
    # ORD-088: retornado no lugar de TokenOut quando o usuário tem TOTP ativo
    # ("verify") ou a empresa exige e ele ainda não configurou ("setup_required").
    # mfa_token é de escopo restrito (type="mfa_pending", 10min) — não serve
    # como token de acesso em nenhum endpoint autenticado normal.
    mfa_required: bool = True
    mfa_status: str
    mfa_token: str

class KioskTokenOut(BaseModel):
    ok: bool
    access_token: str
    token_type: str
    company: CompanyInfo
    terminal: TerminalInfo

class AvailableTerminalInfo(BaseModel):
    id: int
    label: str
    terminal_code: Optional[str] = None
    tef_number: Optional[str] = None

class ValidatePinOut(BaseModel):
    ok: bool
    company: CompanyInfo
    terminals: list[AvailableTerminalInfo] = []

class MessageOut(BaseModel):
    detail: str

class HealthOut(BaseModel):
    service: str
    status: str
    redis: bool

class DeviceChallengeOut(BaseModel):
    code: str
    qr_url: str
    expires_in: int

class DeviceStatusOut(BaseModel):
    status: str
    access_token: Optional[str] = None
    token_type: Optional[str] = None
    company: Optional[CompanyInfo] = None
    terminal: Optional[TerminalInfo] = None

# ── App ───────────────────────────────────────────────────────────────────────

_tags = [
    {
        "name": "Autenticação",
        "description": (
            "Login de administradores/operadores (email + senha) e totens (PIN + terminal). "
            "Refresh token com rotação e blacklist via Redis."
        ),
    },
]

app = FastAPI(
    title="Ordin — Auth Service",
    description=(
        "Serviço de autenticação da plataforma Ordin.\n\n"
        "Emite JWTs com `role` (`admin`, `cashier`, `kiosk`) e `company_id` "
        "extraído das credenciais. Todos os demais serviços validam o token JWT "
        "gerado aqui.\n\n"
        "**Rate limiting:** 5 tentativas erradas de PIN bloqueiam o IP por 15 minutos.\n\n"
        "**Tokens:**\n"
        "- `admin` / `cashier`: access 15 min + refresh 7 dias (com rotação)\n"
        "- `kiosk`: access 4 horas, sem refresh"
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

def make_token(payload, delta):
    return jwt.encode({**payload, "exp": datetime.utcnow()+delta}, SECRET, algorithm=ALGO)

def hash_tok(t): return hashlib.sha256(t.encode()).hexdigest()

@app.post(
    "/auth/validate-pin",
    response_model=ValidatePinOut,
    tags=["Autenticação"],
    summary="Validar PIN da empresa",
    responses={
        401: {"description": "PIN inválido"},
        429: {"description": "Rate limit atingido — IP bloqueado"},
    },
)
async def validate_pin(body: ValidatePinReq, request: Request, response: Response):
    """Valida o PIN de uma empresa sem gerar token. Usado pelo frontend para feedback antes de selecionar terminal."""
    check_rate_limit(request.client.host, body.pin, response)
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{COMPANY_SVC}/internal/validate-pin", json={"pin": body.pin}, headers=INTERNAL_HEADERS)
    if r.status_code != 200: raise HTTPException(401, "PIN inválido")
    reset_rate_limit(request.client.host, body.pin)
    data = r.json()
    return {"ok": True, "company": data["company"], "terminals": data.get("terminals", [])}

@app.post(
    "/auth/pin-login",
    response_model=KioskTokenOut,
    tags=["Autenticação"],
    summary="Login de totem via PIN",
    responses={
        401: {"description": "PIN ou terminal inválido"},
        429: {"description": "Rate limit atingido — IP bloqueado"},
    },
)
async def pin_login(body: PinLoginReq, request: Request, response: Response):
    """Login para totens de autoatendimento. Retorna JWT com `role: kiosk` e validade de 4 horas (sem refresh)."""
    check_rate_limit(request.client.host, body.pin, response)
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{COMPANY_SVC}/internal/verify-pin",
                         json={"pin": body.pin, "terminal_id": body.terminal_id},
                         headers=INTERNAL_HEADERS)
    if r.status_code != 200:
        emit_audit("pin_login_failure", request,
                   actor=f"terminal-{body.terminal_id}", actor_id=None, company_id=None,
                   result="failure", detail={"terminal_id": body.terminal_id})
        raise HTTPException(401, "PIN ou terminal inválido")
    reset_rate_limit(request.client.host, body.pin)
    data = r.json()
    emit_audit("pin_login_success", request,
               actor=f"terminal-{body.terminal_id}", actor_id=body.terminal_id,
               company_id=data["company"]["id"], result="success",
               detail={"terminal_id": body.terminal_id})
    token = make_token({"sub":"0","company":data["company"]["id"],"terminal":data["terminal"]["id"],"role":"kiosk"}, timedelta(hours=12))
    return {"ok":True,"access_token":token,"token_type":"bearer","company":data["company"],"terminal":data["terminal"]}

async def _issue_login_tokens(u: dict, request: Request, actor: str, db: AsyncSession, device_token: str | None = None) -> dict:
    access  = make_token({"sub":str(u["id"]),"company":u["company_id"],"role":u["role"]}, timedelta(minutes=ACCESS_EX))
    refresh = make_token({"sub":str(u["id"]),"type":"refresh","company":u["company_id"],"role":u["role"]}, timedelta(days=7))
    db.add(RefreshToken(user_id=u["id"],token_hash=hash_tok(refresh),expires_at=datetime.utcnow()+timedelta(days=7)))
    await db.commit()
    emit_audit("login_success", request,
               actor=actor, actor_id=u["id"], company_id=u["company_id"], result="success")
    return {"access_token":access,"refresh_token":refresh,"token_type":"bearer","device_token":device_token}


@app.post(
    "/auth/login",
    response_model=Union[TokenOut, MfaRequiredOut],
    tags=["Autenticação"],
    summary="Login de administrador ou operador",
    responses={
        401: {"description": "Credenciais inválidas"},
        429: {"description": "Rate limit atingido"},
    },
)
async def login(
    body: LoginReq, request: Request, response: Response, db: AsyncSession = Depends(get_db),
    x_device_trust: str | None = Header(None, alias="X-Device-Trust"),
):
    """Login com email + senha para roles `admin`/`owner`/`manager`/`cashier`. Retorna access token + refresh
    token com rotação — ou, se o usuário já tiver duplo fator ativo ou a empresa exigir (ORD-088), um
    `mfa_token` temporário em vez dos tokens finais (ver `POST /auth/login/mfa-verify`). O header
    `X-Device-Trust` (ORD-092), quando presente e reconhecido, pula o segundo fator mesmo assim."""
    check_rate_limit(request.client.host, body.email, response)
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{COMPANY_SVC}/internal/verify-credentials", json={"email":body.email,"password":body.password}, headers=INTERNAL_HEADERS)
    if r.status_code != 200:
        emit_audit("login_failure", request,
                   actor=body.email, actor_id=None, company_id=None, result="failure")
        raise HTTPException(401, "Credenciais inválidas")
    reset_rate_limit(request.client.host, body.email)
    u = r.json()
    mfa_status = u.get("mfa_status", "none")
    if mfa_status != "none" and x_device_trust:
        async with httpx.AsyncClient() as c:
            tr = await c.post(
                f"{COMPANY_SVC}/internal/verify-trusted-device",
                json={"email": body.email, "device_token": x_device_trust},
                headers=INTERNAL_HEADERS,
            )
        if tr.status_code == 200 and tr.json().get("trusted"):
            return await _issue_login_tokens(u, request, body.email, db)
    if mfa_status != "none":
        mfa_token = make_token(
            {"sub": str(u["id"]), "company": u["company_id"], "role": u["role"], "type": "mfa_pending"},
            timedelta(minutes=10),
        )
        emit_audit("login_mfa_required", request,
                   actor=body.email, actor_id=u["id"], company_id=u["company_id"], result="pending",
                   detail={"mfa_status": mfa_status})
        return {"mfa_required": True, "mfa_status": mfa_status, "mfa_token": mfa_token}
    return await _issue_login_tokens(u, request, body.email, db)


@app.post(
    "/auth/login/mfa-verify",
    response_model=TokenOut,
    tags=["Autenticação"],
    summary="Concluir login com o segundo fator (código TOTP ou de backup)",
    responses={
        401: {"description": "Código inválido, ou mfa_token inválido/expirado"},
        429: {"description": "Rate limit atingido"},
    },
)
async def login_mfa_verify(body: MfaVerifyReq, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """Segundo passo do login quando `/auth/login` retornou `mfa_required`. Aceita tanto o código de 6
    dígitos do app autenticador quanto um dos códigos de backup. Rate limit por tentativa igual ao do PIN."""
    check_rate_limit(request.client.host, body.mfa_token, response)
    try:
        payload = jwt.decode(body.mfa_token, SECRET, algorithms=[ALGO])
    except JWTError:
        raise HTTPException(401, "mfa_token inválido ou expirado")
    if payload.get("type") != "mfa_pending":
        raise HTTPException(401, "mfa_token inválido")
    user_id = int(payload["sub"])
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{COMPANY_SVC}/internal/verify-totp",
            json={"user_id": user_id, "code": body.code},
            headers=INTERNAL_HEADERS,
        )
    if r.status_code != 200:
        emit_audit("login_mfa_failure", request,
                   actor=f"user-{user_id}", actor_id=user_id, company_id=payload.get("company"), result="failure")
        raise HTTPException(401, "Código inválido")
    reset_rate_limit(request.client.host, body.mfa_token)
    u = {"id": user_id, "company_id": payload.get("company"), "role": payload.get("role")}
    device_token = None
    if body.trust_device:
        async with httpx.AsyncClient() as c:
            dr = await c.post(
                f"{COMPANY_SVC}/internal/trust-device",
                json={"user_id": user_id, "device_label": request.headers.get("user-agent", "")},
                headers=INTERNAL_HEADERS,
            )
        if dr.status_code == 200:
            device_token = dr.json()["device_token"]
    return await _issue_login_tokens(u, request, f"user-{user_id}", db, device_token=device_token)

@app.post(
    "/auth/refresh",
    response_model=TokenOut,
    tags=["Autenticação"],
    summary="Renovar access token",
    responses={401: {"description": "Token revogado ou expirado"}},
)
async def refresh(body: RefreshReq, db: AsyncSession = Depends(get_db)):
    """Rotaciona o refresh token: invalida o token atual e emite um novo par access + refresh."""
    result = await db.execute(select(RefreshToken).where(
        RefreshToken.token_hash == hash_tok(body.refresh_token),
        RefreshToken.revoked == False
    ))
    stored = result.scalars().first()
    if not stored:
        raise HTTPException(401, detail="Token revogado ou inválido")
    if stored.expires_at < datetime.utcnow():
        stored.revoked = True; await db.commit()
        raise HTTPException(401, detail="Token revogado ou inválido")
    try:
        payload = jwt.decode(body.refresh_token, SECRET, algorithms=[ALGO])
        if payload.get("type") != "refresh":
            raise HTTPException(401, detail="Token revogado ou inválido")
        user_id    = int(payload["sub"])
        company_id = payload.get("company")
        role       = payload.get("role", "cashier")
    except JWTError:
        raise HTTPException(401, detail="Token revogado ou inválido")
    stored.revoked = True; await db.flush()
    new_access  = make_token({"sub":str(user_id),"company":company_id,"role":role}, timedelta(minutes=ACCESS_EX))
    new_refresh = make_token({"sub":str(user_id),"type":"refresh","company":company_id,"role":role}, timedelta(days=7))
    db.add(RefreshToken(user_id=user_id, token_hash=hash_tok(new_refresh),
                        expires_at=datetime.utcnow()+timedelta(days=7)))
    await db.commit()
    return {"access_token":new_access,"refresh_token":new_refresh,"token_type":"bearer"}

@app.post(
    "/auth/logout",
    response_model=MessageOut,
    tags=["Autenticação"],
    summary="Logout — revogar refresh token",
)
async def logout(body: RefreshReq, request: Request, db: AsyncSession = Depends(get_db)):
    """Revoga o refresh token informado. O access token expira naturalmente no TTL."""
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == hash_tok(body.refresh_token)))
    tok = result.scalars().first()
    if tok:
        tok.revoked = True
        await db.commit()
    try:
        payload = jwt.decode(body.refresh_token, SECRET, algorithms=[ALGO], options={"verify_exp": False})
        actor = payload.get("sub")
        company_id = payload.get("company")
    except Exception:
        actor = None
        company_id = None
    emit_audit("logout", request,
               actor=actor, actor_id=int(actor) if actor else None,
               company_id=company_id, result="success")
    return {"detail":"Logout realizado"}

@app.post(
    "/auth/device/challenge",
    response_model=DeviceChallengeOut,
    tags=["Autenticação"],
    summary="Gerar código de pareamento para totem",
)
async def device_challenge():
    """Gera um código de 6 caracteres + QR URL para parear o totem sem PIN."""
    code = "".join(secrets.choice(_CHARSET) for _ in range(6))
    redis_client.set(f"device_challenge:{code}", json.dumps({"status": "pending"}), ex=DEVICE_CHALLENGE_TTL)
    return DeviceChallengeOut(
        code=code,
        qr_url=f"{ADMIN_BASE_URL}/pair?code={code}",
        expires_in=DEVICE_CHALLENGE_TTL,
    )


@app.get(
    "/auth/device/status",
    response_model=DeviceStatusOut,
    tags=["Autenticação"],
    summary="Verificar status do pareamento",
)
async def device_status(code: str = Query(..., description="Código de 6 caracteres")):
    """Polling pelo totem. Retorna pending/approved/expired. Quando approved, gera JWT e consome o código."""
    raw = redis_client.get(f"device_challenge:{code.upper()}")
    if not raw:
        return DeviceStatusOut(status="expired")
    data = json.loads(raw)
    if data["status"] == "pending":
        return DeviceStatusOut(status="pending")
    co   = data["company"]
    term = data["terminal"]
    token = make_token(
        {"sub": "0", "company": co["id"], "terminal": term["id"], "role": "kiosk"},
        timedelta(hours=12),
    )
    redis_client.delete(f"device_challenge:{code.upper()}")
    return DeviceStatusOut(
        status="approved",
        access_token=token,
        token_type="bearer",
        company=CompanyInfo(**co),
        terminal=TerminalInfo(**term),
    )


@app.get("/health", response_model=HealthOut, tags=["Autenticação"], summary="Healthcheck")
def health():
    try: redis_ok = redis_client.ping()
    except: redis_ok = False
    return {"service":"auth","status":"ok","redis":redis_ok}
