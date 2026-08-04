"""Validação de CNPJ — formato numérico legado e o novo formato alfanumérico da Receita Federal.

O algoritmo de dígito verificador (peso 5,4,3,2,9,8,7,6,5,4,3,2 / mod 11) não muda.
A mudança está em como cada um dos 12 primeiros caracteres é convertido a valor
numérico: em vez de int(char) (só funciona para dígitos), usa-se ord(char) - 48.
Isso preserva compatibilidade total com CNPJs numéricos (dígitos '0'-'9' têm
ord(c)-48 idêntico ao valor do dígito) e estende para letras maiúsculas 'A'-'Z'
(ord(c)-48 no intervalo 17-42). Os 2 dígitos verificadores finais são sempre
numéricos, nunca letras.

ATENÇÃO: mecanismo documentado publicamente (Nota Técnica RFB), mas ainda não
confrontado com vetores de teste oficiais — ver risco registrado em ORD-056.
"""

_MASK_CHARS = (".", "/", "-")
_WEIGHTS_12 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]


def normalize_cnpj(raw: str) -> str:
    cleaned = raw.strip().upper()
    for ch in _MASK_CHARS:
        cleaned = cleaned.replace(ch, "")
    return cleaned


def _char_value(ch: str) -> int:
    return ord(ch) - 48


def _check_digit(values: list[int], weights: list[int]) -> int:
    total = sum(v * w for v, w in zip(values, weights))
    remainder = total % 11
    return 0 if remainder < 2 else 11 - remainder


def is_valid_cnpj(raw: str) -> bool:
    cnpj = normalize_cnpj(raw)
    if len(cnpj) != 14:
        return False
    base, dv = cnpj[:12], cnpj[12:]
    if not all(c.isdigit() or "A" <= c <= "Z" for c in base):
        return False
    if not dv.isdigit():
        return False
    values = [_char_value(c) for c in base]
    dv1 = _check_digit(values, _WEIGHTS_12)
    dv2 = _check_digit(values + [dv1], [6, *_WEIGHTS_12])
    return dv == f"{dv1}{dv2}"


def format_cnpj(raw: str) -> str:
    """Aplica a máscara XX.XXX.XXX/XXXX-XX. Espera um CNPJ já normalizado e válido."""
    cnpj = normalize_cnpj(raw)
    return f"{cnpj[0:2]}.{cnpj[2:5]}.{cnpj[5:8]}/{cnpj[8:12]}-{cnpj[12:14]}"
