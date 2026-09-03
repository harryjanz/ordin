import logging

from domain.interfaces.message_broker import IMessageBroker

logger = logging.getLogger(__name__)


class SQSBroker(IMessageBroker):
    async def publish(self, event: str, payload: dict) -> None:
        logger.info("SQS stub: %s payload=%s", event, payload)

    async def close(self) -> None:
        pass
