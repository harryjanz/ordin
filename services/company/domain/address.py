"""Normalização e validação de CEP e UF.

CEP aceita entrada com ou sem máscara (XXXXX-XXX). O banco sempre armazena o
valor normalizado (só dígitos) — nunca com máscara.
"""

_MASK_CHARS = ("-", ".", " ")

UF_VALUES = (
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO",
    "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
    "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
)


def is_valid_uf(raw: str) -> bool:
    return raw.strip().upper() in UF_VALUES


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
