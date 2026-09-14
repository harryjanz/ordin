# Comparativo consolidado — modelo de cobrança dos concorrentes (SaaS, hardware, transação)

Consolida os 8 docs de aprofundamento (`docs/analise-concorrente-{cplug,nola,consumer,zig,gototem,pagtotem,goomer,suitable}.md`) mais SisFood, CardápioWeb e Mogo, com foco específico pedido pelo usuário (2026-09-10): **como cada concorrente estrutura a cobrança** — mensalidade recorrente, custo de hardware/setup, custo marginal por terminal, e taxa de transação — não só "quanto custa". Motivação explícita do usuário: o Ordin é um SaaS onde **custo transacional e de infraestrutura são centrais pro próprio negócio**, então entender a mecânica de cobrança da concorrência (não só o valor final) é insumo direto pra decisão de pricing do Ordin. Ver `docs/project_ordin_concorrentes_referencia` (memória) pra índice geral.

**Atualizado em 2026-09-14** com o 9º concorrente de pricing público, **Genesis PRO** (`docs/analise-concorrente-genesispro.md`) — primeiro fora da rodada original de 8, trazido porque o usuário encaminhou um link de demo. Traz o **4º modelo de "onde o totem entra"** e o **primeiro número concreto de custo marginal específico de totem adicional** (R$99/mês/unidade) — os outros dois números de terminal adicional já registrados (Consumer, SisFood) eram de TEF/PDV, não do totem em si.

## Tabela mestra — todos os preços num lugar só

| Concorrente | Entrada | Meio | Topo | Totem no pricing | Setup | Fidelidade |
|---|---|---|---|---|---|---|
| **CPlug** | R$249/mês | R$399/mês | R$549/mês (+Corporativo sob consulta) | **Incluso desde a entrada** | Grátis (explícito) | Contrato de 1 ano no mensal |
| **Consumer** | R$0 (200 pedidos/mês) | R$59,90 → R$179,90/mês | R$269,90/mês | **Só no topo** (+TEF adicional R$21/ponto) | Grátis (todos os planos) | Sem compromisso anual, garantia 7 dias |
| **Suitable** | R$269/mês | R$368/mês | R$459/mês (+Ultra sob consulta) | **QR só no topo**; Suit Tablet à parte (R$19,90-39,90/mês/unidade, por volume) | Não capturado | Não confirmado (10% off no anual) |
| **Goomer** | R$0 (30 pedidos, só cardápio) | ~R$130-140/mês (cardápio) | ~R$225/mês (cardápio) | **Hardware à parte**, por parceiro terceiro (~R$300/mês via revendedor, não oficial) | N/A (só software) | Não divulgado |
| **Nola** | Sem R$ (até R$40k/mês fat.) | Sem R$ (R$40-150k/mês fat.) | Sem R$ (R$150k+/mês fat.) | **Hardware à parte**, sob consulta, só Profissional+ | Não precificado | 30 dias grátis, sem fidelidade |
| **Zig** | Sob consulta | — | — | Enterprise/evento, não aplicável | Não divulgado | Não divulgado |
| **Gototem** | Sob consulta (WhatsApp) | — | — | Produto próprio, à parte | Não precificado | Não divulgado |
| **PagTotem** | Sob consulta (conta comercial) | — | — | Vem do lado do adquirente | Não divulgado | Não divulgado |
| **SisFood** | ~R$130/mês (base, varia por porte/módulos) | R$130-400/mês (faixa de mercado onde a maioria fica, PDV completo) | R$500-1.500+/mês (multi-loja, totem, balança, franquia) | **Módulo à parte, cobrado por estação física** (sem valor exato publicado) | **Sem taxa de adesão** (cadastro de cardápio é serviço opcional, valor único baixo, não especificado) | Não especificado nesta página (mensalidade "real de mercado" citada como referência, não confirmada como política do SisFood) |
| **CardápioWeb, Mogo** | Fora do escopo original (não pesquisado) | — | — | — | — | — |
| **Genesis PRO** | R$250/mês | R$450/mês | R$650/mês (+ Redes e Expansão sob consulta) | **Gated no topo (R$650) + 1º incluso + adicionais a R$99/mês/unidade** (híbrido inédito) | **Incluso** (~14 dias úteis, treinamento incluso) | Sem fidelidade contratual, cancela quando quiser, exportação de dados garantida |

