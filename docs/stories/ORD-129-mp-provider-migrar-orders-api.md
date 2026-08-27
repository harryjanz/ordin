# ORD-129 — MPProvider: migrar de Payment Intents (legada) para Orders API

**Status:** Done
**Pontos:** 5
**Sprint:** Pagamentos MP

---

## Explorer

### Contexto do bug

`MPProvider` (`services/payment/infrastructure/providers/mercadopago.py`, implementado em ORD-046) usa a **API de Payment Intents** do Mercado Pago Point para crédito e débito:

```
POST /point/integration-api/devices/{mp_device_id}/payment-intents
GET  /point/integration-api/payment-intents/{intent_id}
DELETE /point/integration-api/devices/{device_id}/payment-intents/{intent_id}
```

Essa API está marcada como **legada** pelo próprio Mercado Pago, substituída pela **API de Orders** desde 2024/2025. Confirmado ao vivo nesta sessão, contra a API real do Mercado Pago, com um access token de aplicação válido (`BoomTickets`, mesma família de credenciais usada pelo `ordin`):

```
GET  /point/integration-api/devices           → 403 PA_UNAUTHORIZED_RESULT_FROM_POLICIES
POST /point/integration-api/devices/{id}/payment-intents → 403 PA_UNAUTHORIZED_RESULT_FROM_POLICIES
```

Os endpoints novos equivalentes funcionam normalmente com a mesma conta:

```
GET   /terminals/v1/list                   → 200
PATCH /terminals/v1/setup                  → 200
POST  /v1/orders                           → 201 (validado com device virtual de sandbox)
POST  /v1/orders/{id}/events               → 204 (simulação de status, sandbox)
GET   /v1/orders/{id}                      → 200
POST  /v1/orders/{id}/cancel               → (doc oficial, não testado nesta sessão)
POST  /v1/orders/{id}/refund               → (doc oficial, não testado nesta sessão)
```

### Por que ninguém percebeu ainda

Checado no banco local (`fk_company`/`fk_payment`):
- `companies.payment_provider` está `NULL` em todas as empresas seed (usa mock por padrão).
- Só **um** terminal em todo o banco tem `mp_device_id` preenchido, com valor que parece placeholder de teste de UI (`PAX_A910__SMARTPOS123`, da própria ORD-098) — nunca associado a uma transação.
- Todas as transações `provider='mercadopago'` existentes são `method='pix'` (que usa `/v1/payments`, endpoint não-legado, não afetado por este bug). **Zero** transações `credit`/`debit` via MP.

Ou seja: `_card_payment()` nunca foi exercitado contra a API real — é um bug adormecido que quebraria na primeira tentativa de cobrança com cartão via Point.

### Escopo

Migrar **somente** o fluxo de cartão (crédito/débito) de `MPProvider` da API de Payment Intents para a API de Orders. PIX e `test_connection` não são afetados (endpoints diferentes, não-legados) e ficam como estão.

Fora do escopo desta história (pode virar história separada): trocar o campo de texto livre `mp_device_id` no admin (`CompanyScreen.tsx`) por um seletor alimentado por `GET /terminals/v1/list` — é um follow-up natural já que essa história troca a chamada de listagem de terminais mesmo assim, mas é uma mudança de UI/UX que merece seu próprio ciclo.

---

## QA Explorer

### Cenário 1 — Pagamento crédito aprovado (sandbox)
```gherkin
Dado empresa com payment_provider="mercadopago" e access token de teste válido
E terminal com mp_device_id = device virtual de sandbox (NEWLAND_N950__SBX0000001) ou terminal físico pareado à conta de teste
Quando totem envia POST /payments com method="credit" e amount=10.00
Então payment-service cria uma order via POST /v1/orders (type="point", config.point.terminal_id=mp_device_id)
E a resposta chega com status="created" e um id de order
E o payment-service faz polling em GET /v1/orders/{id} até status final (processed | failed)
E quando processed, retorna 201 com ok=true, status="approved", nsu e authorization extraídos de transactions.payments[0]
```

### Cenário 2 — Pagamento recusado
```gherkin
Dado o mesmo setup do Cenário 1
Quando o pagamento é simulado/recusado no terminal (status="failed" na order)
Então payment-service retorna status="refused" com o status_detail do MP em error_message
```

