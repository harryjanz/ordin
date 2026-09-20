---
id: ORD-193
status: Ready
estimativa: 2 pontos
fase: null
sprint: null
responsavel: null
---

# ORD-193 — Migrar gráfico de receita do Dashboard pra Recharts

## Descrição
O gráfico "Receita por período" do Dashboard (`DashboardScreen.tsx`, componente `RevenueBarChart.tsx`) é
desenhado à mão em CSS Grid, sem nenhuma biblioteca de gráfico — decisão original documentada no
próprio componente ("Barras simples em CSS Grid, sem lib de gráfico"). Trocar essa implementação por
uma equivalente em Recharts, biblioteca já adotada no admin pela ORD-191 (gráfico de nível de estoque).
Um spike comparando as duas versões lado a lado, com dado real de produção, já foi validado pelo
usuário em 2026-09-20 — a motivação concreta é o tooltip ao passar o mouse (a versão atual não tem
nenhum), além de aproveitar legenda e transições prontas do Recharts em vez de mantidas à mão.

## Persona
**Empresa** (owner/manager/admin que acompanha vendas no Dashboard).

## Contexto
Depois de implementar a ORD-191 (gráfico de estoque em Recharts), o usuário gostou do resultado e
pediu pra avaliar aplicar o mesmo padrão no gráfico de receita do Dashboard, que é o mais visto e mais
antigo do admin (existe desde a ORD-101). Um spike (componente `RevenueBarChartRecharts.tsx`, não
commitado, renderizado lado a lado com o `RevenueBarChart.tsx` atual, rodando local em
`docker compose up --build admin` com dado real de setembro/2026) confirmou visualmente que a troca é
viável e traz ganho real (tooltip ao passar o mouse — a versão atual não tem nenhum) sem regressão
perceptível de layout. Falta o upstream formal antes de virar código de produção — esta história existe
pra isso, não pra pular a fila do Bloco A (A3/ORD-183 continua a próxima prioridade do épico de
estoque/ERP; esta é uma história separada, fora daquele épico).

## Explorer

### História
Como **Empresa**, quero passar o mouse sobre uma barra do gráfico de receita do Dashboard e ver o
valor exato daquele período, para não precisar estimar visualmente o valor de barras pequenas ou
próximas em altura.

### Contexto e motivação
O `RevenueBarChart.tsx` atual (CSS Grid à mão, sem lib) não tem tooltip — o único jeito de saber o
valor exato de uma barra é o `title` HTML nativo (tooltip do navegador, lento pra aparecer, sem
formatação). O Recharts, já adotado no admin pela ORD-191, resolve isso de graça, com uma lib que já
faz parte do bundle. Ganho concreto e pequeno, não uma reescrita motivada por estética — o visual
atual já é considerado bom pelo usuário.

### Fluxo principal
1. Empresa abre o Dashboard (`/dashboard`).
2. Vê o gráfico "Receita por período" — mesmos dados de sempre (`analytics.series`), mesmos filtros
   de período/granularidade/comparação já existentes, sem nenhuma mudança de fluxo pro usuário.
