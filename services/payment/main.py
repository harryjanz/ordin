import hashlib
import hmac
import json as _json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Literal

import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, Integer, Numeric, String, Text, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from auth import TokenPayload, get_current_user
from config import get_cors_origins, require_env
from domain.events import (
    PaymentApprovedEvent,
    PaymentCancelledEvent,
    PaymentRefundedEvent,
    PaymentRefusedEvent,
)
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
    # Text (não String) — bate com as migrations reais (20260618_1100), que
    # criam as duas colunas como TEXT. O model declarava String(4000)/
    # String(100000), que nunca é usado pra criar a tabela em prod/dev (isso
    # é trabalho do Alembic) mas quebra `Base.metadata.create_all()` nos
    # testes que rodam contra MySQL de verdade — VARCHAR(100000) em utf8mb4
    # estoura o limite de 16383 caracteres (65535 bytes ÷ 4).
    qr_code                 = Column(Text, nullable=True)
    qr_code_base64          = Column(Text, nullable=True)
    cancelled_at            = Column(DateTime)
    cancel_reason           = Column(String(255))
    refused_reason          = Column(String(255), nullable=True)
    refunded_at             = Column(DateTime, nullable=True)
    refund_reason           = Column(String(255), nullable=True)
    created_at              = Column(DateTime, default=datetime.utcnow)
    updated_at              = Column(DateTime, onupdate=datetime.utcnow)


_WRITE_ROLES = {"admin", "owner", "manager", "superadmin"}


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


async def _get_mp_webhook_secret(company_id: int) -> tuple[bool, str | None]:
    """Busca o webhook_secret do Mercado Pago da empresa (ORD-131) — cada
    empresa tem sua própria aplicação/conta MP, logo seu próprio secret.
    Retorna (config_existe, secret). config_existe=False significa que a
    empresa não tem nenhuma config MP ativa — o handler do webhook não deve
    processar nada nesse caso. secret=None com config_existe=True significa
    que a config existe mas o campo ainda não foi preenchido (aceita sem
    validar assinatura, mesmo comportamento permissivo de antes da ORD-131)."""
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            resp = await c.get(
                f"{COMPANY_SVC}/internal/companies/{company_id}/payment-config",
                params={"provider": "mercadopago"},
                headers=INTERNAL_HEADERS,
            )
        if resp.status_code != 200:
            return False, None
        return True, resp.json().get("webhook_secret")
    except Exception as exc:
        logger.warning("Erro ao buscar webhook_secret da empresa %s: %s", company_id, exc)
        return False, None


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
    items:      list[ItemIn]
    cpf:        str | None = None
    tef_number: str | None = None  # legado — ignorado quando company-service fornece config


class CancelIn(BaseModel):
    reason: str | None = "Cancelamento solicitado"


class RefundIn(BaseModel):
    reason: str | None = "Reembolso solicitado"


class PaymentApprovedOut(BaseModel):
    ok:             bool
    transaction_id: int
    status:         str
    nsu:            str | None = None
    authorization:  str | None = None
    order_ref:      str | None = None
    amount:         float | None = None
    error:          str | None = None
    qr_code:        str | None = None
    qr_code_base64: str | None = None


class PaymentStatusOut(BaseModel):
    transaction_id: int
    status:         str
    qr_code:        str | None = None
    qr_code_base64: str | None = None


class TransactionOut(BaseModel):
    id:                      int
    order_ref:               str
    method:                  str
    amount:                  float
    status:                  str
    provider:                str
    nsu:                     str | None = None
    authorization:           str | None = None
    created_at:              str
    # Campos abaixo já existiam na tabela mas nunca eram serializados — ver
    # ORD-080. Usados pelo painel de detalhe expansível da linha.
    company_id:               int
    terminal_id:              int
    environment:              str | None = None
    provider_transaction_id:  str | None = None
    tef_number:               str | None = None
    cancelled_at:             str | None = None
    cancel_reason:            str | None = None
    refused_reason:           str | None = None
    refunded_at:              str | None = None
    refund_reason:            str | None = None


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


class PeriodMetrics(BaseModel):
    revenue: float
    ticket_medio: float
    volume: int


# label já formatado pelo backend ("00h", "05/08", "MM/AAAA" conforme a
# granularidade pedida) — evita duplicar regra de formatação no frontend.
class RevenuePoint(BaseModel):
    label: str
    revenue: float
    # Mesma posição/granularidade, mas da janela anterior — alinhado por
    # índice, não por data (a janela anterior pode ter buckets em datas bem
    # diferentes da atual). Usado pro gráfico comparativo, ver ORD-103.
    previous_revenue: float


