# 05 — Copy da Home

**Fase:** 4 — Site · **Status:** rascunho para aprovação
**Base:** `03-posicionamento.md` (posicionamento, 3 pilares, objeções) + `04-arquitetura-site.md` (papel da Home no site).

Convenção: cada seção tem objetivo, headline, subhead, bullets, CTA e prova sugerida. Onde a prova ainda não existe (sem case real publicado), o campo diz **[A COLETAR]** em vez de um número inventado — nenhuma estatística fictícia entra neste documento.

---

## Seção 1 — Hero

**Objetivo:** comunicar o posicionamento em menos de 5 segundos de leitura e levar pra baixo (scroll) ou pro CTA.

**Headline:** ver as 3 variações de A/B teste ao final deste documento — a principal recomendada é a Variação A.

**Subhead:**
> Cardápio com fotos, mantém a adquirente que você já usa — Cielo, Rede, GetNet, PagSeguro, Mercado Pago, Stone ou Adyen —, nota fiscal emitida sozinha a cada venda. Custo justo, sem taxa escondida, sem precisar ser uma rede grande pra começar.

**Bullets (resumo dos 3 pilares, forma curta):**
- Cielo, Rede, GetNet, PagSeguro, Mercado Pago, Stone e Adyen — você escolhe
- Nota fiscal automática em cada venda
- Custo justo: sem piso de faturamento, sem contrato de fidelidade pra testar

**CTA:** "Agendar uma conversa" (leva pra `/demo`) + CTA secundário "Ver como funciona" (leva pra `/como-funciona`)

**Prova sugerida:** **[A COLETAR]** — número real de pedidos processados, tempo médio de fila reduzido, ou primeiro cliente piloto citável. Até existir, o hero não deve usar número nenhum (nem aproximado) — melhor sem prova numérica do que com uma inventada.

---

## Seção 2 — Como funciona (preview, 4 passos)

**Objetivo:** mostrar em poucos passos visuais que o fluxo é simples — complementa o hero sem repetir a página `/como-funciona` inteira.

**Headline:**
> Do pedido à nota fiscal, sem ninguém no meio

**Subhead:**
> Seu cliente pede sozinho no totem. Você recebe a venda, a nota fiscal e o pedido pronto pra retirada — tudo no automático.

**4 passos (cada um = ícone + 1 frase, fato de `01-inventario-produto.md`, §1 e §15):**
1. Cliente monta o pedido no totem, com fotos e opções (ex: escolha o sabor)
2. Paga com a adquirente que você já usa — cartão ou PIX
3. Nota fiscal sai sozinha, sem ninguém rodar nada manualmente
4. Pedido vira ticket com nome e QR — fácil de chamar e entregar

**CTA:** "Ver o fluxo completo" → `/como-funciona`

**Prova sugerida:** nenhuma estatística necessária aqui — a prova é a clareza do próprio fluxo.

---

## Seção 3 — Pilar 1: Pagamento sem susto

**Objetivo:** comunicar o diferencial mais defensável da pesquisa (liberdade de adquirente + estorno automático) de forma concreta, não abstrata.

**Headline:**
> Sua adquirente continua sendo sua

**Subhead:**
> Cielo, Rede, GetNet, PagSeguro, Mercado Pago, Stone ou Adyen. Você não precisa trocar de adquirente pra ter autoatendimento. E se uma venda falhar no meio do caminho, o estorno acontece sozinho.

**Bullets (fato, `01`, §6 — ver nota de dependência abaixo):**
- Mantém a adquirente que você já usa (Cielo, Rede, GetNet, PagSeguro) via PayGo, ou use Mercado Pago, Stone ou Adyen direto
- Nenhuma taxa própria embutida escondida no preço do sistema
- Se o pagamento for aprovado mas algo falhar depois, o estorno é automático — seu cliente não precisa brigar por reembolso

**CTA:** "Entender como funciona o pagamento" → `/como-funciona#pagamento`

