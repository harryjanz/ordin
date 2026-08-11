import hashlib
import hmac
import json as _json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime
from decimal import Decimal
from typing import Optional, List

import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import Column, Integer, String, Numeric, DateTime, select, func
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

DB_URL              = require_env("DB_URL")
ORDER_SVC           = require_env("ORDER_SERVICE_URL")
COMPANY_SVC         = require_env("COMPANY_SERVICE_URL")
INTERNAL_SECRET     = require_env("INTERNAL_SECRET")
INTERNAL_HEADERS    = {"X-Internal-Secret": INTERNAL_SECRET}
MP_WEBHOOK_SECRET   = os.getenv("MP_WEBHOOK_SECRET", "")

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
    refused_reason          = Column(String(255), nullable=True)
    created_at              = Column(DateTime, default=datetime.utcnow)
    updated_at              = Column(DateTime, onupdate=datetime.utcnow)


_WRITE_ROLES = {"admin", "owner", "manager"}


def require_write_role(current_user: TokenPayload = Depends(get_current_user)) -> TokenPayload:
    if current_user.role not in _WRITE_ROLES:
        raise HTTPException(403, "Permissão insuficiente")
    return current_user


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
    id:                      int
    order_ref:               str
    method:                  str
    amount:                  float
    status:                  str
    provider:                str
    nsu:                     Optional[str] = None
    authorization:           Optional[str] = None
    created_at:              str
    # Campos abaixo já existiam na tabela mas nunca eram serializados — ver
    # ORD-080. Usados pelo painel de detalhe expansível da linha.
    company_id:               int
    terminal_id:              int
    environment:              Optional[str] = None
    provider_transaction_id:  Optional[str] = None
    tef_number:               Optional[str] = None
    cancelled_at:             Optional[str] = None
    cancel_reason:            Optional[str] = None
    refused_reason:           Optional[str] = None


class StatusSummaryItem(BaseModel):
    count: int
    amount: float


class PaymentListOut(BaseModel):
    items: list[TransactionOut]
    total: int
    # Agregado por status, ignorando o filtro de status (mas respeitando
    # empresa/provider/período) — ver ORD-078. Sempre com os 5 status do
    # enum presentes, count=0/amount=0 quando não há transação daquele
    # status no recorte filtrado (o frontend não precisa tratar ausência).
    summary: dict[str, StatusSummaryItem]


class CancelOut(BaseModel):
    ok:     bool
    detail: str


class HealthOut(BaseModel):
    service: str
    status:  str


class WebhookOut(BaseModel):
    ok: bool


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
    # Motivo de recusa — só existe pra transações a partir daqui (ORD-080).
    # Transações antigas continuam com refused_reason NULL pra sempre, não
    # dá pra reconstruir um dado que nunca foi capturado.
    if result.status not in (TransactionStatus.approved, TransactionStatus.processing):
        tx.refused_reason = result.error_message
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
    summary="Listar transações da empresa (superadmin vê todas, com filtro opcional de empresa)",
)
async def list_payments(
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
    status: Optional[str] = None,
    provider: Optional[str] = None,
    company_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
):
    # Superadmin enxerga todas as empresas (com filtro opcional de company_id
    # pra restringir a uma) — qualquer outro role só vê a própria empresa,
    # e o parâmetro company_id é ignorado nesse caso (não retorna 403 nem
    # revela se a empresa pedida existe, só se comporta como se o parâmetro
    # não tivesse sido enviado).
    if current_user.role == "superadmin":
        base_filters = [Transaction.company_id == company_id] if company_id else []
    else:
        base_filters = [Transaction.company_id == current_user.company_id]

    if provider:
        base_filters.append(Transaction.provider == provider)
    if date_from:
        base_filters.append(Transaction.created_at >= date_from)
    if date_to:
        base_filters.append(Transaction.created_at <= date_to)

    # filters = base_filters + status, usado na lista/contagem paginada.
    # O resumo por status (summary, abaixo) usa só base_filters — ignora o
    # filtro de status de propósito, pra sempre mostrar a distribuição
    # completa entre os status, mesmo com a tabela filtrada por um só.
    filters = list(base_filters)
    if status:
        filters.append(Transaction.status == status)

    total = (
        await db.execute(select(func.count()).select_from(Transaction).where(*filters))
    ).scalar_one()

    result = await db.execute(
        select(Transaction)
        .where(*filters)
        .order_by(Transaction.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    txs = result.scalars().all()

    summary = {s.value: {"count": 0, "amount": 0.0} for s in TransactionStatus}
    summary_rows = await db.execute(
        select(Transaction.status, func.count(), func.sum(Transaction.amount))
        .where(*base_filters)
        .group_by(Transaction.status)
    )
    for row_status, row_count, row_amount in summary_rows.all():
        if row_status in summary:
            summary[row_status] = {"count": row_count, "amount": float(row_amount or 0)}

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
                "company_id": t.company_id,
                "terminal_id": t.terminal_id,
                "environment": t.environment,
                "provider_transaction_id": t.provider_transaction_id,
                "tef_number": t.tef_number,
                "cancelled_at": str(t.cancelled_at) if t.cancelled_at else None,
                "cancel_reason": t.cancel_reason,
                "refused_reason": t.refused_reason,
            }
            for t in txs
        ],
        "total": total,
        "summary": summary,
    }