class TerminalBreakdown(BaseModel):
    terminal_id: int
    revenue: float
    ticket_medio: float
    volume: int


class MethodBreakdown(BaseModel):
    method: str
    revenue: float
    ticket_medio: float
    volume: int


class PaymentAnalyticsOut(BaseModel):
    current: PeriodMetrics
    previous: PeriodMetrics
    # None quando o período anterior tem denominador 0 (não dá pra calcular
    # variação percentual "a partir de zero") — ver ORD-101.
    change_pct: dict[str, float | None]
    granularity: str
    series: list[RevenuePoint]
    by_terminal: list[TerminalBreakdown]
    by_method: list[MethodBreakdown]


class CancelOut(BaseModel):
    ok:     bool
    detail: str


class RefundOut(BaseModel):
    ok:             bool
    transaction_id: int
    status:         str


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
    if provider_name == "mercadopago" and mp_device_id and "__" not in mp_device_id:
        # Formato exigido pela API de Orders do MP Point: "{tipo_terminal}__{serial}"
        # (ex.: "PAX_A910__SMARTPOS1234567890"), igual ao `id` retornado por
        # GET /terminals/v1/list. Um mp_device_id fora desse formato (ex.: só o
        # serial) faz a order nunca chegar à maquininha por push — o operador
        # só vê o pedido apertando "Atualizar" no terminal.
        raise HTTPException(
            400,
            "mp_device_id fora do formato esperado ({tipo_terminal}__{serial}) — "
            "reconfigure com o id exato retornado por GET /terminals/v1/list, "
            "senão a order não chega ao terminal automaticamente",
        )

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
    status: str | None = None,
    provider: str | None = None,
    environment: str | None = None,
    company_id: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    skip: int = 0,
    limit: int = 50,
):
    # Superadmin/admin enxergam todas as empresas (com filtro opcional de
    # company_id pra restringir a uma) — mesmo tratamento pros dois desde
    # que passaram a ser equivalentes em capacidade (ver
    # docs/ARQUITETURA.md §1.2, commit 85be419). Qualquer outro role só vê a
    # própria empresa, e o parâmetro company_id é ignorado nesse caso (não
    # retorna 403 nem revela se a empresa pedida existe, só se comporta
    # como se o parâmetro não tivesse sido enviado).
    if current_user.role in ("superadmin", "admin"):
        base_filters = [Transaction.company_id == company_id] if company_id else []
    else:
        base_filters = [Transaction.company_id == current_user.company_id]

    if provider:
        base_filters.append(Transaction.provider == provider)
    if environment:
        base_filters.append(Transaction.environment == environment)
    if date_from:
        base_filters.append(Transaction.created_at >= date_from)
    if date_to:
        # ORD-134: date_to é "AAAA-MM-DD" — comparar created_at <= date_to
        # equivale a <= meia-noite daquele dia, escondendo qualquer
        # transação do próprio dia final criada depois das 00:00. Vira
        # limite exclusivo no dia seguinte, mesmo padrão já usado em
        # payments_analytics (linha ~672).
        try:
            date_to_exclusive = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
        except ValueError:
            raise HTTPException(400, "date_to deve estar no formato AAAA-MM-DD")
        base_filters.append(Transaction.created_at < date_to_exclusive)

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
                "refunded_at": str(t.refunded_at) if t.refunded_at else None,
                "refund_reason": t.refund_reason,
            }
            for t in txs
        ],
        "total": total,
        "summary": summary,
    }


