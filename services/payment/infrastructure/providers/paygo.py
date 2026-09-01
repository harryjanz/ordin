import asyncio
import logging
from datetime import datetime
from decimal import Decimal

import httpx

from domain.interfaces.payment_provider import IPaymentProvider
from domain.schemas import (
    PROVIDER_BASE_URLS,
    ProviderConfig,
    RefundResult,
    TransactionResult,
    TransactionStatus,
)

logger = logging.getLogger(__name__)

_METHOD_MAP: dict[str, int] = {
    "credit":  21,
    "debit":   22,
    "voucher": 23,
    "pix":     25,
}

_STATUS_MAP: dict[int, str] = {
    5:  "processing",
    6:  "processing",
    10: "approved",
    15: "expired",
    18: "processing",
    20: "cancelled",
    25: "refused",
}

_POLL_INTERVAL = 2.0
_POLL_TIMEOUT  = 90.0


class PayGoProvider(IPaymentProvider):
    def __init__(self, config: ProviderConfig):
        self._config   = config
        self._base_url = PROVIDER_BASE_URLS["paygo"][config.environment]

    def _headers(self) -> dict:
        return {"Content-Type": "application/json", "User-Agent": "Ordin/1.0"}

    def _params(self) -> dict:
        return {"key": self._config.api_key}

    @staticmethod
    def _fmt_amount(amount: Decimal) -> str:
        return f"{amount:.2f}".replace(".", ",")

    async def create_transaction(
        self,
        amount: Decimal,
        method: str,
        terminal_ref: str,
        order_ref: str,
    ) -> TransactionResult:
        audit: list[dict] = []

        async with httpx.AsyncClient(timeout=30) as client:
            # ── 1. Iniciar intenção de venda ──────────────────────────────────
            body = {
                "formaPagamentoId":              _METHOD_MAP.get(method, 21),
                "terminalId":                    terminal_ref,
                "referencia":                    order_ref,
                "iniciarTransacaoAutomaticamente": True,
                "quantidadeParcelas":            1,
                "valorTotalVendido":             self._fmt_amount(amount),
            }
            try:
                resp = await client.post(
                    f"{self._base_url}Venda/Vender/",
                    params=self._params(),
                    json=body,
                    headers=self._headers(),
                )
            except Exception as exc:
                return TransactionResult(
                    status=TransactionStatus.refused,
                    error_message=f"Falha ao conectar ao PayGo: {exc}",
                    audit_events=audit,
                )

            audit.append({
                "event":       "create_request",
                "ts":          datetime.utcnow().isoformat(),
                "payload":     body,
                "http_status": resp.status_code,
                "response":    resp.text[:2000],
            })

            if resp.status_code != 200:
                return TransactionResult(
                    status=TransactionStatus.refused,
                    error_message=f"PayGo HTTP {resp.status_code}",
                    audit_events=audit,
                )

            data = resp.json()
            intencao_id = str(data.get("intencaoVenda", {}).get("id", ""))

            # ── 2. Polling até status final ou timeout ────────────────────────
            deadline = asyncio.get_event_loop().time() + _POLL_TIMEOUT
            elapsed  = 0.0

            while asyncio.get_event_loop().time() < deadline:
                await asyncio.sleep(_POLL_INTERVAL)
                elapsed += _POLL_INTERVAL

                try:
                    poll = await client.post(
                        f"{self._base_url}IntencaoVenda/GetById",
                        params={**self._params(), "intencaoVendaId": intencao_id},
                        headers=self._headers(),
                    )
                except Exception as exc:
                    logger.warning("PayGo poll error: %s", exc)
                    continue

                poll_data = poll.json()
                audit.append({
                    "event":       "poll",
                    "ts":          datetime.utcnow().isoformat(),
                    "elapsed":     elapsed,
                    "http_status": poll.status_code,
                    "response":    poll.text[:2000],
                })

                status_id  = (poll_data.get("intencaoVenda", {})
                              .get("intencaoVendaStatus", {}).get("id", 0))
                status_str = _STATUS_MAP.get(status_id, "processing")

                if status_str == "processing":
                    continue

                if status_str == "approved":
                    pagamentos = (poll_data.get("intencaoVenda", {})
                                  .get("pagamentosExternos") or [{}])
                    p          = pagamentos[0] if pagamentos else {}
                    nsu        = p.get("nsu", "")
                    auth       = p.get("autorizacao", "")
                    adquirente = p.get("adquirente", "")
                    audit.append({
                        "event":         "approved",
                        "ts":            datetime.utcnow().isoformat(),
                        "nsu":           nsu,
                        "authorization": auth,
                        "adquirente":    adquirente,
                    })
                    return TransactionResult(
                        status=TransactionStatus.approved,
                        provider_transaction_id=intencao_id,
                        nsu=nsu,
                        authorization=auth,
                        audit_events=audit,
                    )

                return TransactionResult(
                    status=TransactionStatus(status_str),
                    provider_transaction_id=intencao_id,
                    audit_events=audit,
                )

        return TransactionResult(
            status=TransactionStatus.expired,
            provider_transaction_id=intencao_id,
            error_message="Timeout: terminal não respondeu em 90s",
            audit_events=audit,
        )

    async def cancel_transaction(
        self,
        provider_transaction_id: str,
        terminal_ref: str,
    ) -> bool:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{self._base_url}Venda/CancelarVenda",
                params=self._params(),
                json={
                    "intencaoVendaId":               provider_transaction_id,
                    "terminalId":                    terminal_ref,
                    "iniciarTransacaoAutomaticamente": True,
                    "senhaTecnica":                  self._config.api_secret,
                },
                headers=self._headers(),
            )
        return resp.status_code == 200

    async def refund_transaction(self, provider_transaction_id: str) -> RefundResult:
        # Fora do escopo do ORD-147 — PayGo/ControlPay não tem reembolso via
        # API integrado ainda; cancelamento same-day continua sendo o único
        # mecanismo. Nunca é chamado na prática: o endpoint de reembolso só
        # roteia pra provider == "mercadopago".
        raise NotImplementedError("Reembolso PayGo fora do escopo — usar cancelamento no mesmo dia")

    async def test_connection(self, terminal_ref: str) -> dict:
        """Inicia R$ 0,01 via PayGo, aguarda acionamento da máquina, cancela imediatamente."""
        body = {
            "formaPagamentoId":              21,  # crédito
            "terminalId":                    terminal_ref,
            "referencia":                    "test-connection",
            "iniciarTransacaoAutomaticamente": True,
            "quantidadeParcelas":            1,
            "valorTotalVendido":             "0,01",
        }
        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.post(
                    f"{self._base_url}Venda/Vender/",
                    params=self._params(),
                    json=body,
                    headers=self._headers(),
                )
            except Exception as exc:
                return {"success": False, "detail": f"Falha ao conectar ao PayGo: {exc}"}

            if resp.status_code != 200:
                return {"success": False, "detail": f"PayGo HTTP {resp.status_code}"}

            data = resp.json()
            intencao_id = str(data.get("intencaoVenda", {}).get("id", ""))
            if not intencao_id:
                return {"success": False, "detail": "PayGo não retornou ID de transação"}

            # Aguarda primeiro sinal da máquina (até 25s) e cancela
            deadline = asyncio.get_event_loop().time() + 25.0
            while asyncio.get_event_loop().time() < deadline:
                await asyncio.sleep(2.0)
                try:
                    poll = await client.post(
                        f"{self._base_url}IntencaoVenda/GetById",
                        params={**self._params(), "intencaoVendaId": intencao_id},
                        headers=self._headers(),
                    )
                    status_id = (poll.json().get("intencaoVenda", {})
                                 .get("intencaoVendaStatus", {}).get("id", 0))
                    # status_id != 5 (processando) significa que a máquina respondeu
                    if status_id and status_id != 5:
                        await self.cancel_transaction(intencao_id, terminal_ref)
                        return {"success": True, "detail": f"Máquina respondeu (NSU cancelado, status {status_id})"}
                    if status_id == 0:
                        continue
                except Exception:
                    continue

            # Timeout — tenta cancelar mesmo assim
            await self.cancel_transaction(intencao_id, terminal_ref)
            return {"success": False, "detail": "Timeout: máquina não respondeu em 25s"}
