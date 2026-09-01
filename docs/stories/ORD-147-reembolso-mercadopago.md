---
id: ORD-147
status: Ready
fase: null
sprint: null
responsavel: Backend SR + Frontend
estimativa: 8 pontos
---

# ORD-147 — Reembolso de transação Mercado Pago (Point e PIX)

## Descrição
Hoje o admin não tem nenhuma forma de estornar uma transação aprovada via Mercado Pago dentro
do Ordin — a única opção é entrar manualmente no painel do MP. Isso vale tanto para cartão via
Point (Orders API) quanto para PIX. O gap não é falta de UI: é falta de implementação — o
`MPProvider` nunca chama os endpoints de reembolso do Mercado Pago (`POST /v1/orders/{id}/refund`
para cartão, refund de pagamento para PIX), só tem `cancel_transaction`, que funciona apenas
antes da captura (order em status `created`). Essa história implementa o reembolso de verdade e
o expõe dentro do fluxo já existente de **Transações > Cancelar** (`PaymentsScreen.tsx`), em vez
de criar uma tela nova.

## Persona
**Admin/owner/manager** de uma empresa — hoje sem nenhuma forma de estornar dentro do Ordin uma
cobrança de cartão ou PIX via Mercado Pago já aprovada, mesmo quando o cliente contesta ou pede
o dinheiro de volta.

## Contexto

### É a continuação direta de uma decisão já tomada, não um requisito novo
O ORD-079 (cancelamento de transação, Done) já identificou este exato problema e escolheu
adiá-lo deliberadamente, não ignorá-lo: `PaymentsScreen.tsx` (`canCancel`, linhas 104-106) esconde
o botão "Cancelar" para toda transação `provider === "mercadopago"`, com o critério de aceite
explícito "esconde o botão de cancelar até confirmação de que o refund funciona de verdade". O
próprio `Achado 3` do ORD-079 já apontava que `MPProvider.cancel_transaction` usava, na época, a
API de intenção de pagamento (semanticamente errada para estornar algo já capturado) — e depois o
ORD-129 (migração para a API de Orders) sinalizou de novo o mesmo gap sem resolvê-lo: "Refund —
gap novo a considerar... vale avaliar nesta história ou como follow-up".

### Confirmado hoje que o gap é total, não parcial
Em 2026-09-01, `grep refund` em `services/payment/` não retorna nenhuma chamada de reembolso em
lugar nenhum do código — nem para cartão (Point/Orders API), nem para PIX. Rodando o
`quality_checklist` oficial do Mercado Pago (via MCP) para a aplicação real do Ordin (app ORDIN,
`app_id 4475219303194739`), "Devoluciones" (`refunds_api`) aparece listado como boa prática não
atendida — confirmação independente, vinda do próprio Mercado Pago, do mesmo gap identificado por
leitura de código.

### Prioridade
Usuário declarou explicitamente, em 2026-09-01, que reembolso "é crucial para a operação" e
pediu prioridade máxima — está registrado em memória de longo prazo do projeto para não ser
esquecido em nenhum trabalho futuro de pagamentos.

### Onde deve nascer, não onde poderia nascer
A pedido explícito do usuário: reembolso deve viver dentro do fluxo já existente de Transações >
Cancelar, reaproveitando o mesmo `ConfirmDialog`/modal que hoje cancela transações PayGo/mock —
não uma tela ou fluxo novo. A Explorer deve detalhar como a ação de reembolso se relaciona com a
ação de cancelamento já existente (mesmo botão com comportamento condicional por provider/status?
botão adicional? mesma modal com título diferente?), não assumir a resposta aqui.

### Escopo esperado
Cobrir os dois métodos Mercado Pago usados em produção hoje — cartão via Point e PIX (confirmado
com dados reais de `ordin_audit.payment_events` no Mongo, ambos os métodos têm transações
aprovadas reais). **Decisão tomada com o usuário em 2026-09-01: só reembolso total nesta v1**,
mesmo padrão do cancelamento existente — reembolso parcial (que a API de Orders do MP já suporta
nativamente) fica fora do escopo, podendo virar história separada se aparecer necessidade real.

### Dependências e histórico relacionado
- [[ORD-079]] — fluxo de cancelamento existente que será estendido, incluindo o `Achado 3` que
  originou este gap
- [[ORD-129]] — migração do `MPProvider` para a API de Orders, que já tinha sinalizado o gap de
  refund sem resolvê-lo
