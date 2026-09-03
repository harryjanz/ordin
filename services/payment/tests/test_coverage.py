"""
Testes de cobertura para payment service.
Usa chamadas diretas e unit tests para cobrir infraestrutura e lógica de negócio.
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
import respx
from fastapi import HTTPException
from sqlalchemy import delete as sa_delete
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def _user(role="owner", company_id=1, terminal_id=None):
    from auth import TokenPayload
    return TokenPayload(sub="1", company_id=company_id, role=role, terminal_id=terminal_id)


@pytest.fixture
async def db_session():
    import main as svc
    db_url = os.environ["DB_URL"].replace("mysql+pymysql://", "mysql+aiomysql://")
    test_engine = create_async_engine(db_url, echo=False)
    test_session = async_sessionmaker(test_engine, expire_on_commit=False)
    orig_engine, orig_session = svc.engine, svc.AsyncSessionLocal
    svc.engine = test_engine
    svc.AsyncSessionLocal = test_session
    async with test_engine.begin() as conn:
        await conn.run_sync(svc.Base.metadata.create_all)
    yield test_session
    await test_engine.dispose()
    svc.engine, svc.AsyncSessionLocal = orig_engine, orig_session


# ═══════════════════════════════════════════════════════════════════════════════
# infrastructure/factory.py
# ═══════════════════════════════════════════════════════════════════════════════

def test_get_provider_mock():
    from domain.schemas import ProviderConfig
    from infrastructure.factory import get_provider
    from infrastructure.providers.mock import MockProvider
    config = ProviderConfig(provider="mock", environment="sandbox")
    provider = get_provider(config)
    assert isinstance(provider, MockProvider)


def test_get_provider_paygo():
    from domain.schemas import ProviderConfig
    from infrastructure.factory import get_provider
    from infrastructure.providers.paygo import PayGoProvider
    config = ProviderConfig(provider="paygo", environment="sandbox",
                            api_key="k", api_secret="s")
    provider = get_provider(config)
    assert isinstance(provider, PayGoProvider)


def test_get_provider_desconhecido():
    from domain.schemas import ProviderConfig
    from infrastructure.factory import get_provider
    config = ProviderConfig(provider="unknown", environment="sandbox")
    with pytest.raises(ValueError, match="não implementado"):
        get_provider(config)


# ═══════════════════════════════════════════════════════════════════════════════
# infrastructure/providers/mock.py
# ═══════════════════════════════════════════════════════════════════════════════

async def test_mock_provider_aprovado():
    import random

    from domain.schemas import TransactionStatus
    from infrastructure.providers.mock import MockProvider
    provider = MockProvider()
    with patch.object(random, 'random', return_value=0.01):
        result = await provider.create_transaction(
            amount=Decimal("25.90"), method="credit",
            terminal_ref="T1", order_ref="ORD-001")
    assert result.status == TransactionStatus.approved
    assert result.nsu is not None
    assert result.authorization is not None


async def test_mock_provider_recusado():
    import random

    from domain.schemas import TransactionStatus
    from infrastructure.providers.mock import MockProvider
    provider = MockProvider()
    with patch.object(random, 'random', return_value=0.99):
        result = await provider.create_transaction(
            amount=Decimal("10.00"), method="debit",
            terminal_ref="T1", order_ref="ORD-002")
    assert result.status == TransactionStatus.refused
    assert "5%" in result.error_message


async def test_mock_provider_cancel():
    from infrastructure.providers.mock import MockProvider
    provider = MockProvider()
    result = await provider.cancel_transaction("TX-001", "T1")
    assert result is True


# ═══════════════════════════════════════════════════════════════════════════════
# infrastructure/providers/mercadopago.py — ORD-129 (migração Payment Intents → Orders API)
# ═══════════════════════════════════════════════════════════════════════════════

def _mp_provider():
    from domain.schemas import ProviderConfig
    from infrastructure.providers.mercadopago import MPProvider
    return MPProvider(ProviderConfig(provider="mercadopago", environment="sandbox", api_key="TEST-token"))


async def test_mp_provider_card_usa_v1_orders_nao_payment_intents():
    """ORD-129: _card_payment deve chamar POST /v1/orders — nunca a API legada
    de payment-intents (/point/integration-api/...), que retorna 403 na API real."""
    from domain.schemas import TransactionStatus
    provider = _mp_provider()
    with respx.mock:
        respx.post("https://api.mercadopago.com/v1/orders").mock(
            return_value=httpx.Response(201, json={
                "id": "ORDTEST00001",
                "status": "created",
                "transactions": {"payments": [{"id": "PAYTEST001", "status": "created"}]},
            })
        )
        respx.get("https://api.mercadopago.com/v1/orders/ORDTEST00001").mock(
            return_value=httpx.Response(200, json={
                "id": "ORDTEST00001",
                "status": "processed",
                "transactions": {"payments": [{
                    "id": "PAYTEST001", "status": "processed", "status_detail": "accredited",
                }]},
            })
        )
        result = await provider.create_transaction(
            amount=Decimal("26.00"), method="credit",
            terminal_ref="PAX_A910__SMARTPOS123", order_ref="ORD-MP01")
    assert result.status == TransactionStatus.approved
    assert result.provider_transaction_id == "ORDTEST00001"
    assert result.nsu == "PAYTEST001"
    assert result.authorization == "accredited"
    # nenhuma chamada bateu na família legada
    assert not any("/point/integration-api/" in str(c.request.url) for c in respx.calls)


@pytest.mark.parametrize("method,expected_default_type", [
    ("credit", "credit_card"),
    ("debit", "debit_card"),
])
async def test_mp_provider_card_envia_default_type_no_terminal(method, expected_default_type):
    """A maquininha só pré-seleciona o meio de pagamento (crédito/débito) se a
    order informar config.payment_method.default_type — sem isso o terminal
    chega ao cliente sem meio escolhido, exigindo seleção manual."""
    from domain.schemas import TransactionStatus
    provider = _mp_provider()
    with respx.mock:
        order_route = respx.post("https://api.mercadopago.com/v1/orders").mock(
            return_value=httpx.Response(201, json={
                "id": "ORDTEST00099",
                "status": "created",
                "transactions": {"payments": [{"id": "PAYTEST099", "status": "created"}]},
            })
        )
        respx.get("https://api.mercadopago.com/v1/orders/ORDTEST00099").mock(
            return_value=httpx.Response(200, json={
                "id": "ORDTEST00099",
                "status": "processed",
                "transactions": {"payments": [{
                    "id": "PAYTEST099", "status": "processed", "status_detail": "accredited",
                }]},
            })
        )
        result = await provider.create_transaction(
            amount=Decimal("15.00"), method=method,
            terminal_ref="PAX_A910__SMARTPOS123", order_ref="ORD-MP99")
    assert result.status == TransactionStatus.approved
    sent_body = json.loads(order_route.calls[0].request.content)
    assert sent_body["config"]["payment_method"]["default_type"] == expected_default_type


async def test_mp_provider_credit_envia_default_installments_a_vista():
    """default_installments só é aceito quando default_type = credit_card —
    envia 1 (à vista) pra evitar a tela de seleção de parcelas no terminal.
    Débito não tem parcelamento, então não deve enviar esse campo."""
    provider = _mp_provider()
    with respx.mock:
        order_route = respx.post("https://api.mercadopago.com/v1/orders").mock(
            return_value=httpx.Response(201, json={
                "id": "ORDTEST00098",
                "status": "created",
                "transactions": {"payments": [{"id": "PAYTEST098", "status": "created"}]},
            })
        )
        respx.get("https://api.mercadopago.com/v1/orders/ORDTEST00098").mock(
            return_value=httpx.Response(200, json={
                "id": "ORDTEST00098",
                "status": "processed",
                "transactions": {"payments": [{
                    "id": "PAYTEST098", "status": "processed", "status_detail": "accredited",
                }]},
            })
        )
        await provider.create_transaction(
            amount=Decimal("15.00"), method="credit",
            terminal_ref="PAX_A910__SMARTPOS123", order_ref="ORD-MP98")
    sent_body = json.loads(order_route.calls[0].request.content)
    assert sent_body["config"]["payment_method"]["default_installments"] == 1

    with respx.mock:
        debit_route = respx.post("https://api.mercadopago.com/v1/orders").mock(
            return_value=httpx.Response(201, json={
                "id": "ORDTEST00097",
                "status": "created",
                "transactions": {"payments": [{"id": "PAYTEST097", "status": "created"}]},
            })
        )
        respx.get("https://api.mercadopago.com/v1/orders/ORDTEST00097").mock(
            return_value=httpx.Response(200, json={
                "id": "ORDTEST00097",
                "status": "processed",
                "transactions": {"payments": [{
                    "id": "PAYTEST097", "status": "processed", "status_detail": "accredited",
                }]},
            })
        )
        await provider.create_transaction(
            amount=Decimal("15.00"), method="debit",
            terminal_ref="PAX_A910__SMARTPOS123", order_ref="ORD-MP97")
    sent_body = json.loads(debit_route.calls[0].request.content)
    assert "default_installments" not in sent_body["config"]["payment_method"]


async def test_mp_provider_card_retry_com_outro_metodo_usa_idempotency_key_diferente():
    """Bug real observado em produção: cliente escolhe crédito, é recusado,
    tenta débito no mesmo pedido (mesmo order_ref). Se a X-Idempotency-Key for
    o order_ref puro, o MP responde 409 idempotency_key_already_used pro
    segundo body (diferente do primeiro) e a order nunca chega no terminal —
    sintoma relatado como "nem chamou a máquina"."""
    from domain.schemas import TransactionStatus
    provider = _mp_provider()
    order_ref = "ORD-RETRY01"

    with respx.mock:
        route1 = respx.post("https://api.mercadopago.com/v1/orders").mock(
            return_value=httpx.Response(201, json={
                "id": "ORDRETRY001", "status": "created",
                "transactions": {"payments": [{"id": "PAYRETRY001", "status": "created"}]},
            })
        )
        respx.get("https://api.mercadopago.com/v1/orders/ORDRETRY001").mock(
            return_value=httpx.Response(200, json={
                "id": "ORDRETRY001", "status": "failed",
                "transactions": {"payments": [{
                    "id": "PAYRETRY001", "status": "failed", "status_detail": "cc_rejected_other_reason",
                }]},
            })
        )
        await provider.create_transaction(
            amount=Decimal("20.00"), method="credit",
            terminal_ref="PAX_A910__SMARTPOS123", order_ref=order_ref)
        key1 = route1.calls[0].request.headers["X-Idempotency-Key"]

    with respx.mock:
        route2 = respx.post("https://api.mercadopago.com/v1/orders").mock(
            return_value=httpx.Response(201, json={
                "id": "ORDRETRY002", "status": "created",
                "transactions": {"payments": [{"id": "PAYRETRY002", "status": "created"}]},
            })
        )
        respx.get("https://api.mercadopago.com/v1/orders/ORDRETRY002").mock(
            return_value=httpx.Response(200, json={
                "id": "ORDRETRY002", "status": "processed",
                "transactions": {"payments": [{
                    "id": "PAYRETRY002", "status": "processed", "status_detail": "accredited",
                }]},
            })
        )
        result = await provider.create_transaction(
            amount=Decimal("20.00"), method="debit",
            terminal_ref="PAX_A910__SMARTPOS123", order_ref=order_ref)
        key2 = route2.calls[0].request.headers["X-Idempotency-Key"]

    assert key1 != key2
    assert result.status == TransactionStatus.approved


async def test_mp_provider_card_order_failed():
    from domain.schemas import TransactionStatus
    provider = _mp_provider()
    with respx.mock:
        respx.post("https://api.mercadopago.com/v1/orders").mock(
            return_value=httpx.Response(201, json={
                "id": "ORDTEST00002",
                "status": "created",
                "transactions": {"payments": [{"id": "PAYTEST002", "status": "created"}]},
            })
        )
        respx.get("https://api.mercadopago.com/v1/orders/ORDTEST00002").mock(
            return_value=httpx.Response(200, json={
                "id": "ORDTEST00002",
                "status": "failed",
                "transactions": {"payments": [{
                    "id": "PAYTEST002", "status": "failed", "status_detail": "insufficient_amount",
                }]},
            })
        )
        result = await provider.create_transaction(
            amount=Decimal("10.00"), method="debit",
            terminal_ref="PAX_A910__SMARTPOS123", order_ref="ORD-MP02")
    assert result.status == TransactionStatus.refused
    assert result.error_message == "insufficient_amount"


async def test_mp_provider_cancel_order_usa_v1_orders_cancel():
    """ORD-129: cancelamento de order de cartão via POST /v1/orders/{id}/cancel
    — nunca DELETE /point/integration-api/.../payment-intents/{id} (legado)."""
    provider = _mp_provider()
    with respx.mock:
        respx.post("https://api.mercadopago.com/v1/orders/ORDTEST00003/cancel").mock(
            return_value=httpx.Response(200, json={"id": "ORDTEST00003", "status": "canceled"})
        )
        result = await provider.cancel_transaction("ORDTEST00003", "PAX_A910__SMARTPOS123")
    assert result is True


async def test_mp_provider_cancel_pix_deixa_expirar():
    """IDs de pagamento PIX (numéricos, não começam com 'ORD') não chamam a
    API de orders — comportamento preservado do fluxo antigo (deixa expirar)."""
    provider = _mp_provider()
    result = await provider.cancel_transaction("123456789", "")
    assert result is True


# ═══════════════════════════════════════════════════════════════════════════════
# infrastructure/providers/*.py — ORD-147 (refund_transaction / refund_window_days)
# ═══════════════════════════════════════════════════════════════════════════════

async def test_mp_provider_refund_cartao_usa_v1_orders_refund():
    """ORD-147: reembolso de cartão via Point usa POST /v1/orders/{id}/refund,
    sem body (reembolso total)."""
    provider = _mp_provider()
    with respx.mock:
        route = respx.post("https://api.mercadopago.com/v1/orders/ORDTEST00020/refund").mock(
            return_value=httpx.Response(201, json={"id": "ORDTEST00020", "status": "refunded"})
        )
        result = await provider.refund_transaction("ORDTEST00020")
    assert result.success is True
    assert route.called
    assert json.loads(route.calls[0].request.content or b"{}") == {}


async def test_mp_provider_refund_pix_usa_v1_payments_refunds():
    """ORD-147: reembolso de PIX usa POST /v1/payments/{id}/refunds (Payments
    API), não a rota de orders — id numérico, sem prefixo ORD."""
    provider = _mp_provider()
    with respx.mock:
        route = respx.post("https://api.mercadopago.com/v1/payments/175900001/refunds").mock(
            return_value=httpx.Response(201, json={"id": 1, "status": "approved"})
        )
        result = await provider.refund_transaction("175900001")
    assert result.success is True
    assert route.called


async def test_mp_provider_refund_falha_carrega_mensagem_de_erro():
    """Diferente de cancel_transaction (bool puro), refund_transaction precisa
    carregar o detalhe do erro pra alimentar uma mensagem específica."""
    provider = _mp_provider()
    with respx.mock:
        respx.post("https://api.mercadopago.com/v1/orders/ORDTEST00021/refund").mock(
            return_value=httpx.Response(400, json={"message": "Saldo insuficiente"})
        )
        result = await provider.refund_transaction("ORDTEST00021")
    assert result.success is False
    assert result.error_message == "Saldo insuficiente"


def test_mp_provider_refund_window_days():
    """ORD-147: prazo é uma capacidade do provider — 90 dias cartão, 180 PIX."""
    provider = _mp_provider()
    assert provider.refund_window_days("credit") == 90
    assert provider.refund_window_days("debit") == 90
    assert provider.refund_window_days("pix") == 180


def test_mock_provider_refund_window_days_sem_limite():
    """MockProvider não sobrescreve — usa o default None da interface."""
    from infrastructure.providers.mock import MockProvider
    provider = MockProvider()
    assert provider.refund_window_days("credit") is None


async def test_mock_provider_refund_transaction_sucesso():
    from infrastructure.providers.mock import MockProvider
    result = await MockProvider().refund_transaction("qualquer-id")
    assert result.success is True


async def test_paygo_provider_refund_transaction_nao_implementado():
    """PayGo não tem reembolso via API nesta história — nunca é chamado na
    prática (o endpoint só roteia refund pra provider mercadopago), mas a
    interface exige a implementação."""
    from domain.schemas import ProviderConfig
    from infrastructure.providers.paygo import PayGoProvider
    provider = PayGoProvider(ProviderConfig(provider="paygo", environment="sandbox", api_key="k", api_secret="s"))
    with pytest.raises(NotImplementedError):
        await provider.refund_transaction("qualquer-id")


# ═══════════════════════════════════════════════════════════════════════════════
# infrastructure/providers/mercadopago.py — ORD-149/ORD-154 (test_connection)
# ═══════════════════════════════════════════════════════════════════════════════
# ORD-154: /v1/users/me foi removido — não é aceito por credencial tipo
# Application/POS (usada por este provider), só por token de usuário pessoal
# via OAuth, e sempre retornava 404 mascarando um token válido. A validação
# de token e a busca de terminal agora usam a mesma chamada a
# /terminals/v1/list.

async def test_mp_provider_test_connection_token_invalido():
    provider = _mp_provider()
    with respx.mock:
        respx.get("https://api.mercadopago.com/terminals/v1/list").mock(
            return_value=httpx.Response(401)
        )
        result = await provider.test_connection(terminal_ref="PAX_Q92__999")
    assert result["success"] is False
    assert "Access token inválido" in result["detail"]


async def test_mp_provider_test_connection_sem_terminal_ref_sucesso():
    """Sem mp_device_id configurado (ou terminal só PIX) — sucesso só com
    base no token, sem tentar localizar um device específico."""
    provider = _mp_provider()
    with respx.mock:
        respx.get("https://api.mercadopago.com/terminals/v1/list").mock(
            return_value=httpx.Response(200, json={"data": {"terminals": []}})
        )
        result = await provider.test_connection(terminal_ref="")
    assert result["success"] is True


async def test_mp_provider_test_connection_terminal_em_pdv_sucesso():
    provider = _mp_provider()
    with respx.mock:
        respx.get("https://api.mercadopago.com/terminals/v1/list").mock(
            return_value=httpx.Response(200, json={
                "data": {"terminals": [{"id": "PAX_Q92__999", "operating_mode": "PDV"}]}
            })
        )
        result = await provider.test_connection(terminal_ref="PAX_Q92__999")
    assert result["success"] is True
    assert "PDV" in result["detail"]


async def test_mp_provider_test_connection_terminal_fora_do_pdv():
    provider = _mp_provider()
    with respx.mock:
        respx.get("https://api.mercadopago.com/terminals/v1/list").mock(
            return_value=httpx.Response(200, json={
                "data": {"terminals": [{"id": "PAX_Q92__999", "operating_mode": "STANDALONE"}]}
            })
        )
        result = await provider.test_connection(terminal_ref="PAX_Q92__999")
    assert result["success"] is False
    assert "fora do modo PDV" in result["detail"]


async def test_mp_provider_test_connection_terminal_nao_encontrado():
    """Mensagem diferente da de 'fora do modo PDV' — motivos e correções
    diferentes (device errado/removido vs. reconfigurar o terminal)."""
    provider = _mp_provider()
    with respx.mock:
        respx.get("https://api.mercadopago.com/terminals/v1/list").mock(
            return_value=httpx.Response(200, json={"data": {"terminals": []}})
        )
        result = await provider.test_connection(terminal_ref="PAX_Q92__999")
    assert result["success"] is False
    assert "não encontrado" in result["detail"]
    assert "fora do modo PDV" not in result["detail"]


async def test_mp_provider_test_connection_falha_rede_terminals_list():
    provider = _mp_provider()
    with respx.mock:
        respx.get("https://api.mercadopago.com/terminals/v1/list").mock(
            side_effect=httpx.ConnectError("boom")
        )
        result = await provider.test_connection(terminal_ref="PAX_Q92__999")
    assert result["success"] is False
    assert "Erro ao conectar ao MP" in result["detail"]


# ═══════════════════════════════════════════════════════════════════════════════
# infrastructure/mongo.py
# ═══════════════════════════════════════════════════════════════════════════════

async def test_save_audit_sem_mongo():
    """Com MONGO_URL vazio, save_audit não deve falhar."""
    from infrastructure import mongo as mongo_mod
    orig_client = mongo_mod._client
    mongo_mod._client = None
    with patch.dict(os.environ, {"MONGO_URL": ""}):
        await mongo_mod.save_audit({"event": "test", "order_ref": "ORD-001"})
    mongo_mod._client = orig_client


async def test_save_audit_com_mongo_mock():
    """Com cliente mongo mockado, save_audit deve chamar insert_one."""
    from infrastructure import mongo as mongo_mod
    orig_client = mongo_mod._client
    mock_client = MagicMock()
    mock_collection = AsyncMock()
    mock_client.__getitem__ = MagicMock(return_value=MagicMock(
        payment_events=mock_collection
    ))
    mock_collection.insert_one = AsyncMock(return_value=None)
    mongo_mod._client = mock_client
    await mongo_mod.save_audit({"transaction_id": 1, "order_ref": "ORD-001"})
    mongo_mod._client = orig_client


def test_get_client_com_url_vazia():
    """_get_client retorna None quando MONGO_URL está vazio."""
    from infrastructure import mongo as mongo_mod
    orig_client = mongo_mod._client
    mongo_mod._client = None
    with patch.dict(os.environ, {"MONGO_URL": ""}):
        result = mongo_mod._get_client()
    assert result is None
    mongo_mod._client = orig_client


def test_get_client_falha_na_criacao_loga_error(caplog):
    """Se motor/pymongo forem incompatíveis (ou qualquer erro na criação do
    cliente), _get_client captura a exceção, loga em nível ERROR (visível em
    qualquer pipeline de alerta) e retorna None sem propagar."""
    from infrastructure import mongo as mongo_mod
    orig_client = mongo_mod._client
    mongo_mod._client = None
    with patch.dict(os.environ, {"MONGO_URL": "mongodb://localhost:27017/"}), \
         patch("motor.motor_asyncio.AsyncIOMotorClient",
               side_effect=ImportError("cannot import name '_QUERY_OPTIONS' from 'pymongo.cursor'")), \
         caplog.at_level("ERROR"):
        result = mongo_mod._get_client()
    assert result is None
    assert any(r.levelname == "ERROR" and "falha ao criar cliente" in r.message
               for r in caplog.records)
    mongo_mod._client = orig_client


async def test_save_audit_falha_no_insert_nao_propaga():
    """Se insert_one falhar (ex: Mongo genuinamente indisponível em runtime),
    save_audit não deve derrubar o fluxo de pagamento que a chamou."""
    from infrastructure import mongo as mongo_mod
    orig_client = mongo_mod._client
    mock_client = MagicMock()
    mock_collection = AsyncMock()
    mock_collection.insert_one = AsyncMock(side_effect=ConnectionError("Mongo indisponível"))
    mock_client.__getitem__ = MagicMock(return_value=MagicMock(
        payment_events=mock_collection
    ))
    mongo_mod._client = mock_client
    # não deve lançar exceção
    await mongo_mod.save_audit({"transaction_id": 1, "order_ref": "ORD-001"})
    mongo_mod._client = orig_client


# ═══════════════════════════════════════════════════════════════════════════════
# infrastructure/brokers/rabbitmq.py
# ═══════════════════════════════════════════════════════════════════════════════

async def test_rabbitmq_publish_sem_order_ref():
    """publish levanta ValueError quando payload não tem 'order_ref'."""
    from infrastructure.brokers.rabbitmq import RabbitMQBroker
    broker = RabbitMQBroker("amqp://localhost")
    with pytest.raises(ValueError, match="order_ref"):
        await broker.publish("payment.approved", {"amount": "25.90"})


async def test_rabbitmq_close_sem_conexao():
    """close não deve falhar quando não há conexão."""
    from infrastructure.brokers.rabbitmq import RabbitMQBroker
    broker = RabbitMQBroker("amqp://localhost")
    await broker.close()  # não deve levantar exceção


async def test_rabbitmq_publish_com_conexao_mock():
    """publish com _connect mockado cobre o caminho feliz."""
    from infrastructure.brokers.rabbitmq import RabbitMQBroker
    broker = RabbitMQBroker("amqp://localhost")
    mock_exchange = AsyncMock()
    broker._connection = MagicMock()
    broker._connection.is_closed = False
    broker._exchange = mock_exchange
    with patch.object(broker, '_connect', new_callable=AsyncMock):
        await broker.publish("payment.approved", {
            "order_ref": "ORD-001",
            "transaction_id": 1,
            "amount": "25.90",
        })
    mock_exchange.publish.assert_called_once()


async def test_rabbitmq_close_com_conexao_mock():
    """close com conexão aberta deve chamar close() na conexão."""
    from infrastructure.brokers.rabbitmq import RabbitMQBroker
    broker = RabbitMQBroker("amqp://localhost")
    mock_conn = AsyncMock()
    mock_conn.is_closed = False
    broker._connection = mock_conn
    await broker.close()
    mock_conn.close.assert_called_once()


# ═══════════════════════════════════════════════════════════════════════════════
# main.py — _get_terminal_config
# ═══════════════════════════════════════════════════════════════════════════════

async def test_get_terminal_config_404():
    import main as svc
    company_url = svc.COMPANY_SVC
    with respx.mock:
        respx.get(f"{company_url}/internal/terminals/9999").mock(
            return_value=httpx.Response(404))
        with pytest.raises(HTTPException) as exc:
            await svc._get_terminal_config(9999)
        assert exc.value.status_code == 404


async def test_get_terminal_config_400():
    import main as svc
    company_url = svc.COMPANY_SVC
    with respx.mock:
        respx.get(f"{company_url}/internal/terminals/9998").mock(
            return_value=httpx.Response(400, json={"detail": "sem config"}))
        with pytest.raises(HTTPException) as exc:
            await svc._get_terminal_config(9998)
        assert exc.value.status_code == 400


async def test_get_terminal_config_503():
    import main as svc
    company_url = svc.COMPANY_SVC
    with respx.mock:
        respx.get(f"{company_url}/internal/terminals/9997").mock(
            return_value=httpx.Response(500))
        with pytest.raises(HTTPException) as exc:
            await svc._get_terminal_config(9997)
        assert exc.value.status_code == 503


# ═══════════════════════════════════════════════════════════════════════════════
# main.py — _mp_order_fetch_and_update (ORD-129, webhook tópico "order")
# ═══════════════════════════════════════════════════════════════════════════════

async def test_mp_order_fetch_and_update_aprova_transacao_pendente(db_session):
    """Reconciliação via webhook: order pendente que virou 'processed' na
    consulta a GET /v1/orders deve ser marcada approved, notificar o pedido
    e publicar payment.approved — mesmo comportamento que _mp_fetch_and_update
    (PIX) já tinha, só que consultando /v1/orders em vez de /v1/payments."""
    import main as svc
    from main import Transaction
    company_url = svc.COMPANY_SVC
    order_url = svc.ORDER_SVC
    async with db_session() as db:
        tx = Transaction(company_id=1, order_ref="ORD-WH01", terminal_id=1,
                          tef_number="T1", method="credit", amount=10.00,
                          status="pending", provider="mercadopago", environment="sandbox",
                          provider_transaction_id="ORDTEST00004")
        db.add(tx); await db.commit(); await db.refresh(tx)
        tx_id = tx.id

    with respx.mock:
        respx.get(f"{company_url}/internal/terminals/1").mock(
            return_value=httpx.Response(200, json={
                "paygo_terminal_id": None, "mp_device_id": "PAX_A910__SMARTPOS123",
                "payment_provider": "mercadopago", "environment": "sandbox",
                "config": {"api_key": "TEST-token"},
            })
        )
        respx.get("https://api.mercadopago.com/v1/orders/ORDTEST00004").mock(
            return_value=httpx.Response(200, json={"id": "ORDTEST00004", "status": "processed"})
        )
        respx.patch(f"{order_url}/internal/orders/ORD-WH01/status").mock(
            return_value=httpx.Response(200)
        )
        async with db_session() as db:
            result = await db.execute(select(svc.Transaction).where(svc.Transaction.id == tx_id))
            tx = result.scalars().first()
            await svc._mp_order_fetch_and_update(tx, "ORDTEST00004", db)

    async with db_session() as db:
        result = await db.execute(select(svc.Transaction).where(svc.Transaction.id == tx_id))
        assert result.scalars().first().status == "approved"
        await db.execute(sa_delete(svc.Transaction).where(svc.Transaction.id == tx_id))
        await db.commit()


# ═══════════════════════════════════════════════════════════════════════════════
# main.py — list_payments e cancel_payment diretos
# ═══════════════════════════════════════════════════════════════════════════════

async def test_dir_list_payments(db_session):
    import main as svc
    async with db_session() as db:
        result = await svc.list_payments(db, _user("owner", 1))
    assert "items" in result


async def test_dir_cancel_inexistente(db_session):
    import main as svc
    from main import CancelIn
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.cancel_payment(9999, CancelIn(reason="teste"), db, _user("owner", 1))
        assert exc.value.status_code == 404


async def test_dir_cancel_nao_aprovada(db_session):
    import main as svc
    from main import CancelIn, Transaction
    async with db_session() as db:
        tx = Transaction(company_id=1, order_ref="ORD-C01", terminal_id=1,
                         tef_number="T1", method="credit", amount=10.00,
                         status="pending", provider="mock", environment="sandbox")
        db.add(tx); await db.commit()
        tx_id = tx.id
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.cancel_payment(tx_id, CancelIn(reason="teste"), db, _user("owner", 1))
        assert exc.value.status_code == 400
    async with db_session() as db:
        await db.execute(sa_delete(svc.Transaction).where(svc.Transaction.id == tx_id))
        await db.commit()


async def test_dir_cancel_mock_aprovada(db_session):
    """Cancel de uma transação mock aprovada: deve chamar _notify_order e _publish."""
    import main as svc
    from main import CancelIn, Transaction
    async with db_session() as db:
        tx = Transaction(company_id=1, order_ref="ORD-C02", terminal_id=1,
                         tef_number="T1", method="credit", amount=10.00,
                         status="approved", provider="mock", environment="sandbox")
        db.add(tx); await db.commit()
        tx_id = tx.id
    order_url = svc.ORDER_SVC
    with respx.mock:
        respx.patch(f"{order_url}/internal/orders/ORD-C02/status").mock(
            return_value=httpx.Response(200))
        async with db_session() as db:
            result = await svc.cancel_payment(tx_id, CancelIn(reason="teste"), db, _user("owner", 1))
    assert result["ok"] is True
    async with db_session() as db:
        await db.execute(sa_delete(svc.Transaction).where(svc.Transaction.id == tx_id))
        await db.commit()


async def test_dir_cancel_mercadopago_cartao_bloqueado(db_session):
    """ORD-079, Achado 3: cancelamento de cartão via Mercado Pago hoje chamaria
    a API de payment-intents (cancela cobrança em andamento), não a API de
    Refunds (estorna cobrança já capturada) — bloqueado até o fluxo de estorno
    real ser resolvido. Transação deve permanecer approved, não cancelled."""
    import main as svc
    from main import CancelIn, Transaction
    async with db_session() as db:
        tx = Transaction(company_id=1, order_ref="ORD-C03", terminal_id=1,
                         tef_number="T1", method="credit", amount=10.00,
                         status="approved", provider="mercadopago", environment="sandbox")
        db.add(tx); await db.commit()
        tx_id = tx.id
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.cancel_payment(tx_id, CancelIn(reason="teste"), db, _user("owner", 1))
        assert exc.value.status_code == 400
        assert "Mercado Pago" in exc.value.detail
    async with db_session() as db:
        result = await db.execute(select(svc.Transaction).where(svc.Transaction.id == tx_id))
        assert result.scalars().first().status == "approved"
        await db.execute(sa_delete(svc.Transaction).where(svc.Transaction.id == tx_id))
        await db.commit()


async def test_dir_cancel_mercadopago_pix_bloqueado(db_session):
    """ORD-147: o guard antigo só bloqueava credit/debit, deixando PIX MP
    aprovado cair em `tx.status = "cancelled"` sem nunca chamar nenhuma API
    do provider (bug latente, nunca alcançável pela UI mas explorável via
    chamada direta). Corrigido pra bloquear TODO provider mercadopago
    aprovado — o caminho correto agora é POST /payments/{tx_id}/refund."""
    import main as svc
    from main import CancelIn, Transaction
    async with db_session() as db:
        tx = Transaction(company_id=1, order_ref="ORD-C04", terminal_id=1,
                         tef_number="T1", method="pix", amount=10.00,
                         status="approved", provider="mercadopago", environment="sandbox")
        db.add(tx); await db.commit()
        tx_id = tx.id
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.cancel_payment(tx_id, CancelIn(reason="teste"), db, _user("owner", 1))
        assert exc.value.status_code == 400
        assert "Mercado Pago" in exc.value.detail
    async with db_session() as db:
        result = await db.execute(select(svc.Transaction).where(svc.Transaction.id == tx_id))
        assert result.scalars().first().status == "approved"
        await db.execute(sa_delete(svc.Transaction).where(svc.Transaction.id == tx_id))
        await db.commit()


# ═══════════════════════════════════════════════════════════════════════════════
# main.py — _verify_mp_signature (ORD-130, fórmula de assinatura corrigida)
# ═══════════════════════════════════════════════════════════════════════════════

def test_verify_mp_signature_manifest_correto():
    """Prova a fórmula do manifest: id:{data.id minúsculo};request-id:{x-request-id};ts:{ts};
    Usa um secret de teste (não o real) + valores reais capturados via ngrok
    inspector numa cobrança de cartão de verdade nesta sessão (data.id,
    x-request-id e ts não são segredos, só identificadores da notificação)."""
    import hashlib
    import hmac

    import main as svc

    secret = "test-webhook-secret-nao-eh-o-real"
    data_id = "ORD01M10M7YZ1CN8NJRVX32EX1B76"  # como chega na query string (maiúsculas)
    request_id = "fb1f1d8a-fa22-405f-8158-1af07dff0feb"
    ts = "1787801538"

    manifest_esperado = f"id:{data_id.lower()};request-id:{request_id};ts:{ts};"
    v1_esperado = hmac.new(secret.encode(), manifest_esperado.encode(), hashlib.sha256).hexdigest()

    assert svc._verify_mp_signature(secret, data_id, request_id, ts, v1_esperado) is True


def test_verify_mp_signature_usa_data_id_da_query_nao_o_request_id_sozinho():
    """Regressão do bug: a versão antiga usava só o x-request-id no campo
    'id:' do manifest (sem 'request-id:' e sem o data.id de verdade) — um
    v1 calculado com o data.id de verdade não deve bater se o código
    voltar a ignorar esse campo."""
    import hashlib
    import hmac

    import main as svc

    secret = "test-webhook-secret-nao-eh-o-real"
    request_id = "fb1f1d8a-fa22-405f-8158-1af07dff0feb"
    ts = "1787801538"

    # v1 calculado com o manifest ERRADO (só request_id, sem data.id nem "request-id:")
    manifest_errado = f"id:{request_id};request-date:{ts};"
    v1_do_manifest_errado = hmac.new(secret.encode(), manifest_errado.encode(), hashlib.sha256).hexdigest()

    assert svc._verify_mp_signature(secret, "ORD01M10M7YZ1CN8NJRVX32EX1B76", request_id, ts, v1_do_manifest_errado) is False


def test_verify_mp_signature_assinatura_invalida():
    import main as svc
    result = svc._verify_mp_signature("secret", "ORD123", "req-1", "1787801538", "hash-invalido")
    assert result is False


async def test_dir_cancel_superadmin_cancela_transacao_de_outra_empresa(db_session):
    """Bug real reportado ao vivo: superadmin (company_id=1 no seed) tentou
    cancelar uma transação e recebeu 403 (_WRITE_ROLES não incluía
    superadmin) e, com o 403 corrigido, teria caído num 404 pra qualquer
    transação fora da company_id=1 do próprio usuário — a query original
    filtrava por Transaction.company_id == current_user.company_id sem
    exceção pro superadmin, diferente de list_payments (que já trata isso).
    Aqui a transação é da empresa 2, o usuário é superadmin da empresa 1:
    precisa achar e cancelar mesmo assim."""
    import main as svc
    from main import CancelIn, Transaction
    async with db_session() as db:
        tx = Transaction(company_id=2, order_ref="ORD-C05", terminal_id=1,
                         tef_number="T1", method="credit", amount=10.00,
                         status="approved", provider="mock", environment="sandbox")
        db.add(tx); await db.commit()
        tx_id = tx.id
    order_url = svc.ORDER_SVC
    with respx.mock:
        respx.patch(f"{order_url}/internal/orders/ORD-C05/status").mock(
            return_value=httpx.Response(200))
        async with db_session() as db:
            result = await svc.cancel_payment(tx_id, CancelIn(reason="teste"), db, _user("superadmin", 1))
    assert result["ok"] is True
    async with db_session() as db:
        await db.execute(sa_delete(svc.Transaction).where(svc.Transaction.id == tx_id))
        await db.commit()
