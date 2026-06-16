from __future__ import annotations
from abc import ABC, abstractmethod
from decimal import Decimal
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from domain.schemas import TransactionResult


class IPaymentProvider(ABC):
    @abstractmethod
    async def create_transaction(
        self,
        amount: Decimal,
        method: str,
        terminal_ref: str,
        order_ref: str,
    ) -> "TransactionResult": ...

    @abstractmethod
    async def cancel_transaction(
        self,
        provider_transaction_id: str,
        terminal_ref: str,
    ) -> bool: ...

    @abstractmethod
    async def test_connection(
        self,
        terminal_ref: str,
    ) -> dict: ...
    """Aciona a máquina com R$ 0,01 e cancela imediatamente.
    Retorna {"success": bool, "detail": str}."""
