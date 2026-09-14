# Custo transacional oculto — como a concorrência monetiza depois da assinatura

Pesquisa dirigida (2026-09-10) a partir de uma observação do usuário: fornecedores mais "profissionais" de totem (hardware próprio, R$7-15 mil/unidade, setup caro) foram encontrados em navegação própria, e a preocupação levantada foi — não faz sentido cobrar mensalidade barata se o cliente compensa isso pagando caro por transação num volume alto. Complementa `docs/analise-concorrentes-modelo-cobranca-totem.md` (que já tinha identificado a taxa de transação como "o dado mais opaco de todos"), agora indo atrás especificamente de **como** esse custo fica oculto até a contratação efetiva.

## O mecanismo confirmado: PDV/totem "barato" se paga na maquininha, não na mensalidade

Achado central, com número real (fonte: bananasoft.ai, comparando um PDV "gratuito" de mercado contra um plano pago de referência):

> "A gratuidade vale enquanto o comerciante usar a maquininha ou o PIX QR Code do próprio fornecedor."

**Exemplo numérico do artigo**, pra um negócio faturando R$20 mil/mês com 60% em cartão (R$12 mil) e MDR de 3%:

| | PDV "grátis" | PDV pago de referência |
|---|---|---|
| Mensalidade | R$0 | R$90/mês |
| MDR forçada (3% sobre R$12k) | R$360/mês | R$0 (adquirente livre) |
| **Custo real mensal** | **R$360+** | **R$90** |

Ou seja: o PDV "grátis" custa **4x mais** que o pago, só que o custo aparece diluído em cada venda, nunca como uma linha visível na fatura mensal — exatamente o "custo oculto até a contratação efetiva" que você descreveu. Em volume mais alto, a distância só cresce (é proporcional ao faturamento em cartão, não ao tamanho do restaurante em si).

## Confirmação de que isso não é hipotético — achado dentro do próprio catálogo da Goomer

A pesquisa anterior (`docs/analise-concorrente-goomer.md`) já tinha registrado o **Totem Mini** da Goomer vendendo "flexibilidade de adquirente" como diferencial. Uma segunda camada, encontrada agora: o **Totem Mini Clover** (outro SKU de hardware, mesma empresa) **opera de forma exclusiva com a adquirente BIN (Fiserv)** — sem a mesma liberdade do Mini. Achado direto de busca, confirmado em múltiplas fontes (SindRio, MobileTime, site da própria BIN).

Isso mostra o padrão na prática, dentro de um único fornecedor: **o modelo de hardware que o cliente escolhe determina se ele fica preso a uma adquirente ou não** — e a página de venda do totem "livre" (Mini) usa linguagem de libertação ("fuja das altas taxas", "flexibilidade total") sem nunca citar % de taxa concreta nem comparar contra o modelo Clover da própria casa. A escolha de qual SKU comprar é, na prática, a escolha de ficar preso ou não — e isso não é destacado na página de vendas.

## Segundo caso do mesmo padrão dual: Genesis PRO e a parceria com a Stone (2026-09-14)

O levantamento do Genesis PRO (`docs/analise-concorrente-genesispro.md`, motivado por um link de demo enviado pelo usuário) encontrou uma estrutura parecida com o par Mini/Mini Clover da Goomer, só que descrita de forma mais explícita na própria página institucional: o site anuncia **"parceria oficial com a Stone"** pra pagamento integrado (a maquininha imprime e processa direto no PDV/totem) — e, numa frase separada, menciona **TEF genérico "com todas as principais adquirentes"** como caminho alternativo.

Isso é o mesmo formato dual já visto em outros concorrentes (TEF Sitef vs. "Smart TEF" no CPlug/SisFood): um caminho **integrado/nativo com uma adquirente específica** e um caminho **TEF multi-adquirente mais genérico**. A diferença é que aqui a adquirente nomeada nominalmente é a Stone, publicada como parceria oficial de marketing — o que sugere (sem confirmar) que o caminho "integrado" tende a empurrar o cliente pra Stone especificamente, enquanto o caminho "TEF genérico" preserva a liberdade de escolha.

