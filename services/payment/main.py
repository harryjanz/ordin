import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime
from decimal import Decimal
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
from domain.schemas import ProviderConfig, TransactionStatus
from infrastructure.broker_factory import get_broker
from infrastructure.factory import get_provider
from infrastructure.mongo import save_audit

logger = logging.getLogger(__name__)

DB_URL           = require_env("DB_URL")
ORDER_SVC        = require_env("ORDER_SERVICE_URL")
COMPANY_SVC      = require_env("COMPANY_SERVICE_URL")
INTERNAL_SECRET  = require_env("INTERNAL_SECRET")
INTERNAL_HEADERS = {"X-Internal-Secret": INTERNAL_SECRET}

engine = create_async_engine(DB_URL.replace("mysql+pymysql://", "mysql+aiomysql://"), pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

_broker: IMessageBroker | None = None


class Base(DeclarativeBase): pass


class Transaction(Base):
    __tablename__ = "transactions"
    id                      = Column(Integer, primary_key=True)
    company_id              = Column(Integer, nullable=False, index=True)
    order_ref               = Column(String(12), nullable=False, index=True)
    terminal_id             = Column(Integer, nullable=False)
    tef_number              = Column(String(40), nullable=True)
    method                  = Column(String(10), nullable=False)
    amount                  = Column(Numeric(10, 2), nullable=False)
    status                  = Column(String(20), default="pending")
    provider                = Column(String(20), default="mock")
    provider_transaction_id = Column(String(80), nullable=True)
    paygo_terminal_id       = Column(String(40), nullable=True)
    mp_device_id            = Column(String(100), nullable=True)
    environment             = Column(String(10), nullable=True)
    nsu                     = Column(String(40))
    authorization           = Column(String(40))
    paygo_response          = Column(String(2000))
    qr_code                 = Column(String(4000), nullable=True)
    qr_code_base64          = Column(String(100000), nullable=True)
    cancelled_at            = Column(DateTime)
    cancel_reason           = Column(String(255))
    created_at              = Column(DateTime, default=datetime.utcnow)
    updated_at              = Column(DateTime, onupdate=datetime.utcnow)


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


async def _notify_order(order_ref: str, status: str) -> None:
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            await c.patch(
                f"{ORDER_SVC}/internal/orders/{order_ref}/status",
                json={"status": status},
                headers=INTERNAL_HEADERS,
            )
    except Exception:
        pass


async def _get_terminal_config(terminal_id: int) -> dict:
    async with httpx.AsyncClient(timeout=10) as c:
        resp = await c.get(
            f"{COMPANY_SVC}/internal/terminals/{terminal_id}",
            headers=INTERNAL_HEADERS,
        )
    if resp.status_code == 404:
        raise HTTPException(404, "Terminal não encontrado")
    if resp.status_code == 400:
        raise HTTPException(400, resp.json().get("detail", "Config de pagamento inválida"))
    if resp.status_code != 200:
        raise HTTPException(503, "company-service indisponível")
    return resp.json()


# ── Schemas ───────────────────────────────────────────────────────────────────

class ItemIn(BaseModel):
    product_id: int
    name: str
    qty: int
    unit_price: float


class PaymentIn(BaseModel):
    order_ref:  str
    method:     str
    amount:     float
    items:      List[ItemIn]
    cpf:        Optional[str] = None
    tef_number: Optional[str] = None  # legado — ignorado quando company-service fornece config


class CancelIn(BaseModel):
    reason: Optional[str] = "Cancelamento solicitado"


class PaymentApprovedOut(BaseModel):
    ok:             bool
    transaction_id: int
    status:         str
    nsu:            Optional[str] = None
    authorization:  Optional[str] = None
    order_ref:      Optional[str] = None
    amount:         Optional[float] = None
    error:          Optional[str] = None
    qr_code:        Optional[str] = None
    qr_code_base64: Optional[str] = None


class PaymentStatusOut(BaseModel):
    transaction_id: int
    status:         str
    qr_code:        Optional[str] = None
    qr_code_base64: Optional[str] = None


class TransactionOut(BaseModel):
    id:            int
    order_ref:     str
    method:        str
    amount:        float
    status:        str
    provider:      str
    nsu:           Optional[str] = None
    authorization: Optional[str] = None
    created_at:    str


class PaymentListOut(BaseModel):
    items: list[TransactionOut]


class CancelOut(BaseModel):
    ok:     bool
    detail: str


class HealthOut(BaseModel):
    service: str
    status:  str


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
            "Processamento de pagamentos via IPaymentProvider (MockProvider ou PayGoProvider). "
            "Ao aprovar, notifica o `order-service` e publica evento no broker."
        ),
    },
]

