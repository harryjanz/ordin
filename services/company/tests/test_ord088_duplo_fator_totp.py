import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta

import bcrypt
import pyotp
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def make_jwt(sub: str, role: str, company_id: int, token_type: str | None = None) -> str:
    from jose import jwt
    secret = os.environ.get("JWT_SECRET", "test-secret-ci")
    payload = {"sub": sub, "company": company_id, "role": role,
               "exp": datetime.utcnow() + timedelta(hours=1)}
    if token_type:
        payload["type"] = token_type
    return jwt.encode(payload, secret, algorithm="HS256")


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


TOKEN = "Zzord088xTotp"
INTERNAL_HEADERS = {"X-Internal-Secret": os.environ.get("INTERNAL_SECRET", "test-internal-secret-ci")}


@pytest.fixture
async def empresa(client):
    """Empresa isolada (prefixo TOKEN) com um owner e um manager, mfa_policy
    começando em 'optional' (permite ativação, não força)."""
    import main as svc
    pin_hash = bcrypt.hashpw(b"1234", bcrypt.gensalt(4)).decode()
    pw_hash = bcrypt.hashpw(b"senhaSegura123!", bcrypt.gensalt(4)).decode()
    async with svc.AsyncSessionLocal() as db:
        co = svc.Company(
            name=f"{TOKEN} Empresa", document="10000000000766",
            pin_hash=pin_hash, plan="free", state="SP", mfa_policy="optional",
        )
        db.add(co)
        await db.flush()

        owner = svc.User(
            company_id=co.id, name=f"{TOKEN} Owner",
            email=f"{TOKEN.lower()}.owner@teste.com",
            password_hash=pw_hash, role="owner", active=True,
        )
        outro = svc.User(
            company_id=co.id, name=f"{TOKEN} Manager",
            email=f"{TOKEN.lower()}.manager@teste.com",
            password_hash=pw_hash, role="manager", active=True,
        )
        db.add_all([owner, outro])
        await db.commit()
        await db.refresh(owner)
        await db.refresh(outro)

        # Segunda empresa, pra cenário de isolamento multi-tenant.
        co_b = svc.Company(
            name=f"{TOKEN} Empresa B", document="10000000000841",
            pin_hash=pin_hash, plan="free", state="SP", mfa_policy="optional",
        )
        db.add(co_b)
        await db.flush()
        user_b = svc.User(
            company_id=co_b.id, name=f"{TOKEN} Owner B",
            email=f"{TOKEN.lower()}.ownerb@teste.com",
            password_hash=pw_hash, role="owner", active=True,
        )
        db.add(user_b)
        await db.commit()
        await db.refresh(user_b)

        co_id, co_b_id = co.id, co_b.id
        ids = {"owner": owner.id, "manager": outro.id, "user_b": user_b.id}

        yield {
            "company_id": co_id,
            "company_b_id": co_b_id,
            "owner_token": make_jwt(str(owner.id), "owner", co_id),
            "manager_token": make_jwt(str(outro.id), "manager", co_id),
            "owner_b_token": make_jwt(str(user_b.id), "owner", co_b_id),
            "ids": ids,
        }

        await db.execute(sa_delete(svc.UserBackupCode).where(
            svc.UserBackupCode.user_id.in_([owner.id, outro.id, user_b.id])))
        await db.execute(sa_delete(svc.User).where(svc.User.company_id.in_([co_id, co_b_id])))
        await db.execute(sa_delete(svc.Company).where(svc.Company.id.in_([co_id, co_b_id])))
        await db.commit()


# ── PUT /companies/{id}/security ────────────────────────────────────────────

async def test_owner_define_politica_obrigatoria(client, empresa):
    r = await client.put(
        f"/companies/{empresa['company_id']}/security",
        json={"mfa_policy": "required"},
        headers=auth(empresa["owner_token"]),
    )
    assert r.status_code == 200
    assert r.json()["mfa_policy"] == "required"


