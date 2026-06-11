# services/order/main.py
# SELECT FOR UPDATE — sem dupla baixa em multi-device
# Rastreabilidade: collected_by, collected_at, collection_device
# Finalização atômica do pedido no backend

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, select, func
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase, relationship
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import random, string, secrets, hmac as hmaclib, hashlib
from config import require_env, get_cors_origins
from auth import get_current_user, TokenPayload

DB_URL          = require_env("DB_URL")
INTERNAL_SECRET = require_env("INTERNAL_SECRET")
QR_SECRET       = require_env("QR_SECRET")

def require_internal(x_internal_secret: str = Header(default="")) -> None:
    if not secrets.compare_digest(x_internal_secret, INTERNAL_SECRET):
        raise HTTPException(403, detail="Acesso interno não autorizado")

engine = create_async_engine(DB_URL.replace("mysql+pymysql://", "mysql+aiomysql://"), pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase): pass

class Order(Base):
    __tablename__ = "orders"
    id          = Column(Integer, primary_key=True)
    company_id  = Column(Integer, nullable=False, index=True)
    terminal_id = Column(Integer, nullable=False)
    order_ref   = Column(String(12), unique=True, nullable=False)
    status      = Column(String(20), default="pending")
    total       = Column(Numeric(10,2), nullable=False)
    discount    = Column(Numeric(10,2), default=0)
    cpf         = Column(String(14))
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, onupdate=datetime.utcnow)
    items       = relationship("OrderItem", back_populates="order", cascade="all, delete")

class OrderItem(Base):
    __tablename__ = "order_items"
    id           = Column(Integer, primary_key=True)
    order_id     = Column(Integer, ForeignKey("orders.id"), nullable=False)
    product_id   = Column(Integer, nullable=False)
    product_name = Column(String(120), nullable=False)
    unit_price   = Column(Numeric(10,2), nullable=False)
    quantity     = Column(Integer, nullable=False, default=1)
    subtotal     = Column(Numeric(10,2), nullable=False)
    order        = relationship("Order", back_populates="items")
    tickets      = relationship("Ticket", back_populates="item", cascade="all, delete")

class Ticket(Base):
    __tablename__ = "tickets"
    id                = Column(Integer, primary_key=True)
    order_item_id     = Column(Integer, ForeignKey("order_items.id"), nullable=False)
    ticket_code       = Column(String(12), unique=True, nullable=False)
    qr_data           = Column(String(500), nullable=False)
    order_ref         = Column(String(12), nullable=False, index=True)
    unit_number       = Column(Integer, nullable=False)
    total_units       = Column(Integer, nullable=False)
    status            = Column(String(20), default="printed")
    printed_at        = Column(DateTime, default=datetime.utcnow)
    collected_at      = Column(DateTime, nullable=True)
    collected_by      = Column(String(80), nullable=True)
    collection_device = Column(String(64), nullable=True)
    item              = relationship("OrderItem", back_populates="tickets")

async def get_db():
    async with AsyncSessionLocal() as db:
        yield db

app = FastAPI(title="Order Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Internal-Secret"],
    allow_credentials=True,
)

class ItemIn(BaseModel):
    product_id: int; name: str; qty: int; unit_price: float

class OrderIn(BaseModel):
    items: List[ItemIn]
    cpf: Optional[str] = None
    discount: float = 0

class CollectIn(BaseModel):
    collected_by: Optional[str] = "balcao"
    collection_device: Optional[str] = None
    qr_data: Optional[str] = None  # opcional durante grace period (Sprint 4 remove a exceção)

def _gen_ref(): return "P"+"".join(random.choices(string.digits,k=6))
def _gen_code():
    chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choices(chars,k=8))

def _make_qr_data(code: str, name: str, ref: str, ts: str) -> str:
    safe_name = name.replace("|", "-")[:50]
    payload = f"{code}|{safe_name}|{ref}|{ts}"
    sig = hmaclib.new(QR_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}|{sig}"