def _build_series(
    rows: list,
    start: datetime,
    end: datetime,
    granularity: Literal["hour", "day", "week", "month"],
) -> list[dict]:
    """Agrupa `rows` (created_at, amount, ...) em baldes zero-preenchidos
    cobrindo toda a janela [start, end), conforme a granularidade — mesmo
    princípio do antigo `hourly` (sempre 24 entradas), generalizado."""
    if granularity == "hour":
        buckets = [(f"{h:02d}", f"{h:02d}h") for h in range(24)]
        key_of = lambda dt: f"{dt.hour:02d}"
    elif granularity == "day":
        buckets = []
        d = start.date()
        last = (end - timedelta(days=1)).date()
        while d <= last:
            buckets.append((d.isoformat(), d.strftime("%d/%m")))
            d += timedelta(days=1)
        key_of = lambda dt: dt.date().isoformat()
    elif granularity == "week":
        buckets = []
        d = start.date() - timedelta(days=start.date().weekday())  # segunda-feira da semana de start
        last = (end - timedelta(days=1)).date()
        while d <= last:
            buckets.append((d.isoformat(), d.strftime("%d/%m")))
            d += timedelta(days=7)
        def key_of(dt):
            wd = dt.date() - timedelta(days=dt.date().weekday())
            return wd.isoformat()
    else:  # month
        buckets = []
        y, m = start.year, start.month
        last_dt = end - timedelta(days=1)
        while (y, m) <= (last_dt.year, last_dt.month):
            buckets.append((f"{y:04d}-{m:02d}", f"{m:02d}/{y:04d}"))
            m += 1
            if m == 13:
                m = 1
                y += 1
        key_of = lambda dt: f"{dt.year:04d}-{dt.month:02d}"

    totals: dict[str, float] = {}
    for created_at, amount, *_rest in rows:
        k = key_of(created_at)
        totals[k] = totals.get(k, 0.0) + float(amount)

    return [{"label": label, "revenue": round(totals.get(k, 0.0), 2)} for k, label in buckets]


@app.get(
    "/payments/analytics",
    response_model=PaymentAnalyticsOut,
    tags=["Pagamentos"],
    summary="KPIs comparativos, série temporal, venda por terminal e por forma de pagamento (ORD-101/ORD-102)",
)
async def payments_analytics(
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
    company_id: int | None = None,
    date_from: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
    granularity: Literal["hour", "day", "week", "month"] = "hour",
):
    # Mesmo tratamento de escopo por empresa de list_payments (main.py:441-444).
    if current_user.role in ("superadmin", "admin"):
        base_filters = [Transaction.company_id == company_id] if company_id else []
    else:
        base_filters = [Transaction.company_id == current_user.company_id]

    try:
        start = datetime.strptime(date_from, "%Y-%m-%d")
        # date_to é inclusive do dia inteiro — diferente do filtro simples de
        # GET /payments (created_at <= date_to, que exclui parte do próprio
        # dia). Vira limite exclusivo em start_do_dia_seguinte.
        end = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
    except ValueError:
        raise HTTPException(422, "date_from/date_to devem estar no formato AAAA-MM-DD")
    if end <= start:
        raise HTTPException(422, "date_to deve ser maior ou igual a date_from")

    duration = end - start
    prev_start = start - duration
    prev_end = start

    async def period_metrics(window_start: datetime, window_end: datetime) -> dict:
        row = (await db.execute(
            select(func.count(), func.sum(Transaction.amount))
            .where(
                *base_filters,
                Transaction.status == TransactionStatus.approved,
                Transaction.created_at >= window_start,
                Transaction.created_at < window_end,
            )
        )).one()
        count = row[0] or 0
        revenue = float(row[1] or 0)
        return {"revenue": revenue, "ticket_medio": (revenue / count) if count else 0.0, "volume": count}

    current = await period_metrics(start, end)
    previous = await period_metrics(prev_start, prev_end)

    def pct(cur: float, prev: float) -> float | None:
        if not prev:
            return None
        return round((cur - prev) / prev * 100, 1)

    change_pct = {
        "revenue": pct(current["revenue"], previous["revenue"]),
        "ticket_medio": pct(current["ticket_medio"], previous["ticket_medio"]),
        "volume": pct(current["volume"], previous["volume"]),
    }

    # Uma única busca bruta do período atual alimenta as 3 quebras abaixo
    # (série temporal, por terminal, por forma de pagamento) — menos
    # round-trip que uma query GROUP BY por quebra, e portável (não depende
    # mais de func.hour(), específico de MySQL).
    rows = (await db.execute(
        select(Transaction.created_at, Transaction.amount, Transaction.terminal_id, Transaction.method)
        .where(
            *base_filters,
            Transaction.status == TransactionStatus.approved,
            Transaction.created_at >= start,
            Transaction.created_at < end,
        )
    )).all()

    series = _build_series(rows, start, end, granularity)

    # Série da janela anterior (mesma já usada pelos KPIs `previous`/
    # `change_pct`) — alinhada por posição com `series`, não por data, já
    # que as duas janelas cobrem calendários diferentes (ver ORD-103).
    prev_rows = (await db.execute(
        select(Transaction.created_at, Transaction.amount)
        .where(
            *base_filters,
            Transaction.status == TransactionStatus.approved,
            Transaction.created_at >= prev_start,
            Transaction.created_at < prev_end,
        )
    )).all()
    prev_series = _build_series(prev_rows, prev_start, prev_end, granularity)
    for i, point in enumerate(series):
        point["previous_revenue"] = prev_series[i]["revenue"] if i < len(prev_series) else 0.0

    terminal_totals: dict[int, dict] = {}
    for created_at, amount, terminal_id, _method in rows:
        acc = terminal_totals.setdefault(terminal_id, {"revenue": 0.0, "volume": 0})
        acc["revenue"] += float(amount)
        acc["volume"] += 1
    by_terminal = sorted(
        (
            {
                "terminal_id": t_id,
                "revenue": acc["revenue"],
                "ticket_medio": acc["revenue"] / acc["volume"] if acc["volume"] else 0.0,
                "volume": acc["volume"],
            }
            for t_id, acc in terminal_totals.items()
        ),
        key=lambda t: t["revenue"],
        reverse=True,
    )

    method_totals: dict[str, dict] = {}
    for created_at, amount, _terminal_id, method in rows:
        acc = method_totals.setdefault(method, {"revenue": 0.0, "volume": 0})
        acc["revenue"] += float(amount)
        acc["volume"] += 1
    by_method = sorted(
        (
            {
                "method": m,
                "revenue": acc["revenue"],
                "ticket_medio": acc["revenue"] / acc["volume"] if acc["volume"] else 0.0,
                "volume": acc["volume"],
            }
            for m, acc in method_totals.items()
        ),
        key=lambda m: m["revenue"],
        reverse=True,
    )

    return {
        "current": current,
        "previous": previous,
        "change_pct": change_pct,
        "granularity": granularity,
        "series": series,
        "by_terminal": by_terminal,
        "by_method": by_method,
    }


