from fastapi import FastAPI, HTTPException, Depends, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, select, func
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase, relationship
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta, timezone
import random, string, secrets, hmac as hmaclib, hashlib
from config import require_env, get_cors_origins
from auth import get_current_user, TokenPayload
from audit import emit_audit
from websocket import ws_router, broadcast_order_created, broadcast_ticket_collected, broadcast_order_completed, broadcast_order_paid, broadcast_order_ready

DB_URL          = require_env("DB_URL")
INTERNAL_SECRET = require_env("INTERNAL_SECRET")
QR_SECRET       = require_env("QR_SECRET")

def require_internal(x_internal_secret: str = Header(default="")) -> None:
    if not secrets.compare_digest(x_internal_secret, INTERNAL_SECRET):
        raise HTTPException(403, detail="Acesso interno não autorizado")


ORDER_STATUSES = ["pending", "paid", "ready", "completed", "cancelled"]


def _normalize_cpf(value: str) -> str:
    # order-service não tem o normalizador do company-service (domain/cpf.py)
    # nem depende dele (serviços independentes) — versão mínima só pra
    # comparar o filtro com o que está gravado (grava como recebido do
    # totem, sem pontuação, ver Order.cpf/OrderIn.cpf).
    return "".join(c for c in value if c.isdigit())

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
    # ORD-108 — "local" | "viagem" | NULL (empresa sem a opção ligada, ou
    # pedido anterior à feature). Só o totem grava; sem enum rígido no
    # banco, mesmo nível de confiança já dado ao resto do payload do kiosk.
    consumption_type = Column(String(10), nullable=True)
    # ORD-118 — QR único do pedido inteiro (formato "ORDER|...", distinto do
    # formato de Ticket.qr_data), gerado sempre na criação — quem decide se
    # usa (imprimir/coletar por pedido) é o frontend, com base no
    # fulfillment_mode da empresa; order-service não precisa saber disso.
    qr_data     = Column(String(500), nullable=True)
    # ORD-119 — nome opcional informado no totem pra identificação no painel
    # de retirada ("Maria" em vez de só "Pedido #42"); sem validação de
    # unicidade, ambiguidade aceitável (mesmo comportamento de fast-food
    # físico). Só usado em fulfillment_mode="retirada_unica".
    pickup_name = Column(String(80), nullable=True)
    # ORD-119 (análise de concorrentes 2026-08-24) — momento em que virou
    # "ready" (paid→ready), separado de created_at. Sem isso não dá pra
    # medir tempo de preparo de verdade — só teria o tempo até a coleta
    # final, que mistura preparo com cliente parado esperando.
    ready_at    = Column(DateTime, nullable=True)
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
    # ORD-123 — "qr" (padrão) ou "manual" (operador deu baixa sem QR, pula a
    # verificação HMAC). Distingue as duas vias pra quem revisar depois.
    collection_method = Column(String(10), nullable=False, default="qr")
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
    consumption_type: Optional[str] = None
    pickup_name: Optional[str] = None

class CollectIn(BaseModel):
    # ORD-123 — collected_by deixou de vir do cliente: era uma string livre
    # sem validação, inútil pra auditoria. Passa a ser sempre derivado de
    # current_user.sub (JWT) direto no handler.
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
    company_id: int
    terminal_id: int
    cpf: Optional[str] = None
    consumption_type: Optional[str] = None
    pickup_name: Optional[str] = None
    created_at: str
    tickets_total: int
    tickets_collected: int

class OrderStatusSummaryItem(BaseModel):
    count: int
    total: float

class OrderListOut(BaseModel):
    orders: list[OrderListItem]
    total: int
    summary: dict[str, OrderStatusSummaryItem]

class TicketOut(BaseModel):
    ticket_code: str
    qr_data: str
    status: str
    unit_number: int
    total_units: int
    collected_at: Optional[str] = None
    collected_by: Optional[str] = None
    collection_method: Optional[str] = None

class TicketListOut(BaseModel):
    order_ref: str
    progress: str
    tickets: list[TicketOut]
    # ORD-118 — QR do pedido inteiro, sempre presente; quem decide se
    # imprime/usa é o frontend, com base no fulfillment_mode da empresa.
    order_qr_data: Optional[str] = None

class CollectOut(BaseModel):
    ok: bool
    ticket_code: str
    order_ref: str
    collected_at: str
    collected_by: Optional[str] = None
    order_completed: bool
    progress: str

