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


def auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _create_product(client, token, *, name="Produto", estoque_minimo=0):
    r = await client.post(
        "/catalog/products", json={"name": name, "price": 9.9, "estoque_minimo": estoque_minimo},
        headers=auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _entrada(client, token, product_id, quantidade):
    r = await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": quantidade, "unidade": "un"},
        headers=auth(token),
    )
    assert r.status_code == 201, r.text


async def _check(client, token, product_ids):
    r = await client.post(
        "/catalog/products/check-availability", json={"product_ids": product_ids}, headers=auth(token),
    )
    assert r.status_code == 200, r.text
    return r.json()["unavailable_product_ids"]


# ── A4b (ORD-186) — checagem prévia de disponibilidade ──────────────────────

async def test_produto_disponivel_nao_aparece_como_indisponivel(client, token_owner):
    product_id = await _create_product(client, token_owner, estoque_minimo=3)
    await _entrada(client, token_owner, product_id, 10)

    unavailable = await _check(client, token_owner, [product_id])
    assert unavailable == []


async def test_produto_abaixo_do_minimo_aparece_como_indisponivel(client, token_owner):
    product_id = await _create_product(client, token_owner, estoque_minimo=3)
    await _entrada(client, token_owner, product_id, 2)

    unavailable = await _check(client, token_owner, [product_id])
    assert unavailable == [product_id]


async def test_produto_sem_stock_item_disponivel_regra_de_rollout(client, token_owner):
    product_id = await _create_product(client, token_owner, estoque_minimo=5)

    unavailable = await _check(client, token_owner, [product_id])
    assert unavailable == []


async def test_mistura_disponiveis_e_indisponiveis(client, token_owner):
    ok_id = await _create_product(client, token_owner, name="OK", estoque_minimo=3)
    await _entrada(client, token_owner, ok_id, 10)

    esgotado_id = await _create_product(client, token_owner, name="Esgotado", estoque_minimo=3)
    await _entrada(client, token_owner, esgotado_id, 1)

    unavailable = await _check(client, token_owner, [ok_id, esgotado_id])
    assert set(unavailable) == {esgotado_id}


async def test_product_id_inexistente_tratado_como_indisponivel_sem_erro(client, token_owner):
    unavailable = await _check(client, token_owner, [999999])
    assert unavailable == [999999]


async def test_product_id_de_outra_empresa_tratado_como_indisponivel(client, token_owner, token_company_b):
    product_id = await _create_product(client, token_company_b, estoque_minimo=0)

    # totem da empresa 1 pergunta sobre um produto que é da empresa 2
    unavailable = await _check(client, token_owner, [product_id])
    assert unavailable == [product_id]


async def test_ids_duplicados_na_requisicao_nao_duplicam_na_resposta(client, token_owner):
    product_id = await _create_product(client, token_owner, estoque_minimo=3)
    await _entrada(client, token_owner, product_id, 1)

    unavailable = await _check(client, token_owner, [product_id, product_id, product_id])
    assert unavailable == [product_id]


async def test_lista_vazia_retorna_vazia(client, token_owner):
    unavailable = await _check(client, token_owner, [])
    assert unavailable == []


async def test_role_kiosk_consegue_chamar_o_endpoint(client, token_kiosk, token_owner):
    # produto criado como owner (kiosk não tem permissão de escrita), checado como kiosk
    product_id = await _create_product(client, token_owner, estoque_minimo=0)

    r = await client.post(
        "/catalog/products/check-availability", json={"product_ids": [product_id]}, headers=auth(token_kiosk),
    )
    assert r.status_code == 200, r.text
    assert r.json()["unavailable_product_ids"] == []
