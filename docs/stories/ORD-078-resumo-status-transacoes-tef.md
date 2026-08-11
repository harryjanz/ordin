---
id: ORD-078
status: Ready
fase: 6
sprint: null
responsavel: Backend + Frontend
estimativa: 3 pontos
---

# ORD-078 — Transações TEF: resumo por status (recusado, cancelado, em processamento — não só aprovado)

## Descrição
Segunda história da análise de PM sobre `/payments` (ver [[ORD-077]] pra contexto completo da tela). O usuário notou que a tela só mostra "Total aprovado" e pediu pra pensar em outros status que também têm dado importante. Depende de [[ORD-077]] estar implementada primeiro (precisa dos mesmos filtros de empresa/período/provider já aplicados ao resumo) — mas o desenho técnico abaixo já assume isso.

**Achado que muda o desenho da solução:** o card "Total aprovado" de hoje (`PaymentsScreen.tsx:26-28`) é calculado **no cliente**, somando só o array de transações já carregado (`transactions.filter(...).reduce(...)`). Isso funciona hoje porque não existe paginação — a "lista carregada" é a lista inteira (até o teto de 100). Assim que [[ORD-077]] introduzir paginação de verdade, esse cálculo client-side passa a estar **errado** (somaria só a página atual, não o total filtrado) — não dá pra simplesmente estender o card antigo, o resumo precisa vir agregado do backend.

## Persona
Qualquer usuário que abre `/payments` pra entender rapidamente "como estão as transações" sem ler linha por linha — especialmente o dono/gerente fechando o dia ou investigando um pico de recusas.

## Contexto

### Achado 1 — só um status tem visibilidade agregada
`STATUS_VARIANT` (`PaymentsScreen.tsx:8-13`) já reconhece 4 status visualmente (`approved`, `refused`, `cancelled`, `pending`) mas só `approved` vira número agregado. Os dados reais de dev (`company_id=1`, query direta no MySQL) mostram que os outros status não são marginais:

| Status | Transações | Valor |
|---|---|---|
| approved | 58 | R$ 4.541,50 |
| refused | 11 | R$ 876,40 |
| cancelled | 8 | R$ 379,00 |
| processing | 13 | R$ 354,40 |
| expired | 2 | R$ 10,00 |

`refused` sozinho é **19% do valor aprovado** — dinheiro que passou pela máquina e não entrou, sem nenhum destaque na tela hoje. `processing` (PIX aguardando confirmação de pagamento — comentário em `main.py:350` "PIX criado com sucesso — aguardando pagamento") também não aparece em lugar nenhum: são 13 transações que podem estar travadas esperando um webhook que nunca chegou, e ninguém saberia olhar a tela atual.

### Achado 2 — o enum real tem 5 valores, não 4
`STATUS_VARIANT` no frontend cobre `approved/refused/cancelled/pending` — mas o enum real do backend (`domain/schemas.py:14-19`, `TransactionStatus`) é `approved/refused/cancelled/expired/processing`. **`pending` não é um status que aparece no banco** (é só o valor default transitório no momento da criação — a linha sempre é atualizada pro status final do provider antes do commit, `main.py:274` seguido de `main.py:302`); `expired` existe no enum e no banco mas não tem `Tag` mapeada no frontend hoje (cai no fallback `neutral`).

### Existe um dado importante e mais grave por trás de "recusado": não fica nada registrado do motivo
Ao investigar `refused`, percebi que `result.error_message` (retornado pelo provider — `domain/schemas.py:28`, usado na resposta HTTP do momento da recusa em `main.py:376`) **nunca é salvo na tabela `transactions`** — confirmei com uma query direta (`paygo_response` vem `NULL` mesmo em transações `refused` reais). O motivo da recusa existe por um instante (a resposta HTTP pro totem) e depois se perde pra sempre. Isso afeta mais o desenho de [[ORD-080]] (detalhe) do que este resumo, mas é por isso que o card de "Recusado" desta história mostra só contagem/valor, não motivo — não tem motivo persistido pra mostrar ainda.

