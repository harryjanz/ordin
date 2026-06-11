"""Gera openapi.json a partir do app FastAPI. Executar de dentro do diretório do serviço."""
import json, os

os.environ.setdefault("DB_URL", "mysql+aiomysql://x:x@localhost/ordin_order")
os.environ.setdefault("JWT_SECRET", "placeholder")
os.environ.setdefault("INTERNAL_SECRET", "placeholder")
os.environ.setdefault("QR_SECRET", "placeholder")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")

from main import app  # noqa: E402

with open("openapi.json", "w", encoding="utf-8") as f:
    json.dump(app.openapi(), f, indent=2, ensure_ascii=False)

print("openapi.json atualizado — order-service")
