# services/payment/main.py
# Integração PayGo TEF (95% aprovação em simulação)
# Cancelamento chama order-service para atualizar status

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Column, Integer, String, Numeric, DateTime, select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import httpx, random
from config import require_env, get_cors_origins
from auth import get_current_user, TokenPayload

DB_URL           = require_env("DB_URL")
ORDER_SVC        = require_env("ORDER_SERVICE_URL")
INTERNAL_SECRET  = require_env("INTERNAL_SECRET")
INTERNAL_HEADERS = {"X-Internal-Secret": INTERNAL_SECRET}
engine = create_async_engine(DB_URL.replace("mysql+pymysql://", "mysql+aiomysql://"), pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase): pass

class Transaction(Base):
    __tablename__ = "transactions"
    id            = Column(Integer, primary_key=True)
    company_id    = Column(Integer, nullable=False, index=True)
    order_ref     = Column(String(12), nullable=False, index=True)
    terminal_id   = Column(Integer, nullable=False)
    tef_number    = Column(String(40), nullable=False)
    method        = Column(String(10), nullable=False)
    amount        = Column(Numeric(10,2), nullable=False)
    status        = Column(String(20), default="pending")
    nsu           = Column(String(40))
    authorization = Column(String(40))
    paygo_response= Column(String(2000))
    cancelled_at  = Column(DateTime)
    cancel_reason = Column(String(255))
    created_at    = Column(DateTime, default=datetime.utcnow)
    updated_at    = Column(DateTime, onupdate=datetime.utcnow)

async def get_db():
    async with AsyncSessionLocal() as db:
        yield db

app = FastAPI(title="Payment Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Internal-Secret"],
    allow_credentials=True,
)

class ItemIn(BaseModel):
    product_id: int; name: str; qty: int; unit_price: float

class PaymentIn(BaseModel):
    order_ref: str
    tef_number: str
    method: str
    amount: float
    items: List[ItemIn]
    cpf: Optional[str] = None

class CancelIn(BaseModel):
    reason: Optional[str] = "Cancelamento solicitado"

@app.post("/payments", status_code=201)
async def create_payment(
    body: PaymentIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    tx = Transaction(
        company_id=current_user.company_id,
        order_ref=body.order_ref,
        terminal_id=current_user.terminal_id or 0,
        tef_number=body.tef_number,
        method=body.method,
        amount=body.amount,
        status="pending",
    )
    db.add(tx); await db.commit(); await db.refresh(tx)
    approved = random.random() < 0.95
    nsu  = f"NSU{int(datetime.utcnow().timestamp())}"
    auth = f"AUT{random.randint(100000,999999)}"
    tx.status = "approved" if approved else "refused"
    if approved: tx.nsu=nsu; tx.authorization=auth
    await db.commit()
    if approved:
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                await c.patch(f"{ORDER_SVC}/internal/orders/{body.order_ref}/status", json={"status":"paid"}, headers=INTERNAL_HEADERS)
        except: pass
    if not approved:
        return {"ok":False,"transaction_id":tx.id,"status":"refused","error":"Não autorizado"}
    return {"ok":True,"transaction_id":tx.id,"status":"approved","nsu":nsu,
            "authorization":auth,"order_ref":body.order_ref,"amount":body.amount}

@app.get("/payments")
async def list_payments(
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    result = await db.execute(
        select(Transaction)
        .where(Transaction.company_id == current_user.company_id)
        .order_by(Transaction.created_at.desc())
        .limit(100)
    )
    txs = result.scalars().all()
    return {"items":[{"id":t.id,"order_ref":t.order_ref,"method":t.method,
            "amount":float(t.amount),"status":t.status,"nsu":t.nsu,
            "authorization":t.authorization,"created_at":str(t.created_at)} for t in txs]}

@app.post("/payments/{tx_id}/cancel")
async def cancel_payment(
    tx_id: int,
    body: CancelIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    result = await db.execute(select(Transaction).where(Transaction.id == tx_id, Transaction.company_id == current_user.company_id))
    tx = result.scalars().first()
    if not tx: raise HTTPException(404)
    if tx.status != "approved": raise HTTPException(400, f"Status: {tx.status}")
    tx.status="cancelled"; tx.cancelled_at=datetime.utcnow(); tx.cancel_reason=body.reason
    await db.commit()
    async with httpx.AsyncClient(timeout=5) as c:
        await c.patch(f"{ORDER_SVC}/internal/orders/{tx.order_ref}/status", json={"status":"cancelled"}, headers=INTERNAL_HEADERS)
    return {"ok":True,"detail":"Transação cancelada"}

@app.get("/health")
def health(): return {"service":"payment","status":"ok"}
