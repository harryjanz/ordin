---
id: ORD-103
status: Done
fase: 6
sprint: null
responsavel: Backend + Frontend
estimativa: 8 pontos
---

# ORD-103 — Análises: navegação de período (dia/mês) e comparação visual com período anterior

## Descrição
Pedido direto do usuário (2026-08-21), a partir do uso real da tela de Análises (ORD-101/ORD-102):

1. Quando o período selecionado é **um dia** (presets "Hoje"/"Ontem") ou **um mês** ("Este mês"), adicionar navegação **‹ ›** pra avançar/voltar um dia ou um mês por vez, sem precisar reabrir o seletor. **"Customizado" não ganha navegação** — intervalo arbitrário não tem uma unidade natural de "próximo/anterior".
2. Uma opção (toggle) pra mostrar, no gráfico "Receita por período", as barras do **período anterior** ao lado das do período atual, em cor diferente — só disponível quando o modo é dia/mês (mesma condição da navegação).

Estilo visual da comparação definido com o usuário: **par de barras lado a lado** por posição do eixo (atual + anterior), não sobreposição — mais fácil de comparar valor exato de cada uma.

## Persona
Mesma dos ORD-101/102: **Owner/manager**, com superadmin/admin acessando via seletor de empresa.

## Explorer

### Achado técnico — período anterior já é calculado no backend, só falta devolver a série dele
`GET /payments/analytics` já calcula `prev_start`/`prev_end` (mesma duração, imediatamente anterior a `date_from`) pra gerar os KPIs comparativos (`previous`, `change_pct`) desde a ORD-101. A comparação visual só precisa de mais uma passada de `_build_series()` (função introduzida na ORD-102) sobre as linhas brutas da janela anterior — sem mudar a definição de "período anterior" já usada pelos KPIs.

### Navegação de período — mudança de modelo no frontend
Hoje o estado é um preset único (`"today" | "yesterday" | "month" | "custom"`), recalculado do zero a cada clique. Pra navegar (voltar 1 dia a partir de "Ontem", por exemplo) é preciso um estado que sobreviva à navegação — um "modo" (`day` | `month` | `custom`) mais uma data-âncora:
- **Modo dia:** `date_from = date_to = âncora`. "Hoje" e "Ontem" viram atalhos que setam a âncora (hoje / ontem); `‹`/`›` decrementam/incrementam a âncora em 1 dia.
- **Modo mês:** `date_from` = dia 1 do mês da âncora; `date_to` = último dia do mês, **exceto quando é o mês atual, aí é `hoje`** (não dá pra mostrar dias futuros — mesmo comportamento que "Este mês" já tem hoje). "Este mês" seta a âncora pra hoje; `‹`/`›` somam/subtraem 1 mês.
- **Modo customizado:** inalterado (`customFrom`/`customTo` via `DateInput`).

`›` fica desabilitado quando a âncora já está no dia de hoje (modo dia) ou no mês atual (modo mês) — não navega pro futuro, não tem dado.

### Fluxo principal
1. Owner seleciona "Ontem" → aparece uma barra de navegação abaixo dos chips de preset: `‹  20/08/2026  ›`.
2. Clica `‹` → âncora vira 19/08/2026, tela recarrega com esse dia. O chip "Ontem" perde o destaque (não é mais literalmente ontem).
3. Clica `›` repetidamente até chegar em hoje → `›` fica desabilitado.
4. Mesmo comportamento pra "Este mês": `‹` volta pro mês cheio anterior (dia 1 ao último dia), `›` avança até o mês atual (aí trava).
5. Na seção do gráfico, ao lado dos chips de granularidade, aparece um botão "Comparar com período anterior" (só quando o modo é dia/mês). Ativado, cada posição do eixo passa a ter 2 barras: atual (cor da marca) + anterior (cor secundária), com uma legenda indicando qual é qual.

### Fluxos alternativos / exceções
- Modo customizado: sem barra de navegação, sem botão de comparação — igual está hoje, só os 2 `DateInput`.
- Comparação ativada num bucket sem dado nem no período atual nem no anterior → barra de altura mínima nos dois, sem erro.
- Contagem de buckets do período atual e do anterior pode divergir em casos de borda (ex: mês de 31 dias vs mês anterior de 30, na granularidade "semana"/"mês") — a série do período anterior é alinhada por **posição**, não por data; posições sem par no anterior mostram `previous_revenue = 0`.

