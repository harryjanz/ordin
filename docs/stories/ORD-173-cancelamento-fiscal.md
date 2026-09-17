---
id: ORD-173
status: Ready
estimativa: 3 pontos (2,5 backend + 0,5 frontend)
fase: null
sprint: null
responsavel: Backend SR
---

# ORD-173 — Cancelamento fiscal integrado ao cancelamento/reembolso de pagamento

## Descrição
Sexta história do épico. Achado antes de escrever: **não existe "cancelamento de pedido" como
endpoint próprio** no order-service — o cancelamento hoje é sempre efeito colateral de
`POST /payments/{tx_id}/cancel` ou `POST /payments/{tx_id}/refund` (`payment-service`, mesmo
serviço da ORD-171), que notificam o order-service depois. Esta história integra a chamada
`DELETE /nfce/{ref}` (Focus NFe, janela de 30 minutos, `docs/estudo-nfce.md` §7) nesses dois
pontos já existentes, não num endpoint novo de "cancelar pedido".

## Persona
**Operador de caixa/admin** que cancela ou reembolsa um pagamento — mesma persona já servida
pelos endpoints existentes (`require_write_role`).

## Contexto
Achado de negócio importante (não estava explícito no levantamento original): a janela de
cancelamento fiscal (30 min) é muito mais curta que as janelas de reembolso já existentes no
Ordin (PayGo: mesmo dia; Mercado Pago: 90 dias cartão / 180 dias PIX). **Na prática, a maioria
dos reembolsos reais vai acontecer fora da janela fiscal** — nesses casos a nota já emitida
continua válida, sem cancelamento possível, e isso é limite legal esperado, não erro do sistema.

## Explorer

### História
Como **operador que cancela ou reembolsa um pagamento**, quero que a nota fiscal correspondente
seja cancelada automaticamente na Focus NFe quando isso ainda é possível (dentro da janela de 30
minutos), para manter a contabilidade fiscal da empresa consistente com o cancelamento do
pagamento, sem precisar fazer isso manualmente em outro sistema.

### Fluxo principal
1. Operador cancela (`POST /payments/{tx_id}/cancel`) ou reembolsa
   (`POST /payments/{tx_id}/refund`) um pagamento, fluxo já existente e sem mudança visível.
2. Depois da lógica de cancelamento/reembolso já existente (que não muda), o sistema verifica se
   existe um `FiscalDocument` com status "autorizada" pro `order_ref` daquela transação.
3. **Se existe e está dentro de 30 minutos da emissão** (`FiscalDocument.criado_em`): chama
   `DELETE /nfce/{ref}` (Focus NFe, mesmo `ambiente` usado na emissão original — não o ambiente
   atual da empresa, que pode ter mudado) com a justificativa do cancelamento/reembolso.
   Sucesso muda `FiscalDocument.status` pra "cancelada".
4. **Se não existe, ou está fora da janela, ou módulo inativo**: nada acontece — o
   cancelamento/reembolso do pagamento segue normalmente, sem erro nem aviso extra. A nota (se
   existir) continua "autorizada", fora do alcance de cancelamento.
