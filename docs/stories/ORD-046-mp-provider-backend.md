# ORD-046 — Backend: MPProvider (crédito, débito e PIX)

**Status:** Ready  
**Pontos:** 5  
**Sprint:** Pagamentos MP

---

## Explorer

Implementar `MPProvider` — nova classe que implementa `IPaymentProvider` para o Mercado Pago. Cobre três métodos de pagamento:

| Método | API MP | Hardware |
|---|---|---|
| Crédito | Point Integration API | Terminal físico/`mp_device_id` |
| Débito | Point Integration API | Terminal físico/`mp_device_id` |
| PIX | Payments API | Nenhum — QR na tela |

O MP usa o **mesmo endpoint base** para sandbox e produção (`https://api.mercadopago.com`). O ambiente é diferenciado pelo `access_token` — tokens de teste começam com `TEST-`, produção com `APP_USR-`.

### Fluxo cartão (crédito/débito)

```
payment-service
  │  GET /internal/terminals/{id}  → company-service
  │  ← {mp_device_id, config: {api_key: access_token}}
  │
  │  POST /point/integration-api/devices/{mp_device_id}/payment-intents
  │  Authorization: Bearer {access_token}
  │  body: {amount (centavos), description, payment: {installments:1, type:"credit_card"}}
  │  ← {id: "7d8c70b6...", state: {value: "OPEN"}}
  │
  │  [polling a cada 3s, timeout 120s]
  │  GET /point/integration-api/payment-intents/{id}
  │  ← state.value: OPEN | ON_TERMINAL | FINISHED | CANCELED | ERROR
  │  ← quando FINISHED: payment.id → GET /v1/payments/{payment_id}
  │                                 ← status: approved | rejected
  │
  └─► TransactionResult(status, provider_transaction_id, nsu, authorization)
```

**Estados do payment intent (Point):**

| Estado | Ação |
|---|---|
| `OPEN` | Aguardando terminal aceitar — continuar polling |
| `ON_TERMINAL` | Terminal processando — continuar polling |
| `FINISHED` | Consultar `/v1/payments/{payment.id}` para status final |
| `CANCELED` | Cancelado pelo operador ou timeout |
| `ERROR` | Erro no terminal |

Quando `FINISHED`, o payment pode ser `approved` ou `rejected` — necessário buscar o payment para saber.

### Fluxo PIX

```
payment-service
  │  POST /v1/payments
  │  Authorization: Bearer {access_token}
  │  X-Idempotency-Key: {order_ref}
  │  body: {
  │    transaction_amount: 26.00,  ← float, não centavos!
  │    payment_method_id: "pix",
  │    payer: {email: "cliente@ordin.app"},  ← email genérico OK
  │    description: "Pedido {order_ref}"
  │  }
  │  ← {
  │    id: 123456,
  │    status: "pending",
  │    point_of_interaction: {
  │      transaction_data: {
  │        qr_code: "00020126...",       ← string para copiar/colar
  │        qr_code_base64: "iVBORw..."  ← imagem PNG em base64
  │      }
  │    }
  │  }
  │
  │  [polling a cada 5s, timeout 600s (10min)]
  │  GET /v1/payments/{id}
  │  ← status: pending | approved | cancelled | rejected
  │
  └─► TransactionResult(status, provider_transaction_id, qr_code, qr_code_base64)
```

### Extensão do TransactionResult

O PIX precisa retornar o QR para o totem exibir na tela. `TransactionResult` ganha dois campos opcionais:

```python
@dataclass
class TransactionResult:
    status: TransactionStatus
    provider_transaction_id: Optional[str] = None
    nsu: Optional[str] = None
    authorization: Optional[str] = None
    error_message: Optional[str] = None
    audit_events: list = field(default_factory=list)
    qr_code: Optional[str] = None         # NOVO — string EMV para copiar/colar
    qr_code_base64: Optional[str] = None  # NOVO — PNG base64 para exibir no totem
```

O endpoint `POST /payments` precisará retornar esses campos quando presentes:
```json
{
  "ok": true,
  "transaction_id": 42,
  "status": "processing",
  "qr_code": "00020126...",
  "qr_code_base64": "iVBORw..."
}
```

### cancel_transaction

Para cartão (Point): `DELETE /point/integration-api/devices/{device_id}/payment-intents/{intent_id}`
Para PIX: `POST /v1/payments/{id}/refunds` (reembolso total) ou deixar expirar (PIX expira em 30min)

### test_connection

