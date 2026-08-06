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
def owner_token():
    return _make_token("owner", 1)


# Token sintético que não colide com nenhum nome de empresa real nem com os
# CNPJs "clássicos" (11222333000181 etc.) reaproveitados pelos outros testes
# e pelo E2E do ORD-060 — os testes rodam contra o MySQL de dev compartilhado,
# então contar registros por substring de nome real seria frágil.
TOKEN = "Zzord061xSabor"


@pytest.fixture
async def empresas(client):
    """Três empresas com nome/razão social/CNPJ/status de contrato distintos,
    inseridas direto no banco (sem passar pelo POST /companies) para não
    depender de mock de consulta à Receita — o foco aqui é filtro e edição.
    Só duas contêm o TOKEN (uma no nome, outra na razão social); a terceira
    não contém, para servir de controle negativo do filtro."""
    import main as svc
    pin_hash = bcrypt.hashpw(b"1234", bcrypt.gensalt(4)).decode()
    async with svc.AsyncSessionLocal() as db:
        com_token_no_nome = svc.Company(
            name=f"{TOKEN} Caseiro Ltda", legal_name=f"{TOKEN} Caseiro Comércio de Alimentos Ltda",
            document="72835450755173", pin_hash=pin_hash, plan="free", contract_status="pendente", state="SP",
        )
        com_token_na_razao = svc.Company(
            name="Zzord061 Confeitaria Doce", legal_name=f"{TOKEN} Doce Confeitaria EIRELI",
            document="67525081250650", pin_hash=pin_hash, plan="free", contract_status="enviado", state="SP",
        )
        sem_token = svc.Company(
            name="Zzord061 Outra Empresa", legal_name="Zzord061 Outra Empresa Ltda",
            document="22644575952997", pin_hash=pin_hash, plan="free", contract_status="assinado", state="SP",
        )
        db.add_all([com_token_no_nome, com_token_na_razao, sem_token])
        await db.commit()
        ids = {"nome": com_token_no_nome.id, "razao": com_token_na_razao.id, "outra": sem_token.id}
        yield ids
        await db.execute(sa_delete(svc.Company).where(svc.Company.id.in_(ids.values())))
        await db.commit()


# ── GET /companies — filtros ─────────────────────────────────────────────────

async def test_filtro_q_busca_em_nome_e_razao_social(client, superadmin_token, empresas):
    r = await client.get(f"/companies?q={TOKEN}", headers=auth(superadmin_token))
    assert r.status_code == 200
    ids = {c["id"] for c in r.json()["companies"]}
    assert ids == {empresas["nome"], empresas["razao"]}
    assert empresas["outra"] not in ids
    assert r.json()["total"] == 2


async def test_filtro_document_aceita_cnpj_mascarado(client, superadmin_token, empresas):
    r = await client.get("/companies?document=72.835.450/7551-73", headers=auth(superadmin_token))
    assert r.status_code == 200
    assert r.json()["total"] == 1
    assert r.json()["companies"][0]["id"] == empresas["nome"]


async def test_filtro_contract_status(client, superadmin_token, empresas):
    r = await client.get("/companies?contract_status=enviado", headers=auth(superadmin_token))
    assert r.status_code == 200
    ids = {c["id"] for c in r.json()["companies"]}
    assert empresas["razao"] in ids
    assert empresas["nome"] not in ids
    assert empresas["outra"] not in ids


async def test_filtros_combinados(client, superadmin_token, empresas):
    r = await client.get(f"/companies?q={TOKEN}&contract_status=pendente", headers=auth(superadmin_token))
    assert r.status_code == 200
    assert r.json()["total"] == 1
    assert r.json()["companies"][0]["id"] == empresas["nome"]


async def test_filtro_sem_correspondencia_retorna_lista_vazia(client, superadmin_token, empresas):
    r = await client.get("/companies?q=inexistenteZZZ999", headers=auth(superadmin_token))
    assert r.status_code == 200
    assert r.json() == {"companies": [], "total": 0}


async def test_listagem_negada_para_role_nao_superadmin(client, owner_token, empresas):
    r = await client.get("/companies", headers=auth(owner_token))
    assert r.status_code == 403


# ── PUT /companies/{id} — edição completa ────────────────────────────────────

async def test_editar_campos_cadastrais_completos(client, superadmin_token, empresas):
    r = await client.put(f"/companies/{empresas['nome']}", headers=auth(superadmin_token), json={
        "legal_name": "Sabor Caseiro Comércio de Alimentos EIRELI",
        "company_size": "EPP",
        "tax_regime": "lucro_presumido",
        "zip_code": "01310-100",
        "street": "Av. Paulista",
        "address_number": "1000",
        "neighborhood": "Bela Vista",
        "city": "São Paulo",
        "state": "SP",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["legal_name"] == "Sabor Caseiro Comércio de Alimentos EIRELI"
    assert body["company_size"] == "EPP"
    assert body["tax_regime"] == "lucro_presumido"
    assert body["zip_code"] == "01310100"  # persistido sem máscara
    assert body["street"] == "Av. Paulista"
    assert body["city"] == "São Paulo"

    # persistência confirmada num GET separado, não só na resposta do PUT
    r2 = await client.get(f"/companies/{empresas['nome']}", headers=auth(superadmin_token))
    assert r2.json()["legal_name"] == "Sabor Caseiro Comércio de Alimentos EIRELI"


async def test_document_e_imutavel_via_put(client, superadmin_token, empresas):
    original = "72835450755173"
    r = await client.put(f"/companies/{empresas['nome']}", headers=auth(superadmin_token), json={
        "document": "99999999000199", "legal_name": "Nome Novo",
    })
    assert r.status_code == 200
    assert r.json()["document"] == original
    assert r.json()["legal_name"] == "Nome Novo"


async def test_editar_cep_invalido_e_rejeitado(client, superadmin_token, empresas):
    r = await client.put(f"/companies/{empresas['nome']}", headers=auth(superadmin_token), json={
        "zip_code": "123",
    })
    assert r.status_code == 422


async def test_editar_empresa_inexistente_retorna_404(client, superadmin_token):
    r = await client.put("/companies/999999", headers=auth(superadmin_token), json={"name": "X"})
    assert r.status_code == 404


async def test_editar_como_owner_e_negado(client, owner_token, empresas):
    r = await client.put(f"/companies/{empresas['nome']}", headers=auth(owner_token), json={"name": "X"})
    assert r.status_code == 403
