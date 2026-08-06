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
    """Cria uma empresa (Burger House) e uma Pasta & Co pra testar isolamento multi-tenant."""
    import main as svc
    pin_hash = bcrypt.hashpw(b"1234", bcrypt.gensalt(4)).decode()
    async with svc.AsyncSessionLocal() as db:
        # documentos distintos — ORD-065 tornou companies.document UNIQUE
        co_a = svc.Company(name="__ord058_a__", document="11222333000181", pin_hash=pin_hash, plan="free")
        co_b = svc.Company(name="__ord058_b__", document="22333444000192", pin_hash=pin_hash, plan="free")
        db.add_all([co_a, co_b]); await db.commit()
        yield {"company_a": co_a.id, "company_b": co_b.id,
               "owner_a_token": _make_token("owner", co_a.id),
               "manager_a_token": _make_token("manager", co_a.id),
               "owner_b_token": _make_token("owner", co_b.id)}
        await db.execute(sa_delete(svc.CompanyLegalRepresentative).where(
            svc.CompanyLegalRepresentative.company_id.in_([co_a.id, co_b.id])))
        await db.execute(sa_delete(svc.CompanyContact).where(
            svc.CompanyContact.company_id.in_([co_a.id, co_b.id])))
        await db.execute(sa_delete(svc.Company).where(svc.Company.id.in_([co_a.id, co_b.id])))
        await db.commit()


# ── Contatos ──────────────────────────────────────────────────────────────────

