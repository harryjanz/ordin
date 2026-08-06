import os
from datetime import datetime, timedelta

os.environ.setdefault("DB_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "test-secret-ci")
os.environ.setdefault("JWT_ACCESS_EXP_MINUTES", "60")
os.environ.setdefault("INTERNAL_SECRET", "test-internal-ci")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
os.environ.setdefault("CREDENTIAL_ENCRYPTION_KEY", "0" * 64)
os.environ.setdefault("S3_BUCKET", "ordin-contracts-test")
os.environ.setdefault("AWS_REGION", "us-east-1")
# S3_ENDPOINT_URL deliberadamente NÃO setada nos testes — moto só intercepta
# o boto3 quando o client usa o endpoint padrão da AWS; com endpoint_url
# customizado (caso do MinIO) ele tenta conectar de verdade e trava. A
# própria ausência da env var já faz contract_storage._client() não passar
# endpoint_url, igual seria em produção contra o S3 real.
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
def token_superadmin():
    return make_jwt(role="superadmin", company_id=1)


@pytest.fixture
def token_company_b():
    return make_jwt(role="admin", company_id=2)
