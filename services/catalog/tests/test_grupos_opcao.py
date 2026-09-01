"""ORD-138: grupos de opção — modelo de dados e CRUD (catalog-service).
Cobre os cenários Gherkin do QA Explorer (docs/stories/ORD-138-grupos-opcao-modelo-dados-backend.md).
Mesmo padrão de fixtures de tests/test_upload_imagem.py (moto mocka S3).
"""
import io
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import boto3
import pytest
from httpx import ASGITransport, AsyncClient
from moto import mock_aws
from PIL import Image
from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def _img_bytes(fmt: str = "JPEG", size: tuple[int, int] = (10, 10)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color=(255, 0, 0)).save(buf, format=fmt)
    return buf.getvalue()


@pytest.fixture(autouse=True)
def _s3_bucket():
    with mock_aws():
        boto3.client("s3", region_name=os.environ["AWS_REGION"]).create_bucket(
            Bucket=os.environ["S3_BUCKET"]
        )
        yield


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
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        cat = svc.Category(company_id=1, name="__opt_cat__", active=True)
        db.add(cat)
        await db.flush()
        prod = svc.Product(company_id=1, category_id=cat.id, name="__opt_prod__", price=10.0, active=True)
        db.add(prod)
        await db.commit()
        ids = {"cat_id": cat.id, "prod_id": prod.id}
        yield ids
        await db.execute(sa_delete(svc.ProductOptionGroup))
        await db.execute(sa_delete(svc.Option))
        await db.execute(sa_delete(svc.OptionGroup))
        await db.execute(sa_delete(svc.Product).where(svc.Product.id == prod.id))
        await db.execute(sa_delete(svc.Category).where(svc.Category.id == cat.id))
        await db.commit()


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _create_group(client, token, name="__grupo_teste__", min_selections=1, max_selections=1, options=None):
    options = options if options is not None else [{"label": "A", "price_delta": 0}, {"label": "B", "price_delta": 0}]
    return await client.post(
        "/catalog/option-groups",
        json={"name": name, "min_selections": min_selections, "max_selections": max_selections, "options": options},
        headers=auth(token),
    )


# ── Happy path ────────────────────────────────────────────────────────────────

async def test_criar_grupo_com_opcoes_iniciais(client, token_owner):
    r = await _create_group(client, token_owner, name="Sabores de bebida", options=[
        {"label": "Coca-Cola", "price_delta": 0},
        {"label": "Fanta Laranja", "price_delta": 0},
        {"label": "Fanta Uva", "price_delta": 0},
        {"label": "Guaraná Antarctica", "price_delta": 0},
    ])
    assert r.status_code == 201
    data = r.json()
    assert len(data["options"]) == 4
    assert all(o["price_delta"] == 0 for o in data["options"])


async def test_listar_grupos_da_empresa(client, token_owner):
    await _create_group(client, token_owner, name="__grupo_a__")
    await _create_group(client, token_owner, name="__grupo_b__")
    r = await client.get("/catalog/option-groups", headers=auth(token_owner))
    assert r.status_code == 200
    names = {g["name"] for g in r.json()["option_groups"]}
    assert {"__grupo_a__", "__grupo_b__"} <= names


async def test_editar_nome_e_regra_de_selecao(client, token_owner):
    r = await _create_group(client, token_owner, name="Tamanho da porção")
    gid = r.json()["id"]
    r2 = await client.put(f"/catalog/option-groups/{gid}", json={"name": "Tamanho novo"}, headers=auth(token_owner))
    assert r2.status_code == 200
    assert r2.json()["name"] == "Tamanho novo"


