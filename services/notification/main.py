import os
import secrets

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

from config import require_env
from infrastructure.provider_factory import get_email_provider

INTERNAL_SECRET = require_env("INTERNAL_SECRET")
EMAIL_PROVIDER  = os.getenv("EMAIL_PROVIDER", "smtp")

provider = get_email_provider(EMAIL_PROVIDER)


def require_internal(x_internal_secret: str = Header(default="")) -> None:
    if not secrets.compare_digest(x_internal_secret, INTERNAL_SECRET):
        raise HTTPException(403, detail="Acesso interno não autorizado")


app = FastAPI(
    title="Ordin — Notification Service",
    description=(
        "Envio de e-mails transacionais da plataforma Ordin (convite de usuário, "
        "definição de senha). Sem rota pública — consumido exclusivamente via "
        "rede interna pelo company-service (header `X-Internal-Secret`)."
    ),
    version="1.0.0",
)


# Descrição do papel exibida no e-mail de convite — mora aqui (não no
# frontend) porque quem decide o texto do e-mail é quem monta o e-mail.
ROLE_DESCRIPTIONS = {
    "owner": (
        "Como <strong>Owner</strong>, você tem acesso total à sua empresa: pode "
        "gerenciar terminais, catálogo, outros usuários (incluindo promovê-los a "
        "Owner) e configurações de pagamento."
    ),
    "manager": (
        "Como <strong>Gerente</strong>, você pode gerenciar terminais, catálogo, "
        "usuários (exceto promover a Owner) e configurações de pagamento da empresa."
    ),
    "cashier": (
        "Como <strong>Caixa</strong>, você vai operar o dia a dia: acompanhar "
        "pedidos, coletar tickets e realizar pagamentos nos terminais da empresa."
    ),
}


# ORD-090 — identidade visual do e-mail. Sem arquivo de logo nem hospedagem
# de imagem pública configurada (Fase 2 ainda bloqueada), então o cabeçalho
# usa o mesmo wordmark de texto ("ordin" roxo/negrito) já usado no admin
# (LoginScreen/SetPasswordScreen), não uma imagem. E-mail de suporte e
# WhatsApp são placeholders — sem canal de suporte real configurado ainda.
_EMAIL_HEADER = """
<div style="text-align: center; padding: 20px 0;">
  <span style="font-size: 24px; font-weight: 800; color: #7c3aed; letter-spacing: -0.02em;">ordin</span>
</div>
"""

_EMAIL_FOOTER = """
<div style="border-top: 1px solid #eee; margin-top: 24px; padding-top: 16px; color: #888; font-size: 12px; text-align: center;">
  Equipe Ordin<br>
  suporte@ordin.com · WhatsApp (11) 91234-5678
</div>
"""


def _build_invite_html(name: str, role: str, set_password_url: str) -> str:
    role_description = ROLE_DESCRIPTIONS.get(role, "Você foi convidado a fazer parte da equipe.")
    return f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      {_EMAIL_HEADER}
      <h2>Bem-vindo(a) à Ordin, {name}!</h2>
      <p>{role_description}</p>
      <p>Para começar, defina sua senha de acesso:</p>
      <p>
        <a href="{set_password_url}"
           style="display: inline-block; background: #7c3aed; color: #fff;
                  padding: 12px 24px; border-radius: 8px; text-decoration: none;">
          Definir minha senha
        </a>
      </p>
      <p style="color: #888; font-size: 12px;">
        Se você não esperava este e-mail, pode ignorá-lo com segurança.
      </p>
      {_EMAIL_FOOTER}
    </div>
    """


class SendInviteIn(BaseModel):
    to: str
    name: str
    role: str
    set_password_url: str


@app.post("/internal/send-invite", include_in_schema=False)
async def send_invite(body: SendInviteIn, _: None = Depends(require_internal)):
    html = _build_invite_html(body.name, body.role, body.set_password_url)
    await provider.send(to=body.to, subject="Bem-vindo(a) à Ordin — defina sua senha", html=html)
    return {"sent": True}


@app.get("/health")
def health():
    return {"service": "notification", "status": "ok"}
