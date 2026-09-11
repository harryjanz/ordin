# Estimativa de custo unitário de infra AWS — baseline fixo + marginal por transação

Pesquisa e estimativa (2026-09-10), motivada pela discussão de pricing transacional (`docs/analise-custo-transacional-oculto-concorrentes.md`, memória `project_ordin_estrategia_pricing_transacional`). **É projeção, não medição** — a infra AWS do Ordin está deliberadamente adiada (`project_infra_aws_adiada`, `docs/ARQUITETURA.md` §9: "nada nesta seção existe hoje — sem conta AWS provisionada"), então não existe fatura real pra consultar. A base é a arquitetura-alvo já documentada (`docs/ARQUITETURA.md`) + preços públicos de lista da AWS, ajustados pra região São Paulo.

## Metodologia e premissas (leia antes de usar os números)

- **Região:** sa-east-1 (São Paulo). Não consegui puxar a tabela de preço região-específica diretamente — a AWS não publica todas as taxas de sa-east-1 de forma acessível via busca simples. Usei preços de lista **us-east-1** como base e apliquei um **markup de ~50-60%**, faixa documentada publicamente pra sa-east-1 em compute/RDS/EBS (fontes: discussão técnica histórica da AWS sobre São Paulo custar ~36-59% mais que N. Virginia em EC2/RDS, ~90% mais em EBS, ~200% mais em transferência de dados). **Isso é aproximação, não cotação** — antes de fechar qualquer número de pricing pro cliente final, rodar o AWS Pricing Calculator com a região certa.
- **Câmbio de referência:** R$5,40/USD — ajustar pro câmbio do momento em que a decisão for tomada.
- **Arquitetura considerada:** exatamente o que está em `docs/ARQUITETURA.md` §9 — Kong (mín. 2 tasks) + 5 microsserviços (auth, company, catalog, order, payment — `notification-service` fica de fora, é "pós Fase 3") + Aurora Serverless v2 + RDS Proxy + ElastiCache Redis + SQS FIFO/Standard + ALB + WAF + NAT Gateway. Sizing de CPU/memória por task é **suposição própria** (não há `task_definitions.tf` com sizing real ainda — só o wiring de secrets existe).
- **"ECS básico com escalonamento"** = min 1 task por microsserviço (min 2 pro Kong, conforme já diretriz do doc), autoscaling por CPU/memória pra cima quando necessário. Isso é o cenário de baseline — não é o dimensionamento final de produção.
- Datadog (sidecar em todo task, por diretiva do `ARQUITETURA.md` §10) é custo real de observabilidade mas **não é cobrança AWS** — fica fora da tabela AWS, mencionado à parte.

## Achado central: o custo AWS é quase todo fixo — a parte variável por transação é irrisória

Isso muda a pergunta original. Não é "quanto a AWS cobra por transação" — é **"quanto custa manter a plataforma no ar, dividido por quantas transações passam por ela"**. A parte que realmente varia linearmente com volume de transação (SQS, LCU incremental do ALB, ingestão de log, transferência de dados) fica na casa de **R$0,0002 por transação** — abaixo de qualquer centavo. O que domina a conta é o **baseline fixo**, que só sobe em degraus quando a plataforma precisa escalar (mais tasks ECS, mais ACU no Aurora), não de forma suave por transação.

## Custo fixo mensal (baseline, plataforma inteira — compartilhado entre TODOS os clientes/totens)

| Componente | Sizing assumido | Estimativa USD/mês | Observação |
|---|---|---|---|
| ECS Fargate — 5 microsserviços | 0,5 vCPU / 1GB cada, min 1 task | ~$135 | auth, company, catalog, order, payment |
| ECS Fargate — Kong | 1 vCPU / 2GB, min 2 tasks (diretriz do `ARQUITETURA.md`) | ~$108 | gateway único de entrada |
| Aurora Serverless v2 (compute) | 1 ACU sustentado (baseline conservador) | ~$140 | maior variável de incerteza — precisa validar com carga real |
| Aurora Serverless v2 (storage) | ~20GB total (5 schemas) | ~$3 | cresce devagar |
| RDS Proxy | menor unidade | ~$20 | estimativa de baixa confiança — não achei tabela sa-east-1 |
| ElastiCache Redis | 1 nó pequeno (cache.t4g.micro), sem réplica | ~$19 | rate limiting + blacklist de token |
| NAT Gateway | 1 gateway + processamento baixo | ~$55 | necessário pra serviços em subnet privada acessarem internet (PayGo, adquirentes) |
| ALB | base + LCU baixo | ~$34 | ponto de entrada único, atrás do Kong |
| WAF | Web ACL + ~10 regras OWASP | ~$15 | por diretriz de segurança do `ARQUITETURA.md` |
| Route 53 | 1 hosted zone | ~$0,50 | — |
| Secrets Manager | ~10 secrets | ~$4 | DB URLs ×5, JWT, QR, Internal, PayGo, DD key |
| KMS | ~3 chaves | ~$3 | Aurora, S3, Secrets |
| CloudWatch Logs | ingestão baseline | ~$12 | complementar ao Datadog |
| ECR | poucas imagens | ~$2 | — |
| **Total estimado** | | **~$550/mês** | **≈ R$2.970/mês** (câmbio de referência) |

