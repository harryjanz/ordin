import os
import secrets

from config import require_env
from fastapi import Depends, FastAPI, Header, HTTPException
from infrastructure.provider_factory import get_email_provider
from pydantic import BaseModel

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


# ORD-090/símbolo novo — identidade visual do e-mail. Sem hospedagem de
# imagem pública configurada (Fase 2 ainda bloqueada), então o símbolo vai
# embutido como PNG base64 (data URI) em vez de referenciar uma URL —
# funciona offline e não depende de nenhum servidor de assets externo.
# PNG (não SVG) de propósito: suporte a SVG em cliente de e-mail é
# inconsistente (quebra no Outlook desktop); PNG base64 é o denominador
# comum mais seguro. Gerado a partir do mesmo símbolo usado no favicon e
# no admin (frontend/admin/public/favicon.svg), 96×96, fundo transparente.
_ORDIN_SYMBOL_PNG_B64 = (
    "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"
)


_EMAIL_HEADER = f"""
<div style="text-align: center; padding: 20px 0;">
  <img src="data:image/png;base64,{_ORDIN_SYMBOL_PNG_B64}" width="28" height="28"
       alt="Ordin" style="vertical-align: middle; margin-right: 8px;" />
  <span style="font-size: 24px; font-weight: 800; color: #7c3aed; letter-spacing: -0.02em; vertical-align: middle;">ordin</span>
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


# ORD-097 — mesmo template base do convite, CTA e corpo diferentes (não é
# "bem-vindo", é "alguém pediu uma senha nova pra essa conta").
def _build_password_reset_html(name: str, set_password_url: str) -> str:
    return f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      {_EMAIL_HEADER}
      <h2>Olá, {name}</h2>
      <p>Recebemos um pedido para redefinir a senha da sua conta na Ordin.</p>
      <p>
        <a href="{set_password_url}"
           style="display: inline-block; background: #7c3aed; color: #fff;
                  padding: 12px 24px; border-radius: 8px; text-decoration: none;">
          Redefinir minha senha
        </a>
      </p>
      <p style="color: #888; font-size: 12px;">
        Se você não pediu essa redefinição, pode ignorar este e-mail com segurança — sua senha atual continua valendo.
      </p>
      {_EMAIL_FOOTER}
    </div>
    """


class SendPasswordResetIn(BaseModel):
    to: str
    name: str
    set_password_url: str


@app.post("/internal/send-password-reset", include_in_schema=False)
async def send_password_reset(body: SendPasswordResetIn, _: None = Depends(require_internal)):
    html = _build_password_reset_html(body.name, body.set_password_url)
    await provider.send(to=body.to, subject="Ordin — redefinição de senha", html=html)
    return {"sent": True}


@app.get("/health")
def health():
    return {"service": "notification", "status": "ok"}