3. Passa o mouse sobre uma barra e vê um tooltip com o valor formatado em R$ (e, se "Comparar com
   período anterior" estiver ativo, os dois valores — atual e anterior — no mesmo tooltip).

### Fluxos alternativos / exceções
- **"Comparar com período anterior" ativo**: duas barras por posição (atual + anterior), com legenda
  — mesmo comportamento visual de hoje (ORD-103), só trocando o motor de renderização.
- **Período sem nenhuma venda**: todas as barras em R$0 — gráfico continua renderizando (linha de
  base), sem estado vazio especial (mesmo comportamento de hoje).
- **Toda granularidade** (hora/dia/semana/mês, ORD-102): `analytics.series` já vem com o `label`
  formatado pelo backend pra granularidade certa — o componente novo consome do mesmo jeito, sem
  lógica condicional por granularidade.
- **Exportar CSV** (ORD-102): não é afetado — serializa `analytics` direto, sem depender do
  componente de gráfico.

### Dependências
- **Serviços envolvidos**: nenhum novo — é troca de componente 100% frontend, consumindo o mesmo
  `PaymentAnalytics`/`RevenuePoint` que a API do payment-service já retorna hoje (`GET` via
  `getPaymentsAnalytics`, `api/payments.ts`). Sem mudança de contrato de API.
- **Depende de**: Recharts já instalado no admin (ORD-191, `package.json`).
- **Atenção pro Tech Explorer**: `StockHistoryChart.tsx` (ORD-191) importa
  `RevenueBarChart.module.scss` pra reaproveitar a classe `.wrap` (fundo/borda/raio) — se
  `RevenueBarChart.tsx`/`.module.scss` forem removidos nesta história, esse import quebra. Decidir:
  manter o `.module.scss` mesmo removendo o `.tsx`, ou extrair `.wrap` pra um arquivo compartilhado.
- **Histórias que consomem esta**: nenhuma.

### Critérios de aceite funcionais
- [ ] Gráfico de receita renderiza com Recharts, mesmos dados (`analytics.series`) de hoje
- [ ] Tooltip aparece ao passar o mouse, com valor formatado em R$
- [ ] "Comparar com período anterior" continua funcionando (duas barras + legenda)
- [ ] Todas as 4 granularidades (hora/dia/semana/mês) renderizam sem código condicional novo
- [ ] Exportar CSV continua funcionando sem alteração
- [ ] `StockHistoryChart.tsx` (ORD-191) não quebra (ver dependência acima)
- [ ] Sem scroll horizontal na página em telas estreitas (mesma regra geral do admin)

### Wireframe / Mockup
Sem mockup novo — o spike já validado ao vivo pelo usuário (2026-09-20, lado a lado com dado real de
setembro/2026) é a referência visual. Reproduzir o mesmo resultado, sem o rótulo "Spike Recharts:"
nem a exibição dupla (isso era só pra comparação, não faz parte do critério de aceite).

## QA Explorer

### Cenários

```gherkin
Feature: Gráfico de receita do Dashboard em Recharts
  Como Empresa
  Quero passar o mouse sobre uma barra do gráfico de receita e ver o valor exato
  Para não precisar estimar visualmente barras pequenas ou próximas em altura

  Background:
    Dado a Empresa está logada e no Dashboard
    E o período "Este mês" está selecionado, com granularidade "Dia"

  Scenario: Happy path — tooltip mostra o valor exato ao passar o mouse
    Dado o gráfico de receita com barras de dias diferentes
    Quando a Empresa passa o mouse sobre a barra do dia 04/09
    Então aparece um tooltip com a data "04/09" e o valor formatado em R$

  Scenario: "Comparar com período anterior" ativo mostra os dois valores no tooltip
    Dado "Comparar com período anterior" está ativado
    Quando a Empresa passa o mouse sobre uma posição do gráfico
    Então o tooltip mostra o valor "Atual" e o valor "Período anterior" da mesma posição
    E uma legenda abaixo do gráfico identifica as duas cores

  Scenario: Trocar granularidade não quebra o gráfico
    Dado o gráfico renderizado com granularidade "Dia"
    Quando a Empresa troca pra "Hora", depois "Semana", depois "Mês"
    Então o gráfico re-renderiza corretamente em cada granularidade, sem erro no console
    # cobre as 4 granularidades (ORD-102) — o componente não pode ter lógica
    # condicional por tipo de rótulo, só consumir analytics.series como vem

  Scenario: Período sem nenhuma venda
    Dado um período em que analytics.series só tem valores zerados
    Quando a Empresa abre o Dashboard nesse período
    Então o gráfico renderiza com todas as barras em R$0 (linha de base)
    E não aparece nenhum erro nem estado quebrado

  Scenario: Exportar CSV continua funcionando sem depender do componente de gráfico
    Dado um período com dados de venda
    Quando a Empresa clica em "Exportar CSV"
    Então o arquivo é gerado normalmente, idêntico ao comportamento anterior à troca
    # serializa analytics direto (ORD-102), nunca leu nada do componente de gráfico

  Scenario: StockHistoryChart (ORD-191) não regride
    Dado a seção Estoque de um produto/opção com stock_item e movimentações
    Quando a Empresa abre essa seção depois da troca de RevenueBarChart por Recharts no Dashboard
    Então o gráfico de nível de estoque continua renderizando normalmente, com o mesmo visual de antes
    # teste de regressão direto — StockHistoryChart importa RevenueBarChart.module.scss
    # (achado do Explorer); se o arquivo for removido/renomeado sem ajustar esse import, quebra

  Scenario: Responsividade — sem scroll horizontal em tela estreita
    Dado a Empresa acessa o Dashboard numa viewport estreita (ex. 375px)
    Quando o gráfico de receita renderiza
    Então não há scroll horizontal na página
    # ResponsiveContainer do Recharts precisa respeitar 100% de largura do pai,
    # mesma regra geral já usada no StockHistoryChart (ORD-191)
```

### Lacunas encontradas
1. **Altura fixa vs. fluida**: o spike usa `height={260}` fixo (Recharts exige altura numérica ou um
   container com altura definida) — o `RevenueBarChart.tsx` atual tem altura fluida (`236px` de barras
   + rótulos, calculada via CSS Grid). Não é uma regressão funcional, mas é uma mudança de
   comportamento visual sutil que o Tech Explorer precisa decidir conscientemente (manter fixo, ou
   calcular dinamicamente), não só copiar o valor do spike sem revisar.
2. **Nenhum cenário de multi-tenant/autenticação novo é necessário** (confirmação, não lacuna): a
   história não adiciona endpoint nem rota nova — consome o mesmo `PaymentAnalytics` já protegido e
   isolado por `company_id` que o Dashboard já usa hoje. Superfície de acesso não muda.
3. **Teste automatizado**: não há teste de componente (`vitest`/RTL) pra `RevenueBarChart.tsx` hoje —
   recomendo que esta história não introduza o primeiro teste de UI só pra si (fora de escopo,
   consistente com o resto do admin), mas os cenários acima devem ser validados manualmente em
   browser antes de Ready encerrar (mesmo padrão já usado nas histórias do épico de estoque/ERP nesta
   sessão).

## Tech Explorer

### Serviços impactados
- **Nenhum backend.** `frontend/admin` apenas — troca de implementação de UM componente, consumindo
  o mesmo `PaymentAnalytics`/`RevenuePoint` que já existe (`api/payments.ts`, sem alteração).

### Endpoints
Nenhum novo, nenhum alterado.

### Migrations
Nenhuma.

### Decisão — resolve a lacuna do QA (altura fixa vs. fluida)
Manter altura fixa, `height={220}` (um meio-termo entre os `180` do `StockHistoryChart` e os `260` do
spike — o gráfico de receita historicamente ocupa mais espaço vertical que o de estoque, mas não
precisa do fôlego extra do spike). Decisão consciente, não herança do spike: altura fluida exigiria
`ResponsiveContainer` calculando a partir do conteúdo (não é o padrão do Recharts, que sempre precisa
de altura numérica do container pai) — manter fixo é o padrão já estabelecido pela ORD-191, e evita
introduzir DOIS padrões de dimensionamento de gráfico no mesmo admin.

### Decisão — nome de arquivo (resolve o risco do import compartilhado, achado do Explorer)
**Não criar um componente novo.** Substituir a implementação INTERNA de `RevenueBarChart.tsx` (mesmo
nome de arquivo, mesmo nome de componente exportado, mesma interface de props
`{ data: RevenuePoint[]; showPrevious?: boolean }`) por Recharts — o motor de renderização muda, a
API do componente não. Isso elimina o risco que o Explorer apontou (import quebrado em
`StockHistoryChart.tsx`) por construção: `RevenueBarChart.module.scss` continua existindo, com o
mesmo `.wrap` (fundo/borda/raio) que os dois componentes já compartilham — só o conteúdo interno do
`.tsx` muda. `DashboardScreen.tsx` não precisa de nenhuma alteração de import.

### Componente (`frontend/admin/src/components/RevenueBarChart.tsx`, substitui o conteúdo atual)

```tsx
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RevenuePoint } from "../types";
import styles from "./RevenueBarChart.module.scss";

export interface RevenueBarChartProps {
  data: RevenuePoint[];
  showPrevious?: boolean;
}

const CURRENT_COLOR = "#9900ff";   // brand-primary — mesmo valor usado em StockHistoryChart (ORD-191)
const PREVIOUS_COLOR = "#8a8a8a";
const AXIS_COLOR = "#8a8a8a";

function compactCurrency(v: number): string {
  if (v >= 1000) return `R$${(v / 1000).toFixed(1).replace(".0", "").replace(".", ",")}k`;
  return `R$${Math.round(v)}`;
}

function currency(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function RevenueBarChart({ data, showPrevious }: RevenueBarChartProps) {
  return (
    <div className={styles.wrap}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--a-border, #e5e5e5)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
          <YAxis
            width={48}
            tickLine={false}
            axisLine={false}
            tickFormatter={compactCurrency}
            tick={{ fill: AXIS_COLOR, fontSize: 11 }}
          />
          <Tooltip
            formatter={(value, name) => [currency(Number(value)), name === "revenue" ? "Atual" : "Período anterior"]}
            labelFormatter={(label) => label}
          />
          {showPrevious && (
            <Legend
              formatter={(value) => (value === "revenue" ? "Atual" : "Período anterior")}
              wrapperStyle={{ fontSize: 12 }}
            />
          )}
          <Bar dataKey="revenue" fill={CURRENT_COLOR} radius={[3, 3, 0, 0]} maxBarSize={28} />
          {showPrevious && <Bar dataKey="previous_revenue" fill={PREVIOUS_COLOR} radius={[3, 3, 0, 0]} maxBarSize={28} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

### `RevenueBarChart.module.scss` — simplifica, mantém só `.wrap`
Todas as classes específicas do CSS Grid antigo (`.chartArea`, `.yAxis`, `.yTick`, `.chart`,
`.chartCompare`, `.gridLine`, `.barCell`, `.bar`, `.barPrevious`, `.pointLabel`, `.legend`,
`.legendItem`, `.legendSwatch*`) saem — o Recharts desenha tudo via SVG, nenhuma dessas classes é mais
referenciada. Só `.wrap` permanece (é o que `StockHistoryChart.tsx` também usa).

### `DashboardScreen.tsx`
Nenhuma alteração — o import e o uso (`<RevenueBarChart data={analytics.series} showPrevious={showPrevious} />`)
já são exatamente essa assinatura hoje.

### Impacto em outros serviços
Nenhum — mudança isolada ao `frontend/admin`.

### Estimativa
**2 pontos** — troca de implementação com interface idêntica, sem novo endpoint, sem migration,
componente e trade-offs já validados no spike. O esforço real é escrever os testes manuais dos 7
cenários do QA Explorer, não o código em si (que já existe, testado ao vivo).

### Riscos
- **Nenhum risco de regressão de dado** — mesma prop `data: RevenuePoint[]`, sem transformação nova.
- **CSS morto**: depois de simplificar `.module.scss`, rodar busca por qualquer outro consumidor das
  classes removidas antes de apagar (checagem rápida, `grep -rn "styles\.\(chartArea\|yAxis\|...\)"`)
  — não deveria haver nenhum (só `RevenueBarChart.tsx` as usa hoje), mas confirmar evita CSS órfão
  silencioso em vez de erro de build.
- **Bundle size**: Recharts já está no bundle desde a ORD-191 — nenhum custo adicional de tamanho de
  build por causa desta história.

## Ready
Passou pelas 3 rodadas de revisão (PM, QA, Backend SR + Frontend).

- **PM**: história motivada por um spike já validado ao vivo com dado real (2026-09-20) — ganho
  concreto é o tooltip, não estética (o visual atual já era considerado bom). Fora do épico de
  estoque/ERP, não compete com a prioridade do Bloco A (A3/ORD-183 continua sendo a próxima da fila
  daquele épico).
- **QA**: 7 cenários cobrindo happy path (tooltip), comparação com período anterior, as 4
  granularidades, período sem venda, exportação CSV inalterada, regressão do `StockHistoryChart`
  (ORD-191, que compartilha `RevenueBarChart.module.scss`) e responsividade. Sem cenário de
  erro/validação ou isolamento multi-tenant — confirmado como não aplicável: história não introduz
  endpoint, input de usuário nem superfície de acesso nova.
- **Backend SR + Frontend**: nenhum impacto de backend — troca isolada ao `frontend/admin`. Decisão
  chave: **reaproveitar o mesmo arquivo/nome de componente** (`RevenueBarChart.tsx`) em vez de criar
  um novo, eliminando por construção o risco de import quebrado que o Explorer apontou
  (`StockHistoryChart.tsx` depende do mesmo `.module.scss`). Componente completo já escrito nesta
  seção, validado no spike. 2 pontos.

### Aprovação final
- [x] Time revisou e concordou com a solução técnica
- [x] Estimativa acordada — 2 pontos
- [x] Sem bloqueios não resolvidos
- [x] Priorizada no sprint backlog — decisão do usuário (2026-09-20): implementar em seguida, antes
      de retomar o Bloco A / A3 (ORD-183)
