# Análise comparativa de dashboards — 8 concorrentes de mercado (PM/UX)

Complementa `docs/analise-dashboard-concorrente-goomer.md` (que já gerou a ORD-101). Esta rodada amplia a coleta pros outros 7 concorrentes de referência (ver memória de referência do projeto) e revisita o Goomer com mais detalhe. **Sem análise comercial/pricing aqui** — só produto e UX, por pedido explícito.

## Posicionamento do Ordin (contexto que guia as escolhas abaixo)
- Solução **barata pra pequeno/médio estabelecimento**: setup baixo, mensalidade coerente por número de totens.
- **Multi-provedor de pagamento** (Mercado Pago, PayGo, e outros a inserir) — o dono escolhe/troca fornecedor sem lock-in. Isso é um diferencial real que quase nenhum concorrente pesquisado expõe dessa forma (eles empurram o próprio provedor de pagamento, ex. PagTotem/PagBank).

Esse posicionamento filtra as ideias: **prioridade pra o que reforça simplicidade operacional e a flexibilidade de pagamento**, e não pra recursos de "suíte corporativa" (BI de montagem livre, DRE, CRM de fidelidade) que não combinam com um produto enxuto pra pequeno/médio negócio.

## Baseline: o que o Ordin tem hoje (pós ORD-101)
`DashboardScreen.tsx` já tem: seletor Hoje/Ontem/Este mês/Customizado, 3 KPIs (Receita, Ticket médio, Volume) com variação % vs. período anterior, gráfico de receita por hora, e "Venda por terminal". Fonte de dado: só `Transaction` (payment-service) — que também carrega `method` (crédito/débito/PIX) e `provider` (mercadopago/paygo/mock) já gravados por transação, mas **ainda não usados no dashboard**.

---

## Leitura por concorrente, focada em dashboard/análises

| Concorrente | O que o painel deles mostra (achado relevante) |
|---|---|
| **Goomer** | Estatísticas com 2 métricas (pedidos + faturamento), 3 filtros: data, **granularidade (hora/dia/semana/mês)**, origem do pedido/canal; buscador de produto p/ ver venda por item; histórico de pedidos **exportável pra planilha** (Excel/Google Sheets). |
| **Suitable** | Relatórios de totem citam tempo médio de pedido, prato mais visto, **abandono de carrinho** — métricas de sessão/funil, não de pedido finalizado. |
| **Cplug (ConnectPlug)** | Módulo de BI com **montagem livre de relatório** ("cruza informação do jeito que o gestor escolher"), acesso mobile; monitor remoto de status de cada terminal. |
| **Nola** | Módulo "Inteligência": ranking de indicadores, comparativo entre períodos (já temos), **detecção de anomalias** com alerta, **resumo diário via WhatsApp**, DRE automático (financeiro, fora do nosso escopo de dado). |
| **Consumer** | Relatórios acessíveis remoto por celular; nada de analytics diferenciado além do básico — combo/promoção ainda nem estão no totem deles. |
| **Zig** | O mais robusto do grupo: vendas por funcionário, estornos por operador, **curva ABC de produtos**, novo vs. recorrente (CRM), **visão consolidada multi-unidade** pra quem tem mais de um ponto. |
| **Gototem** | Dashboard mobile/desktop com filtros por vendas/faturamento/ticket médio — essencialmente o que já temos, sem diferencial novo. |
| **PagTotem / PagVendas (PagBank)** | Painel com aba **"Todas"** que consolida vendas de qualquer maquininha/canal PagBank num único lugar; relatório detalhado **por forma de pagamento** e por canal, além de vendedor/ticket médio. |

### Padrões que se repetem em quase todo mundo
1. Granularidade de tempo ajustável no gráfico (Goomer).
2. Exportação de relatório/planilha (Goomer, Cplug, Zig).
3. Quebra por **forma de pagamento/canal** (PagVendas, Goomer).
4. Ranking/top produtos (Zig, Goomer).
5. Visão consolidada multi-unidade/multi-canal num só painel (Zig, PagVendas).
6. Alertas/resumo automático periódico (Nola).

---

## Ideias coletadas, adaptadas à realidade do Ordin

