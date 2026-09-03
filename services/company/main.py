import base64
import hashlib
import json
import logging
import os
import re
import secrets
from datetime import datetime, timedelta

import bcrypt
import httpx
import pyotp
import redis as redis_lib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Enum,
    Integer,
    String,
    UniqueConstraint,
    delete,
    func,
    or_,
    select,
    update,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from audit import emit_audit
from auth import TokenPayload, get_current_user, get_setup_mfa_user
from config import get_cors_origins, require_env
from domain.address import UF_VALUES, is_valid_cep, is_valid_uf, normalize_cep
from domain.cnpj import is_valid_cnpj, normalize_cnpj
from domain.cpf import is_valid_cpf, normalize_cpf
from infrastructure.cep_lookup import lookup_cep
from infrastructure.cnpj_lookup import lookup_cnpj
from infrastructure.contract_storage import (
    ensure_bucket,
    presigned_download_url,
    upload_contract,
)
from infrastructure.video_storage import (
    delete_object as delete_video_object,
)
from infrastructure.video_storage import (
    ensure_bucket as ensure_video_bucket,
)
from infrastructure.video_storage import (
    presigned_download_url as presigned_video_url,
)
from infrastructure.video_storage import (
    upload_video,
)

DB_URL          = require_env("DB_URL")
INTERNAL_SECRET = require_env("INTERNAL_SECRET")
redis_client    = redis_lib.from_url(require_env("REDIS_URL"), decode_responses=True)

logger = logging.getLogger(__name__)

# ORD-087 — convite de usuário por e-mail
NOTIFICATION_SERVICE_URL = require_env("NOTIFICATION_SERVICE_URL")
ADMIN_BASE_URL           = os.getenv("ADMIN_BASE_URL", "http://localhost:3001")
INTERNAL_HEADERS         = {"X-Internal-Secret": INTERNAL_SECRET}
INVITE_TOKEN_TTL_HOURS   = 24
# ORD-097 — TTL próprio, mais curto que o convite: link de reset é de
# maior risco (alguém tentando entrar na conta agora) e a expectativa de
# uso é imediata, diferente do convite (pessoa pode abrir o e-mail depois).
PASSWORD_RESET_TTL_HOURS = 1
# ORD-097 — primeira vez que company-service chama auth-service (até aqui só
# a direção contrária existia); usado só pra revogar sessões após reset de senha.
AUTH_SERVICE_URL         = require_env("AUTH_SERVICE_URL")
FORGOT_PASSWORD_RATE_MAX = 3
FORGOT_PASSWORD_RATE_TTL = 15 * 60


def require_internal(x_internal_secret: str = Header(default="")) -> None:
    if not secrets.compare_digest(x_internal_secret, INTERNAL_SECRET):
        raise HTTPException(403, detail="Acesso interno não autorizado")


engine = create_async_engine(DB_URL.replace("mysql+pymysql://", "mysql+aiomysql://"), pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


# ── Credential encryption helpers ─────────────────────────────────────────────

def _encryption_key() -> bytes | None:
    key_hex = os.getenv("CREDENTIAL_ENCRYPTION_KEY", "").strip()
    return bytes.fromhex(key_hex) if len(key_hex) == 64 else None


def encrypt_field(plaintext: str) -> str:
    key = _encryption_key()
    if key is None:
        return plaintext  # plaintext only in local dev (no key configured)
    nonce = os.urandom(12)
    ct = AESGCM(key).encrypt(nonce, plaintext.encode(), None)
    return "enc:" + base64.b64encode(nonce + ct).decode()


def decrypt_field(stored: str) -> str:
    if stored.startswith("arn:aws:secretsmanager:"):
        raise NotImplementedError("Secrets Manager — Fase 2")
    if stored.startswith("enc:"):
        key = _encryption_key()
        if key is None:
            raise RuntimeError("CREDENTIAL_ENCRYPTION_KEY não configurada")
        raw = base64.b64decode(stored[4:])
        nonce, ct = raw[:12], raw[12:]
        return AESGCM(key).decrypt(nonce, ct, None).decode()
    return stored  # plaintext — dev local


# ── Models ────────────────────────────────────────────────────────────────────

class Base(DeclarativeBase): pass


class Company(Base):
    __tablename__ = "companies"
    id                      = Column(Integer, primary_key=True)
    name                    = Column(String(120))
    document                = Column(String(20))
    pin_hash                = Column(String(128), nullable=False)
    plan                    = Column(String(20), default="free")
    payment_provider        = Column(String(20), default="mock")
    active                  = Column(Boolean, default=True)
    created_at              = Column(DateTime, default=datetime.utcnow)
    visual_theme            = Column(String(32), nullable=False, default="ordin")
    visual_mode             = Column(String(8),  nullable=False, default="light")
    # ORD-116 — "horizontal" (padrão, faixa de pills no topo) ou "vertical"
    # (sidebar) pro menu de categorias do totem, útil pra empresas com
    # muitas categorias.
    catalog_menu_layout     = Column(String(10), nullable=False, default="horizontal")
    legal_name              = Column(String(160), nullable=True)
    state_registration      = Column(String(20), nullable=True)
    municipal_registration  = Column(String(20), nullable=True)
    tax_regime              = Column(String(20), nullable=True)
    company_size            = Column(String(10), nullable=True)
    cnae_code                = Column(String(10), nullable=True)
    cadastral_status         = Column(String(20), nullable=True)
    zip_code                 = Column(String(9),  nullable=True)
    street                   = Column(String(160), nullable=True)
    address_number           = Column(String(20), nullable=True)
    complement               = Column(String(80), nullable=True)
    neighborhood             = Column(String(80), nullable=True)
    city                     = Column(String(255), nullable=True)
    state                    = Column(Enum(*UF_VALUES, name="uf_enum"), nullable=False)
    country                  = Column(String(60), nullable=True, default="Brasil")
    contract_status          = Column(String(20), nullable=False, default="pendente")
    contract_sent_at         = Column(DateTime, nullable=True)
    contract_signed_at       = Column(DateTime, nullable=True)
    contract_document_url    = Column(String(255), nullable=True)
    # ORD-088: disabled|optional|required — ver VALID_MFA_POLICIES.
    mfa_policy                = Column(String(10), nullable=False, default="disabled")
    # ORD-093: True só pra empresa interna "Ordin — Plataforma" (única linha).
    # Nunca aparece em listagem/seletor voltado a empresa cliente.
    is_platform               = Column(Boolean, nullable=False, default=False)
    # ORD-108: quando True, o totem pergunta "Comer no local" ou "Para
    # levar" antes do checkout, e o pedido carrega essa escolha.
    consumption_mode_enabled  = Column(Boolean, nullable=False, default=False)
    # ORD-117: empresa de demonstração da plataforma (hoje só a Burger
    # House) — usado pra indicação visual interna (badge no superadmin),
    # sem consumidor público ainda.
    is_demo                   = Column(Boolean, nullable=False, default=False)
    # ORD-118: "por_item" (padrão, ticket unitário por item, retirada
    # individual) ou "retirada_unica" (produção centralizada, QR único por
    # pedido — modelo McDonald's/Burger King). String livre validada em
    # Python (VALID_FULFILLMENT_MODES), não Enum de banco — mesmo padrão do
    # catalog_menu_layout, deixa espaço pra outros modelos no futuro.
    fulfillment_mode          = Column(String(20), nullable=False, default="por_item")
    # ORD-119 — só usado quando fulfillment_mode="retirada_unica": minutos
    # até um pedido em preparo ser sinalizado como urgente (laranja na
    # metade do tempo, vermelho ao passar) no painel de retirada e na tela
    # operacional do admin. Configurável por empresa, default 10 min.
    prep_urgency_minutes      = Column(Integer, nullable=False, default=10)
    # ORD-158 — minutos sem toque no totem até limpar o carrinho e voltar
    # pra tela de boas-vindas. Era constante fixa (ver ORD-155), virou
    # configurável por empresa porque o ritmo ideal depende do perfil do
    # negócio. Default 5 min.
    inactivity_timeout_min    = Column(Integer, nullable=False, default=5)
    # ORD-158 — segundos finais desse período em que o totem mostra o
    # modal "Ainda está aí?" antes do reset (não é tempo adicional, é uma
    # janela dentro do próprio inactivity_timeout_min). Default 30s.
    inactivity_warn_sec       = Column(Integer, nullable=False, default=30)


class User(Base):
    __tablename__ = "users"
    id              = Column(Integer, primary_key=True)
    company_id      = Column(Integer)
    name            = Column(String(80))
    email           = Column(String(120))
    password_hash   = Column(String(128))
    role            = Column(String(20), default="cashier")
    active          = Column(Boolean, default=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    # ORD-088: segredo TOTP em base32, nulo até o usuário confirmar o setup.
    totp_secret      = Column(String(32), nullable=True)
    totp_enabled_at  = Column(DateTime, nullable=True)

    @property
    def pending_setup(self) -> bool:
        # ORD-087: usuário criado por convite ainda não definiu a própria
        # senha — password_hash fica nulo até ele completar o cadastro.
        return self.password_hash is None

    @property
    def mfa_enabled(self) -> bool:
        return self.totp_enabled_at is not None


class UserInviteToken(Base):
    # Token de convite (ORD-087) — mesmo desenho de RefreshToken no
    # auth-service: só o hash é persistido, nunca o token puro.
    __tablename__ = "user_invite_tokens"
    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, index=True)
    token_hash = Column(String(64), unique=True)
    expires_at = Column(DateTime)
    used_at    = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class UserBackupCode(Base):
    # Código de recuperação de MFA (ORD-088) — mesmo desenho de
    # UserInviteToken: só o hash é persistido, nunca o código puro.
    __tablename__ = "user_backup_codes"
    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, index=True)
    code_hash  = Column(String(64))
    used_at    = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class TrustedDevice(Base):
    # Dispositivo confiável (ORD-092) — mesmo desenho de UserBackupCode, só
    # o hash é persistido. expires_at é renovado (+7 dias) a cada uso
    # bem-sucedido (janela deslizante, ver _verify_trusted_device).
    __tablename__ = "trusted_devices"
    id            = Column(Integer, primary_key=True)
    user_id       = Column(Integer, index=True)
    token_hash    = Column(String(64), unique=True)
    device_label  = Column(String(200), nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)
    last_used_at  = Column(DateTime, nullable=True)
    expires_at    = Column(DateTime)
    revoked_at    = Column(DateTime, nullable=True)


class Terminal(Base):
    __tablename__ = "terminals"
    id                = Column(Integer, primary_key=True)
    company_id        = Column(Integer)
    label             = Column(String(80))
    terminal_code     = Column(String(20))
    tef_number        = Column(String(40))
    tef_serial        = Column(String(40))
    paygo_terminal_id = Column(String(40), nullable=True)
    mp_device_id      = Column(String(100), nullable=True)
    environment       = Column(String(10), default="sandbox")
    active            = Column(Boolean, default=True)
    created_at        = Column(DateTime, default=datetime.utcnow)
    last_heartbeat    = Column(DateTime, nullable=True)


class TotemVideo(Base):
    """Vídeo de modo espera (attract mode) do totem — ORD-115.
    video_key é a key do objeto no bucket, não uma URL (mesmo padrão de
    Company.contract_document_url e Product.image_url no catalog-service)."""
    __tablename__ = "totem_videos"
    id         = Column(Integer, primary_key=True)
    company_id = Column(Integer, nullable=False, index=True)
    name       = Column(String(100), nullable=False)
    video_key  = Column(String(500), nullable=False)
    active     = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)  # ordem de exibição na playlist — mesmo padrão de Product.sort_order (catalog-service)
    created_at = Column(DateTime, default=datetime.utcnow)


class CompanyPaymentConfig(Base):
    __tablename__ = "company_payment_configs"
    id           = Column(Integer, primary_key=True)
    company_id   = Column(Integer, nullable=False, index=True)
    provider     = Column(String(20), nullable=False)
    environment  = Column(String(10), nullable=False)
    api_key         = Column(String(500), nullable=True)
    api_secret      = Column(String(500), nullable=True)
    webhook_secret  = Column(String(500), nullable=True)
    extra_config = Column(JSON, nullable=True)
    active       = Column(Boolean, default=True)
    created_at   = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (
        UniqueConstraint("company_id", "provider", "environment", name="uq_company_provider_env"),
    )


class CompanyContact(Base):
    __tablename__ = "company_contacts"
    id           = Column(Integer, primary_key=True)
    company_id   = Column(Integer, nullable=False, index=True)
    contact_type = Column(String(20), nullable=False)
    name_enc     = Column(String(500), nullable=False)
    role_title   = Column(String(80), nullable=True)
    email_enc    = Column(String(500), nullable=False)
    phone_enc    = Column(String(500), nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)


class CompanyLegalRepresentative(Base):
    __tablename__ = "company_legal_representatives"
    id          = Column(Integer, primary_key=True)
    company_id  = Column(Integer, nullable=False, unique=True)
    name_enc    = Column(String(500), nullable=False)
    cpf_enc     = Column(String(500), nullable=False)
    role_title  = Column(String(80), nullable=True)
    email_enc   = Column(String(500), nullable=False)
    phone_enc   = Column(String(500), nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)