@app.post(
    "/payments/{tx_id}/cancel",
    response_model=CancelOut,
    tags=["Pagamentos"],
    summary="Cancelar transação aprovada",
    responses={
        400: {"description": "Transação não está no status `approved`, ou é cartão Mercado Pago já aprovado (estorno ainda não suportado)"},
        403: {"description": "Role sem permissão de cancelamento"},
        404: {"description": "Transação não encontrada"},
        422: {"description": "Cancelamento PayGo permitido apenas no mesmo dia"},
    },
)
async def cancel_payment(
    tx_id: int,
    body: CancelIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_write_role),
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

    # Cancelamento de cartão via Mercado Pago hoje chama a API de intenção de
    # pagamento (payment-intents), pensada pra cancelar uma cobrança em
    # andamento — não a API de Refunds, que é a correta pra estornar um
    # pagamento já capturado. Recusa até confirmar o fluxo de estorno real
    # (ver ORD-079, Achado 3).
    if tx.provider == "mercadopago" and tx.method in ("credit", "debit"):
        raise HTTPException(400, "Cancelamento de cartão via Mercado Pago ainda não suportado — contate o suporte")

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
        "cancelled_by":            current_user.sub,
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


# ── Webhook helpers ───────────────────────────────────────────────────────────

def _verify_mp_signature(secret: str, request_id: str, ts: str, v1: str) -> bool:
    manifest = f"id:{request_id};request-date:{ts};"
    expected = hmac.new(secret.encode(), manifest.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v1)


async def _mp_fetch_and_update(tx: Transaction, payment_id: str, db: AsyncSession) -> None:
    """Consulta /v1/payments na MP e atualiza a transação conforme o status retornado."""
    try:
        terminal_cfg = await _get_terminal_config(tx.terminal_id)
        access_token = (terminal_cfg.get("config") or {}).get("api_key", "")

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://api.mercadopago.com/v1/payments/{payment_id}",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if resp.status_code != 200:
                return

            mp_status = resp.json().get("status", "")

            if mp_status == "approved" and tx.status not in ("approved",):
                tx.status = "approved"
                await db.commit()
                await _notify_order(tx.order_ref, "paid")
                await _publish(
                    "payment.approved",
                    PaymentApprovedEvent(
                        company_id=tx.company_id,
                        order_ref=tx.order_ref,
                        transaction_id=tx.id,
                        amount=str(tx.amount),
                        nsu="",
                        authorization="",
                        provider=tx.provider,
                    ).to_dict(),
                )
            elif mp_status in ("cancelled", "rejected") and tx.status not in ("approved", "cancelled", "refused"):
                tx.status = "cancelled" if mp_status == "cancelled" else "refused"
                await db.commit()
    except Exception as exc:
        logger.warning("Webhook _mp_fetch_and_update error: %s", exc)


