# Análise de concorrência — CPlug / ConnectPlug (produto, funcionalidades, preço)

Concorrente da rodada de 8 de `docs/analise-dashboard-concorrentes-mercado.md` (só dashboard/BI foi coberto lá). Pesquisa (2026-09-10) aprofundando produto, funcionalidades e — pela primeira vez nessa leva — **preço e setup**, que as análises anteriores (CardápioWeb, Mogo, dashboard) tinham excluído por pedido explícito do usuário. Ver `docs/project_ordin_concorrentes_referencia` (memória) pra lista completa de concorrentes rastreados.

**Fontes:** site institucional (cplug.com.br / connectplug.com.br — mesma empresa, dois domínios), blog (`blog.connectplug.com.br`), página de planos `cplug.com.br/planos/food` (SPA em React, exigiu navegador real — WebFetch não renderiza os preços porque são carregados via JS).

## O que é

Empresa de Curitiba/PR (fundador Rafael Hasson), atuando em varejo desde 2015, alega +100.000 clientes. Ecossistema PDV + ERP + BI numa plataforma só, atendendo "mais de 20 segmentos" (restaurantes, bares, cafeterias, pizzarias, hamburguerias, lanchonetes, padarias, confeitarias, sorveterias, food trucks).

Posicionamento explícito de marketing pra pequeno negócio: **sem taxa de adesão, sem fidelidade mínima, mensalidade flexível**. Frase do fundador: *"Analisamos o mercado, identificamos oportunidades e desenvolvemos um produto único, ao alcance de qualquer empreendedor."*

## Funcionalidades (módulos)

PDV · KDS · Hub de Delivery (iFood, Rappi e outros) · Cardápio Digital · Mesas e Comandas · **Autoatendimento** (totem/tablet) · BI e Relatórios · Gestão de Estoque · Emissão Fiscal (NF-e, NFC-e, SAT) · Integração TEF · ERP Gestão · Programa de Fidelidade.

- PDV opera **offline**: "operação offline garantida: o PDV continua vendendo mesmo sem internet", sincroniza quando a conexão volta.
- Hardware do totem/autoatendimento é flexível: **tablets e monitores touch de 19" a 32"** — não é appliance fechado, parecido com o modelo "roda no seu equipamento" do SisFood.
- Suporte humano citado como diferencial: "7 dias por semana", com "implantação dedicada".

## Tabela de preços — plano "Alimentação" (`cplug.com.br/planos/food`)

A página tem 3 categorias de plano (abas) com **os mesmos 3 degraus de preço em todas**: R$249 / R$399 / R$549 por mês (cobrança mensal, contrato de 1 ano — há também opção anual com desconto "até 21%"). Achado relevante: clicar entre as abas "Mesa/Balcão" e "Completo" mostrou os **mesmos nomes de plano e mesmo preço** ("Balcão Básico/Gestão/Avançado", 249/399/549) — pode ser bug do site (conteúdo da aba "Completo" não carregou de fato, ou as duas categorias são de fato idênticas em preço hoje). Registrando como observado, não validado.

### Categoria "Delivery" (entrega/retirada)
| Plano | Preço/mês | PDVs | Usuários | Pedidos marketplace/mês | Destaques |
|---|---|---|---|---|---|
| Delivery Básico | R$249 | 1 | 2 | 500 | Impressão + KDS, importação XML, relatórios básicos, TEF Sitef |
| Delivery Gestão (mais popular) | R$399 | 1 | 3 | 1500 | + estoque alimentar/grade, painel de senha TV/mobile, conciliação bancária, implantação dedicada individual grátis |
| Delivery Avançado | R$549 | 1 | 5 | 3000 | + app de gestão mobile, promoções, Smart TEF grátis, gerente de sucesso dedicado |
| Corporativo | Sob consulta | ilimitado | ilimitado | ilimitado | Customizações, SLA garantido, gerente de conta dedicado |

