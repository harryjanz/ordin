"""Consulta de CNPJ na Receita Federal — BrasilAPI com fallback ReceitaWS (ORD-057).

Nunca propaga exceção: falha de rede/timeout/formato de resposta inesperado
sempre degrada para found=False, reason="lookup_unavailable" — quem chama
decide o que fazer (bloquear ou permitir preenchimento manual).

Risco conhecido: como o CNPJ alfanumérico é muito recente, não há garantia
de que BrasilAPI/ReceitaWS já suportem esse formato — nesse caso o caminho
esperado também é a degradação graciosa, não uma exceção rara.
"""
import logging
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

_BRASILAPI_URL = "https://brasilapi.com.br/api/cnpj/v1/{cnpj}"
_RECEITAWS_URL = "https://www.receitaws.com.br/v1/cnpj/{cnpj}"
_TIMEOUT = 10


@dataclass
class CnpjLookupResult:
    found: bool
    cadastral_status: str = "NAO_VERIFICADA"
    reason: str | None = None
    legal_name: str | None = None
    trade_name: str | None = None
    zip_code: str | None = None
    street: str | None = None
    address_number: str | None = None
    complement: str | None = None
    neighborhood: str | None = None
    city: str | None = None
    state: str | None = None


def _parse_brasilapi(data: dict) -> CnpjLookupResult:
    situacao = (data.get("descricao_situacao_cadastral") or "").strip().upper()
    return CnpjLookupResult(
        found=True,
        cadastral_status=situacao or "NAO_VERIFICADA",
        legal_name=data.get("razao_social"),
        trade_name=data.get("nome_fantasia"),
        zip_code=data.get("cep"),
        street=data.get("logradouro"),
        address_number=data.get("numero"),
        complement=data.get("complemento"),
        neighborhood=data.get("bairro"),
        city=data.get("municipio"),
        state=data.get("uf"),
    )


def _parse_receitaws(data: dict) -> CnpjLookupResult:
    situacao = (data.get("situacao") or "").strip().upper()
    return CnpjLookupResult(
        found=True,
        cadastral_status=situacao or "NAO_VERIFICADA",
        legal_name=data.get("nome"),
        trade_name=data.get("fantasia"),
        zip_code=data.get("cep"),
        street=data.get("logradouro"),
        address_number=data.get("numero"),
        complement=data.get("complemento"),
        neighborhood=data.get("bairro"),
        city=data.get("municipio"),
        state=data.get("uf"),
    )


async def _try_brasilapi(cnpj: str) -> CnpjLookupResult | None:
    """None sinaliza "tenta o próximo fallback"; um CnpjLookupResult(found=False) é decisão final (404 explícito)."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(_BRASILAPI_URL.format(cnpj=cnpj))
        if resp.status_code == 404:
            return CnpjLookupResult(found=False, reason="cnpj_not_found")
        if resp.status_code != 200:
            return None
        return _parse_brasilapi(resp.json())
    except Exception as exc:
        logger.warning("BrasilAPI: falha na consulta de CNPJ — %s", exc)
        return None


async def _try_receitaws(cnpj: str) -> CnpjLookupResult | None:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(_RECEITAWS_URL.format(cnpj=cnpj))
        if resp.status_code != 200:
            return None
        data = resp.json()
        if data.get("status") == "ERROR":
            return CnpjLookupResult(found=False, reason="cnpj_not_found")
        return _parse_receitaws(data)
    except Exception as exc:
        logger.warning("ReceitaWS: falha na consulta de CNPJ — %s", exc)
        return None


async def lookup_cnpj(cnpj: str) -> CnpjLookupResult:
    """cnpj já deve vir normalizado (sem máscara). Nunca lança exceção."""
    result = await _try_brasilapi(cnpj)
    if result is not None:
        return result
    result = await _try_receitaws(cnpj)
    if result is not None:
        return result
    return CnpjLookupResult(found=False, reason="lookup_unavailable", cadastral_status="NAO_VERIFICADA")
