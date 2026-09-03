import os
from datetime import datetime, timedelta

# Força SQLite in-memory sempre, mesmo se DB_URL já vier setada no ambiente
# (ex: dentro do container do serviço, onde o docker-compose injeta a URL do
# banco de dev real). setdefault() não bastava — ver services/catalog/conftest.py.
os.environ["DB_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ.setdefault("JWT_SECRET", "test-secret-ci")
os.environ.setdefault("JWT_ACCESS_EXP_MINUTES", "60")
os.environ.setdefault("INTERNAL_SECRET", "test-internal-ci")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
os.environ.setdefault("COMPANY_SERVICE_URL", "http://localhost:8002")
os.environ.setdefault("ORDER_SERVICE_URL", "http://localhost:8004")
os.environ.setdefault("PAYGO_BASE_URL", "https://sandbox.controlpay.com.br/webapi/")
os.environ.setdefault("MONGO_URL", "")

import pytest


def make_jwt(role: str = "owner", company_id: int = 1, terminal_id: int | None = None) -> str:
    from jose import jwt
    secret = os.environ.get("JWT_SECRET", "test-secret-ci")
    payload = {
        "sub": "1",
        "company": company_id,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    if terminal_id is not None:
        payload["terminal"] = terminal_id
    return jwt.encode(payload, secret, algorithm="HS256")


@pytest.fixture
def token_owner():
    return make_jwt(role="owner", company_id=1)


@pytest.fixture
def token_kiosk():
    return make_jwt(role="kiosk", company_id=1, terminal_id=1)


@pytest.fixture
def token_company_b():
    return make_jwt(role="admin", company_id=2)