Atualizado (2026-09-14): **5 concorrentes têm preço público de assinatura** (CPlug, Consumer, Suitable, SisFood, e agora Genesis PRO) — Genesis PRO é o único voltado a **redes/franquia multi-unidade** entre os que publicam tabela completa, e o único com **PDV e usuário ilimitados em todos os planos**, sem custo adicional por quantidade.

Atualizado (2026-09-10, segunda consulta): **4 concorrentes têm preço público de assinatura** (CPlug, Consumer, Suitable, e agora SisFood) — SisFood publica faixa de mensalidade própria (~R$130/mês base) e reconhece explicitamente que **não vende o gabinete físico do totem**, só o software (mesmo modelo "BYO hardware" da Goomer) — o valor de hardware R$4-25k/unidade citado no doc anterior é preço de mercado geral de fornecedores de equipamento, não tabela do SisFood. **Sem cobrança por terminal/PDV adicional dentro da mesma loja** é um diferencial que o SisFood declara explicitamente — primeiro concorrente da pesquisa a confirmar isso por escrito.

## Tabela 1 — Quem expõe preço publicamente, e por quê

| Concorrente | Preço público? | Perfil de venda |
|---|---|---|
| **CPlug** | Sim, tabela completa | Self-service, SMB, assinatura mensal |
| **Consumer** | Sim, tabela completa | Self-service, SMB, freemium |
| **Suitable** | Sim, tabela completa | Self-service, SMB, assinatura mensal |
| **Goomer** | Parcial (só cardápio digital; totem só via blog/terceiro) | Self-service pro cardápio, comercial pro totem |
| **Nola** | Não (faixas de faturamento sem R$; hardware "sob consulta") | Comercial, cliente médio/grande (R$40k+/mês) |
| **Zig** | Não | Comercial/enterprise, evento/arena |
| **Gototem** | Não (orçamento via WhatsApp) | Comercial, B2B regional |
| **PagTotem** | Não (nem está na loja pública do PagBank) | Comercial, varejo grande/supermercado |
| **SisFood** | Não verificado nesta rodada — página de preço/ROI existe (`sisfood.com.br/.../quanto-custa-totem-autoatendimento`) mas não foi visitada | Indeterminado |
| **CardápioWeb**, **Mogo** | Não pesquisado — exclusão deliberada da rodada original (`docs/analise-concorrente-cardapioweb.md`, `docs/analise-concorrente-mogo.md`: "sem análise comercial/pricing aqui", por escopo do usuário na época) | Indeterminado |
| **Genesis PRO** | Sim, tabela completa (`genesis.pro.br/pricing`) | Self-service na forma de venda, mas discurso mira rede/franquia multi-unidade — foge do padrão "preço público = cliente pequeno" |

**Padrão claro:** quanto mais o cliente-alvo é pequeno/self-service (CPlug, Consumer, Suitable), mais o preço é público e mecânico (tabela, cartão de crédito, sem negociação). Quanto mais o cliente é grande/enterprise/evento (Nola, Zig, PagTotem) ou o modelo é B2B tradicional regional (Gototem), menos preço é exposto — a venda é sempre por contato comercial.

**Exceção ao padrão: Genesis PRO** mira rede/franquia (cliente maior que CPlug/Consumer/Suitable), mas ainda assim publica tabela completa até 3 dos 4 planos — só o plano "Redes e Expansão" (o de maior porte, equivalente ao Corporativo da CPlug) vai pra "sob consulta". Sugere que o corte que determina preço público não é só "tamanho do cliente-alvo", mas também **estágio de maturidade comercial do produto**: mesmo mirando rede, a entrada ainda é self-service (cartão de crédito, sem negociação), e só a venda mais enterprise (multi-unidade de verdade) exige contato comercial.

## Tabela 2 — Estrutura da mensalidade recorrente (só quem tem tabela pública)