Esse número é o custo de **manter a plataforma inteira no ar**, não por totem e não por cliente — é infra compartilhada, multi-tenant. Um totem a mais não soma uma fração proporcional desse baseline; ele só soma tráfego, que é a parte marginal (próxima seção).

## Custo marginal real por transação (a parte que de fato varia com volume)

Definindo "1 transação" = 1 pedido completo (criação → pagamento → coleta dos tickets, ~3 unidades em média):

| Componente | Estimativa por transação | Cálculo |
|---|---|---|
| SQS (FIFO + Standard, ~10 requisições/transação: publish + consume de `payment.*`, `order.created`, `ticket.collected`) | ~$0,0000055 | ~10 req × ~$0,55/milhão (blend FIFO/Standard, sa-east-1 estimado) |
| ALB (LCU incremental, ~6 requisições/transação) | ~$0,0000036 | ~6 req × ~$0,60/milhão (regra de bolso pro componente de novas conexões) |
| CloudWatch Logs (ingestão, ~20KB/transação) | ~$0,0000152 | 0,00002GB × ~$0,76/GB (sa-east-1 estimado) |
| Transferência de dados (payloads JSON pequenos) | ~$0,000005 | estimativa conservadora |
| **Total marginal** | **~$0,0000293/transação** | **≈ R$0,00016/transação** |

**Isso é o achado mais importante pra decisão de pricing**: o custo AWS que de fato varia por transação é **~R$0,00016** — quase 700x menor que os R$0,10/transação que você cogitou como piso da tabela. Uma taxa de R$0,10/transação **não precisa** de justificativa de custo de infra variável — ela é, na prática, quase 100% margem sobre o custo AWS marginal.

## Cenários de volume — como o custo por transação realmente se comporta

Aqui está a curva que sustenta (ou não) a lógica de "taxa decrescente por volume", olhando só pro custo real (não pro preço cobrado):

| Volume/mês (plataforma inteira) | Baseline fixo estimado | Custo médio por transação (baseline ÷ volume + marginal) |
|---|---|---|
| 5.000 | $550 | ~$0,110 ≈ R$0,594 |
| 30.000 | $550 | ~$0,0183 ≈ R$0,099 |
| 100.000 | $550 | ~$0,0055 ≈ R$0,030 |
| 500.000 | ~$750 (Aurora provavelmente precisa subir p/ 2 ACU, mais 1-2 tasks ECS) | ~$0,0015 ≈ R$0,008 |
| 2.000.000 | ~$1.200 (mais um degrau de escala) | ~$0,0006 ≈ R$0,003 |

**O formato real da curva é "dente de serra decrescente"**, não uma reta suave: o custo por transação cai enquanto o volume cresce dentro da capacidade do baseline atual, mas dá um salto pra cima toda vez que a plataforma precisa subir um degrau de escala (mais ACU no Aurora, mais tasks ECS) — depois volta a cair. Isso é consistente com a ideia de "ganhar no volume", mas o motivo real não é "a AWS cobra menos por transação em alto volume" (ela não cobra quase nada por transação em qualquer volume) — é que **o custo fixo se dilui por mais transações**. A tabela de preço decrescente que você cogitou reflete bem essa lógica, só que a folga entre custo real e preço cobrado é gigante em qualquer ponto da curva.

## O que isso muda na conversa sobre a tabela de R$0,10/transação

