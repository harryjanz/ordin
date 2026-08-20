---
id: ORD-101
status: Done
fase: 6
sprint: null
responsavel: Backend + Frontend
estimativa: 8 pontos
---

# ORD-101 — Análises: KPIs comparativos, receita por hora e venda por terminal

## Descrição
Segue direto de `docs/analise-dashboard-concorrente-goomer.md` — coleta de ideias feita a partir do dashboard "Análises" de um concorrente (Goomer). O `DashboardScreen.tsx` atual é um placeholder: 4 contadores estáticos, sem série temporal, sem comparação com período anterior, sem seletor de data, sem quebra por terminal. Esta história substitui esse placeholder por uma tela de verdade, com os 3 blocos validados no documento de análise: KPIs com comparação de período, receita por hora, e venda por terminal (adaptação de "venda por solução" da Goomer pra realidade do Ordin, que não tem múltiplos canais de venda mas tem múltiplos totens físicos por loja).

**Fora de escopo, confirmado no documento de análise:** avaliação de clientes, giro de mesa, tempo médio de mesa, "TM Comanda" — nenhum desses conceitos existe no totem de autoatendimento do Ordin.

## Persona
**Owner/manager** (dono da loja, decide sobre terminais/operação) — mesma persona de Pedidos/Pagamentos. Superadmin/admin também acessam, com seletor de empresa (mesmo padrão de `SettingsScreen`/`CompanyScreen`).

## Explorer

### Achado técnico — tudo dá pra calcular a partir de `Transaction` (payment-service), sem tocar order-service
`Transaction` (`services/payment/main.py:46-70`) já tem `company_id`, `terminal_id`, `amount`, `status`, `created_at`. Receita, ticket médio, volume, receita por hora e venda por terminal são todos agregações sobre essa única tabela, filtrando `status == "approved"` (mesmo critério que `DashboardScreen.tsx` já usa hoje pro card "Faturamento aprovado"). Não precisa de join com `order-service`. O único dado que falta é o **rótulo** do terminal (`Terminal.label` mora no `company-service`) — resolvido no frontend, reaproveitando `listTerminals(companyId)` que já existe em `api/companies.ts` (usado hoje pelo painel expansível de transação do ORD-080).

### Fluxo principal
1. Owner/manager abre a tela (rota `/dashboard`, substitui o conteúdo atual — mantém o seletor de empresa pra superadmin/admin já existente)
2. Seletor de período: **Hoje** (padrão) / **Ontem** / **Este mês** / **Customizado** (`DateInput` de/até, mesmo componente já usado em Pedidos/Pagamentos)
3. 3 KPIs no topo — **Receita**, **Ticket médio**, **Volume** — cada um com selo de variação % vs. o período anterior de mesma duração (ex: "Hoje" compara com "ontem"; "Este mês" compara com o mês anterior completo; um range customizado de N dias compara com os N dias imediatamente anteriores)
4. Gráfico de barras: receita agrupada por hora do dia (0h–23h) dentro do período selecionado
5. Lista "Venda por terminal": terminal (rótulo) + receita + ticket médio, ordenada por receita decrescente

### Fluxos alternativos / exceções
- Período sem nenhuma transação aprovada → KPIs mostram R$ 0,00/0, sem selo de variação (ou selo neutro), gráfico e lista vazios com empty state
- Período anterior sem nenhuma transação aprovada (denominador zero) → variação % não é exibida (não dá pra calcular "de 0 pra X"), mostra "—" em vez de um percentual sem sentido
- Empresa sem terminal algum → lista "Venda por terminal" vazia

### Critérios de aceite
- [ ] KPIs Receita/Ticket médio/Volume com comparação % vs. período anterior de mesma duração
- [ ] Seletor Hoje/Ontem/Este mês/Customizado
- [ ] Gráfico de receita por hora (0h–23h) do período selecionado
- [ ] Lista de venda por terminal (receita + ticket médio), ordenada por receita
- [ ] Denominador zero (sem transação no período anterior) não gera percentual — mostra "—"
- [ ] Superadmin/admin mantêm o seletor de empresa já existente no Dashboard atual
- [ ] Nenhum dos itens fora de escopo (avaliação, giro de mesa, TM Comanda) aparece na tela

---

## QA Explorer