| Concorrente | Entrada | Meio | Topo | Corte por |
|---|---|---|---|---|
| **CPlug** | R$249/mês | R$399/mês | R$549/mês (+ Corporativo sob consulta) | PDVs/usuários (1→3-4→4-5) |
| **Consumer** | R$0 (grátis, 200 pedidos/mês) | R$59,90 → R$179,90/mês | R$269,90/mês | Nº de PDVs/computadores + funcionalidades |
| **Suitable** | R$269/mês | R$368/mês | R$459/mês (+ Ultra sob consulta) | Funcionalidades (fiscal, comandas, autoatendimento) |
| **Nola** | "Essencial" (sem R$, até R$40k/mês faturamento) | "Profissional" (R$40-150k/mês) | "Premium" (R$150-300k/mês) + "Enterprise" (R$300k+) | **Faturamento do cliente**, não R$ da assinatura — único concorrente com esse modelo |
| **Goomer** (só cardápio, não confirmado p/ totem) | Grátis (30 pedidos) | ~R$130-140/mês | ~R$225/mês | Volume de pedidos + automação |
| **Genesis PRO** | R$250/mês | R$450/mês | R$650/mês (+ Redes e Expansão sob consulta) | Funcionalidades (fiscal, WhatsApp/CRM, delivery → autoatendimento) — **mas PDV e usuário ficam ilimitados em todo plano**, o corte é só por módulo, nunca por quantidade |

**Achado-chave**: Nola é o único concorrente que **precifica pelo faturamento do cliente**, não por funcionalidade/volume de terminal — modelo de "% do tamanho do negócio" em vez de "tamanho do plano". Todos os outros seguem o padrão SaaS clássico de tiers por funcionalidade/quantidade.

## Tabela 3 — Onde o totem/autoatendimento entra no pricing (achado central da rodada)

| Modelo | Concorrentes | Mecânica |
|---|---|---|
| **Incluso desde o plano de entrada** | **CPlug** | Autoatendimento já vem no plano básico pago (R$249/mês), sem cobrança adicional distinta |
| **Gated no plano mais caro (mesma assinatura)** | **Consumer**, **Suitable** | Totem/QR-autoatendimento só desbloqueia no topo do funil de planos (R$269,90 e R$459/mês respectivamente) — cliente paga mais **pela assinatura toda**, não por um add-on separado |
| **Hardware/produto separado, cobrado à parte** | **Nola**, **Goomer**, **Gototem** | Totem é linha de produto/hardware própria, "sob consulta" ou por parceiro terceiro — desacoplado do valor da assinatura de gestão |
| **Precificação por unidade/volume** | **Suitable** (Suit Tablet) | Único caso: preço por terminal com desconto progressivo por quantidade (R$39,90/mês caindo até R$19,90 acima de 41 unidades) — mecânica de "quanto mais totens, menor o custo marginal por unidade" |
| **Vem do lado do adquirente de pagamento** | **PagTotem** | Não é add-on de PDV — é hardware vendido por quem já processa o pagamento do cliente; modelo de bundling oposto (pagamento → hardware, não gestão → pagamento) |
| **Gated no topo + 1º incluso + adicional por unidade a preço fixo (híbrido)** | **Genesis PRO** | Totem só desbloqueia no plano mais caro da assinatura (R$650/mês, igual ao padrão Consumer/Suitable de "só no topo") — mas uma vez destravado, o 1º totem vem incluso e **cada unidade adicional custa R$99/mês fixo**, sem desconto progressivo (diferente do Suitable, onde o preço por unidade *é* o modelo inteiro, decrescente por volume). É o 4º padrão distinto de "onde o totem entra": nem puro "incluso desde a entrada" (CPlug), nem puro "gated sem custo por unidade" (Consumer/Suitable no nível de assinatura), nem puro "hardware separado" (Nola/Goomer/Gototem) — combina gate de assinatura com cobrança marginal por unidade dentro do mesmo plano |
| **Indisponível/não é foco** | **Zig** (evento, não restaurante tradicional), **SisFood** (não verificado) | — |

**Isso responde diretamente à pergunta "por totem, por transação, ou por assinatura?"**: nenhum concorrente pesquisado cobra **por transação processada no totem** como unidade de billing do software em si — o mais perto disso é a taxa de adquirente embutida no pagamento (que é taxa de meio de pagamento, não do SaaS). A cobrança do **software/plataforma** é sempre por: (a) assinatura fixa com o totem incluso/gated, ou (b) preço por unidade de hardware/terminal ativo. **Cobrança por transação, se existe, está um nível abaixo — na taxa de adquirência, não no contrato com o vendor do totem.**

## Tabela 4 — Custo de hardware e setup