async def get_db():
    async with AsyncSessionLocal() as db:
        yield db


# ── Access control ────────────────────────────────────────────────────────────

def _require_platform_admin(u: TokenPayload) -> None:
    # superadmin e admin são usuários da própria Ordin (não de empresa
    # cliente) — hoje equivalentes em capacidade; ver docs/ARQUITETURA.md §1.2.
    if u.role not in ("superadmin", "admin"):
        raise HTTPException(403, "Acesso restrito a administração da plataforma")


def _require_company_admin(u: TokenPayload, company_id: int) -> None:
    # admin e superadmin são equivalentes em capacidade (ver
    # _require_platform_admin acima) — antes só superadmin tinha bypass
    # aqui, então "admin" tomava 403 em qualquer endpoint de gestão de
    # empresa, apesar de já ter acesso de plataforma nos endpoints
    # gateados por _require_platform_admin.
    if u.role in ("superadmin", "admin"):
        return
    if u.company_id != company_id or u.role not in ("owner", "manager"):
        raise HTTPException(403, "Acesso negado")


# ── Schemas ───────────────────────────────────────────────────────────────────

class CompanyOut(BaseModel):
    id: int
    name: str
    document: str | None = None
    plan: str
    payment_provider: str | None = "mock"
    active: bool
    created_at: datetime | None = None
    visual_theme: str = "ordin"
    visual_mode: str = "light"
    catalog_menu_layout: str = "horizontal"
    is_demo: bool = False
    legal_name: str | None = None
    state_registration: str | None = None
    municipal_registration: str | None = None
    tax_regime: str | None = None
    company_size: str | None = None
    cnae_code: str | None = None
    cadastral_status: str | None = None
    zip_code: str | None = None
    street: str | None = None
    address_number: str | None = None
    complement: str | None = None
    neighborhood: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    contract_status: str = "pendente"
    contract_sent_at: datetime | None = None
    contract_signed_at: datetime | None = None
    contract_document_url: str | None = None
    mfa_policy: str = "disabled"
    consumption_mode_enabled: bool = False
    fulfillment_mode: str = "por_item"
    prep_urgency_minutes: int = 10
    inactivity_timeout_min: int = 5
    inactivity_warn_sec: int = 30
    model_config = {"from_attributes": True}


def _validate_zip_code_value(v: str | None) -> str | None:
    if v is None or not v.strip():
        return v
    normalized = normalize_cep(v)
    if not is_valid_cep(normalized):
        raise ValueError("CEP inválido — deve conter 8 dígitos")
    return normalized  # banco armazena sempre sem máscara


class CompanyIn(BaseModel):
    name: str
    document: str | None = None
    plan: str = "free"
    payment_provider: str = "mock"
    legal_name: str | None = None
    state_registration: str | None = None
    municipal_registration: str | None = None
    tax_regime: str | None = None
    company_size: str | None = None
    cnae_code: str | None = None
    zip_code: str | None = None
    street: str | None = None
    address_number: str | None = None
    complement: str | None = None
    neighborhood: str | None = None
    city: str | None = None
    state: str

    @field_validator("document")
    @classmethod
    def validate_document(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return v
        normalized = normalize_cnpj(v)
        if not is_valid_cnpj(normalized):
            raise ValueError("CNPJ inválido (formato ou dígito verificador)")
        return normalized  # banco armazena sempre sem máscara

    @field_validator("zip_code")
    @classmethod
    def validate_zip_code(cls, v: str | None) -> str | None:
        return _validate_zip_code_value(v)

    @field_validator("state")
    @classmethod
    def validate_state(cls, v: str) -> str:
        normalized = v.strip().upper()
        if not is_valid_uf(normalized):
            raise ValueError("UF inválida — deve ser uma sigla de estado brasileiro")
        return normalized


class CompanyUpdate(BaseModel):
    # document NÃO faz parte deste schema — é imutável após a criação (ORD-061).
    # Trocar o CNPJ reabre a mesma janela de risco que a criação trata revalidando
    # na Receita a cada submit; tratado como recadastro, não como edição.
    name: str | None = None
    plan: str | None = None
    payment_provider: str | None = None
    legal_name: str | None = None
    state_registration: str | None = None
    municipal_registration: str | None = None
    tax_regime: str | None = None
    company_size: str | None = None
    cnae_code: str | None = None
    zip_code: str | None = None
    street: str | None = None
    address_number: str | None = None
    complement: str | None = None
    neighborhood: str | None = None
    city: str | None = None
    state: str | None = None

    @field_validator("zip_code")
    @classmethod
    def validate_zip_code(cls, v: str | None) -> str | None:
        return _validate_zip_code_value(v)

    @field_validator("state")
    @classmethod
    def validate_state(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return v
        normalized = v.strip().upper()
        if not is_valid_uf(normalized):
            raise ValueError("UF inválida — deve ser uma sigla de estado brasileiro")
        return normalized


class CompanyListOut(BaseModel):
    companies: list[CompanyOut]
    total: int
    summary: dict[str, int]


class CompanyCreateOut(BaseModel):
    company: CompanyOut
    pin: str


class CnpjLookupOut(BaseModel):
    found: bool
    reason: str | None = None
    cadastral_status: str = "NAO_VERIFICADA"
    legal_name: str | None = None
    trade_name: str | None = None
    zip_code: str | None = None
    street: str | None = None
    address_number: str | None = None
    complement: str | None = None
    neighborhood: str | None = None
    city: str | None = None
    state: str | None = None
    model_config = {"from_attributes": True}


class CepLookupOut(BaseModel):
    found: bool
    reason: str | None = None
    street: str | None = None
    neighborhood: str | None = None
    city: str | None = None
    state: str | None = None
    model_config = {"from_attributes": True}


class TerminalOut(BaseModel):
    id: int
    label: str
    terminal_code: str | None = None
    tef_number: str | None = None
    tef_serial: str | None = None
    paygo_terminal_id: str | None = None
    mp_device_id: str | None = None
    environment: str | None = "sandbox"
    active: bool = True
    last_heartbeat: datetime | None = None
    model_config = {"from_attributes": True}


class TerminalIn(BaseModel):
    label: str
    terminal_code: str | None = None
    tef_number: str | None = None
    tef_serial: str | None = None
    paygo_terminal_id: str | None = None
    mp_device_id: str | None = None
    environment: str = "sandbox"


class TerminalUpdate(BaseModel):
    label: str | None = None
    tef_number: str | None = None
    tef_serial: str | None = None
    paygo_terminal_id: str | None = None
    mp_device_id: str | None = None
    environment: str | None = None
    active: bool | None = None


class TerminalListOut(BaseModel):
    terminals: list[TerminalOut]
    total: int


class UserOut(BaseModel):
    id: int
    company_id: int
    name: str
    email: str
    role: str
    active: bool
    pending_setup: bool
    mfa_enabled: bool
    created_at: datetime | None = None
    # ORD-095: calculado (TrustedDevice não é atributo de User) — preenchido
    # manualmente em list_users, nunca vem de from_attributes.
    has_trusted_device: bool = False
    model_config = {"from_attributes": True}


class UserIn(BaseModel):
    # ORD-087: sem campo senha — o usuário convidado define a própria senha
    # pelo link recebido por e-mail (ver POST /users/complete-registration).
    # ORD-093: role validado — antes disso, nada impedia (fora da UI) criar
    # um usuário com role="superadmin" direto numa empresa cliente.
    name: str
    email: str
    role: str = Field("cashier", pattern="^(owner|manager|cashier)$")


class UserUpdate(BaseModel):
    name: str | None = None
    role: str | None = Field(None, pattern="^(owner|manager|cashier)$")
    active: bool | None = None


class PlatformUserIn(BaseModel):
    # ORD-093: espelha UserIn, mas só aceita papéis de plataforma.
    name: str
    email: str
    role: str = Field(..., pattern="^(superadmin|admin)$")


class PlatformUserUpdate(BaseModel):
    name: str | None = None
    role: str | None = Field(None, pattern="^(superadmin|admin)$")
    active: bool | None = None


class UserListOut(BaseModel):
    users: list[UserOut]
    total: int


class RegeneratePinOut(BaseModel):
    pin: str


VALID_THEMES = {"ordin", "mc", "bk"}
VALID_MODES  = {"light", "dark"}
VALID_MENU_LAYOUTS = {"horizontal", "vertical"}
VALID_MFA_POLICIES = {"disabled", "optional", "required"}
VALID_FULFILLMENT_MODES = {"por_item", "retirada_unica"}


class AppearanceIn(BaseModel):
    theme: str
    mode: str
    # ORD-116 — opcional com default pra não quebrar chamadas antigas do
    # frontend durante o deploy (rollout do admin pode ficar um pouco
    # defasado do company-service).
    menu_layout: str = "horizontal"
    # ORD-158 — mesmo motivo de default dos campos acima. inactivity_warn_sec
    # precisa ser menor que inactivity_timeout_min*60 (validado no endpoint).
    inactivity_timeout_min: int = 5
    inactivity_warn_sec: int = 30


class BehaviorIn(BaseModel):
    consumption_mode_enabled: bool
    # ORD-118 — opcional com default pra não quebrar chamadas antigas do
    # frontend durante o deploy (mesmo motivo do menu_layout no ORD-116).
    fulfillment_mode: str = "por_item"
    # ORD-119 — só tem efeito com fulfillment_mode="retirada_unica"; mesmo
    # motivo de default pros outros campos opcionais desta classe.
    prep_urgency_minutes: int = 10


class SecurityIn(BaseModel):
    mfa_policy: str


class TotemVideoOut(BaseModel):
    id: int
    name: str
    active: bool
    video_url: str  # URL assinada, gerada sob demanda — não é o video_key guardado no banco


class TotemVideoListOut(BaseModel):
    videos: list[TotemVideoOut]


class TotemVideoUpdateIn(BaseModel):
    name: str | None = Field(None, max_length=100)
    active: bool | None = None


class TotemVideoReorderIn(BaseModel):
    video_ids: list[int]


class MfaStatusOut(BaseModel):
    mfa_enabled: bool
    mfa_policy: str


class MfaSetupOut(BaseModel):
    secret: str
    provisioning_uri: str


class MfaConfirmIn(BaseModel):
    code: str


class MfaConfirmOut(BaseModel):
    ok: bool
    backup_codes: list[str]


class MfaDisableIn(BaseModel):
    password: str


class TrustedDeviceOut(BaseModel):
    id: int
    device_label: str | None = None
    created_at: datetime | None = None
    last_used_at: datetime | None = None
    expires_at: datetime
    model_config = {"from_attributes": True}


class TrustedDeviceListOut(BaseModel):
    devices: list[TrustedDeviceOut]


class PaymentConfigIn(BaseModel):
    provider: str
    environment: str
    api_key: str | None = None
    api_secret: str | None = None
    webhook_secret: str | None = None
    extra_config: dict | None = None


class PaymentConfigOut(BaseModel):
    id: int
    provider: str
    environment: str
    api_key: str = "***"
    api_secret: str = "***"
    webhook_secret: str = "***"
    extra_config: dict | None = None
    active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class PaymentConfigListOut(BaseModel):
    configs: list[PaymentConfigOut]


VALID_CONTACT_TYPES = {"comercial", "financeiro", "tecnico"}


class ContactIn(BaseModel):
    contact_type: str
    name: str
    role_title: str | None = None
    email: str
    phone: str | None = None

    @field_validator("contact_type")
    @classmethod
    def validate_contact_type(cls, v: str) -> str:
        if v not in VALID_CONTACT_TYPES:
            raise ValueError(f"contact_type deve ser um de: {sorted(VALID_CONTACT_TYPES)}")
        return v


class ContactOut(BaseModel):
    id: int
    company_id: int
    contact_type: str
    name: str
    role_title: str | None = None
    email: str
    phone: str | None = None
    created_at: datetime


class ContactListOut(BaseModel):
    contacts: list[ContactOut]


class LegalRepresentativeIn(BaseModel):
    name: str
    cpf: str
    role_title: str | None = None
    email: str
    phone: str | None = None

    @field_validator("cpf")
    @classmethod
    def validate_cpf(cls, v: str) -> str:
        normalized = normalize_cpf(v)
        if not is_valid_cpf(normalized):
            raise ValueError("CPF inválido (formato ou dígito verificador)")
        return normalized  # banco armazena sempre sem máscara (antes de criptografar)


class LegalRepresentativeOut(BaseModel):
    id: int
    company_id: int
    name: str
    cpf: str
    role_title: str | None = None
    email: str
    phone: str | None = None
    created_at: datetime


class HealthOut(BaseModel):
    service: str
    status: str


# ── App ───────────────────────────────────────────────────────────────────────

_tags = [
    {"name": "Empresas",       "description": "Gestão de empresas (super admin)."},
    {"name": "Terminais",      "description": "Gestão de terminais por empresa (owner/manager)."},
    {"name": "Usuários",       "description": "Gestão de usuários por empresa (owner/manager)."},
    {"name": "Pagamento",      "description": "Configuração de provider TEF/PIX por empresa (owner/superadmin)."},
    {"name": "MFA",            "description": "Duplo fator de autenticação (TOTP) — setup pessoal e recuperação assistida."},
    {"name": "Usuários da Plataforma", "description": "CRUD separado pra superadmin/admin (equipe da Ordin, não de cliente) — ver ORD-093."},
]

app = FastAPI(
    title="Ordin — Company Service",
    description=(
        "Serviço de gerenciamento de empresas, usuários e terminais da plataforma Ordin.\n\n"
        "Mantém o cadastro multi-tenant: cada empresa possui seu próprio catálogo, terminais e usuários. "
        "O PIN da empresa é armazenado com **bcrypt rounds=12**. "
        "Credenciais TEF são criptografadas com **AES-256-GCM** antes de persistir.\n\n"
        "Os endpoints `/internal/*` são consumidos exclusivamente via rede interna "
        "(header `X-Internal-Secret`). Eles são bloqueados no Kong."
    ),
    version="1.1.0",
    openapi_tags=_tags,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Internal-Secret"],
    allow_credentials=True,
)


@app.on_event("startup")
async def _create_contracts_bucket_if_local() -> None:
    ensure_bucket()
    ensure_video_bucket()


# ── Endpoints internos — acessíveis apenas via VPC ────────────────────────────

_HEARTBEAT_TTL = timedelta(minutes=5)


@app.post("/internal/validate-pin", include_in_schema=False)
async def validate_pin(
    body: dict,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal),
):
    result = await db.execute(select(Company).filter_by(active=True))
    companies = result.scalars().all()
    co = next((c for c in companies if bcrypt.checkpw(body["pin"].encode(), c.pin_hash.encode())), None)
    if not co:
        raise HTTPException(401, "PIN inválido")
    avail_cutoff = datetime.utcnow() - _HEARTBEAT_TTL
    t_result = await db.execute(
        select(Terminal).where(
            Terminal.company_id == co.id,
            Terminal.active == True,
            or_(Terminal.last_heartbeat == None, Terminal.last_heartbeat < avail_cutoff),
        )
    )
    terminals = t_result.scalars().all()
    return {
        "company": {
            "id": co.id, "name": co.name, "plan": co.plan,
            "visual_theme": co.visual_theme, "visual_mode": co.visual_mode,
            "consumption_mode_enabled": co.consumption_mode_enabled,
            "catalog_menu_layout": co.catalog_menu_layout,
            "fulfillment_mode": co.fulfillment_mode,
            "prep_urgency_minutes": co.prep_urgency_minutes,
            "inactivity_timeout_min": co.inactivity_timeout_min,
            "inactivity_warn_sec": co.inactivity_warn_sec,
        },
        "terminals": [
            {"id": t.id, "label": t.label, "terminal_code": t.terminal_code, "tef_number": t.tef_number}
            for t in terminals
        ],
    }


@app.post("/internal/verify-pin", include_in_schema=False)
async def verify_pin(
    body: dict,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal),
):
    result = await db.execute(select(Company).filter_by(active=True))
    companies = result.scalars().all()
    co = next((c for c in companies if bcrypt.checkpw(body["pin"].encode(), c.pin_hash.encode())), None)
    if not co:
        raise HTTPException(401, "PIN inválido")
    t_result = await db.execute(
        select(Terminal).filter_by(id=body["terminal_id"], company_id=co.id, active=True)
    )
    t = t_result.scalars().first()
    if not t:
        raise HTTPException(404, "Terminal não encontrado")

    cfg_result = await db.execute(
        select(CompanyPaymentConfig).filter_by(company_id=co.id, active=True)
    )
    cfg = cfg_result.scalars().first()

    return {
        "company": {
            "id": co.id, "name": co.name, "plan": co.plan,
            "visual_theme": co.visual_theme, "visual_mode": co.visual_mode,
            "consumption_mode_enabled": co.consumption_mode_enabled,
            "catalog_menu_layout": co.catalog_menu_layout,
            "fulfillment_mode": co.fulfillment_mode,
            "prep_urgency_minutes": co.prep_urgency_minutes,
            "inactivity_timeout_min": co.inactivity_timeout_min,
            "inactivity_warn_sec": co.inactivity_warn_sec,
        },
        "terminal": {
            "id": t.id, "label": t.label, "tef_number": t.tef_number,
            "payment_provider": cfg.provider if cfg else "mock",
        },
    }


