"""ORD-160: produtos correlacionados (cross-sell sem combo).
Cobre os cenários Gherkin do QA Explorer (docs/stories/ORD-160-produtos-correlacionados.md).
Mesmo padrão de fixtures de tests/test_ord075_campos_catalogo.py.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete as sa_delete
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


@pytest.fixture
async def seed(client):
    """3 produtos da empresa 1 (batata, molho barbecue, molho cheddar) + 1
    produto da empresa 2, pra isolamento multi-tenant."""
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        cat1 = svc.Category(company_id=1, name="__rp_cat1__", active=True)
        cat2 = svc.Category(company_id=2, name="__rp_cat2__", active=True)
        db.add_all([cat1, cat2])
        await db.flush()
        batata = svc.Product(company_id=1, category_id=cat1.id, name="__rp_batata__", price=10.90, active=True)
        barbecue = svc.Product(company_id=1, category_id=cat1.id, name="__rp_barbecue__", price=4.50, active=True)
        cheddar = svc.Product(company_id=1, category_id=cat1.id, name="__rp_cheddar__", price=4.50, active=True)
        other_company_prod = svc.Product(company_id=2, category_id=cat2.id, name="__rp_other_company__", price=9.90, active=True)
        db.add_all([batata, barbecue, cheddar, other_company_prod])
        await db.commit()
        ids = {
            "cat1_id": cat1.id, "cat2_id": cat2.id,
            "batata_id": batata.id, "barbecue_id": barbecue.id, "cheddar_id": cheddar.id,
            "other_company_id": other_company_prod.id,
        }
        yield ids

        product_ids = [batata.id, barbecue.id, cheddar.id, other_company_prod.id]
        await db.execute(sa_delete(svc.RelatedProduct).where(svc.RelatedProduct.product_id.in_(product_ids)))
        await db.execute(sa_delete(svc.Product).where(svc.Product.id.in_(product_ids)))
        await db.execute(sa_delete(svc.Category).where(svc.Category.id.in_([cat1.id, cat2.id])))
        await db.commit()


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── Cadastro e remoção ──────────────────────────────────────────────────────

async def test_admin_cadastra_produto_correlacionado(client, seed, token_owner):
    r = await client.put(
        f"/catalog/products/{seed['batata_id']}",
        json={"related_product_ids": [seed["barbecue_id"]]},
        headers=auth(token_owner),
    )
    assert r.status_code == 200
    related = r.json()["related_products"]
    assert len(related) == 1
    assert related[0]["id"] == seed["barbecue_id"]
    assert related[0]["name"] == "__rp_barbecue__"
    assert related[0]["active"] is True


async def test_admin_remove_correlacao(client, seed, token_owner):
    await client.put(
        f"/catalog/products/{seed['batata_id']}",
        json={"related_product_ids": [seed["barbecue_id"]]},
        headers=auth(token_owner),
    )
    r = await client.put(
        f"/catalog/products/{seed['batata_id']}",
        json={"related_product_ids": []},
        headers=auth(token_owner),
    )
    assert r.status_code == 200
    assert r.json()["related_products"] == []


async def test_multiplas_correlacoes_preservam_ordem(client, seed, token_owner):
    r = await client.put(
        f"/catalog/products/{seed['batata_id']}",
        json={"related_product_ids": [seed["barbecue_id"], seed["cheddar_id"]]},
        headers=auth(token_owner),
    )
    assert r.status_code == 200
    ids = [item["id"] for item in r.json()["related_products"]]
    assert ids == [seed["barbecue_id"], seed["cheddar_id"]]


# ── Unidirecionalidade ───────────────────────────────────────────────────────

async def test_correlacao_e_unidirecional(client, seed, token_owner):
    await client.put(
        f"/catalog/products/{seed['batata_id']}",
        json={"related_product_ids": [seed["barbecue_id"]]},
        headers=auth(token_owner),
    )
    r = await client.get(f"/catalog/products/{seed['barbecue_id']}", headers=auth(token_owner))
    assert r.status_code == 200
    assert r.json()["related_products"] == []


# ── Validação ────────────────────────────────────────────────────────────────

async def test_autocorrelacao_bloqueada(client, seed, token_owner):
    r = await client.put(
        f"/catalog/products/{seed['batata_id']}",
        json={"related_product_ids": [seed["batata_id"]]},
        headers=auth(token_owner),
    )
    assert r.status_code == 400


async def test_related_product_id_de_outra_empresa_e_rejeitado(client, seed, token_owner):
    r = await client.put(
        f"/catalog/products/{seed['batata_id']}",
        json={"related_product_ids": [seed["other_company_id"]]},
        headers=auth(token_owner),
    )
    assert r.status_code == 400


async def test_related_product_id_inexistente_e_rejeitado(client, seed, token_owner):
    r = await client.put(
        f"/catalog/products/{seed['batata_id']}",
        json={"related_product_ids": [999999]},
        headers=auth(token_owner),
    )
    assert r.status_code == 400


# ── Desativação e exclusão do produto correlacionado ────────────────────────

async def test_produto_correlacionado_inativo_continua_na_relacao_com_active_false(client, seed, token_owner):
    await client.put(
        f"/catalog/products/{seed['batata_id']}",
        json={"related_product_ids": [seed["barbecue_id"]]},
        headers=auth(token_owner),
    )
    await client.put(
        f"/catalog/products/{seed['barbecue_id']}",
        json={"active": False},
        headers=auth(token_owner),
    )
    r = await client.get(f"/catalog/products/{seed['batata_id']}", headers=auth(token_owner))
    assert r.status_code == 200
    related = r.json()["related_products"]
    assert len(related) == 1
    assert related[0]["id"] == seed["barbecue_id"]
    assert related[0]["active"] is False


async def test_produto_correlacionado_reativado_volta_com_active_true(client, seed, token_owner):
    await client.put(
        f"/catalog/products/{seed['batata_id']}",
        json={"related_product_ids": [seed["barbecue_id"]]},
        headers=auth(token_owner),
    )
    await client.put(f"/catalog/products/{seed['barbecue_id']}", json={"active": False}, headers=auth(token_owner))
    await client.put(f"/catalog/products/{seed['barbecue_id']}", json={"active": True}, headers=auth(token_owner))
    r = await client.get(f"/catalog/products/{seed['batata_id']}", headers=auth(token_owner))
    assert r.json()["related_products"][0]["active"] is True


async def test_produto_correlacionado_excluido_nao_aparece_mais_na_relacao(client, seed, token_owner):
    await client.put(
        f"/catalog/products/{seed['batata_id']}",
        json={"related_product_ids": [seed["barbecue_id"]]},
        headers=auth(token_owner),
    )
    r_del = await client.delete(f"/catalog/products/{seed['barbecue_id']}?permanent=true", headers=auth(token_owner))
    assert r_del.status_code == 204
    r = await client.get(f"/catalog/products/{seed['batata_id']}", headers=auth(token_owner))
    assert r.status_code == 200
    assert r.json()["related_products"] == []


# ── Isolamento multi-tenant ──────────────────────────────────────────────────

async def test_isolamento_multitenant_na_leitura(client, seed, token_owner, token_company_b):
    await client.put(
        f"/catalog/products/{seed['batata_id']}",
        json={"related_product_ids": [seed["barbecue_id"]]},
        headers=auth(token_owner),
    )
    r = await client.get(f"/catalog/products/{seed['batata_id']}", headers=auth(token_company_b))
    assert r.status_code == 404


async def test_isolamento_multitenant_na_escrita(client, seed, token_company_b):
    r = await client.put(
        f"/catalog/products/{seed['batata_id']}",
        json={"related_product_ids": []},
        headers=auth(token_company_b),
    )
    assert r.status_code == 404


# ── related_products sempre presente, mesmo sem correlação ─────────────────

async def test_produto_novo_tem_related_products_vazio(client, seed, token_owner):
    r = await client.post(
        "/catalog/products",
        json={"name": "__rp_novo__", "price": 5.0, "category_id": seed["cat1_id"]},
        headers=auth(token_owner),
    )
    assert r.status_code == 201
    assert r.json()["related_products"] == []


# ── Opções do produto correlacionado (correção pós-QA manual) ──────────────
# O totem só sabe que precisa abrir a tela de escolha de sabor/tamanho se
# related_products trouxer option_groups, igual ProductOut já traz pro
# produto principal — sem isso o cliente adicionava o correlacionado direto
# ao carrinho, pulando uma opção obrigatória.

async def test_produto_correlacionado_com_grupo_de_opcao_obrigatorio_aparece_na_relacao(client, seed, token_owner):
    r_group = await client.post(
        "/catalog/option-groups",
        json={
            "name": "__rp_sabores__", "min_selections": 1, "max_selections": 1,
            "options": [{"label": "Barbecue tradicional", "price_delta": 0}, {"label": "Barbecue picante", "price_delta": 0}],
        },
        headers=auth(token_owner),
    )
    assert r_group.status_code == 201
    group_id = r_group.json()["id"]
    await client.put(
        f"/catalog/products/{seed['barbecue_id']}/option-groups",
        json={"option_group_ids": [group_id]},
        headers=auth(token_owner),
    )
    await client.put(
        f"/catalog/products/{seed['batata_id']}",
        json={"related_product_ids": [seed["barbecue_id"]]},
        headers=auth(token_owner),
    )
    r = await client.get(f"/catalog/products/{seed['batata_id']}", headers=auth(token_owner))
    assert r.status_code == 200
    related = r.json()["related_products"]
    assert len(related) == 1
    groups = related[0]["option_groups"]
    assert len(groups) == 1
    assert groups[0]["name"] == "__rp_sabores__"
    assert groups[0]["min_selections"] == 1
    assert {o["label"] for o in groups[0]["options"]} == {"Barbecue tradicional", "Barbecue picante"}