| Concorrente | Setup/adesão | Hardware |
|---|---|---|
| **CPlug** | **Explicitamente sem taxa de adesão** ("Setup completo" listado como item incluso no plano) | Flexível (tablet ou monitor 19"-32", BYO) |
| **Consumer** | **Implementação gratuita em todos os planos** | Hardware homologado, não precificado publicamente |
| **Nola** | Implementação 5-10 dias (não precificada à parte) | Totem "sob consulta", hardware vendido à parte — Profissional+ |
| **Suitable** | Não mencionado nesta rodada (FAQ não capturado) | Suit Tablet por assinatura mensal/unidade, sem custo de aquisição citado |
| **Gototem** | Instalação remota com treinamento web (não precificada) | Não detalhado, "fabricação nacional" citada |
| **PagTotem** | Não divulgado | Appliance fechado vendido/negociado via conta comercial — base de sustentação **não acompanha** o equipamento (custo extra implícito) |
| **Goomer** | Não aplicável (só software) | Hardware por parceiro terceiro, fora do contrato com a Goomer |
| **Zig** | Não divulgado (modelo de evento, negociação direta) | Múltiplos modelos (mini, móvel, cashless, ficha) |
| **SisFood** | **Sem taxa de adesão** (explícito); cadastro de cardápio é serviço opcional, valor único "bem mais baixo" (não especificado) | **Não vende gabinete físico** — só software rodando no equipamento do cliente (PC Windows + monitor touch + impressora térmica, BYO); valores de R$4-25k/totem citados no mercado são de fornecedores de hardware terceiros, não do SisFood |
| **Genesis PRO** | **Sem taxa de adesão**, setup incluso na mensalidade — equipe da própria empresa cadastra produtos, monta cardápio, layout e integrações, em média **14 dias úteis**; treinamento incluso | BYO hardware (faixa sugerida R$500-15k, sem obrigação de comprar com eles), roda em Android, Windows **ou sistema operacional proprietário da Genesis** — 3ª opção de SO não vista em nenhum outro concorrente |

**Achado-chave**: entre os que divulgam, a tendência de "zero taxa de setup/adesão" é forte (CPlug e Consumer, os dois com pricing mais transparente, ambos batem nisso como diferencial de marketing). Ninguém publica preço de hardware físico em si — mesmo os que vendem hardware fechado (CPlug, Consumer, PagTotem) tratam o valor do equipamento como parte de negociação comercial, não de tabela.

## Tabela 5 — Custo marginal por terminal/ponto adicional (o dado mais raro da pesquisa)

| Concorrente | Dado encontrado |
|---|---|
| **Consumer** | 1º ponto de totem incluso no plano Alta Performance; **adicionais cobrados separadamente (valor não publicado)**. TEF: 1º ponto incluso, **adicionais R$21,00/ponto** — único valor numérico confirmado de custo marginal por terminal em toda a pesquisa |
| **Suitable** | Suit Tablet: tiers de volume (1-10 → R$39,90; 41+ → R$19,90 por unidade/mês) — não é "adicional sobre um incluso", é o preço da unidade em si, decrescente por escala |
| **CPlug** | PDVs adicionais fazem parte da diferença entre planos (1→3→4 PDVs), não há preço avulso por PDV extra divulgado |
| **SisFood** | **Zero** — declara explicitamente "não há cobrança por terminal adicional na mesma loja"; 3 PDVs no mesmo CNPJ pagam o mesmo que 1. Cobrança por unidade só aparece pro **totem** especificamente ("quase sempre cobrados à parte por estação física", sem valor) e pra multi-loja (CNPJs diferentes → estrutura de franquia) |
| **Genesis PRO** | **R$99,00/mês por totem adicional**, valor fixo (sem escalonamento por volume) — 1º totem já incluso no plano de R$650/mês. **Primeiro número concreto de custo marginal específico de totem** encontrado em toda a pesquisa (Consumer e SisFood tinham números, mas de TEF/PDV, não do totem em si) | PDV comum: **zero**, ilimitado em todo plano — mesmo padrão SisFood, mas Genesis PRO estende isso pra usuário também |
| Demais | Sem dado público |

