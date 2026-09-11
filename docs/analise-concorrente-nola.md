# Análise de concorrência — Nola (produto, funcionalidades, preço)

Segundo da leva de aprofundamento (após CPlug, `docs/analise-concorrente-cplug.md`) dos 8 concorrentes originalmente cobertos só por dashboard/BI em `docs/analise-dashboard-concorrentes-mercado.md`. Pesquisa (2026-09-10). Ver `docs/project_ordin_concorrentes_referencia` (memória) pra lista completa.

**Fontes:** `usenola.com.br` (site institucional) e `usenola.com.br/2026/planos` (página de planos, navegador real — mesmo padrão de SPA em React que a CPlug, preços não vêm em WebFetch simples nas páginas internas, mas nesse caso a home e a página de planos responderam bem).

## O que é — achado central: Nola NÃO é primariamente um player de totem

Diferente de SisFood e CPlug (que vendem o totem como peça central do pitch), o Nola se posiciona como **ecossistema de gestão de restaurante** (PDV + financeiro + estoque + equipe + inteligência), com foco forte em **BPO financeiro/tributário e CMV real** — não em autoatendimento. O totem aparece só como **periférico opcional vendido à parte**, não como funcionalidade central. Isso explica por que a rodada de dashboard anterior só achou o módulo "Inteligência" do Nola (alertas, DRE automático, resumo via WhatsApp) — o produto principal deles é gestão/BI, não a experiência de pedido do cliente.

Frase de posicionamento: *"O Nola nasceu dentro de um restaurante, não em um laboratório de tecnologia... de donos de restaurante, para donos de restaurante."*

Seis módulos do "ecossistema": Operação & PDV · Financeiro · Tributário (BPO) · Compras & Estoque · Gestão de Equipe · Inteligência & Alertas.

## Segmentos e público-alvo

Restaurante, dark kitchen, hamburgueria, pizzaria, dark kitchen, cafeteria, bistrô, franquias. Critério de corte explícito no FAQ: **"faturamento acima de R$40 mil/mês"** — não é pra operação muito pequena (o Ordin, pelo contrário, mira exatamente o pequeno/médio, ver `docs/analise-dashboard-concorrentes-mercado.md`).

## Modelo de preço — muito diferente da CPlug

Nenhum valor em R$ é público. Os planos são segmentados **por faixa de faturamento mensal do cliente**, não por R$ fixo:

| Plano | Faixa de faturamento | Principais recursos |
|---|---|---|
| **Essencial** (Entry) | até R$40k/mês | PDV completo (mesa/balcão/delivery), integração iFood/Rappi, fechamento de caixa, contas a pagar/receber, relatórios essenciais, 1 admin + 3 operadores |
| **Profissional** (Core, "Mais Popular") | R$40k-150k/mês | + DRE automatizado, conciliação bancária, fluxo de caixa com previsão, estoque + fichas técnicas, CMV real vs. teórico, **KDS incluso**, alertas WhatsApp (1 número) |
| **Premium** (Ecossistema) | R$150k-300k/mês | + "Clara IA" (assistente via WhatsApp), CRM + fidelidade completo, **Cardápio Digital Interativo**, gestão de RH, multi-marca (1 extra), suporte 7 dias |
| **Enterprise** (Rede) | R$300k+ ou 3+ unidades | + dashboard multi-loja, marcas ilimitadas, API customizada, desconto por volume, gerente de conta dedicado, SLA garantido |

Todos os planos: **30 dias grátis**, implantação instantânea (ambiente pronto na hora da conta), sem compromisso, "cancele quando quiser" — contraste direto com a CPlug (contrato de 1 ano no mensal).

## Hardware — "periféricos", vendidos à parte, sob consulta

Seção explícita "Acelere sua operação com os periféricos NOLA — Hardware vendido à parte":

