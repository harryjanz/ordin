"""Consulta de CEP — BrasilAPI → ViaCEP → OpenCEP.

Mesma filosofia de resiliência do cnpj_lookup.py: nunca propaga exceção,
falha de rede/timeout/formato inesperado sempre degrada para found=False,
reason="lookup_unavailable" — quem chama decide o que fazer (bloquear ou
permitir preenchimento manual do endereço).

429 (rate limit) nunca é tratado como "não encontrado" — tenta o próximo
provedor. ViaCEP não usa HTTP 404 pra CEP inexistente: responde 200 com
{"erro": true} no corpo (mesma pegadinha do ReceitaWS pra CNPJ).
"""
import logging
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

_BRASILAPI_URL = "https://brasilapi.com.br/api/cep/v2/{cep}"
_VIACEP_URL = "https://viacep.com.br/ws/{cep}/json/"
_OPENCEP_URL = "https://opencep.com/v1/{cep}"
_TIMEOUT = 10


@dataclass
class CepLookupResult:
    found: bool
    reason: str | None = None
    street: str | None = None
    neighborhood: str | None = None
    city: str | None = None
    state: str | None = None


def _parse_brasilapi(data: dict) -> CepLookupResult:
    return CepLookupResult(
        found=True,
        street=data.get("street") or None,
        neighborhood=data.get("neighborhood") or None,
        city=data.get("city"),
        state=data.get("state"),
    )


def _parse_viacep(data: dict) -> CepLookupResult:
    return CepLookupResult(
        found=True,
        street=data.get("logradouro") or None,
        neighborhood=data.get("bairro") or None,
        city=data.get("localidade"),
        state=data.get("uf"),
    )


def _parse_opencep(data: dict) -> CepLookupResult:
    return CepLookupResult(
        found=True,
        street=data.get("logradouro") or None,
        neighborhood=data.get("bairro") or None,
        city=data.get("localidade"),
        state=data.get("uf"),
    )


def _viacep_body_is_error(data: dict) -> bool:
    # ViaCEP não usa 404 pra "não encontrado" — vem HTTP 200 com {"erro": true}.
    return bool(data.get("erro"))


async def _fetch(url: str, cep: str, parse, body_is_error=None) -> tuple[CepLookupResult | None, bool]:
    """Retorna (resultado, negado_explicitamente). resultado=None sinaliza
    "tenta o próximo fallback" — inclusive em 404/corpo-de-erro: bases de CEP
    divergem entre si (staleness, endereços novos/rurais), então um único
    provedor dizer "não existe" não é definitivo — só fecha "não encontrado"
    se NENHUM dos três achar. negado_explicitamente diferencia isso de
    "todos indisponíveis" (timeout/erro de rede), que é outra situação."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(url.format(cep=cep))
        if resp.status_code == 429:
            return None, False  # rate limit — nunca é sinal de "não existe"
        if resp.status_code == 404:
            return None, True
        if resp.status_code != 200:
            return None, False
        data = resp.json()
        if body_is_error and body_is_error(data):
            return None, True
        return parse(data), False
    except Exception as exc:
        logger.warning("%s: falha na consulta de CEP — %s", url, exc)
        return None, False


async def lookup_cep(cep: str) -> CepLookupResult:
    """cep já deve vir normalizado (só dígitos). Nunca lança exceção."""
    providers = (
        (_BRASILAPI_URL, _parse_brasilapi, None),
        (_VIACEP_URL, _parse_viacep, _viacep_body_is_error),
        (_OPENCEP_URL, _parse_opencep, None),
    )
    algum_provedor_negou = False
    for url, parse, body_is_error in providers:
        result, negado = await _fetch(url, cep, parse, body_is_error)
        if result is not None:
            return result
        algum_provedor_negou = algum_provedor_negou or negado

    if algum_provedor_negou:
        return CepLookupResult(found=False, reason="cep_not_found")
    return CepLookupResult(found=False, reason="lookup_unavailable")
