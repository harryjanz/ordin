# Análise de dashboard concorrente (Goomer) — coleta de ideias PM/UX

## Fonte
`docs/exemples/dash/totem-dashboard-lg.webp` — tela "Análises" do painel admin da Goomer (concorrente direto, também atende food service com totem de autoatendimento). Print mostra o topo da página; o card "Tempo médio de mesa" e o restante da lista de "Venda por solução" aparecem cortados.

## Baseline: o que o Ordin tem hoje
`DashboardScreen.tsx` é um placeholder: 4 contadores estáticos (Pedidos pendentes, Pagos hoje, Faturamento aprovado, Total de pedidos), sem série temporal, sem comparação com período anterior, sem seletor de data, sem quebra por terminal/produto. É o único ponto de "analytics" do admin hoje — não existe uma tela "Análises" separada.

Achado técnico relevante pra viabilidade (ver seção final): `Order` (`services/order/main.py`) já tem `terminal_id`, `created_at` e `total` — dá pra construir receita por hora e por terminal **sem migration**, só com endpoint(s) novo(s) de agregação.

---

## Leitura da imagem, por seção

### 1. Cabeçalho de período + KPIs do dia
- Seletor: **Hoje / Ontem / Este mês / Customizado** (chips, "Hoje" ativo em destaque)
- Data por extenso abaixo ("Segunda-feira, 10 de novembro") com ícone de info (provável tooltip explicando o cálculo)
- 4 KPIs lado a lado, cada um com **variação % vs. semana anterior**: Receita (R$ 2.500,00, +2,9%), Ticket médio/mesa (R$ 40,00), TM Comanda (R$ 120,00), Volume (43)

### 2. Gráfico de receita por hora
Barras de 00:00 a 23:00, mesmo dia selecionado no seletor de período. Deixa visível o pico de movimento (aqui: 03:00, 06:00, 11:00, 19:00) — útil pra dimensionar equipe/estoque por horário.

### 3. "Visão geral dos relatórios" — 3 cards lado a lado
- **Avaliação de clientes**: nota geral (4,3, 300 avaliações) + breakdown por critério (Comida 8,2 / Ambiente 8,4, estrelas)
- **Giro de mesa**: 4,55x (+2,9%) + card "Tempo médio de mesa" logo abaixo (cortado na imagem)
- **Venda por solução**: abas Faturamento/Ticket médio, lista de canais com ícone + nome + valor (Cardápio Tablet R$ 10.000,00, Cardápio para delivery R$ 9.450,00, lista provavelmente continua)

---

## Ideias coletadas, ajustadas pra realidade do Ordin

### Fora de escopo (removido a pedido)
- **Avaliação de clientes** — Ordin não tem sistema de review/nota hoje; fica de fora da coleta.
- **Giro de mesa** e **Tempo médio de mesa** — conceito de mesa/comanda não existe no totem de autoatendimento (cada pedido é uma transação única, sem abertura/fechamento de comanda). Fora de escopo.

**Observação não pedida, mas correlata:** o KPI "Ticket médio/**mesa**" e o card "**TM Comanda**" (ticket médio da comanda) têm a mesma raiz problemática — são métricas de operação com mesa/comanda aberta. Pra manter as 4 KPIs do topo (Receita, Ticket médio, Volume + uma quarta), sugiro **Ticket médio** simples (receita ÷ nº de pedidos) no lugar de "Ticket médio/mesa", e **dropar "TM Comanda"** (redundante com Ticket médio numa operação sem comanda) — mas isso é uma escolha de produto, não decidi sozinho, fica pra validar com você.

### 1. Cabeçalho de período + KPIs comparados — alto valor, baixo esforço
- Seletor Hoje/Ontem/Este mês/Customizado é um padrão sólido e bem conhecido — dá pra reaproveitar o mesmo componente `Dropdown`/filtro já usado em Pedidos/Pagamentos.
- Comparação "+X% vs. semana anterior" em cada KPI é o que mais falta hoje — os 4 cards atuais são fotos estáticas, sem contexto de tendência.
- KPIs sugeridos pro Ordin: **Receita**, **Ticket médio**, **Volume (pedidos)**, e um quarto a definir (candidatos: **Pedidos por terminal ativo**, ou **Taxa de conversão** se der pra medir sessão-iniciada → pedido-pago).

### 2. Gráfico de receita por hora — alto valor, esforço médio
- Reaproveita exatamente o dado que já alimenta os KPIs (`Order.created_at`/`total`), só agrupado por hora do dia selecionado.
- Pro dono de loja isso é ouro operacional: mostra horário de pico real pra dimensionar reposição de insumos e, se aplicável, suporte presencial perto do totem.

### 3. "Venda por terminal" (adaptação de "Venda por solução") — alto valor, esforço médio
Ideia central do pedido: a Goomer quebra receita por **canal de venda** (tablet na mesa, delivery, etc.) porque o modelo deles é multi-canal. O Ordin não tem múltiplos canais de venda — tem **múltiplos terminais físicos por loja** (confirmado nos dados de teste: "Totem 1 - Entrada", "Totem 2 - Caixa", etc.), que é a variável que realmente importa pro dono decidir onde investir/realocar um totem.
- Mesmo layout (abas Faturamento/Ticket médio + lista com valor por linha), trocando "solução" por **terminal**: label do terminal (`Terminal.label`) + receita/ticket médio daquele terminal no período selecionado.
- Direto acionável: "Totem 1 - Entrada" vendendo muito menos que "Totem 2 - Caixa" pode indicar posicionamento ruim, terminal com problema técnico recorrente, ou fila menor por falta de visibilidade — todas decisões de negócio que hoje não têm nenhum dado de apoio no admin.

---

## Viabilidade técnica (visão rápida, não é levantamento formal de Tech Explorer)

| Ideia | Dado já existe? | Precisa endpoint novo? | Precisa migration? |
|---|---|---|---|
| KPIs com comparação vs. período anterior | Sim (`orders`, `payments`) | Sim — agregação com dois períodos | Não |
| Seletor Hoje/Ontem/Este mês/Customizado | Sim | Reaproveita endpoint acima com `date_from`/`date_to` | Não |
| Receita por hora | Sim (`Order.created_at`) | Sim — agregação por hora | Não |
| Venda por terminal | Sim (`Order.terminal_id`) | Sim — agregação por `terminal_id` + join com `Terminal.label` (cross-service: order-service não tem o label, só o id) | Não |

O ponto de atenção técnico mais real é o último: `order-service` só guarda `terminal_id` (inteiro), o **label** do terminal mora no `company-service`. Vai precisar ou de uma chamada interna (`GET /internal/terminals/{id}`, que já existe) ou de um endpoint de agregação que devolve só os IDs e o frontend resolve os nomes via `GET /companies/{id}/terminals` (já existe, do ORD-098).

---

## Próximos passos sugeridos
Isso é levantamento de ideias, não uma história pronta pra Ready. Se quiser seguir, o caminho natural é abrir uma história (ex: "Análises: KPIs comparativos + receita por hora + venda por terminal") e rodar o upstream normal (Explorer → QA Explorer → Tech Explorer) antes de qualquer código — a tabela de viabilidade acima já adianta boa parte do Tech Explorer.