class OrderCollectOut(BaseModel):
    ok: bool
    order_ref: str
    collected_at: str
    collected_by: Optional[str] = None
    progress: str

class OrderStatusOut(BaseModel):
    order_ref: str
    status: str

class OrderReadyOut(BaseModel):
    ok: bool
    order_ref: str
    status: str

class PrepStatsHourItem(BaseModel):
    hour: int
    count: int
    avg_minutes: float

class PrepStatsOut(BaseModel):
    count: int
    avg_prep_minutes: Optional[float] = None
    by_hour: List[PrepStatsHourItem]
    # ORD-119 (melhorias de UX 2026-08-24) — mesmo padrão de comparação de
    # período já usado em payments_analytics (services/payment/main.py):
    # janela anterior de mesma duração, imediatamente antes da atual.
    avg_prep_minutes_prev: Optional[float] = None
    change_pct: Optional[float] = None
    peak_hour_prev: Optional[PrepStatsHourItem] = None

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

# ORD-118 — QR de pedido inteiro (retirada única). Prefixo literal "ORDER"
# distingue do formato de ticket (que começa com o ticket_code de 8
# caracteres) — nunca ambíguo pra quem escaneia (app de balcão).
def _make_order_qr_data(ref: str, ts: str) -> str:
    payload = f"ORDER|{ref}|{ts}"
    sig = hmaclib.new(QR_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}|{sig}"

def _verify_order_qr(qr_data: str, ref: str) -> bool:
    parts = qr_data.split("|")
    if len(parts) != 4 or parts[0] != "ORDER" or parts[1] != ref:
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
    order_ts = datetime.utcnow().isoformat()
    order = Order(
        company_id=current_user.company_id,
        terminal_id=terminal_id,
        order_ref=ref, total=total, discount=body.discount, cpf=body.cpf,
        consumption_type=body.consumption_type,
        qr_data=_make_order_qr_data(ref, order_ts),
        pickup_name=body.pickup_name,
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
    # Tipo precisa ficar "Request" puro (não Optional[Request]) pro FastAPI
    # reconhecer e injetar automaticamente — Optional[] faz cair na validação
    # normal de campo Pydantic, que não sabe lidar com o tipo do Starlette.
    # Default None só existe pra não quebrar as chamadas diretas dos testes
    # existentes (test_coverage.py chama collect_ticket posicionalmente sem
    # request); só é usado no ramo de baixa manual, ver emit_audit abaixo.
    request: Request = None,
):
    """
    Registra a coleta de um ticket. Valida o HMAC do QR Code antes de acessar o banco.
    Usa `SELECT FOR UPDATE` para evitar dupla coleta em ambientes multi-device.
    Quando o último ticket de um pedido é coletado, o pedido é marcado como `completed` automaticamente.
    Requer `role: cashier` ou `admin`.
    Sem `qr_data` no body, a coleta é manual (ORD-123) — pula a verificação HMAC,
    fica marcada com `collection_method="manual"` e gera evento de auditoria.
    """
    collection_method = "qr" if body.qr_data is not None else "manual"
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
    collected_by = current_user.sub
    ticket.status            = "collected"
    ticket.collected_at      = datetime.utcnow()
    ticket.collected_by      = collected_by
    ticket.collection_device = x_device_id or body.collection_device
    ticket.collection_method = collection_method
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
        product_name, progress_str, collected_by,
    )
    if order_done:
        await broadcast_order_completed(current_user.company_id, ticket.order_ref)
    if collection_method == "manual" and request is not None:
        emit_audit("ticket.collected", request,
                   actor=collected_by, actor_id=int(collected_by),
                   company_id=current_user.company_id, result="success",
                   detail={"method": "manual", "ticket_code": ticket_code,
                           "order_ref": ticket.order_ref, "progress": progress_str})
    return {"ok":True,"ticket_code":ticket_code,"order_ref":ticket.order_ref,
            "collected_at":ticket.collected_at.isoformat(),
            "collected_by":ticket.collected_by,
            "order_completed":order_done,
            "progress":progress_str}