| Periférico | Preço | Disponível a partir de |
|---|---|---|
| **Totem de Autoatendimento** | Sob consulta | Profissional+ (ou seja, só a partir de R$40k/mês de faturamento do cliente) |
| Tablet de Mesa | Sob consulta | Profissional+ |
| SmartPOS (maquininha) | Sob consulta | Essencial+ |
| TEF (integração) | Sob consulta | Essencial+ |
| Balança Autoatendimento | Sob consulta | Premium+ |

**Achado central pro benchmark de pricing:** ao contrário da CPlug (totem incluso na mensalidade desde o plano básico), o Nola trata o totem como **upsell de hardware, gated por tier** — cliente pequeno (plano Essencial, até R$40k/mês) nem tem acesso à opção de comprar o totem. Reforça que "quanto custa o totem" varia muito por modelo de negócio do concorrente: parte do pacote (CPlug) vs. add-on premium (Nola).

Também há uma camada de "serviços especializados" (Supfy marketplace de compras, BPO financeiro/tributário, diagnóstico estratégico, consultoria de setup 1:1) — tudo "sob consulta", reforçando que o Nola vende mais uma operação de consultoria/gestão do que um produto de prateleira.

## FAQ (capturado da página institucional)

**O que é o Nola exatamente?**
"O Nola é o ecossistema completo de gestão para food service. Do PDV à gestão financeira, do controle de estoque ao treinamento de equipe — tudo integrado em uma única plataforma."

**Qual é o diferencial do Nola?**
"O Nola nasceu dentro de um restaurante, não em um laboratório de tecnologia. Cada funcionalidade foi pensada por quem já esteve do seu lado do balcão."

**Quanto tempo leva para implementar?**
"A implementação leva a partir de 5 a 10 dias, dependendo do tamanho da operação... configuração, importação de dados, ficha técnica e treinamento da equipe."

**O Nola é para minha operação?**
"Se você tem um restaurante, dark kitchen, hamburgueria, cafeteria ou qualquer negócio de food service com faturamento acima de R$40 mil/mês, o Nola foi feito para você."

**O sistema é 100% online?**
"Sim, o Nola é 100% em nuvem e pode ser acessado de qualquer dispositivo com internet. Projetado para ser leve e consumir pouquíssimos dados."

**E se eu já uso outro sistema?**
"Nosso time de implementação cuida de toda a migração... Em 5 a 10 dias você está operando 100% no Nola, sem parar sua operação."

**O Nola integra com iFood, Rappi e outros apps?**
"Sim! O Nola integra nativamente com iFood, Rappi, Uber Eats e outros marketplaces. Todos os pedidos aparecem em um único painel."

## Comparação com o Ordin (observações, não recomendação)

- **Corte de faturamento mínimo (R$40k/mês)** é um contraste direto com o posicionamento do Ordin de "barato pra pequeno/médio estabelecimento" (`docs/analise-dashboard-concorrentes-mercado.md`) — o Nola conscientemente não atende o cliente menor que o Ordin mira.
- **Totem como upsell gated por tier de faturamento**, não funcionalidade central — reforça que nem todo concorrente do "mercado de food service" compete diretamente no totem; vale segmentar concorrentes por "quem vende totem como produto principal" (SisFood, CPlug, Goomer) vs. "quem vende gestão e trata totem como acessório" (Nola).
- **BPO tributário/financeiro e "Clara IA" via WhatsApp** são camadas de produto que o Ordin não tem e, dado o posicionamento enxuto do Ordin, provavelmente não deveriam entrar no roadmap sem pedido explícito — é "suíte corporativa" no sentido que a análise de dashboard já tinha descartado como não alinhado.
- **30 dias grátis + sem fidelidade** vs. CPlug (contrato de 1 ano) é outro dado de mercado pra eventual decisão comercial do Ordin sobre modelo de contrato.

## Próximos passos

Pendente na mesma rodada: **Consumer, Zig, Gototem, PagTotem** — um de cada vez. Nota: a busca já revelou a URL do Consumer (`consumer.com.br/autoatendimento`), pode acelerar a próxima rodada.
