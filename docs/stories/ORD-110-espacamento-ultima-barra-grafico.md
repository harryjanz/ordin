---
id: ORD-110
status: Done
fase: 6
sprint: null
responsavel: Frontend
estimativa: 1 ponto
tipo: bugfix
---

# ORD-110 — Fix: espaçamento no gráfico "Receita por período" (última barra + topo)

## Descrição
No dashboard, seção "Receita por período" (`RevenueBarChart.tsx`), dois pontos sem respiro visual:
1. A última barra (mais à direita) fica colada na borda direita do container do gráfico — diferente do lado esquerdo, que tem a linha do eixo Y + `padding-left: 8px`.
2. A barra mais alta (maior valor do período) toca o topo do card — sem espaço entre ela/o tick superior do eixo Y e a borda de cima do card.

## Causa raiz
`RevenueBarChart.module.scss`:
1. `.chart` só definia `padding-left: 8px` (pro espaço da linha do eixo). Não havia `padding-right`, então a última coluna do grid (`grid-auto-columns`) encostava na borda direita de `.chart`.
2. `.chartArea` tinha `padding: 12px 16px 12px` — 12px de respiro no topo é pouco pro valor máximo do período (barra mais alta = 100% de `BARS_HEIGHT_PX`, tocando o tick superior do eixo Y).

## Fix
1. `padding-right: 8px` em `.chart`, espelhando o `padding-left` já existente.
2. `.chartArea`: padding-top de `12px` → `28px` (ajustado em duas rodadas: primeiro pra `20px`, usuário achou ainda pouco pro rótulo do tick superior — "R$1k" — que fica com o centro exatamente no topo da área útil, `translateY(-50%)`; segunda rodada foi pra `28px`). Ajustado no container externo (não em `.chart`/`.yAxis` isoladamente) porque `.yAxis` e `.chart` são irmãos num flex row com alturas fixas casadas (`236px` / `BARS_HEIGHT_PX`) — empurrar só um dos dois pra baixo desalinharia os ticks do eixo Y com as linhas de grade/barras. Aumentando o padding do container pai, os dois descem juntos e o alinhamento interno se mantém.

## Downstream
- **Branch:** `fix/ord-110-espacamento-ultima-barra-grafico`, a partir de `main`.
- **`frontend/admin/src/components/RevenueBarChart.module.scss`:** `padding-right: 8px` em `.chart`; `.chartArea` padding-top `12px` → `28px`.
- **Verificado ao vivo:** rebuild do container `admin` (`docker compose up -d --build admin`), usuário confirmou visualmente no navegador ("agora ficou bom").
