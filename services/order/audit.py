import json
import sys
from datetime import datetime, timezone
from typing import Any

from fastapi import Request


def _get_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def emit_audit(
    event: str,
    request: Request,
    *,
    actor: str | None,
    actor_id: int | None,
    company_id: int | None,
    result: str,
    detail: dict[str, Any] | None = None,
) -> None:
    entry = {
        "audit": True,
        "event": event,
        "actor": actor,
        "actor_id": actor_id,
        "company_id": company_id,
        "ip": _get_ip(request),
        "result": result,
        "detail": detail or {},
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
    }
    print(json.dumps(entry, ensure_ascii=False), file=sys.stdout, flush=True)
