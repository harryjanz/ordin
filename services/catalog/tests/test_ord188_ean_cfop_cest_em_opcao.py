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


async def _create_group_with_options(client, token, options, name="Sabor"):
    r = await client.post(
        "/catalog/option-groups",
        json={"name": name, "min_selections": 1, "max_selections": 1, "options": options},
        headers=auth(token),
    )
    return r


# ── Happy path ────────────────────────────────────────────────────────────

async def test_happy_path_opcao_recebe_ean_cfop_cest(client, token_owner):
    r = await _create_group_with_options(
        client, token_owner,
        [{"label": "Coca-Cola", "ean": "7891000100103", "cfop": "5102", "cest": "0300100"}],
    )
    assert r.status_code == 201
    option = r.json()["options"][0]
    assert option["ean"] == "7891000100103"
    assert option["cfop"] == "5102"
    assert option["cest"] == "0300100"


# ── EAN checksum ──────────────────────────────────────────────────────────

async def test_ean_checksum_invalido_e_rejeitado(client, token_owner):
    r = await _create_group_with_options(
        client, token_owner, [{"label": "Coca-Cola", "ean": "7891000100104"}],
    )
    assert r.status_code == 400
    assert "código de barras inválido" in r.json()["detail"]


# ── CFOP fora do conjunto permitido ──────────────────────────────────────

@pytest.mark.parametrize("cfop_invalido", ["5405", "510"])
async def test_cfop_fora_do_conjunto_e_rejeitado(client, token_owner, cfop_invalido):
    r = await _create_group_with_options(
        client, token_owner, [{"label": "Coca-Cola", "cfop": cfop_invalido}],
    )
    assert r.status_code == 422


# ── EAN duplicado dentro da mesma empresa ───────────────────────────────

async def test_ean_duplicado_no_mesmo_grupo_e_rejeitado(client, token_owner):
    r = await _create_group_with_options(
        client, token_owner,
        [
            {"label": "Coca-Cola", "ean": "7891000100103"},
            {"label": "Fanta Laranja", "ean": "7891000100103"},
        ],
    )
    assert r.status_code == 400
    assert "código de barras" in r.json()["detail"]


async def test_ean_duplicado_entre_grupos_diferentes_e_rejeitado(client, token_owner):
    r1 = await _create_group_with_options(
        client, token_owner, [{"label": "Coca-Cola", "ean": "7891000100103"}], name="Sabor",
    )
    assert r1.status_code == 201

    r2 = await _create_group_with_options(
        client, token_owner, [{"label": "Grande", "ean": "7891000100103"}], name="Tamanho",
    )
    assert r2.status_code == 400
    assert "código de barras" in r2.json()["detail"]


# ── Isolamento multi-tenant: EAN não conflita entre empresas ───────────

async def test_mesmo_ean_em_empresas_diferentes_nao_conflita(client, token_owner, token_company_b):
    r1 = await _create_group_with_options(
        client, token_owner, [{"label": "Coca-Cola", "ean": "7891000100103"}],
    )
    assert r1.status_code == 201

    r2 = await _create_group_with_options(
        client, token_company_b, [{"label": "Coca-Cola", "ean": "7891000100103"}],
    )
    assert r2.status_code == 201


# ── CFOP da opção livre em relação ao produto pai ───────────────────────

async def test_cfop_da_opcao_diferente_do_produto_pai_e_aceito(client, token_owner):
    # sem vínculo real a um produto nesta história (option-groups é reutilizável),
    # o teste cobre a garantia de que não existe NENHUMA validação de igualdade
    # disparada por cfop, independente de qualquer produto vinculado
    r = await _create_group_with_options(
        client, token_owner, [{"label": "Coca-Cola", "cfop": "5101"}],
    )
    assert r.status_code == 201
    assert r.json()["options"][0]["cfop"] == "5101"


# ── Opção sem os 3 campos continua funcionando ──────────────────────────

async def test_opcao_sem_ean_cfop_cest_continua_funcionando(client, token_owner):
    r = await _create_group_with_options(client, token_owner, [{"label": "Coca-Cola"}])
    assert r.status_code == 201
    option = r.json()["options"][0]
    assert option["ean"] is None
    assert option["cfop"] is None
    assert option["cest"] is None


# ── Correção pós-G1 (decisão do usuário, 2026-09-18): EAN/SKU únicos quando
# ativos ATRAVESSAM Product e Option — decisão anterior (permitir colisão,
# adiar pra C1) foi revertida antes mesmo de existir busca por código de
# barras, por causa do risco de frente de caixa futura selecionar o item
# errado ao escanear. ────────────────────────────────────────────────────

async def test_ean_duplicado_entre_option_e_product_ativos_e_bloqueado(client, token_owner):
    r_product = await client.post(
        "/catalog/products",
        json={"name": "Produto avulso", "price": 9.9, "ean": "7891000100103"},
        headers=auth(token_owner),
    )
    assert r_product.status_code == 201

    r_option = await _create_group_with_options(
        client, token_owner, [{"label": "Coca-Cola", "ean": "7891000100103"}],
    )
    assert r_option.status_code == 400
    assert "código de barras" in r_option.json()["detail"]


async def test_ean_duplicado_entre_option_e_product_inativo_e_permitido(client, token_owner):
    r_product = await client.post(
        "/catalog/products",
        json={"name": "Produto descontinuado", "price": 9.9, "ean": "7891000100103"},
        headers=auth(token_owner),
    )
    product_id = r_product.json()["id"]
    r_deactivate = await client.put(
        f"/catalog/products/{product_id}", json={"active": False}, headers=auth(token_owner),
    )
    assert r_deactivate.status_code == 200

    # produto inativo não colide — a opção pode usar o mesmo EAN livremente
    r_option = await _create_group_with_options(
        client, token_owner, [{"label": "Coca-Cola", "ean": "7891000100103"}],
    )
    assert r_option.status_code == 201