### Categoria "Mesa/Balcão" (atendimento presencial) — **inclui Autoatendimento desde o plano básico**
| Plano | Preço/mês | PDVs | Usuários | Destaques |
|---|---|---|---|---|
| Balcão Básico | R$249 | 1 | 2 | Controle de mesas/comandas, **Autoatendimento incluso**, KDS, TEF Sitef, "Setup completo" |
| Balcão Gestão (mais popular) | R$399 | 3 | 3 | + produção alimentar, QR code nas mesas, **Autoatendimento**, contrato de cartões grátis |
| Balcão Avançado | R$549 | 4 | 5 | + tablet na mesa, torneira de bebida (Tap), **Autoatendimento**, Smart TEF grátis, facilita NF-e grátis |
| Corporativo | Sob consulta | ilimitado | ilimitado | igual acima |

**Achado central pro benchmark de pricing do Ordin:** o totem/autoatendimento **não é add-on à parte** — vem embutido a partir do plano de entrada (R$249/mês), sem taxa de adesão/setup separada visível na página (aparece literalmente "Setup completo" como item incluso, não cobrado à parte). Isso contradiz a expectativa inicial de "preço de setup" como algo destacado — pelo menos nessa página, não há linha de hardware/setup cobrada separadamente do plano mensal.

## FAQ (respostas capturadas, accordion da página)

**O que é a CPlug?**
"A CPlug é uma empresa que oferece soluções completas para gestão de varejo e food service, incluindo sistemas de PDV (Ponto de Venda), ERP, autoatendimento e controle financeiro, ajudando negócios a operarem de forma mais eficiente."

**Como funciona o sistema de PDV da CPlug?**
"Nosso PDV permite que você registre vendas, controle estoque, emita notas fiscais e gerencie pagamentos de forma rápida e segura. Ele pode ser acessado de qualquer dispositivo, seja um computador, tablet ou smartphone."

**A CPlug possui um sistema de autoatendimento?**
"Sim! Temos soluções de autoatendimento, como totens e tablets, que permitem que os clientes façam pedidos de forma rápida e independente, otimizando o atendimento e reduzindo filas."

**A CPlug tem integração com maquininhas de cartão?**
"Sim! O sistema da CPlug é compatível com diversas adquirentes e maquininhas de cartão, permitindo que você aceite pagamentos com cartão de crédito, débito, PIX e outros métodos." — não citam TEF dedicado x TEF-less, mas a UI de planos lista "TEF Sitef" e "Smart Tef" como itens separados (Smart Tef parece ser o modelo sem pinpad dedicado, à la Stone Connect do SisFood).

(Outras 5 perguntas do FAQ ficaram sem resposta capturada nesta rodada: offline, segmentos atendidos, emissão fiscal, controle financeiro/estoque, app mobile — respostas prováveis já cobertas na seção de funcionalidades acima, não voltei pra clicar todas.)

## Comparação com o Ordin (observações, não recomendação)

- **Modelo de preço único por operação, não por totem**: a mensalidade cobre PDV inteiro + autoatendimento junto, não "R$ X por totem adicional" — se o Ordin cobra ou vier a cobrar por terminal, vale considerar esse contraste (cliente pequeno pagando plano fixo com totem incluso, sem custo marginal por dispositivo dentro do limite de PDVs do plano).
- **TEF Sitef vs Smart Tef**: mesmo padrão de mercado observado no SisFood (TEF dedicado vs solução "smart" sem pinpad separado) — reforça que essa dualidade é expectativa comum do setor, relevante pra análise Stone/PayGo já em andamento (memórias `project_integracao_stone_decidida`, `analise-paygo-modelo-integracao.md`).
- **Hardware flexível (19"-32", tablet ou monitor)** é o mesmo padrão "BYO hardware" do SisFood — parece ser convenção de mercado entre concorrentes menores/médios, não caso isolado.
- Preços listados (R$249-549/mês) são um primeiro dado real de ordem de grandeza pra comparação comercial — útil se o Ordin quiser se posicionar por preço, mas são só 1 concorrente; não generalizar sem cobrir os outros da lista.

## Próximos passos

Fica pendente nesta mesma rodada, por pedido do usuário: Nola, Consumer, Zig, Gototem, PagTotem/PagVendas — mesmo nível de profundidade (FAQ, funcionalidades, tabela de preço, setup), um de cada vez.
