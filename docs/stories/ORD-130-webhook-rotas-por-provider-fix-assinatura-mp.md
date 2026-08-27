# ORD-130 — Webhooks por provider (rota dedicada) + corrige assinatura Mercado Pago

**Status:** Ready
**Pontos:** 5
**Sprint:** Pagamentos MP

---

## Explorer

### Dois problemas relacionados, achados na mesma sessão de validação ao vivo (ORD-129)

**1. Bug de segurança confirmado ao vivo contra a API real**: `_verify_mp_signature` (`services/payment/main.py`) usa um manifest de assinatura **incorreto**. Capturei a notificação real do Mercado Pago via ngrok inspector após uma cobrança de cartão de verdade (R$1,00, aprovada, cartão Mastercard) e comparei com a fórmula oficial:

| | Manifest usado |
|---|---|
| Código atual (errado) | `id:{x-request-id};request-date:{ts};` |
| Fórmula oficial do MP | `id:{data.id, minúsculas};request-id:{x-request-id};ts:{ts};` |

Dois erros: usa o `X-Request-Id` no lugar do `data.id` (que vem da **query string**, não do body — ex.: `?data.id=ORD01M10M7YZ1CN8NJRVX32EX1B76`, e precisa virar minúsculas antes do hash), e falta completamente o campo `request-id:`. Resultado: toda validação de assinatura de webhook MP sempre falha (401 "assinatura inválida" descartando a notificação) — confirmado com a requisição real, não é hipotético. Isso vale tanto pra PIX quanto pra Point/Orders — nenhum webhook MP jamais foi validado corretamente neste projeto.

**2. Problema de arquitetura**: hoje existe uma única rota `POST /payments/webhook?source=mercadopago|paygo` com lógica de todos os providers ramificada por dentro de uma função só. Cada provider de pagamento tem formato de assinatura, payload e semântica de notificação completamente diferentes (o MP usa `x-signature` HMAC com manifest específico; o PayGo/ControlPay usa outro mecanismo, ainda nem implementado — só um placeholder). Conforme mais providers forem adicionados (Pagar.me/Adyen, conforme `IPaymentProvider` já prevê na Fase 2), amontoar tudo numa rota com `if/elif source==` vira uma bagunça e mistura validação de segurança de um provider com a de outro no mesmo bloco de código.

### Escopo

1. Trocar a rota única por rotas dedicadas por provider: `POST /payments/webhook/mercadopago` e `POST /payments/webhook/paygo` (a de PayGo mantém o placeholder atual — implementar de verdade fica pra quando a estrutura real do ControlPay Webservice for confirmada, não é escopo aqui).
2. Corrigir `_verify_mp_signature` pra usar o manifest oficial, extraindo `data.id` da query string (não do body) e aplicando lowercase.
3. Depois de mergeado, **reconfigurar a URL do webhook no painel do Mercado Pago** (aplicação ORDIN) de `.../payments/webhook` para `.../payments/webhook/mercadopago` — passo manual, não dá pra fazer via API.

Fora do escopo: implementar de fato a rota do PayGo (o ControlPay Webservice ainda não tem payload confirmado, conforme nota já existente no código) — só criar o lugar certo pra isso morar.

---

## QA Explorer

### Cenário 1 — Assinatura válida é aceita
```gherkin
Dado uma notificação de order.processed do Mercado Pago com x-signature calculado
  corretamente pelo manifest oficial (id:{data.id minúsculo};request-id:{x-request-id};ts:{ts};)
Quando POST /payments/webhook/mercadopago é chamado com esse payload e headers
Então a notificação é aceita (200) e processada em background
```

### Cenário 2 — Assinatura inválida é rejeitada
```gherkin
Dado uma notificação com x-signature incorreto (adulterado ou de outra origem)
Quando POST /payments/webhook/mercadopago é chamado
Então retorna 401 "Assinatura inválida" e a notificação não é processada
```

### Cenário 3 — Regressão do bug real (teste que trava o comportamento antigo)
```gherkin
Dado o payload e os headers exatos capturados na validação ao vivo desta sessão
  (data.id="ORD01M10M7YZ1CN8NJRVX32EX1B76", x-request-id="fb1f1d8a-fa22-405f-8158-1af07dff0feb",
  x-signature="ts=1787801538,v1=30aa7d9868783878341c593d228aa53b736fbf042adba4c56341ebb588b5889a")
Quando a assinatura é validada com o secret correto e o manifest novo
Então o resultado bate com o v1 recebido (prova que o formato novo é o que o MP realmente usa)
```

### Cenário 4 — Rota PayGo existe e não quebra nada
```gherkin
Dado o endpoint POST /payments/webhook/paygo
Quando qualquer payload é enviado
Então retorna 200 (mesmo comportamento placeholder de hoje, só que na rota própria)
```

### Cenário 5 — Rota antiga não existe mais (ou redireciona)
```gherkin
Dado a rota antiga POST /payments/webhook?source=mercadopago
Quando chamada após o deploy desta história
Então não deve mais processar nada silenciosamente em rota errada — 404 é aceitável,
  já que a migração exige atualizar a URL no painel do MP de qualquer forma
```