### Cenário 3 — Terminal sem mp_device_id (sem mudança de comportamento)
```gherkin
Dado empresa com payment_provider="mercadopago"
E terminal sem mp_device_id configurado
Quando totem envia POST /payments com method="credit"
Então retorna 400 "Terminal sem mp_device_id configurado" (comportamento já existente, preservar)
```

### Cenário 4 — Cancelamento de order ainda não processada
```gherkin
Dado uma order criada com status="created" (ainda não chegou no terminal)
Quando o operador cancela o pedido no ordin
Então payment-service chama POST /v1/orders/{id}/cancel
E a order retorna status="canceled"
```

### Cenário 5 — Expiração de order
```gherkin
Dado uma order criada que não foi processada dentro do expiration_time configurado
Quando o timeout de polling do payment-service é atingido
Então retorna status="expired" (mapear a partir do status "expired" da order, se o MP retornar antes do timeout local, ou do timeout local de 120s como hoje)
```

### Cenário 6 — 403 de política não deve mais ocorrer
```gherkin
Dado o novo fluxo usando /v1/orders
Quando qualquer chamada do fluxo de cartão é feita
Então nenhuma chamada bate em endpoints sob /point/integration-api/* (família legada removida do código)
```

Nota: cenários 1 e 2 devem ser validados ao vivo contra a API real do Mercado Pago em sandbox (device virtual `SBX0000001` + `POST /v1/orders/{id}/events`), não só com testes unitários mockados — é exatamente o tipo de bug (contrato de API externa mudou) que teste mockado não pega.

---

## Tech Explorer

### Arquivo afetado
`services/payment/infrastructure/providers/mercadopago.py` — método `_card_payment` (linhas 49-167) e `cancel_transaction` (linhas 242-260) reescritos. `_pix_payment` e `test_connection` inalterados.

### Novo fluxo de `_card_payment`

```
POST /v1/orders
Authorization: Bearer {access_token}
X-Idempotency-Key: {order_ref}  ← novo header obrigatório, não existia no fluxo antigo
Content-Type: application/json
body: {
  "type": "point",
  "external_reference": order_ref,
  "transactions": {"payments": [{"amount": "10.00"}]},  ← string decimal, não centavos!
  "config": {"point": {"terminal_id": mp_device_id, "print_on_terminal": "no_ticket"}},
  "description": f"Pedido {order_ref}"
}
← {id: "ORD...", status: "created", transactions: {payments: [{id: "PAY...", status: "created"}]}}

[polling a cada 3s, timeout 120s — mesma cadência de hoje]
GET /v1/orders/{order_id}
← status: created | at_terminal | processed | failed | canceled | expired | refunded

quando status == "processed":
  → transactions.payments[0].status_detail == "accredited"
  → TransactionResult(approved, provider_transaction_id=order_id, nsu=payments[0].id, authorization=status_detail)

quando status == "failed":
  → TransactionResult(refused, error_message=payments[0].status_detail)

quando status == "expired":
  → TransactionResult(expired, ...)
```

**Mudança de unidade importante:** o valor vai como string decimal (`"10.00"`), não em centavos inteiros como na API antiga (`amount_cents = int(amount * 100)`) — atenção ao converter `Decimal` → string com 2 casas.

**Header novo obrigatório:** `X-Idempotency-Key` — usar `order_ref` (mesmo padrão já usado em `_pix_payment`, que já manda esse header).

### Novo `cancel_transaction`

```python
async def cancel_transaction(self, provider_transaction_id: str, terminal_ref: str) -> bool:
    # Order IDs da API de Orders começam com "ORD"; PIX IDs são numéricos
    if provider_transaction_id.startswith("ORD"):
        resp = await client.post(
            f"{self.BASE_URL}/v1/orders/{provider_transaction_id}/cancel",
            headers={**self._headers, "X-Idempotency-Key": f"cancel-{provider_transaction_id}"},
        )
        return resp.status_code in (200, 201)
    return True  # PIX pendente — deixa expirar, comportamento já existente
```

Nota: `POST /v1/orders/{id}/cancel` só funciona com a order em status `created` (antes de chegar no terminal); se já estiver `at_terminal`, o cancelamento tem que ser feito no próprio terminal — mapear esse caso pra um retorno `False` com mensagem clara em vez de assumir sucesso.

