import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import IntegrityError
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


def auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _create_product(client, token, name="Produto"):
    r = await client.post("/catalog/products", json={"name": name, "price": 9.9}, headers=auth(token))
    return r.json()["id"]


async def _create_option(client, token, label="Coca-Cola"):
    r = await client.post(
        "/catalog/option-groups",
        json={"name": "Sabor", "min_selections": 1, "max_selections": 1, "options": [{"label": label}]},
        headers=auth(token),
    )
    return r.json()["options"][0]["id"]


# ── Happy path — Product ─────────────────────────────────────────────────

async def test_primeira_movimentacao_cria_stock_item(client, token_owner):
    pid = await _create_product(client, token_owner)
    r = await client.post(
        f"/catalog/products/{pid}/stock/movements",
        json={"tipo": "entrada", "quantidade": 10, "unidade": "kg"},
        headers=auth(token_owner),
    )
    assert r.status_code == 201
    assert r.json()["quantidade_atual"] == 10
    assert r.json()["unidade"] == "kg"

    state = await client.get(f"/catalog/products/{pid}/stock", headers=auth(token_owner))
    assert state.status_code == 200
    assert state.json()["has_stock_item"] is True
    assert state.json()["quantidade_atual"] == 10
    assert len(state.json()["movements"]) == 1
    assert state.json()["movements"][0]["tipo"] == "entrada"


async def test_produto_sem_movimentacao_mostra_estado_vazio(client, token_owner):
    pid = await _create_product(client, token_owner)
    state = await client.get(f"/catalog/products/{pid}/stock", headers=auth(token_owner))
    assert state.status_code == 200
    assert state.json() == {
        "has_stock_item": False, "quantidade_atual": None, "unidade": None,
        "movements": [], "total_movements": 0,
    }


async def test_segunda_entrada_soma(client, token_owner):
    pid = await _create_product(client, token_owner)
    await client.post(f"/catalog/products/{pid}/stock/movements", json={"tipo": "entrada", "quantidade": 10, "unidade": "kg"}, headers=auth(token_owner))
    r = await client.post(f"/catalog/products/{pid}/stock/movements", json={"tipo": "entrada", "quantidade": 5}, headers=auth(token_owner))
    assert r.status_code == 201
    assert r.json()["quantidade_atual"] == 15


async def test_entrada_negativa_e_rejeitada(client, token_owner):
    pid = await _create_product(client, token_owner)
    r = await client.post(f"/catalog/products/{pid}/stock/movements", json={"tipo": "entrada", "quantidade": -3, "unidade": "kg"}, headers=auth(token_owner))
    assert r.status_code == 400
    assert "entrada deve ser positiva" in r.json()["detail"]


async def test_ajuste_negativo_que_nao_passa_de_zero_e_aceito(client, token_owner):
    pid = await _create_product(client, token_owner)
    await client.post(f"/catalog/products/{pid}/stock/movements", json={"tipo": "entrada", "quantidade": 10, "unidade": "kg"}, headers=auth(token_owner))
    r = await client.post(f"/catalog/products/{pid}/stock/movements", json={"tipo": "ajuste", "quantidade": -4, "motivo": "contagem física"}, headers=auth(token_owner))
    assert r.status_code == 201
    assert r.json()["quantidade_atual"] == 6


async def test_ajuste_resultando_em_exatamente_zero_e_permitido(client, token_owner):
    pid = await _create_product(client, token_owner)
    await client.post(f"/catalog/products/{pid}/stock/movements", json={"tipo": "entrada", "quantidade": 6, "unidade": "kg"}, headers=auth(token_owner))
    r = await client.post(f"/catalog/products/{pid}/stock/movements", json={"tipo": "ajuste", "quantidade": -6, "motivo": "zerado"}, headers=auth(token_owner))
    assert r.status_code == 201
    assert r.json()["quantidade_atual"] == 0


async def test_ajuste_que_deixaria_negativo_e_bloqueado(client, token_owner):
    pid = await _create_product(client, token_owner)
    await client.post(f"/catalog/products/{pid}/stock/movements", json={"tipo": "entrada", "quantidade": 6, "unidade": "kg"}, headers=auth(token_owner))
    r = await client.post(f"/catalog/products/{pid}/stock/movements", json={"tipo": "ajuste", "quantidade": -10, "motivo": "erro"}, headers=auth(token_owner))
    assert r.status_code == 400
    assert "negativa" in r.json()["detail"]
    state = await client.get(f"/catalog/products/{pid}/stock", headers=auth(token_owner))
    assert state.json()["quantidade_atual"] == 6  # inalterado


