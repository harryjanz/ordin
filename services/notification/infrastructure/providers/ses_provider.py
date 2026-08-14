import boto3

from domain.interfaces.email_provider import IEmailProvider


class SESEmailProvider(IEmailProvider):
    """Produção — AWS SES, autenticação via IAM role (nunca access key/secret
    key fixas). Escrita e coberta por teste unitário, mas ainda não conectada
    em nenhum ambiente: a Fase 2 (infraestrutura AWS) segue bloqueada
    (`docs/ARQUITETURA.md` §9/§14), então não há como validar deliverability
    de verdade até essa fase começar — ver Riscos na história ORD-087."""

    def __init__(self, region: str, from_address: str):
        self._region = region
        self._from_address = from_address

    async def send(self, to: str, subject: str, html: str) -> None:
        client = boto3.client("ses", region_name=self._region)
        client.send_email(
            Source=self._from_address,
            Destination={"ToAddresses": [to]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {"Html": {"Data": html, "Charset": "UTF-8"}},
            },
        )