```gherkin
Feature: Análises — KPIs comparativos, receita por hora, venda por terminal

  Scenario: KPIs do dia comparados com ontem
    Dado transações aprovadas hoje totalizando R$ 500 em 10 pedidos
    E transações aprovadas ontem totalizando R$ 400 em 8 pedidos
    Quando o owner abre a tela com período "Hoje"
    Então Receita mostra R$ 500,00 com selo de +25% vs. o dia anterior
    E Volume mostra 10 com o selo correspondente

  Scenario: Sem transação no período anterior, sem percentual
    Dado nenhuma transação aprovada ontem
    E transações aprovadas hoje
    Quando o owner abre a tela com período "Hoje"
    Então os KPIs mostram os valores de hoje sem nenhum selo de variação

  Scenario: Receita por hora
    Dado transações aprovadas em horários diferentes do mesmo dia
    Quando o owner vê o gráfico
    Então cada barra reflete a soma de receita daquela hora, 0h a 23h

  Scenario: Venda por terminal
    Dado transações aprovadas em 2 terminais diferentes da mesma empresa
    Quando o owner vê a lista "Venda por terminal"
    Então cada terminal aparece com sua receita e ticket médio, maior receita primeiro

  Scenario: Isolamento multi-tenant
    Dado transações aprovadas de outra empresa
    Quando o owner vê a tela
    Então nenhum valor de outra empresa entra nos KPIs, no gráfico ou na lista por terminal

  Scenario: Filtro "Este mês" compara com o mês anterior completo
    Dado transações aprovadas neste mês e no mês anterior
    Quando o owner seleciona "Este mês"
    Então a comparação usa o mês anterior inteiro como período de referência
```

---

## Tech Explorer

### Serviços impactados
- `services/payment/` — `main.py`, endpoint novo `GET /payments/analytics`
- `frontend/admin/` — `DashboardScreen.tsx`/`.module.scss` (reescrita), `api/payments.ts` (nova função), novo componente `HourlyBarChart` (sem lib externa — 24 barras simples, mesmo espírito do gráfico da Goomer, sem adicionar dependência nova ao projeto)

### Endpoint novo

#### `GET /payments/analytics`
**Auth:** JWT — mesmo tratamento de `GET /payments` (`main.py:422-444`): superadmin/admin veem todas as empresas com `company_id` opcional pra restringir; qualquer outro role só vê a própria empresa (parâmetro ignorado silenciosamente).

Query params:
```python
company_id: Optional[int] = None
date_from: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
date_to: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
```
`date_to` é tratado como **inclusive do dia inteiro** — internamente vira `date_to + 1 dia` como limite exclusivo (`created_at < date_to_exclusivo`), diferente do filtro simples de `GET /payments` (`created_at <= date_to`, que na prática exclui parte do próprio dia — comportamento antigo não mexido aqui, só não replicado no endpoint novo).

Período anterior calculado automaticamente como um intervalo de mesma duração imediatamente anterior a `date_from` — sem parâmetro novo, o frontend só manda o período atual.

```python
class PeriodMetrics(BaseModel):
    revenue: float
    ticket_medio: float
    volume: int

class HourlyRevenue(BaseModel):
    hour: int
    revenue: float

class TerminalBreakdown(BaseModel):
    terminal_id: int
    revenue: float
    ticket_medio: float
    volume: int

class PaymentAnalyticsOut(BaseModel):
    current: PeriodMetrics
    previous: PeriodMetrics
    change_pct: dict[str, Optional[float]]  # "revenue" | "ticket_medio" | "volume", None se período anterior tem denominador 0
    hourly: list[HourlyRevenue]   # sempre 24 entradas (0..23), revenue=0 onde não há dado
    by_terminal: list[TerminalBreakdown]  # ordenado por revenue desc
```

Todas as agregações filtram `Transaction.status == "approved"` + `base_filters` (empresa) + janela de tempo. `ticket_medio = revenue / volume` (0 se `volume == 0`). `change_pct[k] = round((current[k] - previous[k]) / previous[k] * 100, 1)`, `None` se `previous[k] == 0`.

Sem migration — `Transaction` já tem todas as colunas necessárias.

### Frontend

