# 06 — Copy da página "Como funciona"

**Fase:** 4 — Site (continuação) · **Status:** rascunho para aprovação
**Base:** `04-arquitetura-site.md` (papel desta página) + `01-inventario-produto.md` (fato de código, única fonte de verdade pro que pode ser afirmado aqui).

**Papel desta página, para não repetir a Home:** aqui é onde a profundidade técnica vira confiança. A Home convence em bullets; esta página prova com detalhe suficiente pra alguém já convencido do pitch decidir agendar a demo. Cada afirmação abaixo cita a seção correspondente de `01-inventario-produto.md`.

---

## Seção 1 — Intro da página

**Headline:**
> Do pedido à nota fiscal, cada passo explicado

**Subhead:**
> Nada aqui é promessa — é o que o sistema realmente faz, hoje.

---

## Seção 2 — O fluxo do cliente no totem

**Headline:**
> O que o seu cliente vê, do início ao fim

**Subhead:**
> Simples o bastante pra quem nunca usou um totem na vida.

**Passo a passo (fato, `01`, §15):**
1. **Tela de espera** — vídeo do seu cardápio em rotação, já ensinando visualmente antes mesmo do primeiro toque
2. **Catálogo** — produtos com fotos, grupos de opção resolvidos num único mecanismo (ex: "escolha o sabor", com mínimo e máximo claros)
3. **Tipo de consumo** — local ou para levar
4. **CPF na nota — opcional** — ninguém trava o pedido por não querer digitar documento
5. **Nome de retirada** — seu cliente é chamado pelo nome, não só por um número
6. **Pagamento** — cartão ou PIX, com a adquirente que você já usa
7. **Ticket com QR** — pronto pra retirada, com proteção contra coleta duplicada

**Detalhe de confiabilidade (fato, `01`, §15):** se o cliente ficar parado no meio do fluxo, aparece um aviso antes de qualquer coisa reiniciar — o totem nunca "trava" sem explicação.

**CTA:** "Ver como funciona o pagamento" → âncora seção 3 desta página

**Prova sugerida:** **[A COLETAR]** — vídeo real do fluxo rodando, ou GIF curto de cada passo. Até existir, usar ilustração/mockup do catálogo real (não captura de tela do `frontend/totem-v3.tsx`/`totem.tsx` da raiz — são protótipos, não o produto, `01-inventario-produto.md` §15).

---

## Seção 3 — Pagamento, sem susto

**Headline:**
> Sua adquirente continua sendo sua

**Subhead:**
> Cielo, Rede, GetNet, PagSeguro, Mercado Pago, Stone ou Adyen — você escolhe como recebe. A gente não embute uma taxa própria disfarçada de "totem grátis".

**Bullets (fato, `01`, §6):**
- Via PayGo, compatível com as adquirentes que a maioria dos negócios já usa — Cielo, Rede, GetNet, PagSeguro
- Mercado Pago, Stone e Adyen disponíveis diretamente
- Nenhuma taxa própria da Ordin embutida no preço do sistema
- Se uma venda for aprovada mas algo falhar depois (ex: produto esgotou no fechamento), o estorno acontece sozinho — seu cliente não precisa brigar por reembolso

**Nuance que precisa estar explícita nesta página (não simplificar):**
> Manter sua adquirente é diferente de manter o mesmo aparelho físico. Na prática, você recebe um terminal novo, configurado pra continuar liquidando com a adquirente que você já tem — sua conta, seu contrato, sua taxa negociada continuam os mesmos. O que muda é só a máquina em cima do balcão.

**CTA:** "Falar sobre qual adquirente eu uso" → `/demo`

**Prova sugerida:** nenhuma estatística necessária — a prova é a transparência da nuance em si (dizer isso com clareza já diferencia o Ordin da opacidade mapeada no setor, `02-concorrencia-matriz.md`, seção 4).

---

## Seção 4 — Fiscal, no automático

**Headline:**
> Nota fiscal emitida sozinha, venda por venda

**Subhead:**
> Sem depender de alguém lembrar de rodar nada no fim do dia, sem módulo fiscal separado pra configurar.

**Bullets (fato, `01`, §7):**
- Emissão de NFC-e automática a cada venda aprovada
- Se uma nota ficar pendente por qualquer motivo, o sistema tenta de novo sozinho por até 24h
- Se o pagamento for cancelado ou estornado, a nota é cancelada automaticamente dentro do prazo

**CTA:** "Entender o módulo fiscal" → `/demo`

**Prova sugerida:** nenhuma estatística necessária — mecanismo de reconciliação automática já é a prova.

---

## Seção 5 — O painel administrativo

**Headline:**
> Seu cardápio, suas regras, seus números

**Subhead:**
> Tudo que você precisa pra rodar o dia a dia, num painel só.

**Bullets (fato, `01`, §4, §5, §12):**
- Cardápio com fotos, categorias, combos, grupos de opção e alérgenos (conforme RDC 727/2022)
- Programação de cardápio por horário, pra itens que só fazem sentido em parte do dia
- Controle de estoque com bloqueio automático de produto esgotado — ninguém pede o que acabou
- Relatórios de receita e ticket médio, com comparação de período, quebra por terminal e por forma de pagamento, exportável em CSV

**Ressalva honesta, incluir sem medo (fato, `01`, §12):** o painel não calcula "produtos mais vendidos" automaticamente a partir das vendas — isso ainda é uma etiqueta que você mesmo marca no cadastro do produto, não um ranking gerado pelo sistema.

**CTA:** "Agendar uma conversa" → `/demo`

**Prova sugerida:** **[A COLETAR]** — screenshot real do painel de relatórios (Recharts, `DashboardScreen.tsx`) — existe hoje, só falta decidir qual tela exata vai ao ar (atenção: tirar print de dado real de cliente exigiria anonimização, usar ambiente demo).

---

## Checklist de guardrail antes de publicar esta página

Reler frase por frase contra a tabela "O que NÃO prometer no site" de `01-inventario-produto.md` antes de publicar. Específico pra esta página, maior risco de deslize:
- [ ] Nenhuma menção a "painel de cozinha" ou "KDS" na seção 5
- [ ] Nenhuma menção a "funciona offline" na seção 2
- [ ] Seção 5 não usa a palavra "ranking" ou "mais vendidos" como se fosse cálculo automático
- [ ] Seção 3 mantém a distinção "adquirente" vs. "maquininha física" exatamente como redigida acima
- [ ] Nenhum logo de Stone/Adyen publicado sem confirmar diretriz de marca do provedor (ver `07-copy-precos.md`, pendência de hardware, e nota de dependência em `05-copy-home.md`)