async def test_substituir_lista_de_opcoes_replace_completo(client, token_owner):
    r = await _create_group(client, token_owner, options=[{"label": "P"}, {"label": "M"}, {"label": "G"}])
    gid = r.json()["id"]
    r2 = await client.put(
        f"/catalog/option-groups/{gid}/options",
        json={"options": [{"label": "P"}, {"label": "M"}, {"label": "G"}, {"label": "Família", "price_delta": 10}]},
        headers=auth(token_owner),
    )
    assert r2.status_code == 200
    labels = {o["label"] for o in r2.json()["options"]}
    assert labels == {"P", "M", "G", "Família"}


async def test_vincular_grupo_a_produto(client, seed, token_owner):
    r = await _create_group(client, token_owner, name="Sabores de bebida")
    gid = r.json()["id"]
    r2 = await client.put(
        f"/catalog/products/{seed['prod_id']}/option-groups",
        json={"option_group_ids": [gid]},
        headers=auth(token_owner),
    )
    assert r2.status_code == 200
    r3 = await client.get(f"/catalog/products/{seed['prod_id']}", headers=auth(token_owner))
    assert any(g["name"] == "Sabores de bebida" for g in r3.json()["option_groups"])


async def test_desvincular_todos_os_grupos_de_um_produto(client, seed, token_owner):
    r = await _create_group(client, token_owner)
    gid = r.json()["id"]
    await client.put(f"/catalog/products/{seed['prod_id']}/option-groups", json={"option_group_ids": [gid]}, headers=auth(token_owner))
    r2 = await client.put(f"/catalog/products/{seed['prod_id']}/option-groups", json={"option_group_ids": []}, headers=auth(token_owner))
    assert r2.status_code == 200
    assert r2.json()["option_groups"] == []


async def test_upload_imagem_de_uma_opcao(client, token_owner):
    r = await _create_group(client, token_owner)
    option_id = r.json()["options"][0]["id"]
    r2 = await client.post(
        f"/catalog/options/{option_id}/image",
        files={"image": ("a.jpg", _img_bytes("JPEG"), "image/jpeg")},
        headers=auth(token_owner),
    )
    assert r2.status_code == 200
    data = r2.json()
    assert data["image_url"] is not None
    assert data["thumbnail_url"] is not None


async def test_remover_imagem_de_uma_opcao(client, token_owner):
    r = await _create_group(client, token_owner)
    option_id = r.json()["options"][0]["id"]
    await client.post(
        f"/catalog/options/{option_id}/image",
        files={"image": ("a.jpg", _img_bytes("JPEG"), "image/jpeg")},
        headers=auth(token_owner),
    )
    r2 = await client.delete(f"/catalog/options/{option_id}/image", headers=auth(token_owner))
    assert r2.status_code == 200
    assert r2.json()["image_url"] is None
    assert r2.json()["thumbnail_url"] is None


async def test_reordenar_opcoes_de_um_grupo(client, token_owner):
    r = await _create_group(client, token_owner, options=[{"label": "Coca-Cola"}, {"label": "Fanta"}, {"label": "Guaraná"}])
    gid = r.json()["id"]
    opts = r.json()["options"]
    nova_ordem = [opts[2]["id"], opts[0]["id"], opts[1]["id"]]
    r2 = await client.put(f"/catalog/option-groups/{gid}/options/reorder", json={"option_ids": nova_ordem}, headers=auth(token_owner))
    assert r2.status_code == 204
    r3 = await client.get("/catalog/option-groups", headers=auth(token_owner))
    g = next(g for g in r3.json()["option_groups"] if g["id"] == gid)
    assert [o["id"] for o in g["options"]] == nova_ordem


# ── Bordas / validação ──────────────────────────────────────────────────────

async def test_min_maior_que_max_rejeitado_na_criacao(client, token_owner):
    r = await _create_group(client, token_owner, min_selections=2, max_selections=1)
    assert r.status_code == 422


async def test_min_maior_que_max_rejeitado_na_edicao(client, token_owner):
    r = await _create_group(client, token_owner, min_selections=1, max_selections=1)
    gid = r.json()["id"]
    r2 = await client.put(f"/catalog/option-groups/{gid}", json={"min_selections": 5}, headers=auth(token_owner))
    assert r2.status_code == 400