1. **R$0,10/transação está muito acima do custo AWS marginal em qualquer volume** — mesmo nos 5.000/mês mais caros por transação (R$0,594 de custo médio incluindo baseline), a maior parte do custo é a plataforma existir, não a transação em si. Em qualquer volume razoável de operação (dezenas de milhares/mês), o custo real por transação já está na casa de centavos ou menos.
2. **A tabela decrescente não precisa ser calibrada pelo custo AWS** — ele é baixo demais pra ser o fator limitante. A calibragem certa é por **estratégia de captura de valor** (o que você já tinha identificado: ganhar no volume), não por engenharia de custo.
3. **O verdadeiro risco de custo não é "por transação", é "quando a plataforma precisa escalar"** — os degraus (Aurora subindo ACU, mais tasks ECS) são o que efetivamente muda o custo real. Vale desenhar a tabela de preço pensando nesses pontos de ruptura de capacidade, não em uma curva matematicamente contínua.
4. **Datadog (fora da tabela AWS) pode pesar proporcionalmente mais que a AWS em si** em alguns modelos de pricing por host/container — não quantificado aqui, mas vale um levantamento separado se a análise de custo total for aprofundada.

## Região mais barata fora de São Paulo — e o motivo pra provavelmente não valer a pena

Não existe outra região AWS na América do Sul além de sa-east-1 — "sair de SP" significa necessariamente sair do continente. A região mais barata da AWS de forma geral é justamente a que usei como base, **us-east-1 (N. Virginia)** — é a referência de preço de lista que a própria AWS usa, e outras baratas (us-east-2 Ohio, us-west-2 Oregon) ficam bem próximas dela, sem diferença relevante.

Recalculando o baseline fixo sem o markup de São Paulo (revertendo pros preços de lista us-east-1 usados como referência nesta estimativa):

| | sa-east-1 (São Paulo) | us-east-1 (N. Virginia) | Diferença |
|---|---|---|---|
| Baseline fixo mensal | ~$550 (≈ R$2.970) | ~$362 (≈ R$1.955) | **~34% mais barato** |

A economia é real, mas **não é o mesmo ~50-60% que o markup de compute/RDS sugere isoladamente** — porque parte da fatura (WAF, Route 53, Secrets Manager, KMS) não varia por região, então o desconto se dilui na média.

**Por que isso provavelmente não compensa pro Ordin, apesar da economia:** o `docs/ARQUITETURA.md` já tem um SLO comprometido — **latência Kong p95 < 200ms** (§10). A latência de rede só de ida e volta entre Brasil e us-east-1 (N. Virginia) fica tipicamente entre **110-150ms**, antes de qualquer processamento de fato acontecer no serviço. Pra um totem fazendo pedido/pagamento em tempo real (e o WebSocket de `order-service` que depende de latência baixa pra "tempo real" fazer sentido), isso consome a maior parte ou estoura o orçamento de latência já assumido como meta — economizar ~34% em infra pra colocar em risco um SLO que já está na diretiva de arquitetura é uma troca que pesa contra a mudança, não a favor.

Se o assunto voltar à tona, o caminho mais realista pra reduzir custo sem sacrificar latência não é trocar de região, e sim otimizar dentro de sa-east-1 (Reserved/Savings Plans no Fargate, ajuste fino do sizing depois de teste de carga real, Aurora com auto-pause em ambientes não-produtivos).

## Proposta de tabela de preço por volume transacional — calibrada pra pequeno/médio cliente

Decisão do usuário (2026-09-10): manter em sa-east-1 pela latência, montar a tabela de taxa decrescente por volume, **pensando especificamente em clientes pequenos e médios** — não em redes grandes. Isso muda a calibragem: 30.000 transações/mês (número inicialmente cogitado como teto do primeiro degrau) é, na prática, **volume de operação grande** — quase 1.000 pedidos/dia — não pequeno/médio. Recalibrei usando a régua de dimensionamento de mercado já levantada (`docs/analise-concorrentes-sisfood-totem-autoatendimento.md`), que serve de âncora concreta do que cada faixa de pedido/dia representa em número de totens:

| Pedidos/dia | Transações/mês (×30) | Perfil (segundo a régua de mercado) |
|---|---|---|
| 30-60 | 900-1.800 | Pequeno — 1 totem |
| 60-120 | 1.800-3.600 | Pequeno-médio — 1-2 totens |
| 120-250 | 3.600-7.500 | Médio — 2-4 totens |
| 250+ | 7.500+ | Médio-grande / início de rede — 4-6+ totens |

Isso é **proposta de preço, não custo** — decisão de negócio, calibrada pela estratégia já registrada de "ganhar no volume" (`project_ordin_estrategia_pricing_transacional`), usando o custo AWS só como piso de sanidade (ele é baixo demais pra ser o fator limitante, como já estabelecido acima). Tabela recalibrada pro range real de pequeno/médio, mantendo R$0,10 como âncora de preço (não como teto de faixa):