- `api/payments.ts`: nova `getPaymentsAnalytics(filters)`, mesmo molde de `listPayments`/`buildPaymentListQuery`
- `DashboardScreen.tsx`: reescrita completa —
  - Seletor de período: chips Hoje/Ontem/Este mês + `DateInput` de/até pra Customizado (mesmo padrão de `PaymentsScreen.tsx`, `toIsoDate`/`toDate`)
  - 3 `.card` (reaproveita estilo existente) com `Tag` de variação (`variant="success"` ▲ / `variant="error"` ▼ / sem tag quando `change_pct[k]` é `null`)
  - `HourlyBarChart` novo componente (`components/HourlyBarChart.tsx`): 24 `div`s com `height` proporcional ao máximo do período, sem lib de gráfico nova
  - Lista "Venda por terminal": junta `by_terminal` (id + números) com `listTerminals(companyId)` (rótulo) já existente — chave pelo `terminal_id`, terminal sem `label` encontrado (raro: terminal removido/desativado) cai num fallback `#{terminal_id}`
- Seletor de empresa pra superadmin/admin mantido igual ao que já existe hoje em `DashboardScreen.tsx`

### Riscos
- Baixo — endpoint novo isolado, sem migration, reaproveita padrão de filtro (`base_filters`) já testado em `list_payments`. Único ponto de atenção é a semântica de `date_to` inclusive, diferente do endpoint de listagem existente — documentado acima pra não confundir os dois no futuro.
- Gráfico de 24 barras sem lib externa é suficiente pro escopo (mesma visual da Goomer: barras simples, sem interação de hover/tooltip complexa) — se o produto pedir mais (zoom, tooltip rico, múltiplas séries) no futuro, aí sim vale avaliar uma lib.

### Estimativa
8 pontos — maior que ORD-098/099/100: endpoint novo com agregação em 3 formatos diferentes (KPI comparativo, série por hora, breakdown por terminal) + componente de gráfico novo do zero, mesmo sem lib externa.

---

## Ready

**Explorer:** [x] fluxo, persona, critérios de aceite e achado técnico (tudo via `Transaction`, sem tocar order-service) documentados · **QA Explorer:** [x] cenários cobrindo comparação de período, denominador zero, receita por hora, venda por terminal e isolamento multi-tenant · **Tech Explorer:** [x] endpoint novo completo (schemas, semântica de período anterior, semântica de `date_to`), solução de frontend sem dependência nova, riscos e estimativa · **Aprovação final:** [x] aprovado no chat pelo usuário (2026-08-20), a partir da coleta de ideias em `docs/analise-dashboard-concorrente-goomer.md`

**Status: Ready** — pode começar a implementação.

---

## Downstream

- **Branch:** `feature/ord-101-analises-kpis`, a partir de `main`.
- **`services/payment/main.py`:** novo `GET /payments/analytics` — schemas `PeriodMetrics`/`HourlyRevenue`/`TerminalBreakdown`/`PaymentAnalyticsOut`; agregações via `func.count`/`func.sum`/`func.hour` sobre `Transaction` filtrado por `status == "approved"`; período anterior calculado automaticamente (mesma duração, imediatamente anterior); `change_pct` retorna `None` quando o denominador do período anterior é 0.
- **Bug pré-existente encontrado e corrigido, não relacionado ao ORD-101:** `Transaction.qr_code`/`qr_code_base64` estavam declarados como `String(4000)`/`String(100000)` no model, mas a migration real (`20260618_1100_add_pix_fields_to_transactions.py`) os cria como `Text`. Isso nunca afeta prod/dev (schema é gerido pelo Alembic, não pelo model), mas quebra `Base.metadata.create_all()` nos testes que rodam contra MySQL real — `VARCHAR(100000)` em utf8mb4 estoura o limite de 16383 caracteres, e **todos** os testes com a fixture `client` do payment-service falhavam na criação da tabela. Corrigido pra `Text` nos dois campos, alinhando o model à migration.
- **`services/payment/tests/test_ord101_analises.py`** (novo): 7 testes — KPIs comparados com período anterior, denominador zero sem percentual, receita por hora, venda por terminal ordenada, isolamento multi-tenant, data inválida (422), sem token (401).
- **Suíte completa do payment-service:** **58 passed** (era 51 antes, +7 do ORD-101), zero falhas — inclusive todos os testes que estavam bloqueados pelo bug do `qr_code_base64` acima.
- **`frontend/admin/src/types.ts`:** `PeriodMetrics`/`HourlyRevenue`/`TerminalBreakdown`/`PaymentAnalytics`.
- **`frontend/admin/src/api/payments.ts`:** `getPaymentsAnalytics(filters)`, mesmo molde de `listPayments`.
- **`frontend/admin/src/components/HourlyBarChart.tsx`/`.module.scss`** (novo): 24 barras em CSS puro, sem lib de gráfico nova.
- **`frontend/admin/src/screens/DashboardScreen.tsx`/`.module.scss`:** reescrita completa — chips Hoje/Ontem/Este mês/Customizado (`DateInput` De/Até reaproveitando os conversores de `PaymentsScreen.tsx`), 3 KPIs com `Tag` de variação (`TrendTag`, omitida quando `change_pct` é `null`), `HourlyBarChart`, lista "Venda por terminal" cruzando `by_terminal` com `listTerminals(companyId)` (rótulo, fallback `#{id}` se não encontrado). Seletor de empresa pra superadmin/admin mantido igual ao que já existia.
- `tsc --noEmit`: limpo. `vitest run`: **48 passed**, sem regressão.
- **Verificado ao vivo no Chrome** (Burger House, filtro "Este mês"): Receita R$ 155,80 / Ticket médio R$ 25,97 / Volume 6, gráfico com picos corretos às 13h e 23h, "Venda por terminal" mostrando "Totem 1 - Entrada" com os valores certos. Campo "Customizado" abre De/Até corretamente. Sem erros no console.
- PR aberta para `main`.