**Decisão do usuário (2026-09-30, 3ª rodada):** Stone e Adyen entram sem qualificador de "a caminho" — plano de produto é tê-las prontas até o lançamento do site, no mesmo nível de MP e PayGo. **Dependência registrada, não garantida por este documento**: PayGo e Mercado Pago estão implementados e testados hoje; Stone e Adyen têm decisão de implementar e arquitetura validada, mas **zero código no momento desta revisão** (`01-inventario-produto.md`, §6) — confirmar status real antes de publicar, caso o lançamento do site antecipe a conclusão dessas 2 integrações. **Nuance que precisa sobreviver à Home de qualquer forma**: "mantém sua adquirente" (verdade, via PayGo) é diferente de "mantém sua maquininha física" (não é verdade — o terminal físico muda, mesmo quando a adquirente não muda). Não deixar a Home insinuar que o aparelho atual do cliente continua em uso sem qualificar isso em "Como funciona".

**Prova sugerida:** **[A COLETAR]** — comparativo real de quanto o dono economiza mantendo a própria maquininha vs. adquirente forçada. O dado de mercado "PDV grátis pode custar 4x mais" (`02-concorrencia-matriz.md`, seção 4) é de uma análise de terceiro sobre o setor, **não uma medição do Ordin** — pode aparecer como contexto educativo ("é comum fornecedor de totem grátis embutir taxa de cartão mais alta"), nunca atribuído como "nossa economia comprovada".

---

## Seção 4 — Pilar 2: Fiscal no automático

**Objetivo:** resolver a dor regulatória (NFC-e) com uma mensagem de alívio operacional, não um discurso técnico de compliance.

**Headline:**
> Nota fiscal emitida sozinha, venda por venda

**Subhead:**
> Cada pedido pago já sai com nota fiscal — sem depender de alguém lembrar de rodar nada no fim do dia.

**Bullets (fato, `01`, §7):**
- Emissão automática a cada venda aprovada
- Reconciliação automática se alguma nota ficar pendente
- Cancelamento de nota dentro do prazo, se o pagamento for estornado

**CTA:** "Ver o módulo fiscal" → `/como-funciona#fiscal`

**Prova sugerida:** nenhuma estatística necessária — a prova é o mecanismo em si (reconciliação automática é um detalhe técnico que já funciona como prova).

---

## Seção 5 — Pilar 3: Feito pra quem está começando ou é médio

**Objetivo:** afastar a objeção de "isso é coisa de rede grande" e deixar claro, de forma positiva, pra quem o produto foi pensado — reforça o ICP sem precisar de uma página de segmentos separada.

**Headline:**
> Custo justo, sem letra miúda

**Subhead:**
> Sem piso de faturamento mínimo, sem contrato de um ano só pra testar, sem taxa escondida embutida no sistema. Você sabe exatamente quanto está pagando.

**Bullets (fato, `01`, §10; contraste de mercado, `02`, seção 1 e 4):**
- Sem exigência de faturamento mínimo pra contratar
- Comece com 1 totem e cresça — o custo por totem cai a cada unidade adicional
- Sem taxa própria da Ordin escondida na maquininha — diferente do "totem grátis" que esconde a conta na taxa de cartão

**CTA:** "Ver como a cobrança funciona" → `/precos`

**Prova sugerida:** **[A COLETAR]** — perfil real do primeiro cliente/piloto (porte, nº de totens). Até existir, manter a seção só com a lógica de produto, sem citar "clientes como você" de forma genérica.

---

## Seção 6 — "Para quem é" (gestão de expectativa, não só venda)

**Objetivo:** qualificar o lead antes da conversa comercial — evita agendar demo com quem precisa de KDS, delivery via marketplace, ou gestão de rede multi-loja, coisas que o produto hoje não tem (`01-inventario-produto.md`, §3, §8; `02-concorrencia-matriz.md`, seção 5).

**Headline:**
> Pra quem é (e pra quem ainda não é)

**Bullets — é pra você se:**
- Tem uma operação de atendimento rápido com pedido e retirada (não serviço de mesa com garçom)
- Quer resolver fila e erro de pedido sem precisar trocar de adquirente
- Está começando ou é de porte pequeno/médio

**Bullets — ainda não é pra você se:**
- Precisa de painel único pra gerenciar várias unidades/CNPJs diferentes
- Depende de delivery via iFood/Rappi como canal principal
- Precisa de painel de cozinha (KDS) com roteamento por praça

**CTA:** nenhum — esta seção existe para **reduzir** lead desqualificado, não para converter.

