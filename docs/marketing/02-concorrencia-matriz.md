# 02 — Análise Cruzada: Ordin × Concorrência

**Fase:** 2 — Análise cruzada · **Status:** rascunho para aprovação
**Base:** `01-inventario-produto.md` (fato de código) + 12 dossiês de concorrente + ~10 análises cross-cutting de mercado já existentes em `docs/`.

**Convenção da matriz:** ✅ confirmado que tem · ❌ confirmado que não tem (pesquisa dedicada ou dossiê explícito) · **~** parcial/gated (existe mas limitado ou só no plano mais caro) · **—** não comunicado (dossiê não deu dado suficiente pra confirmar nem negar — não significa que o concorrente não tem).

Amostra de 7 concorrentes escolhida por diversidade de posicionamento: CPlug/Consumer (preço transparente, ticket baixo), Goomer/SisFood (totem como produto central), Genesis PRO (franquia/rede), Nola (exclui pequeno negócio), Suitable (autoatendimento via QR, não totem físico). Os outros 6 dossiês (CardápioWeb, Mogo, Gototem, PagTotem, Zig) entram nas notas quando relevantes, não nas colunas — ver `01-inventario-produto.md`'s fonte e a íntegra da pesquisa em `docs/analise-concorrente-*.md`.

---

## 1. Matriz de features de produto

| Feature | **Ordin** | CPlug | Consumer | Goomer | SisFood | Genesis PRO | Nola | Suitable |
|---|---|---|---|---|---|---|---|---|
| Totem físico como produto central (não módulo de suíte) | ✅ | ~ | ~ | ✅ | ✅ | ~ | ❌ | ❌ |
| Pagamento com múltiplos provedores nomeados (sem taxa própria forçada) | ~ (MP+PayGo hoje; Stone+Adyen decididos, não codificados) | — | — | ~ (só 1 de 2 SKUs) | ~ (Stone Connect ou TEF) | ❌ (parceria oficial Stone) | — | — |
| Emissão fiscal NFC-e automática por pedido | ✅ | ✅ | ✅ | — | ✅ | ✅ | — | ✅ |
| Estorno automático quando falha pós-venda (estoque) | ✅ | — | — | — | — | — | — | — |
| KDS / painel de cozinha com roteamento por praça | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Programa de fidelidade | ❌ | ✅ | ✅ | — | — | ✅ | ✅ | — |
| Estoque com ficha técnica/CMV automático | ~ (só contagem) | ~ | ~ | — | — | ✅ | ✅ (é o core do produto) | — |
| Integração com delivery (iFood/Rappi) | ❌ | ✅ | ✅ | — | — | ✅ | — | ✅ (20+ integrações) |
| Multi-loja real (unidades com CNPJ/endereço próprios) | ❌ | — | — | — | — | ✅ | ~ | — |
| Identificação do cliente sem CPF obrigatório | ✅ | — | — | ✅ | — | — | — | — |
| Retirada nominal (nome, não só senha/número) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Cardápio programável por horário | ~ (sem fuso, sem teste) | — | — | — | — | — | — | — |
| Personalização visual livre (logo/cor própria) | ❌ | — | — | — | — | — | — | — |
| Capacidade offline | ❌ | ✅ (PDV geral, não confirmado no totem) | — | — | — | — | — | — |
| Grupos de opção com 1 primitivo (min/max) | ✅ | — | — | ✅ | — | — | — | — |

**Leitura da matriz — 3 achados que orientam posicionamento:**
1. Onde estamos **sozinhos com uma feature real e testada** que ninguém comunica: estorno automático pós-falha, retirada nominal. Isso é força de comunicação, não força de produto genérica — ninguém provou o contrário, mas também ninguém afirmou ter.
2. Onde estamos **em paridade de mercado** (maioria tem): fiscal NFC-e — não é diferencial, é bilhete de entrada. Comunicar como "resolvido", não como exclusividade.
3. Onde estamos **atrás de verdade**: KDS (6 de 7 da amostra têm), fidelidade (4 de 7), CMV automático (2 de 7, mas é o produto inteiro da Nola). Ver seção de riscos.

