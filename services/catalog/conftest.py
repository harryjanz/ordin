import os
from datetime import datetime, timedelta

os.environ.setdefault("DB_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "test-secret-ci")
os.environ.setdefault("JWT_ACCESS_EXP_MINUTES", "60")
os.environ.setdefault("INTERNAL_SECRET", "test-internal-ci")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("S3_BUCKET", "ordin-catalog-test")
os.environ.setdefault("AWS_REGION", "us-east-1")
# S3_ENDPOINT_URL deliberadamente NÃO setada nos testes — moto só intercepta
# o boto3 quando o client usa o endpoint padrão da AWS; com endpoint_url
# customizado (caso do MinIO) ele tenta conectar de verdade e trava. Mesmo
# padrão do conftest.py do company-service para contract_storage.
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")

import pytest


def make_jwt(role: str = "owner", company_id: int = 1) -> str:
    from jose import jwt
    secret = os.environ.get("JWT_SECRET", "test-secret-ci")
    payload = {
        "sub": "1",
        "company": company_id,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    return jwt.encode(payload, secret, algorithm="HS256")


@pytest.fixture
def token_owner():
    return make_jwt(role="owner", company_id=1)


@pytest.fixture
def token_company_b():
    return make_jwt(role="admin", company_id=2)


@pytest.fixture
def token_kiosk():
    return make_jwt(role="kiosk", company_id=1)
