import logging
import os
from datetime import datetime

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    mongo_url = os.getenv("MONGO_URL", "").strip()
    if not mongo_url:
        return None
    try:
        import motor.motor_asyncio
        _client = motor.motor_asyncio.AsyncIOMotorClient(mongo_url)
        return _client
    # ORD-156 — captura ampla intencional: MongoDB é só trilha de auditoria,
    # nunca pode derrubar o fluxo de pagamento por não estar disponível.
    except Exception as exc:  # noqa: BLE001
        logger.error("MongoDB: falha ao criar cliente — %s", exc)
        return None


async def save_audit(document: dict) -> None:
    try:
        client = _get_client()
        if client is None:
            return
        mongo_db = os.getenv("MONGO_DB", "ordin_audit")
        document.setdefault("created_at", datetime.utcnow().isoformat())
        await client[mongo_db].payment_events.insert_one(document)
    # ORD-156 — mesmo motivo acima: salvar auditoria é best-effort.
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "MongoDB: falha ao salvar audit — transaction_id=%s order_ref=%s — %s",
            document.get("transaction_id"), document.get("order_ref"), exc,
        )