**Não foi possível confirmar nesta rodada** se escolher a via "integrada com a Stone" no Genesis PRO tranca o cliente na Stone (igual ao Mini Clover da Goomer com BIN/Fiserv) ou se é só uma opção padrão recomendada, sem exclusividade real — a página não detalha se o TEF genérico multi-adquirente está disponível dentro do mesmo plano/hardware ou exige outro SKU. Fica registrado como um segundo indício (não uma terceira confirmação) de que a dualidade "parceria de pagamento anunciada + TEF genérico à parte" é padrão recorrente no setor, não coincidência isolada da Goomer.

## Por que o número nunca aparece publicado — não é sonegação, é estrutura de negociação

O comparativo honesto de maquininhas do SisFood (`sisfood.com.br/.../maquininha-cartao-restaurante-comparativo`) deixa isso explícito:

> "Restaurante que fatura R$50 mil/mês e que negocia R$300 mil/mês não recebe a mesma proposta da adquirente."

MDR é **negociado por volume, caso a caso** — não existe uma tabela fixa que o fornecedor possa publicar mesmo se quisesse, porque o número muda conforme o cliente. Isso explica estruturalmente por que nenhum dos 8 concorrentes da rodada anterior publicou taxa de transação: não é só opacidade proposital, é que a informação **não existe como número único** até a adquirente cotar aquele cliente específico. É informação que só se materializa depois da contratação, por definição do próprio modelo de negócio da adquirência.

## Faixas reais de MDR (referência de mercado, não específicas de nenhum totem)

Do mesmo comparativo SisFood, cruzando Stone/Cielo/PagBank/Rede:

| Taxa | Faixa típica |
|---|---|
| Débito | 0,79% a 2% |
| Crédito à vista | 2,49% a 4,5% |
| Vale-refeição/alimentação (VR/VA) | Acima do crédito, **quase nunca coberto por campanha "taxa zero"** |

Nota importante: essas são taxas do **adquirente** (Stone, Cielo, PagBank, Rede), não do fornecedor de PDV/totem. O fornecedor de PDV não cobra essa taxa — ele só ganha (ou não) o poder de **forçar qual adquirente processa**, e a adquirente escolhida é quem efetivamente cobra o MDR. O lock-in do software é o que determina se o restaurante consegue negociar essa taxa livremente ou fica preso ao que o fornecedor pré-configurou.

## Uma segunda fonte de custo oculto, não relacionada a lock-in: antecipação automática

Achado adicional relevante pro mesmo tema (mesmo comparativo SisFood), independente de qual adquirente o cliente usa:

> Restaurante com R$200 mil de faturamento mensal, 60% no cartão de crédito = R$120 mil. Antecipação automática a 2,5% ao mês sobre esse valor = **R$3.000/mês** que somem do lucro. Em 12 meses, **R$36 mil** — equivalente a um funcionário.

Antecipação automática (receber o crédito parcelado antes do D+30) costuma vir **ligada por padrão** em muitas maquininhas — o restaurante paga o percentual sem decidir conscientemente, porque nunca desligou a opção. Diferente do lock-in de adquirente (que é sobre "quem processa"), esse é um custo que existe **mesmo com a melhor adquirente do mercado**, e também só aparece no fechamento do mês, nunca numa página de preço.

## Cruzando com o que já tínhamos (`docs/analise-concorrentes-modelo-cobranca-totem.md`)

O achado de que o SisFood menciona "TEF dedicado... em alguns casos, taxa por transação" (registrado no comparativo anterior) se encaixa exatamente neste mecanismo: **o módulo de TEF dedicado é o ponto de alavancagem** onde o fornecedor de PDV pode inserir uma taxa por transação (dele mesmo, por cima do MDR da adquirente) ou simplesmente forçar uma adquirente específica que já tem margem combinada com o fornecedor por trás — dois jeitos técnicos diferentes de chegar no mesmo resultado: **o cliente com alto volume de transação custa mais do que a mensalidade sozinha sugere**.

