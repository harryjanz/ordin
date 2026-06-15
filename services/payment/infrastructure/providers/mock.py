import random
from datetime import datetime
from decimal import Decimal

from domain.interfaces.payment_provider import IPaymentProvider
from domain.schemas import TransactionResult, TransactionStatus


class MockProvider(IPaymentProvider):
    async def create_transaction(
        self,
        amount: Decimal,
        method: str,
        terminal_ref: str,
        order_ref: str,
    ) -> TransactionResult:
        approved = random.random() < 0.95
        if approved:
            return TransactionResult(
                status=TransactionStatus.approved,
                nsu=f"NSU{int(datetime.utcnow().timestamp())}",
                authorization=f"AUT{random.randint(100000, 999999)}",
                audit_events=[{"event": "mock_approved", "ts": datetime.utcnow().isoformat()}],
            )
        return TransactionResult(
            status=TransactionStatus.refused,
            error_message="Mock: recusado (5% dos casos)",
            audit_events=[{"event": "mock_refused", "ts": datetime.utcnow().isoformat()}],
        )

    async def cancel_transaction(
        self,
        provider_transaction_id: str,
        terminal_ref: str,
    ) -> bool:
        return True

    async def test_connection(self, terminal_ref: str) -> dict:
        import asyncio
        await asyncio.sleep(0.4)  # simula latência de rede
        return {"success": True, "detail": "Máquina mockada respondeu (R$ 0,01 cancelado)"}
