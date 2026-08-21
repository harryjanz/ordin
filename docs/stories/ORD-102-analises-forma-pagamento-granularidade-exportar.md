---
id: ORD-102
status: Done
fase: 6
sprint: null
responsavel: Backend + Frontend
estimativa: 8 pontos
---

# ORD-102 — Análises: receita por forma de pagamento, granularidade do gráfico e exportação CSV

## Descrição
Segue direto de `docs/analise-dashboard-concorrentes-mercado.md` — coleta de ideias comparando o dashboard "Análises" (ORD-101) com 8 concorrentes de mercado (Suitable, Goomer, Cplug, Nola, Consumer, Zig, Gototem, PagTotem). As 3 ideias de maior valor e menor esforço, todas usando dado que já existe em `Transaction`:

1. **Receita por forma de pagamento** (inspirado no PagVendas/PagBank) — hoje `Transaction.method` (crédito/débito/PIX/voucher) é gravado em toda transação mas nunca aparece no dashboard. É a métrica mais alinhada com o diferencial de produto do Ordin: reforça que o dono não fica preso a um único jeito de receber.
2. **Granularidade de tempo ajustável no gráfico** (hora/dia/semana/mês, inspirado no Goomer) — hoje o gráfico de receita só agrupa por hora do dia, o que fica ilegível pra período "Este mês" (28-31 dias de barras por hora não fazem sentido agregados).
3. **Exportar o período analisado em CSV** (recorrente em Goomer, Cplug e Zig) — reaproveita exatamente o dado que já está na tela, sem necessidade de endpoint novo.

**Fora de escopo, confirmado no documento de análise:** performance por operador, CRM/cliente recorrente, DRE/fluxo de caixa, BI de montagem livre, alertas automáticos/WhatsApp, funil de sessão/abandono de carrinho — nenhum desses conceitos existe ou tem dado disponível no Ordin hoje.

## Persona
Mesma da ORD-101: **Owner/manager** (dono da loja), com superadmin/admin acessando via seletor de empresa.

## Explorer

### Achado técnico — tudo ainda cabe em `Transaction`, sem migration
`Transaction.method` já existe e é gravado em toda transação (`services/payment/main.py`, endpoint `POST /payments`). A granularidade de tempo é só uma troca de função de agrupamento sobre `Transaction.created_at`, já usado hoje via `func.hour()`. Nenhuma das 3 ideias precisa de coluna nova, join cross-service ou migration.

**Simplificação de implementação identificada:** o endpoint atual (`GET /payments/analytics`) roda 2 queries de agregação separadas (uma pra hora, outra pra terminal). Pra adicionar "por forma de pagamento" sem uma terceira query redundante, as 3 quebras (série temporal, por terminal, por forma de pagamento) passam a ser calculadas em Python a partir de **uma única busca bruta** das transações aprovadas do período (`created_at, amount, terminal_id, method`) — menos round-trip de banco que a versão anterior, e portável (não depende mais de `func.hour()`, específico de MySQL).

### Fluxo principal
1. Owner já está na tela `/dashboard` (ORD-101), com período selecionado.
2. Abaixo do título "Receita por hora" (que passa a se chamar apenas "Receita por período", já que a granularidade não é mais fixa em hora), aparecem chips de granularidade: **Hora / Dia / Semana / Mês**. Um valor padrão é pré-selecionado conforme o tamanho do período (≤1 dia → Hora, ≤31 dias → Dia, ≤180 dias → Semana, maior → Mês), mas o owner pode trocar livremente.
3. O gráfico de barras recalcula os "baldes" (buckets) e os rótulos do eixo conforme a granularidade escolhida (`00h`/`23h`, `05/08`, `semana de 04/08`, `08/2026`).
4. Nova seção "Receita por forma de pagamento", mesmo layout de lista de "Venda por terminal": rótulo amigável (Crédito/Débito/PIX/Voucher) + receita + ticket médio, ordenada por receita decrescente.
5. Botão "Exportar CSV" no cabeçalho da tela — gera um arquivo com KPIs, série temporal, venda por terminal e por forma de pagamento do período atualmente exibido, e dispara o download no navegador. Sem chamada de rede nova — usa o dado já carregado na tela.

### Fluxos alternativos / exceções
- Período sem nenhuma transação aprovada → seção "Receita por forma de pagamento" some com empty state, mesmo padrão da lista de terminal.
- Granularidade "Semana"/"Mês" com período contendo só uma semana/mês → gráfico mostra 1 barra só, sem erro.
- Exportar CSV com tela em estado vazio (sem transação) → gera CSV só com o cabeçalho/KPIs zerados, não trava nem gera arquivo corrompido.

