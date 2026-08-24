# Análise de concorrentes — fluxo de preparo → pronto → retirada (ORD-118/119)

## Fonte
Pesquisa em duas rodadas (WebSearch/WebFetch), focada especificamente na fatia pós-pagamento do fluxo — cozinha/preparo, sinalização de "pronto", experiência de retirada — não no checkout/pedido em si. Pedido direto do usuário (2026-08-24), depois de fechado o ORD-119 (painel de retirada + urgência configurável).

- **Rodada 1:** páginas de marketing/landing dos 10 concorrentes já catalogados em [[project_ordin_concorrentes_referencia]].
- **Rodada 2** (2026-08-24, a pedido do usuário): mesmos 10 + **Chama Cliente** (concorrente novo, achado na rodada 1 e adicionado à lista) — desta vez buscando deliberadamente **central de ajuda/manual/FAQ** de cada um, não só marketing. Achado estrutural: boa parte dos concorrentes B2B (Nola, Gototem, Zig no produto de KDS) **não tem central de ajuda pública self-service** pra esse produto — suporte é humano (telefone/chat) ou a central de ajuda que existe é pra outro público (Zig tem central de ajuda robusta, mas é do produto de eventos/ingressos, não do KDS pra bar/restaurante).

## Baseline: o que o Ordin tem hoje

Modelo `fulfillment_mode="retirada_unica"` (ORD-118/119), fluxo completo:

1. Cliente paga no totem → pedido vira `paid`, opcionalmente com nome informado via teclado virtual (`pickup_name`, ORD-119).
2. Equipe marca "pronto" manualmente numa tela única (`FulfillmentScreen`, admin) — sem estações separadas (cozinha/bar/etc.), um card por pedido com todos os itens.
3. Painel de TV (`frontend/painel`, novo app dedicado) mostra duas colunas — "Em preparo" / "Pronto para retirada" — com nome ou `#ref`, ordenado por mais antigo primeiro.
4. Urgência configurável por empresa (`prep_urgency_minutes`, default 10 min): card fica laranja na metade do tempo, vermelho ao passar — no painel de TV **e** na tela da equipe, mesmo critério nos dois lugares, recalculado sozinho a cada 30s.
5. Retirada: scan de QR pelo balcão ou baixa manual (admin/balcão) — pedido some das duas telas.
6. Sem: notificação proativa ao cliente, alerta sonoro, cronômetro/relatório de tempo médio, estações múltiplas de preparo, tempo estimado de espera na hora da compra.

---

## Leitura por concorrente

| Concorrente | Cobertura pública sobre este fluxo | Achado principal (rodada 1 + 2) |
|---|---|---|
| **Suitable** | Fraca, mas com achado novo | Central de ajuda real existe (Intercom). Achado novo: **Suitbot**, robô de WhatsApp que notifica automaticamente cada troca de status do pedido — mas é do lado delivery/motoboy, não claramente aplicável a retirada em balcão |
| **Goomer** | Média | KDS confirmado, com estações de preparo configuráveis. Config tem opção de "alerta sonoro" — mas o artigo específico de painel de pedidos não confirma se é pro cliente ou pra equipe. Painel de chamada ao cliente e tempo de espera continuam não documentados |
| **Cplug** | **Melhor documentada** | Painel de senha (TV) + KDS com cronômetro por pedido. Rodada 2 confirma via página de produto: **"cores e alertas" de prioridade + "identifique gargalos"** — mesmo padrão de relatório que Zig/CardápioWeb. Central de ajuda formal (Movidesk) existe mas deu 403 no artigo específico do painel |
| **Nola** | **Ausente**, não só fraca | Rodada 2 confirma: **não há central de ajuda pública indexada pra esse produto**, nem subdomínio de ajuda. Só "KDS por praça" na landing page, nada além |
| **Consumer** | Média, com **achado mais importante da pesquisa** | Painel de senha (staff digita manualmente) + KDS que notifica o garçom (interno). Central de ajuda documenta explicitamente **estimativa de tempo de espera mostrada ao cliente**, calculada a partir do tempo de preparo configurado — ver oportunidade 4 abaixo |
| **Zig** | **Referência técnica**, sem central de ajuda pública pro produto | KDS com 3 estados coloridos (**"novo, atenção, atrasado"**, só visual, sem áudio). Rodada 2 (blog operacional) detalha o relatório de gargalo: tempo médio por prato, itens com mais atraso, horários de maior pressão. A central de ajuda pública da Zig existe, mas é do produto de eventos/ingressos — não do KDS de bar/restaurante |
| **Gototem** | Média, sem central de ajuda pública | KDS com fila de produção, priorização, tempo de preparo. Suporte é humano (telefone/chat), não documentação self-service — sem novidade sobre painel de cliente ou alerta |
| **PagTotem (PagBank)** | Nenhuma | Hardware/pagamento puro, sem KDS. Achado novo: existe um produto PagBank separado (**PagVendas**, Comanda Digital + Monitor de Preparo) — não é o PagTotem, não muda a conclusão |
| **CardápioWeb** | Boa, mas **mais modesta do que a rodada 1 sugeria** | "Modo Preparo"/"Modo Despacho" confirmados via central de ajuda real — mas o artigo oficial do KDS descreve só "tela pra cozinha ver pedido em tempo real", **sem** menção a painel de cliente, alerta ou relatório de tempo. A impressão inicial era otimista demais |
| **Mogo** | Média, lacuna confirmada | Painel de senha com alerta sonoro citado na página de marketing — busca dedicada na central de ajuda **não achou nenhum artigo** sobre o mecanismo exato (automático vs. staff aciona; só som ou também TV). Continua sendo o único achado de alerta sonoro do mercado, mas não documentado em detalhe |
| **Chama Cliente** (novo, rodada 2) | Pass completo | Mecanismo confirmado: **manual** — atendente digita o número e aperta um botão (WhatsApp/SMS/ligação); sem gatilho automático a partir de evento de PDV/KDS. Sem manual/FAQ formal, só termos de uso |

