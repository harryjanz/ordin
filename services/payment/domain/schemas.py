from dataclasses import dataclass, field
from enum import Enum


class PaymentMethod(str, Enum):
    credit  = "credit"
    debit   = "debit"
    pix     = "pix"
    voucher = "voucher"


class TransactionStatus(str, Enum):
    approved   = "approved"
    refused    = "refused"
    cancelled  = "cancelled"
    expired    = "expired"
    processing = "processing"
    refunded   = "refunded"


@dataclass
class TransactionResult:
    status: TransactionStatus
    provider_transaction_id: str | None = None
    nsu: str | None = None
    authorization: str | None = None
    error_message: str | None = None
    audit_events: list = field(default_factory=list)
    qr_code: str | None = None
    qr_code_base64: str | None = None


@dataclass
class RefundResult:
    """Retorno de IPaymentProvider.refund_transaction — diferente de
    cancel_transaction (bool puro, best-effort), reembolso precisa carregar
    detalhe do erro pra alimentar uma mensagem específica no endpoint (ver
    ORD-147: saldo insuficiente, prazo expirado, id inválido)."""
    success: bool
    error_message: str | None = None
    raw_response: dict | None = None


@dataclass
class ProviderConfig:
    provider: str
    environment: str
    api_key: str | None = None
    api_secret: str | None = None
    extra_config: dict = field(default_factory=dict)


PROVIDER_BASE_URLS: dict[str, dict[str, str]] = {
    "paygo": {
        "sandbox":    "https://sandbox.controlpay.com.br/webapi/",
        "production": "https://pos-transac.pgweb.io:31735/webapi/",
    },
    "mercadopago": {
        "sandbox":    "https://api.mercadopago.com",
        "production": "https://api.mercadopago.com",
    },
}