5. Igual ao cancelamento no provider PayGo (`cancel_payment`, já existente): **best-effort** —
   falha na chamada à Focus NFe nunca impede o cancelamento/reembolso do pagamento em si, mesmo
   princípio já estabelecido no código atual ("captura ampla intencional... qualquer falha do
   provider não pode impedir o cancelamento local").

### Fluxos alternativos / exceções
- **Reembolso fora da janela fiscal** (caso mais comum na prática, dado que reembolso MP chega a
  180 dias): nota permanece "autorizada", sem tentativa de cancelamento — comportamento esperado,
  não bloqueio.
- **Justificativa muito curta**: `DELETE /nfce/{ref}` exige 15-255 caracteres — se o motivo do
  cancelamento/reembolso informado pelo operador for menor que 15 caracteres, complementa com um
  texto padrão (ex. "Cancelamento de pagamento - {motivo informado}") em vez de falhar a chamada.
- **Falha na Focus NFe** (rede, erro): registrada em log, `FiscalDocument` mantém status
  "autorizada" (não sabemos se cancelou ou não do lado deles) — fica como pendência de
  reconciliação manual, fora do escopo de retry automático desta história.

### Dependências
- **payment-service**: hooks em `cancel_payment` e `refund_payment` (ambos já existentes),
  reaproveitando o cliente HTTP Focus NFe da ORD-171 (mesmo serviço).
- **Histórias bloqueantes**: ORD-171 (Ready) — precisa do `FiscalDocument` e do cliente HTTP já
  existirem.
- **Histórias que dependem desta**: nenhuma.

### Critérios de aceite funcionais
- [ ] Cancelamento/reembolso dentro de 30 min de uma nota autorizada tenta cancelar na Focus NFe
- [ ] Fora da janela ou sem nota autorizada: nenhuma tentativa, sem erro
- [ ] Falha na Focus NFe nunca impede o cancelamento/reembolso do pagamento
- [ ] Justificativa curta é complementada, nunca causa falha da chamada
- [ ] Sucesso muda o status do `FiscalDocument` pra "cancelada"

### Wireframe / Mockup
Nenhuma UI nova — comportamento invisível pro operador, só reflete no status já existente da aba
Fiscal/histórico (se exibido em algum lugar, decisão de UI menor, fora do essencial desta
história).

## QA Explorer

### Cenários Gherkin

```gherkin
Feature: Cancelamento fiscal integrado ao cancelamento/reembolso de pagamento
  Como operador que cancela ou reembolsa um pagamento
  Quero que a nota fiscal seja cancelada quando ainda está dentro da janela
  Para manter a contabilidade fiscal consistente

  # --- Happy path ---

  Scenario: Cancelamento de pagamento dentro da janela fiscal cancela a nota
    Dado uma transação aprovada com NFC-e autorizada há 10 minutos
    Quando o operador cancela essa transação
    Então DELETE /nfce/{ref} é chamado com a justificativa do cancelamento
    E o FiscalDocument muda para status "cancelada"

  # --- Bordas ---

  Scenario: Reembolso fora da janela fiscal não tenta cancelar a nota
    Dado uma transação Mercado Pago com NFC-e autorizada há 45 dias
    Quando o operador reembolsa essa transação
    Então nenhuma chamada é feita à Focus NFe
    E o FiscalDocument permanece "autorizada"
    E o reembolso do pagamento é concluído normalmente

  Scenario: Cancelamento sem nota fiscal associada
    Dado uma transação sem nenhum FiscalDocument (módulo inativo ou emissão pendente)
    Quando o operador cancela essa transação
    Então nenhuma chamada é feita à Focus NFe
    E o cancelamento do pagamento segue normalmente

  Scenario: Justificativa curta é complementada
    Dado uma transação com NFC-e autorizada há 5 minutos
    Quando o operador cancela informando um motivo de 5 caracteres
    Então a chamada à Focus NFe usa uma justificativa complementada de pelo menos 15 caracteres

  # --- Erros ---

  Scenario: Falha na Focus NFe não impede o cancelamento do pagamento
    Dado uma transação com NFC-e autorizada há 10 minutos
    Quando o operador cancela essa transação
    E a chamada à Focus NFe falha (erro de rede ou 4xx)
    Então o cancelamento do pagamento é concluído normalmente mesmo assim
    E o FiscalDocument permanece "autorizada" (não sabemos se cancelou do lado deles)
```

### Critérios de aceite testáveis
- [ ] Dentro da janela: chamada feita, status muda pra "cancelada" em caso de sucesso
- [ ] Fora da janela ou sem nota: nenhuma chamada, sem efeito colateral
- [ ] Justificativa curta é complementada antes de enviar
- [ ] Falha na Focus NFe nunca bloqueia o cancelamento/reembolso do pagamento em si

### O que ainda impede o avanço pro Tech Explorer
Nada bloqueante.

## Tech Explorer

### Serviços impactados
Só **payment-service** — reaproveita tudo que já existe da ORD-171 (cliente HTTP, credenciais,
`FiscalDocument`) e dos endpoints de cancelamento/reembolso já existentes.

### Mudança no código (hook best-effort, mesmo padrão do cancelamento PayGo)
```python
async def _try_cancel_fiscal_document(order_ref: str, reason: str | None) -> None:
    doc = await get_fiscal_document(order_ref, status="autorizada")
    if not doc:
        return  # sem nota autorizada, nada a fazer
    if datetime.utcnow() - doc.criado_em > timedelta(minutes=30):
        return  # fora da janela — nota permanece autorizada, comportamento esperado
    justificativa = (reason or "").strip()
    if len(justificativa) < 15:
        justificativa = f"Cancelamento de pagamento - {justificativa}"[:255]
    try:
        creds = await get_fiscal_credentials(doc.company_id)  # já existe, ORD-171
        base_url = PRODUCAO_URL if doc.ambiente == "producao" else HOMOLOGACAO_URL
        resp = await http_client.delete(
            f"{base_url}/nfce/{order_ref}",
            json={"justificativa": justificativa},
            auth=(creds["token"], ""), timeout=8.0,
        )
        if resp.status_code == 200:
            doc.status = "cancelada"
            await db.commit()
    except Exception as exc:  # noqa: BLE001 — mesmo padrão já usado no cancelamento PayGo
        logger.warning("Focus NFe cancel error: %s", exc)
        # best-effort: falha aqui nunca propaga, cancelamento do pagamento já aconteceu
```
Chamado no final de `cancel_payment` (depois de `tx.status = "cancelled"`, antes ou depois de
`_notify_order`, sem alterar a ordem existente) e de `refund_payment` (ponto equivalente).

### Migrations
Nenhuma — `FiscalDocument.status` já suporta string livre (ORD-171), só passa a aceitar mais um
valor ("cancelada") por convenção, não schema novo.

### Eventos de fila
Nenhum.

### Impacto em outros serviços
Nenhum.

### Estimativa
- Backend: **~2,5 pontos** — função nova + 2 pontos de chamada (cancel e refund) + testes das
  janelas de tempo e justificativa.
- Frontend: **~0,5 ponto** — no máximo exibir o status "cancelada" onde o histórico fiscal já for
  mostrado (herda de UI de histórias anteriores, sem tela nova).
- **Total: ~3 pontos.**

### Riscos
1. **Nenhum retry automático em caso de falha** — decisão deliberada (best-effort, mesmo padrão
   já usado no PayGo), não bloqueio, mas significa que cancelamentos fiscais falhos ficam
   silenciosamente pendentes até reconciliação manual (história 8).
2. **`ambiente` precisa ser o da emissão, não o atual da empresa** — já resolvido guardando
   `ambiente` no próprio `FiscalDocument` (ORD-171), sem necessidade de mudança adicional aqui.

### O que ainda impede o avanço pro Ready
Nada bloqueante.

## Ready

**Explorer:** [x] história Como/quero/para · [x] contexto de negócio (janela fiscal vs. janelas
de reembolso existentes) · [x] fluxo principal (5 passos) · [x] dependências (bloqueada por
ORD-171) · [x] critérios de aceite funcionais · sem necessidade de wireframe (sem UI nova).

**QA Explorer:** [x] happy path · [x] bordas (fora da janela, sem nota, justificativa curta) ·
[x] erro (falha na Focus NFe não bloqueia pagamento) · [x] cenários aprovados.

**Tech Explorer:** [x] serviço impactado (só payment-service) · [x] função de hook detalhada,
mesmo padrão best-effort já usado no cancelamento PayGo · [x] migrations — nenhuma · [x] eventos
de fila — nenhum · [x] estimativa (3 pontos) · [x] riscos com mitigação.

**Aprovação final:** [x] solução técnica revisada · [x] estimativa 3 pontos · [x] sem bloqueios
não resolvidos · [ ] sprint específico — não atribuída ainda.

**Status: Ready.**

## Implementação

Implementado exatamente como desenhado no Tech Explorer — `_try_cancel_fiscal_document()` em
`services/payment/main.py`, chamada de forma **síncrona** (`await`, sem fire-and-forget) no fim de
`cancel_payment` e `refund_payment`, decisão confirmada explicitamente antes de escrever código:
com janela de só 30 minutos, uma rotina desacoplada (fila/worker) arriscaria perder a janela só
pelo próprio atraso de infraestrutura — o caminho feliz da Focus NFe responde em milissegundos, o
timeout de 8s (`FOCUS_NFE_EMIT_TIMEOUT`, reaproveitado da ORD-171) só afeta o pior caso.

5 testes novos (`test_ord173_cancelamento_fiscal.py`) cobrindo os 5 cenários Gherkin do QA
Explorer: dentro da janela cancela, fora da janela não tenta, sem nota associada não tenta,
justificativa curta é complementada, falha na Focus NFe não impede o cancelamento/reembolso do
pagamento. Suíte completa do payment-service (146 testes) e `ruff` verificados sem regressão.
