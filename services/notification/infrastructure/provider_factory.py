from domain.interfaces.email_provider import IEmailProvider

from infrastructure.providers.ses_provider import SESEmailProvider
from infrastructure.providers.smtp_provider import SMTPEmailProvider


def get_email_provider(name: str) -> IEmailProvider:
    from config import require_env
    from_address = require_env("EMAIL_FROM_ADDRESS")
    match name:
        case "smtp":
            return SMTPEmailProvider(
                host=require_env("SMTP_HOST"),
                port=int(require_env("SMTP_PORT")),
                user=require_env("SMTP_USER"),
                password=require_env("SMTP_PASSWORD"),
                from_address=from_address,
            )
        case "ses":
            import os
            return SESEmailProvider(
                region=os.getenv("AWS_REGION", "us-east-1"),
                from_address=from_address,
            )
        case _:
            raise ValueError(f"Provider de e-mail '{name}' não suportado")
