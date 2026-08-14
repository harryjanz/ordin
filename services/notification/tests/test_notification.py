import os
import sys
from unittest.mock import AsyncMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
async def client():
    import main as svc
    svc.provider.send = AsyncMock()
    async with AsyncClient(transport=ASGITransport(app=svc.app), base_url="http://test") as c:
        yield c


def internal_headers():
    return {"X-Internal-Secret": os.environ["INTERNAL_SECRET"]}


async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["service"] == "notification"


async def test_send_invite_sem_secret_retorna_403(client):
    r = await client.post("/internal/send-invite", json={
        "to": "novo@teste.com", "name": "Fulano", "role": "cashier",
        "set_password_url": "http://localhost:3001/set-password?token=abc",
    })
    assert r.status_code == 403


async def test_send_invite_secret_errado_retorna_403(client):
    r = await client.post(
        "/internal/send-invite",
        json={
            "to": "novo@teste.com", "name": "Fulano", "role": "cashier",
            "set_password_url": "http://localhost:3001/set-password?token=abc",
        },
        headers={"X-Internal-Secret": "secret-errado"},
    )
    assert r.status_code == 403


async def test_send_invite_happy_path(client):
    import main as svc
    r = await client.post(
        "/internal/send-invite",
        json={
            "to": "novo@teste.com", "name": "Fulano", "role": "manager",
            "set_password_url": "http://localhost:3001/set-password?token=abc",
        },
        headers=internal_headers(),
    )
    assert r.status_code == 200
    assert r.json() == {"sent": True}
    svc.provider.send.assert_awaited_once()
    kwargs = svc.provider.send.call_args.kwargs
    assert kwargs["to"] == "novo@teste.com"
    assert "Gerente" in kwargs["html"] or "manager" not in kwargs["html"]
    assert "http://localhost:3001/set-password?token=abc" in kwargs["html"]
    assert ">ordin<" in kwargs["html"]  # ORD-090: wordmark do cabeçalho
    assert "suporte@ordin.com" in kwargs["html"]  # ORD-090: assinatura no rodapé


async def test_send_invite_papel_desconhecido_usa_texto_generico(client):
    import main as svc
    r = await client.post(
        "/internal/send-invite",
        json={
            "to": "novo@teste.com", "name": "Fulano", "role": "role-inexistente",
            "set_password_url": "http://localhost:3001/set-password?token=abc",
        },
        headers=internal_headers(),
    )
    assert r.status_code == 200
    kwargs = svc.provider.send.call_args.kwargs
    assert "convidado a fazer parte da equipe" in kwargs["html"]


def test_provider_factory_smtp():
    from infrastructure.provider_factory import get_email_provider
    from infrastructure.providers.smtp_provider import SMTPEmailProvider
    assert isinstance(get_email_provider("smtp"), SMTPEmailProvider)


def test_provider_factory_ses():
    from infrastructure.provider_factory import get_email_provider
    from infrastructure.providers.ses_provider import SESEmailProvider
    assert isinstance(get_email_provider("ses"), SESEmailProvider)


def test_provider_factory_invalido():
    from infrastructure.provider_factory import get_email_provider
    with pytest.raises(ValueError):
        get_email_provider("provider-inexistente")
