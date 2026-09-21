import os
import sys
from decimal import Decimal

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


def auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _create_product(client, token, **overrides):
    body = {"name": "Produto", "price": 9.9, **overrides}
    r = await client.post("/catalog/products", json=body, headers=auth(token))
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ── Configuração da conversão (Product.unidade_compra/fator_conversao) ──

async def test_configurar_conversao_com_sucesso(client, token_owner):
    r = await client.post(
        "/catalog/products",
        json={"name": "Produto", "price": 9.9, "unidade_compra": "caixa de 12", "fator_conversao": 12},
        headers=auth(token_owner),
    )
    assert r.status_code == 201, r.text
    assert r.json()["unidade_compra"] == "caixa de 12"
    assert r.json()["fator_conversao"] == 12.0


async def test_configurar_so_um_dos_dois_campos_na_criacao_e_rejeitado(client, token_owner):
    r = await client.post(
        "/catalog/products", json={"name": "Produto", "price": 9.9, "unidade_compra": "caixa"},
        headers=auth(token_owner),
    )
    assert r.status_code == 422

    r2 = await client.post(
        "/catalog/products", json={"name": "Produto", "price": 9.9, "fator_conversao": 12},
        headers=auth(token_owner),
    )
    assert r2.status_code == 422


async def test_fator_zero_ou_negativo_rejeitado(client, token_owner):
    r = await client.post(
        "/catalog/products",
        json={"name": "Produto", "price": 9.9, "unidade_compra": "caixa", "fator_conversao": 0},
        headers=auth(token_owner),
    )
    assert r.status_code == 422

    r2 = await client.post(
        "/catalog/products",
        json={"name": "Produto", "price": 9.9, "unidade_compra": "caixa", "fator_conversao": -5},
        headers=auth(token_owner),
    )
    assert r2.status_code == 422


async def test_editar_so_um_campo_quando_outro_ja_configurado_e_permitido(client, token_owner):
    # diferente da criação (os dois juntos ou nenhum) — na edição parcial,
    # mexer só num campo é legítimo se o outro já está configurado.
    product_id = await _create_product(client, token_owner, unidade_compra="caixa de 12", fator_conversao=12)

    r = await client.put(
        f"/catalog/products/{product_id}", json={"unidade_compra": "caixa de 24"}, headers=auth(token_owner),
    )
    assert r.status_code == 200, r.text
    assert r.json()["unidade_compra"] == "caixa de 24"
    assert r.json()["fator_conversao"] == 12.0  # não tocado, preservado


async def test_editar_deixando_so_um_preenchido_e_rejeitado(client, token_owner):
    # produto sem conversão nenhuma configurada — mandar só fator_conversao
    # deixaria o estado final com um preenchido e outro vazio, rejeitado.
    product_id = await _create_product(client, token_owner)

    r = await client.put(
        f"/catalog/products/{product_id}", json={"fator_conversao": 12}, headers=auth(token_owner),
    )
    assert r.status_code == 400, r.text


# ── Movimentação com conversão (reaproveita _create_stock_movement, G3) ──

async def test_entrada_convertida_corretamente(client, token_owner):
    product_id = await _create_product(client, token_owner, unidade_compra="caixa de 12", fator_conversao=12)

    r = await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 2, "unidade": "un", "em_unidade_compra": True},
        headers=auth(token_owner),
    )
    assert r.status_code == 201, r.text
    assert r.json()["quantidade_atual"] == 24.0

    state = await client.get(f"/catalog/products/{product_id}/stock", headers=auth(token_owner))
    mov = state.json()["movements"][0]
    assert mov["quantidade"] == 24.0
    assert mov["quantidade_original"] == 2.0
    assert mov["unidade_original"] == "caixa de 12"


async def test_ajuste_convertido_respeita_piso_zero_sobre_valor_convertido(client, token_owner):
    product_id = await _create_product(client, token_owner, unidade_compra="caixa de 12", fator_conversao=12)
    await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 2, "unidade": "un", "em_unidade_compra": True},
        headers=auth(token_owner),
    )

    r = await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "ajuste", "quantidade": -1, "motivo": "contagem", "em_unidade_compra": True},
        headers=auth(token_owner),
    )
    assert r.status_code == 201, r.text
    assert r.json()["quantidade_atual"] == 12.0

    # ajuste que levaria o valor CONVERTIDO abaixo de zero é bloqueado
    r2 = await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "ajuste", "quantidade": -2, "motivo": "contagem", "em_unidade_compra": True},
        headers=auth(token_owner),
    )
    assert r2.status_code == 400, r2.text


async def test_entrada_em_unidade_compra_exige_valor_bruto_positivo(client, token_owner):
    product_id = await _create_product(client, token_owner, unidade_compra="caixa de 12", fator_conversao=12)

    r = await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": -1, "unidade": "un", "em_unidade_compra": True},
        headers=auth(token_owner),
    )
    assert r.status_code == 400, r.text


async def test_movimentacao_em_unidade_compra_sem_conversao_configurada_e_rejeitada(client, token_owner):
    product_id = await _create_product(client, token_owner)

    r = await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 2, "unidade": "un", "em_unidade_compra": True},
        headers=auth(token_owner),
    )
    assert r.status_code == 400, r.text


async def test_produto_sem_conversao_mantem_fluxo_antigo_sem_campos_originais(client, token_owner):
    product_id = await _create_product(client, token_owner)

    r = await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 5, "unidade": "un"},
        headers=auth(token_owner),
    )
    assert r.status_code == 201, r.text
    assert r.json()["quantidade_atual"] == 5.0

    state = await client.get(f"/catalog/products/{product_id}/stock", headers=auth(token_owner))
    mov = state.json()["movements"][0]
    assert mov["quantidade_original"] is None
    assert mov["unidade_original"] is None


async def test_mudanca_de_fator_nao_recalcula_movimentacao_antiga(client, token_owner):
    product_id = await _create_product(client, token_owner, unidade_compra="caixa", fator_conversao=12)
    await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 2, "unidade": "un", "em_unidade_compra": True},
        headers=auth(token_owner),
    )

    r = await client.put(
        f"/catalog/products/{product_id}", json={"fator_conversao": 10}, headers=auth(token_owner),
    )
    assert r.status_code == 200, r.text

    state = await client.get(f"/catalog/products/{product_id}/stock", headers=auth(token_owner))
    assert state.json()["quantidade_atual"] == 24.0  # não recalculado — continua 2 x 12
    assert state.json()["movements"][0]["quantidade"] == 24.0


async def test_arredondamento_de_resultado_com_muitas_casas_decimais(client, token_owner):
    product_id = await _create_product(client, token_owner, unidade_compra="unidade fracionada", fator_conversao=0.333)

    r = await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 7, "unidade": "un", "em_unidade_compra": True},
        headers=auth(token_owner),
    )
    assert r.status_code == 201, r.text
    assert Decimal(str(r.json()["quantidade_atual"])) == Decimal("2.331")
