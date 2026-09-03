import os
import sys
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta

import httpx
import pytest
import respx
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


TOKEN = "Zzord087xConvite"


@pytest.fixture
async def empresa(client):
    """Empresa isolada (prefixo TOKEN) — cada teste cria seu(s) próprio(s)
    usuário(s) via endpoint público de verdade, não inserção direta no ORM,
    porque o próprio fluxo de convite é o que está sendo testado."""
    import bcrypt
    import main as svc
    pin_hash = bcrypt.hashpw(b"1234", bcrypt.gensalt(4)).decode()
    async with svc.AsyncSessionLocal() as db:
        co = svc.Company(
            name=f"{TOKEN} Empresa", document="10000000000373",
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


def _notification_url(svc) -> str:
    return f"{svc.NOTIFICATION_SERVICE_URL}/internal/send-invite"


def _extract_token(set_password_url: str) -> str:
    return parse_qs(urlparse(set_password_url).query)["token"][0]


async def test_criar_usuario_sem_senha_fica_pendente(client, empresa):
    import main as svc
    with respx.mock:
        respx.post(_notification_url(svc)).mock(return_value=httpx.Response(200, json={"sent": True}))
        r = await client.post(
            f"/companies/{empresa['company_id']}/users",
            json={"name": f"{TOKEN} Novo", "email": f"{TOKEN.lower()}.novo@teste.com", "role": "cashier"},
            headers=auth(empresa["token"]),
        )
    assert r.status_code == 201
    body = r.json()
    assert body["pending_setup"] is True
    assert "password" not in body


async def test_convite_enviado_com_descricao_do_papel_e_link(client, empresa):
    import main as svc
    with respx.mock:
        route = respx.post(_notification_url(svc)).mock(return_value=httpx.Response(200, json={"sent": True}))
        r = await client.post(
            f"/companies/{empresa['company_id']}/users",
            json={"name": f"{TOKEN} Convidado", "email": f"{TOKEN.lower()}.convidado@teste.com", "role": "manager"},
            headers=auth(empresa["token"]),
        )
    assert r.status_code == 201
    assert route.called
    payload = route.calls[0].request.content
    import json as jsonlib
    sent = jsonlib.loads(payload)
    assert sent["role"] == "manager"
    assert sent["to"] == f"{TOKEN.lower()}.convidado@teste.com"
    assert "token=" in sent["set_password_url"]


async def test_falha_no_envio_nao_bloqueia_criacao(client, empresa):
    import main as svc
    with respx.mock:
        respx.post(_notification_url(svc)).mock(side_effect=httpx.ConnectError("conexão recusada"))
        r = await client.post(
            f"/companies/{empresa['company_id']}/users",
            json={"name": f"{TOKEN} SemEmail", "email": f"{TOKEN.lower()}.sememail@teste.com", "role": "cashier"},
            headers=auth(empresa["token"]),
        )
    assert r.status_code == 201
    assert r.json()["pending_setup"] is True


async def test_complete_registration_happy_path(client, empresa):
    import main as svc
    with respx.mock:
        route = respx.post(_notification_url(svc)).mock(return_value=httpx.Response(200, json={"sent": True}))
        create_r = await client.post(
            f"/companies/{empresa['company_id']}/users",
            json={"name": f"{TOKEN} Happy", "email": f"{TOKEN.lower()}.happy@teste.com", "role": "cashier"},
            headers=auth(empresa["token"]),
        )
    assert create_r.status_code == 201
    import json as jsonlib
    sent = jsonlib.loads(route.calls[0].request.content)
    raw_token = _extract_token(sent["set_password_url"])

    r = await client.post("/users/complete-registration", json={"token": raw_token, "password": "senhaSegura123!"})
    assert r.status_code == 200
    assert r.json() == {"ok": True}

    # usuário criado consegue logar (senha efetivamente gravada)
    login_r = await client.post(
        "/internal/verify-credentials",
        json={"email": f"{TOKEN.lower()}.happy@teste.com", "password": "senhaSegura123!"},
        headers={"X-Internal-Secret": os.environ["INTERNAL_SECRET"]},
    )
    assert login_r.status_code == 200


async def test_complete_registration_token_usado_e_rejeitado(client, empresa):
    import main as svc
    with respx.mock:
        route = respx.post(_notification_url(svc)).mock(return_value=httpx.Response(200, json={"sent": True}))
        await client.post(
            f"/companies/{empresa['company_id']}/users",
            json={"name": f"{TOKEN} Reuso", "email": f"{TOKEN.lower()}.reuso@teste.com", "role": "cashier"},
            headers=auth(empresa["token"]),
        )
    import json as jsonlib
    sent = jsonlib.loads(route.calls[0].request.content)
    raw_token = _extract_token(sent["set_password_url"])

    r1 = await client.post("/users/complete-registration", json={"token": raw_token, "password": "senhaSegura123!"})
    assert r1.status_code == 200
    r2 = await client.post("/users/complete-registration", json={"token": raw_token, "password": "outraSenha123!"})
    assert r2.status_code == 400


async def test_complete_registration_token_invalido_retorna_400(client, empresa):
    r = await client.post("/users/complete-registration", json={"token": "token-que-nao-existe", "password": "senhaSegura123!"})
    assert r.status_code == 400


async def test_complete_registration_senha_curta_e_rejeitada(client, empresa):
    r = await client.post("/users/complete-registration", json={"token": "qualquer", "password": "curta"})
    assert r.status_code == 422


async def test_reenviar_convite_invalida_token_anterior(client, empresa):
    import main as svc
    with respx.mock:
        route = respx.post(_notification_url(svc)).mock(return_value=httpx.Response(200, json={"sent": True}))
        create_r = await client.post(
            f"/companies/{empresa['company_id']}/users",
            json={"name": f"{TOKEN} Reenvio", "email": f"{TOKEN.lower()}.reenvio@teste.com", "role": "cashier"},
            headers=auth(empresa["token"]),
        )
        user_id = create_r.json()["id"]
        import json as jsonlib
        primeiro_token = _extract_token(jsonlib.loads(route.calls[0].request.content)["set_password_url"])

        resend_r = await client.post(
            f"/companies/{empresa['company_id']}/users/{user_id}/resend-invite",
            headers=auth(empresa["token"]),
        )
        assert resend_r.status_code == 200
        novo_token = _extract_token(jsonlib.loads(route.calls[1].request.content)["set_password_url"])

    assert novo_token != primeiro_token

    # token antigo não vale mais
    r_antigo = await client.post("/users/complete-registration", json={"token": primeiro_token, "password": "senhaSegura123!"})
    assert r_antigo.status_code == 400

    # token novo funciona
    r_novo = await client.post("/users/complete-registration", json={"token": novo_token, "password": "senhaSegura123!"})
    assert r_novo.status_code == 200


async def test_reenviar_convite_para_usuario_ja_definido_retorna_400(client, empresa):
    import main as svc
    with respx.mock:
        route = respx.post(_notification_url(svc)).mock(return_value=httpx.Response(200, json={"sent": True}))
        create_r = await client.post(
            f"/companies/{empresa['company_id']}/users",
            json={"name": f"{TOKEN} JaDefiniu", "email": f"{TOKEN.lower()}.jadefiniu@teste.com", "role": "cashier"},
            headers=auth(empresa["token"]),
        )
        user_id = create_r.json()["id"]
        import json as jsonlib
        raw_token = _extract_token(jsonlib.loads(route.calls[0].request.content)["set_password_url"])

    await client.post("/users/complete-registration", json={"token": raw_token, "password": "senhaSegura123!"})

    r = await client.post(
        f"/companies/{empresa['company_id']}/users/{user_id}/resend-invite",
        headers=auth(empresa["token"]),
    )
    assert r.status_code == 400