async def _handle_mp_notification(payload: dict) -> None:
    """Processa notificação MP em background com sessão DB própria."""
    notification_type = payload.get("type", "")
    data_id = str(payload.get("data", {}).get("id", ""))
    if not data_id:
        return

    async with AsyncSessionLocal() as db:
        try:
            if notification_type == "payment":
                # PIX aprovado via /v1/payments
                result = await db.execute(
                    select(Transaction).where(Transaction.provider_transaction_id == data_id)
                )
                tx = result.scalars().first()
                if tx and tx.status == "processing":
                    await _mp_fetch_and_update(tx, data_id, db)

            elif notification_type == "point_integration_ipn":
                # MP Point: intent UUID → buscar payment_id associado
                action = payload.get("action", "")  # ex: "state_FINISHED"
                result = await db.execute(
                    select(Transaction).where(Transaction.provider_transaction_id == data_id)
                )
                tx = result.scalars().first()
                if not tx:
                    return

                state = action[len("state_"):] if action.startswith("state_") else action

                if state == "FINISHED" and tx.status == "pending":
                    terminal_cfg = await _get_terminal_config(tx.terminal_id)
                    access_token = (terminal_cfg.get("config") or {}).get("api_key", "")
                    async with httpx.AsyncClient(timeout=10) as client:
                        poll = await client.get(
                            f"https://api.mercadopago.com/point/integration-api/payment-intents/{data_id}",
                            headers={"Authorization": f"Bearer {access_token}"},
                        )
                        if poll.status_code == 200:
                            pay_id = poll.json().get("payment", {}).get("id")
                            if pay_id:
                                await _mp_fetch_and_update(tx, str(pay_id), db)

                elif state in ("CANCELED", "ERROR") and tx.status == "pending":
                    tx.status = "cancelled" if state == "CANCELED" else "refused"
                    await db.commit()

        except Exception as exc:
            logger.warning("Webhook MP handler error: %s", exc)


@app.post(
    "/payments/webhook",
    status_code=200,
    response_model=WebhookOut,
    tags=["Pagamentos"],
    summary="Webhook de notificações (MP PIX, MP Point, PayGo)",
    description=(
        "Recebe notificações push dos provedores de pagamento.\n\n"
        "**Mercado Pago:** `?source=mercadopago` (padrão). Valida `x-signature` se "
        "`MP_WEBHOOK_SECRET` estiver configurado. Suporta `type=payment` (PIX) e "
        "`type=point_integration_ipn` (MP Point cartão).\n\n"
        "**PayGo:** `?source=paygo`. Estrutura a confirmar com ControlPay Webservice.\n\n"
        "Sempre retorna HTTP 200 para não bloquear reentregas do provider."
    ),
)
async def payment_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    source: str = "mercadopago",
):
    body = await request.body()

    if source == "mercadopago" and MP_WEBHOOK_SECRET:
        sig_header = request.headers.get("x-signature", "")
        request_id = request.headers.get("x-request-id", "")
        ts = v1 = ""
        for part in sig_header.split(","):
            k, _, v = part.partition("=")
            if k.strip() == "ts":
                ts = v.strip()
            elif k.strip() == "v1":
                v1 = v.strip()
        if not _verify_mp_signature(MP_WEBHOOK_SECRET, request_id, ts, v1):
            logger.warning("Webhook MP: assinatura inválida — descartando")
            raise HTTPException(401, "Assinatura inválida")

    try:
        payload = _json.loads(body)
    except Exception:
        return {"ok": True}

    logger.info("Webhook recebido: source=%s type=%s", source, payload.get("type"))

    if source == "mercadopago":
        background_tasks.add_task(_handle_mp_notification, payload)
    elif source == "paygo":
        # PayGo notifica via callback configurado no request de pagamento.
        # Estrutura do payload a confirmar com ControlPay — implementar quando disponível.
        logger.info("Webhook PayGo: %s", payload)

    return {"ok": True}


@app.get("/health", response_model=HealthOut, tags=["Pagamentos"], summary="Healthcheck")
def health():
    return {"service": "payment", "status": "ok"}