async def test_get_company_expoe_mfa_policy(client, empresa):
    """Achado ao vivo: GET /companies/{id} precisa devolver mfa_policy —
    é o que a tela de Configurações usa pra carregar o valor salvo ao reabrir."""
    await client.put(
        f"/companies/{empresa['company_id']}/security",
        json={"mfa_policy": "required"},
        headers=auth(empresa["owner_token"]),
    )
    r = await client.get(f"/companies/{empresa['company_id']}", headers=auth(empresa["owner_token"]))
    assert r.status_code == 200
    assert r.json()["mfa_policy"] == "required"


async def test_politica_invalida_rejeitada(client, empresa):
    r = await client.put(
        f"/companies/{empresa['company_id']}/security",
        json={"mfa_policy": "yolo"},
        headers=auth(empresa["owner_token"]),
    )
    assert r.status_code == 422


# ── GET /users/me/mfa/status ─────────────────────────────────────────────────

async def test_status_reflete_politica_e_ativacao(client, empresa):
    r = await client.get("/users/me/mfa/status", headers=auth(empresa["owner_token"]))
    assert r.status_code == 200
    assert r.json() == {"mfa_enabled": False, "mfa_policy": "optional"}

    setup = await client.post("/users/me/mfa/setup", headers=auth(empresa["owner_token"]))
    code = pyotp.TOTP(setup.json()["secret"]).now()
    await client.post("/users/me/mfa/confirm", json={"code": code}, headers=auth(empresa["owner_token"]))

    r2 = await client.get("/users/me/mfa/status", headers=auth(empresa["owner_token"]))
    assert r2.json() == {"mfa_enabled": True, "mfa_policy": "optional"}


# ── Setup / Confirm ──────────────────────────────────────────────────────────

async def test_setup_retorna_segredo_e_provisioning_uri(client, empresa):
    r = await client.post("/users/me/mfa/setup", headers=auth(empresa["owner_token"]))
    assert r.status_code == 200
    body = r.json()
    assert len(body["secret"]) >= 16
    assert body["provisioning_uri"].startswith("otpauth://totp/")


async def test_setup_bloqueado_quando_empresa_desativa_mfa(client, empresa):
    await client.put(
        f"/companies/{empresa['company_id']}/security",
        json={"mfa_policy": "disabled"},
        headers=auth(empresa["owner_token"]),
    )
    r = await client.post("/users/me/mfa/setup", headers=auth(empresa["owner_token"]))
    assert r.status_code == 403


async def test_confirm_com_codigo_correto_ativa_e_gera_backup_codes(client, empresa):
    setup = await client.post("/users/me/mfa/setup", headers=auth(empresa["owner_token"]))
    secret = setup.json()["secret"]
    code = pyotp.TOTP(secret).now()
    r = await client.post(
        "/users/me/mfa/confirm", json={"code": code}, headers=auth(empresa["owner_token"])
    )
    assert r.status_code == 200
    backup_codes = r.json()["backup_codes"]
    assert len(backup_codes) == 10
    assert len(set(backup_codes)) == 10  # todos únicos


async def test_confirm_com_codigo_errado_nao_ativa(client, empresa):
    await client.post("/users/me/mfa/setup", headers=auth(empresa["owner_token"]))
    r = await client.post(
        "/users/me/mfa/confirm", json={"code": "000000"}, headers=auth(empresa["owner_token"])
    )
    assert r.status_code == 400

    # segue sem 2FA ativo — setup novo ainda é permitido, sem 409
    r2 = await client.post("/users/me/mfa/setup", headers=auth(empresa["owner_token"]))
    assert r2.status_code == 200


async def test_setup_com_mfa_ja_ativo_retorna_409(client, empresa):
    setup = await client.post("/users/me/mfa/setup", headers=auth(empresa["owner_token"]))
    code = pyotp.TOTP(setup.json()["secret"]).now()
    await client.post("/users/me/mfa/confirm", json={"code": code}, headers=auth(empresa["owner_token"]))

    r = await client.post("/users/me/mfa/setup", headers=auth(empresa["owner_token"]))
    assert r.status_code == 409


