---
id: ORD-161
status: Explorer
estimativa: null
tipo: feature
fase: 6
sprint: null
responsavel: Frontend
---

# ORD-161 — Calorias, alérgenos e descrição no totem (cliente final)

## Descrição
`Product` já tem `description`, `calories` e `allergens` cadastrados no admin desde ORD-075
(2026-08-25), mas a exibição desses dados **para o cliente final no totem** ficou de fora daquela
história por decisão do usuário, virando um fast-follow que nunca foi aberto — represado desde
então. Esta história fecha essa lacuna: o totem passa a mostrar calorias, alérgenos e a descrição
curta de cada produto na própria grade do cardápio, sem exigir um toque extra do cliente pra ver
essa informação.

## Persona
**Cliente final** (primária, direta pela primeira vez nesta pendência) — precisa dessa informação
**antes** de decidir o pedido, seja por restrição alimentar (alergia, dieta) ou por escolha
consciente de calorias. Indiretamente, o admin (dono/gerente) que já cadastra esse dado desde
ORD-075 sem nenhum efeito prático até agora — esta história é o que faz o cadastro "valer a pena".

## Contexto
Levantado pelo usuário em 2026-08-25 (durante ORD-075) e mantido como pendência explícita desde
então — decisão registrada em memória de projeto pra não ser esquecida. Pesquisa de mercado feita
em 2026-08-31 (`docs/analise-atributos-opcao-totem.md`) trouxe um dado relevante: **nenhuma fonte
confirma que a RDC 727/2022** (base legal originalmente citada em ORD-075) **se aplique claramente
a cardápio de totem de autoatendimento** — a norma é pensada pra rotulagem de alimento embalado de
prateleira. As outras duas bases legais que ORD-075 cita têm aplicação mais ampla e não têm essa
ressalva: **Lei 10.674/2003** (obrigatoriedade de declarar glúten) e **Lei 12.849/2013** (idem pra
látex). Na prática isso não muda o valor de mostrar a informação — só significa tratar como boa
prática de segurança alimentar e transparência, não citar a RDC 727/2022 como blindagem jurídica
total sem validação de um jurídico especializado, se isso um dia for questionado.

Verificado nesta sessão: nenhum arquivo do totem referencia `calories` ou `allergens` hoje —
`description` (curta) já é exibida na grade desde a conversão pro shadcn+React Aria (experimento
em `experiment/totem-shadcn-react-aria`), então essa parte específica do pedido já está resolvida
e não faz parte do escopo restante. `calories` e `allergens` nem sequer existem no tipo `Product`
do frontend do totem hoje.

## Explorer

### História
Como cliente final usando o totem, quero ver as calorias e os alérgenos de cada produto
diretamente na grade do cardápio, para decidir o meu pedido com informação de segurança alimentar
e nutricional, sem precisar perguntar ao atendente ou adivinhar.

### Contexto e motivação
O admin já cadastra `calories` (número, kcal) e `allergens` (lista de alérgenos oficiais,
ORD-075) por produto — o dado existe e está correto no banco há várias sprints, só nunca chegou à
tela do cliente. **Decisão de escopo:** informação vai direto na grade (card do produto), não
atrás de um toque extra — hoje só produtos com grupo de opção abrem algum tipo de modal antes do
carrinho; a maioria dos produtos vai direto pro carrinho num toque, e esconder alérgeno atrás de
uma ação opcional do cliente enfraquece o propósito de segurança alimentar (cliente com alergia
grave pode não pensar em procurar um "ver mais" antes de tocar). Compacto por natureza: calorias
como texto curto perto do preço, alérgenos como ícones/badges pequenos — não o texto completo do
nome de cada alérgeno (isso fica disponível ao tocar/expandir, não obrigatório pra decisão rápida).

### Fluxo principal
1. Cliente navega até uma categoria no totem.
2. Cada card de produto na grade mostra, quando o produto tiver o dado cadastrado:
   - Calorias, como texto compacto (ex. "480 kcal") próximo ao preço.
   - Alérgenos, como um conjunto pequeno de badges/ícones (ex. "Contém glúten", "Contém leite")
     logo abaixo do nome/descrição.
3. Cliente tocando em qualquer parte informativa do card (não no botão de adicionar) vê a lista
   completa de alérgenos por extenso, caso o card compacto não deixe claro o suficiente (ex. mais
   de 2-3 alérgenos não cabem todos como badge).
4. Produto sem calorias/alérgenos cadastrados não mostra nada a mais — sem placeholder, sem "N/A"
   (mesmo padrão já usado pra tags e descrição, que só aparecem `if (p.campo)`).

### Fluxos alternativos / exceções
- Produto tem 1-2 alérgenos → cabe como badge direto no card, sem precisar expandir.
- Produto tem mais alérgenos do que cabe visualmente no card → mostra os N primeiros + indicador
  tipo "+2" que expande a lista completa ao tocar (decisão de UX a fechar no Tech Explorer/design,
  não trava o Explorer).
- Produto com grupo de opção (já abre modal de seleção hoje) → modal também passa a mostrar
  calorias/alérgenos do produto-base, já que o cliente vai decidir ali mesmo antes de ir pro
  carrinho — mesmo padrão de informação, só em outro lugar da tela.
- Produto sem `calories` nem `allergens` cadastrados → card continua exatamente como está hoje,
  sem nenhuma mudança visual.

### Dependências
- Serviços envolvidos: só `frontend/totem` (`CatalogScreen.tsx`, `types.ts`) — `calories` e
  `allergens` já existem em `ProductOut` (catalog-service) e já voltam em `GET /catalog/products`
  hoje, sem precisar de nenhuma mudança de backend.
- Sem histórias bloqueantes. Depende conceitualmente do dado já existir (ORD-075), que já está em
  produção.
- Fora de escopo, decidido nesta sessão: exibir alérgeno/descrição/calorias no nível de `Option`
  (sabor/variante) — ver `docs/analise-atributos-opcao-totem.md`. Essa história resolve primeiro o
  nível de `Product`; `Option` fica como próxima história natural, só depois desta.

### Critérios de aceite funcionais
- [ ] Produto com `calories` cadastrado mostra o valor (formato "XXX kcal") na grade, perto do
      preço.
- [ ] Produto com um ou mais `allergens` cadastrados mostra badges/ícones identificando cada
      alérgeno na grade.
- [ ] Produto sem `calories`/`allergens` cadastrados não mostra nenhum elemento a mais (sem
      placeholder vazio).
- [ ] Cliente consegue ver a lista completa de alérgenos por extenso quando o produto tem mais
      alérgenos do que cabe compacto no card.
- [ ] Modal de seleção de opção (produtos com `option_groups`) também mostra calorias/alérgenos do
      produto-base.
- [ ] Sem regressão visual nos demais elementos do card (nome, descrição, imagem, tags, preço,
      botão de adicionar).

### Wireframe / Mockup
N/A — reaproveita o padrão visual já existente de `Badge` (shadcn) usado hoje pra tags e pro selo
"Combo" no mesmo arquivo.
