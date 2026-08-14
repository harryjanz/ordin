import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta

import bcrypt
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def make_jwt(role: str, company_id: int) -> str:
    from jose import jwt
    secret = os.environ.get("JWT_SECRET", "test-secret-ci")
    return jwt.encode(
        {"sub": "1", "company": company_id, "role": role,
         "exp": datetime.utcnow() + timedelta(hours=1)},
        secret, algorithm="HS256",
    )


@pytest.fixture
async def client():
    import main as svc
    db_url = os.environ["DB_URL"].replace("mysql+pymysql://", "mysql+aiomysql://")
    test_engine = create_async_engine(db_url, echo=False)
    test_session = async_sessionmaker(test_engine, expire_on_commit=False)
    orig_engine, orig_session = svc.engine, svc.AsyncSessionLocal
    svc.engine = test_engine
    svc.AsyncSessionLocal = test_session
    async with test_engine.begin() as conn:
        await conn.run_sync(svc.Base.metadata.create_all)
    async with AsyncClient(transport=ASGITransport(app=svc.app), base_url="http://test") as c:
        yield c
    await test_engine.dispose()
    svc.engine, svc.AsyncSessionLocal = orig_engine, orig_session


TOKEN = "Zzord090xEdicao"


# ── Classificação de força de senha (unidade, sem precisar de client) ────────

def test_forca_fraca_sem_caractere_especial():
    from main import _password_strength
    assert _password_strength("abc12345") == "fraca"


def test_forca_fraca_curta_demais():
    from main import _password_strength
    assert _password_strength("ab1!") == "fraca"


def test_forca_media_oito_caracteres():
    from main import _password_strength
    assert _password_strength("abc123!@") == "media"


def test_forca_forte_doze_caracteres():
    from main import _password_strength
    assert _password_strength("abc123456!@#") == "forte"


def test_forca_media_onze_caracteres_nao_e_forte():
    from main import _password_strength
    assert _password_strength("abc12345!@#") == "media"


# ── complete-registration respeita o novo mínimo (Média) ─────────────────────

@pytest.fixture
async def empresa_com_convite(client):
    import main as svc
    pin_hash = bcrypt.hashpw(b"1234", bcrypt.gensalt(4)).decode()
    async with svc.AsyncSessionLocal() as db:
        co = svc.Company(
            name=f"{TOKEN} Empresa", document="10000000000464",
            pin_hash=pin_hash, plan="free", state="SP",
        )
        db.add(co)
        await db.commit()
        await db.refresh(co)
        co_id = co.id

    yield {"company_id": co_id, "token": make_jwt("owner", co_id)}

    async with svc.AsyncSessionLocal() as db:
        user_ids = (await db.execute(
            svc.select(svc.User.id).where(svc.User.company_id == co_id)
        )).scalars().all()
        if user_ids:
            await db.execute(sa_delete(svc.UserInviteToken).where(
                svc.UserInviteToken.user_id.in_(user_ids)))
        await db.execute(sa_delete(svc.User).where(svc.User.company_id == co_id))
        await db.execute(sa_delete(svc.Company).where(svc.Company.id == co_id))
        await db.commit()


async def _criar_convite(client, empresa_com_convite, nome_sufixo):
    import main as svc
    import respx
    import httpx
    import json as jsonlib
    from urllib.parse import parse_qs, urlparse

    with respx.mock:
        route = respx.post(f"{svc.NOTIFICATION_SERVICE_URL}/internal/send-invite").mock(
            return_value=httpx.Response(200, json={"sent": True})
        )
        await client.post(
            f"/companies/{empresa_com_convite['company_id']}/users",
            json={
                "name": f"{TOKEN} {nome_sufixo}",
                "email": f"{TOKEN.lower()}.{nome_sufixo.lower()}@teste.com",
                "role": "cashier",
            },
            headers=auth(empresa_com_convite["token"]),
        )
    sent = jsonlib.loads(route.calls[0].request.content)
    return parse_qs(urlparse(sent["set_password_url"]).query)["token"][0]


async def test_complete_registration_rejeita_senha_sem_especial(client, empresa_com_convite):
    raw_token = await _criar_convite(client, empresa_com_convite, "Fraca")
    r = await client.post("/users/complete-registration", json={"token": raw_token, "password": "semespecial123"})
    assert r.status_code == 422


# ── Status do convite (verificação sem consumir o token) ─────────────────────

async def test_invite_status_token_valido(client, empresa_com_convite):
    raw_token = await _criar_convite(client, empresa_com_convite, "StatusValido")
    r = await client.get("/users/invite-status", params={"token": raw_token})
    assert r.status_code == 200
    assert r.json() == {"valid": True}


async def test_invite_status_token_inexistente(client):
    r = await client.get("/users/invite-status", params={"token": "token-que-nunca-existiu"})
    assert r.status_code == 200
    assert r.json() == {"valid": False}


