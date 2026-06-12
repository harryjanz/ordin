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
    except Exception as exc:
        logger.warning("MongoDB: falha ao criar cliente — %s", exc)
        return None


async def save_audit(document: dict) -> None:
    try:
        client = _get_client()
        if client is None:
            return
        mongo_db = os.getenv("MONGO_DB", "ordin_audit")
        document.setdefault("created_at", datetime.utcnow().isoformat())
        await client[mongo_db].payment_events.insert_one(document)
    except Exception as exc:
        logger.warning("MongoDB: falha ao salvar audit — %s", exc)
