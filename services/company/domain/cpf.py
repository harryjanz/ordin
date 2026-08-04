"""Validação de CPF do responsável legal (algoritmo mod 11 clássico)."""

_MASK_CHARS = (".", "-", " ")


def normalize_cpf(raw: str) -> str:
    cleaned = raw.strip()
    for ch in _MASK_CHARS:
        cleaned = cleaned.replace(ch, "")
    return cleaned


def _check_digit(partial: str) -> int:
    weights = list(range(len(partial) + 1, 1, -1))
    total = sum(int(d) * w for d, w in zip(partial, weights))
    remainder = (total * 10) % 11
    return remainder if remainder < 10 else 0


def is_valid_cpf(raw: str) -> bool:
    cpf = normalize_cpf(raw)
    if len(cpf) != 11 or not cpf.isdigit():
        return False
    if cpf == cpf[0] * 11:  # todos os dígitos iguais — formalmente passa no cálculo, mas é sempre inválido
        return False
    d1 = _check_digit(cpf[:9])
    d2 = _check_digit(cpf[:9] + str(d1))
    return cpf[9:] == f"{d1}{d2}"