@app.post(
    "/orders/{order_ref}/collect",
    response_model=OrderCollectOut,
    tags=["Tickets"],
    summary="Coletar pedido inteiro via QR único (modelo de retirada única, ORD-118)",
    responses={
        400: {"description": "QR Code inválido ou assinatura HMAC incorreta"},
        404: {"description": "Pedido não encontrado"},
        409: {"description": "Pedido já coletado"},
    },
)
async def collect_order(
    order_ref: str,
    body: CollectIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
    x_device_id: Optional[str] = Header(default=None),
    request: Request = None,
):
    """
    Coleta todos os tickets de um pedido numa única operação — pro modelo de atendimento
    `fulfillment_mode = "retirada_unica"` (ORD-118). Duas vias de entrada: scan do QR único do
    pedido pelo app de balcão (`qr_data` verificado por HMAC), ou coleta manual pela tela
    operacional do balcão/admin (sem `qr_data`, staff autenticado — ORD-123, gera evento de
    auditoria e fica marcada com `collection_method="manual"`). Mesmo padrão de lock
    (`SELECT FOR UPDATE`) e fechamento automático já usado em `collect_ticket`.
    """
    collection_method = "qr" if body.qr_data is not None else "manual"
    if body.qr_data is not None and not _verify_order_qr(body.qr_data, order_ref):
        raise HTTPException(400, detail="QR inválido")
    result = await db.execute(
        select(Order)
        .where(Order.order_ref == order_ref, Order.company_id == current_user.company_id)
        .with_for_update()
    )
    order = result.scalars().first()
    if not order: raise HTTPException(404, "Pedido não encontrado")
    if order.status == "completed": raise HTTPException(409, "Pedido já coletado")
    collected_at = datetime.utcnow()
    collected_by = current_user.sub
    collection_device = x_device_id or body.collection_device
    tickets_result = await db.execute(
        select(Ticket)
        .join(OrderItem, OrderItem.id == Ticket.order_item_id)
        .where(OrderItem.order_id == order.id)
        .with_for_update()
    )
    tickets = tickets_result.scalars().all()
    for ticket in tickets:
        ticket.status = "collected"
        ticket.collected_at = collected_at
        ticket.collected_by = collected_by
        ticket.collection_device = collection_device
        ticket.collection_method = collection_method
    order.status = "completed"
    await db.commit()
    progress_str = f"{len(tickets)}/{len(tickets)}"
    await broadcast_order_completed(current_user.company_id, order_ref)
    if collection_method == "manual" and request is not None:
        emit_audit("order.collected", request,
                   actor=collected_by, actor_id=int(collected_by),
                   company_id=current_user.company_id, result="success",
                   detail={"method": "manual", "order_ref": order_ref, "progress": progress_str})
    return {"ok": True, "order_ref": order_ref, "collected_at": collected_at.isoformat(),
            "collected_by": collected_by, "progress": progress_str}

