"""Consulta de CNPJ na Receita Federal — BrasilAPI → ReceitaWS → cnpj.ws (ORD-057, ORD-064).

Nunca propaga exceção: falha de rede/timeout/formato de resposta inesperado
sempre degrada para found=False, reason="lookup_unavailable" — quem chama
decide o que fazer (bloquear ou permitir preenchimento manual).

Risco conhecido: como o CNPJ alfanumérico é muito recente, nenhum dos três
provedores confirma suporte a esse formato na própria documentação. Por isso
um 404 pra CNPJ alfanumérico NÃO é tratado como resposta definitiva (o
provedor pode só não reconhecer o formato na URL, não significa que o CNPJ
não existe) — é tratado como inconclusivo, tenta o próximo provedor. CNPJ
numérico legado mantém o comportamento antigo (404 = não encontrado,
definitivo), sem mudança — esses provedores suportam esse formato há anos.

429 (rate limit, comum no cnpj.ws — 3 consultas/min observadas na prática)
nunca é tratado como "não encontrado", pra CNPJ numérico ou alfanumérico —
rate limit não é sinal de inexistência.
"""
import logging
from dataclasses import dataclass, replace

import httpx
from domain.cnpj import is_alphanumeric_cnpj

logger = logging.getLogger(__name__)

_BRASILAPI_URL = "https://brasilapi.com.br/api/cnpj/v1/{cnpj}"
_RECEITAWS_URL = "https://www.receitaws.com.br/v1/cnpj/{cnpj}"
_CNPJWS_URL = "https://publica.cnpj.ws/cnpj/{cnpj}"
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


def _parse_cnpjws(data: dict) -> CnpjLookupResult:
    # Formato real confirmado via chamada de verdade (ORD-064) — dados vêm
    # aninhados em "estabelecimento" (endereço/situação) e "estado"/"cidade"
    # dentro dele; não existe campo "uf" solto, é estabelecimento.estado.sigla.
    estab = data.get("estabelecimento") or {}
    situacao = (estab.get("situacao_cadastral") or "").strip().upper()
    estado = estab.get("estado") or {}
    cidade = estab.get("cidade") or {}
    return CnpjLookupResult(
        found=True,
        cadastral_status=situacao or "NAO_VERIFICADA",
        legal_name=data.get("razao_social"),
        trade_name=estab.get("nome_fantasia"),
        zip_code=estab.get("cep"),
        street=estab.get("logradouro"),
        address_number=estab.get("numero"),
        complement=estab.get("complemento"),
        neighborhood=estab.get("bairro"),
        city=cidade.get("nome"),
        state=estado.get("sigla"),
    )


def _receitaws_body_is_error(data: dict) -> bool:
    # ReceitaWS tem uma particularidade: CNPJ não encontrado vem como HTTP
    # 200 com {"status": "ERROR", ...} no corpo, não como 404 de verdade —
    # sem essa checagem, _parse_receitaws lê o corpo de erro como se fosse
    # uma empresa real (found=True, cadastral_status="NAO_VERIFICADA" pela
    # ausência do campo "situacao"), o que BLOQUEIA o cadastro por engano.
    # Descoberto via E2E real (ORD-064) — existia na implementação original
    # do ORD-057 e foi perdido numa refatoração no meio do próprio ORD-064.
    return data.get("status") == "ERROR"


async def _fetch(url: str, cnpj: str, parse, body_is_error=None) -> CnpjLookupResult | None:
    """None sinaliza "tenta o próximo fallback"; um CnpjLookupResult(found=False)
    é decisão final (404/corpo-de-erro explícito e confiável — só pra CNPJ numérico)."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(url.format(cnpj=cnpj))
        if resp.status_code == 429:
            return None  # rate limit — nunca é sinal de "não existe"
        if resp.status_code == 404:
            if is_alphanumeric_cnpj(cnpj):
                return None
            return CnpjLookupResult(found=False, reason="cnpj_not_found")
        if resp.status_code != 200:
            return None
        data = resp.json()
        if body_is_error and body_is_error(data):
            if is_alphanumeric_cnpj(cnpj):
                return None
            return CnpjLookupResult(found=False, reason="cnpj_not_found")
        return parse(data)
    except Exception as exc:
        logger.warning("%s: falha na consulta de CNPJ — %s", url, exc)
        return None


async def lookup_cnpj(cnpj: str) -> CnpjLookupResult:
    """cnpj já deve vir normalizado (sem máscara). Nunca lança exceção."""
    providers = (
        (_BRASILAPI_URL, _parse_brasilapi, None),
        (_RECEITAWS_URL, _parse_receitaws, _receitaws_body_is_error),
        (_CNPJWS_URL, _parse_cnpjws, None),
    )
    for url, parse, body_is_error in providers:
        result = await _fetch(url, cnpj, parse, body_is_error)
        if result is not None:
            return result

    result = CnpjLookupResult(found=False, reason="lookup_unavailable", cadastral_status="NAO_VERIFICADA")
    if is_alphanumeric_cnpj(cnpj):
        # Nenhum provedor confirmou — mas o DV já foi validado localmente
        # contra os vetores oficiais da Receita (ORD-064). Decisão de
        # produto: confiar nisso e marcar ATIVA em vez de deixar
        # "não verificada", já que os provedores públicos ainda não
        # confirmam esse formato tão recente. CNPJ numérico não entra
        # aqui — pra ele, lookup_unavailable continua "não verificada".
        result = replace(result, cadastral_status="ATIVA")
    return result