### Critérios de aceite
- [ ] Seção "Receita por forma de pagamento" (rótulo + receita + ticket médio), ordenada por receita, mesmo padrão visual de "Venda por terminal"
- [ ] Chips de granularidade Hora/Dia/Semana/Mês, com padrão pré-selecionado pelo tamanho do período e troca livre pelo owner
- [ ] Gráfico de receita recalcula buckets e rótulos conforme granularidade escolhida, sempre zero-preenchido (sem buraco no eixo)
- [ ] Botão "Exportar CSV" gera arquivo com KPIs + série temporal + venda por terminal + por forma de pagamento do período exibido, sem chamada de API nova
- [ ] Nenhum dos itens fora de escopo (operador, CRM, DRE, alertas, funil) aparece na tela

---

## QA Explorer

```gherkin
Feature: Análises — forma de pagamento, granularidade e exportação

  Scenario: Receita por forma de pagamento
    Dado transações aprovadas em crédito, débito e PIX no período
    Quando o owner vê a seção "Receita por forma de pagamento"
    Então cada forma aparece com sua receita e ticket médio, maior receita primeiro

  Scenario: Granularidade diária zero-preenchida
    Dado transações aprovadas só em 2 dos 7 dias de um período customizado
    Quando o owner seleciona granularidade "Dia"
    Então o gráfico mostra os 7 dias, com receita 0 nos 5 dias sem transação

  Scenario: Granularidade semanal
    Dado transações aprovadas espalhadas em 3 semanas diferentes
    Quando o owner seleciona granularidade "Semana"
    Então cada barra soma a receita daquela semana, na ordem cronológica

  Scenario: Granularidade mensal
    Dado transações aprovadas em 2 meses diferentes
    Quando o owner seleciona granularidade "Mês"
    Então cada barra soma a receita daquele mês, na ordem cronológica

  Scenario: Padrão de granularidade conforme período
    Dado o owner seleciona o preset "Este mês" (mais de 1 dia)
    Quando a tela carrega
    Então a granularidade pré-selecionada não é "Hora" (passa a ser "Dia", já que o período tem mais de 1 dia)

  Scenario: Isolamento multi-tenant na quebra por forma de pagamento
    Dado transações aprovadas de outra empresa
    Quando o owner vê a seção "Receita por forma de pagamento"
    Então nenhum valor de outra empresa entra na quebra

  Scenario: Exportar CSV
    Dado a tela carregada com KPIs, série temporal, terminal e forma de pagamento
    Quando o owner clica em "Exportar CSV"
    Então um arquivo é baixado contendo as 4 seções de dado exibidas na tela, sem chamada de API adicional
```

---

## Tech Explorer

### Serviços impactados
- `services/payment/` — `main.py`: schema e lógica do `GET /payments/analytics` evoluem (troca `hourly`/`func.hour` por `series`/`granularity` genérico + novo `by_method`)
- `frontend/admin/` — `types.ts`, `api/payments.ts`, `DashboardScreen.tsx`/`.module.scss`, componente `HourlyBarChart` renomeado para `RevenueBarChart` (genérico, não mais fixo em hora), novo util `exportAnalyticsCsv`

### Mudança no endpoint `GET /payments/analytics`

**Breaking change controlado** (mesmo espírito de outras evoluções do projeto — sem shim de compatibilidade, só um único consumidor: `DashboardScreen.tsx`, atualizado na mesma história):
- Query param novo: `granularity: Literal["hour", "day", "week", "month"] = "hour"`
- Campo de resposta `hourly: list[HourlyRevenue]` → `series: list[RevenuePoint]`, onde `RevenuePoint = {label: str, revenue: float}` (rótulo já formatado no backend: `"00h"`..`"23h"` pra hora, `"DD/MM"` pra dia/semana, `"MM/AAAA"` pra mês — evita duplicar regra de formatação no frontend)
- Campo novo: `by_method: list[MethodBreakdown]`, `MethodBreakdown = {method: str, revenue: float, ticket_medio: float, volume: int}`, ordenado por receita decrescente (rótulo amigável — Crédito/Débito/PIX/Voucher — é resolvido no frontend, mesmo padrão do terminal que resolve o `label` a partir do id)

