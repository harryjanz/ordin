"""Normalização e validação de CEP.

Aceita entrada com ou sem máscara (XXXXX-XXX). O banco sempre armazena o
valor normalizado (só dígitos) — nunca com máscara.
"""

_MASK_CHARS = ("-", ".", " ")


def normalize_cep(raw: str) -> str:
    cleaned = raw.strip()
    for ch in _MASK_CHARS:
        cleaned = cleaned.replace(ch, "")
    return cleaned


def is_valid_cep(raw: str) -> bool:
    cep = normalize_cep(raw)
    return len(cep) == 8 and cep.isdigit()


def format_cep(raw: str) -> str:
    """Aplica a máscara XXXXX-XXX. Uso em apresentação (frontend/API), não em persistência."""
    cep = normalize_cep(raw)
    return f"{cep[0:5]}-{cep[5:8]}"