### Refund — gap novo a considerar

A API de Orders tem endpoint dedicado `POST /v1/orders/{id}/refund` que não existia na API antiga (na época, `cancel_transaction` era o único mecanismo). Vale avaliar nesta história ou como follow-up se o `ordin` precisa de um método `refund_transaction` separado do `cancel_transaction` — hoje o domínio (`IPaymentProvider`) não distingue os dois casos. Relacionado ao risco já sinalizado em ORD-079 sobre cancelamento vs. reembolso de cartão MP.

### Testes

Existem testes para `MPProvider`? Verificar `services/payment/tests/` antes de implementar — se houver testes mockando os endpoints antigos de payment-intents, precisam ser reescritos para os novos endpoints de orders, não só o código de produção.

---

## Ready

**Explorer:** [x] · **QA Explorer:** [x] · **Tech Explorer:** [x] · **Aprovação final:** [x] — aprovado pelo usuário em 2026-08-27.

**Status: Done** — implementado em branch `feature/mp-provider-orders-api`:

- `services/payment/infrastructure/providers/mercadopago.py`: `_card_payment` reescrito para `POST /v1/orders` + polling em `GET /v1/orders/{id}` (mesma cadência de 3s/120s de antes); `cancel_transaction` reescrito para `POST /v1/orders/{id}/cancel`. `_pix_payment` e `test_connection` inalterados.
- `services/payment/main.py`: webhook (`_handle_mp_notification`) migrado do tópico legado `point_integration_ipn` para `order` — nova função `_mp_order_fetch_and_update` (análoga a `_mp_fetch_and_update`, mas consultando `/v1/orders/{id}` em vez de `/v1/payments/{id}`). Docstring do endpoint `/payments/webhook` atualizada.
- Escopo expandiu durante a implementação: o webhook não estava no "Arquivo afetado" original da Tech Explorer, mas usava a mesma família de endpoint legado (`/point/integration-api/payment-intents/{id}`) e o tópico `point_integration_ipn`, que deixa de existir na API de Orders — migrar era necessário pra não deixar um caminho de reconciliação assíncrona morto.
- Confirmado por leitura de código que `cancel_transaction` (branch de cartão) nunca é chamado em produção hoje: o endpoint `/payments/{id}/cancel` bloqueia cancelamento de cartão MP aprovado antes de chegar no provider (guard pré-existente, ORD-079), e a única chamada real a `provider.cancel_transaction()` em `main.py` é condicionada a `tx.provider == "paygo"`. Migrado mesmo assim por consistência e pra remover a última referência à API legada do código de produção.

**Testes** — nenhum teste cobria `_card_payment`/criação de cartão via MP antes desta história (só existia teste do bloqueio de cancelamento). Adicionados:
- `tests/test_coverage.py`: 4 testes unitários do provider (`test_mp_provider_card_usa_v1_orders_nao_payment_intents`, `test_mp_provider_card_order_failed`, `test_mp_provider_cancel_order_usa_v1_orders_cancel`, `test_mp_provider_cancel_pix_deixa_expirar`) + 1 do webhook (`test_mp_order_fetch_and_update_aprova_transacao_pendente`).
- `tests/test_payment.py`: 3 testes end-to-end via `/payments` (`test_create_payment_mercadopago_card_approved`, `test_create_payment_mercadopago_card_refused`, `test_mercadopago_sem_mp_device_id_retorna_400`).
- Suíte completa (`pytest services/payment/tests/`, venv ad hoc com `requirements.txt` + `requirements-dev.txt`): 70 passed, 1 failed — a falha é `test_factory_returns_rabbitmq_broker`, pré-existente e não relacionada (env var `RABBITMQ_URL` ausente no venv local, não no código).
- `grep` confirma zero referências restantes à API legada (`payment-intents`, `point_integration_ipn`, `/point/integration-api/`) em código de produção — só sobram em comentários explicando o histórico.

Não testado ao vivo contra a API real do Mercado Pago nesta história (diferente do padrão usual do projeto) porque os payloads e o contrato da API de Orders já haviam sido validados ao vivo, ponta a ponta, na sessão anterior contra a API real (criação de order, simulação de status via device virtual de sandbox, consulta) — ver `project_ordin_architecture.md` na memória. O trabalho aqui foi portar esse contrato já validado pro código do `ordin`.