async def test_max_menor_que_um_rejeitado(client, token_owner):
    r = await _create_group(client, token_owner, max_selections=0)
    assert r.status_code == 422


async def test_grupo_sem_opcao_rejeitado_na_criacao(client, token_owner):
    r = await client.post(
        "/catalog/option-groups",
        json={"name": "__vazio__", "options": []},
        headers=auth(token_owner),
    )
    assert r.status_code == 422


async def test_substituir_opcoes_por_lista_vazia_rejeitado(client, token_owner):
    r = await _create_group(client, token_owner, options=[{"label": "P"}, {"label": "M"}, {"label": "G"}])
    gid = r.json()["id"]
    r2 = await client.put(f"/catalog/option-groups/{gid}/options", json={"options": []}, headers=auth(token_owner))
    assert r2.status_code == 422


async def test_upload_imagem_formato_invalido_rejeitado(client, token_owner):
    r = await _create_group(client, token_owner)
    option_id = r.json()["options"][0]["id"]
    r2 = await client.post(
        f"/catalog/options/{option_id}/image",
        files={"image": ("a.gif", b"qualquer coisa", "image/gif")},
        headers=auth(token_owner),
    )
    assert r2.status_code == 415


async def test_reordenar_conjunto_incompleto_rejeitado(client, token_owner):
    r = await _create_group(client, token_owner, options=[{"label": "P"}, {"label": "M"}, {"label": "G"}])
    gid = r.json()["id"]
    opt_ids = [o["id"] for o in r.json()["options"]]
    r2 = await client.put(f"/catalog/option-groups/{gid}/options/reorder", json={"option_ids": opt_ids[:2]}, headers=auth(token_owner))
    assert r2.status_code == 400


# ── Erro ───────────────────────────────────────────────────────────────────

async def test_excluir_grupo_vinculado_a_produto_e_bloqueado(client, seed, token_owner):
    r = await _create_group(client, token_owner, name="Sabores de bebida")
    gid = r.json()["id"]
    await client.put(f"/catalog/products/{seed['prod_id']}/option-groups", json={"option_group_ids": [gid]}, headers=auth(token_owner))
    r2 = await client.delete(f"/catalog/option-groups/{gid}", headers=auth(token_owner))
    assert r2.status_code == 409
    assert "__opt_prod__" in r2.json()["detail"]


async def test_excluir_grupo_sem_vinculo_funciona(client, token_owner):
    r = await _create_group(client, token_owner, name="__molhos_extras__")
    gid = r.json()["id"]
    r2 = await client.delete(f"/catalog/option-groups/{gid}", headers=auth(token_owner))
    assert r2.status_code == 204


# ── Isolamento multi-tenant ──────────────────────────────────────────────────

async def test_empresa_b_nao_ve_grupo_de_opcao_da_empresa_a(client, token_owner, token_company_b):
    await _create_group(client, token_owner, name="__so_empresa_a__")
    r = await client.get("/catalog/option-groups", headers=auth(token_company_b))
    assert not any(g["name"] == "__so_empresa_a__" for g in r.json()["option_groups"])


async def test_empresa_b_nao_edita_grupo_de_opcao_da_empresa_a(client, token_owner, token_company_b):
    r = await _create_group(client, token_owner)
    gid = r.json()["id"]
    r2 = await client.put(f"/catalog/option-groups/{gid}", json={"name": "__hack__"}, headers=auth(token_company_b))
    assert r2.status_code == 404


