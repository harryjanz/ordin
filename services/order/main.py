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
from websocket import ws_router, broadcast_order_created, broadcast_ticket_collected, broadcast_order_completed, broadcast_order_paid

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

# ── Request schemas ───────────────────────────────────────────────────────────

class ItemIn(BaseModel):
    product_id: int
    name: str
    qty: int
    unit_price: float

class OrderIn(BaseModel):
    items: List[ItemIn]
    cpf: Optional[str] = None
    discount: float = 0

class CollectIn(BaseModel):
    collected_by: Optional[str] = "balcao"
    collection_device: Optional[str] = None
    qr_data: Optional[str] = None  # opcional durante grace period (Sprint 4 remove a exceção)

# ── Response schemas ──────────────────────────────────────────────────────────

class OrderOut(BaseModel):
    order_ref: str
    total: float
    status: str

class OrderListItem(BaseModel):
    order_ref: str
    status: str
    total: float
    terminal_id: int
    created_at: str
    tickets_total: int
    tickets_collected: int

class OrderListOut(BaseModel):
    orders: list[OrderListItem]
    total: int

class TicketOut(BaseModel):
    ticket_code: str
    qr_data: str
    status: str
    unit_number: int
    total_units: int
    collected_at: Optional[str] = None
    collected_by: Optional[str] = None

class TicketListOut(BaseModel):
    order_ref: str
    progress: str
    tickets: list[TicketOut]

class CollectOut(BaseModel):
    ok: bool
    ticket_code: str
    order_ref: str
    collected_at: str
    collected_by: Optional[str] = None
    order_completed: bool
    progress: str

class OrderStatusOut(BaseModel):
    order_ref: str
    status: str

class HealthOut(BaseModel):
    service: str
    status: str

# ── App ───────────────────────────────────────────────────────────────────────

_tags = [
    {
        "name": "Pedidos",
        "description": "Criação de pedidos pelo totem e acompanhamento do status.",
    },
    {
        "name": "Tickets",
        "description": (
            "Coleta de tickets por QR Code. Cada unidade de item gera um ticket independente. "
            "Usa `SELECT FOR UPDATE` para prevenir dupla coleta em ambientes multi-device."
        ),
    },
]