@app.post("/internal/verify-credentials", include_in_schema=False)
async def verify_credentials(
    body: dict,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal),
):
    result = await db.execute(select(User).filter_by(email=body["email"], active=True))
    u = result.scalars().first()
    if not u:
        raise HTTPException(401)
    if not bcrypt.checkpw(body["password"].encode(), u.password_hash.encode()):
        raise HTTPException(401)
    # ORD-088: mfa_status calculado aqui (dono de User e Company) evita um
    # round-trip extra do auth-service só pra saber a política da empresa.
    if u.mfa_enabled:
        mfa_status = "verify"          # já tem TOTP — sempre desafiado, política à parte
    else:
        co = await db.get(Company, u.company_id)
        mfa_status = "setup_required" if co and co.mfa_policy == "required" else "none"
    return {
        "id": u.id, "company_id": u.company_id, "role": u.role, "name": u.name,
        "mfa_status": mfa_status,
    }


@app.get("/internal/terminals/{terminal_id}", include_in_schema=False)
async def internal_get_terminal(
    terminal_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal),
):
    """Retorna config do terminal + credenciais descriptografadas para o payment-service."""
    t_result = await db.execute(select(Terminal).filter_by(id=terminal_id, active=True))
    t = t_result.scalars().first()
    if not t:
        raise HTTPException(404, "Terminal não encontrado ou inativo")

    co = await db.get(Company, t.company_id)
    if not co or not co.active:
        raise HTTPException(404, "Empresa não encontrada")

    # Fonte de verdade: config ativa na tabela company_payment_configs
    cfg_result = await db.execute(
        select(CompanyPaymentConfig).filter_by(
            company_id=t.company_id,
            active=True,
        )
    )
    cfg = cfg_result.scalars().first()

    if cfg is None:
        # Sem config ativa → fallback mock (sem credenciais)
        return {
            "paygo_terminal_id": t.paygo_terminal_id,
            "mp_device_id":      t.mp_device_id,
            "payment_provider":  "mock",
            "environment":       t.environment or "sandbox",
            "config":            None,
        }

    config = {
        "api_key":      decrypt_field(cfg.api_key) if cfg.api_key else None,
        "api_secret":   decrypt_field(cfg.api_secret) if cfg.api_secret else None,
        "extra_config": cfg.extra_config or {},
    }

    return {
        "paygo_terminal_id": t.paygo_terminal_id,
        "mp_device_id":      t.mp_device_id,
        "payment_provider":  cfg.provider,
        "environment":       cfg.environment,
        "config":            config,
    }


@app.get("/internal/companies/{company_id}/payment-config", include_in_schema=False)
async def internal_get_payment_config(
    company_id: int,
    provider: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal),
):
    """Retorna o webhook_secret descriptografado da config ativa de um provider
    para uma empresa — usado pelo payment-service para validar assinatura de
    webhooks (ORD-131). Diferente de /internal/terminals/{id}: aqui não há
    terminal envolvido, o webhook chega identificado só pelo company_id na URL."""
    cfg_result = await db.execute(
        select(CompanyPaymentConfig).filter_by(
            company_id=company_id,
            provider=provider,
            active=True,
        )
    )
    cfg = cfg_result.scalars().first()
    if cfg is None:
        raise HTTPException(404, "Config não encontrada")

    return {
        "webhook_secret": decrypt_field(cfg.webhook_secret) if cfg.webhook_secret else None,
    }


# ── Empresas (super admin) ────────────────────────────────────────────────────