---

## Tech Explorer

### Arquivo afetado
`services/payment/main.py` — `payment_webhook` (linha 1136), `_verify_mp_signature` (linha ~1016), `_handle_mp_notification` (linha ~1061, sem mudança de lógica interna, só de onde é chamada).

### Nova assinatura de `_verify_mp_signature`

```python
def _verify_mp_signature(secret: str, data_id: str, request_id: str, ts: str, v1: str) -> bool:
    manifest = f"id:{data_id.lower()};request-id:{request_id};ts:{ts};"
    expected = hmac.new(secret.encode(), manifest.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v1)
```

### Extração do `data.id` — da query string, não do body

```python
data_id = request.query_params.get("data.id", "")
```

Isso é diferente do `data_id` usado hoje dentro de `_handle_mp_notification` (que lê `payload.get("data", {}).get("id", "")` do **body** pra decidir qual Transaction atualizar) — os dois valores devem ser iguais na prática (o MP manda o mesmo id nos dois lugares), mas a validação de assinatura especificamente exige o valor da query string conforme a doc oficial.

### Rotas novas

```python
@app.post("/payments/webhook/mercadopago", status_code=200, response_model=WebhookOut, tags=["Pagamentos"])
async def payment_webhook_mercadopago(request: Request, background_tasks: BackgroundTasks):
    body = await request.body()
    if MP_WEBHOOK_SECRET:
        data_id = request.query_params.get("data.id", "")
        sig_header = request.headers.get("x-signature", "")
        request_id = request.headers.get("x-request-id", "")
        ts = v1 = ""
        for part in sig_header.split(","):
            k, _, v = part.partition("=")
            if k.strip() == "ts":
                ts = v.strip()
            elif k.strip() == "v1":
                v1 = v.strip()
        if not _verify_mp_signature(MP_WEBHOOK_SECRET, data_id, request_id, ts, v1):
            logger.warning("Webhook MP: assinatura inválida — descartando")
            raise HTTPException(401, "Assinatura inválida")
    try:
        payload = _json.loads(body)
    except Exception:
        return {"ok": True}
    background_tasks.add_task(_handle_mp_notification, payload)
    return {"ok": True}


@app.post("/payments/webhook/paygo", status_code=200, response_model=WebhookOut, tags=["Pagamentos"])
async def payment_webhook_paygo(request: Request):
    # PayGo notifica via callback configurado no request de pagamento.
    # Estrutura a confirmar com ControlPay Webservice — implementar quando disponível.
    return {"ok": True}
```

A rota antiga `/payments/webhook` (com `source` query param) é removida — não mantida como alias, pra não deixar dois caminhos fazendo a mesma coisa de formas diferentes.

### Passo manual pós-merge

Depois do deploy: painel MP → aplicação ORDIN → Webhooks → atualizar URL de `.../payments/webhook` para `.../payments/webhook/mercadopago`. Sem isso, a notificação continua chegando na rota antiga (que não existe mais → 404 → MP tenta reentrega algumas vezes e desiste).

### Testes

Nenhum teste cobre o endpoint de webhook hoje (confirmado por grep). Criar testes novos do zero pros cenários 1-4 da QA Explorer, incluindo o caso de regressão (cenário 3) com os valores reais capturados nesta sessão — é o tipo de teste mais valioso aqui, porque prova contra dado real, não só contra a interpretação da doc.

---

## Ready

**Explorer:** [x] · **QA Explorer:** [x] · **Tech Explorer:** [x] · **Aprovação final:** [x] — aprovado pelo usuário em 2026-08-27.

**Status: Done** — implementado em branch `feature/webhook-rotas-provider-fix-assinatura-mp`:

- `services/payment/main.py`: `_verify_mp_signature` corrigida (manifest `id:{data.id minúsculo};request-id:{x-request-id};ts:{ts};`, `data.id` extraído da query string). Rota única `/payments/webhook?source=` substituída por `/payments/webhook/mercadopago` e `/payments/webhook/paygo`.
- 9 testes novos (`test_coverage.py`: 3 unitários de `_verify_mp_signature`, incluindo teste de regressão com dado real; `test_payment.py`: 6 de endpoint cobrindo as duas rotas novas e a rejeição de assinatura inválida). Suíte completa: 78 passed, 1 failed (pré-existente, não relacionado).
- **Validação definitiva ao vivo**: reenviei a requisição HTTP exata capturada via ngrok inspector da cobrança real de R$1,00 desta sessão (mesmo body, `X-Signature`, `X-Request-Id`, `MP_WEBHOOK_SECRET` real) contra o `payment-service` rebuildado rodando local — aceito com `200 OK`, sem erro de assinatura. Prova que a correção bate exatamente com o formato que o Mercado Pago usa em produção, não só com a interpretação da doc.

**Passo manual pendente, só o usuário faz**: atualizar a URL do webhook no painel Mercado Pago (aplicação ORDIN) de `.../payments/webhook` para `.../payments/webhook/mercadopago` — a rota antiga não processa mais nada (responde 405 por colisão estrutural com `DELETE /payments/{tx_id}`, não 200 silencioso como antes).
