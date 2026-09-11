# Análise de concorrência — Zig (produto, funcionalidades, preço)

Quarto da leva de aprofundamento (após CPlug, Nola e Consumer) dos 8 concorrentes originalmente cobertos só por dashboard/BI em `docs/analise-dashboard-concorrentes-mercado.md` (achado da época: "o mais robusto do grupo: vendas por funcionário, estornos por operador, curva ABC de produtos, novo vs. recorrente (CRM), visão consolidada multi-unidade" — confirma-se aqui o porquê: não é player de food service comum). Pesquisa (2026-09-10). Ver `docs/project_ordin_concorrentes_referencia` (memória) pra lista completa.

**Fontes:** `zig.fun` (site institucional — nome comercial "The Global Funtech"), páginas de produto `zig.fun/produtos/autoatendimento-com-totem/` e `zig.fun/tipos-negocio/restaurantes/`.

## Achado central: Zig não é um concorrente de food service — é cashless de eventos/venues que também atende restaurante

Diferente de todos os concorrentes vistos até agora (SisFood, CPlug, Nola, Consumer), a Zig se posiciona primeiro como tecnologia de **pagamento cashless para eventos, festivais, estádios e arenas** — clientes citados no case: **Rock in Rio, Lollapalooza, Primavera Sound**. Restaurante/bar é um segmento secundário do mesmo produto, não o público principal. Isso explica a robustez incomum de analytics (curva ABC, CRM novo-vs-recorrente, multi-unidade) observada na rodada anterior: é ferramenta pensada pra operação de altíssimo volume simultâneo (evento de massa), não pro fluxo padrão de restaurante.

## Totem de autoatendimento — funcionalidades

- **Modelos de hardware**: mini totem, totem móvel, totem cashless, totem ficha — variedade voltada a formatos de evento (móvel = deslocável dentro de uma arena/festival).
- **Formas de pagamento**: cashless (cartão/pulseira Zig pré-paga), fichas físicas, cartão (Cashless Digital), PIX, QR Code, **Apple Pay e Google Pay** — únicos concorrentes vistos até agora com carteiras digitais (Apple/Google Pay) explicitamente citadas.
- **Modelo de operação**: pré-pago, pós-pago ou híbrido (mencionado em busca complementar) — típico de cashless de evento (cliente carrega crédito antes de consumir), diferente do totem de restaurante tradicional que cobra por pedido.
- Frase de venda: "Alivie significativamente a carga de trabalho dos caixas ao distribuir a tarefa de recarga e pagamentos entre os totens."

## Solução completa pra restaurantes (não só o totem)

Gestão de reservas com cobrança antecipada e controle de no-show, gestão de mesas, PDV móvel, check-in, app mobile (QR Code, Apple Pay, Google Pay), SMS pra engajamento, gestão fiscal integrada, analítico de clientes com segmentação demográfica, programa de fidelidade "Giftback" (créditos e bônus personalizados), bilheteria online.

**Segmentos:** restaurantes, bares, casas noturnas, beach clubs, eventos, estádios e arenas — disponibilidade "em todos os países" (única entre os concorrentes pesquisados a reivindicar presença internacional).

**Diferencial de venda (case)**: "aumento de 41% no ticket médio" no evento João Rock.

## Preço, setup e planos — não há tabela pública

Diferente de CPlug/Nola/Consumer (que têm páginas de planos, ainda que com valores parciais "sob consulta"), a Zig **não expõe nenhuma tabela de preço** — só CTA "Contrate agora" levando a contato comercial. Consistente com o perfil de cliente-alvo (grandes eventos, arenas, redes de bar/restaurante de porte), onde o modelo comercial é negociação direta, não plano de assinatura self-service.

## Comparação com o Ordin (observações, não recomendação)

- **Segmento de mercado diferente do core do Ordin**: Zig compete pelo cliente de evento de massa / operação de altíssimo volume simultâneo, não pelo pequeno/médio restaurante que é o alvo declarado do Ordin (`docs/analise-dashboard-concorrentes-mercado.md`). Provavelmente não é concorrente direto na prática — mais um "vizinho de categoria" (mesma tecnologia de totem, público muito diferente).
- **Apple Pay / Google Pay** é uma lacuna que nenhum outro concorrente pesquisado até agora citou — vale registrar como ponto de atenção se o Ordin algum dia avaliar meios de pagamento adicionais além de cartão/PIX (ver `docs/analise-meios-pagamento-integracao.md`).
- **Modelo cashless pré-pago** (cliente carrega crédito, consome depois) é um padrão de operação de evento que não se aplica ao fluxo do Ordin hoje (pedido→pagamento imediato→ticket), mas é uma referência de mercado caso o Ordin algum dia mire clientes tipo festival/parque/clube.
- Ausência total de preço público reforça que, quanto mais "enterprise"/evento o concorrente, menos ele expõe pricing — padrão inverso ao observado em CPlug/Consumer (self-service, pricing público).

## Próximos passos

Pendente na mesma rodada: **Gototem, PagTotem** — um de cada vez.
