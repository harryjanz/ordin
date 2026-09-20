import os
import sys
from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

BR_TZ = ZoneInfo("America/Sao_Paulo")


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
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _utc_naive_for_br_day(days_ago: int, hour_br: int = 12):
    """Meio-dia de Brasília do dia `days_ago` atrás, convertido pra UTC ingênuo —
    mesmo formato que StockMovement.criado_em usa na produção (datetime.utcnow())."""
    dia_br = datetime.now(BR_TZ).date() - timedelta(days=days_ago)
    dt_br = datetime.combine(dia_br, datetime.min.time(), tzinfo=BR_TZ).replace(hour=hour_br)
    return dt_br.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)


async def _make_stock_item(company_id, *, product_id=None, option_id=None, quantidade_atual, unidade="un"):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        item = svc.StockItem(
            company_id=company_id, product_id=product_id, option_id=option_id,
            quantidade_atual=Decimal(str(quantidade_atual)), unidade=unidade,
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)
        return item.id


async def _add_movement(stock_item_id, *, tipo, quantidade, days_ago, hour_br=12):
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        db.add(svc.StockMovement(
            stock_item_id=stock_item_id, tipo=tipo, quantidade=Decimal(str(quantidade)),
            criado_por=1, criado_em=_utc_naive_for_br_day(days_ago, hour_br),
        ))
        await db.commit()


# ── Reconstrução do nível de estoque ────────────────────────────────────────

async def test_reconstrucao_com_movimentacoes_em_dias_diferentes(client, token_owner):
    product_id = await _create_product(client, token_owner)
    item_id = await _make_stock_item(1, product_id=product_id, quantidade_atual=40)
    await _add_movement(item_id, tipo="entrada", quantidade=20, days_ago=3)
    await _add_movement(item_id, tipo="ajuste", quantidade=-10, days_ago=1)

    r = await client.get(f"/catalog/products/{product_id}/stock/history", headers=auth(token_owner))
    assert r.status_code == 200
    pontos = r.json()["points"]
    assert len(pontos) == 7
    quantidades = [p["quantidade"] for p in pontos]
    # dias 6,5,4 atrás (antes da entrada): 30 — dias 3,2 (após entrada, antes do ajuste): 50
    # dias 1,0 (após o ajuste): 40
    assert quantidades == [30, 30, 30, 50, 50, 40, 40]


async def test_multiplas_movimentacoes_no_mesmo_dia_agregadas(client, token_owner):
    product_id = await _create_product(client, token_owner)
    item_id = await _make_stock_item(1, product_id=product_id, quantidade_atual=12)
    await _add_movement(item_id, tipo="entrada", quantidade=10, days_ago=2, hour_br=8)
    await _add_movement(item_id, tipo="entrada", quantidade=5, days_ago=2, hour_br=14)
    await _add_movement(item_id, tipo="ajuste", quantidade=-3, days_ago=2, hour_br=20)

    r = await client.get(f"/catalog/products/{product_id}/stock/history", headers=auth(token_owner))
    pontos = r.json()["points"]
    quantidades = [p["quantidade"] for p in pontos]
    # antes do dia com as 3 movimentações: 0 (12 - 12 de delta líquido) — a partir
    # dele, delta líquido do dia (+10+5-3=+12) aplicado de uma vez só
    assert quantidades == [0, 0, 0, 0, 12, 12, 12]


async def test_movimentacao_perto_da_meia_noite_de_brasilia_cai_no_dia_certo(client, token_owner):
    # 23:50 de um dia em Brasília é 02:50 do dia SEGUINTE em UTC — testa que a
    # agregação usa o dia de Brasília, não o de UTC.
    product_id = await _create_product(client, token_owner)
    item_id = await _make_stock_item(1, product_id=product_id, quantidade_atual=25)
    await _add_movement(item_id, tipo="entrada", quantidade=25, days_ago=2, hour_br=23)
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        row = (await db.execute(svc.select(svc.StockMovement).filter_by(stock_item_id=item_id))).scalars().first()
        row.criado_em = row.criado_em.replace(minute=50)  # deixa 23:50, não 23:00
        await db.commit()

    r = await client.get(f"/catalog/products/{product_id}/stock/history", headers=auth(token_owner))
    pontos = r.json()["points"]
    quantidades = [p["quantidade"] for p in pontos]
    # se caísse no dia UTC (dia seguinte), o salto apareceria um dia mais tarde
    assert quantidades == [0, 0, 0, 0, 25, 25, 25]


async def test_stock_item_criado_ha_menos_de_7_dias(client, token_owner):
    product_id = await _create_product(client, token_owner)
    item_id = await _make_stock_item(1, product_id=product_id, quantidade_atual=10)
    await _add_movement(item_id, tipo="entrada", quantidade=10, days_ago=3)

    r = await client.get(f"/catalog/products/{product_id}/stock/history", headers=auth(token_owner))
    pontos = r.json()["points"]
    quantidades = [p["quantidade"] for p in pontos]
    assert quantidades == [0, 0, 0, 10, 10, 10, 10]


async def test_sem_movimentacao_na_janela_mostra_linha_reta(client, token_owner):
    product_id = await _create_product(client, token_owner)
    item_id = await _make_stock_item(1, product_id=product_id, quantidade_atual=15)
    await _add_movement(item_id, tipo="entrada", quantidade=15, days_ago=20)  # fora da janela de 7 dias

    r = await client.get(f"/catalog/products/{product_id}/stock/history", headers=auth(token_owner))
    pontos = r.json()["points"]
    assert [p["quantidade"] for p in pontos] == [15] * 7


async def test_sem_stock_item_retorna_lista_vazia(client, token_owner):
    product_id = await _create_product(client, token_owner)
    r = await client.get(f"/catalog/products/{product_id}/stock/history", headers=auth(token_owner))
    assert r.status_code == 200
    assert r.json()["points"] == []


async def test_funciona_igual_para_option(client, token_owner):
    r = await client.post(
        "/catalog/option-groups",
        json={"name": "Sabor", "min_selections": 1, "max_selections": 1, "options": [{"label": "Coca-Cola"}]},
        headers=auth(token_owner),
    )
    option_id = r.json()["options"][0]["id"]
    item_id = await _make_stock_item(1, option_id=option_id, quantidade_atual=40)
    await _add_movement(item_id, tipo="entrada", quantidade=20, days_ago=3)
    await _add_movement(item_id, tipo="ajuste", quantidade=-10, days_ago=1)

    r = await client.get(f"/catalog/options/{option_id}/stock/history", headers=auth(token_owner))
    assert r.status_code == 200
    quantidades = [p["quantidade"] for p in r.json()["points"]]
    assert quantidades == [30, 30, 30, 50, 50, 40, 40]


async def test_isolamento_multi_tenant(client, token_owner, token_company_b):
    product_id = await _create_product(client, token_owner)
    await _make_stock_item(1, product_id=product_id, quantidade_atual=10)

    r = await client.get(f"/catalog/products/{product_id}/stock/history", headers=auth(token_company_b))
    assert r.status_code == 404
