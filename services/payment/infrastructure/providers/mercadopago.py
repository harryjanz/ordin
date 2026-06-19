import asyncio
import logging
from datetime import datetime, timezone, timedelta
from decimal import Decimal

import httpx

from domain.interfaces.payment_provider import IPaymentProvider
from domain.schemas import ProviderConfig, TransactionResult, TransactionStatus

logger = logging.getLogger(__name__)

_POLL_INTERVAL_CARD = 3.0
_POLL_TIMEOUT_CARD  = 120.0
_POLL_INTERVAL_PIX  = 5.0
_PIX_EXPIRY_MINUTES = 10

# Point intent states
_INTENT_TERMINAL_STATES = {"OPEN", "ON_TERMINAL"}
_INTENT_FINAL_STATES    = {"FINISHED", "CANCELED", "ERROR"}


class MPProvider(IPaymentProvider):
    BASE_URL = "https://api.mercadopago.com"

    def __init__(self, config: ProviderConfig):
        self._access_token = config.api_key or ""
        self._headers = {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json",
        }

    async def create_transaction(
        self,
        amount: Decimal,
        method: str,
        terminal_ref: str,
        order_ref: str,
    ) -> TransactionResult:
        if method in ("credit", "debit"):
            return await self._card_payment(amount, method, terminal_ref, order_ref)
        if method == "pix":
            return await self._pix_payment(amount, order_ref)
        return TransactionResult(
            status=TransactionStatus.refused,
            error_message=f"Método '{method}' não suportado pelo MPProvider",
        )

    async def _card_payment(
        self,
        amount: Decimal,
        method: str,
        device_id: str,
        order_ref: str,
    ) -> TransactionResult:
        audit: list[dict] = []
        amount_cents = int(amount * 100)

        body = {
            "amount": amount_cents,
            "description": f"Pedido {order_ref}",
            "payment": {
                "installments": 1,
                "type": "credit_card" if method == "credit" else "debit_card",
            },
        }

        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.post(
                    f"{self.BASE_URL}/point/integration-api/devices/{device_id}/payment-intents",
                    headers=self._headers,
                    json=body,
                )
            except Exception as exc:
                return TransactionResult(
                    status=TransactionStatus.refused,
                    error_message=f"Falha ao conectar ao MP Point: {exc}",
                    audit_events=audit,
                )

            audit.append({
                "event": "intent_create",
                "ts": datetime.utcnow().isoformat(),
                "http_status": resp.status_code,
                "response": resp.text[:500],
            })

            if resp.status_code not in (200, 201):
                return TransactionResult(
                    status=TransactionStatus.refused,
                    error_message=f"MP Point HTTP {resp.status_code}: {resp.text[:200]}",
                    audit_events=audit,
                )

            intent_id = resp.json().get("id", "")

            deadline = asyncio.get_event_loop().time() + _POLL_TIMEOUT_CARD
            while asyncio.get_event_loop().time() < deadline:
                await asyncio.sleep(_POLL_INTERVAL_CARD)

                try:
                    poll = await client.get(
                        f"{self.BASE_URL}/point/integration-api/payment-intents/{intent_id}",
                        headers=self._headers,
                    )
                    poll_data = poll.json()
                except Exception as exc:
                    logger.warning("MP Point poll error: %s", exc)
                    continue

                state = poll_data.get("state", {}).get("value", "OPEN")
                audit.append({
                    "event": "poll",
                    "ts": datetime.utcnow().isoformat(),
                    "state": state,
                })

                if state in _INTENT_TERMINAL_STATES:
                    continue

                if state == "FINISHED":
                    payment_id = poll_data.get("payment", {}).get("id")
                    if payment_id:
                        try:
                            pay_resp = await client.get(
                                f"{self.BASE_URL}/v1/payments/{payment_id}",
                                headers=self._headers,
                            )
                            pay_data = pay_resp.json()
                            audit.append({
                                "event": "payment_fetch",
                                "ts": datetime.utcnow().isoformat(),
                                "payment_status": pay_data.get("status"),
                            })
                            if pay_data.get("status") == "approved":
                                return TransactionResult(
                                    status=TransactionStatus.approved,
                                    provider_transaction_id=str(payment_id),
                                    nsu=str(pay_data.get("id", "")),
                                    authorization=pay_data.get("authorization_code") or "",
                                    audit_events=audit,
                                )
                        except Exception as exc:
                            logger.warning("MP payment fetch error: %s", exc)

                    return TransactionResult(
                        status=TransactionStatus.refused,
                        provider_transaction_id=intent_id,
                        error_message="Pagamento não autorizado no terminal",
                        audit_events=audit,
                    )

                # CANCELED or ERROR
                return TransactionResult(
                    status=TransactionStatus.cancelled if state == "CANCELED" else TransactionStatus.refused,
                    provider_transaction_id=intent_id,
                    error_message=f"Terminal retornou: {state}",
                    audit_events=audit,
                )

        return TransactionResult(
            status=TransactionStatus.expired,
            provider_transaction_id=intent_id,
            error_message="Timeout: terminal não respondeu em 120s",
            audit_events=audit,
        )

    async def _pix_payment(self, amount: Decimal, order_ref: str) -> TransactionResult:
        audit: list[dict] = []
        expiry = datetime.now(timezone.utc) + timedelta(minutes=_PIX_EXPIRY_MINUTES)

        body = {
            "transaction_amount": float(amount),
            "payment_method_id": "pix",
            "payer": {"email": "cliente@ordin.app"},
            "description": f"Pedido {order_ref}",
            "date_of_expiration": expiry.strftime("%Y-%m-%dT%H:%M:%S.000+00:00"),
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = None
            last_error = ""
            for attempt in range(3):
                if attempt > 0:
                    await asyncio.sleep(2.0)
                try:
                    resp = await client.post(
                        f"{self.BASE_URL}/v1/payments",
                        headers={**self._headers, "X-Idempotency-Key": order_ref},
                        json=body,
                    )
                except Exception as exc:
                    last_error = str(exc)
                    logger.warning("MP PIX attempt %d connect error: %s", attempt + 1, exc)
                    continue

                audit.append({
                    "event": "pix_create",
                    "ts": datetime.utcnow().isoformat(),
                    "http_status": resp.status_code,
                    "attempt": attempt + 1,
                })

                # 5xx = transiente, tenta novamente; 4xx = erro permanente
                if resp.status_code in (200, 201):
                    break
                last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                logger.warning("MP PIX attempt %d failed: %s", attempt + 1, last_error)
                if resp.status_code < 500:
                    break  # erro de cliente — não adianta retry

            if resp is None or resp.status_code not in (200, 201):
                return TransactionResult(
                    status=TransactionStatus.refused,
                    error_message=f"MP PIX falhou após retries: {last_error}",
                    audit_events=audit,
                )

            data = resp.json()
            payment_id = str(data.get("id", ""))
            tx_data = (data.get("point_of_interaction", {})
                           .get("transaction_data", {}))
            qr_code        = tx_data.get("qr_code", "")
            qr_code_base64 = tx_data.get("qr_code_base64", "")

            audit.append({
                "event": "pix_created",
                "ts": datetime.utcnow().isoformat(),
                "payment_id": payment_id,
                "has_qr": bool(qr_code),
            })

            return TransactionResult(
                status=TransactionStatus.processing,
                provider_transaction_id=payment_id,
                qr_code=qr_code,
                qr_code_base64=qr_code_base64,
                audit_events=audit,
            )

    async def cancel_transaction(
        self,
        provider_transaction_id: str,
        terminal_ref: str,
    ) -> bool:
        # Card intent IDs are UUID format (contain "-"); PIX IDs are numeric
        if "-" in provider_transaction_id and terminal_ref:
            async with httpx.AsyncClient(timeout=10) as client:
                try:
                    resp = await client.delete(
                        f"{self.BASE_URL}/point/integration-api/devices/{terminal_ref}"
                        f"/payment-intents/{provider_transaction_id}",
                        headers=self._headers,
                    )
                    return resp.status_code in (200, 204)
                except Exception:
                    return False
        # PIX pending — let it expire (has date_of_expiration set at creation)
        return True

    async def test_connection(self, terminal_ref: str) -> dict:
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.get(
                    f"{self.BASE_URL}/v1/users/me",
                    headers=self._headers,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    label = data.get("email") or str(data.get("id", "ok"))
                    return {"success": True, "detail": f"MP conectado: {label}"}
                return {
                    "success": False,
                    "detail": f"Access token inválido (HTTP {resp.status_code})",
                }
            except Exception as exc:
                return {"success": False, "detail": f"Erro ao conectar ao MP: {exc}"}