### Critérios de aceite
- [ ] Navegação `‹ ›` aparece quando o modo é dia ou mês; não aparece em customizado
- [ ] `‹` sempre habilitado; `›` desabilitado quando a âncora já é hoje (dia) ou o mês atual (mês)
- [ ] Navegar em modo dia desmarca visualmente "Hoje"/"Ontem" quando a âncora não bate mais com nenhum dos dois
- [ ] Modo mês mostra o mês cheio (dia 1 ao último dia) pra meses passados, e dia 1 até hoje pro mês atual
- [ ] Botão "Comparar com período anterior" só aparece em modo dia/mês
- [ ] Com a comparação ativada, cada posição do eixo mostra 2 barras (atual + anterior) em cores diferentes, com legenda
- [ ] KPIs (Receita/Ticket médio/Volume) e demais seções (venda por terminal, forma de pagamento) continuam refletindo o período navegado, sem mudança de comportamento

---

## QA Explorer

```gherkin
Feature: Navegação de período e comparação visual com período anterior

  Scenario: Navegar um dia pra trás
    Dado o owner está no preset "Hoje"
    Quando clica em "‹"
    Então o período exibido passa a ser o dia anterior a hoje
    E o chip "Hoje" não aparece mais destacado

  Scenario: Não navegar pro futuro
    Dado o owner está no preset "Hoje"
    Então o botão "›" está desabilitado

  Scenario: Navegar um mês pra trás mostra o mês cheio
    Dado o owner está no preset "Este mês" (dia 21 de agosto)
    Quando clica em "‹"
    Então o período exibido passa a ser 01/07 a 31/07 (mês inteiro)

  Scenario: Navegação não aparece em customizado
    Dado o owner seleciona "Customizado"
    Então não aparece nenhum controle de "‹ ›"

  Scenario: Comparação visual não disponível em customizado
    Dado o owner seleciona "Customizado"
    Então o botão "Comparar com período anterior" não aparece

  Scenario: Comparação visual ativada
    Dado transações aprovadas no período atual e no período anterior
    Quando o owner ativa "Comparar com período anterior"
    Então cada posição do eixo do gráfico mostra 2 barras: atual e anterior

  Scenario: Isolamento multi-tenant na série do período anterior
    Dado transações aprovadas de outra empresa no período anterior
    Quando o owner vê a série do período anterior
    Então nenhum valor de outra empresa aparece nela
```

---

## Tech Explorer

### Serviços impactados
- `services/payment/` — `main.py`: `RevenuePoint` ganha `previous_revenue`; endpoint passa a rodar mais uma busca bruta (janela anterior) e reaproveita `_build_series()` pra ela
- `frontend/admin/` — `DashboardScreen.tsx`/`.module.scss` (modelo de estado de período reescrito), `RevenueBarChart.tsx`/`.module.scss` (par de barras + legenda), `types.ts`, `api/payments.ts` (sem mudança de assinatura — `granularity` já existe)

### Backend — `GET /payments/analytics`

```python
class RevenuePoint(BaseModel):
    label: str
    revenue: float
    previous_revenue: float   # NOVO — mesma posição/granularidade, janela anterior
```

No endpoint, depois de calcular `series` (como já é feito hoje), busca as linhas brutas da janela anterior (`prev_start`/`prev_end`, já calculados pra `period_metrics`) e roda `_build_series()` de novo sobre elas — o resultado tem seus próprios labels (datas da janela anterior, irrelevantes aqui), só o `revenue` de cada posição interessa:

```python
prev_rows = (await db.execute(
    select(Transaction.created_at, Transaction.amount)
    .where(*base_filters, Transaction.status == TransactionStatus.approved,
           Transaction.created_at >= prev_start, Transaction.created_at < prev_end)
)).all()
prev_series = _build_series(prev_rows, prev_start, prev_end, granularity)

for i, point in enumerate(series):
    point["previous_revenue"] = prev_series[i]["revenue"] if i < len(prev_series) else 0.0
```