app = FastAPI(
    title="Ordin — Payment Service",
    description=(
        "Serviço de pagamentos da plataforma Ordin.\n\n"
        "Integra com providers TEF/PIX via `IPaymentProvider`. "
        "No Sprint 3: **MockProvider** (padrão) e **PayGoProvider** (ControlPay Webservice).\n\n"
        "Credenciais são obtidas do `company-service` por empresa e ambiente — "
        "nunca globais.\n\n"
        "**Autenticação:** todos os endpoints exigem `Authorization: Bearer <token>`.\n\n"
        "**Métodos aceitos:** `credit`, `debit`, `pix`, `voucher`."
    ),
    version="2.0.0",
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
    summary="Processar pagamento TEF/PIX",
    responses={201: {"description": "Pagamento aprovado ou recusado (ver campo `ok`)"}},
)
async def create_payment(
    body: PaymentIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    terminal_id = current_user.terminal_id
    if terminal_id is None:
        raise HTTPException(400, "JWT não contém terminal_id — use token de kiosk")

    # 1. Buscar config do terminal no company-service
    terminal_cfg = await _get_terminal_config(terminal_id)

    provider_name     = terminal_cfg.get("payment_provider", "mock")
    paygo_terminal_id = terminal_cfg.get("paygo_terminal_id")
    mp_device_id      = terminal_cfg.get("mp_device_id")
    environment       = terminal_cfg.get("environment", "sandbox")
    raw_config        = terminal_cfg.get("config") or {}

    if provider_name == "paygo" and not paygo_terminal_id:
        raise HTTPException(400, "Terminal sem paygo_terminal_id configurado")
    if provider_name == "mercadopago" and body.method in ("credit", "debit") and not mp_device_id:
        raise HTTPException(400, "Terminal sem mp_device_id configurado para pagamento com cartão")

    # terminal_ref usado pelo provider (PayGo usa paygo_terminal_id; MP usa mp_device_id)
    terminal_ref = mp_device_id if provider_name == "mercadopago" else (paygo_terminal_id or "")

    # 2. Persistir transação (status=pending)
    tx = Transaction(
        company_id=current_user.company_id,
        order_ref=body.order_ref,
        terminal_id=terminal_id,
        tef_number=paygo_terminal_id or body.tef_number or "",
        method=body.method,
        amount=body.amount,
        status="pending",
        provider=provider_name,
        paygo_terminal_id=paygo_terminal_id,
        mp_device_id=mp_device_id,
        environment=environment,
    )
    db.add(tx)
    await db.commit()
    await db.refresh(tx)

    # 3. Instanciar provider e executar transação
    config = ProviderConfig(
        provider=provider_name,
        environment=environment,
        api_key=raw_config.get("api_key"),
        api_secret=raw_config.get("api_secret"),
        extra_config=raw_config.get("extra_config") or {},
    )
    provider = get_provider(config)

    result = await provider.create_transaction(
        amount=Decimal(str(body.amount)),
        method=body.method,
        terminal_ref=terminal_ref,
        order_ref=body.order_ref,
    )

    # 4. Atualizar MySQL
    tx.status                  = result.status.value
    tx.nsu                     = result.nsu
    tx.authorization           = result.authorization
    tx.provider_transaction_id = result.provider_transaction_id
    tx.qr_code                 = result.qr_code
    tx.qr_code_base64          = result.qr_code_base64
    await db.commit()

    # 5. Auditoria MongoDB (best-effort)
    await save_audit({
        "transaction_id":         tx.id,
        "company_id":             current_user.company_id,
        "order_ref":              body.order_ref,
        "provider":               provider_name,
        "environment":            environment,
        "provider_transaction_id": result.provider_transaction_id,
        "method":                 body.method,
        "amount":                 str(body.amount),
        "paygo_terminal_id":      paygo_terminal_id,
        "events":                 result.audit_events,
        "final_status":           result.status.value,
    })

    # 6. Notificar order-service e publicar evento
    if result.status == TransactionStatus.approved:
        await _notify_order(body.order_ref, "paid")
        await _publish(
            "payment.approved",
            PaymentApprovedEvent(
                company_id=current_user.company_id,
                order_ref=body.order_ref,
                transaction_id=tx.id,
                amount=str(body.amount),
                nsu=result.nsu or "",
                authorization=result.authorization or "",
                provider=provider_name,
            ).to_dict(),
        )
        return {
            "ok": True,
            "transaction_id": tx.id,
            "status": "approved",
            "nsu": result.nsu,
            "authorization": result.authorization,
            "order_ref": body.order_ref,
            "amount": body.amount,
        }

    # PIX criado com sucesso — aguardando pagamento
    if result.status == TransactionStatus.processing:
        return {
            "ok": True,
            "transaction_id": tx.id,
            "status": "processing",
            "order_ref": body.order_ref,
            "amount": body.amount,
            "qr_code": result.qr_code,
            "qr_code_base64": result.qr_code_base64,
        }

    await _publish(
        "payment.refused",
        PaymentRefusedEvent(
            company_id=current_user.company_id,
            order_ref=body.order_ref,
            transaction_id=tx.id,
            amount=str(body.amount),
            provider=provider_name,
        ).to_dict(),
    )
    return {
        "ok": False,
        "transaction_id": tx.id,
        "status": result.status.value,
        "error": result.error_message or "Não autorizado",
    }


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
                "provider": t.provider or "mock",
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
        404: {"description": "Transação não encontrada"},
        422: {"description": "Cancelamento PayGo permitido apenas no mesmo dia"},
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

    # Validação de data para PayGo
    if tx.provider == "paygo":
        if tx.created_at and tx.created_at.date() != datetime.utcnow().date():
            raise HTTPException(422, "Cancelamento PayGo permitido apenas no mesmo dia")

    tx.status = "cancelled"
    tx.cancelled_at = datetime.utcnow()
    tx.cancel_reason = body.reason
    await db.commit()

    # Chamar cancel no provider se PayGo
    if tx.provider == "paygo" and tx.provider_transaction_id:
        try:
            terminal_cfg = await _get_terminal_config(tx.terminal_id)
            raw_config   = terminal_cfg.get("config") or {}
            config = ProviderConfig(
                provider="paygo",
                environment=tx.environment or "sandbox",
                api_key=raw_config.get("api_key"),
                api_secret=raw_config.get("api_secret"),
                extra_config=raw_config.get("extra_config") or {},
            )
            provider = get_provider(config)
            await provider.cancel_transaction(
                provider_transaction_id=tx.provider_transaction_id,
                terminal_ref=tx.paygo_terminal_id or "",
            )
        except HTTPException:
            pass
        except Exception as exc:
            logger.warning("PayGo cancel error: %s", exc)

    await _notify_order(tx.order_ref, "cancelled")
    await _publish(
        "payment.cancelled",
        PaymentCancelledEvent(
            company_id=current_user.company_id,
            order_ref=tx.order_ref,
            transaction_id=tx.id,
            amount=str(tx.amount),
            cancel_reason=body.reason or "",
            provider=tx.provider or "mock",
        ).to_dict(),
    )

    await save_audit({
        "transaction_id":          tx.id,
        "company_id":              current_user.company_id,
        "order_ref":               tx.order_ref,
        "provider":                tx.provider,
        "environment":             tx.environment,
        "provider_transaction_id": tx.provider_transaction_id,
        "events":                  [{"event": "cancelled", "ts": datetime.utcnow().isoformat(),
                                     "reason": body.reason}],
        "final_status":            "cancelled",
    })

    return {"ok": True, "detail": "Transação cancelada"}


class TestConnectionOut(BaseModel):
    success: bool
    detail: str


@app.post(
    "/payments/test-connection",
    response_model=TestConnectionOut,
    tags=["Pagamentos"],
    summary="Testar conexão com a máquina de pagamento (R$ 0,01 auto-cancelado)",
)
async def test_connection(
    current_user: TokenPayload = Depends(get_current_user),
):
    if current_user.role != "kiosk" or current_user.terminal_id is None:
        raise HTTPException(403, "Apenas kiosk pode testar conexão")

    terminal_cfg = await _get_terminal_config(current_user.terminal_id)
    provider_name     = terminal_cfg.get("payment_provider", "mock")
    paygo_terminal_id = terminal_cfg.get("paygo_terminal_id") or ""
    environment       = terminal_cfg.get("environment", "sandbox")
    raw_config        = terminal_cfg.get("config") or {}

    if provider_name == "paygo" and not paygo_terminal_id:
        return TestConnectionOut(success=False, detail="Terminal sem credenciais TEF configuradas")

    config = ProviderConfig(
        provider=provider_name,
        environment=environment,
        api_key=raw_config.get("api_key"),
        api_secret=raw_config.get("api_secret"),
        extra_config=raw_config.get("extra_config") or {},
    )
    provider = get_provider(config)

    import asyncio
    try:
        result = await asyncio.wait_for(
            provider.test_connection(terminal_ref=paygo_terminal_id),
            timeout=30.0,
        )
    except asyncio.TimeoutError:
        return TestConnectionOut(success=False, detail="Timeout aguardando máquina de pagamento (30s)")

    return TestConnectionOut(success=result["success"], detail=result.get("detail", ""))


@app.get(
    "/payments/{tx_id}/status",
    response_model=PaymentStatusOut,
    tags=["Pagamentos"],
    summary="Consultar status de pagamento PIX (polling do totem)",
)
async def get_payment_status(
    tx_id: int,
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
        raise HTTPException(404, "Transação não encontrada")

    # Se ainda está em processamento e é MP, consulta a API para atualizar
    if tx.status == "processing" and tx.provider == "mercadopago" and tx.provider_transaction_id:
        terminal_cfg = await _get_terminal_config(tx.terminal_id)
        raw_config   = terminal_cfg.get("config") or {}
        access_token = raw_config.get("api_key", "")

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"https://api.mercadopago.com/v1/payments/{tx.provider_transaction_id}",
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                if resp.status_code == 200:
                    data   = resp.json()
                    mp_status = data.get("status", "pending")

                    if mp_status == "approved":
                        tx.status = "approved"
                        await db.commit()
                        await _notify_order(tx.order_ref, "paid")
                        await _publish(
                            "payment.approved",
                            PaymentApprovedEvent(
                                company_id=current_user.company_id,
                                order_ref=tx.order_ref,
                                transaction_id=tx.id,
                                amount=str(tx.amount),
                                nsu="",
                                authorization="",
                                provider=tx.provider,
                            ).to_dict(),
                        )
                    elif mp_status in ("cancelled", "rejected"):
                        tx.status = "cancelled" if mp_status == "cancelled" else "refused"
                        await db.commit()
        except Exception as exc:
            logger.warning("MP status poll error: %s", exc)

    return {
        "transaction_id": tx.id,
        "status": tx.status,
        "qr_code": tx.qr_code,
        "qr_code_base64": tx.qr_code_base64,
    }


@app.delete(
    "/payments/{tx_id}",
    response_model=CancelOut,
    tags=["Pagamentos"],
    summary="Cancelar PIX pendente (timeout ou desistência do cliente)",
)
async def delete_payment(
    tx_id: int,
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
        raise HTTPException(404, "Transação não encontrada")
    if tx.status not in ("processing", "pending"):
        raise HTTPException(400, f"Não é possível cancelar transação com status '{tx.status}'")

    tx.status      = "cancelled"
    tx.cancelled_at = datetime.utcnow()
    tx.cancel_reason = "Cancelado pelo totem"
    await db.commit()

    await _notify_order(tx.order_ref, "cancelled")
    await _publish(
        "payment.cancelled",
        PaymentCancelledEvent(
            company_id=current_user.company_id,
            order_ref=tx.order_ref,
            transaction_id=tx.id,
            amount=str(tx.amount),
            cancel_reason="Cancelado pelo totem",
            provider=tx.provider or "mock",
        ).to_dict(),
    )

    return {"ok": True, "detail": "PIX cancelado"}


@app.get("/health", response_model=HealthOut, tags=["Pagamentos"], summary="Healthcheck")
def health():
    return {"service": "payment", "status": "ok"}