app = FastAPI(
    title="Ordin — Order Service",
    description=(
        "Serviço de pedidos da plataforma Ordin.\n\n"
        "Gerencia o ciclo completo de um pedido: criação pelo totem, geração de tickets "
        "por unidade de item com QR Code assinado (**HMAC-SHA256**), coleta pelo operador de balcão "
        "e finalização automática quando todos os tickets forem coletados.\n\n"
        "**Prevenção de dupla coleta:** `SELECT FOR UPDATE` no endpoint de coleta.\n\n"
        "**QR Code:** `{ticket_code}|{product_name}|{order_ref}|{timestamp}|{HMAC-SHA256}`\n\n"
        "**Autenticação:** todos os endpoints exigem `Authorization: Bearer <token>`. "
        "Os endpoints `/internal/*` exigem `X-Internal-Secret` e são bloqueados no Kong."
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
app.include_router(ws_router)

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

@app.post(
    "/orders",
    status_code=201,
    response_model=OrderOut,
    tags=["Pedidos"],
    summary="Criar pedido",
)
async def create_order(
    body: OrderIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """
    Cria um pedido para o totem autenticado. Para cada unidade de cada item, gera um ticket
    independente com QR Code assinado por HMAC-SHA256. Requer `role: kiosk`.
    """
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
    await broadcast_order_created(
        current_user.company_id, order.order_ref,
        float(order.total), f"Terminal {terminal_id}",
    )
    return {"order_ref":order.order_ref,"total":float(order.total),"status":order.status}

@app.post(
    "/tickets/{ticket_code}/collect",
    response_model=CollectOut,
    tags=["Tickets"],
    summary="Coletar ticket via QR Code",
    responses={
        400: {"description": "QR Code inválido ou assinatura HMAC incorreta"},
        404: {"description": "Ticket não encontrado"},
        409: {"description": "Ticket já coletado"},
        410: {"description": "Ticket expirado"},
    },
)
async def collect_ticket(
    ticket_code: str,
    body: CollectIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
    x_device_id: Optional[str] = Header(default=None),
):
    """
    Registra a coleta de um ticket. Valida o HMAC do QR Code antes de acessar o banco.
    Usa `SELECT FOR UPDATE` para evitar dupla coleta em ambientes multi-device.
    Quando o último ticket de um pedido é coletado, o pedido é marcado como `completed` automaticamente.
    Requer `role: cashier` ou `admin`.
    """
    if body.qr_data is not None:
        if not _verify_qr(body.qr_data) or body.qr_data.split("|")[0] != ticket_code:
            raise HTTPException(400, detail="QR inválido")
    result = await db.execute(
        select(Ticket, OrderItem.product_name)
        .join(OrderItem, OrderItem.id == Ticket.order_item_id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(Ticket.ticket_code == ticket_code,
               Order.company_id == current_user.company_id)
        .with_for_update()
    )
    row = result.first()
    if not row: raise HTTPException(404, "Ticket não encontrado")
    ticket, product_name = row
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
    progress_str = f"{collected_t}/{total_t}"
    await broadcast_ticket_collected(
        current_user.company_id, ticket_code, ticket.order_ref,
        product_name, progress_str, body.collected_by,
    )
    if order_done:
        await broadcast_order_completed(current_user.company_id, ticket.order_ref)
    return {"ok":True,"ticket_code":ticket_code,"order_ref":ticket.order_ref,
            "collected_at":ticket.collected_at.isoformat(),
            "collected_by":ticket.collected_by,
            "order_completed":order_done,
            "progress":progress_str}

@app.get(
    "/orders",
    response_model=OrderListOut,
    tags=["Pedidos"],
    summary="Listar pedidos da empresa",
)
async def list_orders(
    status: Optional[str] = None,
    limit: int = 50,
    skip: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """Lista pedidos da empresa autenticada com filtro opcional de status."""
    q = select(Order).where(Order.company_id == current_user.company_id)
    if status and status != "all":
        q = q.where(Order.status == status)
    q = q.order_by(Order.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(q)
    orders = result.scalars().all()

    count_q = select(func.count(Order.id)).where(Order.company_id == current_user.company_id)
    if status and status != "all":
        count_q = count_q.where(Order.status == status)
    total = (await db.execute(count_q)).scalar_one()

    items = []
    for o in orders:
        tix_q = (
            select(Ticket)
            .join(OrderItem, OrderItem.id == Ticket.order_item_id)
            .where(OrderItem.order_id == o.id)
        )
        tix_rows = (await db.execute(tix_q)).scalars().all()
        items.append({
            "order_ref": o.order_ref,
            "status": o.status,
            "total": float(o.total),
            "terminal_id": o.terminal_id,
            "created_at": o.created_at.isoformat() if o.created_at else "",
            "tickets_total": len(tix_rows),
            "tickets_collected": sum(1 for t in tix_rows if t.status == "collected"),
        })
    return {"orders": items, "total": total}


@app.patch(
    "/orders/{order_ref}/status",
    response_model=OrderStatusOut,
    tags=["Pedidos"],
    summary="Atualizar status do pedido",
    responses={404: {"description": "Pedido não encontrado"}},
)
async def update_status(
    order_ref: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """Atualiza o status de um pedido. Requer `role: admin`."""
    result = await db.execute(select(Order).filter_by(order_ref=order_ref, company_id=current_user.company_id))
    o = result.scalars().first()
    if not o: raise HTTPException(404)
    o.status = body["status"]; await db.commit()
    return {"order_ref":order_ref,"status":o.status}

@app.get(
    "/orders/{order_ref}/tickets",
    response_model=TicketListOut,
    tags=["Tickets"],
    summary="Listar tickets de um pedido",
    responses={404: {"description": "Pedido não encontrado ou de outra empresa"}},
)
async def list_order_tickets(
    order_ref: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """Retorna todos os tickets de um pedido com progresso de coleta. Isolamento multi-tenant aplicado."""
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
            "tickets":[{"ticket_code":t.ticket_code,"qr_data":t.qr_data,"status":t.status,
                        "unit_number":t.unit_number,"total_units":t.total_units,
                        "collected_at":t.collected_at.isoformat() if t.collected_at else None,
                        "collected_by":t.collected_by} for t in tickets]}

@app.patch("/internal/orders/{order_ref}/status", include_in_schema=False)
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
    if body["status"] == "paid":
        await broadcast_order_paid(o.company_id, order_ref, float(o.total), o.terminal_id)
    return {"order_ref": order_ref, "status": o.status}

@app.get("/health", response_model=HealthOut, tags=["Pedidos"], summary="Healthcheck")
def health(): return {"service":"order","status":"ok"}