async def test_criar_contato_comercial_happy_path(client, superadmin_token, empresa):
    r = await client.post(f"/companies/{empresa['company_a']}/contacts", headers=auth(superadmin_token), json={
        "contact_type": "comercial", "name": "Maria Silva", "role_title": "Gerente",
        "email": "maria@burgerhouse.com", "phone": "11999990000",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Maria Silva"
    assert body["email"] == "maria@burgerhouse.com"


async def test_contato_persistido_criptografado_no_banco(client, superadmin_token, empresa):
    import main as svc
    r = await client.post(f"/companies/{empresa['company_a']}/contacts", headers=auth(superadmin_token), json={
        "contact_type": "financeiro", "name": "João Souza", "email": "joao@burgerhouse.com",
    })
    contact_id = r.json()["id"]
    async with svc.AsyncSessionLocal() as db:
        row = await db.get(svc.CompanyContact, contact_id)
        assert row.name_enc.startswith("enc:")
        assert row.email_enc.startswith("enc:")
        assert "João" not in row.name_enc
        assert "joao@burgerhouse.com" not in row.email_enc


async def test_listar_contatos_retorna_descriptografado(client, superadmin_token, empresa):
    await client.post(f"/companies/{empresa['company_a']}/contacts", headers=auth(superadmin_token), json={
        "contact_type": "tecnico", "name": "Carlos Tech", "email": "carlos@burgerhouse.com",
    })
    r = await client.get(f"/companies/{empresa['company_a']}/contacts", headers=auth(superadmin_token))
    assert r.status_code == 200
    contatos = r.json()["contacts"]
    assert any(c["name"] == "Carlos Tech" and c["email"] == "carlos@burgerhouse.com" for c in contatos)


async def test_descriptografia_preserva_acentos_e_caracteres_especiais(client, superadmin_token, empresa):
    r = await client.post(f"/companies/{empresa['company_a']}/contacts", headers=auth(superadmin_token), json={
        "contact_type": "comercial", "name": "José D'Ávila Ção", "email": "jose+teste@empresa.com.br",
    })
    contact_id = r.json()["id"]
    r2 = await client.get(f"/companies/{empresa['company_a']}/contacts", headers=auth(superadmin_token))
    contato = next(c for c in r2.json()["contacts"] if c["id"] == contact_id)
    assert contato["name"] == "José D'Ávila Ção"
    assert contato["email"] == "jose+teste@empresa.com.br"


async def test_contato_financeiro_e_tecnico_sao_opcionais(client, superadmin_token, empresa):
    await client.post(f"/companies/{empresa['company_a']}/contacts", headers=auth(superadmin_token), json={
        "contact_type": "comercial", "name": "Único Contato", "email": "unico@empresa.com",
    })
    r = await client.get(f"/companies/{empresa['company_a']}/contacts", headers=auth(superadmin_token))
    tipos = {c["contact_type"] for c in r.json()["contacts"]}
    assert tipos == {"comercial"}


async def test_contact_type_invalido_e_rejeitado(client, superadmin_token, empresa):
    r = await client.post(f"/companies/{empresa['company_a']}/contacts", headers=auth(superadmin_token), json={
        "contact_type": "invalido", "name": "X", "email": "x@x.com",
    })
    assert r.status_code == 422


async def test_isolamento_multitenant_em_contatos(client, superadmin_token, empresa):
    await client.post(f"/companies/{empresa['company_a']}/contacts", headers=auth(superadmin_token), json={
        "contact_type": "comercial", "name": "Contato A", "email": "a@empresaA.com",
    })
    r = await client.get(f"/companies/{empresa['company_a']}/contacts", headers=auth(empresa["owner_b_token"]))
    assert r.status_code == 403


async def test_manager_pode_criar_contato_da_propria_empresa(client, empresa):
    r = await client.post(f"/companies/{empresa['company_a']}/contacts", headers=auth(empresa["manager_a_token"]), json={
        "contact_type": "comercial", "name": "Via Manager", "email": "manager@empresaA.com",
    })
    assert r.status_code == 201


# ── Responsável legal ─────────────────────────────────────────────────────────

async def test_cadastrar_responsavel_legal_happy_path(client, superadmin_token, empresa):
    r = await client.post(f"/companies/{empresa['company_a']}/legal-representative",
                          headers=auth(superadmin_token), json={
        "name": "Carlos Administrador", "cpf": "111.444.777-35",
        "role_title": "Sócio-administrador", "email": "carlos@burgerhouse.com",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Carlos Administrador"
    assert body["cpf"] == "11144477735"


async def test_cpf_persistido_criptografado_no_banco(client, superadmin_token, empresa):
    import main as svc
    r = await client.post(f"/companies/{empresa['company_a']}/legal-representative",
                          headers=auth(superadmin_token), json={
        "name": "Ana Legal", "cpf": "529.982.247-25", "email": "ana@burgerhouse.com",
    })
    rep_id = r.json()["id"]
    async with svc.AsyncSessionLocal() as db:
        row = await db.get(svc.CompanyLegalRepresentative, rep_id)
        assert row.cpf_enc.startswith("enc:")
        assert "52998224725" not in row.cpf_enc


async def test_cpf_invalido_e_rejeitado(client, superadmin_token, empresa):
    r = await client.post(f"/companies/{empresa['company_a']}/legal-representative",
                          headers=auth(superadmin_token), json={
        "name": "CPF Errado", "cpf": "111.444.777-30", "email": "errado@empresa.com",
    })
    assert r.status_code == 422


async def test_upsert_legal_representative_atualiza_registro_existente(client, superadmin_token, empresa):
    r1 = await client.post(f"/companies/{empresa['company_a']}/legal-representative",
                           headers=auth(superadmin_token), json={
        "name": "Primeiro Nome", "cpf": "111.444.777-35", "email": "primeiro@empresa.com",
    })
    r2 = await client.post(f"/companies/{empresa['company_a']}/legal-representative",
                           headers=auth(superadmin_token), json={
        "name": "Nome Atualizado", "cpf": "529.982.247-25", "email": "atualizado@empresa.com",
    })
    assert r1.json()["id"] == r2.json()["id"]  # mesmo registro, não duplicou
    r3 = await client.get(f"/companies/{empresa['company_a']}/legal-representative", headers=auth(superadmin_token))
    assert r3.json()["name"] == "Nome Atualizado"


async def test_manager_nao_pode_cadastrar_responsavel_legal(client, empresa):
    r = await client.post(f"/companies/{empresa['company_a']}/legal-representative",
                          headers=auth(empresa["manager_a_token"]), json={
        "name": "Manager Tentando", "cpf": "111.444.777-35", "email": "manager@empresa.com",
    })
    assert r.status_code == 403


async def test_owner_pode_cadastrar_responsavel_legal_da_propria_empresa(client, empresa):
    r = await client.post(f"/companies/{empresa['company_a']}/legal-representative",
                          headers=auth(empresa["owner_a_token"]), json={
        "name": "Owner Cadastrando", "cpf": "111.444.777-35", "email": "owner@empresa.com",
    })
    assert r.status_code == 200


async def test_isolamento_multitenant_em_responsavel_legal(client, superadmin_token, empresa):
    await client.post(f"/companies/{empresa['company_a']}/legal-representative",
                      headers=auth(superadmin_token), json={
        "name": "Legal A", "cpf": "111.444.777-35", "email": "legal@empresaA.com",
    })
    r = await client.get(f"/companies/{empresa['company_a']}/legal-representative",
                         headers=auth(empresa["owner_b_token"]))
    assert r.status_code == 403


async def test_get_legal_representative_nao_cadastrado_retorna_404(client, superadmin_token, empresa):
    r = await client.get(f"/companies/{empresa['company_b']}/legal-representative", headers=auth(superadmin_token))
    assert r.status_code == 404
