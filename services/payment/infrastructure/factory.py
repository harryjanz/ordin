from domain.interfaces.payment_provider import IPaymentProvider
from domain.schemas import ProviderConfig
from infrastructure.providers.mock import MockProvider
from infrastructure.providers.paygo import PayGoProvider


def get_provider(config: ProviderConfig) -> IPaymentProvider:
    match config.provider:
        case "mock":
            return MockProvider()
        case "paygo":
            return PayGoProvider(config)
        case _:
            raise ValueError(f"Provider '{config.provider}' não implementado")
