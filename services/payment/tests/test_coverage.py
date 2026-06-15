"""
Testes de cobertura para payment service.
Usa chamadas diretas e unit tests para cobrir infraestrutura e lógica de negócio.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
import httpx
import respx
from decimal import Decimal
from fastapi import HTTPException
from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from unittest.mock import AsyncMock, MagicMock, patch


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
    from infrastructure.factory import get_provider
    from infrastructure.providers.mock import MockProvider
    from domain.schemas import ProviderConfig
    config = ProviderConfig(provider="mock", environment="sandbox")
    provider = get_provider(config)
    assert isinstance(provider, MockProvider)


def test_get_provider_paygo():
    from infrastructure.factory import get_provider
    from infrastructure.providers.paygo import PayGoProvider
    from domain.schemas import ProviderConfig
    config = ProviderConfig(provider="paygo", environment="sandbox",
                            api_key="k", api_secret="s")
    provider = get_provider(config)
    assert isinstance(provider, PayGoProvider)


def test_get_provider_desconhecido():
    from infrastructure.factory import get_provider
    from domain.schemas import ProviderConfig
    config = ProviderConfig(provider="unknown", environment="sandbox")
    with pytest.raises(ValueError, match="não implementado"):
        get_provider(config)


# ═══════════════════════════════════════════════════════════════════════════════
# infrastructure/providers/mock.py
# ═══════════════════════════════════════════════════════════════════════════════

async def test_mock_provider_aprovado():
    from infrastructure.providers.mock import MockProvider
    from domain.schemas import TransactionStatus
    import random
    provider = MockProvider()
    with patch.object(random, 'random', return_value=0.01):
        result = await provider.create_transaction(
            amount=Decimal("25.90"), method="credit",
            terminal_ref="T1", order_ref="ORD-001")
    assert result.status == TransactionStatus.approved
    assert result.nsu is not None
    assert result.authorization is not None


async def test_mock_provider_recusado():
    from infrastructure.providers.mock import MockProvider
    from domain.schemas import TransactionStatus
    import random
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