**Três números confirmados de mercado pra "quanto custa escalar terminais"**: R$21,00/ponto de TEF adicional (Consumer), **R$0 por PDV adicional na mesma loja** (SisFood e agora também Genesis PRO, ambos só pra PDV comum), e **R$99,00/mês por totem adicional, valor fixo** (Genesis PRO — primeiro número público de custo marginal do totem em si, não de PDV ou TEF). Isso completa a distinção que antes só era sugerida: "terminal de PDV comum" tende a ser gratuito/incluído dentro de um limite, enquanto "estação de totem" quase sempre é item à parte — e agora há, pela primeira vez, um valor de mercado real pra essa segunda categoria.

## Taxas de transação (pagamento) — o dado mais opaco de todos (atualizado após segunda consulta ao SisFood)

**Nenhum concorrente pesquisado publica uma taxa % de transação própria e confirmada, vinculada ao uso do totem/PDV.** Mas a segunda consulta ao SisFood (página `quanto-custa-sistema-restaurante`, 2026-09-10) traz o primeiro indício concreto de que **a prática existe no mercado, mesmo que sem número público**:

> "TEF dedicado: quando o restaurante quer TEF integrado (não a maquininha solta), entra taxa fixa do módulo e, **em alguns casos, taxa por transação**."

Isso é conteúdo do próprio SisFood descrevendo o mercado em geral (não necessariamente a política de preço do SisFood pra si mesmo) — mas é a **primeira menção explícita, em qualquer fonte da pesquisa, de que cobrança por transação no nível do módulo de PDV/TEF é uma prática real**, não só teórica. Matiza a conclusão anterior: não é que "ninguém faz isso" — é que **ninguém publica o número**, o que é uma lacuna de transparência ainda maior do que parecia (uma prática existente, mas sistematicamente não divulgada).

Outros pontos:
- **CPlug/SisFood**: mencionam TEF dedicado (Sitef) vs. modelo "Smart"/"Connect" sem pinpad separado — nenhuma taxa % é citada além da menção genérica acima.
- **PagBank (contexto geral, não específico do PagTotem)**: taxas de maquininha (débito a partir de 1,69%, crédito à vista a partir de 0,58%, crédito parcelado 3,98%-23,78% dependendo do plano de recebimento) — são taxas do **adquirente PagBank em geral**, não confirmadas como as taxas cobradas especificamente via PagTotem.
- **Goomer**: "flexibilidade de adquirente" no Totem Mini sugere que a taxa de transação é definida pelo adquirente que o cliente escolher conectar, não pela Goomer.
- **SisFood — módulo de integração com maquininha** (Stone/PagBank/Cielo): "alguns sistemas cobram por máquina conectada, outros cobram um valor único pelo módulo" — faixa R$30-90/mês — de novo, é taxa fixa de módulo, não % por transação, mas mostra que "por máquina conectada" (ou seja, por terminal) é outro eixo de cobrança usado no mercado.

**Conclusão revisada pro Ordin**: a taxa de transação **pode existir** em alguns modelos de TEF dedicado do mercado, mas é sistematicamente **opaca** — nenhum concorrente pesquisado publica o percentual. O que continua confirmado é que a cobrança do **software/PDV em si** (a mensalidade da plataforma) é desacoplada da cobrança de adquirência na esmagadora maioria dos casos — a exceção seria um módulo de TEF dedicado específico, que o SisFood sinaliza existir no mercado sem nomear quem cobra dessa forma. Isso segue consistente com o modelo multi-adquirente do Ordin (`docs/analise-dashboard-concorrentes-mercado.md`), mas com uma ressalva: vale considerar, ao decidir o próprio modelo do Ordin, que "taxa por transação no módulo de TEF" não é hipótese exótica — é prática de mercado reconhecida, só não documentada publicamente por nenhum concorrente.

## Tabela 6 — Fidelidade de contrato

| Concorrente | Modelo |
|---|---|
| **CPlug** | Contrato de 1 ano no mensal (desconto no anual à vista) |
| **Consumer** | **Sem compromisso anual**, garantia 7 dias/dinheiro de volta |
| **Nola** | **30 dias grátis, "cancele quando quiser"** |
| **Suitable** | Desconto de até 10% no anual, parcelamento do anual exige saldo em cartão — fidelidade não confirmada no FAQ (não capturado) |
| **Genesis PRO** | **Sem fidelidade contratual**, cancela a qualquer momento, com exportação de dados garantida — mesmo padrão de baixo atrito de Consumer e Nola |
| Demais | Não divulgado |