async def test_invite_status_token_ja_usado(client, empresa_com_convite):
    raw_token = await _criar_convite(client, empresa_com_convite, "StatusUsado")
    r = await client.post(
        "/users/complete-registration",
        json={"token": raw_token, "password": "primeiraSenha123!"},
    )
    assert r.status_code == 200

    r = await client.get("/users/invite-status", params={"token": raw_token})
    assert r.status_code == 200
    assert r.json() == {"valid": False}


async def test_complete_registration_bloqueia_reuso_do_token(client, empresa_com_convite):
    raw_token = await _criar_convite(client, empresa_com_convite, "Reuso")
    r1 = await client.post(
        "/users/complete-registration",
        json={"token": raw_token, "password": "primeiraSenha123!"},
    )
    assert r1.status_code == 200

    r2 = await client.post(
        "/users/complete-registration",
        json={"token": raw_token, "password": "segundaSenha456!"},
    )
    assert r2.status_code == 400


async def test_invite_status_token_expirado(client, empresa_com_convite):
    import main as svc
    from datetime import datetime, timedelta

    raw_token = await _criar_convite(client, empresa_com_convite, "StatusExpirado")
    token_hash = svc.hashlib.sha256(raw_token.encode()).hexdigest()
    async with svc.AsyncSessionLocal() as db:
        result = await db.execute(svc.select(svc.UserInviteToken).filter_by(token_hash=token_hash))
        invite = result.scalars().first()
        invite.expires_at = datetime.utcnow() - timedelta(hours=1)
        await db.commit()

    r = await client.get("/users/invite-status", params={"token": raw_token})
    assert r.status_code == 200
    assert r.json() == {"valid": False}


def test_invite_token_ttl_e_24_horas():
    import main as svc
    assert svc.INVITE_TOKEN_TTL_HOURS == 24


# ── Editar nome e papel ───────────────────────────────────────────────────────

@pytest.fixture
async def usuarios(client):
    import main as svc
    pin_hash = bcrypt.hashpw(b"1234", bcrypt.gensalt(4)).decode()
    pw_hash = bcrypt.hashpw(b"senha123", bcrypt.gensalt(4)).decode()
    async with svc.AsyncSessionLocal() as db:
        co = svc.Company(
            name=f"{TOKEN} Empresa Edicao", document="10000000000575",
            pin_hash=pin_hash, plan="free", state="SP",
        )
        db.add(co)
        await db.flush()
        owner = svc.User(
            company_id=co.id, name=f"{TOKEN} Owner Original",
            email=f"{TOKEN.lower()}.owner@teste.com",
            password_hash=pw_hash, role="owner", active=True,
        )
        cashier = svc.User(
            company_id=co.id, name=f"{TOKEN} Cashier Original",
            email=f"{TOKEN.lower()}.cashier@teste.com",
            password_hash=pw_hash, role="cashier", active=True,
        )
        db.add_all([owner, cashier])
        await db.commit()
        await db.refresh(owner)
        await db.refresh(cashier)
        co_id = co.id
        ids = {"owner": owner.id, "cashier": cashier.id}

    yield {"company_id": co_id, "token": make_jwt("owner", co_id), "ids": ids}

    async with svc.AsyncSessionLocal() as db:
        await db.execute(sa_delete(svc.User).where(svc.User.company_id == co_id))
        await db.execute(sa_delete(svc.Company).where(svc.Company.id == co_id))
        await db.commit()


async def test_editar_nome_e_papel(client, usuarios):
    cashier_id = usuarios["ids"]["cashier"]
    r = await client.put(
        f"/companies/{usuarios['company_id']}/users/{cashier_id}",
        json={"name": f"{TOKEN} Cashier Renomeado", "role": "manager"},
        headers=auth(usuarios["token"]),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == f"{TOKEN} Cashier Renomeado"
    assert body["role"] == "manager"


async def test_editar_nome_nao_altera_email_nem_status(client, usuarios):
    cashier_id = usuarios["ids"]["cashier"]
    r = await client.put(
        f"/companies/{usuarios['company_id']}/users/{cashier_id}",
        json={"name": f"{TOKEN} Só o nome muda"},
        headers=auth(usuarios["token"]),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == f"{TOKEN.lower()}.cashier@teste.com"
    assert body["role"] == "cashier"
    assert body["active"] is True


async def test_editar_papel_manager_nao_promove_owner(client, usuarios):
    manager_token = make_jwt("manager", usuarios["company_id"])
    cashier_id = usuarios["ids"]["cashier"]
    r = await client.put(
        f"/companies/{usuarios['company_id']}/users/{cashier_id}",
        json={"name": "Tentativa", "role": "owner"},
        headers=auth(manager_token),
    )
    assert r.status_code == 403
