# services/auth/main.py
# Rate limiting progressivo via Redis
# JWT access token (60 min) + refresh token (7 dias)
# Endpoints: /auth/login  /auth/pin-login  /auth/validate-pin  /auth/refresh  /auth/logout

from fastapi import FastAPI, HTTPException, Depends, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Column, Integer, String, Boolean, DateTime, select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from pydantic import BaseModel
from datetime import datetime, timedelta
from jose import jwt, JWTError
import hashlib, os, redis, httpx
from config import require_env, get_cors_origins

redis_client = redis.from_url(require_env("REDIS_URL"), decode_responses=True)
RATE_MAX = 5
RATE_TTL = 15 * 60  # 15 minutos

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

DB_URL = require_env("DB_URL")
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

SECRET           = require_env("JWT_SECRET")
ALGO             = "HS256"
ACCESS_EX        = int(os.getenv("JWT_ACCESS_EXP_MINUTES", 60))
COMPANY_SVC      = require_env("COMPANY_SERVICE_URL")
INTERNAL_SECRET  = require_env("INTERNAL_SECRET")
INTERNAL_HEADERS = {"X-Internal-Secret": INTERNAL_SECRET}

app = FastAPI(title="Auth Service")
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

class LoginReq(BaseModel): email: str; password: str
class PinLoginReq(BaseModel): pin: str; terminal_id: int
class ValidatePinReq(BaseModel): pin: str
class RefreshReq(BaseModel): refresh_token: str

@app.post("/auth/validate-pin")
async def validate_pin(body: ValidatePinReq, request: Request, response: Response):
    check_rate_limit(request.client.host, body.pin, response)
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{COMPANY_SVC}/internal/validate-pin", json={"pin": body.pin}, headers=INTERNAL_HEADERS)
    if r.status_code != 200: raise HTTPException(401, "PIN inválido")
    reset_rate_limit(request.client.host, body.pin)
    return {"ok": True, "company": r.json()["company"]}

@app.post("/auth/pin-login")
async def pin_login(body: PinLoginReq, request: Request, response: Response):
    check_rate_limit(request.client.host, body.pin, response)
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{COMPANY_SVC}/internal/verify-pin",
                         json={"pin": body.pin, "terminal_id": body.terminal_id},
                         headers=INTERNAL_HEADERS)
    if r.status_code != 200: raise HTTPException(401, "PIN ou terminal inválido")
    reset_rate_limit(request.client.host, body.pin)
    data = r.json()
    token = make_token({"sub":"0","company":data["company"]["id"],"terminal":data["terminal"]["id"],"role":"kiosk"}, timedelta(hours=12))
    return {"ok":True,"access_token":token,"token_type":"bearer","company":data["company"],"terminal":data["terminal"]}

@app.post("/auth/login")
async def login(body: LoginReq, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    check_rate_limit(request.client.host, body.email, response)
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{COMPANY_SVC}/internal/verify-credentials", json={"email":body.email,"password":body.password}, headers=INTERNAL_HEADERS)
    if r.status_code != 200: raise HTTPException(401, "Credenciais inválidas")
    reset_rate_limit(request.client.host, body.email)
    u = r.json()
    access  = make_token({"sub":str(u["id"]),"company":u["company_id"],"role":u["role"]}, timedelta(minutes=ACCESS_EX))
    refresh = make_token({"sub":str(u["id"]),"type":"refresh","company":u["company_id"],"role":u["role"]}, timedelta(days=7))
    db.add(RefreshToken(user_id=u["id"],token_hash=hash_tok(refresh),expires_at=datetime.utcnow()+timedelta(days=7)))
    await db.commit()
    return {"access_token":access,"refresh_token":refresh,"token_type":"bearer"}

@app.post("/auth/refresh")
async def refresh(body: RefreshReq, db: AsyncSession = Depends(get_db)):
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

@app.post("/auth/logout")
async def logout(body: RefreshReq, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == hash_tok(body.refresh_token)))
    tok = result.scalars().first()
    if tok:
        tok.revoked = True
        await db.commit()
    return {"detail":"Logout realizado"}

@app.get("/health")
def health():
    try: redis_ok = redis_client.ping()
    except: redis_ok = False
    return {"service":"auth","status":"ok","redis":redis_ok}