---

## Explorer

### História
Como **qualquer usuário do admin**, quero ver um resumo com contagem e valor de cada status relevante (não só aprovado), para entender rapidamente a saúde das transações sem precisar ler a tabela inteira linha por linha.

### Fluxo principal
1. Usuário abre `/payments` (com ou sem filtros de [[ORD-077]] aplicados)
2. No lugar do card único "Total aprovado", vê uma linha de cards: **Aprovado**, **Recusado**, **Cancelado**, **Em processamento** — cada um com contagem + valor
3. `expired` não vira card dedicado (baixíssimo volume — 2 transações — card dedicado seria ruído); soma no card "Recusado" com um tooltip/nota, já que semanticamente também é "não completou" (a decisão de agrupar ou não fica registrada como decisão de UX abaixo, não decisão técnica)
4. Clicar em um card aplica o filtro de status equivalente na tabela abaixo (atalho — não obrigatório pro MVP, ver Riscos)
5. Os cards respeitam os filtros de empresa/período/provider já aplicados (ver [[ORD-077]]) — **mas ignoram o filtro de status**, porque o objetivo do resumo é mostrar a distribuição entre todos os status simultaneamente

### Critérios de aceite
- [ ] Card "Aprovado": contagem + soma de valor, mesmo comportamento visual de hoje (mantém a cor de destaque atual)
- [ ] Card "Recusado": contagem + soma de valor
- [ ] Card "Cancelado": contagem + soma de valor
- [ ] Card "Em processamento": contagem + soma de valor
- [ ] `expired` não aparece como card dedicado — soma junto com "Recusado" (mesmo bucket semântico "não completou"), com indicação visual (ex: tooltip "inclui expiradas") pra não confundir contagem
- [ ] Cards respeitam filtro de empresa/período/provider quando aplicados (ver [[ORD-077]]), mas nunca o filtro de status — sempre mostram a distribuição completa
- [ ] Cálculo vem do backend (query agregada), não do array de transações carregadas no cliente — correto mesmo com paginação
- [ ] Layout reaproveita o grid de cards já existente no `DashboardScreen` (`.grid`/`.card`/`.cardLabel`/`.cardValue`), não um componente novo do zero
- [ ] Estado de carregamento usa `Skeleton` (já importado no admin, `DashboardScreen.tsx:2`) em vez de aparecer vazio

### Wireframe / Mockup
Ver protótipo (Artifact) — 4 cards numa grade, mesmo estilo visual do `DashboardScreen`, adaptados pras cores semânticas já existentes no DS (`--success-base`, `--warning-base`, `--error-base`, ver `theme.scss:19-26`) em vez da cor ciano fixa (`#33cccc`, `PaymentsScreen.module.scss:34`) que hoje não tem relação com o resto da paleta semântica do admin.

---

## QA Explorer

```gherkin
Feature: Resumo por status nas Transações TEF

  Scenario: Resumo mostra os 4 status principais
    Dado que existem transações aprovadas, recusadas, canceladas e em processamento
    Quando o usuário abre /payments
    Então vê 4 cards: Aprovado, Recusado, Cancelado, Em processamento
    E cada card mostra contagem e valor total corretos

  Scenario: Transação expirada soma no card Recusado
    Dado que existe 1 transação com status "expired"
    Quando o usuário olha o card "Recusado"
    Então a contagem inclui essa transação
    E há indicação visual de que "expiradas" estão incluídas

  Scenario: Resumo respeita filtro de empresa (superadmin)
    Dado que o superadmin filtrou por uma empresa específica (ver ORD-077)
    Quando os cards de resumo são exibidos
    Então os valores refletem só as transações dessa empresa

  Scenario: Resumo ignora filtro de status
    Dado que o usuário filtrou a tabela por status "aprovado"
    Quando olha os cards de resumo
    Então todos os 4 cards continuam visíveis com seus respectivos totais
    E não só o card "Aprovado"

  Scenario: Resumo correto além da primeira página
    Dado que existem mais transações do que uma página (ver ORD-077)
    Quando o usuário está na página 2 da tabela
    Então os cards de resumo continuam mostrando o total agregado de TODAS as páginas, não só a atual

  Scenario: Clique no card aplica filtro (se implementado)
    Dado que o usuário clica no card "Recusado"
    Quando a tabela recarrega
    Então o filtro de status muda para "recusado"
```

