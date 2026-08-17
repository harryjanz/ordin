import base64
import hashlib
import json
import logging
import os
import re
import secrets
from datetime import datetime, timedelta
from typing import Optional

import httpx
import redis as redis_lib

import bcrypt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import FastAPI, HTTPException, Depends, Header, Query, Form, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, JSON, Enum,
    UniqueConstraint, select, func, or_, update, delete,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from config import require_env, get_cors_origins
from domain.cnpj import normalize_cnpj, is_valid_cnpj
from domain.address import normalize_cep, is_valid_cep, UF_VALUES, is_valid_uf
from domain.cpf import normalize_cpf, is_valid_cpf
from infrastructure.cnpj_lookup import lookup_cnpj
from infrastructure.cep_lookup import lookup_cep
from infrastructure.contract_storage import ensure_bucket, presigned_download_url, upload_contract
from fastapi import Request
from auth import get_current_user, get_setup_mfa_user, TokenPayload
import pyotp
from audit import emit_audit

DB_URL          = require_env("DB_URL")
INTERNAL_SECRET = require_env("INTERNAL_SECRET")
redis_client    = redis_lib.from_url(require_env("REDIS_URL"), decode_responses=True)

logger = logging.getLogger(__name__)

# ORD-087 — convite de usuário por e-mail
NOTIFICATION_SERVICE_URL = require_env("NOTIFICATION_SERVICE_URL")
ADMIN_BASE_URL           = os.getenv("ADMIN_BASE_URL", "http://localhost:3001")
INTERNAL_HEADERS         = {"X-Internal-Secret": INTERNAL_SECRET}
INVITE_TOKEN_TTL_HOURS   = 24


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


class CompanyPaymentConfig(Base):
    __tablename__ = "company_payment_configs"
    id           = Column(Integer, primary_key=True)
    company_id   = Column(Integer, nullable=False, index=True)
    provider     = Column(String(20), nullable=False)
    environment  = Column(String(10), nullable=False)
    api_key      = Column(String(500), nullable=True)
    api_secret   = Column(String(500), nullable=True)
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
    document: Optional[str] = None
    plan: str
    payment_provider: Optional[str] = "mock"
    active: bool
    created_at: Optional[datetime] = None
    visual_theme: str = "ordin"
    visual_mode: str = "light"
    legal_name: Optional[str] = None
    state_registration: Optional[str] = None
    municipal_registration: Optional[str] = None
    tax_regime: Optional[str] = None
    company_size: Optional[str] = None
    cnae_code: Optional[str] = None
    cadastral_status: Optional[str] = None
    zip_code: Optional[str] = None
    street: Optional[str] = None
    address_number: Optional[str] = None
    complement: Optional[str] = None
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    contract_status: str = "pendente"
    contract_sent_at: Optional[datetime] = None
    contract_signed_at: Optional[datetime] = None
    contract_document_url: Optional[str] = None
    mfa_policy: str = "disabled"
    model_config = {"from_attributes": True}


def _validate_zip_code_value(v: Optional[str]) -> Optional[str]:
    if v is None or not v.strip():
        return v
    normalized = normalize_cep(v)
    if not is_valid_cep(normalized):
        raise ValueError("CEP inválido — deve conter 8 dígitos")
    return normalized  # banco armazena sempre sem máscara