**Implementação:** as 3 quebras (série temporal, por terminal, por forma de pagamento) do período **atual** passam a vir de uma única query bruta (`select(Transaction.created_at, Transaction.amount, Transaction.terminal_id, Transaction.method)` com os mesmos filtros de hoje), agregada em Python — substitui as 2 queries de `GROUP BY` separadas que existiam (hora e terminal). `period_metrics()` (KPIs atual/anterior, com `count`/`sum` via SQL) não muda.

Bucketing pra série temporal (zero-preenchido, mesmo princípio de hoje que sempre devolve 24 horas):
- `hour`: 24 baldes fixos, chave = hora do dia
- `day`: 1 balde por dia corrido entre `date_from` e `date_to`
- `week`: 1 balde por semana (início na segunda-feira) que a janela toca
- `month`: 1 balde por mês corrido entre `date_from` e `date_to`

### Frontend
- `types.ts`: `RevenuePoint`, `MethodBreakdown` substituindo/complementando `HourlyRevenue`; `PaymentAnalytics.series`/`.by_method` no lugar de `.hourly`
- `api/payments.ts`: `getPaymentsAnalytics` ganha `granularity` no filtro
- `components/HourlyBarChart.tsx` → renomeado `RevenueBarChart.tsx` (mesmo `.module.scss` reaproveitado): recebe `data: RevenuePoint[]` genérico, sem mais lógica de hora fixa (o label já vem pronto do backend)
- `DashboardScreen.tsx`:
  - chips de granularidade (mesmo padrão visual dos chips de preset já existentes), com `defaultGranularity(from, to)` recalculado a cada troca de período, mas sobrescrevível pelo owner
  - nova seção "Receita por forma de pagamento" — mesmo componente de lista de "Venda por terminal", com `METHOD_LABELS: Record<string,string>` estático (`credit→"Crédito"`, `debit→"Débito"`, `pix→"PIX"`, `voucher→"Voucher"`, fallback pro valor bruto se vier algo não mapeado)
  - botão "Exportar CSV" chama um util novo `exportAnalyticsCsv(analytics, meta)` (`utils/` ou dentro do próprio screen) que monta uma string CSV com as 4 seções e dispara download via `Blob` + `<a download>` — **sem chamada de API nova**, só serializa o `analytics` já carregado no estado

### Riscos
- Baixo — mesma superfície de risco da ORD-101 (endpoint aditivo/evolutivo, sem migration). O ponto de atenção é o bucketing de semana/mês em Python: usar sempre `date` (não `datetime`) como chave evita duplicar balde por causa de hora/minuto/segundo residual.
- A troca de `hourly` pra `series` quebra o único consumidor existente (`DashboardScreen.tsx`), mas como é atualizado na mesma história/PR, não há período de inconsistência em produção.

### Estimativa
8 pontos — evolução de schema existente + 2 features novas (granularidade, por forma de pagamento) + exportação client-side, mais o ajuste de todos os 7 testes existentes do endpoint que hoje testam o campo `hourly`.

---

## Ready

**Explorer:** [x] fluxo, persona, critérios de aceite e achado técnico (dado já existe em `Transaction`, sem migration) documentados · **QA Explorer:** [x] cenários cobrindo forma de pagamento, granularidade dia/semana/mês zero-preenchida, padrão por tamanho de período, isolamento multi-tenant e exportação · **Tech Explorer:** [x] mudança de schema do endpoint detalhada (breaking change controlado, único consumidor atualizado junto), bucketing por granularidade, simplificação de query única, riscos e estimativa · **Aprovação final:** [x] aprovado no chat pelo usuário (2026-08-21), a partir da coleta de ideias em `docs/analise-dashboard-concorrentes-mercado.md`

**Status: Ready** — pode começar a implementação.

---

## Downstream

