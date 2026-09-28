import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# ORD-209 — nasceu como "100% frontend" (tela de admin pra CommissionTable,
# ORD-206), mas duas lacunas reais de backend surgiram no processo:
# (1) archive não bloqueava tabela vinculada a parceiro ativo (só o DELETE
#     bloqueava, desde o ORD-207) — achado no repasse de Backend-SR;
# (2) não existia NENHUM endpoint de consulta de tabela única — só
#     criar/listar/editar/set-default/archive/delete/histórico. Faltou no
#     ORD-206 e passou pelos repasses do ORD-207/208 sem ninguém notar
#     porque nenhuma tela tinha precisado carregar uma tabela específica
#     pra edição até agora — só apareceu testando a UI de verdade (o
#     Tech Explorer desta história presumiu, por analogia com Partner/
#     PriceTable, que o endpoint já existia, sem checar).
# O resto do CRUD já é coberto por test_ord206_comissionamento_parceiro.py
# e test_ord207_cadastro_parceiro.py, que não mudam.


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


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _create_commission_table(client, token, name: str = "Tabela") -> dict:
    resp = await client.post(
        "/commercial/commission-tables",
        json={
            "name": name,
            "setup_fee_per_totem": 150.00,
            "recurring_percent": 3.5,
            "vigente_desde": "2026-01-01T00:00:00",
        },
        headers=auth(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_partner(client, token, commission_table_id: int) -> dict:
    resp = await client.post(
        "/commercial/partners",
        json={
            "name": "Fulano de Tal",
            "partner_type": "PF",
            "document": "123.456.789-09",
            "email": "fulano@parceiro.com",
            "phone": "11999999999",
            "acceptance_reference": "e-mail de 20/09 com fulano@parceiro.com",
            "commission_table_id": commission_table_id,
            "confirm_clickwrap": True,
        },
        headers=auth(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Arquivar bloqueado se tem parceiro vinculado (correção desta história) ──

async def test_arquivar_commission_table_vinculada_a_parceiro_e_bloqueado(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    await _create_partner(client, token_superadmin, ct["id"])

    resp = await client.post(
        f"/commercial/commission-tables/{ct['id']}/archive", headers=auth(token_superadmin),
    )
    assert resp.status_code == 409
    assert "parceiro" in resp.json()["detail"].lower()


async def test_consultar_commission_table_por_id(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin, name="Tabela X")
    resp = await client.get(f"/commercial/commission-tables/{ct['id']}", headers=auth(token_superadmin))
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "Tabela X"


async def test_consultar_commission_table_inexistente_retorna_404(client, token_superadmin):
    resp = await client.get("/commercial/commission-tables/99999", headers=auth(token_superadmin))
    assert resp.status_code == 404


async def test_arquivar_commission_table_sem_parceiro_continua_permitido(client, token_superadmin):
    # Tabela elegível (não é padrão, sem parceiro vinculado) — garante que a
    # checagem nova não quebrou o caminho feliz que já existia. Ambas criadas
    # antes de qualquer set-default, pra nenhuma exigir `note` (só é
    # obrigatória quando já existe uma tabela padrão no momento da criação).
    default_ct = await _create_commission_table(client, token_superadmin, name="Padrão")
    ct = await _create_commission_table(client, token_superadmin, name="Sem uso")
    await client.post(f"/commercial/commission-tables/{default_ct['id']}/set-default", json={}, headers=auth(token_superadmin))

    resp = await client.post(
        f"/commercial/commission-tables/{ct['id']}/archive", headers=auth(token_superadmin),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["archived_at"] is not None