---

## Tech Explorer

### Serviços impactados
- `services/payment/main.py` — estender `list_payments` com um bloco de agregação, ou novo campo `summary` na resposta
- `frontend/admin/` — `PaymentsScreen.tsx`, `PaymentsScreen.module.scss` (reaproveitando classes equivalentes de `DashboardScreen.module.scss`)

### Direção técnica proposta

**Backend** — adicionar ao `list_payments` (mesmos filtros de empresa/período/provider de [[ORD-077]], **sem** o filtro de status) uma segunda query agregada:
```python
summary_q = (
    select(Transaction.status, func.count(), func.sum(Transaction.amount))
    .where(<mesmos filtros de empresa/período/provider, sem status>)
    .group_by(Transaction.status)
)
```
Resposta do endpoint ganha um campo novo:
```json
{
  "items": [...],
  "total": 92,
  "summary": {
    "approved":   {"count": 58, "amount": 4541.50},
    "refused":    {"count": 11, "amount": 876.40},
    "cancelled":  {"count": 8,  "amount": 379.00},
    "processing": {"count": 13, "amount": 354.40},
    "expired":    {"count": 2,  "amount": 10.00}
  }
}
```
O agrupamento visual "Recusado inclui expiradas" fica só no frontend (soma `refused.count + expired.count` na hora de renderizar) — o backend devolve os 5 status separados, sem perder granularidade pra quem quiser os dados brutos depois.

**Frontend:** reaproveita `.grid`/`.card`/`.cardLabel`/`.cardValue` de `DashboardScreen.module.scss` (hoje só usado lá) — extrai pra um componente compartilhado (`StatCard` ou similar) se fizer sentido no momento da implementação, já que passaria a ter 2 usos.

### Riscos
- **Clique no card pra filtrar (item 4 do fluxo):** interação bônus, não crítica — se a estimativa apertar, corta primeiro sem quebrar o critério de aceite principal (que é só *mostrar* os 4 cards).
- **Cor do card "Aprovado":** hoje usa `#33cccc` fixo (`PaymentsScreen.module.scss:34`), uma cor que não existe em nenhum outro lugar do tema (`theme.scss` só define brand-primary roxo + success/warning/error). Trocar pra `--success-base` (verde, já usado em `Tag variant="success"` na própria tela) alinha com o resto do DS — mudança visual pequena mas real, vale confirmar que não é uma escolha de marca intencional antes de trocar.
- **`func.sum` retornando `None`** quando não há transações daquele status no período filtrado — tratar como `0`, não deixar `null` vazar pro frontend.

### Estimativa
3 pontos — uma query agregada nova + adaptação de um componente visual que já existe (`DashboardScreen`'s cards), sem novo conceito de UI a desenhar do zero.

---

## Ready

**Explorer:** [x] fluxo e critérios de aceite definidos, com achado sobre o cálculo client-side ficar incorreto após paginação · **QA Explorer:** [x] cenários cobrindo agregação correta, filtros combinados e paginação · **Tech Explorer:** [x] diagnóstico com números reais, proposta de contrato de API, riscos e estimativa · **Aprovação final:** [x] aprovado no chat pelo usuário (2026-08-11)

**Status: Ready** — pode começar a implementação.
