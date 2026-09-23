---
id: ORD-200
status: Ready
estimativa: 5 pontos (revisa a estimativa original do épico, 3 pontos — ver seção Estimativa)
---

# D2 — Estorno automático de pagamento quando a baixa de estoque falha

## Descrição

D1 (`ORD-198`, mergeado) decrementa o estoque na aprovação do pagamento, mas hoje só loga a falha
real (indisponibilidade/timeout/5xx do `catalog-service`) via `logger.error` — sem sinalizar nada
pra quem chamou, sem nenhuma ação de reconciliação. D2 fecha essa lacuna: quando o decremento falha
de verdade (não quando o saldo fica negativo por concorrência — isso já é sucesso em D1), o
pagamento já aconteceu fisicamente na maquininha (mesmo racional já estabelecido em D1 — não dá pra
"bloquear" nesse ponto), então a única saída é reverter a cobrança automaticamente, sem intervenção
manual.

## Persona

Empresa (dona do estabelecimento) — não quer descobrir depois, numa auditoria manual, que cobrou um
cliente por um item que na hora H não tinha mais estoque de verdade (falha rara de infraestrutura);
quer que o sistema reverta a cobrança sozinho nesse caso raro, sem intervenção manual.

## Contexto

Fecha o Bloco D do épico de estoque/ERP (com D1, já mergeado) — os dois juntos destravam o Bloco E
(ficha técnica, 24 pontos), motivo de ser do módulo pro caso de uso principal do Ordin.