**Por que incluir isso:** é honestidade que vira eficiência comercial — evita o time gastar uma demo inteira com alguém que vai descobrir a lacuna só na véspera de assinar. Nenhum concorrente pesquisado faz isso de forma explícita (`02-concorrencia-matriz.md`), o que torna essa seção, por si só, um pequeno diferencial de confiança.

---

## Seção 7 — CTA final

**Headline:**
> Vamos ver se o Ordin resolve a fila do seu balcão?

**Subhead:**
> Sem compromisso, sem letra miúda — uma conversa de 15 minutos pra entender sua operação.

**CTA:** "Agendar conversa" (WhatsApp ou formulário curto, ver `04-arquitetura-site.md`)

---

## 3 variações de headline para teste A/B

| Variação | Headline | Ângulo | Framework |
|---|---|---|---|
| **A (recomendada)** | "Sua adquirente continua sendo sua — Cielo, Rede, GetNet, PagSeguro, Mercado Pago, Stone ou Adyen" | Feature-first, nomeia os 6 provedores como disponíveis (decisão do usuário, 2026-09-30, 3ª rodada: Stone e Adyen entram sem qualificador, plano é tê-las prontas até o lançamento) em vez de prometer compatibilidade universal com qualquer maquininha | Antes/depois/ponte — a "ponte" é a lista de adquirentes |
| **B** | "Menos fila, menos erro — sem trocar de adquirente pra isso" | Dor-first (fila/erro), resolve a objeção de troca de adquirente na mesma frase, sem citar nomes (mais seguro pra uma variação mais curta) | PAS (Problema-Agitação-Solução, comprimido) |
| **C** | "Custo justo, sem taxa escondida: você escolhe como recebe" | Confronto direto com a prática de mercado mapeada na Fase 2 (MDR oculta) — mais provocador, alinhado ao gancho de preço decidido (seção "Pilar 3") | JTBD — nomeia o medo real do comprador |

**Histórico da correção (2026-09-30, 3 rodadas):** 1ª versão ("funciona com a maquininha que você já tem") foi descartada por implicar compatibilidade universal falsa. 2ª versão nomeou os 4 provedores (MP/PayGo/Stone/Adyen) com Stone/Adyen marcadas "a caminho", depois de confirmar que PayGo é TEF genuinamente multiadquirente (Cielo/Rede/GetNet/PagSeguro/Safra/Vero) enquanto Stone e Adyen NÃO são (cada uma é stack fechado). **3ª rodada (decisão do usuário)**: Stone e Adyen entram sem qualificador — o plano de produto é integrá-las antes do lançamento do site, então aparecem como disponíveis, lado a lado com MP e PayGo. **Dependência que fica registrada, não resolvida pelo copy**: isso só se sustenta se a implementação terminar antes do site ir ao ar — ver `03-posicionamento.md`, seção 2, e `01-inventario-produto.md`, §6, pra status real de código.

**Por que testar as 3 em vez de escolher uma só:** cada uma ataca um gatilho de compra diferente de `03-posicionamento.md` (A = preservação de relação comercial/adquirente, B = dor operacional sem citar nomes, C = desconfiança financeira/custo justo) — não há dado de conversão real ainda pra saber qual ressoa mais com o ICP; a Variação A é a recomendação de partida por ser a mais concreta, verificável e com a maior cobertura real de mercado por trás dela.

---

## Sugestão de stack técnica do site (sem implementar)

Recomendação, não decisão — avaliar com o usuário antes de qualquer código:

- **Gerador de site estático (ex: Astro)** em vez de SPA React pura — as 5 páginas são majoritariamente conteúdo, não aplicação interativa; SSG dá SEO e performance melhores pra um site institucional, que é exatamente o que falta pra captar tráfego de busca orgânica (nenhum dos outros frontends do Ordin precisa disso, porque não são páginas de conteúdo público).
- **Hospedagem estática simples** (Vercel, Netlify ou Cloudflare Pages) em vez de replicar o padrão ECS Fargate dos outros frontends do projeto — coerente com o achado de `01-inventario-produto.md` §17 de que a infraestrutura AWS de produção ainda não existe; um site institucional não deveria ficar bloqueado esperando essa decisão de infraestrutura maior.
- **Conteúdo versionado em Markdown no próprio repositório**, sem CMS headless — 5 páginas não justificam a complexidade operacional de um CMS; atualização de copy via PR segue o mesmo fluxo que o resto do projeto já usa pra documentação.
- **Formulário/CTA de contato**: se WhatsApp (recomendação da seção `/demo` em `04-arquitetura-site.md`), só precisa de um link `wa.me` — zero backend novo. Se formulário, qualquer serviço de formulário estático (Formspree ou similar) evita precisar subir um backend só pra isso.

