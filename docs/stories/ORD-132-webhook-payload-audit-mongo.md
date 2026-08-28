---
id: ORD-132
status: Ready
fase: 4
sprint: null
responsavel: Backend SR
estimativa: 3 pontos
---

# ORD-132 — Auditoria completa de payloads de pagamento no MongoDB (requests E responses/webhooks)

## Descrição
O payment-service grava em `ordin_audit.payment_events` os eventos síncronos de criação/cancelamento de transação (`order_create`, `poll`, `pix_create`) via `save_audit()`, chamado em `POST /payments` e `POST /payments/{id}/cancel` (`main.py:430` e `874`) — isso já funciona hoje (confirmado: 78 documentos reais no Mongo local, com o payload completo de request/response do `POST /v1/orders`).

O que falta: os webhooks assíncronos de retorno dos provedores — `payment_webhook_mercadopago` (`main.py:1193`), `payment_webhook_paygo` (`main.py:1243`) e a função `_handle_mp_notification` (`main.py:1142`) que o primeiro dispara em background — nunca chamam `save_audit()`. O payload bruto que o Mercado Pago envia de volta via webhook é processado (atualiza o status da transação no MySQL) mas descartado depois — só sobra `logger.info`/`logger.warning`, sem nenhum registro persistente no Mongo.

Diretriz do solicitante (prioridade máxima): **"tudo que enviamos aos provedores de pagamento e tudo que retorna deve ser gravado no mongo"** — toda interação com provedor de pagamento (request de criação, poll, callback/webhook assíncrono de confirmação, e a consulta de status feita em resposta ao webhook) precisa virar documento em `ordin_audit.payment_events`.

Distinção importante: isto **não é** o bug do ORD-055 (Done — incompatibilidade `motor`/`pymongo` que fazia a gravação síncrona falhar silenciosamente). Aquele já está corrigido. Esta história é sobre uma lacuna de cobertura que nunca existiu: os webhooks nunca tiveram chamada a `save_audit()`, independente do bug de dependência.

## Persona
**Compliance / Auditoria** e **Backend SR** — a trilha de auditoria de pagamentos (ARQUITETURA.md §12, mesma motivação do ORD-018/ORD-055) fica incompleta enquanto a metade assíncrona do ciclo de vida do pagamento não é auditável.

## Contexto
Descoberto investigando um pedido explícito do usuário de garantir rastreabilidade total de pagamento. Numa investigação de disputa/chargeback ou numa auditoria LGPD/PCI-DSS, hoje só existe o histórico do lado "saída" (o que mandamos pro MP), não o lado "entrada" (o que o MP mandou de volta) — que é justamente o dado que prova o resultado final da transação do ponto de vista do provedor.

---

## Explorer

## História
Como **Backend SR / Compliance responsável pela trilha de auditoria de pagamentos**, quero que todo payload recebido via webhook dos provedores de pagamento (Mercado Pago e, futuramente, PayGo) seja persistido em `ordin_audit.payment_events`, para que a auditoria de pagamentos cubra o ciclo completo — não só o que enviamos ao provedor, mas também tudo que ele nos retornou.

### Fluxo principal
1. Provedor de pagamento (Mercado Pago) envia notificação webhook para `POST /payments/webhook/mercadopago/{company_id}`
2. Payment-service recebe o payload bruto e valida a assinatura (`x-signature`), quando a empresa tem `webhook_secret` configurado
3. Payment-service persiste o payload bruto recebido em `ordin_audit.payment_events`
4. Payment-service processa a notificação normalmente (atualiza status da transação, notifica order-service) — comportamento inalterado
5. Retorna HTTP 200 ao Mercado Pago