Dois padrões opostos coexistem: CPlug aposta em contrato de 1 ano (típico de venda mais consultiva/instalação física), enquanto Consumer e Nola competem por baixo atrito (mês a mês, garantia de reembolso) — sinal de que ambos os modelos têm tração no mercado brasileiro de food service, não há convergência.

## Síntese pra decisão de pricing do Ordin (observações, não recomendação)

Isto é levantamento de mercado, não uma proposta de modelo pro Ordin — decisão de pricing é do usuário. Pontos que a pesquisa deixa mais claros pra essa conversa, se/quando ela acontecer:

1. **"Cobrar por transação" tem precedente de mercado reconhecido, mas nenhum número público** — o próprio SisFood confirma que módulos de TEF dedicado "em alguns casos" cobram taxa por transação, além da taxa fixa do módulo. Não é hipótese sem precedente; é prática real, só sistematicamente não divulgada por nenhum concorrente pesquisado. Se o Ordin quiser cobrar por transação no nível do software (separado da taxa de adquirência), estaria testando algo que o mercado pratica mas nunca expõe — pode ser oportunidade de diferenciação pela transparência, ou reforçar por que ninguém publica (resistência do cliente a esse modelo específico).
2. **4 modelos concretos de "onde o totem entra"** (incluso no básico / gated no topo sem custo por unidade / hardware separado / **gated no topo + cobrança fixa por unidade adicional**, este último só a Genesis PRO) — o Ordin já tem o totem como produto central (não add-on), o que o aproxima mais do modelo CPlug do que dos demais.
3. **Setup grátis é diferencial ativo de 3 dos 5 concorrentes com pricing mais transparente** (CPlug, Consumer, e agora Genesis PRO) — se o Ordin cobra ou pretende cobrar setup, esse é um contraponto de mercado a considerar, reforçado pelo terceiro caso.
4. **Custo marginal por terminal deixou de ser um dado totalmente escasso** — Consumer (R$21/ponto TEF), SisFood (R$0 por PDV extra na mesma loja) e agora **Genesis PRO (R$99/mês por totem adicional, o primeiro valor específico de totem, não de TEF/PDV)** publicam algo concreto. Ainda é lacuna de transparência do setor (a maioria não publica), mas o Ordin já tem 3 pontos de referência de mercado pra calibrar uma eventual cobrança marginal, incluindo agora um número direto de "totem adicional" — o item que mais faltava.
5. **Multi-adquirente segue sendo diferencial raro** — confirmado de novo nesta rodada mais profunda (só a Goomer chegou perto, e só num modelo específico de hardware). Genesis PRO tem parceria oficial com a Stone, mas isso é o oposto de multi-adquirente — reforça, não enfraquece, a raridade do diferencial do Ordin.
6. **Foco em rede/franquia multi-unidade é um ângulo comercial não visto nos 8 concorrentes originais** — Genesis PRO é o primeiro a construir a proposta de valor em cima de padronização entre lojas e comparação de desempenho entre unidades. Se o Ordin mirar clientes com múltiplas unidades no futuro, esse é o benchmark de pricing e produto mais próximo mapeado até agora.

## Fontes

Dados dos 8 docs de aprofundamento publicados na sessão original (2026-09-10): `docs/analise-concorrente-cplug.md`, `docs/analise-concorrente-nola.md`, `docs/analise-concorrente-consumer.md`, `docs/analise-concorrente-zig.md`, `docs/analise-concorrente-gototem.md`, `docs/analise-concorrente-pagtotem.md`, `docs/analise-concorrente-goomer.md`, `docs/analise-concorrente-suitable.md` — mais uma segunda consulta específica de pricing ao SisFood (páginas `quanto-custa-totem-autoatendimento` e `quanto-custa-sistema-restaurante`, ambas `sisfood.com.br`, visitadas depois da primeira versão deste comparativo) que preencheu a lacuna original de preço do SisFood. CardápioWeb e Mogo seguem sem dado de cobrança (fora do escopo original dessas pesquisas, `docs/analise-concorrente-cardapioweb.md`, `docs/analise-concorrente-mogo.md`).

Adicionado em 2026-09-14: `docs/analise-concorrente-genesispro.md`, a partir de link de demo enviado pelo usuário (`lp.profranchising.com.br/solicitar-demo`), aprofundado com o site institucional `genesis.pro.br` e sua página `/pricing`.
