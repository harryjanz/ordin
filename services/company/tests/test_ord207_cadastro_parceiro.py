import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


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


async def _create_commission_table(client, token, name: str = "Padrão") -> dict:
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


async def _archive_commission_table(client, token, commission_table_id: int) -> None:
    resp = await client.post(
        f"/commercial/commission-tables/{commission_table_id}/archive", headers=auth(token),
    )
    assert resp.status_code == 200, resp.text


def _payload(
    name: str = "Fulano de Tal",
    partner_type: str = "PF",
    document: str = "123.456.789-09",
    commission_table_id: int | None = None,
    **overrides,
) -> dict:
    body = {
        "name": name,
        "partner_type": partner_type,
        "document": document,
        "email": "fulano@parceiro.com",
        "phone": "11999999999",
        "acceptance_reference": "e-mail de 20/09 com fulano@parceiro.com",
        "commission_table_id": commission_table_id,
        "confirm_clickwrap": True,
    }
    body.update(overrides)
    return body


async def _create_partner(client, token, commission_table_id: int, **kwargs) -> dict:
    resp = await client.post(
        "/commercial/partners",
        json=_payload(commission_table_id=commission_table_id, **kwargs),
        headers=auth(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Criação — CRUD básico ────────────────────────────────────────────────────

async def test_criar_parceiro_pf_com_dados_validos(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    resp = await client.post(
        "/commercial/partners",
        json=_payload(commission_table_id=ct["id"]),
        headers=auth(token_superadmin),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "ativo"
    assert body["commission_table"]["id"] == ct["id"]


async def test_criar_parceiro_pj_com_dados_validos(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    resp = await client.post(
        "/commercial/partners",
        json=_payload(name="Acme Ltda", partner_type="PJ", document="11.222.333/0001-81", commission_table_id=ct["id"]),
        headers=auth(token_superadmin),
    )
    assert resp.status_code == 201, resp.text


async def test_erro_criar_pf_com_cpf_invalido(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    resp = await client.post(
        "/commercial/partners",
        json=_payload(document="111.111.111-11", commission_table_id=ct["id"]),
        headers=auth(token_superadmin),
    )
    assert resp.status_code == 422


async def test_erro_criar_pj_com_cnpj_invalido(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    resp = await client.post(
        "/commercial/partners",
        json=_payload(partner_type="PJ", document="11.111.111/1111-11", commission_table_id=ct["id"]),
        headers=auth(token_superadmin),
    )
    assert resp.status_code == 422


async def test_erro_documento_duplicado(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    await _create_partner(client, token_superadmin, ct["id"])
    resp = await client.post(
        "/commercial/partners",
        json=_payload(name="Outro Nome", commission_table_id=ct["id"]),
        headers=auth(token_superadmin),
    )
    assert resp.status_code == 422


async def test_erro_nome_vazio(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    resp = await client.post(
        "/commercial/partners", json=_payload(name="", commission_table_id=ct["id"]), headers=auth(token_superadmin),
    )
    assert resp.status_code == 422


async def test_erro_email_vazio(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    resp = await client.post(
        "/commercial/partners", json=_payload(email="", commission_table_id=ct["id"]), headers=auth(token_superadmin),
    )
    assert resp.status_code == 422


async def test_ler_parceiro_existente(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    p = await _create_partner(client, token_superadmin, ct["id"])
    resp = await client.get(f"/commercial/partners/{p['id']}", headers=auth(token_superadmin))
    assert resp.status_code == 200
    assert resp.json()["id"] == p["id"]


async def test_ler_parceiro_inexistente(client, token_superadmin):
    resp = await client.get("/commercial/partners/999999", headers=auth(token_superadmin))
    assert resp.status_code == 404


async def test_atualizar_dados_cadastrais(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    p = await _create_partner(client, token_superadmin, ct["id"])
    resp = await client.put(
        f"/commercial/partners/{p['id']}",
        json={"name": "Fulano Atualizado", "email": "novo@parceiro.com", "phone": "11888888888"},
        headers=auth(token_superadmin),
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Fulano Atualizado"


async def test_erro_atualizar_com_email_vazio(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    p = await _create_partner(client, token_superadmin, ct["id"])
    resp = await client.put(
        f"/commercial/partners/{p['id']}",
        json={"name": "Fulano", "email": "", "phone": "11999999999"},
        headers=auth(token_superadmin),
    )
    assert resp.status_code == 422


async def test_atualizar_ignora_document_e_partner_type_enviados(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    p = await _create_partner(client, token_superadmin, ct["id"])
    resp = await client.put(
        f"/commercial/partners/{p['id']}",
        json={
            "name": "Fulano", "email": "fulano@parceiro.com", "phone": "11999999999",
            "document": "999.999.999-99", "partner_type": "PJ",
        },
        headers=auth(token_superadmin),
    )
    assert resp.status_code == 200
    assert resp.json()["document"] == p["document"]
    assert resp.json()["partner_type"] == "PF"


# ── Aceite clickwrap ─────────────────────────────────────────────────────────

async def test_erro_criar_sem_confirmar_clickwrap(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    resp = await client.post(
        "/commercial/partners",
        json=_payload(commission_table_id=ct["id"], confirm_clickwrap=False),
        headers=auth(token_superadmin),
    )
    assert resp.status_code == 422


async def test_aceite_registra_versao_quem_quando(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    p = await _create_partner(client, token_superadmin, ct["id"])
    assert p["accepted_term_version"] == "v1"
    assert p["accepted_at"] is not None
    assert p["registered_by_user_id"] == 1


# ── Vínculo com CommissionTable ──────────────────────────────────────────────

async def test_criar_parceiro_vinculado_a_tabela_especifica(client, token_superadmin):
    a = await _create_commission_table(client, token_superadmin, name="A")
    b = await _create_commission_table(client, token_superadmin, name="B")
    p = await _create_partner(client, token_superadmin, b["id"])
    assert p["commission_table"]["id"] == b["id"]
    assert p["commission_table"]["id"] != a["id"]


async def test_erro_vincular_tabela_arquivada_na_criacao(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    await _archive_commission_table(client, token_superadmin, ct["id"])
    resp = await client.post(
        "/commercial/partners", json=_payload(commission_table_id=ct["id"]), headers=auth(token_superadmin),
    )
    assert resp.status_code == 422


async def test_erro_vincular_tabela_inexistente(client, token_superadmin):
    resp = await client.post(
        "/commercial/partners", json=_payload(commission_table_id=999999), headers=auth(token_superadmin),
    )
    assert resp.status_code == 404


async def test_trocar_tabela_vinculada(client, token_superadmin):
    a = await _create_commission_table(client, token_superadmin, name="A")
    b = await _create_commission_table(client, token_superadmin, name="B")
    p = await _create_partner(client, token_superadmin, a["id"])

    resp = await client.post(
        f"/commercial/partners/{p['id']}/commission-table",
        json={"commission_table_id": b["id"]},
        headers=auth(token_superadmin),
    )
    assert resp.status_code == 200
    assert resp.json()["commission_table"]["id"] == b["id"]


async def test_erro_trocar_para_tabela_arquivada(client, token_superadmin):
    a = await _create_commission_table(client, token_superadmin, name="A")
    c = await _create_commission_table(client, token_superadmin, name="C")
    await _archive_commission_table(client, token_superadmin, c["id"])
    p = await _create_partner(client, token_superadmin, a["id"])

    resp = await client.post(
        f"/commercial/partners/{p['id']}/commission-table",
        json={"commission_table_id": c["id"]},
        headers=auth(token_superadmin),
    )
    assert resp.status_code == 422

    check = await client.get(f"/commercial/partners/{p['id']}", headers=auth(token_superadmin))
    assert check.json()["commission_table"]["id"] == a["id"]


async def test_trocar_para_mesma_tabela_e_idempotente_sem_historico(client, token_superadmin):
    a = await _create_commission_table(client, token_superadmin, name="A")
    p = await _create_partner(client, token_superadmin, a["id"])

    resp = await client.post(
        f"/commercial/partners/{p['id']}/commission-table",
        json={"commission_table_id": a["id"]},
        headers=auth(token_superadmin),
    )
    assert resp.status_code == 200

    history = await client.get(f"/commercial/partners/{p['id']}/history", headers=auth(token_superadmin))
    assert history.json()["entries"] == []


# ── Histórico ────────────────────────────────────────────────────────────────

async def test_troca_gera_historico_com_from_to_corretos(client, token_superadmin):
    a = await _create_commission_table(client, token_superadmin, name="A")
    b = await _create_commission_table(client, token_superadmin, name="B")
    p = await _create_partner(client, token_superadmin, a["id"])

    await client.post(
        f"/commercial/partners/{p['id']}/commission-table",
        json={"commission_table_id": b["id"]}, headers=auth(token_superadmin),
    )

    history = await client.get(f"/commercial/partners/{p['id']}/history", headers=auth(token_superadmin))
    entries = history.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["from_commission_table"]["id"] == a["id"]
    assert entries[0]["to_commission_table"]["id"] == b["id"]


async def test_multiplas_trocas_em_ordem_cronologica(client, token_superadmin):
    a = await _create_commission_table(client, token_superadmin, name="A")
    b = await _create_commission_table(client, token_superadmin, name="B")
    c = await _create_commission_table(client, token_superadmin, name="C")
    p = await _create_partner(client, token_superadmin, a["id"])

    await client.post(f"/commercial/partners/{p['id']}/commission-table", json={"commission_table_id": b["id"]}, headers=auth(token_superadmin))
    await client.post(f"/commercial/partners/{p['id']}/commission-table", json={"commission_table_id": c["id"]}, headers=auth(token_superadmin))

    history = await client.get(f"/commercial/partners/{p['id']}/history", headers=auth(token_superadmin))
    entries = history.json()["entries"]
    assert len(entries) == 2
    assert entries[0]["from_commission_table"]["id"] == a["id"]
    assert entries[0]["to_commission_table"]["id"] == b["id"]
    assert entries[1]["from_commission_table"]["id"] == b["id"]
    assert entries[1]["to_commission_table"]["id"] == c["id"]


# ── Listagem ─────────────────────────────────────────────────────────────────

async def test_listagem_mostra_campos_direto(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    await _create_partner(client, token_superadmin, ct["id"])

    resp = await client.get("/commercial/partners", headers=auth(token_superadmin))
    item = resp.json()["partners"][0]
    assert {"name", "partner_type", "commission_table", "status"}.issubset(item.keys())


async def test_listagem_esconde_inativos_por_padrao(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    ativo = await _create_partner(client, token_superadmin, ct["id"], document="123.456.789-09")
    inativo = await _create_partner(client, token_superadmin, ct["id"], name="Inativo", document="987.654.321-00")
    await client.post(f"/commercial/partners/{inativo['id']}/deactivate", headers=auth(token_superadmin))

    resp = await client.get("/commercial/partners", headers=auth(token_superadmin))
    ids = [p["id"] for p in resp.json()["partners"]]
    assert ativo["id"] in ids
    assert inativo["id"] not in ids


async def test_listagem_com_include_inactive_true_inclui(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    ativo = await _create_partner(client, token_superadmin, ct["id"], document="123.456.789-09")
    inativo = await _create_partner(client, token_superadmin, ct["id"], name="Inativo", document="987.654.321-00")
    await client.post(f"/commercial/partners/{inativo['id']}/deactivate", headers=auth(token_superadmin))

    resp = await client.get("/commercial/partners?include_inactive=true", headers=auth(token_superadmin))
    ids = [p["id"] for p in resp.json()["partners"]]
    assert ativo["id"] in ids
    assert inativo["id"] in ids


# ── Desativação e reativação ─────────────────────────────────────────────────

async def test_desativar_preserva_vinculo_e_historico(client, token_superadmin):
    a = await _create_commission_table(client, token_superadmin, name="A")
    b = await _create_commission_table(client, token_superadmin, name="B")
    p = await _create_partner(client, token_superadmin, a["id"])
    await client.post(f"/commercial/partners/{p['id']}/commission-table", json={"commission_table_id": b["id"]}, headers=auth(token_superadmin))

    resp = await client.post(f"/commercial/partners/{p['id']}/deactivate", headers=auth(token_superadmin))
    assert resp.status_code == 200
    assert resp.json()["status"] == "inativo"
    assert resp.json()["commission_table"]["id"] == b["id"]

    history = await client.get(f"/commercial/partners/{p['id']}/history", headers=auth(token_superadmin))
    assert len(history.json()["entries"]) == 1


async def test_desativar_ja_inativo_e_idempotente(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    p = await _create_partner(client, token_superadmin, ct["id"])
    await client.post(f"/commercial/partners/{p['id']}/deactivate", headers=auth(token_superadmin))
    resp = await client.post(f"/commercial/partners/{p['id']}/deactivate", headers=auth(token_superadmin))
    assert resp.status_code == 200
    assert resp.json()["status"] == "inativo"


async def test_reativar_restaura_status_ativo(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    p = await _create_partner(client, token_superadmin, ct["id"])
    await client.post(f"/commercial/partners/{p['id']}/deactivate", headers=auth(token_superadmin))

    resp = await client.post(f"/commercial/partners/{p['id']}/reactivate", headers=auth(token_superadmin))
    assert resp.status_code == 200
    assert resp.json()["status"] == "ativo"
    assert resp.json()["deactivated_at"] is None


async def test_reativar_ja_ativo_e_idempotente(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    p = await _create_partner(client, token_superadmin, ct["id"])
    resp = await client.post(f"/commercial/partners/{p['id']}/reactivate", headers=auth(token_superadmin))
    assert resp.status_code == 200
    assert resp.json()["status"] == "ativo"


# ── Dado bancário fora de escopo ─────────────────────────────────────────────

async def test_campos_bancarios_enviados_sao_ignorados(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    resp = await client.post(
        "/commercial/partners",
        json=_payload(commission_table_id=ct["id"], bank_account="12345-6", pix_key="fulano@pix.com"),
        headers=auth(token_superadmin),
    )
    assert resp.status_code == 201
    assert "bank_account" not in resp.json()
    assert "pix_key" not in resp.json()


# ── Correção retroativa: DELETE de CommissionTable vinculada a parceiro ─────

async def test_excluir_commission_table_vinculada_a_parceiro_e_bloqueado(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    await _create_partner(client, token_superadmin, ct["id"])

    resp = await client.delete(f"/commercial/commission-tables/{ct['id']}", headers=auth(token_superadmin))
    assert resp.status_code == 409


# ── Acesso ───────────────────────────────────────────────────────────────────

async def test_qualquer_platform_admin_ve_a_mesma_listagem(client, token_superadmin):
    ct = await _create_commission_table(client, token_superadmin)
    await _create_partner(client, token_superadmin, ct["id"])
    resp1 = await client.get("/commercial/partners", headers=auth(token_superadmin))
    resp2 = await client.get("/commercial/partners", headers=auth(token_superadmin))
    assert resp1.json() == resp2.json()


async def test_owner_de_empresa_recebe_403(client, token_owner):
    resp = await client.get("/commercial/partners", headers=auth(token_owner))
    assert resp.status_code == 403


async def test_sem_token_recebe_401(client):
    resp = await client.get("/commercial/partners")
    assert resp.status_code == 401