Sem migration, sem mudança na definição de "período anterior" (mesma usada pelos KPIs desde a ORD-101).

### Frontend — modelo de estado de período

```ts
type Mode = "day" | "month" | "custom";
const [mode, setMode] = useState<Mode>("day");
const [anchor, setAnchor] = useState<Date>(new Date());   // dia ou qualquer dia dentro do mês selecionado
const [customFrom, setCustomFrom] = useState("");
const [customTo, setCustomTo] = useState("");
```

`range` computado a partir de `mode`+`anchor` (dia: `from=to=anchor`; mês: `from=dia 1`, `to=min(último dia, hoje)`; customizado: como hoje). Botões "Hoje"/"Ontem"/"Este mês" setam `mode`+`anchor`; "Customizado" seta só `mode`. Chips de preset destacados via comparação derivada (`mode==="day" && isoDate(anchor)===isoDate(hoje)` etc.), não mais um valor de estado único — permite o destaque sumir quando a navegação afasta a âncora do valor exato do preset.

Novos helpers: `addMonths(date, n)`, `startOfMonth(date)`, `endOfMonth(date)`, `sameMonth(a, b)`.

Barra de navegação (`<button type="button">` nativo com `icon-chevron-left`/`icon-chevron-right` — **não** o `Button` do design system, que só aceita `children: string`, ver gotcha documentado na ORD-102): renderizada só quando `mode !== "custom"`, entre o `headerRow` e o bloco de `customRange`.

### Frontend — `RevenueBarChart`

```ts
export interface RevenueBarChartProps {
  data: RevenuePoint[];
  showPrevious?: boolean;
}
```

`max` passa a considerar `previous_revenue` também quando `showPrevious`. `.barCell` ganha um segundo elemento (`.barPrevious`) desenhado só quando `showPrevious`, lado a lado do atual via `display:flex; gap:2px` dentro da célula — larguras iguais dividindo o espaço da coluna. Legenda (2 itens: "Atual"/"Período anterior", quadradinho colorido + texto) só aparece quando `showPrevious` está ativo.

Botão de toggle "Comparar com período anterior": mesmo padrão dos chips de granularidade (`<button>`/estilo próprio, `variant`-like toggle de cor), ao lado dos chips na `.chartHeader`, só quando `mode !== "custom"`.

### Riscos
- Baixo — mudança de schema aditiva no backend (campo novo em `RevenuePoint`, único consumidor atualizado junto). O reescrever do estado de período no frontend é o ponto de maior atenção: `defaultGranularity()`/o efeito que reseta `manualGranularity` (ORD-102) continuam funcionando do mesmo jeito, já que dependem só de `range.from`/`range.to` (strings), que continuam sendo calculados normalmente a partir do novo `mode`+`anchor`.
- Divergência de contagem de buckets entre período atual/anterior (granularidade semana/mês em meses de tamanho diferente) é tratada por alinhamento posicional com zero-fill — documentado, não é bug.

### Estimativa
8 pontos — reescrita do modelo de estado de período (maior risco de regressão silenciosa nas seções existentes que dependem de `range`), navegação nova, endpoint aditivo, e gráfico com par de barras + legenda.

---

## Ready

**Explorer:** [x] fluxo, persona, critérios de aceite e achado técnico (período anterior já calculado, só falta a série) documentados · **QA Explorer:** [x] cenários cobrindo navegação dia/mês, limite de futuro, ausência em customizado, comparação visual e isolamento multi-tenant · **Tech Explorer:** [x] mudança de schema (aditiva), redesenho do estado de período no frontend, alinhamento posicional de buckets, riscos e estimativa · **Aprovação final:** [x] aprovado no chat pelo usuário (2026-08-21) — estilo visual da comparação (par de barras lado a lado) confirmado explicitamente antes de abrir a história

**Status: Ready** — pode começar a implementação.

---

## Downstream

