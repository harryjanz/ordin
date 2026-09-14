# Gap de funcionalidades — roadmap futuro, cruzado com todos os concorrentes

Registrado a pedido explícito do usuário (2026-09-14), depois da análise do Genesis PRO: as 10 features que o Genesis PRO tem e o Ordin não tem hoje (fidelidade, cashback, fiscal, estoque/CMV, financeiro, integração de delivery, multi-loja/rede, relatórios via WhatsApp, app de delivery próprio, KDS) devem ficar **registradas pra análise e implementação futura** — não é decisão de construir agora, é registro de roadmap. Este doc cruza cada uma com **todos os 12 concorrentes já pesquisados**, não só o Genesis PRO, pra dar mais peso de mercado a cada item. Ver `project_ordin_concorrentes_referencia` (memória) pro índice completo dos concorrentes usados como fonte.

## Atenção: isto reabre uma decisão de escopo já tomada antes

As análises do **CardápioWeb** (`docs/analise-concorrente-cardapioweb.md`) e da **Mogo** (`docs/analise-concorrente-mogo.md`) já tinham classificado boa parte dessas mesmas features — fidelidade, cashback, financeiro, estoque, integração de delivery/WhatsApp — como **"estrutural e fora de escopo"**, com o racional explícito de que o Ordin deveria continuar sendo "um produto de totem/autoatendimento presencial enxuto, não uma plataforma de delivery/CRM". Este documento **não descarta esse racional** — só registra que o usuário agora quer essas features rastreadas pra uma análise futura, o que é uma pergunta em aberto (talvez o posicionamento mude, talvez as features entrem seletivamente, talvez a decisão de manter enxuto se confirme depois de olhar caso a caso). Fica como tensão explícita a resolver quando a conversa de roadmap acontecer de verdade — não como decisão já tomada aqui.

## Baseline: o que o Ordin tem hoje (confirmado por grep no código, não suposição)

| Feature | Estado |
|---|---|
| Programa de fidelidade | Não tem — zero código, zero história |
| Cashback | Não tem — zero código, zero história |
| Fiscal (NFC-e/NFe) | Não tem — levantamento parado em `docs/estudo-nfce.md`, "nenhum código foi escrito" |
| Estoque real + ficha técnica + CMV | Não tem — `catalog` só tem flag `active` (indisponibilidade manual) |
| Financeiro (contas a pagar/receber, conciliação) | Não tem — nenhum módulo |
| Integração de delivery (iFood/Rappi) | Não tem — nenhuma integração real |
| Multi-loja/rede (padronização, ranking entre unidades) | Não tem — `company_id` pressupõe 1 empresa = 1 operação, sem hierarquia de loja/filial |
| Relatórios/notificação via WhatsApp | Não tem — só texto estático de contato em template de e-mail |
| App de delivery próprio | Não tem |
| KDS (roteamento cozinha/balcão) | Não tem — explicitamente fora de escopo na ORD-118, "ideia futura" |
| Painel de senha / controle de fila | **Parcial** — ORD-118/ORD-119 (Done) já cobrem o objetivo funcional via painel de TV + fila, mesmo sem ficha impressa tradicional |

## Cruzamento por feature — quem no mercado já tem isso

### 1. Programa de fidelidade

| Concorrente | Tem? | Detalhe |
|---|---|---|
| CPlug | Sim | Módulo "Programa de Fidelidade" na lista de funcionalidades |
| Consumer | Sim | Listado entre as 100+ funcionalidades (PDV, iFood, fidelidade, cashback...) |
| Nola | Sim, só no topo | "CRM + fidelidade completo" só no plano Premium (R$150-300k/mês faturamento) |
| Zig | Sim | Programa "Giftback" — créditos e bônus personalizados |
| CardápioWeb | Sim | Fidelidade por pontos, mas parte da suíte de delivery/WhatsApp/CRM (fora do módulo de totem) |
| Mogo | Sim | "Gestão de clientes e fidelidade", parte da suíte, fora do módulo de totem |
| Genesis PRO | Sim | Incluso desde o plano de entrada (R$250/mês) |
| Suitable, Gototem, PagTotem, SisFood, Goomer | Não confirmado | Sem menção nos docs já pesquisados |

**Sinal de mercado:** 7 de 12 concorrentes pesquisados têm fidelidade — é a feature de CRM mais comum da lista, presente até em concorrentes que miram cliente pequeno (CPlug, Consumer) e não só nos que vendem suíte completa (Mogo, CardápioWeb, Nola).

