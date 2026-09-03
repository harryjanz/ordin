from email.message import EmailMessage

import aiosmtplib
from domain.interfaces.email_provider import IEmailProvider


class SMTPEmailProvider(IEmailProvider):
    """Envia via SMTP — em desenvolvimento, aponta pro Mailtrap (sandbox,
    nenhum e-mail sai de verdade, só fica visível no painel do Mailtrap)."""

    def __init__(self, host: str, port: int, user: str, password: str, from_address: str):
        self._host = host
        self._port = port
        self._user = user
        self._password = password
        self._from_address = from_address

    async def send(self, to: str, subject: str, html: str) -> None:
        message = EmailMessage()
        message["From"] = self._from_address
        message["To"] = to
        message["Subject"] = subject
        message.set_content("Este e-mail requer um cliente compatível com HTML.")
        message.add_alternative(html, subtype="html")

        await aiosmtplib.send(
            message,
            hostname=self._host,
            port=self._port,
            username=self._user,
            password=self._password,
            start_tls=True,
        )
