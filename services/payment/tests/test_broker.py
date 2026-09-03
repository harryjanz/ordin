import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import logging
from unittest.mock import AsyncMock

import pytest

# ── SQSBroker stub ────────────────────────────────────────────────────────────

async def test_sqs_broker_publish_no_exception():
    from infrastructure.brokers.sqs import SQSBroker
    broker = SQSBroker()
    await broker.publish("payment.approved", {"order_ref": "ORD-001", "amount": "26.00"})


async def test_sqs_broker_close_no_exception():
    from infrastructure.brokers.sqs import SQSBroker
    broker = SQSBroker()
    await broker.close()


async def test_sqs_broker_logs_event(caplog):
    from infrastructure.brokers.sqs import SQSBroker
    broker = SQSBroker()
    with caplog.at_level(logging.INFO):
        await broker.publish("payment.refused", {"order_ref": "ORD-002"})
    assert "payment.refused" in caplog.text


# ── Broker factory ────────────────────────────────────────────────────────────

def test_factory_returns_sqs_broker():
    from infrastructure.broker_factory import get_broker
    from infrastructure.brokers.sqs import SQSBroker
    broker = get_broker("sqs")
    assert isinstance(broker, SQSBroker)


def test_factory_returns_rabbitmq_broker():
    from infrastructure.broker_factory import get_broker
    from infrastructure.brokers.rabbitmq import RabbitMQBroker
    broker = get_broker("rabbitmq")
    assert isinstance(broker, RabbitMQBroker)


def test_factory_raises_for_unknown_broker():
    from infrastructure.broker_factory import get_broker
    with pytest.raises(ValueError, match="não suportado"):
        get_broker("kafka")


# ── IMessageBroker contract ───────────────────────────────────────────────────

async def test_rabbitmq_publish_validates_order_ref():
    from infrastructure.brokers.rabbitmq import RabbitMQBroker
    broker = RabbitMQBroker(url="amqp://guest:guest@localhost/")
    with pytest.raises(ValueError, match="order_ref"):
        await broker.publish("payment.approved", {"amount": "26.00"})


# ── Events dataclasses ────────────────────────────────────────────────────────

def test_payment_approved_event_to_dict():
    from domain.events import PaymentApprovedEvent
    ev = PaymentApprovedEvent(company_id=1, order_ref="ORD-001", transaction_id=42, amount="26.00", nsu="NSU123", authorization="AUT456")
    d = ev.to_dict()
    assert d["event"] == "payment.approved"
    assert d["order_ref"] == "ORD-001"
    assert d["nsu"] == "NSU123"


def test_payment_refused_event_to_dict():
    from domain.events import PaymentRefusedEvent
    ev = PaymentRefusedEvent(company_id=1, order_ref="ORD-002", transaction_id=7, amount="10.00")
    d = ev.to_dict()
    assert d["event"] == "payment.refused"
    assert d["order_ref"] == "ORD-002"


def test_payment_cancelled_event_to_dict():
    from domain.events import PaymentCancelledEvent
    ev = PaymentCancelledEvent(company_id=1, order_ref="ORD-003", transaction_id=9, amount="15.00", cancel_reason="Desistência")
    d = ev.to_dict()
    assert d["event"] == "payment.cancelled"
    assert d["cancel_reason"] == "Desistência"


# ── _publish helper: broker failure does not raise ────────────────────────────

async def test_publish_helper_swallows_broker_exception(caplog):
    import main as payment_main
    from infrastructure.brokers.sqs import SQSBroker

    original_broker = payment_main._broker

    broken_broker = SQSBroker()
    broken_broker.publish = AsyncMock(side_effect=RuntimeError("broker indisponível"))
    payment_main._broker = broken_broker

    with caplog.at_level(logging.WARNING):
        await payment_main._publish("payment.approved", {"order_ref": "ORD-X"})

    assert "falha ao publicar" in caplog.text
    payment_main._broker = original_broker