Para MP não faz sentido testar com transação real de R$ 0,01 (MP tem valor mínimo). A conexão é validada via:
```
GET /v1/users/me   Authorization: Bearer {access_token}
← 200 com dados da conta → conexão OK
← 401 → token inválido
```

---

## QA Explorer

### Cenário 1 — Pagamento crédito aprovado (sandbox)
```gherkin
Dado empresa com payment_provider="mercadopago" e config sandbox válida
E terminal com mp_device_id configurado
Quando totem envia POST /payments com method="credit" e amount=10.00
Então payment-service cria payment intent no MP com amount=1000 (centavos)
E faz polling até state=FINISHED
E consulta /v1/payments/{id} e obtém status=approved
E retorna 201 com ok=true, status="approved"
E registra audit trail no MongoDB
```

### Cenário 2 — Pagamento PIX aprovado (sandbox)
```gherkin
Dado empresa com payment_provider="mercadopago" e config sandbox
Quando totem envia POST /payments com method="pix" e amount=10.00
Então payment-service cria pagamento PIX no MP
E retorna 201 com ok=true, status="processing", qr_code e qr_code_base64 preenchidos
E polling confirma status=approved quando PIX é pago
```

### Cenário 3 — PIX expirado (não pago em 10 min)
```gherkin
Dado um pagamento PIX criado há mais de 10 minutos sem pagamento
Quando o polling atinge o timeout (600s)
Então payment-service retorna status="expired"
E o pedido não é marcado como pago
```

### Cenário 4 — Terminal sem mp_device_id
```gherkin
Dado empresa com payment_provider="mercadopago"
E terminal sem mp_device_id configurado
Quando totem envia POST /payments com method="credit"
Então retorna 400 "Terminal sem mp_device_id configurado"
```

### Cenário 5 — Access token inválido (test_connection)
```gherkin
Dado empresa com access_token inválido
Quando payment-service chama test_connection
Então GET /v1/users/me retorna 401
E test_connection retorna {success: false, detail: "Access token inválido"}
```

### Cenário 6 — Idempotência do PIX
```gherkin
Dado que um PIX foi criado com X-Idempotency-Key: order_ref
Quando o totem faz retry da mesma requisição (falha de rede)
Então o MP retorna o mesmo pagamento PIX (sem criar duplicata)
```

---

## Tech Explorer

### Arquivo novo
`services/payment/infrastructure/providers/mercadopago.py`

### Estrutura
```python
class MPProvider(IPaymentProvider):
    BASE_URL = "https://api.mercadopago.com"
    POLL_INTERVAL_CARD = 3   # segundos
    POLL_TIMEOUT_CARD  = 120 # segundos
    POLL_INTERVAL_PIX  = 5   # segundos
    POLL_TIMEOUT_PIX   = 600 # 10 minutos

    def __init__(self, config: ProviderConfig):
        self.access_token = config.api_key  # já descriptografado pelo company-service
        self.headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    async def create_transaction(self, amount, method, terminal_ref, order_ref):
        if method in ("credit", "debit"):
            return await self._card_payment(amount, method, terminal_ref, order_ref)
        elif method == "pix":
            return await self._pix_payment(amount, order_ref)
        raise ValueError(f"Método {method} não suportado pelo MPProvider")

    async def _card_payment(self, amount, method, device_id, order_ref): ...
    async def _pix_payment(self, amount, order_ref): ...
    async def _poll_intent(self, intent_id): ...
    async def _poll_pix(self, payment_id): ...
    async def cancel_transaction(self, provider_transaction_id, terminal_ref): ...
    async def test_connection(self, terminal_ref): ...
```

### Factory — adicionar MP
```python
# infrastructure/factory.py
case "mercadopago": return MPProvider(config)
```

### PROVIDER_BASE_URLS — adicionar MP
```python
PROVIDER_BASE_URLS["mercadopago"] = {
    "sandbox":    "https://api.mercadopago.com",
    "production": "https://api.mercadopago.com",
}
# (mesma URL — ambiente diferenciado pelo access_token)
```

### PaymentOut — endpoint POST /payments
Adicionar campos opcionais ao response:
```python
class PaymentOut(BaseModel):
    ok: bool
    transaction_id: int
    status: str
    nsu: Optional[str]
    authorization: Optional[str]
    amount: float
    qr_code: Optional[str] = None
    qr_code_base64: Optional[str] = None
```

### Dependência nova
```
httpx  ← já usado pelo auth-service, adicionar ao requirements do payment-service se ausente
```