### 2. Cashback

| Concorrente | Tem? | Detalhe |
|---|---|---|
| Consumer | Sim | Listado entre as funcionalidades |
| Genesis PRO | Sim | Incluso desde o plano de entrada |
| Demais 10 | Não confirmado | Nenhuma menção nos docs pesquisados |

**Sinal de mercado:** feature bem mais rara que fidelidade — só 2 de 12. Pode ser porque cashback frequentemente já vem embutido na maquininha/adquirente (ex. Stone Cashback, PicPay), não no software de gestão — vale considerar se cashback é responsabilidade do Ordin ou do provedor de pagamento antes de priorizar.

### 3. Fiscal (NFC-e/NFe)

Já tem levantamento dedicado e aprofundado em `docs/estudo-nfce.md` (2026-08-21) — inclusive comparação de provedores (Focus NFe, eNotas, PlugNotas) e proposta de arquitetura (fiscal-service novo, chamado pelo payment-service depois do pagamento aprovado). Cruzamento com concorrentes:

| Concorrente | Tem? | Detalhe |
|---|---|---|
| CPlug | Sim | NF-e, NFC-e, SAT |
| Consumer | Sim | Emissor fiscal desde o plano de entrada (R$59,90/mês) |
| Suitable | Sim, a partir do 2º plano | NFC-e a partir do Advanced (R$368/mês) |
| SisFood | Sim | NFC-e automática na impressão, junto com a senha do pedido |
| Mogo | Sim | NFC-e/NF-e, parte do controle fiscal |
| CardápioWeb | Sim | NFe, parte da suíte |
| Zig | Sim | "Gestão fiscal integrada" |
| Genesis PRO | Sim | NFC-e/NFe com importação automática, a partir do 2º plano (R$450/mês) |
| Nola | Parcial | BPO tributário/financeiro (mais amplo que emissão de nota) |
| Gototem, PagTotem, Goomer | Não confirmado | Foco em hardware/totem plugável, sem menção a módulo fiscal próprio |

**Sinal de mercado:** 9 de 12 — a feature mais universal de toda a lista. `docs/estudo-nfce.md` já registra isso: "nenhum concorrente pesquisado parece emitir NFC-e com motor próprio — é padrão de mercado usar um provedor por trás mesmo em produtos maduros". Combinado com a obrigatoriedade de NFC-e em SP a partir de jan/2026, é a feature com o argumento mais forte de "table stakes", não diferencial.

### 4. Estoque + ficha técnica + CMV automático

| Concorrente | Tem? | Detalhe |
|---|---|---|
| CPlug | Sim | "Gestão de Estoque" como módulo |
| Consumer | Sim | Listado entre funcionalidades |
| Nola | Sim, só no meio+ | Estoque + fichas técnicas + CMV real vs. teórico só a partir do plano Profissional (R$40k+/mês faturamento) |
| Mogo | Sim | Estoque, fichas técnicas, controle de produção, parte da suíte |
| CardápioWeb | Sim | Estoque, parte da suíte |
| Genesis PRO | Sim | Estoque com ficha técnica e cálculo automático de CMV, desde o plano de entrada |
| Suitable, Gototem, PagTotem, Zig, Goomer, SisFood | Não confirmado | Sem menção explícita nos docs pesquisados |

**Sinal de mercado:** 6 de 12 — comum, mas menos universal que fiscal. É o módulo mais "ERP clássico" da lista (cálculo de custo por insumo), maior esforço de implementação entre os itens levantados.

### 5. Financeiro (contas a pagar/receber, conciliação bancária)

| Concorrente | Tem? | Detalhe |
|---|---|---|
| Nola | Sim, forte | DRE automatizado, conciliação bancária, fluxo de caixa com previsão — desde o plano Profissional |
| Mogo | Sim | Financeiro (caixa, contas, DRE, CMV), parte da suíte |
| CardápioWeb | Sim, via terceiro | Financeiro via integração com F360 (não é módulo nativo) |
| Genesis PRO | Sim | Financeiro completo com conciliação automática, desde o plano de entrada |
| CPlug | Parcial | "ERP Gestão" genérico, sem detalhamento de contas a pagar/receber |
| Demais 7 | Não confirmado | Sem menção nos docs pesquisados |