## 2. Postura de preço no mercado (contexto para Fase 3)

| Concorrente | Preço público? | Totem no plano de entrada? |
|---|---|---|
| CPlug | Sim, completo | **Sim** — único caso claro |
| Consumer | Sim, completo | Não — só no plano mais caro (R$269,90) |
| Suitable | Sim, completo | Não — só no Premium |
| Genesis PRO | Sim, quase completo | Não (mas 1º totem incluso no plano de topo, adicionais a R$99/mês fixo) |
| Nola | Por faixa de faturamento, sem R$ fixo | Só a partir do plano Profissional (R$40k+/mês mínimo) |
| Goomer, Gototem, Zig, PagTotem | Não | N/A |

**Padrão confirmado:** quando o totem aparece no pricing, é quase sempre gated no plano mais caro — CPlug é a única exceção real. Isso é insumo direto para a decisão de posicionamento de preço na Fase 3, não uma conclusão fechada aqui.

## 3. Diferenciais defensáveis (com prova técnica)

Cada item abaixo cita a seção correspondente de `01-inventario-produto.md`. Marcado **[FATO]** quando a prova é direta (código + teste), **[INFERÊNCIA]** quando é uma leitura razoável mas não 100% comprovável pela pesquisa.

| # | Diferencial | Prova técnica | Por que é defensável no mercado pesquisado |
|---|---|---|---|
| 1 | Via PayGo (multiadquirente real: Cielo/Rede/GetNet/PagSeguro) + Mercado Pago, ~66% do mercado já alcançável hoje; Stone e Adyen somam mais marca, não mais cobertura (cada uma é fechada) | **[FATO]** §6 — PayGo e Mercado Pago implementados hoje; multiadquirência do PayGo confirmada por pesquisa externa, não por código do Ordin em si | Nenhum concorrente da amostra combina TEF multiadquirente real com um gateway online — Goomer é parcial (1 de 2 SKUs), Genesis PRO e SisFood têm parceria/opção fechada com 1 adquirente |
| 2 | Estorno automático quando a baixa de estoque falha pós-pagamento | **[FATO]** §6 — 14 testes dedicados, sem intervenção humana | Nenhum dos 12 dossiês menciona esse nível de robustez operacional |
| 3 | Retirada nominal (nome do cliente, não só senha/número) | **[FATO]** §1 — `pickup_name`, testado | Pesquisa dedicada (`analise-concorrentes-fluxo-retirada-unica.md`) não encontrou isso em nenhum dos 10 concorrentes estudados nesse fluxo especificamente |
| 4 | QR assinado com HMAC-SHA256 + lock de banco contra dupla coleta | **[FATO]** §1 — `hmac.compare_digest`, `SELECT FOR UPDATE` | **[INFERÊNCIA]** — nenhum concorrente descreve o mecanismo de segurança do próprio QR; mais provável que seja "ninguém comunica" do que "ninguém tem" — comunicar como confiabilidade, não como exclusividade absoluta |
| 5 | Emissão fiscal com reconciliação e cancelamento automáticos | **[FATO]** §7 — job de reconciliação em até 24h, cancelamento na janela de 30min | **[INFERÊNCIA]** — fiscal é quase unânime no mercado (9/12), mas a profundidade operacional (reconciliação automática) não é detalhada por nenhum concorrente pesquisado; comunicar a certeza operacional, não a exclusividade da feature em si |
| 6 | Foco declarado em operação pequena/média, sem piso de faturamento | **[FATO]** §8-10 — sem campo de faturamento mínimo no cadastro/plano | Nola exclui explicitamente quem fatura menos de R$40k/mês; Genesis PRO e Zig miram rede/evento grande — há espaço real no segmento que esses três deixam de fora |
| 7 | Dashboard com quebra por forma de pagamento e por terminal | **[FATO]** §12 — Recharts, `by_method`/`by_terminal`, comparação de período | **[INFERÊNCIA]** — nenhum concorrente pesquisado no material de dashboards expõe essa granularidade especificamente como "liberdade de escolha de pagamento visível no relatório" |

