import os
import pytest
from datetime import datetime, timedelta

# Env vars globais para todos os serviços — devem ser setadas antes de qualquer import de main.py
os.environ.setdefault("DB_URL", "mysql+aiomysql://root:test_root@localhost:3306/fk_test")
os.environ.setdefault("JWT_SECRET", "test-secret-ci")
os.environ.setdefault("JWT_ACCESS_EXP_MINUTES", "60")
os.environ.setdefault("JWT_REFRESH_EXP_DAYS", "7")
os.environ.setdefault("INTERNAL_SECRET", "test-internal-ci")
os.environ.setdefault("QR_SECRET", "test-qr-secret-ci")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
os.environ.setdefault("MESSAGE_BROKER", "sqs")
os.environ.setdefault("CREDENTIAL_ENCRYPTION_KEY", "0" * 64)
# MONGO_URL não definido em CI — save_audit faz best-effort e silencia
os.environ.setdefault("COMPANY_SERVICE_URL", "http://localhost:8002")
os.environ.setdefault("ORDER_SERVICE_URL", "http://localhost:8004")
os.environ.setdefault("PAYGO_BASE_URL", "https://sandbox.controlpay.com.br/webapi/")


def make_jwt(role: str = "owner", company_id: int = 1, terminal_id: int | None = None) -> str:
    from jose import jwt
    payload = {
        "sub": "1",
        "company": company_id,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    if terminal_id is not None:
        payload["terminal"] = terminal_id
    return jwt.encode(payload, "test-secret-ci", algorithm="HS256")


@pytest.fixture
def token_owner():
    return make_jwt(role="owner", company_id=1)


@pytest.fixture
def token_superadmin():
    return make_jwt(role="superadmin", company_id=1)


@pytest.fixture
def token_kiosk():
    return make_jwt(role="kiosk", company_id=1, terminal_id=1)