@app.post(
    "/payments/{tx_id}/cancel",
    response_model=CancelOut,
    tags=["Pagamentos"],
    summary="Cancelar transação aprovada",
    responses={
        400: {"description": "Transação não está no status `approved`, ou é Mercado Pago já aprovado (use POST /payments/{tx_id}/refund)"},
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
    # Superadmin/admin cancelam transação de qualquer empresa (mesmo padrão
    # de list_payments) — outros roles seguem restritos à própria empresa.
    tx_filters = [Transaction.id == tx_id]
    if current_user.role not in ("superadmin", "admin"):
        tx_filters.append(Transaction.company_id == current_user.company_id)
    result = await db.execute(select(Transaction).where(*tx_filters))
    tx = result.scalars().first()
    if not tx:
        raise HTTPException(404)
    if tx.status != "approved":
        raise HTTPException(400, f"Status: {tx.status}")

    # Transação Mercado Pago já aprovada é sempre um caso de REEMBOLSO, não
    # de cancelamento — dinheiro já foi capturado. Vale pra cartão E PIX:
    # antes do ORD-147 este guard só bloqueava credit/debit, deixando PIX MP
    # aprovado cair no `tx.status = "cancelled"` abaixo sem nunca chamar
    # nenhuma API do provider (bug latente, nunca alcançável pela UI porque
    # o frontend já escondia a ação, mas explorável via chamada direta).
    if tx.provider == "mercadopago":
        raise HTTPException(400, "Transação Mercado Pago já aprovada — use POST /payments/{tx_id}/refund")

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


@app.post(
    "/payments/{tx_id}/refund",
    response_model=RefundOut,
    tags=["Pagamentos"],
    summary="Reembolsar transação Mercado Pago já aprovada (cartão ou PIX)",
    responses={
        400: {"description": "Transação não está `approved`, provider não é Mercado Pago, ou transação sem provider_transaction_id"},
        403: {"description": "Role sem permissão de reembolso"},
        404: {"description": "Transação não encontrada"},
        422: {"description": "Fora do prazo de reembolso da integração (90 dias cartão / 180 dias PIX)"},
        502: {"description": "Mercado Pago recusou o reembolso (saldo insuficiente, id inválido, etc.)"},
    },
)
async def refund_payment(
    tx_id: int,
    body: RefundIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_write_role),
):
    # Mesmo filtro de tenant do cancelamento — superadmin/admin vê qualquer
    # empresa, demais roles restritos à própria.
    tx_filters = [Transaction.id == tx_id]
    if current_user.role not in ("superadmin", "admin"):
        tx_filters.append(Transaction.company_id == current_user.company_id)
    result = await db.execute(select(Transaction).where(*tx_filters))
    tx = result.scalars().first()
    if not tx:
        raise HTTPException(404)
    # status != "approved" cobre tanto "nunca foi aprovada" quanto "já foi
    # reembolsada/cancelada antes" (status vira "refunded"/"cancelled") —
    # não precisa de checagem de idempotência separada.
    if tx.status != "approved":
        raise HTTPException(400, f"Status: {tx.status}")
    if tx.provider != "mercadopago":
        raise HTTPException(400, "Reembolso disponível apenas para Mercado Pago — use POST /payments/{tx_id}/cancel para outros providers")
    if not tx.provider_transaction_id:
        raise HTTPException(400, "Transação sem provider_transaction_id — não é possível reembolsar")

    terminal_cfg = await _get_terminal_config(tx.terminal_id)
    raw_config = terminal_cfg.get("config") or {}
    config = ProviderConfig(
        provider="mercadopago",
        environment=tx.environment or "sandbox",
        api_key=raw_config.get("api_key"),
        api_secret=raw_config.get("api_secret"),
        extra_config=raw_config.get("extra_config") or {},
    )
    provider = get_provider(config)

    # Checagem de prazo — pergunta ao próprio provider (capacidade dele, não
    # uma tabela genérica aqui), evita chamada desnecessária ao Mercado Pago
    # quando já sabemos que vai ser recusado. Ver ORD-147.
    limit_days = provider.refund_window_days(tx.method)
    if limit_days is not None and tx.created_at:
        if (datetime.utcnow() - tx.created_at).days > limit_days:
            raise HTTPException(422, f"Prazo de reembolso expirado — {tx.provider} aceita até {limit_days} dias da aprovação")

    refund_result = await provider.refund_transaction(provider_transaction_id=tx.provider_transaction_id)

    # Auditoria mesmo em caso de falha (rastro forense, mesmo padrão do ORD-132).
    await save_audit({
        "transaction_id":          tx.id,
        "company_id":              current_user.company_id,
        "order_ref":               tx.order_ref,
        "provider":                tx.provider,
        "environment":             tx.environment,
        "provider_transaction_id": tx.provider_transaction_id,
        "refunded_by":             current_user.sub,
        "events":                  [{
            "event": "refund_attempt",
            "ts": datetime.utcnow().isoformat(),
            "reason": body.reason,
            "success": refund_result.success,
            "error_message": refund_result.error_message,
            "raw_response": refund_result.raw_response,
        }],
        "final_status": "refunded" if refund_result.success else tx.status,
    })

    if not refund_result.success:
        # Transação NÃO muda de status local — diferente do cancelamento
        # PayGo (best-effort), reembolso só é confirmado quando o Mercado
        # Pago confirma de verdade.
        raise HTTPException(502, refund_result.error_message or "Mercado Pago recusou o reembolso")

    tx.status = "refunded"
    tx.refunded_at = datetime.utcnow()
    tx.refund_reason = body.reason
    await db.commit()

    await _publish(
        "payment.refunded",
        PaymentRefundedEvent(
            company_id=current_user.company_id,
            order_ref=tx.order_ref,
            transaction_id=tx.id,
            amount=str(tx.amount),
            refund_reason=body.reason or "",
            provider=tx.provider or "mock",
        ).to_dict(),
    )

    return {"ok": True, "transaction_id": tx.id, "status": "refunded"}


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

    terminal_cfg  = await _get_terminal_config(current_user.terminal_id)
    provider_name = terminal_cfg.get("payment_provider", "mock")
    environment   = terminal_cfg.get("environment", "sandbox")
    raw_config    = terminal_cfg.get("config") or {}

    # ORD-149: terminal_ref identifica o hardware físico pra cada provider —
    # PayGo usa paygo_terminal_id (PIN-pad), Mercado Pago usa mp_device_id
    # (terminal Point). Antes desta história, MP sempre recebia
    # paygo_terminal_id (bug: sempre vazio pra MP, terminal_ref nunca
    # carregava o device de verdade).
    if provider_name == "paygo":
        terminal_ref = terminal_cfg.get("paygo_terminal_id") or ""
        if not terminal_ref:
            return TestConnectionOut(success=False, detail="Terminal sem credenciais TEF configuradas")
    elif provider_name == "mercadopago":
        # Vazio é um caso válido aqui (terminal ainda sem Point vinculado, ou
        # só PIX) — tratado dentro do provider, não é erro neste ponto.
        terminal_ref = terminal_cfg.get("mp_device_id") or ""
    else:
        terminal_ref = ""

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
            provider.test_connection(terminal_ref=terminal_ref),
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

def _verify_mp_signature(secret: str, data_id: str, request_id: str, ts: str, v1: str) -> bool:
    """Manifest oficial do Mercado Pago: id:{data.id em minúsculas};request-id:{x-request-id};ts:{ts};
    data_id vem da query string (?data.id=...), não do body — são valores
    normalmente iguais, mas a assinatura é calculada especificamente sobre o
    da query string."""
    manifest = f"id:{data_id.lower()};request-id:{request_id};ts:{ts};"
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
            await save_audit({
                "event": "webhook_status_check", "provider": "mercadopago",
                "company_id": tx.company_id, "transaction_id": tx.id, "order_ref": tx.order_ref,
                "data_id": payment_id, "http_status": resp.status_code,
                "payload": resp.json() if resp.status_code == 200 else {"raw": resp.text},
            })
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


async def _mp_order_fetch_and_update(tx: Transaction, order_id: str, db: AsyncSession) -> None:
    """Consulta /v1/orders na MP (API de Orders do Point) e atualiza a transação
    conforme o status retornado. Equivalente a _mp_fetch_and_update, mas para
    orders de cartão em vez de payments de PIX — os dois recursos têm
    vocabulário de status diferente (order: processed/failed/canceled/expired
    vs payment: approved/cancelled/rejected)."""
    try:
        terminal_cfg = await _get_terminal_config(tx.terminal_id)
        access_token = (terminal_cfg.get("config") or {}).get("api_key", "")

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://api.mercadopago.com/v1/orders/{order_id}",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            await save_audit({
                "event": "webhook_status_check", "provider": "mercadopago",
                "company_id": tx.company_id, "transaction_id": tx.id, "order_ref": tx.order_ref,
                "data_id": order_id, "http_status": resp.status_code,
                "payload": resp.json() if resp.status_code == 200 else {"raw": resp.text},
            })
            if resp.status_code != 200:
                return

            order_status = resp.json().get("status", "")

            if order_status == "processed" and tx.status not in ("approved",):
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
            elif order_status in ("failed", "canceled", "expired") and tx.status not in ("approved", "cancelled", "refused"):
                tx.status = "cancelled" if order_status == "canceled" else "refused"
                await db.commit()
    except Exception as exc:
        logger.warning("Webhook _mp_order_fetch_and_update error: %s", exc)


