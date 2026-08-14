"""
Testes de cobertura que usam chamadas diretas às funções endpoint (sem ASGI transport).
Chamadas diretas fazem coverage.py rastrear linhas pós-`await` que o ASGITransport não cobre.
Testes HTTP (via client) cobrem routing/auth; testes diretos cobrem a lógica de negócio.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
import bcrypt
from datetime import datetime, timedelta
from fastapi import HTTPException
from httpx import AsyncClient, ASGITransport
from sqlalchemy import delete as sa_delete, select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_token(role: str, company_id: int) -> str:
    from jose import jwt
    secret = os.environ.get("JWT_SECRET", "test-secret-ci")
    return jwt.encode(
        {"sub": "1", "company": company_id, "role": role,
         "exp": datetime.utcnow() + timedelta(hours=1)},
        secret, algorithm="HS256"
    )


def _user(role="owner", company_id=1, sub="1"):
    from auth import TokenPayload
    return TokenPayload(sub=sub, company_id=company_id, role=role)


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── HTTP client fixture ────────────────────────────────────────────────────────

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


# ── Direct DB session fixture ──────────────────────────────────────────────────

@pytest.fixture
async def db_session():
    """Fornece session_factory para testes de chamada direta às funções endpoint."""
    import main as svc
    db_url = os.environ["DB_URL"].replace("mysql+pymysql://", "mysql+aiomysql://")
    test_engine = create_async_engine(db_url, echo=False)
    test_session = async_sessionmaker(test_engine, expire_on_commit=False)
    orig_engine, orig_session = svc.engine, svc.AsyncSessionLocal
    svc.engine = test_engine
    svc.AsyncSessionLocal = test_session
    async with test_engine.begin() as conn:
        await conn.run_sync(svc.Base.metadata.create_all)
    yield test_session
    await test_engine.dispose()
    svc.engine, svc.AsyncSessionLocal = orig_engine, orig_session


# ── Seed helpers ──────────────────────────────────────────────────────────────

async def _create_seed(SessionLocal):
    import main as svc
    # PIN "2468" — deliberadamente diferente dos PINs do seed real (Burger
    # House=1234, Pasta & Co=5678, Sweet Corner=9999). validate_pin/verify_pin
    # fazem varredura linear em todas as empresas ativas procurando o hash que
    # bate — com "5678" o teste podia "validar" contra o Pasta & Co de verdade
    # em vez da empresa que ele mesmo acabou de criar.
    pin_hash = bcrypt.hashpw(b"2468", bcrypt.gensalt(4)).decode()
    pw_hash  = bcrypt.hashpw(b"senha123", bcrypt.gensalt(4)).decode()
    async with SessionLocal() as db:
        # sufixo aleatório — ORD-065 tornou document UNIQUE; um valor fixo
        # colidiria (e travaria TODOS os testes que dependem deste seed) se
        # algum teste anterior falhar antes de chamar _cleanup_seed.
        document = f"1111111{os.urandom(4).hex()}"[:14]
        co = svc.Company(name="__cov_co__", document=document,
                         pin_hash=pin_hash, plan="free", payment_provider="mock", state="SP")
        db.add(co); await db.flush()
        t = svc.Terminal(company_id=co.id, label="__cov_t__", terminal_code="__COV__",
                         paygo_terminal_id=None, environment="sandbox")
        u = svc.User(company_id=co.id, name="Cov Owner", email="cov@test.com",
                     password_hash=pw_hash, role="owner")
        db.add_all([t, u]); await db.commit()
        return co.id, t.id, u.id


async def _cleanup_seed(SessionLocal, co_id):
    if co_id <= 10:
        return  # nunca deletar seeds (IDs 1-3 são Burger House, Pasta & Co, Sweet Corner)
    import main as svc
    async with SessionLocal() as db:
        await db.execute(sa_delete(svc.CompanyPaymentConfig).where(
            svc.CompanyPaymentConfig.company_id == co_id))
        await db.execute(sa_delete(svc.User).where(svc.User.company_id == co_id))
        await db.execute(sa_delete(svc.Terminal).where(svc.Terminal.company_id == co_id))
        await db.execute(sa_delete(svc.Company).where(svc.Company.id == co_id))
        await db.commit()


# ═══════════════════════════════════════════════════════════════════════════════
# Sync helpers — testáveis diretamente
# ═══════════════════════════════════════════════════════════════════════════════

def test_encryption_key_sem_configuracao():
    """Linha 47: encrypt_field retorna plaintext quando key is None."""
    import main as svc
    from unittest.mock import patch
    with patch.object(svc, '_encryption_key', return_value=None):
        result = svc.encrypt_field("minha-senha")
    assert result == "minha-senha"


def test_decrypt_enc_sem_key_levanta_runtime_error():
    """Linha 59: decrypt_field levanta RuntimeError quando key é None mas valor tem enc:."""
    import main as svc
    from unittest.mock import patch
    with patch.object(svc, '_encryption_key', return_value=None):
        with pytest.raises(RuntimeError, match="CREDENTIAL_ENCRYPTION_KEY"):
            svc.decrypt_field("enc:YWJj")


def test_require_superadmin_raises_for_owner():
    import main as svc
    with pytest.raises(HTTPException) as exc:
        svc._require_superadmin(_user("owner"))
    assert exc.value.status_code == 403


def test_require_company_admin_superadmin_bypasses():
    import main as svc
    svc._require_company_admin(_user("superadmin", company_id=99), 1)  # não deve levantar


# ═══════════════════════════════════════════════════════════════════════════════
# Endpoints HTTP — erros antes do primeiro await (auth/routing)
# ═══════════════════════════════════════════════════════════════════════════════

async def test_internal_secret_errado_retorna_403(client):
    r = await client.post("/internal/validate-pin", json={"pin": "1234"},
                          headers={"X-Internal-Secret": "errado"})
    assert r.status_code == 403


async def test_list_companies_owner_forbidden(client):
    token = _make_token("owner", 1)
    r = await client.get("/companies", headers=auth(token))
    assert r.status_code == 403


# ═══════════════════════════════════════════════════════════════════════════════
# Chamadas DIRETAS — cobrem linhas pós-`await` (não rastreadas via ASGI transport)
# ═══════════════════════════════════════════════════════════════════════════════

# ── validate_pin (linhas 316-320) ─────────────────────────────────────────────

async def test_dir_validate_pin_invalido(db_session):
    import main as svc
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.validate_pin({"pin": "0000"}, db, None)
        assert exc.value.status_code == 401
    await _cleanup_seed(db_session, co_id)


async def test_dir_validate_pin_valido(db_session):
    import main as svc
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        result = await svc.validate_pin({"pin": "2468"}, db, None)
    assert "company" in result and result["company"]["id"] == co_id
    await _cleanup_seed(db_session, co_id)


# ── verify_pin (linhas 330-343) ───────────────────────────────────────────────

async def test_dir_verify_pin_invalido(db_session):
    import main as svc
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.verify_pin({"pin": "0000", "terminal_id": t_id}, db, None)
        assert exc.value.status_code == 401
    await _cleanup_seed(db_session, co_id)


async def test_dir_verify_pin_terminal_inexistente(db_session):
    import main as svc
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.verify_pin({"pin": "2468", "terminal_id": 999999}, db, None)
        assert exc.value.status_code == 404
    await _cleanup_seed(db_session, co_id)


async def test_dir_verify_pin_valido(db_session):
    import main as svc
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        result = await svc.verify_pin({"pin": "2468", "terminal_id": t_id}, db, None)
    assert "company" in result and "terminal" in result
    await _cleanup_seed(db_session, co_id)


# ── verify_credentials (linhas 353-358) ───────────────────────────────────────

async def test_dir_verify_credentials_user_inexistente(db_session):
    import main as svc
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.verify_credentials({"email": "nao@existe.com", "password": "x"}, db, None)
        assert exc.value.status_code == 401
    await _cleanup_seed(db_session, co_id)


async def test_dir_verify_credentials_senha_errada(db_session):
    import main as svc
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.verify_credentials({"email": "cov@test.com", "password": "errada"}, db, None)
        assert exc.value.status_code == 401
    await _cleanup_seed(db_session, co_id)


async def test_dir_verify_credentials_valido(db_session):
    import main as svc
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        result = await svc.verify_credentials({"email": "cov@test.com", "password": "senha123"}, db, None)
    assert result["role"] == "owner"
    await _cleanup_seed(db_session, co_id)


# ── internal_get_terminal (linhas 369-405) ────────────────────────────────────

async def test_dir_internal_get_terminal_inexistente(db_session):
    import main as svc
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.internal_get_terminal(999999, db, None)
        assert exc.value.status_code == 404


async def test_dir_internal_get_terminal_mock(db_session):
    import main as svc
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        result = await svc.internal_get_terminal(t_id, db, None)
    assert result["payment_provider"] == "mock" and result["config"] is None
    await _cleanup_seed(db_session, co_id)


async def test_dir_internal_get_terminal_paygo_sem_config(db_session):
    # internal_get_terminal não olha company.payment_provider — a fonte de
    # verdade é ter ou não uma CompanyPaymentConfig ativa (comentário no
    # próprio código: "Fonte de verdade: config ativa..."). Sem config ativa,
    # a resposta é sempre fallback mock, mesmo com payment_provider="paygo"
    # na empresa — não levanta 400. Este teste antes esperava uma exceção que
    # o código nunca levantou nesse caminho (bug do teste, não do código).
    import main as svc
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        co = (await db.execute(select(svc.Company).where(svc.Company.id == co_id))).scalars().first()
        co.payment_provider = "paygo"
        await db.commit()
    async with db_session() as db:
        result = await svc.internal_get_terminal(t_id, db, None)
    assert result["payment_provider"] == "mock" and result["config"] is None
    await _cleanup_seed(db_session, co_id)


# ── list_companies (linhas 423-426) ───────────────────────────────────────────

async def test_dir_list_companies(db_session):
    import main as svc
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        result = await svc.list_companies(
            0, 50, q=None, document=None, contract_status=None,
            date_from=None, date_to=None,
            db=db, current_user=_user("superadmin"),
        )
    assert "companies" in result and "total" in result
    await _cleanup_seed(db_session, co_id)


# ── create_company (linhas 452-453) ───────────────────────────────────────────

async def test_dir_create_company(db_session):
    import main as svc
    from main import CompanyIn
    body = CompanyIn(name="__dir_co__", document="11.222.333/0001-81",
                     plan="free", payment_provider="mock", state="SP")
    async with db_session() as db:
        result = await svc.create_company(body, db, _user("superadmin"))
    new_id = result["company"].id
    assert len(result["pin"]) == 6
    async with db_session() as db:
        await db.execute(sa_delete(svc.Company).where(svc.Company.id == new_id))
        await db.commit()


# ── get_company (linhas 469-471) ──────────────────────────────────────────────

async def test_dir_get_company_valido(db_session):
    import main as svc
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        result = await svc.get_company(co_id, db, _user("superadmin"))
    assert result.id == co_id
    await _cleanup_seed(db_session, co_id)


async def test_dir_get_company_inexistente(db_session):
    import main as svc
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.get_company(999999, db, _user("superadmin"))
        assert exc.value.status_code == 404


# ── update_company (linhas 488-500) ───────────────────────────────────────────

async def test_dir_update_company(db_session):
    import main as svc
    from main import CompanyUpdate
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        result = await svc.update_company(co_id, CompanyUpdate(name="__updated__"),
                                          db, _user("superadmin"))
    assert result.name == "__updated__"
    await _cleanup_seed(db_session, co_id)


async def test_dir_update_company_inexistente(db_session):
    import main as svc
    from main import CompanyUpdate
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.update_company(999999, CompanyUpdate(name="X"), db, _user("superadmin"))
        assert exc.value.status_code == 404


# ── delete_company (linhas 516-519) ───────────────────────────────────────────

async def test_dir_delete_company(db_session):
    import main as svc
    pin_hash = bcrypt.hashpw(b"0000", bcrypt.gensalt(4)).decode()
    async with db_session() as db:
        co = svc.Company(name="__del_dir__", document="66666666666",
                         pin_hash=pin_hash, plan="free", payment_provider="mock", state="SP")
        db.add(co); await db.commit()
        del_id = co.id
    async with db_session() as db:
        await svc.delete_company(del_id, db, _user("superadmin"))
    async with db_session() as db:
        co = await db.get(svc.Company, del_id)
        assert co.active is False
        await db.execute(sa_delete(svc.Company).where(svc.Company.id == del_id))
        await db.commit()


async def test_dir_delete_company_inexistente(db_session):
    import main as svc
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.delete_company(999999, db, _user("superadmin"))
        assert exc.value.status_code == 404


# ── regenerate_pin (linhas 537-548) ───────────────────────────────────────────

def _mock_request(ip="127.0.0.1"):
    from unittest.mock import MagicMock
    req = MagicMock()
    req.headers = MagicMock()
    req.headers.get = MagicMock(return_value=None)
    req.client = MagicMock()
    req.client.host = ip
    return req


async def test_dir_regenerate_pin(db_session):
    import main as svc
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        result = await svc.regenerate_pin(co_id, _mock_request(), db, _user("owner", co_id))
    assert len(result["pin"]) == 6
    await _cleanup_seed(db_session, co_id)


async def test_dir_regenerate_pin_empresa_inexistente(db_session):
    import main as svc
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.regenerate_pin(999999, _mock_request(), db, _user("owner", 999999))
        assert exc.value.status_code == 404


# ── list_terminals (linhas 571-576) ───────────────────────────────────────────

async def test_dir_list_terminals(db_session):
    import main as svc
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        result = await svc.list_terminals(co_id, 0, 50, db, _user("owner", co_id))
    assert "terminals" in result and result["total"] >= 1
    await _cleanup_seed(db_session, co_id)


# ── create_terminal (linhas 594-609) ──────────────────────────────────────────

async def test_dir_create_terminal(db_session):
    import main as svc
    from main import TerminalIn
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        result = await svc.create_terminal(co_id, TerminalIn(label="__dir_t__", environment="sandbox"),
                                           db, _user("owner", co_id))
    new_t_id = result.id
    async with db_session() as db:
        await db.execute(sa_delete(svc.Terminal).where(svc.Terminal.id == new_t_id))
        await db.commit()
    await _cleanup_seed(db_session, co_id)


async def test_dir_create_terminal_empresa_inexistente(db_session):
    import main as svc
    from main import TerminalIn
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.create_terminal(999999, TerminalIn(label="X", environment="sandbox"),
                                      db, _user("owner", 999999))
        assert exc.value.status_code == 404


# ── update_terminal (linhas 629-644) ──────────────────────────────────────────

async def test_dir_update_terminal(db_session):
    import main as svc
    from main import TerminalUpdate
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        result = await svc.update_terminal(
            co_id, t_id,
            TerminalUpdate(label="__dir_updated__", paygo_terminal_id="99"),
            db, _user("owner", co_id))
    assert result.label == "__dir_updated__" and result.paygo_terminal_id == "99"
    await _cleanup_seed(db_session, co_id)


async def test_dir_update_terminal_inexistente(db_session):
    import main as svc
    from main import TerminalUpdate
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.update_terminal(1, 999999, TerminalUpdate(label="X"),
                                      db, _user("owner", 1))
        assert exc.value.status_code == 404


# ── delete_terminal (linhas 663-667) ──────────────────────────────────────────

async def test_dir_delete_terminal(db_session):
    import main as svc
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        extra_t = svc.Terminal(company_id=co_id, label="__del_t__",
                               terminal_code="__DT__", environment="sandbox")
        db.add(extra_t); await db.commit()
        del_t_id = extra_t.id
    async with db_session() as db:
        await svc.delete_terminal(co_id, del_t_id, db, _user("owner", co_id))
    await _cleanup_seed(db_session, co_id)


async def test_dir_delete_terminal_inexistente(db_session):
    import main as svc
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.delete_terminal(1, 999999, db, _user("owner", 1))
        assert exc.value.status_code == 404


# ── list_users (linhas 690-694) ───────────────────────────────────────────────

async def test_dir_list_users(db_session):
    import main as svc
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        result = await svc.list_users(
            co_id, 0, 50, name=None, email=None, role=None, status="active",
            db=db, current_user=_user("owner", co_id),
        )
    assert "users" in result and result["total"] >= 1
    await _cleanup_seed(db_session, co_id)


# ── create_user (linhas 712-729) ──────────────────────────────────────────────

async def test_dir_create_user(db_session):
    import main as svc
    from main import UserIn
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        result = await svc.create_user(
            co_id,
            UserIn(name="Novo", email="__novo@dir.com__", password="Senha1234!", role="cashier"),
            db, _user("owner", co_id))
    new_u_id = result.id
    async with db_session() as db:
        await db.execute(sa_delete(svc.User).where(svc.User.id == new_u_id))
        await db.commit()
    await _cleanup_seed(db_session, co_id)


async def test_dir_create_user_empresa_inexistente(db_session):
    import main as svc
    from main import UserIn
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.create_user(
                999999,
                UserIn(name="X", email="x@x.com", password="Senha1234!", role="cashier"),
                db, _user("owner", 999999))
        assert exc.value.status_code == 404


async def test_dir_create_user_email_duplicado(db_session):
    import main as svc
    from main import UserIn
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.create_user(
                co_id,
                UserIn(name="Dup", email="cov@test.com", password="Senha1234!", role="cashier"),
                db, _user("owner", co_id))
        assert exc.value.status_code == 409
    await _cleanup_seed(db_session, co_id)


async def test_dir_create_user_manager_nao_pode_criar_owner(db_session):
    import main as svc
    from main import UserIn
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.create_user(
                co_id,
                UserIn(name="Boss", email="boss@dir.com", password="Senha1234!", role="owner"),
                db, _user("manager", co_id))
        assert exc.value.status_code == 403
    await _cleanup_seed(db_session, co_id)


# ── update_user (linhas 747-760) ──────────────────────────────────────────────

async def test_dir_update_user(db_session):
    import main as svc
    from main import UserUpdate
    co_id, t_id, u_id = await _create_seed(db_session)
    pw = bcrypt.hashpw(b"pw", bcrypt.gensalt(4)).decode()
    async with db_session() as db:
        u2 = svc.User(company_id=co_id, name="U2", email="u2@dir.com",
                      password_hash=pw, role="cashier")
        db.add(u2); await db.commit()
        u2_id = u2.id
    async with db_session() as db:
        result = await svc.update_user(co_id, u2_id, UserUpdate(role="manager"),
                                       db, _user("owner", co_id))
    assert result.role == "manager"
    async with db_session() as db:
        await db.execute(sa_delete(svc.User).where(svc.User.id == u2_id))
        await db.commit()
    await _cleanup_seed(db_session, co_id)


async def test_dir_update_user_inexistente(db_session):
    import main as svc
    from main import UserUpdate
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.update_user(1, 999999, UserUpdate(role="cashier"), db, _user("owner", 1))
        assert exc.value.status_code == 404


async def test_dir_update_user_manager_nao_pode_promover_owner(db_session):
    import main as svc
    from main import UserUpdate
    co_id, t_id, u_id = await _create_seed(db_session)
    pw = bcrypt.hashpw(b"pw", bcrypt.gensalt(4)).decode()
    async with db_session() as db:
        u2 = svc.User(company_id=co_id, name="U2b", email="u2b@dir.com",
                      password_hash=pw, role="cashier")
        db.add(u2); await db.commit()
        u2_id = u2.id
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.update_user(co_id, u2_id, UserUpdate(role="owner"),
                                  db, _user("manager", co_id))
        assert exc.value.status_code == 403
    async with db_session() as db:
        await db.execute(sa_delete(svc.User).where(svc.User.id == u2_id))
        await db.commit()
    await _cleanup_seed(db_session, co_id)


# ── delete_user (linhas 779-785) ──────────────────────────────────────────────

async def test_dir_delete_user(db_session):
    import main as svc
    co_id, t_id, u_id = await _create_seed(db_session)
    pw = bcrypt.hashpw(b"pw", bcrypt.gensalt(4)).decode()
    async with db_session() as db:
        u2 = svc.User(company_id=co_id, name="U2del", email="u2del@dir.com",
                      password_hash=pw, role="cashier")
        db.add(u2); await db.commit()
        u2_id = u2.id
    async with db_session() as db:
        await svc.delete_user(co_id, u2_id, db, _user("owner", co_id))
    await _cleanup_seed(db_session, co_id)


async def test_dir_delete_user_inexistente(db_session):
    import main as svc
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.delete_user(1, 999999, db, _user("owner", 1))
        assert exc.value.status_code == 404


async def test_dir_delete_user_proprio_usuario(db_session):
    import main as svc
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.delete_user(co_id, u_id, db, _user("owner", co_id, sub=str(u_id)))
        assert exc.value.status_code == 403
    await _cleanup_seed(db_session, co_id)


# ── list_payment_configs (linhas 806-821) ─────────────────────────────────────

async def test_dir_list_payment_configs(db_session):
    import main as svc
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        result = await svc.list_payment_configs(co_id, db, _user("owner", co_id))
    assert "configs" in result
    await _cleanup_seed(db_session, co_id)


# ── create_payment_config (linhas 849-861) ────────────────────────────────────

async def test_dir_create_payment_config(db_session):
    import main as svc
    from main import PaymentConfigIn
    co_id, t_id, u_id = await _create_seed(db_session)
    body = PaymentConfigIn(provider="paygo", environment="sandbox", api_key="k1", api_secret="s1")
    async with db_session() as db:
        result = await svc.create_payment_config(co_id, body, db, _user("owner", co_id))
    assert result["api_key"] == "***"
    await _cleanup_seed(db_session, co_id)


async def test_dir_create_payment_config_duplicado(db_session):
    import main as svc
    from main import PaymentConfigIn
    co_id, t_id, u_id = await _create_seed(db_session)
    body = PaymentConfigIn(provider="mock", environment="sandbox")
    async with db_session() as db:
        await svc.create_payment_config(co_id, body, db, _user("owner", co_id))
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.create_payment_config(co_id, body, db, _user("owner", co_id))
        assert exc.value.status_code == 409
    await _cleanup_seed(db_session, co_id)


# ── update_payment_config (linhas 881-901) ────────────────────────────────────

async def test_dir_update_payment_config(db_session):
    import main as svc
    from main import PaymentConfigIn
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        created = await svc.create_payment_config(
            co_id,
            PaymentConfigIn(provider="paygo", environment="sandbox", api_key="k1", api_secret="s1"),
            db, _user("owner", co_id))
    cfg_id = created["id"]
    # create_payment_config nasce com active=False (só uma config fica ativa
    # por vez); update/delete só enxergam config ativa — precisa ativar antes,
    # senão cai no 404 "Config não encontrada" (bug do teste, não do código).
    async with db_session() as db:
        await svc.activate_payment_config(co_id, cfg_id, db, _user("owner", co_id))
    async with db_session() as db:
        result = await svc.update_payment_config(
            co_id, cfg_id,
            PaymentConfigIn(provider="paygo", environment="sandbox", api_key="k2", api_secret="s2"),
            db, _user("owner", co_id))
    assert result["api_key"] == "***"
    await _cleanup_seed(db_session, co_id)


async def test_dir_update_payment_config_inexistente(db_session):
    import main as svc
    from main import PaymentConfigIn
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.update_payment_config(
                1, 999999,
                PaymentConfigIn(provider="paygo", environment="sandbox"),
                db, _user("owner", 1))
        assert exc.value.status_code == 404


# ── delete_payment_config (linhas 920-924) ────────────────────────────────────

async def test_dir_delete_payment_config(db_session):
    import main as svc
    from main import PaymentConfigIn
    co_id, t_id, u_id = await _create_seed(db_session)
    async with db_session() as db:
        created = await svc.create_payment_config(
            co_id,
            PaymentConfigIn(provider="mock", environment="sandbox"),
            db, _user("owner", co_id))
    cfg_id = created["id"]
    # mesma razão do test_dir_update_payment_config — precisa estar ativa.
    async with db_session() as db:
        await svc.activate_payment_config(co_id, cfg_id, db, _user("owner", co_id))
    async with db_session() as db:
        await svc.delete_payment_config(co_id, cfg_id, db, _user("owner", co_id))
    await _cleanup_seed(db_session, co_id)


async def test_dir_delete_payment_config_inexistente(db_session):
    import main as svc
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.delete_payment_config(1, 999999, db, _user("owner", 1))
        assert exc.value.status_code == 404