**Sinal de mercado:** 4-5 de 12, concentrado nos concorrentes que se vendem como "suíte de gestão completa" (Nola, Mogo, Genesis PRO), não nos mais focados em totem puro (CPlug, Consumer, Suitable). Reforça a leitura já registrada no doc do CardápioWeb: financeiro tende a vir acoplado a um produto de gestão mais amplo, não como módulo isolado de totem.

### 6. Integração de delivery (iFood/Rappi)

| Concorrente | Tem? | Detalhe |
|---|---|---|
| CPlug | Sim | "Hub de Delivery (iFood, Rappi e outros)" |
| Consumer | Sim, a partir do 2º plano | "Multi-integração iFood" a partir do Profissional (R$179,90/mês) |
| Mogo | Sim | Delivery, parte da suíte |
| CardápioWeb | Sim, é o core | Plataforma nasceu como gestão de delivery — iFood é central, não módulo |
| Genesis PRO | Sim | iFood, Rappi |
| Nola, Goomer, Suitable, Gototem, PagTotem, Zig, SisFood | Não confirmado | Sem menção direta nos docs — Goomer e Suitable têm cardápio digital/QR mas não confirmação específica de hub iFood/Rappi |

**Sinal de mercado:** 5 de 12 confirmados, mas concentrados em quem já vende "gestão completa" — sugere que integração de delivery é vista como parte natural de plataformas mais amplas, coerente com o padrão já visto acima.

### 7. Multi-loja/rede (padronização de cardápio, dashboard consolidado, ranking entre unidades)

| Concorrente | Tem? | Detalhe |
|---|---|---|
| Nola | Sim, só no topo | Enterprise (R$300k+/mês ou 3+ unidades): dashboard multi-loja, marcas ilimitadas |
| Genesis PRO | Sim, plano dedicado | "Redes e Expansão" (sob consulta): gestão centralizada, padronização por região, ranking entre unidades |
| Suitable | Sim, só no topo | "Múltiplas lojas" citado no plano Ultra (sob consulta) |
| SisFood | Parcial | Multi-loja existe via CNPJs diferentes → estrutura de franquia, sem detalhe de dashboard consolidado |
| Demais 8 | Não confirmado | Sem menção nos docs pesquisados |

**Sinal de mercado:** só 3-4 de 12, e sempre no plano/tier mais caro — é a feature mais claramente "enterprise" da lista, não algo que concorrente nenhum oferece cedo no funil. É também a única do grupo que exige **mudança de schema** no Ordin (`company_id` hoje pressupõe 1 empresa = 1 operação), não só um módulo novo.

### 8. Relatórios/notificação via WhatsApp

| Concorrente | Tem? | Detalhe |
|---|---|---|
| Nola | Sim | Alertas WhatsApp (Profissional+), "Clara IA" assistente via WhatsApp (Premium) |
| CardápioWeb | Sim, é o core | Chatbot com IA no WhatsApp, disparo em massa, recuperação de carrinho |
| Suitable | Sim | Robô de WhatsApp + Suitbot (notifica troca de status do pedido, focado em delivery) |
| Consumer | Sim, só no topo | Disparo via WhatsApp no plano Alta Performance |
| Genesis PRO | Sim | Relatórios de vendas via WhatsApp, a partir do 2º plano |
| Demais 7 | Não confirmado | Sem menção |

**Sinal de mercado:** 5 de 12. Já existe uma análise específica sobre notificação proativa por WhatsApp no fluxo de retirada em `docs/analise-concorrentes-fluxo-retirada-unica.md` — vale ler junto: conclusão de lá é que **nenhum concorrente confirma notificação automática via WhatsApp especificamente pro caso de retirada em balcão** (Suitbot é de delivery), então um `order.ready` → WhatsApp automático seria mais avançado que qualquer precedente de mercado encontrado — mas exige captar telefone (hoje opcional) e um canal de mensageria novo (o `notification-service` atual só faz e-mail).

### 9. App de delivery próprio

| Concorrente | Tem? | Detalhe |
|---|---|---|
| Genesis PRO | Sim | "App de delivery próprio" citado explicitamente |
| Demais 11 | Não confirmado | Nenhum outro concorrente pesquisado reivindica app próprio — os demais usam iFood/Rappi como canal, não app white-label |

**Sinal de mercado:** feature rara, só 1 de 12 — é mais um diferencial de nicho do Genesis PRO do que expectativa de mercado. Prioridade mais baixa que as demais, dado o baixo precedente.

### 10 e 11. KDS e painel de senha/fila

