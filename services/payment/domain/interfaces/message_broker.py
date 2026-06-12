from abc import ABC, abstractmethod


class IMessageBroker(ABC):
    @abstractmethod
    async def publish(self, event: str, payload: dict) -> None: ...

    @abstractmethod
    async def close(self) -> None: ...