- **Branch:** `feature/ord-103-navegacao-periodo-comparacao-visual`, a partir de `main`.
- **`services/payment/main.py`:** `RevenuePoint` ganhou `previous_revenue`; endpoint passou a buscar também as linhas brutas da janela anterior (`prev_start`/`prev_end`, já calculados desde a ORD-101) e reaproveita `_build_series()` (ORD-102) sobre elas — resultado alinhado por posição/índice com a série atual (não por data, já que as janelas cobrem calendários diferentes).
- **`services/payment/tests/test_ord101_analises.py`:** 2 testes novos — `test_series_com_previous_revenue` (soma de `previous_revenue` bate com `previous.revenue` dos KPIs) e `test_isolamento_multi_tenant_na_serie_anterior`. **63 testes** no arquivo/suíte (era 61), todos passando.
- **`frontend/admin/src/types.ts`:** `RevenuePoint.previous_revenue`.
- **`frontend/admin/src/screens/DashboardScreen.tsx`:** modelo de estado de período reescrito — `preset` (string única) virou `mode` (`"day"|"month"|"custom"`) + `anchor` (Date). Helpers novos: `addMonths`, `startOfMonth`, `endOfMonth`, `sameMonth`, `minDate`. `applyPreset()` seta `mode`+`anchor` a partir do clique nos chips Hoje/Ontem/Este mês/Customizado; o destaque de cada chip agora é **derivado** (comparação de `mode`+`anchor` com hoje/ontem/mês atual), não um valor de estado único — some sozinho quando a navegação afasta a âncora do valor exato do preset. Barra de navegação `‹ [label] ›` (botão nativo, não o `Button` do design system) renderizada quando `mode !== "custom"`; `›` desabilitado no dia de hoje (modo dia) ou no mês atual (modo mês). Modo mês mostra o mês cheio pra meses passados e só até hoje pro mês atual. Botão "Comparar com período anterior" (`icon-layers`) ao lado dos chips de granularidade, mesma condição de visibilidade da navegação.
- **`frontend/admin/src/screens/DashboardScreen.module.scss`:** `.navRow`/`.navButton`/`.navLabel` (navegação), `.chartControls`/`.compareToggle`/`.compareToggleActive` (toggle de comparação).
- **`frontend/admin/src/components/RevenueBarChart.tsx`/`.module.scss`:** prop `showPrevious` — cada `.barCell` ganha uma segunda barra (`.barPrevious`, cor neutra `rgba(text, 0.25)`) lado a lado da atual via `flex`; `.chartCompare` alarga as colunas do grid (`minmax(32px, 1fr)`) pra caber o par; legenda (`Atual`/`Período anterior`) abaixo do gráfico, só quando `showPrevious` está ativo. Estrutura interna reorganizada: `.wrap` (coluna) agora contém `.chartArea` (o antigo conteúdo, eixo Y + gráfico) + `.legend`.
- **Bug corrigido durante a implementação (não chegou a subir):** `const granularity` estava declarada *depois* do `useEffect` que já a usava na lista de dependências — erro de temporal dead zone em tempo de execução. Corrigido movendo a declaração pra antes dos dois `useEffect`s que dependem dela.
- `tsc --noEmit`: limpo. `pytest` (payment-service): **63 passed** (era 61). `vitest run`: **48 passed**, sem regressão.
- **Lint-delta (ruff, worktree de `main` vs branch):** `main.py` com **zero diferença**. Único item novo no arquivo de teste é `DTZ001` (+2, datetime naive) — mesma convenção já aceita desde a ORD-101/102.
- **Verificado ao vivo no Chrome** (Burger House, dados reais de julho/agosto de 2026): navegação `‹` a partir de "Hoje" (21/08) levou a 20/08 — chip "Ontem" acendeu sozinho, como esperado (20/08 é literalmente ontem); ativei "Comparar com período anterior" e o gráfico passou a mostrar pares de barra (atual roxo, anterior cinza) com legenda; troquei pra "Este mês" e voltei um mês com `‹` — mostrou "Julho/2026" com o mês cheio (31 barras, 01/07 a 31/07); `›` a partir do mês atual confirmado visualmente desabilitado (opacidade reduzida); modo "Customizado" confirmado sem barra de navegação e sem o botão de comparação. Sem erros no console.
- PR ainda não aberta — implementação completa, aguardando decisão do usuário sobre commit/PR/merge.