async def test_setup_confirm_aceitam_token_mfa_pending(client, empresa):
    """Caso mfa_policy=required: o auth-service emite um token type=mfa_pending
    em vez da sessão normal — setup/confirm precisam aceitar os dois."""
    pending_token = make_jwt(str(empresa["ids"]["owner"]), "owner", empresa["company_id"], token_type="mfa_pending")
    setup = await client.post("/users/me/mfa/setup", headers=auth(pending_token))
    assert setup.status_code == 200
    code = pyotp.TOTP(setup.json()["secret"]).now()
    confirm = await client.post("/users/me/mfa/confirm", json={"code": code}, headers=auth(pending_token))
    assert confirm.status_code == 200


async def test_refresh_token_nao_serve_para_setup(client, empresa):
    refresh_like = make_jwt(str(empresa["ids"]["owner"]), "owner", empresa["company_id"], token_type="refresh")
    r = await client.post("/users/me/mfa/setup", headers=auth(refresh_like))
    assert r.status_code == 401


# ── Disable (self-service) ──────────────────────────────────────────────────

async def test_disable_com_senha_correta(client, empresa):
    setup = await client.post("/users/me/mfa/setup", headers=auth(empresa["owner_token"]))
    code = pyotp.TOTP(setup.json()["secret"]).now()
    await client.post("/users/me/mfa/confirm", json={"code": code}, headers=auth(empresa["owner_token"]))

    r = await client.post(
        "/users/me/mfa/disable", json={"password": "senhaSegura123!"}, headers=auth(empresa["owner_token"])
    )
    assert r.status_code == 200


async def test_disable_com_senha_errada_falha(client, empresa):
    setup = await client.post("/users/me/mfa/setup", headers=auth(empresa["owner_token"]))
    code = pyotp.TOTP(setup.json()["secret"]).now()
    await client.post("/users/me/mfa/confirm", json={"code": code}, headers=auth(empresa["owner_token"]))

    r = await client.post(
        "/users/me/mfa/disable", json={"password": "senhaErrada"}, headers=auth(empresa["owner_token"])
    )
    assert r.status_code == 401


# ── Reset administrativo (recuperação assistida) ────────────────────────────

async def test_owner_desativa_mfa_de_outro_usuario_da_empresa(client, empresa):
    setup = await client.post("/users/me/mfa/setup", headers=auth(empresa["manager_token"]))
    code = pyotp.TOTP(setup.json()["secret"]).now()
    await client.post("/users/me/mfa/confirm", json={"code": code}, headers=auth(empresa["manager_token"]))

    r = await client.post(
        f"/companies/{empresa['company_id']}/users/{empresa['ids']['manager']}/mfa/reset",
        headers=auth(empresa["owner_token"]),
    )
    assert r.status_code == 200

    r2 = await client.post(
        "/internal/verify-totp",
        json={"user_id": empresa["ids"]["manager"], "code": code},
        headers=INTERNAL_HEADERS,
    )
    assert r2.status_code == 401  # 2FA já foi resetado, código não vale mais


async def test_isolamento_multi_tenant_no_reset_administrativo(client, empresa):
    r = await client.post(
        f"/companies/{empresa['company_b_id']}/users/{empresa['ids']['manager']}/mfa/reset",
        headers=auth(empresa["owner_token"]),
    )
    assert r.status_code == 403


# ── Login com TOTP / backup code (via /internal/verify-totp) ───────────────