- [[ORD-132]] — auditoria completa de payloads de pagamento no Mongo, que a implementação de
  refund deve seguir (toda chamada de reembolso, request e response, auditada)
- `docs/analise-meios-pagamento-integracao.md` — documento que consolida este e outros gaps de
  integração com meios de pagamento

---

## Explorer

## História
Como **admin/owner/manager de uma empresa**, quero estornar uma transação aprovada via Mercado
Pago (cartão ou PIX) diretamente no Ordin, informando o motivo, para poder devolver o dinheiro ao
cliente quando ele contesta a cobrança ou pede reembolso — sem precisar recorrer manualmente ao
painel do Mercado Pago.

## Contexto e motivação
O fluxo de cancelamento de transações (ORD-079) já resolveu esse problema para PayGo e para
transações mock, mas deixou Mercado Pago deliberadamente de fora até o reembolso de verdade
existir — decisão registrada como critério de aceite explícito, não um esquecimento. Hoje esse
gap é total: nenhuma chamada de reembolso é feita em nenhum lugar do código, e o próprio
Mercado Pago confirma essa lacuna como boa prática não atendida na aplicação real do Ordin.
Sem isso, toda contestação de cliente pago via Mercado Pago (o provider mais usado em produção
hoje) exige que alguém entre manualmente no painel do MP — processo lento, sem rastreabilidade
dentro do Ordin, e dependente de alguém ter acesso a essas credenciais fora do fluxo normal de
operação da empresa.

## Fluxo principal
1. Na tela de Transações, uma transação `approved` com `provider === "mercadopago"` (cartão ou
   PIX) passa a ter uma ação visível na coluna de Ações — hoje ela é ocultada por `canCancel()`
2. Clique abre o mesmo `ConfirmDialog` estendido já usado no cancelamento (ORD-079), mas com
   título e texto adaptados: **"Estornar transação"** em vez de "Cancelar transação" — copy deixa
   claro que a cobrança já foi capturada e o valor será devolvido ao cliente via Mercado Pago,
   não apenas marcado localmente