| Faixa de transações/mês (por empresa) | Perfil equivalente | Preço/transação | Receita no teto da faixa |
|---|---|---|---|
| 0 – 1.000 | Pequeno iniciante, abaixo de 1 totem em uso pleno | R$0,12 | R$120 |
| 1.001 – 3.000 | Pequeno padrão (1-2 totens) | R$0,10 | R$300 |
| 3.001 – 7.500 | Médio (2-4 totens) | R$0,08 | R$600 |
| 7.501 – 15.000 | Médio-grande (4-6+ totens, ou pequena rede de 2-3 unidades) | R$0,06 | R$900 |
| 15.000+ | Já fora do "pequeno/médio" — porta de saída pro segmento de rede/grande conta | R$0,04 (ou negociação) | — |

**Degraus e valores são ponto de partida pra discussão, não fechados** — o critério foi ancorar cada faixa num perfil real de operação (via a régua de totens do SisFood), não em números redondos arbitrários. R$0,10 fica no meio da faixa, como preço "padrão" de um cliente pequeno típico, em vez de piso da tabela inteira.

### Por que o corte de 30.000 não fazia sentido pro segmento-alvo

O baseline fixo da plataforma (~R$2.970/mês) dividido por R$0,10 dá ~29.700 transações — só que **nenhum cliente pequeno/médio típico chega perto disso sozinho** (mesmo o perfil "médio-grande" da régua, 250+ pedidos/dia, fica em ~7.500/mês, menos de um terço do que seria preciso). Isso não invalida a estratégia de "ganhar no volume" — só confirma que, pro segmento pequeno/médio que é o foco do Ordin, **a receita transacional de um cliente individual nunca vai cobrir sozinha o baseline da plataforma** — quem cobre é a soma de muitos clientes pequenos/médios simultâneos, mais a mensalidade fixa por totem (outra fonte de receita, fora do escopo desta tabela). É o modelo esperado de um SaaS multi-tenant: nenhum cliente pequeno "paga a própria fatia de servidor" isoladamente.

### Margem em cada faixa (referência, não é custo real por empresa)

Como o custo AWS marginal por transação é ~R$0,00016 (achado da seção anterior), a margem bruta sobre a receita transacional fica acima de 99% em qualquer faixa desta tabela — mesmo no topo (15.000 transações/mês), o custo AWS marginal seria só ~R$2,40, contra R$900 de receita no mesmo volume. **O verdadeiro custo que consome essa margem não é AWS por transação — é o baseline fixo da plataforma (dividido entre todas as empresas simultaneamente) e todo o resto do negócio (equipe, suporte, aquisição de cliente, hardware se for vendido), que fica fora do escopo desta estimativa de infra.**

### Ressalva sobre "por empresa" vs. plataforma compartilhada

A tabela cobra por volume de cada empresa individualmente, mas o custo AWS é de infraestrutura **compartilhada** entre todas as empresas ao mesmo tempo — não existe fatia de servidor dedicada a cada cliente. Normal em SaaS multi-tenant; só reforça que a tabela é instrumento de captura de valor e retenção (cliente que cresce é premiado com taxa menor), não uma tentativa de fazer cada empresa "pagar seu próprio custo de infra" isoladamente.

## Limitações desta estimativa (importante)

- Não é preço cotado — é preço de lista **us-east-1** com markup estimado pra sa-east-1, sem confirmação linha a linha.
- Sizing de CPU/memória por task é suposição própria, não testada sob carga.
- O ponto de maior incerteza é o **Aurora Serverless v2**: quantas ACUs o baseline real precisa pra aguentar Kong + 5 serviços com tráfego de pico de almoço/jantar é uma pergunta que só um teste de carga real responde — pode estar subestimado aqui.
- RDS Proxy: não achei tabela de preço específica confiável na pesquisa, o valor usado é a estimativa de menor confiança da tabela.
- Câmbio USD/BRL varia — ajustar antes de qualquer decisão final.
- Nenhum custo de PayGo/adquirente está incluído (é taxa de adquirência, fora do escopo da AWS e do próprio Ordin, conforme já estabelecido).

## Próximos passos sugeridos

Se a decisão de pricing avançar de verdade: (1) rodar AWS Pricing Calculator com a região e sizing reais assim que houver decisão de ir pra produção (`project_infra_aws_adiada`); (2) teste de carga simulando pico de almoço/jantar pra calibrar quantas ACUs o Aurora realmente precisa — é o número que mais muda a conta inteira; (3) levantamento separado de custo Datadog por host, que fica fora desta estimativa.