- **Branch:** `feature/ord-102-analises-forma-pagamento-granularidade`, a partir de `main`.
- **`services/payment/main.py`:** schema evoluído (`RevenuePoint`, `MethodBreakdown`, `granularity`/`series`/`by_method` no `PaymentAnalyticsOut`, campo `hourly` removido). Novo `_build_series()` (bucketing hora/dia/semana/mês, zero-preenchido). Endpoint passou a rodar **uma única query bruta** do período atual (`created_at, amount, terminal_id, method`) e agrega série/terminal/forma de pagamento em Python — substitui as 2 queries `GROUP BY` (`func.hour` + terminal) que existiam antes, portável (não depende mais de função específica de MySQL). `period_metrics()` (KPIs atual/anterior) não mudou.
- **Bug pré-existente não relacionado, corrigido de passagem:** nenhum — dessa vez não apareceu nenhum.
- **`services/payment/tests/test_ord101_analises.py`:** os 7 testes existentes atualizados pro novo schema (`hourly`→`series`); 3 testes novos (`test_granularidade_dia_zero_preenchida`, `test_granularidade_mes`, `test_receita_por_forma_de_pagamento`); `test_isolamento_multi_tenant` ganhou uma asserção extra cobrindo `by_method`. **10 testes** no arquivo (era 7), todos passando.
- **Suíte completa do payment-service:** **61 passed** (era 58 antes da ORD-102), zero falhas.
- **`frontend/admin/src/types.ts`:** `AnalyticsGranularity`, `RevenuePoint`, `MethodBreakdown`; `PaymentAnalytics.series`/`.granularity`/`.by_method` no lugar de `.hourly`.
- **`frontend/admin/src/api/payments.ts`:** `getPaymentsAnalytics` ganhou `granularity` obrigatório no filtro.
- **`frontend/admin/src/components/HourlyBarChart.{tsx,module.scss}` → renomeado `RevenueBarChart.{tsx,module.scss}`:** componente genérico, recebe `RevenuePoint[]` com `label` já formatado pelo backend (sem lógica de hora fixa).
- **`frontend/admin/src/screens/DashboardScreen.tsx`/`.module.scss`:** chips de granularidade (Hora/Dia/Semana/Mês) com padrão calculado por `defaultGranularity()` (≤1 dia→hora, ≤31→dia, ≤180→semana, senão→mês) e reset automático da escolha manual a cada troca de período (`manualGranularity` state + `useEffect` — evita efeito encadeado de duplo fetch); nova seção "Receita por forma de pagamento" (mesmo componente de lista de "Venda por terminal", `METHOD_LABELS` estático); botão "Exportar CSV" (`exportAnalyticsCsv()`, 100% client-side, sem chamada de API nova); título da seção do gráfico virou "Receita por período".
- **Achado ao vivo (gotcha de design system), documentado em memória:** `Button` do design system é tipado com `children: string` — não aceita ícone (`<i>`) dentro, diferente do `className` (que falha silenciosamente). `tsc --noEmit` acusa na hora. Botão "Exportar CSV" ficou só com texto.
- `tsc --noEmit`: limpo. `vitest run`: **48 passed**, sem regressão.
- **Lint-delta (ruff, worktree de `main` vs branch):** `main.py` com **zero diferença** de contagem por categoria. Único item novo no arquivo de teste é `DTZ001` (+4, datetime naive) — mesma convenção de datetime naive já presente e aceita no arquivo original (6 ocorrências em `main`) e documentada desde a ORD-101 (`DTZ007`). Nenhuma categoria genuinamente nova.
- **Verificado ao vivo no Chrome** (Burger House, dados reais do seed de agosto/2026, 392 transações aprovadas no mês): "Este mês" → granularidade padrão "Dia" (21 barras, soma batendo com a Receita do KPI); troquei manualmente pra "Semana" (4 baldes, primeiro começando 27/07 — segunda-feira da semana que contém 01/08) e "Mês" (1 balde, "08/2026", igual à Receita total) — todos batendo exatamente com uma chamada direta à API feita em paralelo pra conferência. "Receita por forma de pagamento" mostrando Débito > PIX > Crédito, ordenado por receita, valores conferidos. Botão "Exportar CSV" baixou um arquivo real com as 4 seções corretas (conferido o conteúdo do arquivo baixado). Sem erros no console.
- PR ainda não aberta — implementação completa, aguardando decisão do usuário sobre commit/PR/merge.

### Ajuste visual pós-verificação (pedido do usuário)

Feedback explícito sobre UX: "Venda por terminal" e "Receita por forma de pagamento" — mesma estrutura de lista (rótulo + receita + ticket médio) — estavam empilhadas verticalmente quando cabiam lado a lado, desperdiçando a largura disponível da tela.

- **`DashboardScreen.tsx`:** as duas seções envolvidas num `.twoColumnSection` com 2 `.column` (título + lista cada uma), em vez de duas seções soltas em sequência.
- **`DashboardScreen.module.scss`:** `.twoColumnSection` (`grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))`, mesmo padrão já usado no `.grid` dos KPIs), `.column` (`min-width: 0` — evita overflow de grid item; `.terminalList` sem `margin-bottom` extra dentro da coluna, já coberto pelo `gap` do grid).
- `tsc --noEmit`: limpo. Verificação ao vivo no Chrome não feita nesta rodada (usuário optou por seguir só com o type-check por enquanto).
