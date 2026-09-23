"""ORD-198 (D1): baixa automática de estoque na aprovação do pagamento.
Cobre os cenários Gherkin do QA Explorer (docs/stories/ORD-198): só CFOP
5102 decrementa, falha real nunca bloqueia o pagamento, e o hook dispara
nos 4 pontos onde uma transação vira "approved" (mas aqui só exercitamos
o caminho síncrono via POST /payments — os 3 caminhos assíncronos de MP
reaproveitam a mesma função _decrementar_estoque_venda, sem lógica
própria a testar de novo). Toda chamada externa é mockada via respx,
mesmo padrão de test_ord171_emissao_nfce.py.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx
import pytest
import respx
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


def _order_url():
    import main as svc
    return svc.ORDER_SVC


def _catalog_url():
    import main as svc
    return svc.CATALOG_SVC


_ORDER_BODY = {
    "order_ref": "ORD-D1-01",
    "company_id": 1,
    "total": 26.00,
    "items": [{"product_id": 1, "product_name": "Coca-Cola Lata 350ml", "unit_price": 6.00, "quantity": 2}],
}


# ── _decrementar_estoque_venda — unitário ────────────────────────────────────

async def test_cfop_5102_dispara_decremento_com_quantidade_correta(client):
    import main as svc
    with respx.mock:
        respx.get(f"{_order_url()}/internal/orders/ORD-D1-01").mock(
            return_value=httpx.Response(200, json=_ORDER_BODY)
        )
        respx.get(f"{_catalog_url()}/internal/products/1/fiscal").mock(
            return_value=httpx.Response(200, json={"ncm": "22021000", "cfop": "5102", "cest": None})
        )
        decrement_route = respx.post(f"{_catalog_url()}/internal/stock/decrement").mock(
            return_value=httpx.Response(200, json={"processed": 1, "skipped": 0})
        )

        await svc._decrementar_estoque_venda("ORD-D1-01")

        assert decrement_route.call_count == 1
        sent = _json_body(decrement_route.calls[0].request)
        assert sent["order_ref"] == "ORD-D1-01"
        assert sent["items"] == [{"product_id": 1, "quantity": 2}]


async def test_cfop_5101_nunca_decrementa(client):
    import main as svc
    with respx.mock:
        respx.get(f"{_order_url()}/internal/orders/ORD-D1-02").mock(
            return_value=httpx.Response(200, json={**_ORDER_BODY, "order_ref": "ORD-D1-02"})
        )
        respx.get(f"{_catalog_url()}/internal/products/1/fiscal").mock(
            return_value=httpx.Response(200, json={"ncm": "19059090", "cfop": "5101", "cest": None})
        )
        decrement_route = respx.post(f"{_catalog_url()}/internal/stock/decrement")

        await svc._decrementar_estoque_venda("ORD-D1-02")

        assert decrement_route.call_count == 0


async def test_order_service_indisponivel_nao_propaga_excecao(client):
    """Rota mockada com falha de conexão real (não "rota não mockada" —
    isso dispara o próprio assert interno do respx, não simula
    indisponibilidade de rede de verdade)."""
    import main as svc
    with respx.mock:
        respx.get(f"{_order_url()}/internal/orders/ORD-D1-03").mock(
            side_effect=httpx.ConnectError("connection refused")
        )
        await svc._decrementar_estoque_venda("ORD-D1-03")  # não levanta


async def test_catalog_service_indisponivel_nunca_bloqueia(client):
    """Falha real na chamada de decremento (catalog-service fora do ar) —
    a cobrança já aconteceu fisicamente, não existe 'desfazer' aqui."""
    import main as svc
    with respx.mock:
        respx.get(f"{_order_url()}/internal/orders/ORD-D1-04").mock(
            return_value=httpx.Response(200, json={**_ORDER_BODY, "order_ref": "ORD-D1-04"})
        )
        respx.get(f"{_catalog_url()}/internal/products/1/fiscal").mock(
            return_value=httpx.Response(200, json={"ncm": "22021000", "cfop": "5102", "cest": None})
        )
        respx.post(f"{_catalog_url()}/internal/stock/decrement").mock(
            side_effect=httpx.TimeoutException("timeout")
        )

        await svc._decrementar_estoque_venda("ORD-D1-04")  # não levanta


def _json_body(request) -> dict:
    import json
    return json.loads(request.content)


# ── Integração via /payments — fluxo completo ────────────────────────────────

async def test_payment_aprovado_dispara_decremento_de_estoque(client, token_kiosk):
    import main as svc
    with respx.mock:
        respx.get(f"{svc.COMPANY_SVC}/internal/terminals/1").mock(
            return_value=httpx.Response(200, json={
                "paygo_terminal_id": None, "payment_provider": "mock", "environment": "sandbox", "config": None,
            })
        )
        respx.patch(f"{_order_url()}/internal/orders/ORD-D1-05/status").mock(return_value=httpx.Response(200))
        respx.get(f"{svc.COMPANY_SVC}/internal/companies/1/fiscal-credentials").mock(
            return_value=httpx.Response(200, json={"ativo": False})
        )
        respx.get(f"{_order_url()}/internal/orders/ORD-D1-05").mock(
            return_value=httpx.Response(200, json={**_ORDER_BODY, "order_ref": "ORD-D1-05"})
        )
        respx.get(f"{_catalog_url()}/internal/products/1/fiscal").mock(
            return_value=httpx.Response(200, json={"ncm": "22021000", "cfop": "5102", "cest": None})
        )
        decrement_route = respx.post(f"{_catalog_url()}/internal/stock/decrement").mock(
            return_value=httpx.Response(200, json={"processed": 1, "skipped": 0})
        )

        import random
        original = random.random
        random.random = lambda: 0.01
        try:
            r = await client.post(
                "/payments",
                json={"order_ref": "ORD-D1-05", "method": "credit", "amount": 12.00,
                      "items": [{"product_id": 1, "name": "Coca-Cola Lata 350ml", "qty": 2, "unit_price": 6.00}]},
                headers={"Authorization": f"Bearer {token_kiosk}"},
            )
        finally:
            random.random = original

    assert r.status_code == 201, r.text
    assert decrement_route.call_count == 1