### Fluxos alternativos / exceções
- Webhook não correlacionável a nenhuma transação conhecida: mesmo assim o payload é gravado no Mongo (rastro forense)
- Assinatura inválida: decisão de produto tomada — grava mesmo essas tentativas (`signature_valid=false`), resposta continua 401, payload não é processado
- MongoDB indisponível no momento do webhook: comportamento best-effort já estabelecido pelo ORD-055 (loga ERROR, não impede o retorno 200)
- Reentrega do mesmo webhook: cada entrega gera seu próprio documento, sem deduplicar
- Webhook PayGo: estrutura de auditoria pronta mesmo com parser de payload ainda placeholder

### Dependências
- Serviços envolvidos: payment-service apenas
- Depende de `infrastructure/mongo.py::save_audit()`, já existente e funcional (ORD-055, Done)
- Sem impacto em frontend/UI

### Critérios de aceite funcionais
- [x] Toda chamada recebida em `payment_webhook_mercadopago` (tipos `payment` e `order`) grava um documento em `ordin_audit.payment_events`
- [x] Webhook não correlacionável ainda é gravado
- [x] Falha de gravação no Mongo não impede o retorno HTTP 200 ao provedor
- [x] Documentos incluem `company_id`
- [x] `payment_webhook_paygo` segue o mesmo padrão de auditoria
- [x] Teste automatizado cobre os cenários acima

### Wireframe / Mockup
N/A — história 100% backend/infraestrutura.

---

## QA Explorer

### Decisão de produto (ponto em aberto resolvido)
Webhooks com assinatura inválida **são auditados** (`signature_valid=false`), pelo valor forense/segurança — custo marginal de uma gravação Mongo best-effort.

```gherkin
Feature: Auditoria completa de payloads de webhook de pagamento no MongoDB
  Como Backend SR / Compliance
  Quero que todo payload recebido via webhook dos provedores de pagamento seja persistido em ordin_audit.payment_events
  Para que a auditoria cubra o ciclo completo do pagamento

  Background:
    Dado que o payment-service está no ar com MONGO_URL configurado e acessível
    E existe uma transação pendente com transaction_id=500, order_ref="P900001", company_id=1, provider="mercadopago"

  Scenario: Webhook MP type=payment (PIX) grava payload no Mongo e correlaciona a transação
    Dado que a empresa 1 tem webhook_secret configurado
    Quando o Mercado Pago envia POST /payments/webhook/mercadopago/1 com type=payment, data.id="123456789" e assinatura válida
    Então a resposta é 200
    E existe em ordin_audit.payment_events um documento com event="webhook_received", webhook_type="payment", transaction_id=500, company_id=1, signature_valid=true

  Scenario: Webhook MP type=order (cartão/Point) grava payload no Mongo e correlaciona a transação
    Quando o Mercado Pago envia POST /payments/webhook/mercadopago/1 com type=order, data.id="ORD01ABC..." e assinatura válida
    Então a resposta é 200
    E existe em ordin_audit.payment_events um documento com webhook_type="order" correlacionado

  Scenario: Webhook não correlacionável ainda é gravado
    Quando o Mercado Pago envia POST /payments/webhook/mercadopago/1 com data.id="999999999" (desconhecido)
    Então a resposta é 200
    E existe um documento com transaction_id=null, correlated=false

  Scenario: Assinatura inválida é rejeitada mas o payload ainda é auditado
    Quando é enviado POST /payments/webhook/mercadopago/1 com x-signature inválida
    Então a resposta é 401
    E existe um documento com signature_valid=false
    E nenhuma transação é atualizada

  Scenario: Falha de conexão Mongo não impede a resposta 200 ao provedor
    Dado que o MongoDB está inacessível
    Quando o Mercado Pago envia um webhook válido
    Então a resposta ainda é 200
    E é emitida uma linha de log ERROR

  Scenario: Reentrega do mesmo webhook gera um novo documento por entrega
    Dado um webhook com data.id="123456789" já auditado uma vez
    Quando o Mercado Pago reenvia a mesma notificação
    Então existem 2 documentos distintos para o mesmo data.id

  Scenario: Webhook PayGo segue o mesmo padrão de auditoria
    Quando o PayGo envia POST /payments/webhook/paygo
    Então existe um documento com provider="paygo"

  Scenario: Isolamento multi-tenant
    Dado webhooks das empresas 1 e 2
    Quando consultado filtrando company_id=1
    Então nenhum documento de company_id=2 aparece
```

