# services/payment/main.py
# Integração PayGo TEF (95% aprovação em simulação)
# Cancelamento chama order-service para atualizar status

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, Numeric, DateTime
from sqlalchemy.orm import sessionmaker, DeclarativeBase, Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import httpx, random, os

DB_URL = f"mysql+pymysql://fk_payment:payment_pass@{os.getenv('DB_HOST','mysql')}:3306/fk_payment?charset=utf8mb4"
engine = create_engine(DB_URL, pool_pre_ping=True)

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

Base.metadata.create_all(engine)
SessionLocal = sessionmaker(bind=engine)
def get_db():
    db=SessionLocal()
    try: yield db
    finally: db.close()

ORDER_SVC = os.getenv("ORDER_SERVICE_URL","http://order-service:8004")

app = FastAPI(title="Payment Service")
app.add_middleware(CORSMiddleware,allow_origins=["*"],allow_methods=["*"],allow_headers=["*"])

class ItemIn(BaseModel):
    product_id: int; name: str; qty: int; unit_price: float

class PaymentIn(BaseModel):
    order_ref: str; company_id: int; terminal_id: int
    tef_number: str; method: str; amount: float
    items: List[ItemIn]; cpf: Optional[str] = None

class CancelIn(BaseModel):
    reason: Optional[str] = "Cancelamento solicitado"

@app.post("/payments", status_code=201)
async def create_payment(body: PaymentIn, db: Session = Depends(get_db)):
    tx = Transaction(company_id=body.company_id,order_ref=body.order_ref,
                     terminal_id=body.terminal_id,tef_number=body.tef_number,
                     method=body.method,amount=body.amount,status="pending")
    db.add(tx); db.commit(); db.refresh(tx)
    approved = random.random() < 0.95
    nsu  = f"NSU{int(datetime.utcnow().timestamp())}"
    auth = f"AUT{random.randint(100000,999999)}"
    tx.status = "approved" if approved else "refused"
    if approved: tx.nsu=nsu; tx.authorization=auth
    db.commit()
    if approved:
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                await c.patch(f"{ORDER_SVC}/orders/{body.order_ref}/status",json={"status":"paid"})
        except: pass
    if not approved:
        return {"ok":False,"transaction_id":tx.id,"status":"refused","error":"Não autorizado"}
    return {"ok":True,"transaction_id":tx.id,"status":"approved","nsu":nsu,
            "authorization":auth,"order_ref":body.order_ref,"amount":body.amount}

@app.get("/payments")
def list_payments(company_id: int, db: Session = Depends(get_db)):
    txs = db.query(Transaction).filter_by(company_id=company_id)
            .order_by(Transaction.created_at.desc()).limit(100).all()
    return {"items":[{"id":t.id,"order_ref":t.order_ref,"method":t.method,
            "amount":float(t.amount),"status":t.status,"nsu":t.nsu,
            "authorization":t.authorization,"created_at":str(t.created_at)} for t in txs]}

@app.post("/payments/{tx_id}/cancel")
async def cancel_payment(tx_id: int, body: CancelIn, db: Session = Depends(get_db)):
    tx = db.get(Transaction, tx_id)
    if not tx: raise HTTPException(404)
    if tx.status != "approved": raise HTTPException(400, f"Status: {tx.status}")
    tx.status="cancelled"; tx.cancelled_at=datetime.utcnow(); tx.cancel_reason=body.reason
    db.commit()
    async with httpx.AsyncClient(timeout=5) as c:
        await c.patch(f"{ORDER_SVC}/orders/{tx.order_ref}/status",json={"status":"cancelled"})
    return {"ok":True,"detail":"Transação cancelada"}

@app.get("/health")
def health(): return {"service":"payment","status":"ok"}