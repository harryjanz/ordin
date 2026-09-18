import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# Correção de bug de produção pré-existente (ORD-146, achado testando a ORD-188
# em ambiente real): _set_option_group_options apagava e recriava TODAS as
# opções do grupo a cada save, mesmo quando só uma opção mudava um campo —
# efeito colateral era perder a imagem de TODAS as opções, não só da editada.
# Cobertura: editar opção existente preserva imagem; remover opção da lista
# descarta a imagem dela (e só dela).


@pytest.fixture
async def client(monkeypatch):
    import main as svc

    # image_url/thumbnail_url nunca passam por upload real nestes testes —
    # setadas direto no banco depois da criação. presigned_download_url e
    # delete_object são trocadas por stubs: sem isso, precisariam de S3/moto
    # real só pra formatar uma URL, o que este teste não precisa provar.
    deleted_keys: list[str] = []
    monkeypatch.setattr(svc, "presigned_download_url", lambda key, expires_in=3600: f"presigned://{key}")
    monkeypatch.setattr(svc, "delete_object", lambda key: deleted_keys.append(key))

    db_url = os.environ["DB_URL"].replace("mysql+pymysql://", "mysql+aiomysql://")
    test_engine = create_async_engine(db_url, echo=False)
    test_session = async_sessionmaker(test_engine, expire_on_commit=False)
    orig_engine, orig_session = svc.engine, svc.AsyncSessionLocal
    svc.engine = test_engine
    svc.AsyncSessionLocal = test_session
    async with test_engine.begin() as conn:
        await conn.run_sync(svc.Base.metadata.create_all)
    async with AsyncClient(transport=ASGITransport(app=svc.app), base_url="http://test") as c:
        c.deleted_keys = deleted_keys  # type: ignore[attr-defined]
        yield c
    await test_engine.dispose()
    svc.engine, svc.AsyncSessionLocal = orig_engine, orig_session


def auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _set_image_directly(image_key: str, option_id: int):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        await db.execute(update(svc.Option).where(svc.Option.id == option_id).values(image_url=image_key))
        await db.commit()


async def test_editar_opcao_existente_preserva_imagem(client, token_owner):
    created = await client.post(
        "/catalog/option-groups",
        json={
            "name": "Sabor", "min_selections": 1, "max_selections": 1,
            "options": [{"label": "Coca-Cola"}, {"label": "Fanta Laranja"}],
        },
        headers=auth(token_owner),
    )
    assert created.status_code == 201
    group_id = created.json()["id"]
    options = created.json()["options"]
    coca_id = next(o["id"] for o in options if o["label"] == "Coca-Cola")
    fanta_id = next(o["id"] for o in options if o["label"] == "Fanta Laranja")

    await _set_image_directly("options/coca.jpg", coca_id)
    await _set_image_directly("options/fanta.jpg", fanta_id)

    # edita só o EAN da Coca-Cola, mantendo os dois ids na lista enviada
    r = await client.put(
        f"/catalog/option-groups/{group_id}/options",
        json={"options": [
            {"id": coca_id, "label": "Coca-Cola", "ean": "7891000100103"},
            {"id": fanta_id, "label": "Fanta Laranja"},
        ]},
        headers=auth(token_owner),
    )
    assert r.status_code == 200
    result = {o["id"]: o for o in r.json()["options"]}
    assert result[coca_id]["ean"] == "7891000100103"
    assert result[coca_id]["image_url"] == "presigned://options/coca.jpg"
    assert result[fanta_id]["image_url"] == "presigned://options/fanta.jpg"
    assert client.deleted_keys == []  # nenhuma imagem descartada


async def test_remover_opcao_da_lista_descarta_so_a_imagem_dela(client, token_owner):
    created = await client.post(
        "/catalog/option-groups",
        json={
            "name": "Sabor", "min_selections": 1, "max_selections": 1,
            "options": [{"label": "Coca-Cola"}, {"label": "Fanta Laranja"}],
        },
        headers=auth(token_owner),
    )
    group_id = created.json()["id"]
    options = created.json()["options"]
    coca_id = next(o["id"] for o in options if o["label"] == "Coca-Cola")
    fanta_id = next(o["id"] for o in options if o["label"] == "Fanta Laranja")

    await _set_image_directly("options/coca.jpg", coca_id)
    await _set_image_directly("options/fanta.jpg", fanta_id)

    # remove a Fanta da lista, mantendo só a Coca
    r = await client.put(
        f"/catalog/option-groups/{group_id}/options",
        json={"options": [{"id": coca_id, "label": "Coca-Cola"}]},
        headers=auth(token_owner),
    )
    assert r.status_code == 200
    result = {o["id"]: o for o in r.json()["options"]}
    assert coca_id in result
    assert fanta_id not in result
    assert result[coca_id]["image_url"] == "presigned://options/coca.jpg"  # sobrevivente intacta
    assert client.deleted_keys == ["options/fanta.jpg"]  # só a removida foi descartada


async def test_id_de_opcao_que_nao_pertence_ao_grupo_e_rejeitado(client, token_owner):
    g1 = await client.post(
        "/catalog/option-groups",
        json={"name": "Sabor", "min_selections": 1, "max_selections": 1, "options": [{"label": "Coca-Cola"}]},
        headers=auth(token_owner),
    )
    g2 = await client.post(
        "/catalog/option-groups",
        json={"name": "Tamanho", "min_selections": 1, "max_selections": 1, "options": [{"label": "Grande"}]},
        headers=auth(token_owner),
    )
    id_do_outro_grupo = g2.json()["options"][0]["id"]

    r = await client.put(
        f"/catalog/option-groups/{g1.json()['id']}/options",
        json={"options": [{"id": id_do_outro_grupo, "label": "Coca-Cola"}]},
        headers=auth(token_owner),
    )
    assert r.status_code == 400


async def test_opcao_nova_sem_id_continua_sendo_criada(client, token_owner):
    created = await client.post(
        "/catalog/option-groups",
        json={"name": "Sabor", "min_selections": 1, "max_selections": 1, "options": [{"label": "Coca-Cola"}]},
        headers=auth(token_owner),
    )
    group_id = created.json()["id"]
    coca_id = created.json()["options"][0]["id"]

    r = await client.put(
        f"/catalog/option-groups/{group_id}/options",
        json={"options": [
            {"id": coca_id, "label": "Coca-Cola"},
            {"label": "Fanta Laranja"},  # sem id — opção nova
        ]},
        headers=auth(token_owner),
    )
    assert r.status_code == 200
    labels = {o["label"] for o in r.json()["options"]}
    assert labels == {"Coca-Cola", "Fanta Laranja"}
