from abc import ABC, abstractmethod


class IEmailProvider(ABC):
    @abstractmethod
    async def send(self, to: str, subject: str, html: str) -> None: ...