**Mercado geral (fora da lista):** McDonald's/Burger King Brasil seguem o mesmo modelo de painel por senha/número. Notificação por SMS ao cliente é citada como padrão internacional estabelecido, mas nenhum concorrente brasileiro pesquisado documenta isso automaticamente pro fluxo de retirada presencial — o achado mais próximo (Suitbot, Suitable) é focado em delivery.

---

## Padrões recorrentes (síntese)

1. **Painel de 2 estados por senha/número é o padrão quase universal no Brasil** — valida a forma básica do que já construímos, mas expõe que **número/senha é a convenção de mercado, não nome** — o que reforça que o campo `pickup_name` do Ordin (nenhum dos 10 concorrentes documenta isso) já é um diferencial real, não uma suposição.
2. **KDS (cozinha) e painel de chamada (cliente) são vendidos/documentados como produtos separados**, mesmo por quem tem os dois (Consumer, Mogo, CardápioWeb, Cplug) — bate com a nossa divisão entre `FulfillmentScreen` (equipe) e `frontend/painel` (TV).
3. **Escalonamento visual de urgência é raramente divulgado publicamente** — Zig é a única exceção clara (3 estados + cronômetro), e mesmo assim só do lado da cozinha, sem confirmação de que chega ao painel do cliente. **O laranja/vermelho do Ordin já parece estar à frente do que os concorrentes mostram publicamente no lado do cliente.**
4. **Notificação proativa ao cliente por WhatsApp tem precedente real de mercado** (Suitbot, do Suitable) — mas é focada em delivery, não confirmadamente aplicável a retirada em balcão. Ainda é gap real pro caso de uso específico do Ordin.
5. **Tempo estimado de espera pro cliente, na hora da compra, tem precedente confirmado** (Consumer, via central de ajuda): calculado a partir do tempo de preparo configurado + percentual aplicado. Redação orientada a delivery/site, não a totem de retirada presencial — mas prova que o cálculo "config de tempo → estimativa" já é resolvido por pelo menos um concorrente, reduzindo a incerteza de "como calcular isso" mesmo sem histórico real de `ready_at`.
6. **Cronômetro por pedido, onde existe (Cplug/CardápioWeb/Zig), alimenta relatório de eficiência pro staff — não vira contagem regressiva pro cliente.** Confirma o padrão que o Ordin já segue (equipe vê tempo granular, cliente vê só 2 estados).
7. **Múltiplas estações de preparo** (cozinha/bar/etc.) aparecem em Goomer, Nola, Gototem, Zig — o Ordin hoje trata o pedido como uma unidade só, sem separar por estação.
8. **Pager físico/chamador de mesa** existe no Brasil só como categoria de hardware avulso (Mercado Livre, Amazon) — nenhum dos 10 concorrentes-software embute isso no próprio produto.

---

## Oportunidades encontradas — pra PM avaliar

### Fora de escopo (não sugerido pra avançar agora)
- **Pager físico/chamador de mesa** — depende de hardware terceiro, nenhum concorrente-software faz isso, foge do modelo "só telas" do Ordin.
- **Múltiplas estações de preparo separadas** — mudança de modelo de dados relevante (hoje o pedido é uma unidade só em `retirada_unica`); só faz sentido se surgir demanda real de cliente com cozinha segmentada (hambúrguer/bebida/sobremesa em bancadas diferentes, por exemplo).