def _verify_qr(qr_data: str) -> bool:
    parts = qr_data.split("|")
    if len(parts) != 5:
        return False
    *data_parts, received_sig = parts
    payload = "|".join(data_parts)
    expected = hmaclib.new(QR_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return hmaclib.compare_digest(expected, received_sig)

@app.post("/orders", status_code=201)
async def create_order(
    body: OrderIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    ref         = _gen_ref()
    total       = sum(i.unit_price*i.qty for i in body.items) - body.discount
    terminal_id = current_user.terminal_id or 0
    order = Order(
        company_id=current_user.company_id,
        terminal_id=terminal_id,
        order_ref=ref, total=total, discount=body.discount, cpf=body.cpf,
    )
    db.add(order); await db.flush()
    for item in body.items:
        oi = OrderItem(order_id=order.id, product_id=item.product_id,
                       product_name=item.name, unit_price=item.unit_price,
                       quantity=item.qty, subtotal=item.unit_price*item.qty)
        db.add(oi); await db.flush()
        for u in range(1, item.qty+1):
            code = _gen_code()
            ts   = datetime.utcnow().isoformat()
            qr   = _make_qr_data(code, item.name, ref, ts)
            db.add(Ticket(order_item_id=oi.id, ticket_code=code, qr_data=qr,
                          order_ref=ref, unit_number=u, total_units=item.qty))
    await db.commit(); await db.refresh(order)
    return {"order_ref":order.order_ref,"total":float(order.total),"status":order.status}

@app.post("/tickets/{ticket_code}/collect")
async def collect_ticket(
    ticket_code: str,
    body: CollectIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
    x_device_id: Optional[str] = Header(default=None),
):
    if body.qr_data is not None:
        if not _verify_qr(body.qr_data) or body.qr_data.split("|")[0] != ticket_code:
            raise HTTPException(400, detail="QR inválido")
    result = await db.execute(
        select(Ticket)
        .join(OrderItem, OrderItem.id == Ticket.order_item_id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(Ticket.ticket_code == ticket_code,
               Order.company_id == current_user.company_id)
        .with_for_update()
    )
    ticket = result.scalars().first()
    if not ticket:  raise HTTPException(404, "Ticket não encontrado")
    if ticket.status=="collected": raise HTTPException(409, "Ticket já coletado")
    if ticket.status=="expired":  raise HTTPException(410, "Ticket expirado")
    ticket.status            = "collected"
    ticket.collected_at      = datetime.utcnow()
    ticket.collected_by      = body.collected_by
    ticket.collection_device = x_device_id or body.collection_device
    await db.flush()
    total_t = (await db.execute(
        select(func.count(Ticket.id)).where(Ticket.order_ref == ticket.order_ref)
    )).scalar()
    collected_t = (await db.execute(
        select(func.count(Ticket.id)).where(Ticket.order_ref == ticket.order_ref, Ticket.status == "collected")
    )).scalar()
    order_done  = False
    if collected_t == total_t:
        order_result = await db.execute(
            select(Order).where(Order.order_ref == ticket.order_ref).with_for_update()
        )
        order = order_result.scalars().first()
        if order and order.status != "completed":
            order.status = "completed"; order_done = True
    await db.commit()
    return {"ok":True,"ticket_code":ticket_code,"order_ref":ticket.order_ref,
            "collected_at":ticket.collected_at.isoformat(),
            "collected_by":ticket.collected_by,
            "order_completed":order_done,
            "progress":f"{collected_t}/{total_t}"}

@app.patch("/orders/{order_ref}/status")
async def update_status(
    order_ref: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    result = await db.execute(select(Order).filter_by(order_ref=order_ref, company_id=current_user.company_id))
    o = result.scalars().first()
    if not o: raise HTTPException(404)
    o.status = body["status"]; await db.commit()
    return {"order_ref":order_ref,"status":o.status}

@app.get("/orders/{order_ref}/tickets")
async def list_order_tickets(
    order_ref: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    result = await db.execute(
        select(Ticket)
        .join(Order, Order.order_ref == Ticket.order_ref)
        .where(Ticket.order_ref == order_ref,
               Order.company_id == current_user.company_id)
    )
    tickets = result.scalars().all()
    if not tickets: raise HTTPException(404)
    col = sum(1 for t in tickets if t.status=="collected")
    return {"order_ref":order_ref,"progress":f"{col}/{len(tickets)}",
            "tickets":[{"ticket_code":t.ticket_code,"status":t.status,
                        "unit_number":t.unit_number,"total_units":t.total_units,
                        "collected_at":t.collected_at.isoformat() if t.collected_at else None,
                        "collected_by":t.collected_by} for t in tickets]}

@app.patch("/internal/orders/{order_ref}/status")
async def internal_update_status(
    order_ref: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal),
):
    result = await db.execute(select(Order).filter_by(order_ref=order_ref))
    o = result.scalars().first()
    if not o: raise HTTPException(404)
    o.status = body["status"]; await db.commit()
    return {"order_ref": order_ref, "status": o.status}

@app.get("/health")
def health(): return {"service":"order","status":"ok"}
