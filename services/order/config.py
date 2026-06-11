import os
import sys


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        print(
            f"FATAL: variável de ambiente obrigatória '{name}' não definida ou vazia.",
            file=sys.stderr,
        )
        sys.exit(1)
    return value


def get_cors_origins() -> list[str]:
    raw = require_env("CORS_ORIGINS")
    return [o.strip() for o in raw.split(",") if o.strip()]