async def test_empresa_b_nao_vincula_grupo_de_outra_empresa_a_produto_proprio(client, token_owner, token_company_b):
    r = await _create_group(client, token_owner)
    gid = r.json()["id"]
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        cat_b = svc.Category(company_id=2, name="__cat_b__", active=True)
        db.add(cat_b)
        await db.flush()
        prod_b = svc.Product(company_id=2, category_id=cat_b.id, name="__prod_b__", price=5.0, active=True)
        db.add(prod_b)
        await db.commit()
        prod_b_id = prod_b.id
    r2 = await client.put(
        f"/catalog/products/{prod_b_id}/option-groups",
        json={"option_group_ids": [gid]},
        headers=auth(token_company_b),
    )
    assert r2.status_code == 400


# ── Regressão ────────────────────────────────────────────────────────────────

async def test_listagem_de_produtos_ganha_option_groups_sem_quebrar_campos_existentes(client, seed, token_owner):
    r = await client.get("/catalog/products", headers=auth(token_owner))
    assert r.status_code == 200
    produto = next(p for p in r.json()["products"] if p["id"] == seed["prod_id"])
    assert produto["name"] == "__opt_prod__"
    assert produto["price"] == 10.0
    assert produto["option_groups"] == []  # aditivo — vazio pra quem não tem grupo vinculado


async def test_listagem_de_categorias_nao_e_afetada(client, seed, token_owner):
    r = await client.get("/catalog/categories?include_inactive=true", headers=auth(token_owner))
    assert r.status_code == 200
    assert any(c["id"] == seed["cat_id"] for c in r.json()["categories"])


# ── Permissão (mesmo padrão de test_upload_imagem.py) ────────────────────────

async def test_criar_grupo_role_kiosk_retorna_403(client, token_kiosk):
    r = await _create_group(client, token_kiosk)
    assert r.status_code == 403


# ── ORD-144: override de min/max por vínculo produto-grupo ──────────────────

async def test_override_so_de_maximo_mantem_minimo_no_padrao_do_grupo(client, seed, token_owner):
    r = await _create_group(client, token_owner, min_selections=1, max_selections=4)
    gid = r.json()["id"]
    await client.put(f"/catalog/products/{seed['prod_id']}/option-groups", json={"option_group_ids": [gid]}, headers=auth(token_owner))

    r2 = await client.patch(
        f"/catalog/products/{seed['prod_id']}/option-groups/{gid}",
        json={"max_selections_override": 1},
        headers=auth(token_owner),
    )
    assert r2.status_code == 200
    assert r2.json() == {"min_selections_override": None, "max_selections_override": 1}


async def test_override_de_min_e_max_juntos(client, seed, token_owner):
    r = await _create_group(client, token_owner, min_selections=1, max_selections=4)
    gid = r.json()["id"]
    await client.put(f"/catalog/products/{seed['prod_id']}/option-groups", json={"option_group_ids": [gid]}, headers=auth(token_owner))

    r2 = await client.patch(
        f"/catalog/products/{seed['prod_id']}/option-groups/{gid}",
        json={"min_selections_override": 1, "max_selections_override": 1},
        headers=auth(token_owner),
    )
    assert r2.status_code == 200
    assert r2.json() == {"min_selections_override": 1, "max_selections_override": 1}


async def test_get_produto_reflete_overrides_sem_alterar_padrao_do_grupo(client, seed, token_owner):
    r = await _create_group(client, token_owner, min_selections=1, max_selections=4)
    gid = r.json()["id"]
    await client.put(f"/catalog/products/{seed['prod_id']}/option-groups", json={"option_group_ids": [gid]}, headers=auth(token_owner))
    await client.patch(f"/catalog/products/{seed['prod_id']}/option-groups/{gid}", json={"max_selections_override": 1}, headers=auth(token_owner))

    r2 = await client.get(f"/catalog/products/{seed['prod_id']}", headers=auth(token_owner))
    grupo = next(g for g in r2.json()["option_groups"] if g["id"] == gid)
    assert grupo["min_selections"] == 1 and grupo["max_selections"] == 4  # padrão do grupo, inalterado
    assert grupo["max_selections_override"] == 1
    assert grupo["min_selections_override"] is None