### Fora de escopo agora
- **Performance por funcionário / estornos por operador** (Zig) — o totem é autoatendimento, não existe operador atribuído a uma venda.
- **CRM (cliente novo vs. recorrente, histórico de consumo)** (Zig) — Ordin não tem conta de cliente, só um CPF opcional no pedido; virar isso em identidade de cliente é uma feature própria, não um item de dashboard.
- **DRE automático / fluxo de caixa com despesas** (Nola) — Ordin não captura despesa nenhuma, só transação de venda. Fora de escopo total.
- **BI de montagem livre de relatório** (Cplug) — recurso de plataforma madura/enterprise, esforço alto, não combina com "dashboard enxuto pra pequeno/médio".
- **Alertas de desvio/anomalia + resumo via WhatsApp** (Nola) — depende de infra de notificação que não existe hoje e de definir o que é "desvio normal" pra cada operação; ideia boa, mas é uma feature de notificação, não um item de tela de dashboard. Fica pra backlog futuro, não pra essa rodada.
- **Tempo médio de pedido / prato mais visto / abandono de carrinho** (Suitable) — exige rastrear sessão do totem (carrinho aberto, navegação, abandono), e hoje só o pedido finalizado é gravado. Mudança de modelo de dado no order-service, não é ajuste de dashboard.

### Alto valor, baixo esforço — dado já existe na tabela `Transaction`, é agregação aditiva
1. **Receita por forma de pagamento / provedor de pagamento** (inspirado no PagVendas). `Transaction.method` (crédito/débito/PIX) e `Transaction.provider` (mercadopago/paygo/mock) já são colunas gravadas em toda transação. Essa é a métrica **mais alinhada com o diferencial de produto do Ordin**: mostrar pro dono a receita se distribuindo entre os provedores que ele escolheu, sem lock-in — nenhum concorrente pesquisado expõe isso do jeito "liberdade de escolha", eles só mostram o próprio provedor. Mesmo padrão técnico já usado pra "venda por terminal", sem precisar de chamada cross-service (o dado já está no payment-service).
2. **Exportar o período analisado (CSV/Excel)** — recorrente em Goomer, Cplug e Zig. Reaproveita exatamente o dado que já volta de `/payments/analytics` e de `GET /payments`, só serializa pra arquivo.
3. **Granularidade de tempo ajustável no gráfico** (hora/dia/semana/mês, inspirado no Goomer) — hoje o gráfico de receita só agrupa por hora do dia, o que fica pouco legível quando o período selecionado é "Este mês" (28-31 barras de hora por dia não fazem sentido agregadas). Trocar `func.hour()` por um parâmetro de granularidade resolve sem mudar modelo de dado.

### Valor médio, esforço médio
4. **Visão consolidada multi-empresa pra superadmin/admin** (inspirado na aba "Todas" do PagVendas e na visão multi-unidade da Zig) — hoje o dashboard sempre olha uma empresa por vez via Dropdown; quem administra a plataforma (superadmin/admin da Ordin) não tem um ranking/comparativo entre as empresas-cliente. Reaproveita o mesmo endpoint de analytics, tirando o filtro de `company_id` fixo e agrupando por empresa.
5. **Top produtos vendidos** (inspirado na curva ABC da Zig e no buscador de produto do Goomer) — o payment-service (fonte atual do dashboard) só sabe o valor da transação, não qual produto foi vendido; isso vive no order-service. Precisaria de uma chamada interna ou endpoint de agregação lá — mesma classe de dependência cross-service que "venda por terminal" já teve com o `company-service` pro label do terminal.

---

## Tabela de viabilidade (visão rápida, não é Tech Explorer formal)

| Ideia | Dado já existe? | Precisa endpoint novo/ajuste? | Cross-service? | Migration? |
|---|---|---|---|---|
| Receita por forma de pagamento/provedor | Sim (`Transaction.method`, `.provider`) | Sim — agregação aditiva no `/payments/analytics` existente | Não | Não |
| Exportar CSV/Excel do período | Sim (mesmo dado do endpoint atual) | Sim — endpoint ou serialização no frontend | Não | Não |
| Granularidade hora/dia/semana/mês | Sim (`Transaction.created_at`) | Sim — trocar `func.hour` por parâmetro de agregação | Não | Não |
| Visão multi-empresa (superadmin) | Sim | Sim — variante do endpoint sem `company_id` fixo, agrupando por empresa | Não | Não |
| Top produtos vendidos | Parcial (fica no order-service, não no payment-service) | Sim — agregação nova no order-service + join no frontend ou endpoint agregador | Sim | Não |

---

## Próximos passos sugeridos
Isso ainda é levantamento de ideias, não uma história pronta. As 3 primeiras (receita por forma de pagamento, exportação, granularidade) têm o melhor custo-benefício e são as que mais reforçam o posicionamento do Ordin — candidatas naturais pra abrir uma única história e rodar o upstream (Explorer → QA Explorer → Tech Explorer → Ready) antes de qualquer código. As outras duas (multi-empresa, top produtos) podem ficar como uma segunda história, já que uma envolve olhar a plataforma como um todo (não uma empresa) e a outra cruza dado de outro serviço.