async def test_ajuste_sem_motivo_e_rejeitado(client, token_owner):
    pid = await _create_product(client, token_owner)
    await client.post(f"/catalog/products/{pid}/stock/movements", json={"tipo": "entrada", "quantidade": 6, "unidade": "kg"}, headers=auth(token_owner))
    r = await client.post(f"/catalog/products/{pid}/stock/movements", json={"tipo": "ajuste", "quantidade": -1}, headers=auth(token_owner))
    assert r.status_code == 400


async def test_ajuste_com_motivo_so_espacos_e_tratado_como_ausente(client, token_owner):
    pid = await _create_product(client, token_owner)
    await client.post(f"/catalog/products/{pid}/stock/movements", json={"tipo": "entrada", "quantidade": 6, "unidade": "kg"}, headers=auth(token_owner))
    r = await client.post(f"/catalog/products/{pid}/stock/movements", json={"tipo": "ajuste", "quantidade": -1, "motivo": "   "}, headers=auth(token_owner))
    assert r.status_code == 400


async def test_entrada_sem_motivo_e_aceita(client, token_owner):
    pid = await _create_product(client, token_owner)
    r = await client.post(f"/catalog/products/{pid}/stock/movements", json={"tipo": "entrada", "quantidade": 6, "unidade": "kg"}, headers=auth(token_owner))
    assert r.status_code == 201


async def test_unidade_nao_pode_ser_trocada_depois_da_primeira(client, token_owner):
    pid = await _create_product(client, token_owner)
    await client.post(f"/catalog/products/{pid}/stock/movements", json={"tipo": "entrada", "quantidade": 6, "unidade": "kg"}, headers=auth(token_owner))
    r = await client.post(f"/catalog/products/{pid}/stock/movements", json={"tipo": "entrada", "quantidade": 1, "unidade": "un"}, headers=auth(token_owner))
    assert r.status_code == 400
    assert "kg" in r.json()["detail"]


async def test_unidade_fora_do_conjunto_fixo_e_rejeitada(client, token_owner):
    pid = await _create_product(client, token_owner)
    r = await client.post(f"/catalog/products/{pid}/stock/movements", json={"tipo": "entrada", "quantidade": 6, "unidade": "caixa"}, headers=auth(token_owner))
    assert r.status_code == 400
    assert "unidade inválida" in r.json()["detail"]


async def test_primeira_movimentacao_sem_unidade_e_bloqueada(client, token_owner):
    pid = await _create_product(client, token_owner)
    r = await client.post(f"/catalog/products/{pid}/stock/movements", json={"tipo": "entrada", "quantidade": 6}, headers=auth(token_owner))
    assert r.status_code == 400
    assert "unidade" in r.json()["detail"]


async def test_primeira_movimentacao_precisa_ser_entrada(client, token_owner):
    pid = await _create_product(client, token_owner)
    r = await client.post(f"/catalog/products/{pid}/stock/movements", json={"tipo": "ajuste", "quantidade": 6, "unidade": "kg", "motivo": "x"}, headers=auth(token_owner))
    assert r.status_code == 400


# ── Isolamento multi-tenant — Product ────────────────────────────────────

async def test_produto_de_outra_empresa_nao_recebe_movimentacao(client, token_owner, token_company_b):
    pid = await _create_product(client, token_owner)
    r = await client.post(f"/catalog/products/{pid}/stock/movements", json={"tipo": "entrada", "quantidade": 1, "unidade": "un"}, headers=auth(token_company_b))
    assert r.status_code == 404


async def test_get_stock_de_produto_de_outra_empresa_e_404(client, token_owner, token_company_b):
    pid = await _create_product(client, token_owner)
    r = await client.get(f"/catalog/products/{pid}/stock", headers=auth(token_company_b))
    assert r.status_code == 404


# ── Dono polimórfico — Option (G2) ───────────────────────────────────────

async def test_stock_item_criado_com_option_id_segue_mesmo_fluxo(client, token_owner):
    oid = await _create_option(client, token_owner)
    r = await client.post(f"/catalog/options/{oid}/stock/movements", json={"tipo": "entrada", "quantidade": 24, "unidade": "un"}, headers=auth(token_owner))
    assert r.status_code == 201
    assert r.json()["quantidade_atual"] == 24

    ajuste = await client.post(f"/catalog/options/{oid}/stock/movements", json={"tipo": "ajuste", "quantidade": -4, "motivo": "quebra"}, headers=auth(token_owner))
    assert ajuste.status_code == 201
    assert ajuste.json()["quantidade_atual"] == 20


