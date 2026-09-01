from __future__ import annotations

from abc import ABC, abstractmethod
from decimal import Decimal
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from domain.schemas import RefundResult, TransactionResult


class IPaymentProvider(ABC):
    @abstractmethod
    async def create_transaction(
        self,
        amount: Decimal,
        method: str,
        terminal_ref: str,
        order_ref: str,
    ) -> TransactionResult: ...

    @abstractmethod
    async def cancel_transaction(
        self,
        provider_transaction_id: str,
        terminal_ref: str,
    ) -> bool: ...

    @abstractmethod
    async def refund_transaction(
        self,
        provider_transaction_id: str,
    ) -> RefundResult: ...
    """Estorna uma transação já aprovada/capturada (diferente de
    cancel_transaction, que só se aplica antes da captura). Sem terminal_ref
    — reembolso é resolvido direto na nuvem do provider, não depende do
    hardware. Ver ORD-147."""

    def refund_window_days(self, method: str) -> int | None:
        """Prazo (em dias, a partir da aprovação) que este provider aceita
        pra reembolso via API, por método de pagamento. None = sem limite
        conhecido ou reembolso não suportado pelo provider. Cada provider
        declara o próprio prazo — é uma restrição da integração específica
        (contrato de API de cada adquirente), não uma regra universal de
        reembolso. Ver ORD-147."""
        return None

    @abstractmethod
    async def test_connection(
        self,
        terminal_ref: str,
    ) -> dict: ...
    """Aciona a máquina com R$ 0,01 e cancela imediatamente.
    Retorna {"success": bool, "detail": str}."""