Achado real que corrigiu a estimativa original do épico ("D2 reaproveita `_try_cancel_fiscal_document`,
3 pontos"): `_try_cancel_fiscal_document` (`main.py:421`) só cancela o **documento fiscal** (NFC-e),
não a transação de pagamento em si — é chamado de *dentro* de `cancel_payment`
(`POST /payments/{tx_id}/cancel`, `main.py:1294`) e `refund_payment`
(`POST /payments/{tx_id}/refund`, `main.py:1400`), como último passo depois que a transação já foi
cancelada/reembolsada no provider. D2 precisa reverter a **transação**, não só o documento fiscal.

Complicador adicional: `cancel_payment` e `refund_payment` não são intercambiáveis —
`cancel_payment` (PayGo/mock, best-effort, marca `tx.status="cancelled"` independente do resultado
do provider) rejeita explicitamente transação Mercado Pago (400, "use /refund"); `refund_payment`
(só Mercado Pago) só marca `tx.status="refunded"` se o provider confirmar de verdade (senão
`HTTPException(502)`, status local não muda). D2 precisa decidir qual dos dois fluxos usar
dependendo do provider da transação que falhou.

Mais um complicador: ambos os endpoints exigem `Depends(require_write_role)` — só
`admin`/`owner`/`manager`/`superadmin` (`_WRITE_ROLES`, `main.py:129`) podem chamar; o totem usa JWT
`kiosk` (fora desse conjunto). D2 é disparado de dentro do fluxo de aprovação de pagamento (JWT
`kiosk` ou nenhum JWT, nos 3 caminhos assíncronos de MP) — não pode chamar os endpoints HTTP
existentes, precisa extrair a lógica de cancelamento/reembolso pra função(ões) internas reutilizáveis,
do mesmo jeito que `emit_nfce_if_active` e `_decrementar_estoque_venda` (D1) já são funções internas
chamadas de múltiplos pontos, não endpoints.

## História

Como Empresa (dona do estabelecimento), quero que uma cobrança seja revertida automaticamente
quando o sistema falha em de verdade baixar o estoque do que foi vendido, para nunca ficar com
dinheiro cobrado de um item que não pôde ser contabilizado como vendido.

## Fluxo principal

1. Pagamento é aprovado em qualquer um dos 4 pontos onde `Transaction.status` vira `"approved"`
   (`create_payment` síncrono via PayGo/mock, + 3 caminhos assíncronos de confirmação Mercado Pago —
   webhook, polling de status, reconciliação) — mesmos 4 pontos onde D1 já chama
   `_decrementar_estoque_venda`.
2. `_decrementar_estoque_venda(order_ref)` (D1) muda de assinatura: `-> None` vira `-> bool`.
   Retorna `True` pros dois casos de "nada a fazer" (pedido não encontrado no order-service, nenhum
   item com CFOP 5102) **e** pro caso de sucesso real — só retorna `False` quando a chamada
   `POST /internal/stock/decrement` em si falha de verdade (indisponibilidade, timeout, 5xx).
3. Se `False`, o ponto de chamada aciona `_estornar_pagamento_automatico(tx.id, motivo)` — dispatcher
   novo, função de nível de módulo, sem HTTP, sem JWT.
4. O dispatcher abre sua própria sessão de banco (`AsyncSessionLocal()`, mesmo padrão de
   `_try_cancel_fiscal_document`), rebusca a `Transaction` por id, e decide pelo `tx.provider`:
   - `paygo`/`mock` → `_cancel_transaction_core(db, tx, motivo)` (extraída de `cancel_payment`).
   - `mercadopago` → `_refund_transaction_core(db, tx, motivo, actor_user_id=None)` (extraída de
     `refund_payment`).
5. Em caso de sucesso do estorno, o dispatcher sempre chama `_notify_order(tx.order_ref, "cancelled")`
   — mesmo no caminho Mercado Pago, que hoje (manual) não chama (assimetria pré-existente, corrigida
   só pro caminho automático — ver Repasse de PM).
6. Em caso de falha do próprio estorno (falha dupla: decremento falhou **e** o estorno também
   falhou), nunca propaga exceção — grava um `save_audit(...)` com
   `event="estorno_automatico_falhou"` (correção do repasse de PM, substitui "só log") e retorna.

## Fluxos alternativos / exceções

- **Saldo negativo por concorrência** (D1, Critério 6): nunca aciona D2 — já é sucesso, retorna
  `True`.
- **Pedido não encontrado no order-service**: nunca aciona D2 — fora do controle do sistema no
  momento do decremento, retorna `True` (D1 já tratava como "nada a fazer", só não sinalizava
  explicitamente com esse valor).
- **Nenhum item CFOP 5102 no pedido**: nunca aciona D2 — nada a decrementar, retorna `True`.
- **Falha dupla**: decremento falha **e** o estorno também falha (ex: provider fora do ar). Nunca
  propaga exceção pro fluxo de aprovação de pagamento — `_estornar_pagamento_automatico` engloba a
  chamada ao core inteira em `except Exception`, grava `save_audit` com
  `event="estorno_automatico_falhou"` pra investigação manual depois.
- **`_get_terminal_config` levanta `HTTPException`** dentro de `_refund_transaction_core` (terminal
  não encontrado): no endpoint humano isso propaga normalmente (vira resposta HTTP). No caminho
  automático, sem contexto de request/response, seria uma exceção Python solta — capturada pelo
  `except Exception` do item acima, tratada como falha dupla (achado do repasse de Backend).
- **`_cancel_transaction_core` (PayGo)**: preserva o `except HTTPException: pass` já existente hoje
  em `cancel_payment` ao redor de `_get_terminal_config`/`provider.cancel_transaction` — já era
  best-effort antes desta história, comportamento herdado sem mudança.

## Dependências

- Serviços envolvidos: `payment` (única mudança — `catalog` não é tocado).
- Histórias bloqueantes: D1 (`ORD-198`), mergeada.
- **Decisão herdada de D1, reaplicada aqui sem reabrir a discussão**: síncrono, sem infraestrutura
  de fila (`IMessageBroker` só tem `publish`/`close`, nenhum consumidor existe no projeto — ver seção
  "Decisão de arquitetura" de `ORD-198`). Falha dupla fica só como log + audit, sem retry automático
  — mesmo racional: casos esporádicos, infraestrutura de fila não existe hoje, construir isso agora
  seria pré-requisito desproporcional pro caso raro.
- **Instrução permanente do usuário, registrada em memória** (`project_estorno_automatico_obrigatorio_todo_provider_tef`):
  este padrão precisa ser levado em conta em qualquer integração futura de provider/facilitador TEF
  (Adyen, Stone) desde o desenho, não como reboque depois.

## Critérios de aceite funcionais

- [ ] Falha real na chamada de decremento (indisponibilidade/timeout/5xx do `catalog-service`)
      aciona estorno automático da transação correspondente.
- [ ] Saldo negativo por concorrência (D1) nunca aciona estorno — já é sucesso.
- [ ] Pedido não encontrado no order-service nunca aciona estorno.
- [ ] Nenhum item CFOP 5102 no pedido nunca aciona estorno.
- [ ] Transação PayGo/mock usa `_cancel_transaction_core` — best-effort, local sempre marca
      `cancelled` independente do resultado do provider (mesmo contrato de `cancel_payment` hoje).
- [ ] Transação Mercado Pago usa `_refund_transaction_core` — só marca `refunded` se o provider
      confirmar de verdade (mesmo contrato de `refund_payment` hoje).
- [ ] Falha dupla (decremento falha e o estorno também falha) nunca propaga exceção, nunca derruba
      o fluxo de aprovação de pagamento — fica registrada via `save_audit` com
      `event="estorno_automatico_falhou"`.
- [ ] `POST /payments/{tx_id}/cancel` e `POST /payments/{tx_id}/refund` continuam se comportando
      exatamente igual depois da extração (mesma validação de role/provider/prazo, mesmo formato de
      erro, mesma resposta de sucesso) — zero regressão nos endpoints humanos.

## Wireframe / Mockup

Nenhuma mudança visual — história inteiramente de backend (extração de lógica existente + dispatcher
novo + mudança de assinatura de uma função interna já existente). Nenhuma tela nova, nenhum
componente novo.

## QA Explorer

### Rastreabilidade — Critério (Explorer) → Cenário

| # | Critério | Cenário(s) que cobrem |
|---|---|---|
| 1 | Falha real de decremento aciona estorno | *Falha real de decremento aciona cancelamento automático (PayGo)* / *...aciona reembolso automático (Mercado Pago)* |
| 2 | Saldo negativo nunca aciona estorno | *Saldo negativo por concorrência não aciona estorno* |
| 3 | Pedido não encontrado nunca aciona estorno | *Pedido não encontrado no order-service não aciona estorno* |
| 4 | Sem item CFOP 5102 nunca aciona estorno | *Pedido sem item CFOP 5102 não aciona estorno* |
| 5 | PayGo/mock usa cancelamento best-effort | *Cancelamento automático PayGo é best-effort, mesmo contrato do endpoint manual* |
| 6 | Mercado Pago usa reembolso condicional | *Reembolso automático Mercado Pago só confirma se o provider confirmar* |
| 7 | Falha dupla nunca propaga, vira audit | *Falha dupla (PayGo) — nunca propaga, grava evento de auditoria* / *Falha dupla (Mercado Pago) — idem* |
| 8 | Endpoints humanos sem regressão | *Regressão — POST /payments/{id}/cancel comportamento idêntico* / *Regressão — POST /payments/{id}/refund comportamento idêntico* |

Cenários adicionais sem numeração 1:1 direta, cobrindo achados dos repasses:

- *`_notify_order` é chamado no reembolso automático via Mercado Pago* (repasse de PM — fecha a
  assimetria que existe hoje no caminho manual, só pro caminho automático).
- ***`cancelled_by`/`refunded_by` gravados como `None` no caminho automático*** (repasse de Backend
  — ator é o sistema, não um usuário humano).
- *`tx.company_id` usado corretamente nos eventos/audit do caminho automático* (repasse de Backend —
  `current_user.company_id` não existe nesse caminho; e é mais correto que a alternativa mesmo no
  caminho manual, ver Tech Explorer).
- *`HTTPException` de `_get_terminal_config` dentro do reembolso automático não propaga* (repasse de
  Backend — achado de assimetria entre `_cancel_transaction_core`, que já engolia isso, e
  `_refund_transaction_core`, que não tinha essa proteção antes da extração).
- *Hook nos 4 pontos de aprovação — `_decrementar_estoque_venda` retorna `bool` corretamente em
  todos* (continuidade de D1 — os 3 caminhos assíncronos de MP reaproveitam a mesma função, sem
  lógica própria a testar de novo).

### Cenários Gherkin

```gherkin
Feature: Estorno automático de pagamento quando a baixa de estoque falha (D2)
  Como Empresa
  Quero que uma cobrança seja revertida automaticamente quando o sistema falha em baixar o estoque
  Para nunca ficar com dinheiro cobrado de um item que não pôde ser contabilizado como vendido

  Background:
    Dado que existe uma transação aprovada ("approved") pro pedido ORD-D2-01

  # ── Happy path — aciona estorno (Critério 1) ────────────────────────────────

  Scenario: Falha real de decremento aciona cancelamento automático (PayGo)
    Dado que a transação ORD-D2-01 tem provider "paygo"
    Quando POST /internal/stock/decrement falha de verdade (timeout/5xx) na aprovação do pagamento
    Então _estornar_pagamento_automatico é chamado com o motivo "Falha ao decrementar estoque na venda"
    E a transação é cancelada via _cancel_transaction_core (mesmo contrato de cancel_payment)
    E nenhuma exceção propaga de volta pro fluxo de aprovação — POST /payments retorna sucesso ao totem

  Scenario: Falha real de decremento aciona reembolso automático (Mercado Pago)
    Dado que a transação ORD-D2-01 tem provider "mercadopago"
    Quando POST /internal/stock/decrement falha de verdade na confirmação assíncrona de pagamento
    Então _estornar_pagamento_automatico é chamado com o mesmo motivo
    E a transação é reembolsada via _refund_transaction_core (mesmo contrato de refund_payment)

  # ── Não aciona estorno — 3 bordas distintas (Critérios 2, 3, 4) ─────────────

  Scenario: Saldo negativo por concorrência não aciona estorno
    Dado que dois pagamentos aprovados simultâneos decrementam o último item em estoque (D1)
    Quando ambas as chamadas de decremento retornam sucesso (200), mesmo com saldo final negativo
    Então _decrementar_estoque_venda retorna True pras duas chamadas
    E _estornar_pagamento_automatico nunca é chamado

  Scenario: Pedido não encontrado no order-service não aciona estorno
    Dado que o order-service responde 404 pro order_ref da transação aprovada
    Quando _decrementar_estoque_venda processa essa aprovação
    Então retorna True (nada a decrementar, fora do controle do sistema neste ponto)
    E _estornar_pagamento_automatico nunca é chamado

  Scenario: Pedido sem item CFOP 5102 não aciona estorno
    Dado que todos os itens do pedido são CFOP 5101 (produção própria, fora de escopo de D1)
    Quando _decrementar_estoque_venda processa a aprovação
    Então retorna True (nada a decrementar)
    E _estornar_pagamento_automatico nunca é chamado

  # ── Contrato dos 2 caminhos de reversão (Critérios 5, 6) ─────────────────────

  Scenario: Cancelamento automático PayGo é best-effort, mesmo contrato do endpoint manual
    Dado que a transação ORD-D2-01 (provider paygo) precisa ser estornada automaticamente
    Quando o cancelamento no provider PayGo falha (ex: terminal indisponível)
    Então tx.status vira "cancelled" mesmo assim, local, independente do resultado do provider
    E o comportamento é idêntico ao de POST /payments/{id}/cancel chamado manualmente

  Scenario: Reembolso automático Mercado Pago só confirma se o provider confirmar
    Dado que a transação ORD-D2-01 (provider mercadopago) precisa ser estornada automaticamente
    Quando o provider Mercado Pago recusa o reembolso (ex: saldo insuficiente)
    Então tx.status permanece "approved" (não muda pra "refunded")
    E _refund_transaction_core retorna sucesso=False, propagando a falha pro dispatcher

  # ── Falha dupla — nunca propaga, vira auditoria (Critério 7) ─────────────────

  Scenario: Falha dupla (PayGo) — nunca propaga, grava evento de auditoria
    Dado que o decremento de estoque falhou de verdade pra uma transação PayGo aprovada
    Quando o cancelamento automático no provider PayGo também falha
    Então nenhuma exceção propaga pro fluxo de aprovação de pagamento
    E um registro save_audit é gravado com event="estorno_automatico_falhou", transaction_id e motivo

  Scenario: Falha dupla (Mercado Pago) — nunca propaga, grava evento de auditoria
    Dado que o decremento de estoque falhou de verdade pra uma transação Mercado Pago aprovada
    Quando _get_terminal_config levanta HTTPException dentro de _refund_transaction_core (terminal não encontrado)
    Então a exceção é capturada pelo except Exception do dispatcher, nunca propaga
    E um registro save_audit é gravado com event="estorno_automatico_falhou"

  # ── Regressão dos endpoints humanos (Critério 8) ──────────────────────────────

  Scenario: Regressão — POST /payments/{id}/cancel comportamento idêntico
    Dado a suíte de testes já existente de POST /payments/{id}/cancel (test_payment.py), rodada como baseline antes da extração
    Quando a mesma suíte roda depois de _cancel_transaction_core ser extraída
    Então todos os testes da baseline continuam passando sem nenhuma alteração de asserção

  Scenario: Regressão — POST /payments/{id}/refund comportamento idêntico
    Dado a suíte de testes já existente de POST /payments/{id}/refund (test_payment.py), rodada como baseline antes da extração
    Quando a mesma suíte roda depois de _refund_transaction_core ser extraída
    Então todos os testes da baseline continuam passando sem nenhuma alteração de asserção

  # ── Achados dos repasses (PM, Backend) ────────────────────────────────────────

  Scenario: _notify_order é chamado no reembolso automático via Mercado Pago
    Dado que uma transação Mercado Pago é reembolsada automaticamente com sucesso
    Quando _estornar_pagamento_automatico conclui o estorno
    Então _notify_order(tx.order_ref, "cancelled") é chamado
    E isso difere do caminho manual (refund_payment), que hoje não chama _notify_order — assimetria corrigida só pro caminho automático

  Scenario: cancelled_by/refunded_by gravados como None no caminho automático
    Dado que um estorno automático (PayGo ou Mercado Pago) é concluído com sucesso
    Quando o registro save_audit correspondente é gravado
    Então "cancelled_by"/"refunded_by" é None (ator é o sistema, não há current_user.sub)

  Scenario: tx.company_id usado corretamente nos eventos/audit do caminho automático
    Dado que uma transação de qualquer empresa precisa de estorno automático
    Quando o evento PaymentCancelledEvent/PaymentRefundedEvent e o save_audit são publicados
    Então company_id usado é tx.company_id (nunca current_user.company_id, que não existe neste caminho)

  Scenario: Hook nos 4 pontos de aprovação — _decrementar_estoque_venda retorna bool corretamente em todos
    Dado os 4 pontos onde uma Transaction vira "approved" (síncrono PayGo/mock + 3 assíncronos Mercado Pago)
    Quando cada um chama _decrementar_estoque_venda e recebe False
    Então cada um aciona _estornar_pagamento_automatico(tx.id, motivo) da mesma forma, sem lógica duplicada
```

**Nota de execução de teste (repasse de QA)**: a estratégia de regressão é rodar a suíte já
existente de `test_payment.py` (`cancel_payment`/`refund_payment`) como baseline **antes** da
extração, extrair o código, rodar de novo — qualquer teste que quebrar é regressão real. Suficiente
porque a suíte já cobre validação de role/provider/prazo/formato de resposta hoje; não precisa de
testes novos redundantes só pra provar "comportamento idêntico" além disso. `_estornar_pagamento_automatico`
abre sua própria `AsyncSessionLocal()` — testável do mesmo jeito que a suíte já faz hoje (fixture
`client` troca `svc.engine`/`svc.AsyncSessionLocal` globalmente antes de cada teste, então qualquer
sessão nova aberta dentro do código de produção usa automaticamente o mesmo banco de teste) — sem
pegadinha nova.

## Tech Explorer

### Correções aplicadas nos repasses (achados de código real)

1. **(PM)** Falha dupla não fica só em log — grava `save_audit(...)` com
   `event="estorno_automatico_falhou"`, pra dar rastro investigável sem construir infraestrutura de
   alerta nova.
2. **(PM)** Reembolso automático (Mercado Pago) sempre chama `_notify_order(tx.order_ref, "cancelled")`
   em caso de sucesso — fecha, só pro caminho automático, a assimetria que existe hoje no `refund_payment`
   manual (onde um humano já está ciente e pode agir manualmente se precisar).
3. **(Backend)** Eventos e `save_audit` do caminho automático usam `tx.company_id`, não
   `current_user.company_id` (que não existe nesse caminho). Achado extra: isso é mais correto que o
   código atual mesmo no caminho manual — `cancel_payment`/`refund_payment` isentam `superadmin`/`admin`
   do filtro de tenant (`main.py:1302-1304`, `1408-1410`), então esses roles podem agir sobre
   transação de outra empresa com `current_user.company_id` divergente de `tx.company_id` — bug
   latente pré-existente, corrigido de brinde ao reaproveitar `tx.company_id` nos dois caminhos.
4. **(Backend)** `actor_user_id: str | None` (não `int | None`) — `TokenPayload.sub` é `str`
   (`auth.py:15`), usado sem conversão em `cancelled_by`/`refunded_by` hoje (`main.py:1378`, `1453`).
   No caminho automático, sempre `None`.
5. **(Backend)** `_estornar_pagamento_automatico` precisa de `except Exception` (não um tipo mais
   específico) envolvendo toda a chamada ao core — `_cancel_transaction_core` já herda o
   `except HTTPException: pass` que `cancel_payment` já tinha; `_refund_transaction_core` **não**
   tinha proteção equivalente (`refund_payment` deixa `HTTPException` de `_get_terminal_config`
   propagar direto pro FastAPI, que no endpoint humano vira resposta HTTP normal — no caminho
   automático, sem request/response, precisa ser capturada no dispatcher).

### Serviços impactados

- `payment`: extração de lógica de `cancel_payment`/`refund_payment` em funções internas
  reutilizáveis, dispatcher novo, mudança de assinatura de `_decrementar_estoque_venda` (D1), hook
  atualizado nos mesmos 4 pontos onde D1 já chama. **Nenhum outro serviço é tocado** — `catalog` não
  muda (D1 já cobriu o que era necessário lá).

### Nenhum endpoint novo

D2 não expõe nenhuma rota HTTP nova — só funções internas de módulo, chamadas de dentro do próprio
fluxo de aprovação de pagamento.

```python
async def _cancel_transaction_core(db: AsyncSession, tx: Transaction, reason: str) -> bool:
    """Extraída de cancel_payment (main.py:1325-1369), sem current_user — usa
    tx.company_id no lugar de current_user.company_id (achado do repasse de
    Backend: mais correto até pro caminho manual, ver Tech Explorer §3)."""
    tx.status = "cancelled"
    tx.cancelled_at = datetime.utcnow()
    tx.cancel_reason = reason
    await db.commit()

    if tx.provider == "paygo" and tx.provider_transaction_id:
        try:
            terminal_cfg = await _get_terminal_config(tx.terminal_id)
            raw_config = terminal_cfg.get("config") or {}
            config = ProviderConfig(
                provider="paygo", environment=tx.environment or "sandbox",
                api_key=raw_config.get("api_key"), api_secret=raw_config.get("api_secret"),
                extra_config=raw_config.get("extra_config") or {},
            )
            provider = get_provider(config)
            await provider.cancel_transaction(
                provider_transaction_id=tx.provider_transaction_id,
                terminal_ref=tx.paygo_terminal_id or "",
            )
        except HTTPException:
            pass
        except Exception as exc:  # noqa: BLE001 — best-effort, herdado de cancel_payment
            logger.warning("PayGo cancel error: %s", exc)

    await _try_cancel_fiscal_document(tx.order_ref, reason)
    await _publish("payment.cancelled", PaymentCancelledEvent(
        company_id=tx.company_id, order_ref=tx.order_ref, transaction_id=tx.id,
        amount=str(tx.amount), cancel_reason=reason, provider=tx.provider or "mock",
    ).to_dict())
    await save_audit({
        "transaction_id": tx.id, "company_id": tx.company_id, "order_ref": tx.order_ref,
        "provider": tx.provider, "environment": tx.environment,
        "provider_transaction_id": tx.provider_transaction_id, "cancelled_by": None,
        "events": [{"event": "cancelled", "ts": datetime.utcnow().isoformat(), "reason": reason}],
        "final_status": "cancelled",
    })
    return True


async def _refund_transaction_core(
    db: AsyncSession, tx: Transaction, reason: str, *, actor_user_id: str | None = None,
) -> tuple[bool, str | None]:
    """Extraída de refund_payment (main.py:1420-1488). actor_user_id: str
    (achado do repasse de Backend — TokenPayload.sub é str, não int), None
    no caminho automático."""
    if tx.provider != "mercadopago" or not tx.provider_transaction_id:
        return False, "Transação não é Mercado Pago ou sem provider_transaction_id"

    terminal_cfg = await _get_terminal_config(tx.terminal_id)  # HTTPException aqui não é engolida
    raw_config = terminal_cfg.get("config") or {}              # aqui dentro — dispatcher cobre isso
    config = ProviderConfig(
        provider="mercadopago", environment=tx.environment or "sandbox",
        api_key=raw_config.get("api_key"), api_secret=raw_config.get("api_secret"),
        extra_config=raw_config.get("extra_config") or {},
    )
    provider = get_provider(config)

    limit_days = provider.refund_window_days(tx.method)
    if limit_days is not None and tx.created_at and (datetime.utcnow() - tx.created_at).days > limit_days:
        return False, f"Prazo de reembolso expirado — {tx.provider} aceita até {limit_days} dias"

    refund_result = await provider.refund_transaction(provider_transaction_id=tx.provider_transaction_id)

    await save_audit({
        "transaction_id": tx.id, "company_id": tx.company_id, "order_ref": tx.order_ref,
        "provider": tx.provider, "environment": tx.environment,
        "provider_transaction_id": tx.provider_transaction_id, "refunded_by": actor_user_id,
        "events": [{"event": "refund_attempt", "ts": datetime.utcnow().isoformat(), "reason": reason,
                     "success": refund_result.success, "error_message": refund_result.error_message,
                     "raw_response": refund_result.raw_response}],
        "final_status": "refunded" if refund_result.success else tx.status,
    })

    if not refund_result.success:
        return False, refund_result.error_message or "Mercado Pago recusou o reembolso"

    tx.status = "refunded"
    tx.refunded_at = datetime.utcnow()
    tx.refund_reason = reason
    await db.commit()

    await _try_cancel_fiscal_document(tx.order_ref, reason)
    await _publish("payment.refunded", PaymentRefundedEvent(
        company_id=tx.company_id, order_ref=tx.order_ref, transaction_id=tx.id,
        amount=str(tx.amount), refund_reason=reason, provider=tx.provider or "mock",
    ).to_dict())
    return True, None


async def _estornar_pagamento_automatico(tx_id: int, motivo: str) -> None:
    """Dispatcher novo (D2) — abre sua própria sessão (mesmo padrão de
    _try_cancel_fiscal_document), sem current_user, sem HTTP. Nunca propaga
    exceção — falha dupla (decremento falhou + estorno também falha) vira
    só save_audit (correção do repasse de PM), nunca derruba o pagamento."""
    try:
        async with AsyncSessionLocal() as db:
            tx = (await db.execute(select(Transaction).where(Transaction.id == tx_id))).scalars().first()
            if not tx or tx.status != "approved":
                return

            if tx.provider == "mercadopago":
                ok, error = await _refund_transaction_core(db, tx, motivo, actor_user_id=None)
            else:
                ok = await _cancel_transaction_core(db, tx, motivo)
                error = None

            if ok:
                await _notify_order(tx.order_ref, "cancelled")
            else:
                raise RuntimeError(error or "estorno automático falhou")
    except Exception as exc:  # noqa: BLE001 — captura ampla intencional, cobre inclusive
        # HTTPException de _get_terminal_config dentro de _refund_transaction_core
        # (achado do repasse de Backend — refund_payment não tinha essa proteção
        # antes da extração porque sempre rodou dentro de um request HTTP real)
        logger.error("Estorno automático falhou pra tx_id=%s: %s", tx_id, exc)
        await save_audit({
            "transaction_id": tx_id, "event": "estorno_automatico_falhou",
            "motivo_decremento": motivo, "erro": str(exc),
            "ts": datetime.utcnow().isoformat(),
        })
```

### Mudança de assinatura — `_decrementar_estoque_venda` (D1)

```python
async def _decrementar_estoque_venda(order_ref: str) -> bool:
    """Muda de -> None (D1) pra -> bool (D2). True: sucesso real OU nenhum
    item a decrementar (pedido não encontrado, sem CFOP 5102 — fora de
    escopo de D2, nunca aciona estorno). False: só quando a chamada de
    decremento em si falha de verdade."""
    try:
        order = await _get_order_with_items(order_ref)
        if not order:
            return True
        products_fiscal = await _get_products_fiscal([it["product_id"] for it in order["items"]])
        items = [
            {"product_id": it["product_id"], "quantity": it["quantity"]}
            for it in order["items"]
            if products_fiscal.get(it["product_id"], {}).get("cfop") == "5102"
        ]
        if not items:
            return True
        async with httpx.AsyncClient(timeout=5) as c:
            resp = await c.post(f"{CATALOG_SVC}/internal/stock/decrement",
                                 json={"order_ref": order_ref, "items": items}, headers=INTERNAL_HEADERS)
            resp.raise_for_status()
        return True
    except Exception as exc:  # noqa: BLE001 — mesmo padrão de emit_nfce_if_active
        logger.error("Decremento de estoque falhou pra order_ref=%s: %s", order_ref, exc)
        return False
```

### Hook — atualizado nos mesmos 4 pontos de D1

```python
if result.status == TransactionStatus.approved:
    await _notify_order(body.order_ref, "paid")
    await emit_nfce_if_active(current_user.company_id, body.order_ref, body.method, body.amount)
    estoque_ok = await _decrementar_estoque_venda(body.order_ref)
    if not estoque_ok:
        await _estornar_pagamento_automatico(tx.id, "Falha ao decrementar estoque na venda")
    await _publish("payment.approved", ...)
```

Repetido nos 3 pontos assíncronos de confirmação Mercado Pago, no mesmo lugar onde D1 já chama
`_decrementar_estoque_venda` hoje.

### Migrations

Nenhuma — D2 não adiciona nem altera coluna nenhuma. `Transaction` já tem todos os campos
necessários (`status`, `provider`, `provider_transaction_id`, `company_id`, `order_ref`, `method`,
`amount`, `created_at`, `terminal_id`, `paygo_terminal_id`, `environment`).

### Impacto em outros serviços

Nenhum novo — `_notify_order`, `_try_cancel_fiscal_document`, `_publish` e `save_audit` já são
usados pelos endpoints existentes, sem mudança de contrato.

### Eventos de fila

Nenhum novo — `payment.cancelled`/`payment.refunded` continuam publicados exatamente como hoje,
só que agora também a partir do caminho automático.

### Estimativa

| Frente | Estimativa |
|---|---|
| Extração de `_cancel_transaction_core`/`_refund_transaction_core` (sem quebrar os 2 endpoints existentes) | ~2h |
| `_estornar_pagamento_automatico` + mudança de assinatura de `_decrementar_estoque_venda` | ~1.5h |
| Hook nos 4 pontos de aprovação | ~1h |
| Testes (baseline de regressão dos 2 endpoints + 13 cenários novos) | ~3.5h |
| **Total** | **~8h ≈ 5 pontos** (revisa a estimativa original do épico, que não tinha considerado a extração) |

### Riscos

- **Extração de código em produção** (`cancel_payment`/`refund_payment`) — mitigado pela estratégia
  de baseline-antes/baseline-depois da suíte já existente (ver Repasse de QA).
- **Assimetria `_notify_order` corrigida só pro caminho automático, não pro manual** — decisão
  deliberada (repasse de PM): o caminho manual já tem um humano ciente que pode agir; não é escopo
  desta história tocar o comportamento do endpoint `refund_payment` existente.
- **Sem retry nem fila pra falha dupla** — decisão herdada de D1, mesmo racional (infraestrutura de
  fila não existe hoje, caso é esporádico). Mitigação: `save_audit` com evento específico, dá rastro
  pra investigação manual.

## Repasse por papel (antes de Ready)

| Papel | Achado | Ação |
|---|---|---|
| PM | Falha dupla (decremento falha + estorno também falha) só logada, sem trilha estruturada, era pouco pra um cenário que envolve dinheiro cobrado sem contrapartida de estoque nem estorno | `save_audit` com `event="estorno_automatico_falhou"` adicionado — sem construir alerta/fila nova, mantém consistência com a decisão síncrona de D1 |
| PM | Reembolso automático (Mercado Pago) herdaria a ausência de `_notify_order` do `refund_payment` manual — pedido ficaria "paid" no order-service mesmo com o dinheiro já estornado, sem ninguém perceber (diferente do manual, onde um humano já está ciente) | `_notify_order(tx.order_ref, "cancelled")` adicionado ao dispatcher, só no caminho automático — assimetria do endpoint manual não é tocada |
| PM | Verificação critério↔cenário — nenhum critério sem cenário, nenhum cenário sem critério | Confirmado, sem achado |
| QA | Cenários de regressão ("continua funcionando igual") vagos como escritos, sem estratégia de automação clara | Estratégia definida: suíte existente de `test_payment.py` como baseline antes/depois da extração — suficiente, sem testes novos redundantes de "comportamento idêntico" |
| QA | Testabilidade de `_estornar_pagamento_automatico` abrindo sua própria sessão | Confirmado sem pegadinha — fixture `client` já troca `svc.engine`/`svc.AsyncSessionLocal` globalmente |
| QA | Faltava cenário verificando que `save_audit` é de fato gravado na falha dupla, não só que a exceção não propaga | Cenário novo adicionado com asserção explícita no registro `event="estorno_automatico_falhou"` |
| Backend | `PaymentCancelledEvent`/`PaymentRefundedEvent` originais usam `current_user.company_id`, não `tx.company_id` — pseudocódigo inicial não tinha decidido isso pro caminho automático (sem `current_user`) | `tx.company_id` usado nos dois caminhos — achado extra: corrige bug latente pré-existente (`superadmin`/`admin` isentos do filtro de tenant, `main.py:1302-1304`/`1408-1410`, podiam divergir `current_user.company_id` de `tx.company_id`) |
| Backend | `actor_user_id: int \| None` no pseudocódigo original — `TokenPayload.sub` é `str`, usado sem conversão hoje | Corrigido pra `actor_user_id: str \| None`, `None` no caminho automático |
| Backend | Ordem de definição entre as 4 funções novas/alteradas | Confirmado sem risco — nível de módulo, `async def`, resolução de nome em tempo de chamada |
| Backend | `except HTTPException: pass` já existente em `cancel_payment` (`main.py:1347-1348`) — checado se seria engolido de um jeito que mudaria o comportamento do endpoint humano | Confirmado: comportamento pré-existente e best-effort, preservado fielmente na extração, sem mudança de risco |
| Backend | `refund_payment` **não** tinha proteção equivalente ao redor de `_get_terminal_config` — achado de assimetria entre os dois providers | `_estornar_pagamento_automatico` ganhou `except Exception` envolvendo toda a chamada ao core, cobrindo o caso que `_cancel_transaction_core` já cobria sozinho e `_refund_transaction_core` não cobria |

## Rastreabilidade ponta a ponta (checklist de Ready)

| Passo do Fluxo Principal | Critério de aceite | Cenário Gherkin | Função/dispatcher |
|---|---|---|---|
| 1. Pagamento aprovado em qualquer um dos 4 pontos | ✅ (implícito, base de D1) | *Hook nos 4 pontos...* | hook nos 4 call sites |
| 2. `_decrementar_estoque_venda` retorna bool | ✅ Critérios 1-4 | *Falha real...* / *Saldo negativo...* / *Pedido não encontrado...* / *Sem CFOP 5102...* | `_decrementar_estoque_venda` |
| 3. `False` aciona `_estornar_pagamento_automatico` | ✅ Critério 1 | *Falha real de decremento aciona...* | `_estornar_pagamento_automatico` |
| 4. Dispatcher decide por provider | ✅ Critérios 5, 6 | *Cancelamento automático PayGo...* / *Reembolso automático MP...* | `_cancel_transaction_core` / `_refund_transaction_core` |
| 5. Sucesso → `_notify_order` | ✅ (achado PM) | *`_notify_order` é chamado no reembolso automático...* | dispatcher |
| 6. Falha do estorno → `save_audit`, nunca propaga | ✅ Critério 7 | *Falha dupla (PayGo)...* / *Falha dupla (MP)...* | dispatcher, `except Exception` |
| — Endpoints humanos sem regressão | ✅ Critério 8 | *Regressão — cancel* / *Regressão — refund* | suíte baseline |

Todas as linhas preenchidas — nenhum passo do Fluxo Principal ficou só em prosa sem virar critério,
cenário e função correspondente.

### Checklist final

- [x] Explorer — história, contexto, fluxo, dependências, critérios de aceite completos
- [x] QA Explorer — happy path, bordas, erros, rastreabilidade 1:1, aprovado por PM
- [x] Tech Explorer — serviços impactados, pseudocódigo completo, sem endpoint/migration novos, estimativa, riscos
- [x] Repasse de PM — 2 achados aplicados (save_audit na falha dupla, `_notify_order` no automático)
- [x] Repasse de QA — estratégia de regressão definida, cenário de auditoria adicionado
- [x] Repasse de Backend — 5 achados aplicados (`tx.company_id`, tipo de `actor_user_id`, ordem de definição confirmada, `except Exception` no dispatcher, bug latente de tenant corrigido de brinde)
- [x] Rastreabilidade ponta a ponta — tabela acima, sem célula vazia
- [x] Sem bloqueios não resolvidos

## Implementação — achados reais (2026-09-23)

1. **`_cancel_transaction_core` inicial hardcodeava `"cancelled_by": None`** — copiado direto do
   pseudocódigo do Tech Explorer sem reparar que isso regrediria `cancel_payment` (endpoint manual),
   que grava `current_user.sub`. Achado na hora de ligar o endpoint na função extraída, antes de
   rodar qualquer teste. Corrigido: `_cancel_transaction_core` ganhou o mesmo parâmetro
   `actor_user_id: str | None = None` que `_refund_transaction_core` já tinha — `cancel_payment`
   passa `current_user.sub`, o dispatcher automático passa `None`.
2. **Checagem de prazo de reembolso (422) virou 502 genérico na extração** — o pseudocódigo do Tech
   Explorer tinha `_refund_transaction_core` retornando `(False, mensagem)` pra prazo expirado, igual
   qualquer outra falha — mas o endpoint manual precisa devolver `422` (não `502`) nesse caso
   especificamente, pra não regredir `refund_payment`. Achado ao comparar a extração linha a linha
   com o código original antes de rodar a suíte. Corrigido: a checagem de prazo levanta
   `HTTPException(422, ...)` direto de dentro do core (em vez de `return False`) — o endpoint manual
   deixa propagar normalmente (mesmo comportamento de sempre); o dispatcher automático já cobre isso
   com o `except Exception` que também precisa capturar `HTTPException` de `_get_terminal_config`
   (achado do próprio repasse de Backend).

Estratégia de regressão (repasse de QA): suíte completa de `test_payment.py` rodada como baseline
**antes** da extração (157 passed, 1 failed — falha pré-existente e não relacionada,
`test_factory_returns_rabbitmq_broker`, ambiente sem `RABBITMQ_URL` no container de teste) e de novo
**depois** (mesmo resultado: 157 passed, mesma 1 falha pré-existente) — zero regressão real nos dois
endpoints extraídos.

Suíte nova (`test_ord200_estorno_automatico_pagamento.py`, 12 testes): cobre os dois branches do
dispatcher (PayGo/mock best-effort, Mercado Pago condicional), `_notify_order` chamado em ambos no
sucesso (fecha a assimetria do repasse de PM), `cancelled_by`/`refunded_by` como `None` no caminho
automático, falha dupla via `_cancel_transaction_core`/`_refund_transaction_core` mockados pra
levantar exceção (incluindo `HTTPException` real de terminal não encontrado, achado do repasse de
Backend), guarda de idempotência do dispatcher (transação não mais `approved`), os 4 valores de
retorno de `_decrementar_estoque_venda` (pedido não encontrado, sem CFOP 5102, saldo negativo,
falha real), e 2 testes de integração ponta a ponta via `POST /payments` (com e sem falha de
decremento).

Suíte completa: 169 testes em `payment-service` (12 novos), 1 falha pré-existente sem relação com
esta história. `ruff check services/payment/` limpo. Container reconstruído e verificado com
`GET /health` respondendo normalmente com o código novo.