Esta sugestão não implica abrir uma história de implementação agora — fica registrada pra quando o usuário decidir avançar pra construção real do site.

---

Fecha a Fase 4 e o levantamento completo (Fases 1-4), com o copy das 5 páginas do site completo. Entregáveis em `docs/marketing/`:
1. `01-inventario-produto.md`
2. `02-concorrencia-matriz.md`
3. `03-posicionamento.md`
4. `04-arquitetura-site.md` (inclui identidade visual real do Ordin, achado de 2026-09-30)
5. `05-copy-home.md`
6. `06-copy-como-funciona.md`
7. `07-copy-precos.md`
8. `08-copy-faq.md`
9. `09-copy-contato.md`

**Atualização de 2026-09-30 (3 rodadas de correção no posicionamento de pagamento)**: as 4 pendências originais foram resolvidas pelo usuário — preço fica fora do site (gancho de "custo justo"), hardware em 3 modelos (venda/locação/BYO orientado), suporte 24x7 via WhatsApp, e os provedores de pagamento podem ser citados no site. A forma de citá-los passou por 3 correções: 1ª rodada substituiu "funciona com a maquininha que você já tem" (promessa universal insustentável, só ~9% do mercado coberto por marca) por nomear os 4 provedores (MP/PayGo/Stone/Adyen) lado a lado, com Stone/Adyen marcadas "a caminho". 2ª rodada, depois de confirmar que **PayGo é TEF genuinamente multiadquirente** (Cielo/Rede/GetNet/PagSeguro/Safra/Vero) enquanto **Stone e Adyen não são** (cada uma é stack fechado), refinou a mensagem pra falar em **manter a adquirente** (verdade, ~66% do mercado hoje). **3ª rodada (decisão do usuário)**: Stone e Adyen deixam de ser "a caminho" e entram como disponíveis — plano de produto é integrá-las até o lançamento do site. Em todas as 3 rodadas, o cuidado de nunca confundir "mesma adquirente" com "mesma maquininha física" (o terminal muda) se manteve — essa é a única nuance que atravessou todas as correções sem mudar.

**Dependência de produto que fica aberta, não uma pendência de pesquisa**: a 3ª rodada só se sustenta se Stone e Adyen forem de fato implementadas e testadas antes do site ir ao ar — status real de código documentado em `01-inventario-produto.md`, §6, pra conferir a qualquer momento antes de publicar. **Pendência técnica**: especificação do equipamento recomendado pra quem optar por BYO no modelo de hardware ainda não existe. **Validação de que WhatsApp é o canal de conversão certo pro ICP** permanece inferência, não dado — mas o usuário já confirmou que "me parece adequado".

**Atualização de 2026-10-01 (revisita à Genesis PRO):** 2 seções novas na Home, implementadas direto em `frontend/site/src/pages/Home.tsx` (ver `03-posicionamento.md`, seção 3.5, pro racional completo):
- **Seção 5.5 — "O totem que roda em qualquer dispositivo"**: fundo escuro (`#180a33`, mesma cor base do admin), headline + subhead explicando que o Ordin é app web sem SO próprio, badges "Android / Windows / Chrome OS / Qualquer navegador moderno".
- **Badges de segmento** no topo da seção "Pra quem é": 7 dos 8 segmentos da Genesis (Alimentação e restaurantes, Cafeterias, Bares e pubs, Baladas e casas noturnas, Parques e lazer, Lojas e varejo, Franquias e redes) — correção de uma primeira leitura excessivamente restritiva, ver `03-posicionamento.md` seção 3.5. Só **Distribuidoras de Bebida** ficou de fora (modelo B2B de atacado, fluxo diferente de "pede e retira"). A lista "ainda não é pra você se" foi reescrita com ressalvas específicas (atacado/distribuição, painel de rede centralizado) em vez de excluir segmentos inteiros.