## Por que isso bate com o perfil "profissional, R$7-15 mil/totem, setup caro" que você encontrou

O padrão de mercado que apareceu nas pesquisas anteriores (`docs/analise-concorrentes-sisfood-totem-autoatendimento.md`, tabela de faixas de preço) já tinha hardware de totem "chão premium" em R$12-18 mil e "premium personalizado" em R$18-25 mil+ — bate com a faixa que você descreveu. A hipótese mais consistente com tudo que a pesquisa encontrou: fornecedores que vendem **hardware caro + setup caro** têm menos pressão de recuperar margem via mensalidade recorrente baixa e visível (o cliente já pagou um ticket alto na entrada) — mas isso **não é garantia de que não haja também lock-in de adquirente por trás**. O caso Goomer Mini vs. Mini Clover mostra que os dois modelos (hardware caro + mensalidade + possível lock-in de adquirente) não são mutuamente exclusivos — podem coexistir no mesmo fornecedor, dependendo do SKU vendido.

**Não foi possível confirmar nesta rodada, pra nenhum fornecedor específico de R$7-15k, se ele soma lock-in de adquirente em cima do hardware caro** — os sites de venda de hardware puro (não pesquisados nominalmente aqui) tendem a não publicar essa informação tão claramente quanto os SaaS auto-contratáveis (CPlug, Consumer, Suitable) publicam seus planos. Se for importante confirmar um fornecedor específico que você encontrou, vale trazer o nome pra pesquisa dirigida.

## Implicação pro Ordin — observação, não recomendação

O modelo multi-adquirente do Ordin (já confirmado como diferencial raro em `docs/analise-dashboard-concorrentes-mercado.md` e reconfirmado nesta rodada) é estruturalmente **imune ao mecanismo de lock-in de adquirente** descrito acima — o cliente do Ordin não pode ser silenciosamente empurrado pra uma adquirente com margem escondida, porque a escolha é do cliente. Isso é a resposta direta à preocupação que você levantou: **o Ordin já não tem esse buraco específico**, estruturalmente, pela arquitetura de multi-provedor já existente.

O caso Genesis PRO (2026-09-14) reforça que essa estrutura dual "parceria de pagamento nomeada + TEF genérico" não é peculiaridade de um fornecedor só — apareceu de forma independente em dois concorrentes (Goomer/BIN-Fiserv, Genesis PRO/Stone), com nível de confirmação diferente (Goomer: lock-in confirmado por fontes externas; Genesis PRO: parceria declarada, exclusividade não confirmada). Não muda a conclusão sobre o Ordin, só fortalece a evidência de que o padrão é estrutural do setor, não coincidência.

O que a pesquisa não responde, e fica como pergunta em aberto pro próprio negócio do Ordin: **antecipação automática de recebíveis** é um mecanismo independente do lock-in de adquirente — existe mesmo em contas bem negociadas — e não foi verificado neste levantamento se/como isso é tratado no fluxo do `payment-service` do Ordin hoje. Se for relevante, é uma pergunta separada de arquitetura/produto, não de concorrência.

## Fontes

- `bananasoft.ai/blog/pdv-gratuito-sai-mais-caro-que-pago` — exemplo numérico do mecanismo de MDR forçada
- `goomer.com.br/blog/mini-totem-2-0-goomer`, `sindrio.com.br`, `mobiletime.com.br`, `bin.com.br` — confirmação do lock-in do Totem Mini Clover (BIN/Fiserv) vs. liberdade do Totem Mini
- `sisfood.com.br/saiba-mais/gestao-financeira/maquininha-cartao-restaurante-comparativo` — faixas reais de MDR por adquirente, mecanismo de antecipação automática, explicação de por que a taxa é negociada por volume
- `genesis.pro.br` (home institucional) — parceria oficial com a Stone + menção de TEF genérico multi-adquirente, achado de 2026-09-14 que motivou a seção "Segundo caso do mesmo padrão dual"