async def test_sku_duplicado_entre_option_e_product_ativos_e_bloqueado(client, token_owner):
    r_product = await client.post(
        "/catalog/products",
        json={"name": "Produto avulso", "price": 9.9, "sku": "SKU-COMPARTILHADO"},
        headers=auth(token_owner),
    )
    assert r_product.status_code == 201

    r_option = await _create_group_with_options(
        client, token_owner, [{"label": "Coca-Cola", "sku": "SKU-COMPARTILHADO"}],
    )
    assert r_option.status_code == 400
    assert "SKU" in r_option.json()["detail"]


async def test_ativar_opcao_com_ean_ja_usado_por_produto_ativo_e_rejeitado(client, token_owner):
    # opção nasce inativa (via replace com active=False), sem conflito ainda
    r_group = await _create_group_with_options(
        client, token_owner, [{"label": "Coca-Cola", "ean": "7891000100103", "active": False}],
    )
    option_id = r_group.json()["options"][0]["id"]

    await client.post(
        "/catalog/products",
        json={"name": "Produto avulso", "price": 9.9, "ean": "7891000100103"},
        headers=auth(token_owner),
    )

    r_activate = await client.patch(
        f"/catalog/options/{option_id}", json={"active": True}, headers=auth(token_owner),
    )
    assert r_activate.status_code == 400
    assert "código de barras" in r_activate.json()["detail"]


async def test_reativar_produto_com_ean_ja_usado_por_opcao_ativa_e_rejeitado(client, token_owner):
    created = await client.post(
        "/catalog/products",
        json={"name": "Produto a reativar", "price": 9.9, "ean": "7891000100103"},
        headers=auth(token_owner),
    )
    product_id = created.json()["id"]
    await client.put(f"/catalog/products/{product_id}", json={"active": False}, headers=auth(token_owner))

    # com o produto inativo, a opção pode usar o mesmo EAN livremente
    r_option = await _create_group_with_options(
        client, token_owner, [{"label": "Coca-Cola", "ean": "7891000100103"}],
    )
    assert r_option.status_code == 201

    # reativar o produto agora colide com a opção já ativa
    r_reactivate = await client.put(
        f"/catalog/products/{product_id}", json={"active": True}, headers=auth(token_owner),
    )
    assert r_reactivate.status_code == 400
    assert "código de barras" in r_reactivate.json()["detail"]


# ── Edição (replace completo) — EAN apagado vira null ──────────────────

async def test_ean_apagado_na_edicao_de_opcao_vira_null(client, token_owner):
    created = await _create_group_with_options(
        client, token_owner, [{"label": "Coca-Cola", "ean": "7891000100103"}],
    )
    group_id = created.json()["id"]

    r = await client.put(
        f"/catalog/option-groups/{group_id}/options",
        json={"options": [{"label": "Coca-Cola"}]},
        headers=auth(token_owner),
    )
    assert r.status_code == 200
    assert r.json()["options"][0]["ean"] is None


# ── GET /catalog/codes/active-in-use — pré-carrega pra validação na modal ──
# (achado do usuário, 2026-09-18: a checagem só no Salvar do grupo é tarde
# demais pra UX — precisa dar feedback já digitando/colando na modal)

async def test_active_codes_traz_ean_de_produto_e_opcao_ativos(client, token_owner):
    await client.post(
        "/catalog/products",
        json={"name": "Produto avulso", "price": 9.9, "ean": "7891000100103", "sku": "PRD-1"},
        headers=auth(token_owner),
    )
    await _create_group_with_options(
        client, token_owner, [{"label": "Coca-Cola", "ean": "7894900010015", "sku": "OPT-1"}],
    )

    r = await client.get("/catalog/codes/active-in-use", headers=auth(token_owner))
    assert r.status_code == 200
    body = r.json()
    assert "7891000100103" in body["eans"]
    assert "7894900010015" in body["eans"]
    assert "PRD-1" in body["skus"]
    assert "OPT-1" in body["skus"]


async def test_active_codes_exclui_produto_informado(client, token_owner):
    created = await client.post(
        "/catalog/products",
        json={"name": "Produto avulso", "price": 9.9, "ean": "7891000100103"},
        headers=auth(token_owner),
    )
    product_id = created.json()["id"]

    r = await client.get(
        f"/catalog/codes/active-in-use?exclude_product_id={product_id}", headers=auth(token_owner),
    )
    assert "7891000100103" not in r.json()["eans"]


async def test_active_codes_exclui_grupo_de_opcao_informado(client, token_owner):
    created = await _create_group_with_options(
        client, token_owner, [{"label": "Coca-Cola", "ean": "7894900010015"}],
    )
    group_id = created.json()["id"]

    r = await client.get(
        f"/catalog/codes/active-in-use?exclude_option_group_id={group_id}", headers=auth(token_owner),
    )
    assert "7894900010015" not in r.json()["eans"]


async def test_active_codes_ignora_opcao_inativa(client, token_owner):
    await _create_group_with_options(
        client, token_owner, [{"label": "Coca-Cola", "ean": "7894900010015", "active": False}],
    )

    r = await client.get("/catalog/codes/active-in-use", headers=auth(token_owner))
    assert "7894900010015" not in r.json()["eans"]


async def test_active_codes_isolamento_multi_tenant(client, token_owner, token_company_b):
    await client.post(
        "/catalog/products",
        json={"name": "Produto avulso", "price": 9.9, "ean": "7891000100103"},
        headers=auth(token_owner),
    )

    r = await client.get("/catalog/codes/active-in-use", headers=auth(token_company_b))
    assert "7891000100103" not in r.json()["eans"]
