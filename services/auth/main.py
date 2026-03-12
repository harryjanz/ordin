# services/auth/main.py
# Rate limiting progressivo via Redis
# JWT access token (60 min) + refresh token (7 dias)
# Endpoints: /auth/login  /auth/pin-login  /auth/validate-pin  /auth/refresh  /auth/logout

from fastapi import FastAPI, HTTPException, Depends, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import sessionmaker, DeclarativeBase, Session
from pydantic import BaseModel
from datetime import datetime, timedelta
from jose import jwt, JWTError
import hashlib, os, redis, httpx

redis_client = redis.from_url(os.getenv("REDIS_URL","redis://redis:6379/0"), decode_responses=True)
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

DB_URL = f"mysql+pymysql://fk_auth:auth_pass@{os.getenv('DB_HOST','mysql')}:3306/fk_auth?charset=utf8mb4"
engine = create_engine(DB_URL, pool_pre_ping=True)

class Base(DeclarativeBase): pass

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, index=True)
    token_hash = Column(String(64), unique=True)
    revoked    = Column(Boolean, default=False)
    expires_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(engine)
SessionLocal = sessionmaker(bind=engine)
def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

SECRET    = os.getenv("JWT_SECRET", "dev-secret")
ALGO      = "HS256"
ACCESS_EX = int(os.getenv("JWT_ACCESS_EXP_MINUTES", 60))
COMPANY_SVC = os.getenv("COMPANY_SERVICE_URL", "http://company-service:8002")

app = FastAPI(title="Auth Service")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

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
        r = await c.post(f"{COMPANY_SVC}/internal/validate-pin", json={"pin": body.pin})
    if r.status_code != 200: raise HTTPException(401, "PIN inválido")
    reset_rate_limit(request.client.host, body.pin)
    return {"ok": True, "company": r.json()["company"]}

@app.post("/auth/pin-login")
async def pin_login(body: PinLoginReq, request: Request, response: Response):
    check_rate_limit(request.client.host, body.pin, response)
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{COMPANY_SVC}/internal/verify-pin",
                         json={"pin": body.pin, "terminal_id": body.terminal_id})
    if r.status_code != 200: raise HTTPException(401, "PIN ou terminal inválido")
    reset_rate_limit(request.client.host, body.pin)
    data = r.json()
    token = make_token({"sub":"0","company":data["company"]["id"],"terminal":data["terminal"]["id"],"role":"kiosk"}, timedelta(hours=12))
    return {"ok":True,"access_token":token,"token_type":"bearer","company":data["company"],"terminal":data["terminal"]}

@app.post("/auth/login")
async def login(body: LoginReq, request: Request, response: Response, db: Session = Depends(get_db)):
    check_rate_limit(request.client.host, body.email, response)
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{COMPANY_SVC}/internal/verify-credentials", json={"email":body.email,"password":body.password})
    if r.status_code != 200: raise HTTPException(401, "Credenciais inválidas")
    reset_rate_limit(request.client.host, body.email)
    u = r.json()
    access  = make_token({"sub":str(u["id"]),"company":u["company_id"],"role":u["role"]}, timedelta(minutes=ACCESS_EX))
    refresh = make_token({"sub":str(u["id"]),"type":"refresh"}, timedelta(days=7))
    db.add(RefreshToken(user_id=u["id"],token_hash=hash_tok(refresh),expires_at=datetime.utcnow()+timedelta(days=7)))
    db.commit()
    return {"access_token":access,"refresh_token":refresh,"token_type":"bearer"}

@app.post("/auth/logout")
def logout(body: RefreshReq, db: Session = Depends(get_db)):
    db.query(RefreshToken).filter_by(token_hash=hash_tok(body.refresh_token)).update({"revoked":True})
    db.commit()
    return {"detail":"Logout realizado"}

@app.get("/health")
def health():
    try: redis_ok = redis_client.ping()
    except: redis_ok = False
    return {"service":"auth","status":"ok","redis":redis_ok}