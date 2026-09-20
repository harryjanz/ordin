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


async def _create_product(client, token, **overrides):
    body = {"name": "Refrigerante Lata 350ml", "price": 9.9, **overrides}
    r = await client.post("/catalog/products", json=body, headers=auth(token))
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _create_group_linked_to_product(client, token, product_id, options, name="Sabor"):
    r = await client.post(
        "/catalog/option-groups",
        json={"name": name, "min_selections": 1, "max_selections": 1, "options": options},
        headers=auth(token),
    )
    assert r.status_code == 201, r.text
    group_id = r.json()["id"]
    r = await client.put(
        f"/catalog/products/{product_id}/option-groups",
        json={"option_group_ids": [group_id]},
        headers=auth(token),
    )
    assert r.status_code == 200, r.text
    return group_id


# ── Detecção — is_umbrella computado ────────────────────────────────────────

async def test_produto_com_opcoes_sem_fiscal_continua_normal(client, token_owner):
    product_id = await _create_product(client, token_owner)
    await _create_group_linked_to_product(
        client, token_owner, product_id, [{"label": "Grande"}, {"label": "Média"}], name="Tamanho",
    )

    r = await client.get(f"/catalog/products/{product_id}", headers=auth(token_owner))
    assert r.json()["is_umbrella"] is False

    r = await client.put(
        f"/catalog/products/{product_id}", json={"ean": "7891000100103"}, headers=auth(token_owner),
    )
    assert r.status_code == 200

    r = await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 10, "unidade": "un"},
        headers=auth(token_owner),
    )
    assert r.status_code == 201


async def test_produto_vira_guarda_chuva_ao_opcao_ganhar_ean(client, token_owner):
    product_id = await _create_product(client, token_owner)
    await _create_group_linked_to_product(
        client, token_owner, product_id, [{"label": "Coca-Cola", "ean": "7891000100103"}],
    )

    r = await client.get(f"/catalog/products/{product_id}", headers=auth(token_owner))
    assert r.json()["is_umbrella"] is True


async def test_produto_vira_guarda_chuva_ao_opcao_ganhar_so_cfop_sem_ean(client, token_owner):
    # confirma que é OR (ean OU cfop), não AND
    product_id = await _create_product(client, token_owner)
    await _create_group_linked_to_product(
        client, token_owner, product_id, [{"label": "Coca-Cola", "cfop": "5102"}],
    )

    r = await client.get(f"/catalog/products/{product_id}", headers=auth(token_owner))
    assert r.json()["is_umbrella"] is True


async def test_produto_guarda_chuva_com_multiplos_grupos_qualquer_um_basta(client, token_owner):
    product_id = await _create_product(client, token_owner)
    r = await client.post(
        "/catalog/option-groups",
        json={"name": "Sabor", "min_selections": 1, "max_selections": 1,
              "options": [{"label": "Coca-Cola"}]},
        headers=auth(token_owner),
    )
    sabor_id = r.json()["id"]
    r = await client.post(
        "/catalog/option-groups",
        json={"name": "Tamanho", "min_selections": 1, "max_selections": 1,
              "options": [{"label": "Grande", "cfop": "5102"}]},
        headers=auth(token_owner),
    )
    tamanho_id = r.json()["id"]
    await client.put(
        f"/catalog/products/{product_id}/option-groups",
        json={"option_group_ids": [sabor_id, tamanho_id]},
        headers=auth(token_owner),
    )

    r = await client.get(f"/catalog/products/{product_id}", headers=auth(token_owner))
    assert r.json()["is_umbrella"] is True


# ── Bloqueios no produto guarda-chuva ────────────────────────────────────────

async def test_put_ean_no_produto_guarda_chuva_e_rejeitado(client, token_owner):
    product_id = await _create_product(client, token_owner)
    await _create_group_linked_to_product(
        client, token_owner, product_id, [{"label": "Coca-Cola", "ean": "7891000100103"}],
    )

    r = await client.put(
        f"/catalog/products/{product_id}", json={"ean": "7891000100004"}, headers=auth(token_owner),
    )
    assert r.status_code == 400
    assert "guarda-chuva" in r.json()["detail"]


async def test_post_movimentacao_estoque_no_produto_guarda_chuva_e_rejeitado(client, token_owner):
    product_id = await _create_product(client, token_owner)
    await _create_group_linked_to_product(
        client, token_owner, product_id, [{"label": "Coca-Cola", "ean": "7891000100103"}],
    )

    r = await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 10, "unidade": "un"},
        headers=auth(token_owner),
    )
    assert r.status_code == 400
    assert "guarda-chuva" in r.json()["detail"]

    r = await client.get(f"/catalog/products/{product_id}/stock", headers=auth(token_owner))
    assert r.status_code == 400


async def test_produto_guarda_chuva_continua_aceitando_cfop_ncm_cest(client, token_owner):
    product_id = await _create_product(client, token_owner)
    await _create_group_linked_to_product(
        client, token_owner, product_id, [{"label": "Coca-Cola", "ean": "7891000100103"}],
    )

    r = await client.put(
        f"/catalog/products/{product_id}", json={"cfop": "5102", "cest": "0300100"}, headers=auth(token_owner),
    )
    assert r.status_code == 200
    assert r.json()["cfop"] == "5102"