async def test_verify_totp_codigo_correto(client, empresa):
    setup = await client.post("/users/me/mfa/setup", headers=auth(empresa["owner_token"]))
    secret = setup.json()["secret"]
    code = pyotp.TOTP(secret).now()
    await client.post("/users/me/mfa/confirm", json={"code": code}, headers=auth(empresa["owner_token"]))

    novo_code = pyotp.TOTP(secret).now()
    r = await client.post(
        "/internal/verify-totp",
        json={"user_id": empresa["ids"]["owner"], "code": novo_code},
        headers=INTERNAL_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["used_backup_code"] is False


async def test_verify_totp_codigo_errado(client, empresa):
    setup = await client.post("/users/me/mfa/setup", headers=auth(empresa["owner_token"]))
    code = pyotp.TOTP(setup.json()["secret"]).now()
    await client.post("/users/me/mfa/confirm", json={"code": code}, headers=auth(empresa["owner_token"]))

    r = await client.post(
        "/internal/verify-totp",
        json={"user_id": empresa["ids"]["owner"], "code": "000000"},
        headers=INTERNAL_HEADERS,
    )
    assert r.status_code == 401


async def test_login_com_backup_code_consome_uso_unico(client, empresa):
    setup = await client.post("/users/me/mfa/setup", headers=auth(empresa["owner_token"]))
    code = pyotp.TOTP(setup.json()["secret"]).now()
    confirm = await client.post("/users/me/mfa/confirm", json={"code": code}, headers=auth(empresa["owner_token"]))
    backup_code = confirm.json()["backup_codes"][0]

    r = await client.post(
        "/internal/verify-totp",
        json={"user_id": empresa["ids"]["owner"], "code": backup_code},
        headers=INTERNAL_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["used_backup_code"] is True

    r2 = await client.post(
        "/internal/verify-totp",
        json={"user_id": empresa["ids"]["owner"], "code": backup_code},
        headers=INTERNAL_HEADERS,
    )
    assert r2.status_code == 401  # mesmo código não pode ser reusado


# ── mfa_status em /internal/verify-credentials ──────────────────────────────

async def test_verify_credentials_mfa_status_none_por_padrao(client, empresa):
    r = await client.post(
        "/internal/verify-credentials",
        json={"email": f"{TOKEN.lower()}.owner@teste.com", "password": "senhaSegura123!"},
        headers=INTERNAL_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["mfa_status"] == "none"


async def test_verify_credentials_mfa_status_setup_required_quando_politica_obrigatoria(client, empresa):
    await client.put(
        f"/companies/{empresa['company_id']}/security",
        json={"mfa_policy": "required"},
        headers=auth(empresa["owner_token"]),
    )
    r = await client.post(
        "/internal/verify-credentials",
        json={"email": f"{TOKEN.lower()}.owner@teste.com", "password": "senhaSegura123!"},
        headers=INTERNAL_HEADERS,
    )
    assert r.json()["mfa_status"] == "setup_required"


async def test_verify_credentials_mfa_status_verify_quando_totp_ja_ativo(client, empresa):
    setup = await client.post("/users/me/mfa/setup", headers=auth(empresa["owner_token"]))
    code = pyotp.TOTP(setup.json()["secret"]).now()
    await client.post("/users/me/mfa/confirm", json={"code": code}, headers=auth(empresa["owner_token"]))

    r = await client.post(
        "/internal/verify-credentials",
        json={"email": f"{TOKEN.lower()}.owner@teste.com", "password": "senhaSegura123!"},
        headers=INTERNAL_HEADERS,
    )
    assert r.json()["mfa_status"] == "verify"


async def test_mudar_politica_para_disabled_nao_remove_totp_ja_ativo(client, empresa):
    setup = await client.post("/users/me/mfa/setup", headers=auth(empresa["owner_token"]))
    code = pyotp.TOTP(setup.json()["secret"]).now()
    await client.post("/users/me/mfa/confirm", json={"code": code}, headers=auth(empresa["owner_token"]))

    await client.put(
        f"/companies/{empresa['company_id']}/security",
        json={"mfa_policy": "disabled"},
        headers=auth(empresa["owner_token"]),
    )
    r = await client.post(
        "/internal/verify-credentials",
        json={"email": f"{TOKEN.lower()}.owner@teste.com", "password": "senhaSegura123!"},
        headers=INTERNAL_HEADERS,
    )
    assert r.json()["mfa_status"] == "verify"  # continua sendo desafiado