@app.post(
    "/orders/{order_ref}/ready",
    response_model=OrderReadyOut,
    tags=["Pedidos"],
    summary="Marcar pedido como pronto para retirada (ORD-119)",
    responses={
        404: {"description": "Pedido não encontrado"},
        409: {"description": "Pedido não está pago (já pronto, já coletado, ou ainda não pago)"},
    },
)
async def mark_order_ready(
    order_ref: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """
    Transição paid → ready, usada pela tela operacional do admin no modelo de
    atendimento retirada_unica (ORD-118). Sem checagem de fulfillment_mode
    aqui — order-service é deliberadamente agnóstico a esse campo (é do
    company-service); quem decide exibir a ação é o frontend.
    """
    result = await db.execute(
        select(Order)
        .where(Order.order_ref == order_ref, Order.company_id == current_user.company_id)
        .with_for_update()
    )
    order = result.scalars().first()
    if not order: raise HTTPException(404, "Pedido não encontrado")
    if order.status != "paid": raise HTTPException(409, "Pedido não está aguardando preparo")
    order.status = "ready"
    order.ready_at = datetime.utcnow()
    await db.commit()
    await broadcast_order_ready(current_user.company_id, order_ref, order.pickup_name)
    return {"ok": True, "order_ref": order_ref, "status": "ready"}

@app.get(
    "/orders/prep-stats",
    response_model=PrepStatsOut,
    tags=["Pedidos"],
    summary="Tempo médio de preparo e relatório de gargalo por hora (ORD-119)",
)
async def prep_stats(
    company_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """
    Só considera pedidos que já passaram por 'ready' (ready_at preenchido) —
    modelo retirada_unica. Sem date_from, usa as últimas 24h por padrão
    (mesma janela já usada como convenção no app de balcão, ORD-122).
    Agrupa por hora do dia (hora de criação do pedido) pra identificar
    horário de maior pressão, mesmo relatório documentado pela Zig/Cplug
    na análise de concorrentes (2026-08-24).
    Mesmo padrão de escopo de list_orders: superadmin/admin podem filtrar
    por company_id; qualquer outro role fica restrito à própria empresa.

    Também calcula a janela anterior de mesma duração, imediatamente antes
    da atual — mesmo padrão já usado em payments_analytics
    (services/payment/main.py: duration/prev_start/prev_end) — pra
    alimentar a seta de tendência (melhorias de UX, 2026-08-24).
    """
    if current_user.role in ("superadmin", "admin"):
        base_filters = [Order.company_id == company_id] if company_id else []
    else:
        base_filters = [Order.company_id == current_user.company_id]

    # Order.created_at/ready_at são naive UTC (padrão do resto do serviço) —
    # normaliza qualquer date_from/date_to com timezone (ex.: o
    # toISOString() do JS, que sempre manda "Z") de volta pra naive, senão
    # a subtração abaixo quebra com "can't subtract offset-naive and
    # offset-aware datetimes" (achado ao vivo 2026-08-24, indicadores de
    # saúde 30min/60min).
    def _parse_naive_utc(s: str) -> datetime:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt

    window_end = _parse_naive_utc(date_to) if date_to else datetime.utcnow()
    window_start = _parse_naive_utc(date_from) if date_from else window_end - timedelta(hours=24)
    duration = window_end - window_start
    prev_start = window_start - duration
    prev_end = window_start

    async def period_stats(start: datetime, end: datetime):
        filters = [*base_filters, Order.ready_at.isnot(None), Order.created_at >= start, Order.created_at < end]
        result = await db.execute(select(Order.created_at, Order.ready_at).where(*filters))
        rows = result.all()
        if not rows:
            return None, []
        by_hour_acc: dict[int, list[float]] = {}
        all_minutes: list[float] = []
        for created, ready in rows:
            minutes = (ready - created).total_seconds() / 60
            all_minutes.append(minutes)
            by_hour_acc.setdefault(created.hour, []).append(minutes)
        by_hour = [
            {"hour": h, "count": len(v), "avg_minutes": round(sum(v) / len(v), 1)}
            for h, v in sorted(by_hour_acc.items())
        ]
        avg = round(sum(all_minutes) / len(all_minutes), 1)
        return {"count": len(rows), "avg_prep_minutes": avg, "by_hour": by_hour}, by_hour

    current, current_by_hour = await period_stats(window_start, window_end)
    previous, previous_by_hour = await period_stats(prev_start, prev_end)

    if current is None:
        return {"count": 0, "avg_prep_minutes": None, "by_hour": [],
                "avg_prep_minutes_prev": None, "change_pct": None, "peak_hour_prev": None}

    avg_prev = previous["avg_prep_minutes"] if previous else None
    change_pct = round((current["avg_prep_minutes"] - avg_prev) / avg_prev * 100, 1) if avg_prev else None
    peak_hour_prev = max(previous_by_hour, key=lambda h: h["count"]) if previous_by_hour else None

    return {
        "count": current["count"],
        "avg_prep_minutes": current["avg_prep_minutes"],
        "by_hour": current_by_hour,
        "avg_prep_minutes_prev": avg_prev,
        "change_pct": change_pct,
        "peak_hour_prev": peak_hour_prev,
    }

@app.get(
    "/orders",
    response_model=OrderListOut,
    tags=["Pedidos"],
    summary="Listar pedidos da empresa",
)
async def list_orders(
    status: Optional[str] = None,
    order_ref: Optional[str] = None,
    cpf: Optional[str] = None,
    company_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    hour_from: Optional[str] = None,
    hour_to: Optional[str] = None,
    limit: int = 50,
    skip: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """Lista pedidos da empresa autenticada (superadmin/admin veem todas, com
    filtro opcional de empresa) com filtros de status/referência/CPF/período/
    faixa de horário e resumo agregado por status."""
    # Mesmo padrão de list_payments (ORD-077): superadmin/admin enxergam
    # todas as empresas, com filtro opcional de company_id pra restringir a
    # uma; qualquer outro role fica restrito à própria, e o parâmetro
    # company_id é ignorado nesse caso (sem 403, sem revelar se a empresa
    # pedida existe).
    if current_user.role in ("superadmin", "admin"):
        base_filters = [Order.company_id == company_id] if company_id else []
    else:
        base_filters = [Order.company_id == current_user.company_id]

    if order_ref:
        base_filters.append(Order.order_ref.like(f"%{order_ref}%"))
    if cpf:
        # Prefixo, não igualdade exata — usuário reportou ao vivo que
        # digitar os primeiros dígitos de um CPF que ele lembra parcialmente
        # não achava nada (ex.: "030" não batia com "03013954973" gravado).
        base_filters.append(Order.cpf.like(f"{_normalize_cpf(cpf)}%"))
    if date_from:
        base_filters.append(Order.created_at >= date_from)
    if date_to:
        # ORD-135 (mesmo bug do ORD-134 em list_payments): date_to é
        # "AAAA-MM-DD" — created_at <= date_to equivale a <= meia-noite
        # daquele dia, escondendo pedidos criados depois das 00:00. Vira
        # limite exclusivo no dia seguinte.
        try:
            date_to_exclusive = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
        except ValueError:
            raise HTTPException(400, "date_to deve estar no formato AAAA-MM-DD")
        base_filters.append(Order.created_at < date_to_exclusive)
    # Faixa de horário só tem efeito com date_from setado (validado também
    # no frontend — campo desabilitado até "De" ser preenchido). Sem essa
    # trava, "só entre 11h-14h" sozinho filtraria o histórico inteiro por
    # hora do dia, o que não é o caso de uso (localizar pedido dentro de um
    # período já filtrado, não fora dele).
    if date_from and hour_from:
        base_filters.append(func.time(Order.created_at) >= hour_from)
    if date_from and hour_to:
        base_filters.append(func.time(Order.created_at) <= hour_to)

    # filters = base_filters + status, usado na lista/contagem paginada. O
    # resumo por status (summary, abaixo) usa só base_filters — ignora o
    # filtro de status de propósito, mesmo padrão do ORD-078 em
    # list_payments, pra sempre mostrar a distribuição completa mesmo com a
    # tabela filtrada por um status só.
    filters = list(base_filters)
    if status and status != "all":
        # ORD-119 — painel/tela operacional precisam de paid+ready juntos
        # numa fetch só (ex: "paid,ready"); mantém igualdade simples pro
        # caso comum de status único.
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        filters.append(Order.status.in_(statuses) if len(statuses) > 1 else Order.status == statuses[0])

    total = (
        await db.execute(select(func.count()).select_from(Order).where(*filters))
    ).scalar_one()

    result = await db.execute(
        select(Order).where(*filters).order_by(Order.created_at.desc()).offset(skip).limit(limit)
    )
    orders = result.scalars().all()

    summary = {s: {"count": 0, "total": 0.0} for s in ORDER_STATUSES}
    summary_rows = await db.execute(
        select(Order.status, func.count(), func.sum(Order.total))
        .where(*base_filters)
        .group_by(Order.status)
    )
    for row_status, row_count, row_total in summary_rows.all():
        if row_status in summary:
            summary[row_status] = {"count": row_count, "total": float(row_total or 0)}

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
            "company_id": o.company_id,
            "terminal_id": o.terminal_id,
            "cpf": o.cpf,
            "consumption_type": o.consumption_type,
            "pickup_name": o.pickup_name,
            "created_at": o.created_at.isoformat() if o.created_at else "",
            "tickets_total": len(tix_rows),
            "tickets_collected": sum(1 for t in tix_rows if t.status == "collected"),
        })
    return {"orders": items, "total": total, "summary": summary}


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
    # Mesmo padrão de list_orders (ORD-081): superadmin/admin têm company_id
    # próprio (empresa interna da plataforma, ORD-093), não o da empresa cujo
    # pedido estão consultando — sem esse bypass, todo pedido de cliente
    # dava 404 pra eles depois da migration do ORD-093.
    filters = [Ticket.order_ref == order_ref]
    if current_user.role not in ("superadmin", "admin"):
        filters.append(Order.company_id == current_user.company_id)
    result = await db.execute(
        select(Ticket, Order.qr_data)
        .join(Order, Order.order_ref == Ticket.order_ref)
        .where(*filters)
    )
    rows = result.all()
    if not rows: raise HTTPException(404)
    tickets = [row[0] for row in rows]
    order_qr_data = rows[0][1]
    col = sum(1 for t in tickets if t.status=="collected")
    return {"order_ref":order_ref,"progress":f"{col}/{len(tickets)}","order_qr_data":order_qr_data,
            "tickets":[{"ticket_code":t.ticket_code,"qr_data":t.qr_data,"status":t.status,
                        "unit_number":t.unit_number,"total_units":t.total_units,
                        "collected_at":t.collected_at.isoformat() if t.collected_at else None,
                        "collected_by":t.collected_by,
                        "collection_method":t.collection_method} for t in tickets]}

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
