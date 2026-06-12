import json
import logging
import aio_pika
from domain.interfaces.message_broker import IMessageBroker

logger = logging.getLogger(__name__)

_EXCHANGE = "ordin.events"
_QUEUE    = "payment.events"
_PATTERN  = "payment.*"


class RabbitMQBroker(IMessageBroker):
    def __init__(self, url: str):
        self._url = url
        self._connection: aio_pika.abc.AbstractRobustConnection | None = None
        self._exchange: aio_pika.abc.AbstractExchange | None = None

    async def _connect(self) -> None:
        if self._connection is None or self._connection.is_closed:
            self._connection = await aio_pika.connect_robust(self._url)
            channel = await self._connection.channel()
            self._exchange = await channel.declare_exchange(
                _EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
            )
            queue = await channel.declare_queue(_QUEUE, durable=True)
            await queue.bind(self._exchange, routing_key=_PATTERN)

    async def publish(self, event: str, payload: dict) -> None:
        if "order_ref" not in payload:
            raise ValueError(f"Payload do evento '{event}' deve conter 'order_ref'")
        await self._connect()
        message = aio_pika.Message(
            body=json.dumps(payload).encode(),
            content_type="application/json",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
        )
        await self._exchange.publish(message, routing_key=event)
        logger.info("Broker: publicado %s → %s", event, _QUEUE)

    async def close(self) -> None:
        if self._connection and not self._connection.is_closed:
            await self._connection.close()
