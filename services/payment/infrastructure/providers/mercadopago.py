import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import httpx

from domain.interfaces.payment_provider import IPaymentProvider
from domain.schemas import (
    ProviderConfig,
    RefundResult,
    TransactionResult,
    TransactionStatus,
)

logger = logging.getLogger(__name__)

_POLL_INTERVAL_CARD = 3.0
_POLL_TIMEOUT_CARD  = 120.0
_POLL_INTERVAL_PIX  = 5.0
_PIX_EXPIRY_MINUTES = 10

# Status de uma order (API de Orders do MP Point) — created/at_terminal são
# transitórios (continuar polling); os demais são finais.
_ORDER_PENDING_STATUSES = {"created", "at_terminal"}


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
        terminal_id: str,
        order_ref: str,
    ) -> TransactionResult:
        audit: list[dict] = []

        mp_payment_type = "credit_card" if method == "credit" else "debit_card"

        payment_method_config = {"default_type": mp_payment_type}
        if method == "credit":
            # default_installments só é aceito quando default_type = credit_card.
            # 1 = à vista, evita a tela de seleção de parcelas no terminal.
            payment_method_config["default_installments"] = 1

        body = {
            "type": "point",
            "external_reference": order_ref,
            "transactions": {"payments": [{"amount": f"{amount:.2f}"}]},
            "config": {
                "point": {
                    "terminal_id": terminal_id,
                    "print_on_terminal": "no_ticket",
                },
                "payment_method": payment_method_config,
            },
            "description": f"Pedido {order_ref}",
        }

        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.post(
                    f"{self.BASE_URL}/v1/orders",
                    # UUID por tentativa, não order_ref: um order_ref reaproveitado
                    # numa nova tentativa (ex.: cliente troca de crédito pra débito
                    # após recusa) manda um body diferente com a MESMA chave, e o MP
                    # responde 409 idempotency_key_already_used sem nunca chamar o
                    # terminal.
                    headers={**self._headers, "X-Idempotency-Key": f"{order_ref}-{uuid.uuid4()}"},
                    json=body,
                )
            except Exception as exc:
                return TransactionResult(
                    status=TransactionStatus.refused,
                    error_message=f"Falha ao conectar ao MP Point: {exc}",
                    audit_events=audit,
                )

            audit.append({
                "event": "order_create",
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

            order_id = resp.json().get("id", "")

            deadline = asyncio.get_event_loop().time() + _POLL_TIMEOUT_CARD
            while asyncio.get_event_loop().time() < deadline:
                await asyncio.sleep(_POLL_INTERVAL_CARD)

                try:
                    poll = await client.get(
                        f"{self.BASE_URL}/v1/orders/{order_id}",
                        headers=self._headers,
                    )
                    poll_data = poll.json()
                except Exception as exc:
                    logger.warning("MP Point poll error: %s", exc)
                    continue

                status = poll_data.get("status", "created")
                audit.append({
                    "event": "poll",
                    "ts": datetime.utcnow().isoformat(),
                    "status": status,
                })

                if status in _ORDER_PENDING_STATUSES:
                    continue

                payments = poll_data.get("transactions", {}).get("payments", [])
                payment = payments[0] if payments else {}

                if status == "processed":
                    return TransactionResult(
                        status=TransactionStatus.approved,
                        provider_transaction_id=order_id,
                        nsu=str(payment.get("id", "")),
                        authorization=payment.get("status_detail") or "",
                        audit_events=audit,
                    )

                if status == "failed":
                    return TransactionResult(
                        status=TransactionStatus.refused,
                        provider_transaction_id=order_id,
                        error_message=payment.get("status_detail") or "Pagamento não autorizado no terminal",
                        audit_events=audit,
                    )

                # canceled ou expired
                return TransactionResult(
                    status=TransactionStatus.cancelled if status == "canceled" else TransactionStatus.expired,
                    provider_transaction_id=order_id,
                    error_message=f"Order retornou status: {status}",
                    audit_events=audit,
                )

        return TransactionResult(
            status=TransactionStatus.expired,
            provider_transaction_id=order_id,
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

        # Uma chave por chamada a _pix_payment (não por order_ref): os 3
        # attempts do retry abaixo reaproveitam a mesma, o que é correto (é a
        # mesma tentativa lógica); mas uma nova chamada — cliente pede um PIX
        # novo pro mesmo order_ref depois do primeiro expirar — precisa de
        # chave nova, senão o MP devolve o QR code antigo (expirado) em vez
        # de gerar um novo.
        idempotency_key = f"{order_ref}-{uuid.uuid4()}"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = None
            last_error = ""
            for attempt in range(3):
                if attempt > 0:
                    await asyncio.sleep(2.0)
                try:
                    resp = await client.post(
                        f"{self.BASE_URL}/v1/payments",
                        headers={**self._headers, "X-Idempotency-Key": idempotency_key},
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
        # IDs de order da API de Orders começam com "ORD"; IDs de pagamento PIX são numéricos
        if provider_transaction_id.startswith("ORD"):
            async with httpx.AsyncClient(timeout=10) as client:
                try:
                    resp = await client.post(
                        f"{self.BASE_URL}/v1/orders/{provider_transaction_id}/cancel",
                        headers={
                            **self._headers,
                            "X-Idempotency-Key": f"cancel-{provider_transaction_id}",
                        },
                    )
                    return resp.status_code in (200, 201)
                except Exception:
                    return False
        # PIX pending — let it expire (has date_of_expiration set at creation)
        return True

    async def refund_transaction(self, provider_transaction_id: str) -> RefundResult:
        # IDs de order da API de Orders começam com "ORD" (cartão); IDs de
        # pagamento PIX são numéricos — mesma distinção de cancel_transaction.
        is_card = provider_transaction_id.startswith("ORD")
        url = (
            f"{self.BASE_URL}/v1/orders/{provider_transaction_id}/refund"
            if is_card else
            f"{self.BASE_URL}/v1/payments/{provider_transaction_id}/refunds"
        )
        async with httpx.AsyncClient(timeout=15) as client:
            try:
                resp = await client.post(
                    url,
                    headers={
                        **self._headers,
                        "X-Idempotency-Key": f"refund-{provider_transaction_id}",
                    },
                    json={},  # sem amount/body = reembolso total, conforme doc oficial do MP
                )
            except Exception as exc:
                return RefundResult(success=False, error_message=str(exc))

        try:
            body = resp.json() if resp.content else None
        except Exception:
            body = None

        if resp.status_code in (200, 201):
            return RefundResult(success=True, raw_response=body)

        detail = (body or {}).get("message") or resp.text or f"HTTP {resp.status_code}"
        return RefundResult(success=False, error_message=detail, raw_response=body)

    def refund_window_days(self, method: str) -> int | None:
        # Prazo confirmado na documentação oficial do Mercado Pago: cartão
        # via Point (Orders API) aceita reembolso até 90 dias da aprovação;
        # PIX (Payments API) até 180 dias. Restrição desta integração
        # específica, não uma regra genérica de pagamento — ver ORD-147.
        return 180 if method == "pix" else 90

    async def test_connection(self, terminal_ref: str) -> dict:
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.get(
                    f"{self.BASE_URL}/v1/users/me",
                    headers=self._headers,
                )
            except Exception as exc:
                return {"success": False, "detail": f"Erro ao conectar ao MP: {exc}"}

            if resp.status_code != 200:
                return {
                    "success": False,
                    "detail": f"Access token inválido (HTTP {resp.status_code})",
                }

            data = resp.json()
            label = data.get("email") or str(data.get("id", "ok"))

            if not terminal_ref:
                # Sem mp_device_id configurado ainda (ou terminal só usa PIX)
                # — nada mais a checar. Ver ORD-149.
                return {"success": True, "detail": f"MP conectado: {label}"}

            try:
                terminals_resp = await client.get(
                    f"{self.BASE_URL}/terminals/v1/list",
                    headers=self._headers,
                )
            except Exception as exc:
                return {"success": False, "detail": f"Erro ao consultar terminal no MP: {exc}"}

            if terminals_resp.status_code != 200:
                return {"success": False, "detail": "Erro ao consultar terminal no MP. Tente novamente."}

            terminals = terminals_resp.json().get("data", {}).get("terminals", [])
            device = next((t for t in terminals if t.get("id") == terminal_ref), None)

            if device is None:
                return {
                    "success": False,
                    "detail": "Terminal não encontrado na conta Mercado Pago — verifique o MP Device ID em Empresa > Terminais.",
                }

            if device.get("operating_mode") != "PDV":
                return {
                    "success": False,
                    "detail": "Terminal fora do modo PDV — corrija em Empresa > Terminais antes de continuar.",
                }

            return {"success": True, "detail": f"MP conectado: {label} (terminal em modo PDV)"}