**Cenários revisados e aprovados pelo PM.**

---

## Tech Explorer

### Serviços impactados
- **payment-service** apenas — mudanças em `main.py`.

### Schema do documento (`ordin_audit.payment_events`)
```json
{
  "event": "webhook_received",
  "provider": "mercadopago",
  "webhook_type": "payment",
  "company_id": 1,
  "transaction_id": 500,
  "order_ref": "P900001",
  "data_id": "123456789",
  "signature_valid": true,
  "correlated": true,
  "payload": { "...": "..." },
  "http_status": 200,
  "created_at": "2026-08-28T..."
}
```

### Mudanças de código (`services/payment/main.py`)
1. `payment_webhook_mercadopago` (~linha 1193): audita e loga a tentativa antes de `raise HTTPException(401, ...)` quando a assinatura é inválida; passa `company_id` para `_handle_mp_notification` via `background_tasks.add_task`.
2. `_handle_mp_notification` (~linha 1142): assinatura passa a receber `company_id`; após a busca de `tx` (encontrada ou não), chama `save_audit()` com `correlated=tx is not None`.
3. `_mp_fetch_and_update` / `_mp_order_fetch_and_update` (~linhas 1060, 1099): audita a chamada de saída GET ao MP com `event="webhook_status_check"`.
4. `payment_webhook_paygo` (~linha 1231): audita com `provider="paygo"`, `company_id=None` (rota não tem `company_id` no path — limitação conhecida, fora de escopo mudar o contrato agora).

### Migrations
Nenhuma.

### Eventos de fila
Não aplicável.

### Impacto em outros serviços
Nenhum.

### Testes
6 testes novos em `services/payment/tests/test_payment.py` e `test_coverage.py`, mockando `main.save_audit` com `AsyncMock` — cobrindo os 8 cenários Gherkin (alguns cenários compartilham teste, ex. Mongo indisponível já é coberto pela suíte do ORD-055 em `infrastructure/mongo.py`, não precisa duplicar).

### Estimativa
- Backend: 3 pontos.

### Riscos
- Baixo — volume de escrita no Mongo aumenta (best-effort, assíncrono, sem impacto em latência percebida).
- Baixo — mudança de assinatura de `_handle_mp_notification` tem único chamador no mesmo arquivo.
- Sem conflito com `docs/ARQUITETURA.md`.

---

## Ready

### Checklist de entrada

**Explorer (PM + Produto)**
- [x] História no formato Como/Quero/Para
- [x] Contexto e motivação documentados
- [x] Fluxo principal descrito passo a passo
- [x] Dependências identificadas (nenhuma — só payment-service)
- [x] Wireframe/mockup — N/A
- [x] Critérios de aceite funcionais escritos

**QA Explorer (QA)**
- [x] Happy path em Gherkin (webhook payment e order)
- [x] Cenários de borda (não correlacionável, reentrega)
- [x] Cenários de erro (assinatura inválida, Mongo indisponível)
- [x] Cenário de isolamento multi-tenant incluído
- [x] Cenários aprovados pelo PM

**Tech Explorer (Backend)**
- [x] Serviços impactados documentados
- [x] Mudanças de código com localização exata
- [x] Migrations necessárias descritas (nenhuma)
- [x] Eventos de fila documentados (nenhum aplicável)
- [x] Estimativa de esforço definida (3 pontos)
- [x] Riscos identificados com mitigação

**Aprovação final**
- [x] Time (usuário) revisou e aprovou a solução técnica ("aprovado vamos em frente")
- [x] Estimativa acordada
- [x] Sem bloqueios não resolvidos
- [x] Priorização no sprint — aprovada para implementação imediata pelo solicitante

**Status: Ready** — apta para implementação.