async def test_restaurar_padrao_limpa_os_overrides(client, seed, token_owner):
    r = await _create_group(client, token_owner, min_selections=1, max_selections=4)
    gid = r.json()["id"]
    await client.put(f"/catalog/products/{seed['prod_id']}/option-groups", json={"option_group_ids": [gid]}, headers=auth(token_owner))
    await client.patch(f"/catalog/products/{seed['prod_id']}/option-groups/{gid}", json={"max_selections_override": 1}, headers=auth(token_owner))

    r2 = await client.patch(
        f"/catalog/products/{seed['prod_id']}/option-groups/{gid}",
        json={"min_selections_override": None, "max_selections_override": None},
        headers=auth(token_owner),
    )
    assert r2.status_code == 200
    assert r2.json() == {"min_selections_override": None, "max_selections_override": None}

    r3 = await client.get(f"/catalog/products/{seed['prod_id']}", headers=auth(token_owner))
    grupo = next(g for g in r3.json()["option_groups"] if g["id"] == gid)
    assert grupo["max_selections_override"] is None


async def test_cenario_pizza_mesmo_grupo_maximo_diferente_por_tamanho(client, token_owner):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        cat = svc.Category(company_id=1, name="__pizza_cat__", active=True)
        db.add(cat)
        await db.flush()
        broto = svc.Product(company_id=1, category_id=cat.id, name="__pizza_broto__", price=20.0, active=True)
        big = svc.Product(company_id=1, category_id=cat.id, name="__pizza_big__", price=50.0, active=True)
        db.add_all([broto, big])
        await db.commit()
        broto_id, big_id, cat_id = broto.id, big.id, cat.id

    r = await _create_group(client, token_owner, name="__sabores_pizza__", min_selections=1, max_selections=4)
    gid = r.json()["id"]
    await client.put(f"/catalog/products/{broto_id}/option-groups", json={"option_group_ids": [gid]}, headers=auth(token_owner))
    await client.put(f"/catalog/products/{big_id}/option-groups", json={"option_group_ids": [gid]}, headers=auth(token_owner))

    await client.patch(f"/catalog/products/{broto_id}/option-groups/{gid}", json={"max_selections_override": 1}, headers=auth(token_owner))
    await client.patch(f"/catalog/products/{big_id}/option-groups/{gid}", json={"max_selections_override": 4}, headers=auth(token_owner))

    r_broto = await client.get(f"/catalog/products/{broto_id}", headers=auth(token_owner))
    r_big = await client.get(f"/catalog/products/{big_id}", headers=auth(token_owner))
    assert next(g for g in r_broto.json()["option_groups"] if g["id"] == gid)["max_selections_override"] == 1
    assert next(g for g in r_big.json()["option_groups"] if g["id"] == gid)["max_selections_override"] == 4

    r_groups = await client.get("/catalog/option-groups", headers=auth(token_owner))
    assert sum(1 for g in r_groups.json()["option_groups"] if g["name"] == "__sabores_pizza__") == 1  # não duplicado

    import main as svc
    async with svc.AsyncSessionLocal() as db:
        await db.execute(sa_delete(svc.ProductOptionGroup))
        await db.execute(sa_delete(svc.Option).where(svc.Option.option_group_id == gid))
        await db.execute(sa_delete(svc.OptionGroup).where(svc.OptionGroup.id == gid))
        await db.execute(sa_delete(svc.Product).where(svc.Product.id.in_([broto_id, big_id])))
        await db.execute(sa_delete(svc.Category).where(svc.Category.id == cat_id))
        await db.commit()