### 1. Alerta sonoro no painel de TV ao ficar pronto — alto valor, esforço baixo
Único achado de alerta sonoro documentado entre os 10 (Mogo). Cliente de costas pra TV, ou ambiente barulhento, perde o momento exato em que o pedido troca de coluna. Ordin já tem o padrão de beep (`AudioFeedback`, usado no app de balcão) — tocar um som quando um evento `order.ready` chega via WS no `PanelScreen.tsx` é praticamente reaproveitar infraestrutura existente, sem mudança de backend.

### 2. Notificação proativa ao cliente (WhatsApp) — alto valor, esforço médio-alto
Dois precedentes de mercado achados, nenhum automático pro caso de retirada: Suitbot (Suitable) é automático mas focado em delivery; Chama Cliente é manual (atendente digita e aperta um botão, sem gatilho automático de PDV/KDS). Um envio **automático** disparado pelo próprio evento `order.ready` (que já existe via WS) seria mais avançado que os dois precedentes encontrados. Dado o domínio do WhatsApp no Brasil, a via mais natural não é SMS (custo por mensagem, pouco usado) nem push (Ordin não tem app instalável pro cliente final) — seria integração com WhatsApp Business API. Exige capturar telefone (hoje só captura nome, opcional) e um novo serviço de mensageria transacional (o `notification-service` já existe pra e-mail — WhatsApp seria um canal novo, não uma extensão trivial). Diferencial real, mas não é "esforço baixo".

### 3. Tempo médio de preparo / relatório de gargalo — médio valor, esforço médio
Cplug/Zig usam o cronômetro por pedido pra alimentar relatório de eficiência (tempo médio por prato, itens com mais atraso, horário de maior pressão), não pro cliente ver — CardápioWeb, na rodada 2, **não** confirmou isso (achado da rodada 1 era otimista demais). O Ordin já tem o dado bruto (`created_at`), mas **não persiste o momento em que ficou pronto** — só o `status` atual. Precisa de um campo `ready_at` (mesma lacuna já identificada na análise do ORD-119) pra virar métrica de verdade — sem isso, dá pra aproximar só com o tempo até a coleta final, que mistura tempo de preparo com tempo de cliente parado esperando.

### 4. Tempo estimado de espera na hora da compra — alto valor, esforço alto (mas com precedente de cálculo)
A Consumer já resolveu publicamente o "como calcular": tempo de preparo configurado (não histórico real) + percentual aplicado = estimativa mostrada ao cliente. Isso abre um caminho de esforço **menor** do que "esperar acumular histórico real de `ready_at`" — dá pra começar simples (usar `prep_urgency_minutes`, ou um novo campo de tempo médio configurado manualmente pela empresa, como proxy inicial) e evoluir pra estimativa baseada em dado real depois que o item 3 acumular histórico. Ainda assim, considerar carga atual da cozinha (quantos pedidos em preparo agora) pra não estimar "vácuo" — isso é além do que a Consumer documenta.

### Já é ponto forte, sem necessidade de mudança
- **Nome em vez de só número/senha** — nenhum dos 10 concorrentes documenta essa opção; o Ordin já fez isso desde o ORD-119.
- **Escalonamento de urgência visível pro cliente (laranja/vermelho)** — Zig é a única referência de mercado encontrada, e mesmo essa parece ficar só do lado da cozinha. O painel de TV do Ordin já expõe isso direto pro cliente.

---

## Viabilidade técnica (visão rápida, não é levantamento formal de Tech Explorer)

| Oportunidade | Dado já existe? | Precisa endpoint/serviço novo? | Precisa migration? |
|---|---|---|---|
| Alerta sonoro no painel ao ficar pronto | Sim (evento WS `order.ready` já existe) | Não — só frontend (`frontend/painel`) | Não |
| Notificação WhatsApp ao cliente | Não (telefone não é capturado hoje) | Sim — canal de mensageria novo + captura de telefone no totem | Sim (`Order.phone` ou similar) |
| Tempo médio de preparo / relatório | Parcial (`created_at`, mas não `ready_at`) | Sim — endpoint de agregação + persistir transição pra "ready" | Sim (`Order.ready_at`) |
| Tempo estimado de espera na compra | Parcial (`prep_urgency_minutes` pode servir de proxy inicial, como a Consumer faz com tempo configurado) | Sim, mas pode começar simples (config) e evoluir pro item 3 depois | Não, se usar proxy configurado; sim, se já nascer com base em histórico real |

---

## Próximos passos
Análise concluída, sem código escrito — decisão de priorização fica com você. Se algum item avançar, segue o fluxo padrão do repositório (história em `docs/stories/`, upstream completo até `Ready` antes de qualquer implementação).