3. Admin escolhe o motivo (reaproveita o dropdown `CANCEL_REASONS` já existente: "Contestação do
   cliente", "Erro operacional", "Duplicidade", "Outro" com texto livre) e confirma
4. Backend identifica que é uma transação `mercadopago` já capturada e chama o endpoint de
   reembolso correspondente ao `method` da transação (cartão via Point ou PIX) — não o
   `cancel_transaction` existente, que não se aplica a pagamento já processado
5. Sucesso: toast de confirmação ("Transação estornada — o valor será devolvido ao cliente pelo
   Mercado Pago"), linha da tabela atualiza para `refunded`/`cancelled` (a definir no Tech
   Explorer qual status reflete melhor um reembolso MP) sem recarregar a tela inteira
6. Toda a chamada (request e response do Mercado Pago) é auditada em `ordin_audit.payment_events`,
   mesmo padrão do ORD-132

## Fluxos alternativos / exceções
- Transação PayGo ou mock `approved`: comportamento inalterado, continua sendo cancelamento
  (não reembolso), mesmo fluxo e mesma copy de hoje
- Transação MP já `cancelled`, `refused` ou já reembolsada: ação não aparece — mesma lógica de
  exclusividade por status que `canCancel()` já aplica
- Falha na chamada de reembolso ao Mercado Pago (erro de rede, 4xx/5xx da API): toast de erro
  específico, transação **não** é marcada como reembolsada localmente até confirmação real do
  provider — diferente do comportamento best-effort do cancelamento PayGo (ORD-079), porque aqui
  existe uma resposta confirmável da API de reembolso, não um "melhor esforço"
- Usuário sem role `admin`/`owner`/`manager`: ação não é exibida nem acessível via API direta
  (backend rejeita com 403, mesma defesa em profundidade do ORD-079)
- Reembolso de PIX em transação onde o `provider_transaction_id` não corresponde a um pagamento
  válido no Mercado Pago (dado legado/inconsistente): erro tratado com mensagem específica, não
  um erro genérico
- **Transação fora do prazo de reembolso do Mercado Pago** (90 dias da aprovação para cartão/
  Point, 180 dias para PIX): mesmo padrão preventivo já usado pro cancelamento PayGo
  (`isPaygoBlocked()`, ORD-079) — o modal avisa **antes** de o admin preencher o motivo e tentar
  confirmar, não deixa ele descobrir só depois de um erro da API

## Dependências
- Serviços envolvidos: `payment-service` (novo método de reembolso no `MPProvider`, ajuste no
  endpoint de cancelamento/reembolso), `frontend/admin` (`PaymentsScreen.tsx`)
- Histórias bloqueantes: nenhuma — [[ORD-079]] e [[ORD-129]] já estão `Done`, o que esta história
  estende já existe e funciona

## Critérios de aceite funcionais
- [ ] Transação MP `approved` (cartão ou PIX) mostra a ação de estorno na tela de Transações, só
      para roles `admin`/`owner`/`manager`
- [ ] Copy do modal deixa claro que é um reembolso real (cobrança já capturada), não um
      cancelamento — nunca reutiliza a palavra "Cancelar" para essa ação
- [ ] Reembolso cobre cartão (Point) e PIX aprovados — mesmo fluxo de UI para os dois
- [ ] Reembolso é sempre do valor **total** da transação (sem campo de valor parcial nesta v1)
- [ ] Sucesso: toast de confirmação + atualização da linha sem reload da tela inteira
- [ ] Falha na chamada ao Mercado Pago: transação não é marcada como reembolsada localmente,
      toast de erro específico, admin pode tentar de novo
- [ ] Transação fora do prazo de reembolso (90 dias cartão / 180 dias PIX, contados da aprovação)
      mostra aviso preventivo no modal antes de tentar confirmar, mesmo padrão do `isPaygoBlocked`
- [ ] Toda chamada de reembolso (request e response) é auditada em `ordin_audit.payment_events`
- [ ] Transação já cancelada/recusada/reembolsada não mostra a ação
- [ ] Backend rejeita reembolso de role não autorizada mesmo via chamada direta à API (403)
- [ ] Fluxo de cancelamento de PayGo/mock e de PIX pendente (ainda não pago) permanecem
      exatamente como estão hoje, sem nenhuma mudança de comportamento

## Wireframe / Mockup
Sem mockup novo — reaproveita integralmente o `ConfirmDialog` estendido do ORD-079
(`PaymentsScreen.tsx`), mesma posição na coluna de Ações, mesmo padrão de dropdown de motivo +
texto livre condicional. Única mudança visual é o texto do botão/título/mensagem quando a
transação é Mercado Pago aprovada ("Estornar" em vez de "Cancelar") — detalhe de componente
(prop condicional vs. instância separada do `ConfirmDialog`) fica para o Tech Explorer.

---

## QA Explorer

```gherkin
Feature: Reembolso de transação Mercado Pago (Point e PIX)
  Como admin/owner/manager de uma empresa
  Quero estornar uma transação aprovada via Mercado Pago informando o motivo
  Para devolver o dinheiro ao cliente quando ele contesta a cobrança, sem depender do painel do MP

  Background:
    Dado que sou admin da empresa 1 (Burger House), autenticado com role "owner"
    E a empresa 1 tem Mercado Pago configurado e ativo como provider

  # ── Happy path ────────────────────────────────────────────────────────────

  Scenario: Estornar transação de cartão MP aprovada
    Dado uma transação "approved", provider "mercadopago", method "credit", valor R$ 45,00
    Quando abro a ação de estorno na linha da transação
    Então o modal mostra o título "Estornar transação" (não "Cancelar transação")
    E o texto deixa claro que a cobrança já foi capturada e o valor será devolvido ao cliente
    Quando seleciono o motivo "Contestação do cliente" e confirmo
    Então o payment-service chama o endpoint de reembolso de cartão do Mercado Pago (Orders API)
      com o valor total da transação
    E a chamada retorna sucesso
    E vejo um toast de confirmação de estorno
    E a linha da transação atualiza seu status sem recarregar a tela inteira
    E a chamada (request e response) é gravada em ordin_audit.payment_events

  Scenario: Estornar transação PIX MP aprovada
    Dado uma transação "approved", provider "mercadopago", method "pix", valor R$ 22,50
    Quando abro a ação de estorno, seleciono o motivo "Erro operacional" e confirmo
    Então o payment-service chama o endpoint de reembolso de PIX do Mercado Pago
      com o valor total da transação
    E a chamada retorna sucesso
    E vejo um toast de confirmação de estorno
    E a linha da transação atualiza seu status sem recarregar a tela inteira

  # ── Bordas ────────────────────────────────────────────────────────────────

  Scenario: Motivo "Outro" exige texto livre
    Dado o modal de estorno aberto para uma transação MP aprovada
    Quando seleciono o motivo "Outro" sem preencher o texto livre
    Então o botão de confirmar fica desabilitado ou mostra erro de validação
    E nenhuma chamada de reembolso é feita ao Mercado Pago

  Scenario: Reembolso é sempre do valor total, sem opção de valor parcial
    Dado o modal de estorno aberto para uma transação MP aprovada de R$ 100,00
    Então não existe nenhum campo de valor no modal
    E ao confirmar, o reembolso solicitado ao Mercado Pago é sempre o valor integral da transação

  # ── Erros ─────────────────────────────────────────────────────────────────

  Scenario: Falha na chamada de reembolso ao Mercado Pago não marca a transação como reembolsada
    Dado uma transação "approved", provider "mercadopago", method "credit"
    E o Mercado Pago retorna erro (rede indisponível ou 4xx/5xx) na chamada de reembolso
    Quando confirmo o estorno
    Então vejo um toast de erro específico, não uma mensagem genérica
    E a transação permanece com status "approved" no Ordin (não muda para reembolsada)
    E a tentativa é registrada em ordin_audit.payment_events, mesmo tendo falhado
    E o admin pode tentar novamente

  Scenario: Transação MP já reembolsada não mostra a ação de estorno
    Dado uma transação provider "mercadopago" já com status refletindo reembolso concluído
    Então a ação de estorno não aparece na linha dessa transação

  Scenario: Transação MP cancelada ou recusada não mostra a ação de estorno
    Dado uma transação provider "mercadopago" com status "cancelled" ou "refused"
    Então a ação de estorno não aparece na linha dessa transação

  Scenario: Backend rejeita estorno de role não autorizada mesmo via chamada direta à API
    Dado um token válido de um usuário com role "cashier" (fora de admin/owner/manager)
    Quando esse token chama diretamente o endpoint de reembolso para uma transação MP aprovada
    Então a resposta é 403
    E nenhuma chamada é feita ao Mercado Pago
    E a transação permanece inalterada

  # ── Isolamento multi-tenant ──────────────────────────────────────────────

  Scenario: Empresa B não consegue estornar transação da empresa A
    Dado uma transação "approved" MP pertencente à empresa 1
    E um token de admin autenticado na empresa 2
    Quando esse token chama o endpoint de reembolso para a transação da empresa 1
    Então a resposta é 403 ou 404 (mesma semântica já usada em /payments/{id}/cancel)
    E nenhuma chamada é feita ao Mercado Pago
    E a transação da empresa 1 permanece inalterada

  # ── Regressão — nada além de MP aprovado muda de comportamento ─────────────

  Scenario: Transação PayGo aprovada continua usando o cancelamento de sempre
    Dado uma transação "approved", provider "paygo", feita hoje
    Quando abro a ação na linha dessa transação
    Então vejo o modal "Cancelar transação" (comportamento e copy do ORD-079, inalterados)
    E ao confirmar, o fluxo chama cancel_transaction como já acontecia antes desta história

  Scenario: Transação mock aprovada continua usando o cancelamento de sempre
    Dado uma transação "approved", provider "mock"
    Quando abro a ação na linha dessa transação
    Então vejo o modal "Cancelar transação", comportamento inalterado

  Scenario: Order MP ainda não capturada (created/at_terminal) não usa o fluxo de reembolso
    Dado uma order Mercado Pago em status "created" ou "at_terminal" (ainda não aprovada)
    Então essa transação não aparece como candidata a "approved" na tela de Transações
    E, se cancelada por outro caminho já existente, continua usando POST /v1/orders/{id}/cancel
      (fluxo pré-captura do ORD-129), não o endpoint de reembolso desta história

  Scenario: PIX ainda pendente continua usando o cancelamento de PIX pendente existente
    Dado um PIX criado, ainda "pending" (não aprovado)
    Quando o cliente desiste ou o PIX expira
    Então o cancelamento usa o endpoint já existente de "Cancelar PIX pendente"
      (services/payment/main.py, endpoint de timeout/desistência)
    E não o endpoint de reembolso desta história, que exige status "approved"
```

**Cenários revisados e aprovados pelo PM.**

---

## Tech Explorer

### Serviços impactados
- **payment-service**: `domain/interfaces/payment_provider.py` (novo método na interface),
  `infrastructure/providers/mercadopago.py`/`mock.py`/`paygo.py` (implementação), `main.py`
  (endpoint novo, correção do guard existente, migration, evento de fila, auditoria)
- **frontend/admin**: `PaymentsScreen.tsx` (ação condicional, `ConfirmDialog`, chamada de API)

### Correção obrigatória no endpoint existente (`POST /payments/{tx_id}/cancel`)
O guard atual (`main.py`, dentro de `cancel_payment`) só bloqueia `credit`/`debit`:
```python
if tx.provider == "mercadopago" and tx.method in ("credit", "debit"):
    raise HTTPException(400, "Cancelamento de cartão via Mercado Pago ainda não suportado — contate o suporte")
```
Precisa virar:
```python
if tx.provider == "mercadopago":
    raise HTTPException(400, "Transação Mercado Pago já aprovada — use o endpoint de reembolso (POST /payments/{tx_id}/refund)")
```
Sem essa correção, uma transação `pix` `approved` da Mercado Pago continua caindo no `tx.status = "cancelled"` sem nenhuma chamada real ao provider — o mesmo bug latente que motivou originalmente o guard de cartão (ORD-079, Achado 3), só que nunca fechado pro PIX. Essa mudança é pré-requisito desta história, não opcional.

### `IPaymentProvider` — novo método
```python
@abstractmethod
async def refund_transaction(
    self,
    provider_transaction_id: str,
) -> "RefundResult": ...
```
Sem `terminal_ref` — reembolso via API MP não depende de terminal, diferente de `cancel_transaction`
(que cancela uma order ainda em rota pro hardware). Retorno deixa de ser `bool` puro: introduzir
`RefundResult` (dataclass em `domain/schemas.py`, mesmo padrão de `TransactionResult`):

Além disso, a interface ganha um segundo método — **não abstrato, com default** — pra prazo de
reembolso ser uma capacidade declarada por cada provider, não uma regra genérica solta em
`main.py`:
```python
def refund_window_days(self, method: str) -> Optional[int]:
    """Prazo (em dias, a partir da aprovação) que este provider aceita pra reembolso via API,
    por método de pagamento. None = sem limite conhecido ou reembolso não suportado pelo provider.
    Cada provider declara o próprio prazo — é uma restrição da integração específica (contrato
    de API de cada adquirente), não uma regra universal de reembolso."""
    return None
```
```python
@dataclass
class RefundResult:
    success: bool
    error_message: Optional[str] = None
    raw_response: Optional[dict] = None  # pro save_audit
```
Justificativa: `cancel_transaction` engolir a exceção em `bool` já é uma limitação aceitável pra
cancelamento best-effort (ORD-079 documentou essa decisão). Reembolso não pode ser best-effort —
o critério de aceite exige mensagem de erro específica (saldo insuficiente, prazo expirado, id
inválido), então o provider precisa devolver o suficiente pro endpoint montar essa mensagem.

**MockProvider**: `refund_transaction` retorna `RefundResult(success=True)` — mantém fluxo de
dev/CI funcionando sem mudança de comportamento visível.

**PayGoProvider**: implementa levantando `NotImplementedError("Reembolso PayGo fora do escopo — usar cancelamento no mesmo dia")` — nunca é chamado na prática, porque o endpoint novo só roteia pra `provider == "mercadopago"` (ver abaixo), mas a interface exige a implementação por ser um método abstrato.

**MPProvider** (`infrastructure/providers/mercadopago.py`), mesma lógica de distinção por prefixo
do `provider_transaction_id` já usada em `cancel_transaction`:
```python
async def refund_transaction(self, provider_transaction_id: str) -> RefundResult:
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
                headers={**self._headers, "X-Idempotency-Key": f"refund-{provider_transaction_id}"},
                json={},
            )
            if resp.status_code in (200, 201):
                return RefundResult(success=True, raw_response=resp.json())
            detail = resp.json().get("message") or resp.text
            return RefundResult(success=False, error_message=detail, raw_response=resp.json() if resp.content else None)
        except Exception as exc:
            return RefundResult(success=False, error_message=str(exc))
```
Sem body (`json={}`) em ambos os casos garante reembolso total, conforme confirmado na doc oficial
(cartão: `POST /v1/orders/{id}/refund` sem body; PIX: `POST /v1/payments/{id}/refunds` sem `amount`).

`MPProvider` sobrescreve `refund_window_days` com o prazo real da API do Mercado Pago, confirmado
na documentação oficial (MCP) nesta sessão — dado específico dessa integração, não de PayGo/mock:
```python
def refund_window_days(self, method: str) -> Optional[int]:
    return 180 if method == "pix" else 90
```
`MockProvider`/`PayGoProvider` não sobrescrevem — usam o `None` default da interface (sem limite
conhecido, consistente com nenhum dos dois ter reembolso implementado nesta história).

### Endpoint novo

#### POST /payments/{tx_id}/refund
**Serviço:** payment-service
**Auth:** JWT obrigatório | role: `admin`/`owner`/`manager` (mesma dependency `require_write_role` do cancelamento)
**company_id:** extraído do JWT — mesmo filtro de tenant já usado em `cancel_payment` (superadmin/admin vê qualquer empresa, demais roles restritos à própria)

Request:
```json
{
  "reason": "contestacao"
}
```

Response 200:
```json
{
  "ok": true,
  "transaction_id": 3976,
  "status": "refunded"
}
```

Erros:
- `400` — transação não está `approved`, ou `provider !== "mercadopago"` (reembolso é exclusivo MP; PayGo/mock continuam em `/cancel`)
- `403` — role sem permissão
- `404` — transação não encontrada (ou de outra empresa, mesma semântica 404 já usada no cancelamento pra não vazar existência)
- `422` — fora do prazo de reembolso (checagem preventiva do próprio Ordin, ver abaixo — mesmo
  papel do 422 que o cancelamento PayGo já usa pra "fora do mesmo dia")
- `502` — Mercado Pago recusou o reembolso mesmo dentro do prazo esperado (saldo insuficiente, id
  inválido, ou o prazo real do MP divergiu da checagem local) — `detail` traz a mensagem
  específica vinda de `RefundResult.error_message`

**Checagem de prazo, backend (antes de chamar o provider — evita chamada desnecessária à API do MP).
Pergunta ao próprio provider qual o prazo dele, não usa uma tabela genérica em `main.py`:**
```python
provider = get_provider(config)  # já instanciado como MPProvider nesse ponto do fluxo
limit_days = provider.refund_window_days(tx.method)
if limit_days is not None and tx.created_at:
    if (datetime.utcnow() - tx.created_at).days > limit_days:
        raise HTTPException(422, f"Prazo de reembolso expirado — {tx.provider} aceita até {limit_days} dias da aprovação")
```
`main.py` não sabe (nem precisa saber) que "90/180 dias" é uma regra do Mercado Pago
especificamente — só sabe que "esse provider, pra esse método, tem (ou não) um prazo". Se um
provider futuro (Stone/Pagar.me/Adyen, roadmap do ORD-025) implementar reembolso com prazo
diferente ou sem prazo documentado, basta sobrescrever `refund_window_days` na classe dele — zero
mudança em `main.py`.

Usa `tx.created_at` como proxy da data de aprovação — mesma aproximação que o cancelamento PayGo
já faz hoje (`isPaygoBlocked`/checagem de "mesmo dia" também usa `created_at`, não um campo
`approved_at` separado que não existe no schema). Consistente, não é uma exceção nova ao padrão.

### Migrations
```sql
ALTER TABLE transactions ADD COLUMN refunded_at DATETIME NULL;
ALTER TABLE transactions ADD COLUMN refund_reason VARCHAR(255) NULL;
```
Colunas dedicadas, não reaproveita `cancelled_at`/`cancel_reason` — reembolso é um evento distinto
de cancelamento (dinheiro já saiu da conta MP, não é "pedido não processado"), e misturar os dois
nas mesmas colunas confundiria qualquer auditoria futura sobre o que de fato aconteceu com a
transação. Nenhuma migration necessária pro `status` em si (`Column(String(20))`, aceita
`"refunded"` sem alteração de schema) — só adicionar `refunded = "refunded"` em
`TransactionStatus(str, Enum)` (`domain/schemas.py`) por consistência de código.

### Eventos de fila
Publica `payment.refunded` → `PaymentRefundedEvent` (novo, mesmo módulo dos eventos existentes),
schema análogo a `PaymentCancelledEvent` (`company_id`, `order_ref`, `transaction_id`, `amount`,
`refund_reason`, `provider`). **Não reaproveita `payment.cancelled`** — são fatos de negócio
diferentes e um consumidor futuro (ex.: relatório financeiro) precisa poder distinguir estorno
real de cancelamento pré-captura sem inspecionar campos extras. Consumido pelo mesmo lugar que já
escuta `payment.cancelled` hoje (nenhum consumidor real identificado além do broadcast — mesmo
padrão de "publica e fica disponível" já usado nos demais eventos de pagamento).

### Impacto em outros serviços
Nenhum além do `payment-service` chamando a API do Mercado Pago diretamente (já é o padrão hoje
pra `create_transaction`/`cancel_transaction`). `order-service` não precisa saber de reembolso —
o pedido já foi coletado/concluído antes de uma contestação tardia, diferente do cancelamento
(que ainda notifica `order-service` via `_notify_order`, porque pode acontecer antes da coleta).

### Frontend (`PaymentsScreen.tsx`)

```tsx
function canCancel(t: Transaction): boolean {
  return t.status === "approved" && t.provider !== "mercadopago";
}
function canRefund(t: Transaction): boolean {
  return t.status === "approved" && t.provider === "mercadopago";
}
```

Estado do modal generalizado pra guardar qual ação disparar — mesmo padrão já usado no projeto
pra estado de confirmação bidirecional (toggle ativar/desativar em Catálogo > Opções, ORD-145):
```tsx
const [actionTarget, setActionTarget] = useState<{ tx: Transaction; kind: "cancel" | "refund" } | null>(null);

async function confirmAction(reason: string) {
  if (!actionTarget) return;
  const { tx, kind } = actionTarget;
  await api.post(`/payments/${tx.id}/${kind}`, { reason });
  // atualiza a linha local, toast de sucesso, fecha o modal
}
```
`ConfirmDialog` recebe `title`/`message`/`confirmLabel` condicionais a `actionTarget?.kind`:
- `kind === "cancel"`: título "Cancelar transação", copy atual do ORD-079, inalterada
- `kind === "refund"`: título "Estornar transação", copy nova deixando explícito que a cobrança
  já foi capturada e o valor será devolvido ao cliente pelo Mercado Pago (não "melhor esforço",
  diferente da copy de cancelamento sugerida no ORD-079)

Botão na coluna de Ações: `canCancel(t) ? <button onClick={() => setActionTarget({tx:t, kind:"cancel"})}>Cancelar</button> : canRefund(t) ? <button onClick={() => setActionTarget({tx:t, kind:"refund"})}>Estornar</button> : null`.

**Checagem preventiva de prazo, mesmo padrão do `isPaygoBlocked` (ORD-079).** Nomeada e comentada
como regra específica do Mercado Pago (não um prazo genérico de "reembolso de cartão/PIX") — o
frontend não tem uma abstração de "capacidade do provider" como o backend (`IPaymentProvider`),
então a constante precisa deixar isso explícito por nome e comentário, já que é só texto, não
código compartilhado com o backend:
```tsx
// Prazo de reembolso via API — específico da integração Mercado Pago (Orders API pra cartão,
// Payments API pra PIX), confirmado na documentação oficial do MP. NÃO é uma regra genérica de
// reembolso — outro provider que vier a implementar reembolso (Stone/Pagar.me/Adyen) precisa da
// própria constante, com o próprio prazo.
const MP_REFUND_WINDOW_DAYS: Record<string, number> = { credit: 90, debit: 90, pix: 180 };

function isMpRefundExpired(t: Transaction): boolean {
  if (t.provider !== "mercadopago") return false;
  const limitDays = MP_REFUND_WINDOW_DAYS[t.method] ?? 90;
  const elapsedMs = Date.now() - new Date(t.created_at).getTime();
  return elapsedMs > limitDays * 24 * 60 * 60 * 1000;
}
```
Quando `actionTarget?.kind === "refund"` e `isMpRefundExpired(actionTarget.tx)`, o `ConfirmDialog`
mostra o aviso antes de o admin preencher o motivo — mesmo `alertVariant="warning"`/
`alertIcon="alert-triangle"` já usado no aviso do PayGo — e o botão de confirmar chama a API
mesmo assim (o `422` do backend é a fonte da verdade; o frontend só evita a expectativa errada,
igual o PayGo já faz).

### Estimativa
- Backend: 5 pontos (interface + 3 providers + endpoint novo + migration + evento + correção do guard existente + auditoria)
- Frontend: 3 pontos (generalização do estado do modal + copy condicional + chamada ao endpoint certo)
- **Total: 8 pontos**

### Riscos
- **Saldo insuficiente na conta MP para devolver o valor** — a API do Mercado Pago recusa o
  reembolso nesse caso; mapeado como `502` com mensagem específica (`RefundResult.error_message`),
  não um erro genérico. Não há mitigação automática possível do lado do Ordin — é uma condição
  real do lado do provider.
- **Prazo de reembolso estourado** — 90 dias (cartão/Point) ou 180 dias (PIX/Payments API) a
  partir da aprovação. Mitigado com checagem preventiva no frontend (`isMpRefundExpired`) e
  bloqueio real no backend (`422` antes de chamar o provider) — usa `tx.created_at` como proxy da
  data de aprovação, mesma aproximação já aceita no cancelamento PayGo. Se o prazo real do MP
  divergir da checagem local por qualquer motivo, o `502` reativo continua como rede de segurança.
- **Idempotência** — `X-Idempotency-Key` único por `provider_transaction_id` evita reembolso
  duplicado em caso de retry de rede; se o admin clicar duas vezes rapidamente, a segunda chamada
  ao MP retorna o mesmo resultado da primeira (comportamento nativo da API), mas o endpoint do
  Ordin ainda deve tratar "transação já `refunded`" como 400 antes mesmo de chamar o provider
  (mesma lógica de exclusividade de estado da QA Explorer).
- **Bug do guard de PIX (achado nesta sessão)** — baixo risco de exploração real hoje (não
  alcançável pela UI), mas precisa ser corrigido como parte desta história, não como débito
  técnico separado, porque o novo endpoint de reembolso só faz sentido se o caminho antigo parar
  de aceitar PIX MP aprovado silenciosamente.
- Sem conflito com `docs/ARQUITETURA.md` — `company_id` extraído do JWT, nenhuma credencial nova
  hardcoded, endpoint segue o padrão de auth já estabelecido no `payment-service`.

---

## Ready

### Checklist de entrada

**Explorer (PM + Produto)**
- [x] História no formato Como/Quero/Para
- [x] Contexto e motivação documentados (continuação direta do gap deixado explícito no ORD-079,
      confirmado hoje via `quality_checklist` oficial do Mercado Pago)
- [x] Fluxo principal passo a passo
- [x] Dependências identificadas ([[ORD-079]], [[ORD-129]], [[ORD-132]] — todas `Done`)
- [x] Wireframe/mockup — reaproveita o `ConfirmDialog` existente, sem tela nova
- [x] Critérios de aceite funcionais escritos, incluindo o aviso preventivo de prazo

**QA Explorer (QA)**
- [x] Happy path em Gherkin (cartão e PIX)
- [x] Cenários de borda (motivo "Outro", reembolso sempre total)
- [x] Cenários de erro (falha na chamada ao MP, transação já reembolsada/cancelada/recusada, role
      não autorizada)
- [x] Cenário de isolamento multi-tenant incluído
- [x] Cenários de regressão (PayGo/mock inalterados, PIX pendente inalterado, order pré-captura
      inalterada)
- [x] Cenários aprovados pelo PM

**Tech Explorer (Backend + Frontend)**
- [x] Serviços impactados documentados (payment-service, frontend/admin)
- [x] Endpoint novo com payload request/response/erros (`POST /payments/{tx_id}/refund`)
- [x] Migrations descritas (`refunded_at`/`refund_reason` em `transactions`)
- [x] Evento de fila documentado (`payment.refunded`, novo, não reaproveita `payment.cancelled`)
- [x] Estimativa de esforço definida (8 pontos: 5 backend + 3 frontend)
- [x] Riscos identificados com mitigação (saldo insuficiente, prazo de reembolso, idempotência,
      correção do bug latente do guard de PIX)
- [x] Regra de prazo de reembolso especificada como capacidade por provider
      (`IPaymentProvider.refund_window_days`, sobrescrita em `MPProvider`) e não como tabela
      genérica em `main.py` — correção pedida explicitamente pelo usuário durante a revisão desta
      Tech Explorer, pra não confundir restrição de uma integração específica com regra universal
      de pagamento

**Aprovação final**
- [x] Time (usuário) revisou e aprovou a solução técnica — "aprovado, pode fechar o Ready"
      (2026-09-01), depois de duas rodadas de correção sobre a regra de prazo de reembolso
- [x] Estimativa acordada (8 pontos)
- [x] Sem bloqueios não resolvidos
- [x] Priorização aprovada para implementação imediata

**Status: Ready** — apta para implementação.