async def _handle_mp_notification(payload: dict, company_id: int) -> None:
    """Processa notificação MP em background com sessão DB própria."""
    notification_type = payload.get("type", "")
    data_id = str(payload.get("data", {}).get("id", ""))
    if not data_id:
        return

    async with AsyncSessionLocal() as db:
        tx = None
        try:
            if notification_type == "payment":
                # PIX aprovado via /v1/payments
                result = await db.execute(
                    select(Transaction).where(Transaction.provider_transaction_id == data_id)
                )
                tx = result.scalars().first()
                if tx and tx.status == "processing":
                    await _mp_fetch_and_update(tx, data_id, db)

            elif notification_type == "order":
                # MP Point: order id da API de Orders (tópico "Order (Mercado
                # Pago)", substitui o antigo point_integration_ipn)
                result = await db.execute(
                    select(Transaction).where(Transaction.provider_transaction_id == data_id)
                )
                tx = result.scalars().first()
                if tx and tx.status == "pending":
                    await _mp_order_fetch_and_update(tx, data_id, db)

            # ORD-132: audita o payload de retorno independente de ter
            # encontrado a transação — correlated=False é rastro forense
            # útil (notificação atrasada/duplicada/de transação já mudada
            # por outro caminho), não deve ser descartado silenciosamente.
            await save_audit({
                "event": "webhook_received", "provider": "mercadopago", "webhook_type": notification_type,
                "company_id": tx.company_id if tx else company_id,
                "transaction_id": tx.id if tx else None,
                "order_ref": tx.order_ref if tx else None,
                "data_id": data_id, "signature_valid": True, "correlated": tx is not None,
                "payload": payload,
            })
        except Exception as exc:
            logger.warning("Webhook MP handler error: %s", exc)