async def test_duas_opcoes_tem_quantidades_independentes(client, token_owner):
    coca_id = await _create_option(client, token_owner, label="Coca-Cola")
    fanta_r = await client.post(
        "/catalog/option-groups",
        json={"name": "Sabor2", "min_selections": 1, "max_selections": 1, "options": [{"label": "Fanta Laranja"}]},
        headers=auth(token_owner),
    )
    fanta_id = fanta_r.json()["options"][0]["id"]

    await client.post(f"/catalog/options/{coca_id}/stock/movements", json={"tipo": "entrada", "quantidade": 10, "unidade": "un"}, headers=auth(token_owner))

    fanta_state = await client.get(f"/catalog/options/{fanta_id}/stock", headers=auth(token_owner))
    assert fanta_state.json()["has_stock_item"] is False  # inalterada


async def test_opcao_sem_stock_item_mostra_estado_vazio(client, token_owner):
    oid = await _create_option(client, token_owner)
    state = await client.get(f"/catalog/options/{oid}/stock", headers=auth(token_owner))
    assert state.json()["has_stock_item"] is False


# ── Isolamento multi-tenant — Option (caminho dedicado, join via OptionGroup) ──

async def test_opcao_de_outra_empresa_nao_recebe_movimentacao(client, token_owner, token_company_b):
    oid = await _create_option(client, token_owner)
    r = await client.post(f"/catalog/options/{oid}/stock/movements", json={"tipo": "entrada", "quantidade": 1, "unidade": "un"}, headers=auth(token_company_b))
    assert r.status_code == 404


async def test_get_stock_de_opcao_de_outra_empresa_e_404(client, token_owner, token_company_b):
    oid = await _create_option(client, token_owner)
    r = await client.get(f"/catalog/options/{oid}/stock", headers=auth(token_company_b))
    assert r.status_code == 404


# ── CheckConstraint XOR — integridade de schema ──────────────────────────

async def test_stock_item_sem_nenhum_dono_e_rejeitado_pelo_banco(client, token_owner):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        db.add(svc.StockItem(company_id=1, product_id=None, option_id=None, quantidade_atual=0, unidade="un"))
        with pytest.raises(IntegrityError):
            await db.commit()


async def test_stock_item_com_dois_donos_e_rejeitado_pelo_banco(client, token_owner):
    import main as svc
    pid = await _create_product(client, token_owner)
    oid = await _create_option(client, token_owner)
    async with svc.AsyncSessionLocal() as db:
        db.add(svc.StockItem(company_id=1, product_id=pid, option_id=oid, quantidade_atual=0, unidade="un"))
        with pytest.raises(IntegrityError):
            await db.commit()


# ── Limite de histórico (achado do usuário — sem limite, cresce sem fim) ────

async def test_historico_limitado_as_mais_recentes_com_total_correto(client, token_owner):
    import main as svc

    pid = await _create_product(client, token_owner)
    await client.post(
        f"/catalog/products/{pid}/stock/movements",
        json={"tipo": "entrada", "quantidade": 1000, "unidade": "un"},
        headers=auth(token_owner),
    )
    # 24 ajustes a mais, além da entrada inicial = 25 movimentações no total
    for _ in range(24):
        r = await client.post(
            f"/catalog/products/{pid}/stock/movements",
            json={"tipo": "ajuste", "quantidade": -1, "motivo": "consumo"},
            headers=auth(token_owner),
        )
        assert r.status_code == 201

    state = await client.get(f"/catalog/products/{pid}/stock", headers=auth(token_owner))
    body = state.json()
    assert body["total_movements"] == 25
    assert len(body["movements"]) == svc._STOCK_MOVEMENTS_HISTORY_LIMIT  # 20
    # as retornadas são as mais recentes (ajustes), não a entrada original
    assert all(m["tipo"] == "ajuste" for m in body["movements"])


async def test_historico_sem_estourar_o_limite_retorna_tudo(client, token_owner):
    pid = await _create_product(client, token_owner)
    await client.post(
        f"/catalog/products/{pid}/stock/movements",
        json={"tipo": "entrada", "quantidade": 5, "unidade": "un"},
        headers=auth(token_owner),
    )
    state = await client.get(f"/catalog/products/{pid}/stock", headers=auth(token_owner))
    body = state.json()
    assert body["total_movements"] == 1
    assert len(body["movements"]) == 1
