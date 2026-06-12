from dataclasses import dataclass, asdict


@dataclass
class PaymentApprovedEvent:
    event: str = "payment.approved"
    company_id: int = 0
    order_ref: str = ""
    transaction_id: int = 0
    amount: str = ""
    nsu: str = ""
    authorization: str = ""
    provider: str = "mock"

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class PaymentRefusedEvent:
    event: str = "payment.refused"
    company_id: int = 0
    order_ref: str = ""
    transaction_id: int = 0
    amount: str = ""
    provider: str = "mock"

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class PaymentCancelledEvent:
    event: str = "payment.cancelled"
    company_id: int = 0
    order_ref: str = ""
    transaction_id: int = 0
    amount: str = ""
    cancel_reason: str = ""
    provider: str = "mock"

    def to_dict(self) -> dict:
        return asdict(self)