@app.post(
    "/payments/webhook/mercadopago/{company_id}",
    status_code=200,
    response_model=WebhookOut,
    tags=["Pagamentos"],
    summary="Webhook de notificações — Mercado Pago (por empresa)",
    description=(
        "Recebe notificações push do Mercado Pago. A URL é específica por "
        "empresa (ORD-131) porque cada empresa tem sua própria aplicação/conta "
        "MP e, portanto, seu próprio webhook_secret — não dá para validar a "
        "assinatura sem antes saber de qual empresa é a notificação, e a URL "
        "por empresa resolve isso sem depender de dado não confiável do "
        "payload. Valida `x-signature` se a empresa tiver `webhook_secret` "
        "configurado em `company_payment_configs`. Suporta `type=payment` "
        "(PIX) e `type=order` (MP Point cartão, tópico \"Order (Mercado "
        "Pago)\").\n\nSempre retorna HTTP 200 para não bloquear reentregas "
        "do Mercado Pago."
    ),
)
async def payment_webhook_mercadopago(
    company_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
):
    body = await request.body()

    config_existe, secret = await _get_mp_webhook_secret(company_id)
    if not config_existe:
        logger.warning("Webhook MP: empresa %s sem config Mercado Pago ativa — ignorando", company_id)
        return {"ok": True}

    if secret:
        data_id = request.query_params.get("data.id", "")
        sig_header = request.headers.get("x-signature", "")
        request_id = request.headers.get("x-request-id", "")
        ts = v1 = ""
        for part in sig_header.split(","):
            k, _, v = part.partition("=")
            if k.strip() == "ts":
                ts = v.strip()
            elif k.strip() == "v1":
                v1 = v.strip()
        if not _verify_mp_signature(secret, data_id, request_id, ts, v1):
            # ORD-132: audita a tentativa mesmo rejeitada — valor forense
            # (pode ser tentativa de forjar notificação de pagamento).
            try:
                payload_invalido = _json.loads(body)
            except Exception:
                payload_invalido = {"raw": body.decode(errors="replace")}
            await save_audit({
                "event": "webhook_received", "provider": "mercadopago",
                "webhook_type": payload_invalido.get("type") if isinstance(payload_invalido, dict) else None,
                "company_id": company_id, "transaction_id": None, "order_ref": None,
                "data_id": data_id, "signature_valid": False, "correlated": False,
                "payload": payload_invalido,
            })
            logger.warning("Webhook MP: assinatura inválida (empresa %s) — descartando", company_id)
            raise HTTPException(401, "Assinatura inválida")

    try:
        payload = _json.loads(body)
    except Exception:
        return {"ok": True}

    logger.info("Webhook MP recebido: empresa=%s type=%s", company_id, payload.get("type"))
    background_tasks.add_task(_handle_mp_notification, payload, company_id)

    return {"ok": True}


