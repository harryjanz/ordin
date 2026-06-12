import logging
import os
import random
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional, List

import httpx
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import Column, Integer, String, Numeric, DateTime, select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from config import require_env, get_cors_origins
from auth import get_current_user, TokenPayload
from domain.events import PaymentApprovedEvent, PaymentRefusedEvent, PaymentCancelledEvent
from domain.interfaces.message_broker import IMessageBroker
from infrastructure.broker_factory import get_broker

logger = logging.getLogger(__name__)

DB_URL           = require_env("DB_URL")
ORDER_SVC        = require_env("ORDER_SERVICE_URL")
INTERNAL_SECRET  = require_env("INTERNAL_SECRET")
INTERNAL_HEADERS = {"X-Internal-Secret": INTERNAL_SECRET}

engine = create_async_engine(DB_URL.replace("mysql+pymysql://", "mysql+aiomysql://"), pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

_broker: IMessageBroker | None = None


class Base(DeclarativeBase): pass


class Transaction(Base):
    __tablename__ = "transactions"
    id            = Column(Integer, primary_key=True)
    company_id    = Column(Integer, nullable=False, index=True)
    order_ref     = Column(String(12), nullable=False, index=True)
    terminal_id   = Column(Integer, nullable=False)
    tef_number    = Column(String(40), nullable=False)
    method        = Column(String(10), nullable=False)
    amount        = Column(Numeric(10, 2), nullable=False)
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


async def _publish(event: str, payload: dict) -> None:
    if _broker is None:
        return
    try:
        await _broker.publish(event, payload)
    except Exception as exc:
        logger.warning("Broker: falha ao publicar %s — %s", event, exc)


# ── Schemas ───────────────────────────────────────────────────────────────────

class ItemIn(BaseModel):
    product_id: int
    name: str
    qty: int
    unit_price: float

class PaymentIn(BaseModel):
    order_ref: str
    tef_number: str
    method: str
    amount: float
    items: List[ItemIn]
    cpf: Optional[str] = None

class CancelIn(BaseModel):
    reason: Optional[str] = "Cancelamento solicitado"

class PaymentApprovedOut(BaseModel):
    ok: bool
    transaction_id: int
    status: str
    nsu: Optional[str] = None
    authorization: Optional[str] = None
    order_ref: Optional[str] = None
    amount: Optional[float] = None
    error: Optional[str] = None

class TransactionOut(BaseModel):
    id: int
    order_ref: str
    method: str
    amount: float
    status: str
    nsu: Optional[str] = None
    authorization: Optional[str] = None
    created_at: str

class PaymentListOut(BaseModel):
    items: list[TransactionOut]

class CancelOut(BaseModel):
    ok: bool
    detail: str

class HealthOut(BaseModel):
    service: str
    status: str


# ── App ───────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _broker
    broker_name = os.getenv("MESSAGE_BROKER", "sqs")
    _broker = get_broker(broker_name)
    logger.info("Broker iniciado: %s", broker_name)
    yield
    await _broker.close()
    logger.info("Broker encerrado")


_tags = [
    {
        "name": "Pagamentos",
        "description": (
            "Processamento de pagamentos via TEF (PayGo). "
            "Ao aprovar, notifica o `order-service` para marcar o pedido como `paid`. "
            "Ao cancelar, notifica o `order-service` para marcar como `cancelled`."
        ),
    },
]

app = FastAPI(
    title="Ordin — Payment Service",
    description=(
        "Serviço de pagamentos da plataforma Ordin.\n\n"
        "Integra com o PayGo TEF para processar pagamentos nos terminais. "
        "A integração real está pendente (Fase 2); atualmente **simula 95% de aprovação**.\n\n"
        "Ao aprovar ou cancelar um pagamento, notifica o `order-service` via endpoint interno "
        "e publica evento no broker (`IMessageBroker`) para processamento assíncrono.\n\n"
        "**Autenticação:** todos os endpoints exigem `Authorization: Bearer <token>`.\n\n"
        "**Métodos aceitos:** `credit`, `debit`, `pix`, `voucher`."
    ),
    version="1.1.0",
    openapi_tags=_tags,
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Internal-Secret"],
    allow_credentials=True,
)


@app.post(
    "/payments",
    status_code=201,
    response_model=PaymentApprovedOut,
    tags=["Pagamentos"],
    summary="Processar pagamento TEF",
    responses={201: {"description": "Pagamento aprovado ou recusado (ver campo `ok`)"}},
)
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
    db.add(tx)
    await db.commit()
    await db.refresh(tx)

    approved = random.random() < 0.95
    nsu  = f"NSU{int(datetime.utcnow().timestamp())}"
    auth = f"AUT{random.randint(100000, 999999)}"
    tx.status = "approved" if approved else "refused"
    if approved:
        tx.nsu = nsu
        tx.authorization = auth
    await db.commit()

    if approved:
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                await c.patch(
                    f"{ORDER_SVC}/internal/orders/{body.order_ref}/status",
                    json={"status": "paid"},
                    headers=INTERNAL_HEADERS,
                )
        except Exception:
            pass
        await _publish(
            "payment.approved",
            PaymentApprovedEvent(
                company_id=current_user.company_id,
                order_ref=body.order_ref,
                transaction_id=tx.id,
                amount=str(body.amount),
                nsu=nsu,
                authorization=auth,
            ).to_dict(),
        )
        return {
            "ok": True,
            "transaction_id": tx.id,
            "status": "approved",
            "nsu": nsu,
            "authorization": auth,
            "order_ref": body.order_ref,
            "amount": body.amount,
        }

    await _publish(
        "payment.refused",
        PaymentRefusedEvent(
            company_id=current_user.company_id,
            order_ref=body.order_ref,
            transaction_id=tx.id,
            amount=str(body.amount),
        ).to_dict(),
    )
    return {"ok": False, "transaction_id": tx.id, "status": "refused", "error": "Não autorizado"}


@app.get(
    "/payments",
    response_model=PaymentListOut,
    tags=["Pagamentos"],
    summary="Listar transações da empresa",
)
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
    return {
        "items": [
            {
                "id": t.id,
                "order_ref": t.order_ref,
                "method": t.method,
                "amount": float(t.amount),
                "status": t.status,
                "nsu": t.nsu,
                "authorization": t.authorization,
                "created_at": str(t.created_at),
            }
            for t in txs
        ]
    }


@app.post(
    "/payments/{tx_id}/cancel",
    response_model=CancelOut,
    tags=["Pagamentos"],
    summary="Cancelar transação aprovada",
    responses={
        400: {"description": "Transação não está no status `approved`"},
        404: {"description": "Transação não encontrada ou de outra empresa"},
    },
)
async def cancel_payment(
    tx_id: int,
    body: CancelIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    result = await db.execute(
        select(Transaction).where(
            Transaction.id == tx_id,
            Transaction.company_id == current_user.company_id,
        )
    )
    tx = result.scalars().first()
    if not tx:
        raise HTTPException(404)
    if tx.status != "approved":
        raise HTTPException(400, f"Status: {tx.status}")

    tx.status = "cancelled"
    tx.cancelled_at = datetime.utcnow()
    tx.cancel_reason = body.reason
    await db.commit()

    try:
        async with httpx.AsyncClient(timeout=5) as c:
            await c.patch(
                f"{ORDER_SVC}/internal/orders/{tx.order_ref}/status",
                json={"status": "cancelled"},
                headers=INTERNAL_HEADERS,
            )
    except Exception:
        pass

    await _publish(
        "payment.cancelled",
        PaymentCancelledEvent(
            company_id=current_user.company_id,
            order_ref=tx.order_ref,
            transaction_id=tx.id,
            amount=str(tx.amount),
            cancel_reason=body.reason or "",
        ).to_dict(),
    )
    return {"ok": True, "detail": "Transação cancelada"}


@app.get("/health", response_model=HealthOut, tags=["Pagamentos"], summary="Healthcheck")
def health():
    return {"service": "payment", "status": "ok"}
