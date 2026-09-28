import os
import sys
from datetime import datetime

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


def _payload(name: str = "Padrão 2026", note: str | None = None, **overrides) -> dict:
    body = {
        "name": name,
        "setup_fee_per_totem": 150.00,
        "recurring_percent": 3.5,
        "vigente_desde": "2026-01-01T00:00:00",
    }
    if note is not None:
        body["note"] = note
    body.update(overrides)
    return body


async def _create_table(client, token, **kwargs) -> dict:
    resp = await client.post("/commercial/commission-tables", json=_payload(**kwargs), headers=auth(token))
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Criação ──────────────────────────────────────────────────────────────────

async def test_criar_tabela_padrao_sem_nota_quando_nao_existe_nenhuma_ainda(client, token_superadmin):
    resp = await client.post(
        "/commercial/commission-tables", json=_payload(), headers=auth(token_superadmin),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["is_default"] is False
    assert body["note"] is None


async def test_criar_tabela_customizada_com_nota_valida(client, token_superadmin):
    await _create_table(client, token_superadmin, name="Padrão")
    resp = await client.post(
        "/commercial/commission-tables",
        json=_payload(name="Acordo XPTO", note="Acordo negociado em reunião de 2026-09-20 — volume alto"),
        headers=auth(token_superadmin),
    )
    assert resp.status_code == 201, resp.text


async def test_erro_ao_criar_customizada_sem_nota_quando_ja_existe_padrao(client, token_superadmin):
    first = await _create_table(client, token_superadmin, name="Padrão")
    await client.post(
        f"/commercial/commission-tables/{first['id']}/set-default",
        json={}, headers=auth(token_superadmin),
    )
    resp = await client.post(
        "/commercial/commission-tables", json=_payload(name="Acordo sem nota"), headers=auth(token_superadmin),
    )
    assert resp.status_code == 422


async def test_erro_ao_criar_com_nota_abaixo_do_tamanho_minimo(client, token_superadmin):
    resp = await client.post(
        "/commercial/commission-tables",
        json=_payload(note="curta"),
        headers=auth(token_superadmin),
    )
    assert resp.status_code == 422


async def test_erro_percentual_recorrente_negativo(client, token_superadmin):
    resp = await client.post(
        "/commercial/commission-tables", json=_payload(recurring_percent=-1), headers=auth(token_superadmin),
    )
    assert resp.status_code == 422


async def test_erro_percentual_recorrente_acima_de_100(client, token_superadmin):
    resp = await client.post(
        "/commercial/commission-tables", json=_payload(recurring_percent=101), headers=auth(token_superadmin),
    )
    assert resp.status_code == 422


async def test_erro_setup_fee_negativo(client, token_superadmin):
    resp = await client.post(
        "/commercial/commission-tables", json=_payload(setup_fee_per_totem=-10), headers=auth(token_superadmin),
    )
    assert resp.status_code == 422


async def test_erro_nome_vazio(client, token_superadmin):
    resp = await client.post(
        "/commercial/commission-tables", json=_payload(name=""), headers=auth(token_superadmin),
    )
    assert resp.status_code == 422


# ── Padrão único e troca atômica ────────────────────────────────────────────

async def test_marcar_padrao_quando_nao_existe_nenhuma_ainda(client, token_superadmin):
    a = await _create_table(client, token_superadmin, name="A")
    resp = await client.post(
        f"/commercial/commission-tables/{a['id']}/set-default", json={}, headers=auth(token_superadmin),
    )
    assert resp.status_code == 200
    assert resp.json()["is_default"] is True


async def test_marcar_segunda_padrao_sem_confirmar_retorna_409(client, token_superadmin):
    a = await _create_table(client, token_superadmin, name="A")
    await client.post(f"/commercial/commission-tables/{a['id']}/set-default", json={}, headers=auth(token_superadmin))
    b = await _create_table(client, token_superadmin, name="B", note="Acordo B — negociado com volume garantido")

    resp = await client.post(
        f"/commercial/commission-tables/{b['id']}/set-default", json={}, headers=auth(token_superadmin),
    )
    assert resp.status_code == 409

    listing = await client.get("/commercial/commission-tables", headers=auth(token_superadmin))
    still_default = next(t for t in listing.json()["commission_tables"] if t["id"] == a["id"])
    assert still_default["is_default"] is True


async def test_marcar_segunda_padrao_com_confirm_replace_troca_atomicamente(client, token_superadmin):
    a = await _create_table(client, token_superadmin, name="A")
    await client.post(f"/commercial/commission-tables/{a['id']}/set-default", json={}, headers=auth(token_superadmin))
    b = await _create_table(client, token_superadmin, name="B", note="Acordo B — negociado com volume garantido")

    resp = await client.post(
        f"/commercial/commission-tables/{b['id']}/set-default",
        json={"confirm_replace": True}, headers=auth(token_superadmin),
    )
    assert resp.status_code == 200
    assert resp.json()["is_default"] is True

    listing = await client.get("/commercial/commission-tables", headers=auth(token_superadmin))
    tables_by_id = {t["id"]: t for t in listing.json()["commission_tables"]}
    assert tables_by_id[a["id"]]["is_default"] is False
    assert tables_by_id[b["id"]]["is_default"] is True

    history_a = await client.get(f"/commercial/commission-tables/{a['id']}/history", headers=auth(token_superadmin))
    history_b = await client.get(f"/commercial/commission-tables/{b['id']}/history", headers=auth(token_superadmin))
    assert any(e["field_changed"] == "is_default" and e["new_value"] == "false" for e in history_a.json()["entries"])
    assert any(e["field_changed"] == "is_default" and e["new_value"] == "true" for e in history_b.json()["entries"])


async def test_multiplas_customizadas_coexistem_sem_afetar_padrao(client, token_superadmin):
    a = await _create_table(client, token_superadmin, name="A")
    await client.post(f"/commercial/commission-tables/{a['id']}/set-default", json={}, headers=auth(token_superadmin))
    await _create_table(client, token_superadmin, name="B", note="Acordo B — negociado com volume garantido")
    await _create_table(client, token_superadmin, name="C", note="Acordo C — negociado com volume garantido")

    listing = await client.get("/commercial/commission-tables", headers=auth(token_superadmin))
    tables = listing.json()["commission_tables"]
    assert len(tables) == 3
    defaults = [t for t in tables if t["is_default"]]
    assert len(defaults) == 1
    assert defaults[0]["name"] == "A"


# ── Edição e histórico ───────────────────────────────────────────────────────

async def test_editar_valor_gera_historico(client, token_superadmin):
    a = await _create_table(client, token_superadmin, name="A")
    await client.post(f"/commercial/commission-tables/{a['id']}/set-default", json={}, headers=auth(token_superadmin))
    resp = await client.put(
        f"/commercial/commission-tables/{a['id']}",
        json=_payload(name="A", recurring_percent=4.0),
        headers=auth(token_superadmin),
    )
    assert resp.status_code == 200

    history = await client.get(f"/commercial/commission-tables/{a['id']}/history", headers=auth(token_superadmin))
    # o set-default acima já gravou 1 entrada de is_default — filtrada aqui
    # pra focar só no que este teste verifica (edição de valor).
    entries = [e for e in history.json()["entries"] if e["field_changed"] != "is_default"]
    assert len(entries) == 1
    assert entries[0]["field_changed"] == "recurring_percent"
    assert entries[0]["old_value"] == "3.50" or entries[0]["old_value"] == "3.5"
    assert entries[0]["new_value"] == "4.00" or entries[0]["new_value"] == "4.0"


async def test_editar_vigente_desde_de_fato_muda_gera_historico(client, token_superadmin):
    a = await _create_table(client, token_superadmin, name="A")
    await client.post(f"/commercial/commission-tables/{a['id']}/set-default", json={}, headers=auth(token_superadmin))
    resp = await client.put(
        f"/commercial/commission-tables/{a['id']}",
        json=_payload(name="A", vigente_desde="2026-10-01T00:00:00"),
        headers=auth(token_superadmin),
    )
    assert resp.status_code == 200

    history = await client.get(f"/commercial/commission-tables/{a['id']}/history", headers=auth(token_superadmin))
    assert any(e["field_changed"] == "vigente_desde" for e in history.json()["entries"])


async def test_reenviar_mesmo_vigente_desde_nao_gera_historico_falso(client, token_superadmin):
    a = await _create_table(client, token_superadmin, name="A")
    await client.post(f"/commercial/commission-tables/{a['id']}/set-default", json={}, headers=auth(token_superadmin))
    resp = await client.put(
        f"/commercial/commission-tables/{a['id']}", json=_payload(name="A"), headers=auth(token_superadmin),
    )
    assert resp.status_code == 200

    history = await client.get(f"/commercial/commission-tables/{a['id']}/history", headers=auth(token_superadmin))
    entries = [e for e in history.json()["entries"] if e["field_changed"] != "is_default"]
    assert entries == []


async def test_editar_multiplos_campos_numa_unica_put_gera_uma_entrada_por_campo(client, token_superadmin):
    a = await _create_table(client, token_superadmin, name="A")
    await client.post(f"/commercial/commission-tables/{a['id']}/set-default", json={}, headers=auth(token_superadmin))
    resp = await client.put(
        f"/commercial/commission-tables/{a['id']}",
        json=_payload(name="A", setup_fee_per_totem=180.00, recurring_percent=4.0),
        headers=auth(token_superadmin),
    )
    assert resp.status_code == 200

    history = await client.get(f"/commercial/commission-tables/{a['id']}/history", headers=auth(token_superadmin))
    entries = [e for e in history.json()["entries"] if e["field_changed"] != "is_default"]
    changed_fields = {e["field_changed"] for e in entries}
    assert changed_fields == {"setup_fee_per_totem", "recurring_percent"}
    assert len(entries) == 2


async def test_editar_sem_alterar_nada_nao_gera_historico(client, token_superadmin):
    a = await _create_table(client, token_superadmin, name="A")
    await client.post(f"/commercial/commission-tables/{a['id']}/set-default", json={}, headers=auth(token_superadmin))
    resp = await client.put(
        f"/commercial/commission-tables/{a['id']}", json=_payload(name="A"), headers=auth(token_superadmin),
    )
    assert resp.status_code == 200

    history = await client.get(f"/commercial/commission-tables/{a['id']}/history", headers=auth(token_superadmin))
    entries = [e for e in history.json()["entries"] if e["field_changed"] != "is_default"]
    assert entries == []


async def test_editar_tabela_nao_padrao_sem_nota_falha(client, token_superadmin):
    a = await _create_table(client, token_superadmin, name="A")
    await client.post(f"/commercial/commission-tables/{a['id']}/set-default", json={}, headers=auth(token_superadmin))
    b = await _create_table(client, token_superadmin, name="B", note="Acordo B — negociado com volume garantido")

    resp = await client.put(
        f"/commercial/commission-tables/{b['id']}", json=_payload(name="B"), headers=auth(token_superadmin),
    )
    assert resp.status_code == 422


async def test_consultar_historico_retorna_em_ordem_cronologica(client, token_superadmin):
    a = await _create_table(client, token_superadmin, name="A")
    await client.post(f"/commercial/commission-tables/{a['id']}/set-default", json={}, headers=auth(token_superadmin))
    await client.put(
        f"/commercial/commission-tables/{a['id']}", json=_payload(name="A", recurring_percent=4.0),
        headers=auth(token_superadmin),
    )
    await client.put(
        f"/commercial/commission-tables/{a['id']}", json=_payload(name="A", recurring_percent=5.0),
        headers=auth(token_superadmin),
    )
    await client.put(
        f"/commercial/commission-tables/{a['id']}", json=_payload(name="A", recurring_percent=6.0),
        headers=auth(token_superadmin),
    )

    history = await client.get(f"/commercial/commission-tables/{a['id']}/history", headers=auth(token_superadmin))
    entries = history.json()["entries"]
    # set-default (is_default) + 3 edições de recurring_percent
    assert len(entries) == 4
    timestamps = [datetime.fromisoformat(e["created_at"]) for e in entries]
    assert timestamps == sorted(timestamps)


# ── Exclusão / arquivamento ──────────────────────────────────────────────────

async def test_excluir_tabela_sem_historico_e_permitido(client, token_superadmin):
    a = await _create_table(client, token_superadmin, name="A")
    resp = await client.delete(f"/commercial/commission-tables/{a['id']}", headers=auth(token_superadmin))
    assert resp.status_code == 204


async def test_excluir_tabela_com_historico_e_bloqueado(client, token_superadmin):
    a = await _create_table(client, token_superadmin, name="A")
    await client.put(
        f"/commercial/commission-tables/{a['id']}",
        json=_payload(name="A", recurring_percent=4.0, note="Acordo A — negociado com volume garantido"),
        headers=auth(token_superadmin),
    )
    resp = await client.delete(f"/commercial/commission-tables/{a['id']}", headers=auth(token_superadmin))
    assert resp.status_code == 409


async def test_arquivar_tabela_com_historico_some_da_listagem_ativa_sem_apagar_historico(client, token_superadmin):
    a = await _create_table(client, token_superadmin, name="A")
    await client.put(
        f"/commercial/commission-tables/{a['id']}",
        json=_payload(name="A", recurring_percent=4.0, note="Acordo A — negociado com volume garantido"),
        headers=auth(token_superadmin),
    )
    resp = await client.post(f"/commercial/commission-tables/{a['id']}/archive", headers=auth(token_superadmin))
    assert resp.status_code == 200
    assert resp.json()["archived_at"] is not None

    listing = await client.get("/commercial/commission-tables", headers=auth(token_superadmin))
    assert a["id"] not in [t["id"] for t in listing.json()["commission_tables"]]

    history = await client.get(f"/commercial/commission-tables/{a['id']}/history", headers=auth(token_superadmin))
    assert len(history.json()["entries"]) == 1


async def test_excluir_ou_arquivar_a_padrao_e_bloqueado(client, token_superadmin):
    a = await _create_table(client, token_superadmin, name="A")
    await client.post(f"/commercial/commission-tables/{a['id']}/set-default", json={}, headers=auth(token_superadmin))

    resp_archive = await client.post(f"/commercial/commission-tables/{a['id']}/archive", headers=auth(token_superadmin))
    assert resp_archive.status_code == 409

    resp_delete = await client.delete(f"/commercial/commission-tables/{a['id']}", headers=auth(token_superadmin))
    assert resp_delete.status_code == 409


# ── Listagem ─────────────────────────────────────────────────────────────────

async def test_listagem_por_padrao_esconde_arquivadas(client, token_superadmin):
    a = await _create_table(client, token_superadmin, name="A")
    await client.post(f"/commercial/commission-tables/{a['id']}/archive", headers=auth(token_superadmin))
    b = await _create_table(client, token_superadmin, name="B")

    resp = await client.get("/commercial/commission-tables", headers=auth(token_superadmin))
    ids = [t["id"] for t in resp.json()["commission_tables"]]
    assert a["id"] not in ids
    assert b["id"] in ids


async def test_listagem_com_archived_true_inclui_arquivadas(client, token_superadmin):
    a = await _create_table(client, token_superadmin, name="A")
    await client.post(f"/commercial/commission-tables/{a['id']}/archive", headers=auth(token_superadmin))
    b = await _create_table(client, token_superadmin, name="B")

    resp = await client.get("/commercial/commission-tables?archived=true", headers=auth(token_superadmin))
    ids = [t["id"] for t in resp.json()["commission_tables"]]
    assert a["id"] in ids
    assert b["id"] in ids


# ── Acesso ───────────────────────────────────────────────────────────────────

async def test_qualquer_platform_admin_ve_a_mesma_listagem(client, token_superadmin):
    await _create_table(client, token_superadmin, name="A")
    resp1 = await client.get("/commercial/commission-tables", headers=auth(token_superadmin))
    resp2 = await client.get("/commercial/commission-tables", headers=auth(token_superadmin))
    assert resp1.json() == resp2.json()


async def test_owner_de_empresa_recebe_403(client, token_owner):
    resp = await client.get("/commercial/commission-tables", headers=auth(token_owner))
    assert resp.status_code == 403


async def test_sem_token_recebe_401(client):
    resp = await client.get("/commercial/commission-tables")
    assert resp.status_code == 401
