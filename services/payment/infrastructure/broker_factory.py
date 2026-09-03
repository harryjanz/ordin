from domain.interfaces.message_broker import IMessageBroker

from infrastructure.brokers.rabbitmq import RabbitMQBroker
from infrastructure.brokers.sqs import SQSBroker


def get_broker(name: str) -> IMessageBroker:
    match name:
        case "rabbitmq":
            from config import require_env
            return RabbitMQBroker(url=require_env("RABBITMQ_URL"))
        case "sqs":
            return SQSBroker()
        case _:
            raise ValueError(f"Broker '{name}' não suportado")