@app.get("/companies", response_model=CompanyListOut, tags=["Empresas"], summary="Listar empresas")
async def list_companies(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    q: str | None = Query(None, description="Busca em nome fantasia ou razão social"),
    document: str | None = Query(None, description="Prefixo de CNPJ (início), com ou sem máscara"),
    contract_status: str | None = Query(None, pattern="^(pendente|enviado|assinado)$"),
    date_from: str | None = Query(None, description="Data de cadastro inicial (>=)"),
    date_to: str | None = Query(None, description="Data de cadastro final (<=)"),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_platform_admin(current_user)
    # ORD-093: a empresa interna da plataforma nunca é uma opção de suporte —
    # exclusão incondicional, independe de quem está listando.
    base_filters = [Company.active == True, Company.is_platform == False]
    if q:
        like = f"%{q}%"
        base_filters.append(or_(Company.name.ilike(like), Company.legal_name.ilike(like)))
    if document:
        # Prefixo, não match exato — a listagem filtra progressivamente
        # conforme o usuário digita o CNPJ (a partir do 3º dígito no client).
        base_filters.append(Company.document.like(f"{normalize_cnpj(document)}%"))
    if date_from:
        base_filters.append(Company.created_at >= date_from)
    if date_to:
        # ORD-135 (mesmo bug do ORD-134 em list_payments): date_to é
        # "AAAA-MM-DD" — created_at <= date_to equivale a <= meia-noite
        # daquele dia, escondendo empresas cadastradas depois das 00:00.
        # Vira limite exclusivo no dia seguinte.
        try:
            date_to_exclusive = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
        except ValueError:
            raise HTTPException(400, "date_to deve estar no formato AAAA-MM-DD")
        base_filters.append(Company.created_at < date_to_exclusive)

    # filters = base_filters + contract_status, usado na lista/contagem
    # paginada. O resumo por status (summary, abaixo) usa só base_filters —
    # ignora o filtro de contract_status de propósito, pra sempre mostrar a
    # distribuição completa entre os status (mesmo padrão do ORD-078 em
    # list_payments/list_orders).
    filters = list(base_filters)
    if contract_status:
        filters.append(Company.contract_status == contract_status)

    total = (await db.execute(select(func.count()).select_from(Company).where(*filters))).scalar()
    result = await db.execute(
        select(Company).where(*filters).order_by(Company.created_at.desc()).offset(skip).limit(limit)
    )

    summary = {s: 0 for s in ("pendente", "enviado", "assinado")}
    summary_rows = await db.execute(
        select(Company.contract_status, func.count())
        .where(*base_filters)
        .group_by(Company.contract_status)
    )
    for row_status, row_count in summary_rows.all():
        if row_status in summary:
            summary[row_status] = row_count

    return {"companies": result.scalars().all(), "total": total, "summary": summary}


@app.post(
    "/companies",
    response_model=CompanyCreateOut,
    status_code=201,
    tags=["Empresas"],
    summary="Criar empresa",
)
async def create_company(
    body: CompanyIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_platform_admin(current_user)
    cadastral_status = "NAO_VERIFICADA"
    if body.document:
        # reconsulta server-side — nunca confia apenas no que o front enviou (janela lookup → submit)
        result = await lookup_cnpj(body.document)
        if result.found:
            if result.cadastral_status != "ATIVA":
                raise HTTPException(
                    422,
                    f"CNPJ com situação cadastral '{result.cadastral_status}' na Receita Federal — cadastro não pode prosseguir",
                )
            cadastral_status = "ATIVA"
        elif result.reason == "cnpj_not_found":
            raise HTTPException(422, "CNPJ não encontrado na Receita Federal")
        else:
            # reason == "lookup_unavailable" — pra CNPJ alfanumérico, lookup_cnpj()
            # já promove cadastral_status pra "ATIVA" (ORD-064, confia no DV local
            # validado contra vetores oficiais); pra numérico, continua "NAO_VERIFICADA".
            cadastral_status = result.cadastral_status
    pin = str(secrets.randbelow(900000) + 100000)
    co = Company(
        name=body.name,
        document=body.document,
        plan=body.plan,
        payment_provider=body.payment_provider,
        pin_hash=bcrypt.hashpw(pin.encode(), bcrypt.gensalt(12)).decode(),
        legal_name=body.legal_name,
        state_registration=body.state_registration,
        municipal_registration=body.municipal_registration,
        tax_regime=body.tax_regime,
        company_size=body.company_size,
        cnae_code=body.cnae_code,
        cadastral_status=cadastral_status,
        zip_code=body.zip_code,
        street=body.street,
        address_number=body.address_number,
        complement=body.complement,
        neighborhood=body.neighborhood,
        city=body.city,
        state=body.state,
    )
    db.add(co)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(422, "CNPJ já cadastrado para outra empresa")
    await db.refresh(co)
    return {"company": co, "pin": pin}


@app.get(
    "/companies/cnpj-lookup/{cnpj}",
    response_model=CnpjLookupOut,
    tags=["Empresas"],
    summary="Consultar CNPJ na Receita Federal",
)
async def cnpj_lookup(
    cnpj: str,
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_platform_admin(current_user)
    normalized = normalize_cnpj(cnpj)
    if not is_valid_cnpj(normalized):
        raise HTTPException(422, "CNPJ inválido (formato ou dígito verificador)")
    result = await lookup_cnpj(normalized)
    if not result.found and result.reason == "cnpj_not_found":
        raise HTTPException(404, "CNPJ não encontrado na Receita Federal")
    return result


@app.get(
    "/companies/cep-lookup/{cep}",
    response_model=CepLookupOut,
    tags=["Empresas"],
    summary="Consultar CEP",
)
async def cep_lookup(
    cep: str,
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_platform_admin(current_user)
    normalized = normalize_cep(cep)
    if not is_valid_cep(normalized):
        raise HTTPException(422, "CEP inválido — deve conter 8 dígitos")
    result = await lookup_cep(normalized)
    if not result.found and result.reason == "cep_not_found":
        raise HTTPException(404, "CEP não encontrado")
    return result


@app.get(
    "/companies/{company_id}",
    response_model=CompanyOut,
    tags=["Empresas"],
    summary="Detalhe da empresa",
)
async def get_company(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    if current_user.role != "superadmin" and current_user.company_id != company_id:
        raise HTTPException(403, "Acesso negado")
    co = await db.get(Company, company_id)
    if not co or not co.active:
        raise HTTPException(404, "Empresa não encontrada")
    return co


@app.put(
    "/companies/{company_id}",
    response_model=CompanyOut,
    tags=["Empresas"],
    summary="Editar empresa",
)
async def update_company(
    company_id: int,
    body: CompanyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_platform_admin(current_user)
    co = await db.get(Company, company_id)
    if not co or not co.active:
        raise HTTPException(404, "Empresa não encontrada")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(co, field, value)
    await db.commit()
    await db.refresh(co)
    return co


@app.delete(
    "/companies/{company_id}",
    status_code=204,
    tags=["Empresas"],
    summary="Desativar empresa",
)
async def delete_company(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_platform_admin(current_user)
    co = await db.get(Company, company_id)
    if not co or not co.active:
        raise HTTPException(404, "Empresa não encontrada")
    co.active = False
    await db.commit()


@app.patch(
    "/companies/{company_id}/appearance",
    tags=["Empresas"],
    summary="Atualizar tema visual do totem",
)
async def update_appearance(
    company_id: int,
    body: AppearanceIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    if body.theme not in VALID_THEMES:
        raise HTTPException(422, f"Tema inválido. Disponíveis: {sorted(VALID_THEMES)}")
    if body.mode not in VALID_MODES:
        raise HTTPException(422, "Modo inválido. Use 'light' ou 'dark'.")
    if body.menu_layout not in VALID_MENU_LAYOUTS:
        raise HTTPException(422, f"Menu inválido. Disponíveis: {sorted(VALID_MENU_LAYOUTS)}")
    # ORD-158
    if not (1 <= body.inactivity_timeout_min <= 30):
        raise HTTPException(422, "Tempo de inatividade deve estar entre 1 e 30 minutos")
    if not (5 <= body.inactivity_warn_sec <= 120):
        raise HTTPException(422, "Tempo de aviso deve estar entre 5 e 120 segundos")
    if body.inactivity_warn_sec >= body.inactivity_timeout_min * 60:
        raise HTTPException(422, "Tempo de aviso não pode ser maior que o tempo de inatividade")
    if current_user.company_id != company_id and current_user.role != "superadmin":
        raise HTTPException(403, "Acesso negado")
    co = await db.get(Company, company_id)
    if not co or not co.active:
        raise HTTPException(404, "Empresa não encontrada")
    co.visual_theme = body.theme
    co.visual_mode  = body.mode
    co.catalog_menu_layout = body.menu_layout
    co.inactivity_timeout_min = body.inactivity_timeout_min
    co.inactivity_warn_sec = body.inactivity_warn_sec
    await db.commit()
    return {
        "ok": True, "theme": body.theme, "mode": body.mode, "menu_layout": body.menu_layout,
        "inactivity_timeout_min": body.inactivity_timeout_min,
        "inactivity_warn_sec": body.inactivity_warn_sec,
    }


@app.patch(
    "/companies/{company_id}/behavior",
    tags=["Empresas"],
    summary="Atualizar comportamento do totem (ORD-108)",
)
async def update_behavior(
    company_id: int,
    body: BehaviorIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    if current_user.company_id != company_id and current_user.role != "superadmin":
        raise HTTPException(403, "Acesso negado")
    if body.fulfillment_mode not in VALID_FULFILLMENT_MODES:
        raise HTTPException(422, f"Modelo de atendimento inválido. Disponíveis: {sorted(VALID_FULFILLMENT_MODES)}")
    if body.prep_urgency_minutes < 1 or body.prep_urgency_minutes > 180:
        raise HTTPException(422, "Tempo de urgência do preparo deve estar entre 1 e 180 minutos")
    co = await db.get(Company, company_id)
    if not co or not co.active:
        raise HTTPException(404, "Empresa não encontrada")
    co.consumption_mode_enabled = body.consumption_mode_enabled
    co.fulfillment_mode = body.fulfillment_mode
    co.prep_urgency_minutes = body.prep_urgency_minutes
    await db.commit()
    return {
        "ok": True,
        "consumption_mode_enabled": body.consumption_mode_enabled,
        "fulfillment_mode": body.fulfillment_mode,
        "prep_urgency_minutes": body.prep_urgency_minutes,
    }


_VIDEO_CONTENT_TYPES = {"video/mp4": "mp4"}
_VIDEO_MAX_BYTES = 500 * 1024 * 1024  # 500 MB


async def _serialize_totem_video(v: TotemVideo) -> TotemVideoOut:
    return TotemVideoOut(
        id=v.id, name=v.name, active=v.active,
        video_url=presigned_video_url(v.video_key),
    )


@app.post(
    "/companies/{company_id}/totem-videos",
    response_model=TotemVideoOut,
    tags=["Empresas"],
    summary="Enviar vídeo de modo espera do totem (ORD-115)",
    responses={
        415: {"description": "Formato de arquivo não aceito (só MP4)"},
        413: {"description": "Arquivo maior que 500 MB"},
    },
)
async def upload_totem_video(
    company_id: int,
    name: str = Form(..., max_length=100),
    video: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    co = await db.get(Company, company_id)
    if not co or not co.active:
        raise HTTPException(404, "Empresa não encontrada")

    if video.content_type not in _VIDEO_CONTENT_TYPES:
        raise HTTPException(415, detail="Formato de arquivo não aceito — envie um vídeo MP4")

    content = await video.read()
    if len(content) > _VIDEO_MAX_BYTES:
        raise HTTPException(413, detail=f"Arquivo maior que {_VIDEO_MAX_BYTES // (1024 * 1024)} MB")

    count_result = await db.execute(
        select(func.count()).select_from(TotemVideo).filter_by(company_id=company_id)
    )
    next_sort_order = count_result.scalar_one()

    v = TotemVideo(company_id=company_id, name=name, video_key="", active=True, sort_order=next_sort_order)
    db.add(v)
    await db.flush()  # gera v.id sem commitar, pra montar a key antes de subir o arquivo

    v.video_key = upload_video(company_id, v.id, content)
    await db.commit(); await db.refresh(v)
    return await _serialize_totem_video(v)


@app.get(
    "/companies/{company_id}/totem-videos",
    response_model=TotemVideoListOut,
    tags=["Empresas"],
    summary="Listar vídeos de modo espera do totem, ativos e inativos (gestão)",
)
async def list_totem_videos(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    result = await db.execute(
        select(TotemVideo).filter_by(company_id=company_id)
        .order_by(TotemVideo.sort_order.asc(), TotemVideo.id.asc())
    )
    videos = result.scalars().all()
    return TotemVideoListOut(videos=[await _serialize_totem_video(v) for v in videos])


@app.get(
    "/companies/{company_id}/totem-videos/active",
    response_model=TotemVideoListOut,
    tags=["Empresas"],
    summary="Listar vídeos ativos de modo espera do totem (consumido pelo totem)",
)
async def list_active_totem_videos(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    # Kiosk também pode ler (é quem realmente consome este endpoint), além
    # de quem já tem acesso de gestão da empresa.
    if current_user.role != "kiosk":
        _require_company_admin(current_user, company_id)
    elif current_user.company_id != company_id:
        raise HTTPException(403, "Acesso negado")
    result = await db.execute(
        select(TotemVideo)
        .filter_by(company_id=company_id, active=True)
        .order_by(TotemVideo.sort_order.asc(), TotemVideo.id.asc())
    )
    videos = result.scalars().all()
    return TotemVideoListOut(videos=[await _serialize_totem_video(v) for v in videos])


@app.patch(
    "/companies/{company_id}/totem-videos/{video_id}",
    response_model=TotemVideoOut,
    tags=["Empresas"],
    summary="Renomear e/ou ativar/desativar vídeo de modo espera do totem",
)
async def update_totem_video(
    company_id: int,
    video_id: int,
    body: TotemVideoUpdateIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    result = await db.execute(select(TotemVideo).filter_by(id=video_id, company_id=company_id))
    v = result.scalars().first()
    if not v: raise HTTPException(404)
    if body.name is not None:
        v.name = body.name
    if body.active is not None:
        v.active = body.active
    await db.commit(); await db.refresh(v)
    return await _serialize_totem_video(v)


@app.put(
    "/companies/{company_id}/totem-videos/reorder",
    status_code=204,
    tags=["Empresas"],
    summary="Reordenar vídeos de modo espera do totem",
    responses={400: {"description": "algum video_id não pertence à empresa informada"}},
)
async def reorder_totem_videos(
    company_id: int,
    body: TotemVideoReorderIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """Rota registrada antes de /totem-videos/{video_id} de propósito: caso
    contrário o path param capturaria "reorder" como video_id — mesmo
    cuidado do /catalog/products/reorder no catalog-service."""
    _require_company_admin(current_user, company_id)
    result = await db.execute(select(TotemVideo.id).filter_by(company_id=company_id))
    valid_ids = set(result.scalars().all())
    if set(body.video_ids) != valid_ids:
        raise HTTPException(400, detail="video_ids não corresponde exatamente aos vídeos da empresa")
    for index, video_id in enumerate(body.video_ids):
        await db.execute(update(TotemVideo).where(TotemVideo.id == video_id).values(sort_order=index))
    await db.commit()


@app.delete(
    "/companies/{company_id}/totem-videos/{video_id}",
    tags=["Empresas"],
    summary="Excluir vídeo de modo espera do totem",
)
async def delete_totem_video(
    company_id: int,
    video_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    result = await db.execute(select(TotemVideo).filter_by(id=video_id, company_id=company_id))
    v = result.scalars().first()
    if not v: raise HTTPException(404)
    delete_video_object(v.video_key)
    await db.delete(v)
    await db.commit()
    return {"ok": True}


@app.put(
    "/companies/{company_id}/security",
    tags=["Empresas"],
    summary="Definir política de duplo fator (MFA) da empresa",
)
async def update_security(
    company_id: int,
    body: SecurityIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    if body.mfa_policy not in VALID_MFA_POLICIES:
        raise HTTPException(422, f"Política inválida. Disponíveis: {sorted(VALID_MFA_POLICIES)}")
    _require_company_admin(current_user, company_id)
    co = await db.get(Company, company_id)
    if not co or not co.active:
        raise HTTPException(404, "Empresa não encontrada")
    # ORD-096: duplo fator é obrigatório e permanente pra contas de
    # plataforma — checado por is_platform, não por id fixo (mesmo
    # princípio do ORD-093), pra nunca depender de qual id a empresa
    # interna acabou recebendo no auto-increment.
    if co.is_platform and body.mfa_policy != "required":
        raise HTTPException(409, "Duplo fator é obrigatório e permanente para contas da plataforma")
    co.mfa_policy = body.mfa_policy
    # ORD-095: desativar o 2FA da empresa não pode deixar usuário nenhum
    # com o próprio 2FA ainda configurado — cascata usando o mesmo
    # _clear_mfa dos resets individuais (limpa TOTP, códigos de backup e
    # revoga dispositivos confiáveis). Idempotente: reaplicar sobre uma
    # empresa já desativada não encontra ninguém com totp_enabled_at setado.
    if body.mfa_policy == "disabled":
        result = await db.execute(
            select(User).where(User.company_id == company_id, User.totp_enabled_at.isnot(None))
        )
        for u in result.scalars().all():
            await _clear_mfa(db, u)
    await db.commit()
    return {"ok": True, "mfa_policy": body.mfa_policy}


@app.post(
    "/companies/{company_id}/regenerate-pin",
    response_model=RegeneratePinOut,
    tags=["Empresas"],
    summary="Regenerar PIN da empresa",
)
async def regenerate_pin(
    company_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    if current_user.company_id != company_id and current_user.role != "superadmin":
        raise HTTPException(403, "Acesso negado")
    co = await db.get(Company, company_id)
    if not co or not co.active:
        raise HTTPException(404, "Empresa não encontrada")
    new_pin = str(secrets.randbelow(900000) + 100000)
    co.pin_hash = bcrypt.hashpw(new_pin.encode(), bcrypt.gensalt(12)).decode()
    await db.commit()
    emit_audit("pin_regenerated", request,
               actor=current_user.sub,
               actor_id=int(current_user.sub),
               company_id=current_user.company_id,
               result="success",
               detail={"company_id_alvo": company_id})
    return {"pin": new_pin}


# ── Terminais (owner/manager da empresa) ─────────────────────────────────────

@app.get(
    "/companies/{company_id}/terminals",
    response_model=TerminalListOut,
    tags=["Terminais"],
    summary="Listar terminais da empresa",
)
async def list_terminals(
    company_id: int,
    label: str | None = Query(None, min_length=1),
    environment: str | None = Query(None, pattern="^(sandbox|production)$"),
    status: str = Query("active", pattern="^(active|inactive|all)$"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    filters = [Terminal.company_id == company_id]
    if status == "active":
        filters.append(Terminal.active == True)
    elif status == "inactive":
        filters.append(Terminal.active == False)
    # status == "all": sem filtro de active
    if label:
        filters.append(Terminal.label.ilike(f"%{label}%"))
    if environment:
        filters.append(Terminal.environment == environment)
    total = (await db.execute(
        select(func.count()).select_from(Terminal).where(*filters)
    )).scalar()
    result = await db.execute(
        select(Terminal).where(*filters).offset(skip).limit(limit)
    )
    return {"terminals": result.scalars().all(), "total": total}


def _validate_mp_device_format(mp_device_id: str) -> None:
    # Formato exigido pela API de Orders do MP Point: "{tipo_terminal}__{serial}"
    # (ex.: "PAX_Q92__Q92-1734060436"), igual ao `id` de GET /terminals/v1/list.
    if "__" not in mp_device_id:
        raise HTTPException(400, "mp_device_id fora do formato esperado ({tipo_terminal}__{serial})")


async def _check_mp_device_conflict(
    db: AsyncSession, company_id: int, mp_device_id: str, exclude_terminal_id: int | None,
) -> None:
    q = select(Terminal).filter_by(company_id=company_id, mp_device_id=mp_device_id, active=True)
    if exclude_terminal_id is not None:
        q = q.where(Terminal.id != exclude_terminal_id)
    conflicting = (await db.execute(q)).scalars().first()
    if conflicting:
        raise HTTPException(
            409,
            f"Este terminal Point já está configurado em '{conflicting.label}'. "
            "Escolha outro ou desative o outro terminal primeiro.",
        )


@app.get(
    "/companies/{company_id}/mp-terminals",
    tags=["Terminais"],
    summary="Listar terminais Point da conta Mercado Pago da empresa (ORD-133)",
)
async def list_mp_terminals(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """Consulta GET /terminals/v1/list na conta MP da empresa e anota, pra
    cada device, se já está em uso por outro terminal ativo — usado pelo
    select de MP Device ID em Empresa > Terminais."""
    _require_company_admin(current_user, company_id)
    co = await db.get(Company, company_id)
    if not co or not co.active:
        raise HTTPException(404, "Empresa não encontrada")

    cfg_result = await db.execute(
        select(CompanyPaymentConfig).filter_by(company_id=company_id, provider="mercadopago", active=True)
    )
    cfg = cfg_result.scalars().first()
    if not cfg or not cfg.api_key:
        return {"configured": False, "terminals": []}

    access_token = decrypt_field(cfg.api_key)
    mp_error = HTTPException(
        502, "Não foi possível consultar os terminais do Mercado Pago. Tente novamente ou configure manualmente."
    )
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.mercadopago.com/terminals/v1/list",
                headers={"Authorization": f"Bearer {access_token}"},
            )
    except httpx.HTTPError:
        raise mp_error
    if resp.status_code != 200:
        raise mp_error
    mp_terminals = resp.json().get("data", {}).get("terminals", [])

    ids = [t["id"] for t in mp_terminals]
    used_result = await db.execute(
        select(Terminal).where(
            Terminal.company_id == company_id, Terminal.mp_device_id.in_(ids), Terminal.active == True,
        )
    )
    used_by = {t.mp_device_id: {"terminal_id": t.id, "label": t.label} for t in used_result.scalars().all()}

    return {
        "configured": True,
        "terminals": [
            {"id": t["id"], "operating_mode": t.get("operating_mode"), "in_use_by": used_by.get(t["id"])}
            for t in mp_terminals
        ],
    }


class MpOperatingModeIn(BaseModel):
    device_id: str


@app.patch(
    "/companies/{company_id}/mp-terminals/operating-mode",
    tags=["Terminais"],
    summary="Corrigir terminal Point para modo PDV (ORD-148)",
)
async def fix_mp_operating_mode(
    company_id: int,
    body: MpOperatingModeIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """PATCH /terminals/v1/setup no Mercado Pago pra forçar operating_mode=PDV
    no device informado. O terminal físico ainda precisa ser reiniciado pelo
    admin pra a mudança ter efeito de verdade — isso é responsabilidade da UI
    avisar, não deste endpoint."""
    _require_company_admin(current_user, company_id)
    co = await db.get(Company, company_id)
    if not co or not co.active:
        raise HTTPException(404, "Empresa não encontrada")

    cfg_result = await db.execute(
        select(CompanyPaymentConfig).filter_by(company_id=company_id, provider="mercadopago", active=True)
    )
    cfg = cfg_result.scalars().first()
    if not cfg or not cfg.api_key:
        raise HTTPException(502, "Mercado Pago não configurado para esta empresa.")

    access_token = decrypt_field(cfg.api_key)
    mp_error = HTTPException(
        502, "Não foi possível alterar o modo do terminal no Mercado Pago. Tente novamente ou configure manualmente."
    )
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.patch(
                "https://api.mercadopago.com/terminals/v1/setup",
                headers={"Authorization": f"Bearer {access_token}"},
                json={"terminals": [{"id": body.device_id, "operating_mode": "PDV"}]},
            )
    except httpx.HTTPError:
        raise mp_error
    if resp.status_code not in (200, 201):
        raise mp_error

    return {"ok": True}


@app.post(
    "/companies/{company_id}/terminals",
    response_model=TerminalOut,
    status_code=201,
    tags=["Terminais"],
    summary="Criar terminal",
)
async def create_terminal(
    company_id: int,
    body: TerminalIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    co = await db.get(Company, company_id)
    if not co or not co.active:
        raise HTTPException(404, "Empresa não encontrada")
    if body.mp_device_id:
        _validate_mp_device_format(body.mp_device_id)
        await _check_mp_device_conflict(db, company_id, body.mp_device_id, exclude_terminal_id=None)
    terminal_code = body.terminal_code or f"T{company_id}{secrets.token_hex(3).upper()}"
    t = Terminal(
        company_id=company_id,
        label=body.label,
        terminal_code=terminal_code,
        tef_number=body.tef_number,
        tef_serial=body.tef_serial,
        paygo_terminal_id=body.paygo_terminal_id,
        mp_device_id=body.mp_device_id,
        environment=body.environment,
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t


@app.put(
    "/companies/{company_id}/terminals/{terminal_id}",
    response_model=TerminalOut,
    tags=["Terminais"],
    summary="Editar terminal",
)
async def update_terminal(
    company_id: int,
    terminal_id: int,
    body: TerminalUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    result = await db.execute(
        select(Terminal).filter_by(id=terminal_id, company_id=company_id)
    )
    t = result.scalars().first()
    if not t:
        raise HTTPException(404, "Terminal não encontrado")
    if body.label is not None:
        t.label = body.label
    if body.tef_number is not None:
        t.tef_number = body.tef_number
    if body.tef_serial is not None:
        t.tef_serial = body.tef_serial
    if body.paygo_terminal_id is not None:
        t.paygo_terminal_id = body.paygo_terminal_id
    if "mp_device_id" in body.model_fields_set:
        if body.mp_device_id:
            _validate_mp_device_format(body.mp_device_id)
            await _check_mp_device_conflict(db, company_id, body.mp_device_id, exclude_terminal_id=terminal_id)
        t.mp_device_id = body.mp_device_id or None
    if body.environment is not None:
        t.environment = body.environment
    if body.active is not None:
        t.active = body.active
    await db.commit()
    await db.refresh(t)
    return t


@app.delete(
    "/companies/{company_id}/terminals/{terminal_id}",
    status_code=204,
    tags=["Terminais"],
    summary="Desativar terminal",
)
async def delete_terminal(
    company_id: int,
    terminal_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    result = await db.execute(
        select(Terminal).filter_by(id=terminal_id, company_id=company_id, active=True)
    )
    t = result.scalars().first()
    if not t:
        raise HTTPException(404, "Terminal não encontrado")
    t.active = False
    await db.commit()


@app.post(
    "/companies/{company_id}/terminals/{terminal_id}/heartbeat",
    status_code=204,
    tags=["Terminais"],
    summary="Heartbeat do terminal ativo (kiosk)",
)
async def terminal_heartbeat(
    company_id: int,
    terminal_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    if current_user.role != "kiosk" or current_user.terminal_id != terminal_id:
        raise HTTPException(403, "Apenas o kiosk vinculado a este terminal pode enviar heartbeat")
    result = await db.execute(select(Terminal).filter_by(id=terminal_id, company_id=company_id, active=True))
    t = result.scalars().first()
    if not t:
        raise HTTPException(404, "Terminal não encontrado")
    t.last_heartbeat = datetime.utcnow()
    await db.commit()


# ── Usuários (owner/manager da empresa) ──────────────────────────────────────

async def _issue_invite(db: AsyncSession, user: "User") -> None:
    """Gera um token de convite de uso único e tenta enviar o e-mail via
    notification-service. Nunca propaga erro — falha no envio (serviço fora
    do ar, timeout) não pode impedir a criação/reenvio do usuário, ver
    Riscos da história ORD-087."""
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    db.add(UserInviteToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=datetime.utcnow() + timedelta(hours=INVITE_TOKEN_TTL_HOURS),
    ))
    await db.commit()

    set_password_url = f"{ADMIN_BASE_URL}/set-password?token={raw_token}"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.post(
                f"{NOTIFICATION_SERVICE_URL}/internal/send-invite",
                json={
                    "to": user.email, "name": user.name, "role": user.role,
                    "set_password_url": set_password_url,
                },
                headers=INTERNAL_HEADERS,
            )
            r.raise_for_status()
    except Exception:
        logger.warning("Falha ao enviar convite pro usuário %s (id=%s)", user.email, user.id, exc_info=True)


# ── Recuperação de senha (ORD-097) ───────────────────────────────────────────

def check_forgot_password_rate_limit(ip: str, email: str, response: Response) -> None:
    # Mesmo padrão de check_rate_limit do auth-service (pin_attempts) —
    # protege contra enumeração de e-mail e spam de reset pra uma vítima.
    bk = f"pwreset_blocked:{ip}"
    ttl = redis_client.ttl(bk)
    if ttl > 0:
        response.headers["X-RateLimit-Blocked"] = "true"
        raise HTTPException(429, f"Bloqueado. Tente em {ttl // 60}min {ttl % 60}s.")
    rk = f"pwreset_attempts:{ip}:{hashlib.md5(email.encode()).hexdigest()}"
    attempts = redis_client.incr(rk)
    if attempts == 1:
        redis_client.expire(rk, FORGOT_PASSWORD_RATE_TTL)
    if attempts >= FORGOT_PASSWORD_RATE_MAX:
        redis_client.set(bk, "1", ex=FORGOT_PASSWORD_RATE_TTL)
        redis_client.delete(rk)
        raise HTTPException(429, f"Bloqueado por {FORGOT_PASSWORD_RATE_TTL // 60} minutos.")


async def _issue_password_reset(db: AsyncSession, user: "User") -> None:
    """Mesmo desenho de _issue_invite — token de uso único reaproveitado
    (UserInviteToken), e-mail com CTA/corpo diferente, TTL mais curto
    (PASSWORD_RESET_TTL_HOURS). Nunca propaga erro de envio, mesma
    tolerância do convite."""
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    db.add(UserInviteToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=datetime.utcnow() + timedelta(hours=PASSWORD_RESET_TTL_HOURS),
    ))
    await db.commit()

    set_password_url = f"{ADMIN_BASE_URL}/set-password?token={raw_token}"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.post(
                f"{NOTIFICATION_SERVICE_URL}/internal/send-password-reset",
                json={"to": user.email, "name": user.name, "set_password_url": set_password_url},
                headers=INTERNAL_HEADERS,
            )
            r.raise_for_status()
    except Exception:
        logger.warning("Falha ao enviar redefinição de senha pro usuário %s (id=%s)", user.email, user.id, exc_info=True)


class ForgotPasswordIn(BaseModel):
    email: str


@app.post(
    "/users/forgot-password",
    tags=["Usuários"],
    summary="Pedir redefinição de senha por e-mail",
    description=(
        "Endpoint público, com rate limit. Sempre responde com sucesso "
        "genérico, exista ou não o e-mail — não revela enumeração de contas."
    ),
)
async def forgot_password(
    body: ForgotPasswordIn,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    ip = request.client.host if request.client else "unknown"
    check_forgot_password_rate_limit(ip, body.email.lower(), response)
    result = await db.execute(select(User).filter_by(email=body.email, active=True))
    u = result.scalars().first()
    if u:
        await _issue_password_reset(db, u)
    return {"sent": True}


@app.get(
    "/companies/{company_id}/users",
    response_model=UserListOut,
    tags=["Usuários"],
    summary="Listar usuários da empresa",
)
async def list_users(
    company_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    name: str | None = Query(None, min_length=1),
    email: str | None = Query(None, min_length=1),
    role: str | None = Query(None, pattern="^(owner|manager|cashier)$"),
    status: str = Query("active", pattern="^(active|inactive|all)$"),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    filters = [User.company_id == company_id]
    # ORD-093: exclusão incondicional — usuários de plataforma agora têm
    # tela própria (/platform-users), então a aba Usuários de uma empresa
    # cliente nunca mais mostra superadmin/admin, nem pra quem já é
    # superadmin/admin (antes do ORD-093, só owner/manager tinham essa
    # exclusão; a exceção pra admin/superadmin ficou obsoleta com a tela nova).
    filters.append(User.role.notin_(["superadmin", "admin"]))
    if status == "active":
        filters.append(User.active == True)
    elif status == "inactive":
        filters.append(User.active == False)
    if name:
        filters.append(User.name.ilike(f"%{name}%"))
    if email:
        filters.append(User.email.ilike(f"%{email}%"))
    if role:
        filters.append(User.role == role)

    total = (await db.execute(
        select(func.count()).select_from(User).where(*filters)
    )).scalar()
    result = await db.execute(
        select(User).where(*filters).offset(skip).limit(limit)
    )
    users = result.scalars().all()

    # ORD-095: em lote (1 query pra página inteira, não por linha) — indica
    # quem tem dispositivo confiável ativo, pro botão "Remover dispositivo
    # confiável" na tela de Usuários.
    trusted_ids: set[int] = set()
    user_ids = [u.id for u in users]
    if user_ids:
        td = await db.execute(
            select(TrustedDevice.user_id).distinct()
            .where(TrustedDevice.user_id.in_(user_ids), TrustedDevice.revoked_at.is_(None))
        )
        trusted_ids = {row[0] for row in td.all()}

    return {
        "users": [
            {**UserOut.model_validate(u).model_dump(), "has_trusted_device": u.id in trusted_ids}
            for u in users
        ],
        "total": total,
    }


@app.post(
    "/companies/{company_id}/users",
    response_model=UserOut,
    status_code=201,
    tags=["Usuários"],
    summary="Criar usuário",
)
async def create_user(
    company_id: int,
    body: UserIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    if body.role == "owner" and current_user.role == "manager":
        raise HTTPException(403, "Manager não pode criar usuários com role owner")
    co = await db.get(Company, company_id)
    if not co or not co.active:
        raise HTTPException(404, "Empresa não encontrada")
    existing = (await db.execute(select(User).filter_by(email=body.email))).scalars().first()
    if existing:
        raise HTTPException(409, "E-mail já cadastrado")
    u = User(
        company_id=company_id,
        name=body.name,
        email=body.email,
        password_hash=None,
        role=body.role,
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    await _issue_invite(db, u)
    return u


@app.put(
    "/companies/{company_id}/users/{user_id}",
    response_model=UserOut,
    tags=["Usuários"],
    summary="Editar usuário (role / ativo)",
)
async def update_user(
    company_id: int,
    user_id: int,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    result = await db.execute(select(User).filter_by(id=user_id, company_id=company_id))
    u = result.scalars().first()
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    if body.name is not None:
        u.name = body.name
    if body.role is not None:
        if str(u.id) == current_user.sub and u.role != body.role:
            raise HTTPException(403, "Owner não pode alterar o próprio role")
        if body.role == "owner" and current_user.role == "manager":
            raise HTTPException(403, "Manager não pode promover usuário a owner")
        u.role = body.role
    if body.active is not None:
        u.active = body.active
    await db.commit()
    await db.refresh(u)
    return u


@app.delete(
    "/companies/{company_id}/users/{user_id}",
    status_code=204,
    tags=["Usuários"],
    summary="Desativar usuário",
)
async def delete_user(
    company_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    result = await db.execute(
        select(User).filter_by(id=user_id, company_id=company_id, active=True)
    )
    u = result.scalars().first()
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    if str(u.id) == current_user.sub:
        raise HTTPException(403, "Não é possível desativar o próprio usuário")
    u.active = False
    await db.commit()


@app.post(
    "/companies/{company_id}/users/{user_id}/resend-invite",
    tags=["Usuários"],
    summary="Reenviar convite de definição de senha",
)
async def resend_invite(
    company_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    result = await db.execute(select(User).filter_by(id=user_id, company_id=company_id))
    u = result.scalars().first()
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    if not u.pending_setup:
        raise HTTPException(400, "Usuário já definiu a própria senha")
    # Invalida qualquer token ainda ativo antes de emitir o novo — evita
    # dois links do mesmo convite valendo ao mesmo tempo.
    await db.execute(
        update(UserInviteToken)
        .where(UserInviteToken.user_id == u.id, UserInviteToken.used_at.is_(None))
        .values(used_at=datetime.utcnow())
    )
    await db.commit()
    await _issue_invite(db, u)
    return {"sent": True}


@app.post(
    "/companies/{company_id}/users/{user_id}/send-password-reset",
    tags=["Usuários"],
    summary="Enviar redefinição de senha (disparo administrativo)",
)
async def send_password_reset_admin(
    company_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    # ORD-097: mesma autorização de resend_invite acima — mas funciona pra
    # qualquer usuário ativo, não só pending_setup (diferença chave em
    # relação a "reenviar convite").
    _require_company_admin(current_user, company_id)
    result = await db.execute(select(User).filter_by(id=user_id, company_id=company_id, active=True))
    u = result.scalars().first()
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    await db.execute(
        update(UserInviteToken)
        .where(UserInviteToken.user_id == u.id, UserInviteToken.used_at.is_(None))
        .values(used_at=datetime.utcnow())
    )
    await db.commit()
    await _issue_password_reset(db, u)
    return {"sent": True}


# ── Usuários da plataforma — ORD-093 ────────────────────────────────────────
# CRUD separado do cadastro de usuários de empresa cliente — superadmin/admin
# não aparecem mais na aba Usuários de nenhuma empresa (ver list_users acima).

async def _get_platform_company_id(db: AsyncSession) -> int:
    result = await db.execute(select(Company).filter_by(is_platform=True))
    co = result.scalars().first()
    if not co:
        raise HTTPException(500, "Empresa interna da plataforma não configurada")
    return co.id


def _require_can_grant_role(current_user: TokenPayload, role: str) -> None:
    # Ninguém cria/promove um perfil de plataforma com privilégio maior que
    # o próprio — admin só cria/promove outro admin, nunca superadmin.
    if role == "superadmin" and current_user.role != "superadmin":
        raise HTTPException(403, "Somente superadmin pode criar ou promover outro superadmin")


@app.get(
    "/platform-users",
    response_model=UserListOut,
    tags=["Usuários da Plataforma"],
    summary="Listar usuários da plataforma (superadmin/admin)",
)
async def list_platform_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    name: str | None = Query(None, min_length=1),
    email: str | None = Query(None, min_length=1),
    status: str = Query("active", pattern="^(active|inactive|all)$"),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_platform_admin(current_user)
    platform_company_id = await _get_platform_company_id(db)
    filters = [User.company_id == platform_company_id, User.role.in_(["superadmin", "admin"])]
    if status == "active":
        filters.append(User.active == True)
    elif status == "inactive":
        filters.append(User.active == False)
    if name:
        filters.append(User.name.ilike(f"%{name}%"))
    if email:
        filters.append(User.email.ilike(f"%{email}%"))

    total = (await db.execute(select(func.count()).select_from(User).where(*filters))).scalar()
    result = await db.execute(select(User).where(*filters).offset(skip).limit(limit))
    return {"users": result.scalars().all(), "total": total}


@app.post(
    "/platform-users",
    response_model=UserOut,
    status_code=201,
    tags=["Usuários da Plataforma"],
    summary="Convidar usuário da plataforma",
)
async def create_platform_user(
    body: PlatformUserIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_platform_admin(current_user)
    _require_can_grant_role(current_user, body.role)
    platform_company_id = await _get_platform_company_id(db)
    existing = (await db.execute(select(User).filter_by(email=body.email))).scalars().first()
    if existing:
        raise HTTPException(409, "E-mail já cadastrado")
    u = User(
        company_id=platform_company_id,
        name=body.name,
        email=body.email,
        password_hash=None,
        role=body.role,
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    await _issue_invite(db, u)
    return u


@app.put(
    "/platform-users/{user_id}",
    response_model=UserOut,
    tags=["Usuários da Plataforma"],
    summary="Editar usuário da plataforma (role / ativo)",
)
async def update_platform_user(
    user_id: int,
    body: PlatformUserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_platform_admin(current_user)
    platform_company_id = await _get_platform_company_id(db)
    result = await db.execute(select(User).filter_by(id=user_id, company_id=platform_company_id))
    u = result.scalars().first()
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    if body.name is not None:
        u.name = body.name
    if body.role is not None:
        _require_can_grant_role(current_user, body.role)
        u.role = body.role
    if body.active is not None:
        u.active = body.active
    await db.commit()
    await db.refresh(u)
    return u


@app.delete(
    "/platform-users/{user_id}",
    status_code=204,
    tags=["Usuários da Plataforma"],
    summary="Desativar usuário da plataforma",
)
async def delete_platform_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_platform_admin(current_user)
    platform_company_id = await _get_platform_company_id(db)
    result = await db.execute(
        select(User).filter_by(id=user_id, company_id=platform_company_id, active=True)
    )
    u = result.scalars().first()
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    if str(u.id) == current_user.sub:
        raise HTTPException(403, "Não é possível desativar o próprio usuário")
    u.active = False
    await db.commit()


@app.post(
    "/platform-users/{user_id}/resend-invite",
    tags=["Usuários da Plataforma"],
    summary="Reenviar convite de definição de senha",
)
async def resend_platform_invite(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_platform_admin(current_user)
    platform_company_id = await _get_platform_company_id(db)
    result = await db.execute(select(User).filter_by(id=user_id, company_id=platform_company_id))
    u = result.scalars().first()
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    if not u.pending_setup:
        raise HTTPException(400, "Usuário já definiu a própria senha")
    await db.execute(
        update(UserInviteToken)
        .where(UserInviteToken.user_id == u.id, UserInviteToken.used_at.is_(None))
        .values(used_at=datetime.utcnow())
    )
    await db.commit()
    await _issue_invite(db, u)
    return {"sent": True}


@app.post(
    "/platform-users/{user_id}/send-password-reset",
    tags=["Usuários da Plataforma"],
    summary="Enviar redefinição de senha (disparo administrativo)",
)
async def send_password_reset_platform(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_platform_admin(current_user)
    platform_company_id = await _get_platform_company_id(db)
    result = await db.execute(select(User).filter_by(id=user_id, company_id=platform_company_id, active=True))
    u = result.scalars().first()
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    await db.execute(
        update(UserInviteToken)
        .where(UserInviteToken.user_id == u.id, UserInviteToken.used_at.is_(None))
        .values(used_at=datetime.utcnow())
    )
    await db.commit()
    await _issue_password_reset(db, u)
    return {"sent": True}


@app.post(
    "/platform-users/{user_id}/mfa/reset",
    tags=["Usuários da Plataforma"],
    summary="Desativar o duplo fator de outro usuário da plataforma (recuperação assistida)",
)
async def reset_platform_user_mfa(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_platform_admin(current_user)
    platform_company_id = await _get_platform_company_id(db)
    result = await db.execute(select(User).filter_by(id=user_id, company_id=platform_company_id))
    u = result.scalars().first()
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    await _clear_mfa(db, u)
    await db.commit()
    return {"ok": True}


# ── Duplo fator (TOTP) — ORD-088 ────────────────────────────────────────────

_BACKUP_CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sem I/O/0/1


def _generate_backup_codes(n: int = 10) -> list[str]:
    return ["".join(secrets.choice(_BACKUP_CODE_CHARSET) for _ in range(8)) for _ in range(n)]


def _hash_backup_code(code: str) -> str:
    return hashlib.sha256(code.upper().encode()).hexdigest()


async def _clear_mfa(db: AsyncSession, user: "User") -> None:
    user.totp_secret = None
    user.totp_enabled_at = None
    await db.execute(delete(UserBackupCode).where(UserBackupCode.user_id == user.id))
    # ORD-092: sem 2FA, "dispositivo já passou pelo 2FA" não tem mais sentido —
    # revoga (soft) em vez de apagar, mantém histórico de auditoria.
    await db.execute(
        update(TrustedDevice)
        .where(TrustedDevice.user_id == user.id, TrustedDevice.revoked_at.is_(None))
        .values(revoked_at=datetime.utcnow())
    )


@app.get(
    "/users/me/mfa/status",
    response_model=MfaStatusOut,
    tags=["MFA"],
    summary="Status do próprio duplo fator e política de MFA da empresa",
)
async def mfa_status(
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    u = await db.get(User, int(current_user.sub))
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    co = await db.get(Company, u.company_id)
    return {"mfa_enabled": u.mfa_enabled, "mfa_policy": co.mfa_policy if co else "disabled"}


@app.post(
    "/users/me/mfa/setup",
    response_model=MfaSetupOut,
    tags=["MFA"],
    summary="Iniciar ativação de duplo fator (gera segredo pendente + QR)",
)
async def mfa_setup(
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_setup_mfa_user),
):
    u = await db.get(User, int(current_user.sub))
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    if u.mfa_enabled:
        raise HTTPException(409, "Duplo fator já está ativo — desative antes de reconfigurar")
    co = await db.get(Company, u.company_id)
    if not co or co.mfa_policy == "disabled":
        raise HTTPException(403, "Duplo fator não está disponível para esta empresa")
    secret = pyotp.random_base32()
    u.totp_secret = secret
    await db.commit()
    uri = pyotp.totp.TOTP(secret).provisioning_uri(name=u.email, issuer_name="Ordin")
    return {"secret": secret, "provisioning_uri": uri}


@app.post(
    "/users/me/mfa/confirm",
    response_model=MfaConfirmOut,
    tags=["MFA"],
    summary="Confirmar ativação de duplo fator com o primeiro código gerado",
)
async def mfa_confirm(
    body: MfaConfirmIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_setup_mfa_user),
):
    u = await db.get(User, int(current_user.sub))
    if not u or not u.totp_secret:
        raise HTTPException(404, "Nenhuma ativação de duplo fator pendente")
    if u.mfa_enabled:
        raise HTTPException(400, "Duplo fator já está confirmado")
    if not pyotp.totp.TOTP(u.totp_secret).verify(body.code, valid_window=1):
        raise HTTPException(400, "Código inválido")
    u.totp_enabled_at = datetime.utcnow()
    backup_codes = _generate_backup_codes()
    for code in backup_codes:
        db.add(UserBackupCode(user_id=u.id, code_hash=_hash_backup_code(code)))
    await db.commit()
    return {"ok": True, "backup_codes": backup_codes}


@app.post(
    "/users/me/mfa/disable",
    tags=["MFA"],
    summary="Desativar o próprio duplo fator (reautenticação por senha)",
)
async def mfa_disable(
    body: MfaDisableIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    u = await db.get(User, int(current_user.sub))
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    # ORD-096: contas de plataforma nunca se autodesativam o 2FA — só
    # recuperação assistida por outro superadmin/admin (/platform-users/{id}/mfa/reset),
    # que já força reconfiguração no próximo login por causa da política
    # permanente da empresa interna.
    if u.role in ("superadmin", "admin"):
        raise HTTPException(403, "Duplo fator é obrigatório para contas da plataforma e não pode ser desativado")
    if not u.password_hash or not bcrypt.checkpw(body.password.encode(), u.password_hash.encode()):
        raise HTTPException(401, "Senha incorreta")
    await _clear_mfa(db, u)
    await db.commit()
    return {"ok": True}


@app.post(
    "/companies/{company_id}/users/{user_id}/mfa/reset",
    tags=["MFA"],
    summary="Desativar o duplo fator de outro usuário da empresa (recuperação assistida)",
)
async def mfa_reset(
    company_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    result = await db.execute(select(User).filter_by(id=user_id, company_id=company_id))
    u = result.scalars().first()
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    await _clear_mfa(db, u)
    await db.commit()
    return {"ok": True}


@app.delete(
    "/companies/{company_id}/users/{user_id}/trusted-devices",
    tags=["MFA"],
    summary="Revogar todos os dispositivos confiáveis de um usuário da empresa",
)
async def revoke_user_trusted_devices(
    company_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    # ORD-095: ação mais estreita que mfa/reset acima — revoga só os
    # dispositivos confiáveis (ex: notebook perdido), sem apagar o segredo
    # TOTP nem os códigos de backup, então o usuário não precisa reconfigurar
    # o 2FA do zero, só provar identidade de novo no próximo login.
    _require_company_admin(current_user, company_id)
    result = await db.execute(select(User).filter_by(id=user_id, company_id=company_id))
    u = result.scalars().first()
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    await db.execute(
        update(TrustedDevice)
        .where(TrustedDevice.user_id == user_id, TrustedDevice.revoked_at.is_(None))
        .values(revoked_at=datetime.utcnow())
    )
    await db.commit()
    return {"ok": True}


@app.post("/internal/verify-totp", include_in_schema=False)
async def verify_totp(
    body: dict,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal),
):
    u = await db.get(User, body["user_id"])
    if not u or not u.mfa_enabled:
        raise HTTPException(401)
    code = body["code"].strip()
    if len(code) == 6 and code.isdigit():
        if pyotp.totp.TOTP(u.totp_secret).verify(code, valid_window=1):
            return {"ok": True, "used_backup_code": False}
        raise HTTPException(401)
    code_hash = _hash_backup_code(code)
    result = await db.execute(
        select(UserBackupCode).filter_by(user_id=u.id, code_hash=code_hash, used_at=None)
    )
    backup = result.scalars().first()
    if not backup:
        raise HTTPException(401)
    backup.used_at = datetime.utcnow()
    await db.commit()
    return {"ok": True, "used_backup_code": True}


# ── Dispositivo confiável — ORD-092 ──────────────────────────────────────────

TRUSTED_DEVICE_TTL_DAYS = 7


def _hash_device_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@app.post("/internal/trust-device", include_in_schema=False)
async def trust_device(
    body: dict,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal),
):
    raw_token = secrets.token_urlsafe(32)
    db.add(TrustedDevice(
        user_id=body["user_id"],
        token_hash=_hash_device_token(raw_token),
        device_label=(body.get("device_label") or "")[:200] or None,
        expires_at=datetime.utcnow() + timedelta(days=TRUSTED_DEVICE_TTL_DAYS),
    ))
    await db.commit()
    return {"device_token": raw_token}


@app.post("/internal/verify-trusted-device", include_in_schema=False)
async def verify_trusted_device(
    body: dict,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal),
):
    result = await db.execute(select(User).filter_by(email=body["email"], active=True))
    u = result.scalars().first()
    if not u:
        return {"trusted": False}
    token_hash = _hash_device_token(body["device_token"])
    result = await db.execute(
        select(TrustedDevice).filter_by(user_id=u.id, token_hash=token_hash, revoked_at=None)
    )
    device = result.scalars().first()
    if not device or device.expires_at < datetime.utcnow():
        return {"trusted": False}
    # Janela deslizante: cada uso bem-sucedido renova mais 7 dias a partir de agora.
    device.expires_at = datetime.utcnow() + timedelta(days=TRUSTED_DEVICE_TTL_DAYS)
    device.last_used_at = datetime.utcnow()
    await db.commit()
    return {"trusted": True}


@app.get(
    "/users/me/trusted-devices",
    response_model=TrustedDeviceListOut,
    tags=["MFA"],
    summary="Listar dispositivos confiáveis do próprio usuário",
)
async def list_trusted_devices(
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    result = await db.execute(
        select(TrustedDevice)
        .filter_by(user_id=int(current_user.sub), revoked_at=None)
        .order_by(TrustedDevice.last_used_at.desc())
    )
    return {"devices": result.scalars().all()}


@app.delete(
    "/users/me/trusted-devices/{device_id}",
    tags=["MFA"],
    summary="Revogar um dispositivo confiável do próprio usuário",
)
async def revoke_trusted_device(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    result = await db.execute(
        select(TrustedDevice).filter_by(id=device_id, user_id=int(current_user.sub), revoked_at=None)
    )
    device = result.scalars().first()
    if not device:
        raise HTTPException(404, "Dispositivo não encontrado")
    device.revoked_at = datetime.utcnow()
    await db.commit()
    return {"ok": True}


def _password_strength(password: str) -> str:
    # ORD-090: mesma regra replicada no frontend (SetPasswordScreen.tsx)
    # pro medidor em tempo real — mudança aqui precisa de mudança lá também.
    has_letter = bool(re.search(r"[A-Za-z]", password))
    has_digit = bool(re.search(r"\d", password))
    has_special = bool(re.search(r"[^A-Za-z0-9]", password))
    strong_chars = has_letter and has_digit and has_special
    if len(password) >= 12 and strong_chars:
        return "forte"
    if len(password) >= 8 and strong_chars:
        return "media"
    return "fraca"


class CompleteRegistrationIn(BaseModel):
    token: str
    password: str

    @field_validator("password")
    @classmethod
    def _password_min_strength(cls, v: str) -> str:
        if _password_strength(v) == "fraca":
            raise ValueError(
                "Senha fraca — use ao menos 8 caracteres com letra, número e caractere especial."
            )
        return v


def _invite_is_valid(invite: "UserInviteToken | None") -> bool:
    return bool(invite) and invite.used_at is None and invite.expires_at >= datetime.utcnow()


class InviteStatusOut(BaseModel):
    valid: bool


@app.get(
    "/users/invite-status",
    tags=["Usuários"],
    summary="Verificar se um link de convite ainda é válido, sem consumi-lo",
    description=(
        "Endpoint público — usado pela tela de definir senha para avisar de "
        "cara se o link já foi usado ou expirou, em vez de só falhar na "
        "submissão. Não revela qual dos dois motivos (usado vs. expirado vs. "
        "inexistente) é o caso, mesma cautela do complete-registration."
    ),
    response_model=InviteStatusOut,
)
async def invite_status(token: str, db: AsyncSession = Depends(get_db)):
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    result = await db.execute(select(UserInviteToken).filter_by(token_hash=token_hash))
    invite = result.scalars().first()
    return {"valid": _invite_is_valid(invite)}


@app.post(
    "/users/complete-registration",
    tags=["Usuários"],
    summary="Concluir cadastro definindo a senha (link do e-mail de convite)",
    description=(
        "Endpoint público — protegido pelo próprio token (uso único, expira em "
        f"{INVITE_TOKEN_TTL_HOURS}h, alta entropia), não por JWT. É a porta de "
        "entrada de um usuário que ainda não tem conta."
    ),
)
async def complete_registration(
    body: CompleteRegistrationIn,
    db: AsyncSession = Depends(get_db),
):
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    result = await db.execute(select(UserInviteToken).filter_by(token_hash=token_hash))
    invite = result.scalars().first()
    # Mensagem genérica em todo caso de falha — não revela se o token
    # chegou a existir, se já foi usado ou se só expirou.
    if not _invite_is_valid(invite):
        raise HTTPException(400, "Convite inválido ou expirado")
    user = await db.get(User, invite.user_id)
    if not user:
        raise HTTPException(400, "Convite inválido ou expirado")
    user.password_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt(12)).decode()
    invite.used_at = datetime.utcnow()
    # ORD-097: incondicional — roda tanto no primeiro acesso (convite)
    # quanto num reset de senha, já que complete_registration não
    # diferencia os dois casos. No primeiro acesso é um no-op inofensivo
    # (usuário nunca logou antes, sem dispositivo/sessão pra revogar).
    # Só limpa dispositivos confiáveis e sessões — nunca o TOTP/MFA em si
    # (ver Contexto do ORD-097: os dois fatores são propositalmente
    # independentes, resetar MFA junto abriria brecha via e-mail comprometido).
    await db.execute(
        update(TrustedDevice).where(TrustedDevice.user_id == user.id, TrustedDevice.revoked_at.is_(None))
        .values(revoked_at=datetime.utcnow())
    )
    await db.commit()
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(
                f"{AUTH_SERVICE_URL}/internal/revoke-sessions",
                json={"user_id": user.id},
                headers=INTERNAL_HEADERS,
            )
    except Exception:
        logger.warning("Falha ao revogar sessões do usuário %s (id=%s) após reset de senha", user.email, user.id, exc_info=True)
    return {"ok": True}


# ── Configurações de pagamento (owner/superadmin) ─────────────────────────────

@app.get(
    "/companies/{company_id}/payment-configs",
    response_model=PaymentConfigListOut,
    tags=["Pagamento"],
    summary="Listar configurações de pagamento",
)
async def list_payment_configs(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    result = await db.execute(
        select(CompanyPaymentConfig)
        .where(CompanyPaymentConfig.company_id == company_id)
        .order_by(CompanyPaymentConfig.active.desc(), CompanyPaymentConfig.created_at.desc())
    )
    configs = result.scalars().all()
    return {
        "configs": [
            {
                "id": c.id,
                "provider": c.provider,
                "environment": c.environment,
                "api_key": "***",
                "api_secret": "***",
                "webhook_secret": "***",
                "extra_config": c.extra_config,
                "active": c.active,
                "created_at": c.created_at,
            }
            for c in configs
        ]
    }


@app.post(
    "/companies/{company_id}/payment-configs",
    response_model=PaymentConfigOut,
    status_code=201,
    tags=["Pagamento"],
    summary="Criar configuração de pagamento",
)
async def create_payment_config(
    company_id: int,
    body: PaymentConfigIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    existing = (await db.execute(
        select(CompanyPaymentConfig).filter_by(
            company_id=company_id,
            provider=body.provider,
            environment=body.environment,
        )
    )).scalars().first()
    if existing:
        raise HTTPException(409, f"Já existe uma configuração de {body.provider} para o ambiente {body.environment}")

    cfg = CompanyPaymentConfig(
        company_id=company_id,
        provider=body.provider,
        environment=body.environment,
        api_key=encrypt_field(body.api_key) if body.api_key else None,
        api_secret=encrypt_field(body.api_secret) if body.api_secret else None,
        webhook_secret=encrypt_field(body.webhook_secret) if body.webhook_secret else None,
        extra_config=body.extra_config,
        active=False,
    )
    db.add(cfg)
    await db.commit()
    await db.refresh(cfg)
    return {
        "id": cfg.id,
        "provider": cfg.provider,
        "environment": cfg.environment,
        "api_key": "***",
        "api_secret": "***",
        "webhook_secret": "***",
        "extra_config": cfg.extra_config,
        "active": cfg.active,
        "created_at": cfg.created_at,
    }


@app.put(
    "/companies/{company_id}/payment-configs/{config_id}",
    response_model=PaymentConfigOut,
    tags=["Pagamento"],
    summary="Atualizar configuração de pagamento",
)
async def update_payment_config(
    company_id: int,
    config_id: int,
    body: PaymentConfigIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    result = await db.execute(
        select(CompanyPaymentConfig).filter_by(id=config_id, company_id=company_id, active=True)
    )
    cfg = result.scalars().first()
    if not cfg:
        raise HTTPException(404, "Config não encontrada")
    if body.api_key is not None:
        cfg.api_key = encrypt_field(body.api_key)
    if body.api_secret is not None:
        cfg.api_secret = encrypt_field(body.api_secret)
    if body.webhook_secret is not None:
        cfg.webhook_secret = encrypt_field(body.webhook_secret)
    if body.extra_config is not None:
        cfg.extra_config = body.extra_config
    await db.commit()
    await db.refresh(cfg)
    return {
        "id": cfg.id,
        "provider": cfg.provider,
        "environment": cfg.environment,
        "api_key": "***",
        "api_secret": "***",
        "webhook_secret": "***",
        "extra_config": cfg.extra_config,
        "active": cfg.active,
        "created_at": cfg.created_at,
    }


@app.delete(
    "/companies/{company_id}/payment-configs/{config_id}",
    status_code=204,
    tags=["Pagamento"],
    summary="Desativar configuração de pagamento",
)
async def delete_payment_config(
    company_id: int,
    config_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    result = await db.execute(
        select(CompanyPaymentConfig).filter_by(id=config_id, company_id=company_id, active=True)
    )
    cfg = result.scalars().first()
    if not cfg:
        raise HTTPException(404, "Config não encontrada")
    await db.delete(cfg)
    await db.commit()


@app.patch(
    "/companies/{company_id}/payment-configs/{config_id}/activate",
    tags=["Pagamento"],
    summary="Ativar uma configuração de pagamento (desativa as demais do mesmo provider)",
)
async def activate_payment_config(
    company_id: int,
    config_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    result = await db.execute(
        select(CompanyPaymentConfig).filter_by(id=config_id, company_id=company_id)
    )
    cfg = result.scalars().first()
    if not cfg:
        raise HTTPException(404, "Config não encontrada")

    # Desativa todas as outras configs da empresa (só uma pode estar ativa por vez)
    await db.execute(
        update(CompanyPaymentConfig)
        .where(
            CompanyPaymentConfig.company_id == company_id,
            CompanyPaymentConfig.id != config_id,
        )
        .values(active=False)
    )
    cfg.active = True
    await db.commit()
    return {"ok": True}


# ── Contatos e responsável legal (ORD-058) ────────────────────────────────────

def _require_owner_or_superadmin(u: TokenPayload, company_id: int) -> None:
    if u.role == "superadmin":
        return
    if u.company_id != company_id or u.role != "owner":
        raise HTTPException(403, "Acesso negado")


@app.post(
    "/companies/{company_id}/contacts",
    response_model=ContactOut,
    status_code=201,
    tags=["Empresas"],
    summary="Criar contato da empresa (comercial/financeiro/tecnico)",
)
async def create_contact(
    company_id: int,
    body: ContactIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    co = await db.get(Company, company_id)
    if not co or not co.active:
        raise HTTPException(404, "Empresa não encontrada")
    contact = CompanyContact(
        company_id=company_id,
        contact_type=body.contact_type,
        name_enc=encrypt_field(body.name),
        role_title=body.role_title,
        email_enc=encrypt_field(body.email),
        phone_enc=encrypt_field(body.phone) if body.phone else None,
    )
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    return ContactOut(
        id=contact.id, company_id=contact.company_id, contact_type=contact.contact_type,
        name=body.name, role_title=contact.role_title, email=body.email, phone=body.phone,
        created_at=contact.created_at,
    )


@app.get(
    "/companies/{company_id}/contacts",
    response_model=ContactListOut,
    tags=["Empresas"],
    summary="Listar contatos da empresa",
)
async def list_contacts(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    result = await db.execute(select(CompanyContact).filter_by(company_id=company_id))
    contacts = result.scalars().all()
    return {"contacts": [
        ContactOut(
            id=c.id, company_id=c.company_id, contact_type=c.contact_type,
            name=decrypt_field(c.name_enc), role_title=c.role_title,
            email=decrypt_field(c.email_enc), phone=decrypt_field(c.phone_enc) if c.phone_enc else None,
            created_at=c.created_at,
        ) for c in contacts
    ]}


@app.post(
    "/companies/{company_id}/legal-representative",
    response_model=LegalRepresentativeOut,
    tags=["Empresas"],
    summary="Cadastrar/atualizar responsável legal da empresa",
)
async def upsert_legal_representative(
    company_id: int,
    body: LegalRepresentativeIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_owner_or_superadmin(current_user, company_id)
    co = await db.get(Company, company_id)
    if not co or not co.active:
        raise HTTPException(404, "Empresa não encontrada")
    result = await db.execute(select(CompanyLegalRepresentative).filter_by(company_id=company_id))
    rep = result.scalars().first()
    if rep is None:
        rep = CompanyLegalRepresentative(company_id=company_id)
        db.add(rep)
    rep.name_enc = encrypt_field(body.name)
    rep.cpf_enc = encrypt_field(body.cpf)
    rep.role_title = body.role_title
    rep.email_enc = encrypt_field(body.email)
    rep.phone_enc = encrypt_field(body.phone) if body.phone else None
    await db.commit()
    await db.refresh(rep)
    return LegalRepresentativeOut(
        id=rep.id, company_id=rep.company_id, name=body.name, cpf=body.cpf,
        role_title=rep.role_title, email=body.email, phone=body.phone, created_at=rep.created_at,
    )


@app.get(
    "/companies/{company_id}/legal-representative",
    response_model=LegalRepresentativeOut,
    tags=["Empresas"],
    summary="Consultar responsável legal da empresa",
)
async def get_legal_representative(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_owner_or_superadmin(current_user, company_id)
    result = await db.execute(select(CompanyLegalRepresentative).filter_by(company_id=company_id))
    rep = result.scalars().first()
    if not rep:
        raise HTTPException(404, "Responsável legal não cadastrado")
    return LegalRepresentativeOut(
        id=rep.id, company_id=rep.company_id, name=decrypt_field(rep.name_enc), cpf=decrypt_field(rep.cpf_enc),
        role_title=rep.role_title, email=decrypt_field(rep.email_enc),
        phone=decrypt_field(rep.phone_enc) if rep.phone_enc else None, created_at=rep.created_at,
    )


# ── Status do contrato (ORD-059) ──────────────────────────────────────────────
# Envio por e-mail e assinatura (via gov.br) são processos externos e manuais.
# Este endpoint só rastreia o status; não envia e-mail nem integra assinatura eletrônica.

VALID_CONTRACT_STATUSES = {"enviado", "assinado"}
_CONTRACT_STATUS_RANK = {"pendente": 0, "enviado": 1, "assinado": 2}


@app.patch(
    "/companies/{company_id}/contract-status",
    response_model=CompanyOut,
    tags=["Empresas"],
    summary="Atualizar status do contrato (envio/assinatura externos, rastreio manual)",
)
async def update_contract_status(
    company_id: int,
    request: Request,
    status: str = Form(...),
    signed_document: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_platform_admin(current_user)
    if status not in VALID_CONTRACT_STATUSES:
        raise HTTPException(422, f"status deve ser um de: {sorted(VALID_CONTRACT_STATUSES)}")
    co = await db.get(Company, company_id)
    if not co or not co.active:
        raise HTTPException(404, "Empresa não encontrada")

    if _CONTRACT_STATUS_RANK[status] < _CONTRACT_STATUS_RANK[co.contract_status]:
        raise HTTPException(
            422, f"Não é possível regredir o status do contrato de '{co.contract_status}' para '{status}'"
        )

    if status == "assinado":
        if signed_document is None:
            raise HTTPException(422, "signed_document é obrigatório quando status='assinado'")
        content = await signed_document.read()
        key = upload_contract(company_id, signed_document.filename, content)
        co.contract_document_url = key  # é a key do objeto no bucket, não uma URL — ver contract_storage.py
        co.contract_signed_at = datetime.utcnow()
    elif status == "enviado":
        co.contract_sent_at = datetime.utcnow()

    status_anterior = co.contract_status
    co.contract_status = status
    await db.commit()
    await db.refresh(co)

    emit_audit("contract_status_changed", request,
               actor=current_user.sub,
               actor_id=int(current_user.sub),
               company_id=company_id,
               result="success",
               detail={"from": status_anterior, "to": status})
    return co


class ContractDocumentUrlOut(BaseModel):
    url: str


@app.get(
    "/companies/{company_id}/contract-document-url",
    response_model=ContractDocumentUrlOut,
    tags=["Empresas"],
    summary="URL assinada (temporária) pra baixar o contrato assinado",
)
async def get_contract_document_url(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_platform_admin(current_user)
    co = await db.get(Company, company_id)
    if not co or not co.active:
        raise HTTPException(404, "Empresa não encontrada")
    if not co.contract_document_url:
        raise HTTPException(404, "Nenhum contrato assinado foi enviado pra essa empresa")
    return {"url": presigned_download_url(co.contract_document_url)}


# ── Device pairing ───────────────────────────────────────────────────────────

class DeviceApproveIn(BaseModel):
    code: str
    terminal_id: int


@app.post(
    "/companies/{company_id}/devices/approve",
    tags=["Terminais"],
    summary="Aprovar pareamento de totem por código",
)
async def approve_device(
    company_id: int,
    body: DeviceApproveIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    if current_user.role != "superadmin" and current_user.company_id != company_id:
        raise HTTPException(403, "Acesso negado")

    key = f"device_challenge:{body.code.upper()}"
    raw = redis_client.get(key)
    if not raw:
        raise HTTPException(404, "Código inválido ou expirado")
    data = json.loads(raw)
    if data["status"] != "pending":
        raise HTTPException(422, "Código já utilizado")

    t_result = await db.execute(
        select(Terminal).where(Terminal.id == body.terminal_id, Terminal.company_id == company_id, Terminal.active == True)
    )
    t = t_result.scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Terminal não encontrado nesta empresa")

    co = await db.get(Company, company_id)
    if not co or not co.active:
        raise HTTPException(404, "Empresa não encontrada")

    cfg_result = await db.execute(
        select(CompanyPaymentConfig).filter_by(company_id=co.id, active=True)
    )
    cfg = cfg_result.scalars().first()

    redis_client.set(key, json.dumps({
        "status": "approved",
        "company":  {"id": co.id, "name": co.name, "plan": co.plan or "free",
                     "visual_theme": co.visual_theme, "visual_mode": co.visual_mode,
                     "consumption_mode_enabled": co.consumption_mode_enabled,
                     "catalog_menu_layout": co.catalog_menu_layout,
                     "fulfillment_mode": co.fulfillment_mode,
                     "prep_urgency_minutes": co.prep_urgency_minutes,
                     "inactivity_timeout_min": co.inactivity_timeout_min,
                     "inactivity_warn_sec": co.inactivity_warn_sec},
        "terminal": {
            "id": t.id, "label": t.label, "tef_number": t.tef_number,
            "payment_provider": cfg.provider if cfg else "mock",
        },
    }), ex=60)

    return {"ok": True}


class PanelApproveIn(BaseModel):
    code: str


@app.post(
    "/companies/{company_id}/panels/approve",
    tags=["Terminais"],
    summary="Aprovar pareamento de painel de retirada por código (ORD-119)",
)
async def approve_panel(
    company_id: int,
    body: PanelApproveIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """
    Mesmo mecanismo de código do pareamento de totem (approve_device acima),
    reaproveitando o /auth/device/challenge e /auth/device/status genéricos —
    só sem terminal (o painel não é um ponto de venda). O campo "kind":"panel"
    no payload do Redis é o que diferencia os dois fluxos pro auth-service na
    hora de emitir o JWT (role "painel" em vez de "kiosk", sem claim de
    terminal).
    """
    if current_user.role != "superadmin" and current_user.company_id != company_id:
        raise HTTPException(403, "Acesso negado")

    key = f"device_challenge:{body.code.upper()}"
    raw = redis_client.get(key)
    if not raw:
        raise HTTPException(404, "Código inválido ou expirado")
    data = json.loads(raw)
    if data["status"] != "pending":
        raise HTTPException(422, "Código já utilizado")

    co = await db.get(Company, company_id)
    if not co or not co.active:
        raise HTTPException(404, "Empresa não encontrada")

    redis_client.set(key, json.dumps({
        "status": "approved",
        "kind": "panel",
        "company":  {"id": co.id, "name": co.name, "plan": co.plan or "free",
                     "visual_theme": co.visual_theme, "visual_mode": co.visual_mode,
                     "consumption_mode_enabled": co.consumption_mode_enabled,
                     "catalog_menu_layout": co.catalog_menu_layout,
                     "fulfillment_mode": co.fulfillment_mode,
                     "prep_urgency_minutes": co.prep_urgency_minutes,
                     "inactivity_timeout_min": co.inactivity_timeout_min,
                     "inactivity_warn_sec": co.inactivity_warn_sec},
    }), ex=60)

    return {"ok": True}


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthOut, tags=["Empresas"], summary="Healthcheck")
def health():
    return {"service": "company", "status": "ok"}
