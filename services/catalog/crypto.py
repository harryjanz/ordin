"""Criptografia de campo (AES-GCM) pra dado pessoal sensível — nome/CPF/
contato do responsável legal de Supplier (ORD-202).

Extraído de services/company/main.py (helpers de criptografia de credencial,
linhas ~109-133) — mesmo algoritmo, mesma variável de ambiente
(CREDENTIAL_ENCRYPTION_KEY, precisa existir também no ambiente de
catalog-service a partir desta história). Sem chave configurada, degrada pra
texto plano (só em dev local) — nunca derruba o serviço.
"""
import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


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
    if stored.startswith("enc:"):
        key = _encryption_key()
        if key is None:
            raise RuntimeError("CREDENTIAL_ENCRYPTION_KEY não configurada")
        raw = base64.b64decode(stored[4:])
        nonce, ct = raw[:12], raw[12:]
        return AESGCM(key).decrypt(nonce, ct, None).decode()
    return stored  # plaintext — dev local