### Nota de mercado — o que "sem lock-in" cobre de verdade hoje

Dado real de fatia de mercado por volume de transação (fonte: UBS BB via FourPay, jan/2026 — pesquisa externa, não documento interno do projeto):

| Adquirente | Fatia do mercado |
|---|---|
| Rede (Itaú) | 18% |
| Cielo | 17% |
| **PagBank** | 17% |
| **Stone** | 15% |
| **Mercado Pago** | 9% |
| GetNet (Santander) | 5% |

**Correção de 2026-09-30, achado que muda a conta pra melhor**: PayGo (já implementado no Ordin) não é "1 adquirente" — é TEF **genuinamente multiadquirente**. Pesquisa externa confirma que o terminal GPOS780 aceita **Cielo, GetNet, PagSeguro, Rede, Safra e Vero** como adquirente configurada (`paygodev.readme.io/docs/terminais-compatíveis`). Isso significa que, só com PayGo + Mercado Pago (os 2 já implementados hoje), o Ordin já alcança — via relação de adquirente, não necessariamente o aparelho físico idêntico — **Cielo (17%) + Rede (18%) + GetNet (5%) + PagSeguro (17%) + Mercado Pago (9%) = ~66% do mercado por volume**, bem mais do que os ~9% estimados antes de confirmar a natureza multiadquirente do PayGo.

**Mas atenção à nuance, não simplificar demais**: isso preserva a **adquirente** (o contrato/relação comercial que o cliente já tem), não garante que o **aparelho físico específico** continue o mesmo — na prática o terminal seria um PayGo-compatível (GPOS780/Sunmi P3), configurado pra liquidar com a adquirente que o cliente já usa. "Mesma adquirente, terminal novo" é uma afirmação sólida; "mesma maquininha" não é, e não deve ser usada.

**Stone e Adyen, verificado via pesquisa externa (2026-09-30), NÃO são multiadquirente** — contrariando a hipótese inicial do usuário: cada uma é seu próprio stack fechado (Stone Connect é "exclusiva da Stone, não multiadquirente"; Adyen é adquirente própria no Brasil). Integrá-las soma só a rede de cada marca (Stone 15%, Adyen irrelevante em SMB no Brasil), não abre acesso a outras adquirentes.

**Implicação pro posicionamento**: a cobertura real de mercado hoje (~66% via PayGo+MP) é muito mais forte do que a versão anterior deste documento estimava — o gargalo não é "quantas adquirentes alcançamos", é a nuance entre "mesma adquirente" e "mesma maquininha física", que precisa ficar clara na página "Como funciona" pra não virar promessa equivocada.

## 3.5. Revisita à Genesis PRO (2026-10-01) — novo diferencial adotado

Usuário revisitou `genesis.pro.br` ao vivo e gostou do hero "O totem que roda em qualquer dispositivo e cabe no seu bolso" (base Android + SO próprio portado pra Windows, R$500-15.000, hardware comprado direto de fábrica). **Achado real: o Ordin é estruturalmente mais forte nesse ponto específico** — o totem do Ordin é app web puro, zero SO próprio, zero porte de plataforma (`01-inventario-produto.md`, §15), enquanto a Genesis precisa manter/portar um SO próprio pra rodar em Windows. Isso vira um novo diferencial defensável (ver `03-posicionamento.md`, seção 3.5), mas sem copiar a faixa de preço de hardware da Genesis (não temos essa definição própria ainda).

## 4. Lacunas de comunicação do mercado (oportunidade, não conquista técnica)

O que os concorrentes têm mas comunicam mal — espaço para o Ordin ocupar com uma mensagem mais honesta, não necessariamente com mais tecnologia:

- **Taxa de MDR é o dado mais opaco do setor** — nenhum dos 12 concorrentes publica percentual de taxa vinculado ao totem/PDV. Um "PDV grátis" de mercado pode custar até 4x mais que um plano pago via MDR forçada (achado de terceiro, não medição própria — não usar como número do Ordin, usar como contexto educativo).
- **Lock-in vendido com linguagem de liberdade** — Goomer usa "flexibilidade de adquirente" pro modelo Mini, mas o SKU irmão (Mini Clover) é travado na BIN/Fiserv sem isso aparecer na página de vendas.
- **"Taxas competitivas" sem número** — Genesis PRO lista "Taxas Exclusivas" (parceria Stone) como feature de plano, sem nunca publicar percentual.
- **Cross-sell vendido como resultado, não como mecanismo** — só a Toast POS (fora da nossa amostra direta) documenta tecnicamente como o cross-sell funciona; os concorrentes brasileiros pesquisados prometem resultado ("+40% ticket") sem abrir como configurar.

**O que o Ordin tem e ninguém fala** (força potencial de mensagem, sem precisar inventar feature nova): estorno automático, retirada nominal, multi-provedor real. Ver seção 3 — a oportunidade aqui é comunicar o que já existe, não construir algo novo.

## 5. Riscos — onde estamos atrás e como tratar no site

| Risco (o que falta) | Amplitude no mercado pesquisado | Tratamento recomendado |
|---|---|---|
| Sem KDS / painel de cozinha | 6 de 7 da amostra têm | **Contornar** — reposicionar como "fluxo direto de pago a pronto para retirada, sem etapa extra de operação"; não mencionar KDS nem como "em breve" sem decisão real de roadmap |
| Sem programa de fidelidade | 4 de 7 da amostra têm | **Omitir** por ora — não é mentira por omissão (é comum um produto de totem não ter fidelidade nativa); se perguntado em venda, responder com honestidade que não é foco atual |
| Sem estoque com ficha técnica/CMV automático | 2 de 7 têm (mas é o core da Nola) | **Omitir/contornar** — o público-alvo do Ordin (pequeno/médio, foco totem) não é o mesmo que busca CMV automatizado tipo ERP; não é prioridade de mensagem |
| Sem multi-loja real (rede com CNPJ próprio por unidade) | Genesis PRO tem, é o público dele | **Contornar declarando o nicho** — Ordin é para operação única com múltiplos totens, não rede/franquia; não competir nesse terreno, deixar claro no site que o produto é para 1 CNPJ, N pontos de venda |
| Sem integração com delivery (iFood/Rappi) | 4 de 7 têm | **Contornar** — Ordin é "produto focado em atendimento presencial no totem", não suíte de gestão completa; framing de foco, não de lacuna |
| Infraestrutura AWS de produção não existe ainda | N/A (interno) | **Omitir totalmente** — nenhuma menção a "nuvem enterprise"/"alta disponibilidade AWS"; mensagem de confiabilidade deve vir de feature testada (ex: "todo pagamento tem proteção automática contra falha"), nunca de escala de infraestrutura |
| App de balcão é web, não nativo instalável | Não comparado diretamente (dado não coletado para os concorrentes) | **Contornar com linguagem literal** — "acesse pelo navegador do celular, sem precisar instalar nada" (na prática é uma vantagem de fricção, não precisa soar como desculpa) |
| PayGo sem reembolso via API (só cancelamento no mesmo dia) | Não comparado (dado técnico interno) | **Omitir do site** — é detalhe operacional de suporte, não mensagem de marketing; processo comercial/suporte deve deixar a política clara no contrato, não na home |

---

Fecha a Fase 2. Próximo passo (Fase 3): ICP, posicionamento em uma frase, 3 pilares de mensagem e respostas às objeções mais prováveis (preço, instalação, suporte, "meu cliente não sabe usar totem") — usando os diferenciais e riscos mapeados acima como matéria-prima.