Já cobertos em profundidade em `docs/analise-concorrentes-fluxo-retirada-unica.md` (10 concorrentes, rodada dedicada 2026-08-24) — não repito aqui pra não duplicar. Resumo da conclusão de lá, relevante pro roadmap:
- **Painel de 2 estados por senha/número já é padrão quase universal** — o Ordin, via ORD-118/119, já está no nível de mercado (e à frente em alguns pontos: `pickup_name` nominal é diferencial, escalonamento visual de urgência também).
- **KDS de cozinha e painel de chamada ao cliente são vendidos como produtos separados** mesmo por quem tem os dois — confirma que a divisão `FulfillmentScreen`/`frontend/painel` do Ordin já segue o padrão de mercado.
- O gap real do Ordin aqui é **KDS formal com roteamento por praça/estação** (cozinha vs. balcão vs. bar), que 6+ concorrentes têm (Goomer, CPlug, Nola, Consumer, Zig, Gototem) e o Ordin deixou explicitamente de fora na ORD-118.

## Síntese — força do sinal de mercado por feature (não é priorização, é um input)

| Feature | Concorrentes confirmados / 12 | Observação |
|---|---|---|
| Fiscal (NFC-e/NFe) | 9 | Já tem levantamento técnico pronto (`docs/estudo-nfce.md`); único com gatilho regulatório concreto (SP, jan/2026) |
| Fidelidade | 7 | Presente até em concorrentes de ticket baixo (CPlug, Consumer) |
| KDS (roteamento por praça) | 6+ | Coberto em `docs/analise-concorrentes-fluxo-retirada-unica.md` |
| Estoque + ficha técnica + CMV | 6 | Maior esforço técnico do grupo (cálculo de custo por insumo) |
| Delivery (iFood/Rappi) | 5 | Concentrado em quem já vende suíte ampla, não totem-first |
| Relatórios/notificação WhatsApp | 5 | Nenhum concorrente confirma uso automático pra retirada em balcão — oportunidade de ir além do mercado, não só igualar |
| Financeiro (contas a pagar/receber) | 4-5 | Tende a vir junto de plataforma de gestão completa, não módulo isolado |
| Multi-loja/rede | 3-4 | Sempre no tier mais caro; único item que exige mudança de schema, não só módulo novo |
| Cashback | 2 | Pode já ser responsabilidade do provedor de pagamento, não do software |
| App de delivery próprio | 1 | Diferencial de nicho do Genesis PRO, baixo precedente de mercado |

**Como ler esta tabela:** número de concorrentes não é proxy direto de prioridade — é só um dos inputs. Fiscal tem o número mais alto **e** um gatilho legal real, o que o torna candidato mais concreto a virar Explorer primeiro. Multi-loja tem número baixo, mas é o único que mexe em arquitetura (schema de empresa/loja) — vale decidir isso antes de crescer o catálogo de clientes, não depois. As demais features (fidelidade, estoque, financeiro, delivery, WhatsApp, cashback, app próprio) ficam registradas aqui como candidatas de roadmap, sem ordem de prioridade definida — essa decisão é do usuário quando a conversa de roadmap avançar.

## Próximos passos sugeridos (não decisão, só sugestão de sequência de investigação)

1. Se/quando o usuário quiser avançar num item específico, o caminho natural é abrir um Explorer dedicado (fluxo `docs/WORKFLOW.md`) — este doc é insumo de pesquisa, não substitui o upstream obrigatório.
2. Fiscal já tem o levantamento mais maduro (`docs/estudo-nfce.md`) — se for o primeiro a avançar, o próximo passo já está descrito lá (confirmar com clientes reais, contato comercial com provedores).
3. Multi-loja/rede merece uma conversa de arquitetura antes de virar história, dado que mexe em `company_id`/multi-tenancy — não é só "mais uma feature".

## Fontes

Cruzamento de: `docs/analise-concorrente-{cplug,nola,consumer,zig,gototem,pagtotem,goomer,suitable,cardapioweb,mogo,genesispro}.md`, `docs/analise-concorrentes-sisfood-totem-autoatendimento.md`, `docs/analise-concorrentes-fluxo-retirada-unica.md`, `docs/analise-concorrentes-modelo-cobranca-totem.md`, `docs/estudo-nfce.md`. Todos já publicados em sessões anteriores (2026-08-21 a 2026-09-14); este doc não trouxe pesquisa nova de concorrente, só reorganizou o que já existia por feature, cruzado com o achado do Genesis PRO que motivou o pedido.