class CompanyIn(BaseModel):
    name: str
    document: Optional[str] = None
    plan: str = "free"
    payment_provider: str = "mock"
    legal_name: Optional[str] = None
    state_registration: Optional[str] = None
    municipal_registration: Optional[str] = None
    tax_regime: Optional[str] = None
    company_size: Optional[str] = None
    cnae_code: Optional[str] = None
    zip_code: Optional[str] = None
    street: Optional[str] = None
    address_number: Optional[str] = None
    complement: Optional[str] = None
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    state: str

    @field_validator("document")
    @classmethod
    def validate_document(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return v
        normalized = normalize_cnpj(v)
        if not is_valid_cnpj(normalized):
            raise ValueError("CNPJ inválido (formato ou dígito verificador)")
        return normalized  # banco armazena sempre sem máscara

    @field_validator("zip_code")
    @classmethod
    def validate_zip_code(cls, v: Optional[str]) -> Optional[str]:
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
    name: Optional[str] = None
    plan: Optional[str] = None
    payment_provider: Optional[str] = None
    legal_name: Optional[str] = None
    state_registration: Optional[str] = None
    municipal_registration: Optional[str] = None
    tax_regime: Optional[str] = None
    company_size: Optional[str] = None
    cnae_code: Optional[str] = None
    zip_code: Optional[str] = None
    street: Optional[str] = None
    address_number: Optional[str] = None
    complement: Optional[str] = None
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None

    @field_validator("zip_code")
    @classmethod
    def validate_zip_code(cls, v: Optional[str]) -> Optional[str]:
        return _validate_zip_code_value(v)

    @field_validator("state")
    @classmethod
    def validate_state(cls, v: Optional[str]) -> Optional[str]:
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
    reason: Optional[str] = None
    cadastral_status: str = "NAO_VERIFICADA"
    legal_name: Optional[str] = None
    trade_name: Optional[str] = None
    zip_code: Optional[str] = None
    street: Optional[str] = None
    address_number: Optional[str] = None
    complement: Optional[str] = None
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    model_config = {"from_attributes": True}


class CepLookupOut(BaseModel):
    found: bool
    reason: Optional[str] = None
    street: Optional[str] = None
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    model_config = {"from_attributes": True}


class TerminalOut(BaseModel):
    id: int
    label: str
    terminal_code: Optional[str] = None
    tef_number: Optional[str] = None
    tef_serial: Optional[str] = None
    paygo_terminal_id: Optional[str] = None
    mp_device_id: Optional[str] = None
    environment: Optional[str] = "sandbox"
    active: bool = True
    last_heartbeat: Optional[datetime] = None
    model_config = {"from_attributes": True}


class TerminalIn(BaseModel):
    label: str
    terminal_code: Optional[str] = None
    tef_number: Optional[str] = None
    tef_serial: Optional[str] = None
    paygo_terminal_id: Optional[str] = None
    mp_device_id: Optional[str] = None
    environment: str = "sandbox"


class TerminalUpdate(BaseModel):
    label: Optional[str] = None
    tef_number: Optional[str] = None
    tef_serial: Optional[str] = None
    paygo_terminal_id: Optional[str] = None
    mp_device_id: Optional[str] = None
    environment: Optional[str] = None


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
    created_at: Optional[datetime] = None
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
    name: Optional[str] = None
    role: Optional[str] = Field(None, pattern="^(owner|manager|cashier)$")
    active: Optional[bool] = None


class PlatformUserIn(BaseModel):
    # ORD-093: espelha UserIn, mas só aceita papéis de plataforma.
    name: str
    email: str
    role: str = Field(..., pattern="^(superadmin|admin)$")


class PlatformUserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = Field(None, pattern="^(superadmin|admin)$")
    active: Optional[bool] = None


class UserListOut(BaseModel):
    users: list[UserOut]
    total: int


class RegeneratePinOut(BaseModel):
    pin: str


VALID_THEMES = {"ordin", "mc", "bk"}
VALID_MODES  = {"light", "dark"}
VALID_MFA_POLICIES = {"disabled", "optional", "required"}


class AppearanceIn(BaseModel):
    theme: str
    mode: str


class SecurityIn(BaseModel):
    mfa_policy: str


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
    device_label: Optional[str] = None
    created_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None
    expires_at: datetime
    model_config = {"from_attributes": True}


class TrustedDeviceListOut(BaseModel):
    devices: list[TrustedDeviceOut]


class PaymentConfigIn(BaseModel):
    provider: str
    environment: str
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    extra_config: Optional[dict] = None


class PaymentConfigOut(BaseModel):
    id: int
    provider: str
    environment: str
    api_key: str = "***"
    api_secret: str = "***"
    extra_config: Optional[dict] = None
    active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class PaymentConfigListOut(BaseModel):
    configs: list[PaymentConfigOut]


VALID_CONTACT_TYPES = {"comercial", "financeiro", "tecnico"}


class ContactIn(BaseModel):
    contact_type: str
    name: str
    role_title: Optional[str] = None
    email: str
    phone: Optional[str] = None

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
    role_title: Optional[str] = None
    email: str
    phone: Optional[str] = None
    created_at: datetime


class ContactListOut(BaseModel):
    contacts: list[ContactOut]


class LegalRepresentativeIn(BaseModel):
    name: str
    cpf: str
    role_title: Optional[str] = None
    email: str
    phone: Optional[str] = None

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
    role_title: Optional[str] = None
    email: str
    phone: Optional[str] = None
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
    return {
        "company": {
            "id": co.id, "name": co.name, "plan": co.plan,
            "visual_theme": co.visual_theme, "visual_mode": co.visual_mode,
        },
        "terminal": {"id": t.id, "label": t.label, "tef_number": t.tef_number},
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


# ── Empresas (super admin) ────────────────────────────────────────────────────

@app.get("/companies", response_model=CompanyListOut, tags=["Empresas"], summary="Listar empresas")
async def list_companies(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    q: Optional[str] = Query(None, description="Busca em nome fantasia ou razão social"),
    document: Optional[str] = Query(None, description="Prefixo de CNPJ (início), com ou sem máscara"),
    contract_status: Optional[str] = Query(None, pattern="^(pendente|enviado|assinado)$"),
    date_from: Optional[str] = Query(None, description="Data de cadastro inicial (>=)"),
    date_to: Optional[str] = Query(None, description="Data de cadastro final (<=)"),
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
        base_filters.append(Company.created_at <= date_to)

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
    if current_user.company_id != company_id and current_user.role != "superadmin":
        raise HTTPException(403, "Acesso negado")
    co = await db.get(Company, company_id)
    if not co or not co.active:
        raise HTTPException(404, "Empresa não encontrada")
    co.visual_theme = body.theme
    co.visual_mode  = body.mode
    await db.commit()
    return {"ok": True, "theme": body.theme, "mode": body.mode}


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
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    total = (await db.execute(
        select(func.count()).select_from(Terminal)
        .where(Terminal.company_id == company_id, Terminal.active == True)
    )).scalar()
    result = await db.execute(
        select(Terminal)
        .where(Terminal.company_id == company_id, Terminal.active == True)
        .offset(skip).limit(limit)
    )
    return {"terminals": result.scalars().all(), "total": total}


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
        select(Terminal).filter_by(id=terminal_id, company_id=company_id, active=True)
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
        t.mp_device_id = body.mp_device_id or None
    if body.environment is not None:
        t.environment = body.environment
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
    name: Optional[str] = Query(None, min_length=1),
    email: Optional[str] = Query(None, min_length=1),
    role: Optional[str] = Query(None, pattern="^(owner|manager|cashier)$"),
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
    name: Optional[str] = Query(None, min_length=1),
    email: Optional[str] = Query(None, min_length=1),
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
    await db.commit()
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
    signed_document: Optional[UploadFile] = File(None),
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

    redis_client.set(key, json.dumps({
        "status": "approved",
        "company":  {"id": co.id, "name": co.name, "plan": co.plan or "free",
                     "visual_theme": co.visual_theme, "visual_mode": co.visual_mode},
        "terminal": {"id": t.id, "label": t.label, "tef_number": t.tef_number},
    }), ex=60)

    return {"ok": True}


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthOut, tags=["Empresas"], summary="Healthcheck")
def health():
    return {"service": "company", "status": "ok"}
