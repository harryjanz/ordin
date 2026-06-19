from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum
from typing import Optional


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


@dataclass
class TransactionResult:
    status: TransactionStatus
    provider_transaction_id: Optional[str] = None
    nsu: Optional[str] = None
    authorization: Optional[str] = None
    error_message: Optional[str] = None
    audit_events: list = field(default_factory=list)
    qr_code: Optional[str] = None
    qr_code_base64: Optional[str] = None


@dataclass
class ProviderConfig:
    provider: str
    environment: str
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
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