### Ajuste visual pós-verificação (pedido do usuário)

Faltava eixo Y com indicador de valores no gráfico, e polimento geral — perguntado se o design system tinha algo pra deixar gráfico/lista mais bonitos. Não tem componente de gráfico no design system, mas os ícones dele (`icon-trending-up/down`, `icon-monitor`, `icon-bar-chart`) davam pra reaproveitar.

- **`HourlyBarChart.tsx`/`.module.scss`:** eixo Y com valores compactos (`R$137`/`R$102`/...), linhas de grade pontilhadas, e a borda esquerda do gráfico virou o "eixo vertical" pedido. **Bug real encontrado e corrigido nesse meio-tempo:** o rótulo da hora (`0Xh`) dividia a mesma altura fixa de 200px da barra — com a barra mais alta do período, barra+rótulo juntos estouravam o container e um scrollbar vertical indesejado aparecia no gráfico inteiro. Corrigido reestruturando `.chart` como CSS Grid de 2 linhas (`200px auto` — barras numa linha de altura fixa, rótulos numa linha de altura livre logo abaixo, `grid-auto-flow: column` intercalando cada par bar+rótulo), então o rótulo nunca mais disputa espaço com a barra. Linhas de grade reposicionadas de `%` pra `px` fixo (200px), já que o container passou a incluir a linha de rótulos na altura total.
- **`DashboardScreen.tsx`/`.module.scss`:** `TrendTag` trocou "▲"/"▼" por `icon-trending-up`/`icon-trending-down`; títulos de seção ("Receita por hora", "Venda por terminal") ganharam ícone (`icon-bar-chart`/`icon-monitor`); linha de "Venda por terminal" ganhou badge circular com `icon-monitor` à esquerda e os valores (receita + ticket médio) reorganizados numa coluna à direita, mais parecido com um card de lista real.
- `tsc --noEmit` limpo, `vitest run`: 48 passed. Container `admin` reconstruído duas vezes (uma com o bug do scrollbar, outra já corrigida) e verificado ao vivo no Chrome nas duas rodadas.

### Segundo ajuste visual pós-verificação (pedido do usuário)

- **`HourlyBarChart.tsx`/`.module.scss`:** altura da faixa de barras de 200px pra 236px (`BARS_HEIGHT_PX`, +36px); `column-gap` das barras de 4px pra 10px (mais respiro entre colunas, baseado no espaçamento do dashboard concorrente).
- **`DashboardScreen.tsx`/`.module.scss`:** `TrendTag` deixou de usar o `Tag` do design system (compacto demais pra essa informação) e virou um `<span>` próprio (`.trendBadge`) — ícone e percentual com `gap:6px` (antes coladas) e fonte `sm-emphasys` (antes `xs`, texto pequeno demais). `.cardLabel` (títulos "Receita"/"Ticket médio"/"Volume") mudou de `xs` + opacidade 0.5 pra `sm-emphasys` + opacidade 0.7, mais evidente. `.grid` (cards) de `minmax(200px, 1fr)` pra `minmax(260px, 1fr)` — "período anterior" quebrava linha em 200px. Ícone `icon-monitor` removido de cada linha de "Venda por terminal" — fica só no título da seção, como pedido.
- `tsc --noEmit` limpo, `vitest run`: 48 passed. Container `admin` reconstruído e verificado ao vivo no Chrome mais uma vez.