# ── Reversão do estado ───────────────────────────────────────────────────────

async def test_produto_deixa_de_ser_guarda_chuva_quando_ultima_opcao_perde_fiscal(client, token_owner):
    product_id = await _create_product(client, token_owner)
    group_id = await _create_group_linked_to_product(
        client, token_owner, product_id, [{"label": "Coca-Cola", "ean": "7891000100103"}],
    )

    r = await client.put(
        f"/catalog/option-groups/{group_id}/options",
        json={"options": [{"label": "Coca-Cola"}]},
        headers=auth(token_owner),
    )
    assert r.status_code == 200

    r = await client.get(f"/catalog/products/{product_id}", headers=auth(token_owner))
    assert r.json()["is_umbrella"] is False

    r = await client.put(
        f"/catalog/products/{product_id}", json={"ean": "7891000100004"}, headers=auth(token_owner),
    )
    assert r.status_code == 200

    r = await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 10, "unidade": "un"},
        headers=auth(token_owner),
    )
    assert r.status_code == 201


# ── Transição retroativa bloqueada ──────────────────────────────────────────

async def test_transicao_retroativa_bloqueada_produto_ja_tem_ean(client, token_owner):
    product_id = await _create_product(client, token_owner, ean="7891000100103")
    r = await client.post(
        "/catalog/option-groups",
        json={"name": "Sabor", "min_selections": 1, "max_selections": 1,
              "options": [{"label": "Coca-Cola"}]},
        headers=auth(token_owner),
    )
    group_id = r.json()["id"]
    await client.put(
        f"/catalog/products/{product_id}/option-groups",
        json={"option_group_ids": [group_id]},
        headers=auth(token_owner),
    )

    r = await client.put(
        f"/catalog/option-groups/{group_id}/options",
        json={"options": [{"label": "Coca-Cola", "ean": "7891000100004"}]},
        headers=auth(token_owner),
    )
    assert r.status_code == 400
    assert "EAN" in r.json()["detail"]

    # a opção não deve ter ganhado ean — confere direto no grupo
    groups = (await client.get("/catalog/option-groups", headers=auth(token_owner))).json()
    saved_group = next(g for g in (groups.get("option_groups") or groups) if g["id"] == group_id)
    assert saved_group["options"][0]["ean"] is None


async def test_transicao_retroativa_bloqueada_produto_ja_tem_estoque(client, token_owner):
    product_id = await _create_product(client, token_owner)
    await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": 10, "unidade": "un"},
        headers=auth(token_owner),
    )
    r = await client.post(
        "/catalog/option-groups",
        json={"name": "Sabor", "min_selections": 1, "max_selections": 1,
              "options": [{"label": "Coca-Cola"}]},
        headers=auth(token_owner),
    )
    group_id = r.json()["id"]
    await client.put(
        f"/catalog/products/{product_id}/option-groups",
        json={"option_group_ids": [group_id]},
        headers=auth(token_owner),
    )

    r = await client.put(
        f"/catalog/option-groups/{group_id}/options",
        json={"options": [{"label": "Coca-Cola", "cfop": "5102"}]},
        headers=auth(token_owner),
    )
    assert r.status_code == 400
    assert "estoque" in r.json()["detail"]


async def test_editar_campo_nao_fiscal_nao_e_bloqueado_por_conflito_retroativo_ja_existente(client, token_owner):
    # Achado testando ao vivo: um grupo com estado herdado (opção já tinha
    # cfop de antes, produto já tem ean de antes — janela G2→G4 documentada
    # na ORD-181) não pode travar PARA SEMPRE qualquer save futuro do grupo
    # que nem mexe em ean/cfop. Só a introdução/mudança de ean/cfop é bloqueada.
    product_id = await client.post(
        "/catalog/products", json={"name": "Produto", "price": 9.9, "ean": "7891000100103"},
        headers=auth(token_owner),
    )
    product_id = product_id.json()["id"]
    r = await client.post(
        "/catalog/option-groups",
        json={"name": "Sabor", "min_selections": 1, "max_selections": 1,
              "options": [{"label": "Coca-Cola", "cfop": "5102"}]},
        headers=auth(token_owner),
    )
    group_id, option_id = r.json()["id"], r.json()["options"][0]["id"]
    # vínculo feito via SQL direto (não pela API), simulando o estado herdado
    # de antes da G4 existir — sem passar pela checagem de transição.
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        db.add(svc.ProductOptionGroup(product_id=product_id, option_group_id=group_id))
        await db.commit()

    r = await client.put(
        f"/catalog/option-groups/{group_id}/options",
        json={"options": [{"id": option_id, "label": "Coca-Cola (renomeada)", "cfop": "5102"}]},
        headers=auth(token_owner),
    )
    assert r.status_code == 200, r.text
    assert r.json()["options"][0]["label"] == "Coca-Cola (renomeada)"