async def test_override_parcial_valida_combinacao_com_padrao_do_grupo(client, seed, token_owner):
    r = await _create_group(client, token_owner, min_selections=1, max_selections=4)
    gid = r.json()["id"]
    await client.put(f"/catalog/products/{seed['prod_id']}/option-groups", json={"option_group_ids": [gid]}, headers=auth(token_owner))

    r2 = await client.patch(
        f"/catalog/products/{seed['prod_id']}/option-groups/{gid}",
        json={"min_selections_override": 5},  # combina com max_selections=4 do padrão do grupo
        headers=auth(token_owner),
    )
    assert r2.status_code == 400


async def test_maximo_efetivo_menor_que_um_rejeitado(client, seed, token_owner):
    r = await _create_group(client, token_owner, min_selections=1, max_selections=4)
    gid = r.json()["id"]
    await client.put(f"/catalog/products/{seed['prod_id']}/option-groups", json={"option_group_ids": [gid]}, headers=auth(token_owner))

    r2 = await client.patch(
        f"/catalog/products/{seed['prod_id']}/option-groups/{gid}",
        json={"max_selections_override": 0},
        headers=auth(token_owner),
    )
    assert r2.status_code == 400


async def test_patch_em_vinculo_inexistente_retorna_404(client, seed, token_owner):
    r = await _create_group(client, token_owner)
    gid = r.json()["id"]
    # grupo existe, produto existe, mas NÃO estão vinculados
    r2 = await client.patch(
        f"/catalog/products/{seed['prod_id']}/option-groups/{gid}",
        json={"max_selections_override": 1},
        headers=auth(token_owner),
    )
    assert r2.status_code == 404


async def test_patch_em_produto_de_outra_empresa_retorna_404(client, seed, token_owner, token_company_b):
    r = await _create_group(client, token_owner)
    gid = r.json()["id"]
    await client.put(f"/catalog/products/{seed['prod_id']}/option-groups", json={"option_group_ids": [gid]}, headers=auth(token_owner))

    r2 = await client.patch(
        f"/catalog/products/{seed['prod_id']}/option-groups/{gid}",
        json={"max_selections_override": 1},
        headers=auth(token_company_b),
    )
    assert r2.status_code == 404


async def test_patch_com_grupo_de_outra_empresa_retorna_404(client, seed, token_owner, token_company_b):
    r = await _create_group(client, token_company_b)
    gid_b = r.json()["id"]
    r2 = await client.patch(
        f"/catalog/products/{seed['prod_id']}/option-groups/{gid_b}",
        json={"max_selections_override": 1},
        headers=auth(token_owner),
    )
    assert r2.status_code == 404


async def test_listagem_de_grupos_nao_expoe_campos_de_override(client, seed, token_owner):
    r = await _create_group(client, token_owner)
    gid = r.json()["id"]
    await client.put(f"/catalog/products/{seed['prod_id']}/option-groups", json={"option_group_ids": [gid]}, headers=auth(token_owner))
    await client.patch(f"/catalog/products/{seed['prod_id']}/option-groups/{gid}", json={"max_selections_override": 1}, headers=auth(token_owner))

    r2 = await client.get("/catalog/option-groups", headers=auth(token_owner))
    grupo = next(g for g in r2.json()["option_groups"] if g["id"] == gid)
    assert "min_selections_override" not in grupo
    assert "max_selections_override" not in grupo


async def test_vincular_desvincular_continua_funcionando_sem_mudanca_de_contrato(client, seed, token_owner):
    r = await _create_group(client, token_owner)
    gid = r.json()["id"]
    r2 = await client.put(f"/catalog/products/{seed['prod_id']}/option-groups", json={"option_group_ids": [gid]}, headers=auth(token_owner))
    assert r2.status_code == 200
    await client.patch(f"/catalog/products/{seed['prod_id']}/option-groups/{gid}", json={"max_selections_override": 1}, headers=auth(token_owner))

    r3 = await client.put(f"/catalog/products/{seed['prod_id']}/option-groups", json={"option_group_ids": []}, headers=auth(token_owner))
    assert r3.status_code == 200
    assert r3.json()["option_groups"] == []  # vínculo (e override) removido por completo
