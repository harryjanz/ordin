import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta

import bcrypt
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def _make_token(role: str, company_id: int) -> str:
    from jose import jwt
    secret = os.environ.get("JWT_SECRET", "test-secret-ci")
    return jwt.encode(
        {"sub": "1", "company": company_id, "role": role,
         "exp": datetime.utcnow() + timedelta(hours=1)},
        secret, algorithm="HS256"
    )


def auth(token):
    return {"Authorization": f"Bearer {token}"}


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


@pytest.fixture
def superadmin_token():
    return _make_token("superadmin", 0)


@pytest.fixture
async def empresa(client):
    import main as svc
    pin_hash = bcrypt.hashpw(b"1234", bcrypt.gensalt(4)).decode()
    async with svc.AsyncSessionLocal() as db:
        co = svc.Company(name="__ord059__", document="11222333000181", pin_hash=pin_hash, plan="free", state="SP")
        db.add(co); await db.commit()
        yield co.id
        await db.execute(sa_delete(svc.Company).where(svc.Company.id == co.id))
        await db.commit()


async def test_nova_empresa_nasce_com_contrato_pendente(client, superadmin_token, empresa):
    r = await client.get(f"/companies/{empresa}", headers=auth(superadmin_token))
    assert r.json()["contract_status"] == "pendente"


async def test_marcar_como_enviado_happy_path(client, superadmin_token, empresa):
    r = await client.patch(f"/companies/{empresa}/contract-status",
                           headers=auth(superadmin_token), data={"status": "enviado"})
    assert r.status_code == 200
    body = r.json()
    assert body["contract_status"] == "enviado"
    assert body["contract_sent_at"] is not None


async def test_marcar_como_assinado_com_pdf_happy_path(client, superadmin_token, empresa):
    await client.patch(f"/companies/{empresa}/contract-status",
                       headers=auth(superadmin_token), data={"status": "enviado"})
    r = await client.patch(
        f"/companies/{empresa}/contract-status",
        headers=auth(superadmin_token), data={"status": "assinado"},
        files={"signed_document": ("contrato_assinado.pdf", b"%PDF-1.4 conteudo fake", "application/pdf")},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["contract_status"] == "assinado"
    assert body["contract_signed_at"] is not None
    assert body["contract_document_url"] is not None


async def test_marcar_assinado_sem_arquivo_e_rejeitado(client, superadmin_token, empresa):
    r = await client.patch(f"/companies/{empresa}/contract-status",
                           headers=auth(superadmin_token), data={"status": "assinado"})
    assert r.status_code == 422


async def test_pular_direto_pendente_para_assinado_e_permitido(client, superadmin_token, empresa):
    r = await client.patch(
        f"/companies/{empresa}/contract-status",
        headers=auth(superadmin_token), data={"status": "assinado"},
        files={"signed_document": ("contrato.pdf", b"conteudo", "application/pdf")},
    )
    assert r.status_code == 200
    assert r.json()["contract_status"] == "assinado"


async def test_regressao_de_assinado_para_enviado_e_bloqueada(client, superadmin_token, empresa):
    await client.patch(
        f"/companies/{empresa}/contract-status",
        headers=auth(superadmin_token), data={"status": "assinado"},
        files={"signed_document": ("contrato.pdf", b"conteudo", "application/pdf")},
    )
    r = await client.patch(f"/companies/{empresa}/contract-status",
                           headers=auth(superadmin_token), data={"status": "enviado"})
    assert r.status_code == 422


async def test_status_invalido_e_rejeitado(client, superadmin_token, empresa):
    r = await client.patch(f"/companies/{empresa}/contract-status",
                           headers=auth(superadmin_token), data={"status": "cancelado"})
    assert r.status_code == 422


async def test_apenas_superadmin_pode_alterar_status(client, empresa):
    owner_token = _make_token("owner", empresa)
    r = await client.patch(f"/companies/{empresa}/contract-status",
                           headers=auth(owner_token), data={"status": "enviado"})
    assert r.status_code == 403


async def test_mudanca_de_status_gera_audit_log(client, superadmin_token, empresa, capsys):
    await client.patch(f"/companies/{empresa}/contract-status",
                       headers=auth(superadmin_token), data={"status": "enviado"})
    out = capsys.readouterr().out
    linhas_audit = [l for l in out.splitlines() if '"audit": true' in l]
    assert any("contract_status_changed" in l and '"to": "enviado"' in l for l in linhas_audit)


async def test_empresa_inexistente_retorna_404(client, superadmin_token):
    r = await client.patch("/companies/999999/contract-status",
                           headers=auth(superadmin_token), data={"status": "enviado"})
    assert r.status_code == 404