@app.post(
    "/payments/webhook/paygo",
    status_code=200,
    response_model=WebhookOut,
    tags=["Pagamentos"],
    summary="Webhook de notificações — PayGo",
    description=(
        "Recebe notificações push do PayGo/ControlPay. Estrutura a confirmar "
        "com ControlPay Webservice — implementar quando disponível.\n\n"
        "Sempre retorna HTTP 200 para não bloquear reentregas do provider."
    ),
)
async def payment_webhook_paygo(request: Request):
    body = await request.body()
    try:
        payload = _json.loads(body)
    except Exception:
        return {"ok": True}
    # PayGo notifica via callback configurado no request de pagamento.
    # Estrutura do payload a confirmar com ControlPay — implementar quando disponível.
    # ORD-132: company_id=None porque a rota (ainda placeholder) não recebe
    # o identificador da empresa no path — limitação conhecida, documentada
    # no Tech Explorer da história.
    await save_audit({
        "event": "webhook_received", "provider": "paygo", "webhook_type": None,
        "company_id": None, "transaction_id": None, "order_ref": None,
        "data_id": None, "signature_valid": None, "correlated": False,
        "payload": payload,
    })
    logger.info("Webhook PayGo: %s", payload)
    return {"ok": True}


@app.get("/health", response_model=HealthOut, tags=["Pagamentos"], summary="Healthcheck")
def health():
    return {"service": "payment", "status": "ok"}
