---
id: ORD-161
status: Tech Explorer
estimativa: 2 pontos (frontend/totem)
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

## QA Explorer

```gherkin
Feature: Calorias, alérgenos e descrição do produto no totem
  Como cliente final usando o totem
  Quero ver calorias e alérgenos de cada produto na grade do cardápio
  Para decidir meu pedido com informação de segurança alimentar e nutricional

  Background:
    Dado o produto ativo "Cheeseburger Clássico" na categoria "Lanches"

  Scenario: Produto com calorias cadastradas mostra o valor no card
    Dado "Cheeseburger Clássico" com calories: 650
    Quando o cliente navega até a categoria "Lanches"
    Então o card de "Cheeseburger Clássico" mostra "650 kcal" perto do preço

  Scenario: Produto com um alérgeno cadastrado mostra o badge no card
    Dado "Cheeseburger Clássico" com o alérgeno "Glúten" cadastrado
    Quando o cliente navega até a categoria "Lanches"
    Então o card mostra um badge identificando "Glúten"

  Scenario: Produto com múltiplos alérgenos mostra todos que couberem, sem cortar informação
    Dado "Cheeseburger Clássico" com os alérgenos "Glúten", "Leite" e "Ovo" cadastrados
    Quando o cliente navega até a categoria "Lanches"
    Então o card mostra badges pros alérgenos que couberem
    E, se nem todos couberem, mostra um indicador (ex. "+1") que ao ser tocado exibe a lista
    completa por extenso

  Scenario: Produto sem calorias nem alérgenos não mostra nenhum elemento extra
    Dado um produto ativo sem calories e sem allergens cadastrados
    Quando o cliente navega até a categoria dele
    Então o card não mostra nenhum badge de alérgeno nem texto de calorias
    E o restante do card (nome, descrição, imagem, preço, botão de adicionar) aparece normalmente

  Scenario: Produto com grupo de opção mostra calorias/alérgenos também no modal de seleção
    Dado "Cheeseburger Clássico" com calories: 650, alérgeno "Glúten" e um grupo de opção
    "Ponto da carne" vinculado
    Quando o cliente toca no produto pra adicionar
    Então o modal de seleção de opção abre
    E mostra "650 kcal" e o badge de "Glúten" junto das informações do produto

  Scenario: Produto sem grupo de opção continua indo direto pro carrinho
    Dado "Suco de Laranja" sem grupo de opção, com calories cadastradas
    Quando o cliente toca no botão de adicionar
    Então o produto é adicionado ao carrinho normalmente, sem nenhum modal interposto
    E a informação de calorias já era visível no card antes do toque

  Scenario: Sem regressão visual nos demais elementos do card
    Dado "Cheeseburger Clássico" com tags, descrição curta, imagem, calorias e alérgenos, todos
    cadastrados ao mesmo tempo
    Quando o cliente navega até a categoria "Lanches"
    Então nome, descrição, imagem, tags, preço e botão de adicionar continuam aparecendo como
    hoje, sem sobreposição nem corte de layout
```

**Cenários revisados e aprovados pelo PM:** sim — cobrem happy path (calorias e alérgenos
aparecendo), a borda mais delicada (muitos alérgenos não cabendo no card compacto), o caso "nada
cadastrado" (sem placeholder vazio, critério explícito do Explorer), o modal de opção herdando a
mesma informação, e não-regressão do restante do card.

## Solução Técnica

### Serviços impactados
Só `frontend/totem` (`types.ts`, `CatalogScreen.tsx`). **Nenhuma mudança de backend** —
`ProductOut` (catalog-service) já devolve `calories: int | None` e `allergens: list[AllergenOut]`
desde ORD-075; `GET /catalog/products` já traz os dois campos hoje, o totem só nunca os tinha no
tipo `Product` nem os renderizava.

### Mudança de tipo (`frontend/totem/src/types.ts`)
```ts
// Mesmo formato de AllergenOut (catalog-service) — já existe idêntico em
// frontend/admin/src/types.ts, replicado aqui porque totem e admin não
// compartilham types.ts.
export interface Allergen {
  id: number;
  code: string;
  name: string;
  category: string | null;
}

export interface Product {
  id: number;
  category_id: number;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  tags?: string[] | null;
  option_groups?: ProductOptionGroup[];
  related_products?: RelatedProduct[];
  // ORD-161
  calories?: number | null;
  allergens?: Allergen[];
}
```

### Mudança de implementação (`CatalogScreen.tsx`)

**Card do produto (grade) — badges de alérgeno + kcal perto do preço:**
```tsx
{p.allergens && p.allergens.length > 0 && (
  <div className="flex flex-wrap items-center gap-1">
    {p.allergens.slice(0, 2).map((a) => (
      <Badge key={a.id} variant="secondary" style={{ fontFamily: FONT_B, fontSize: FONT.label }}>
        {a.name}
      </Badge>
    ))}
    {p.allergens.length > 2 && (
      <Badge
        variant="outline"
        className="cursor-pointer"
        onClick={() => setAllergenDetail(p)}
        style={{ fontFamily: FONT_B, fontSize: FONT.label }}
      >
        +{p.allergens.length - 2}
      </Badge>
    )}
  </div>
)}
<div className="flex items-baseline gap-2">
  <span className="text-price" style={{ fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.bodyLg }}>
    {fmt(p.price)}
  </span>
  {p.calories != null && (
    <span className="text-muted-foreground" style={{ fontFamily: FONT_B, fontSize: FONT.label }}>
      {p.calories} kcal
    </span>
  )}
</div>
```

**Novo estado + Dialog compacto pra lista completa de alérgenos** (só quando não cabem 2 badges):
```ts
const [allergenDetail, setAllergenDetail] = useState<Product | null>(null);
```
```tsx
<Dialog isOpen={!!allergenDetail} onOpenChange={(open) => !open && setAllergenDetail(null)} className="sm:max-w-[420px] p-8 flex flex-col gap-3">
  {allergenDetail && (
    <>
      <DialogTitle style={{ fontFamily: FONT_D, color: T.text, fontWeight: 800, fontSize: FONT.subtitle }}>
        Alérgenos — {allergenDetail.name}
      </DialogTitle>
      <div className="flex flex-wrap gap-1.5">
        {allergenDetail.allergens?.map((a) => (
          <Badge key={a.id} variant="secondary">{a.name}</Badge>
        ))}
      </div>
    </>
  )}
</Dialog>
```

**Modal de opção (`optionModal`) — mesma informação, junto do "A partir de R$X":**
```tsx
<div className="text-muted-foreground mt-1" style={{ fontFamily: FONT_B, fontSize: FONT.label }}>
  A partir de {fmt(optionModal.product.price)}
  {"calories" in optionModal.product && optionModal.product.calories != null && ` · ${optionModal.product.calories} kcal`}
</div>
{"allergens" in optionModal.product && optionModal.product.allergens && optionModal.product.allergens.length > 0 && (
  <div className="flex flex-wrap gap-1">
    {optionModal.product.allergens.map((a) => <Badge key={a.id} variant="secondary">{a.name}</Badge>)}
  </div>
)}
```
`"calories" in optionModal.product` — necessário porque `optionModal.product` é `Product | RelatedProduct`
(ORD-160) e `RelatedProduct` não tem esses campos; guarda de tipo evita erro de compilação sem
precisar estender `RelatedProduct` (produto sugerido correlacionado não precisa mostrar
calorias/alérgenos nesta história — decisão de escopo, ver seção de riscos).

### Eventos de fila
Nenhum.

### Impacto em outros serviços
Nenhum — puramente exibição, nenhum dado novo é lido, gravado ou transformado.

### Estimativa
- Totem: 2 pontos (tipo + badges no card + Dialog de detalhe + mesma info no modal de opção).

### Riscos
- **`RelatedProduct` (ORD-160) não ganha calorias/alérgenos nesta história** — produto sugerido
  como correlacionado não mostra essa informação no modal de sugestão. Decisão deliberada de
  escopo (evita reabrir e re-testar o ORD-160 recém-fechado); se o usuário quiser paridade total,
  vira ajuste pequeno depois (mesmo padrão de `option_groups` que já foi adicionado ao
  `RelatedProductOut`).
- **Card mais cheio visualmente** — produto com tags E alérgenos E calorias ao mesmo tempo pode
  deixar o card denso. Mitigado pelo limite de 2 badges + "+N" (critério de aceite já cobre isso),
  mas vale validação visual manual depois de implementado, com um produto que tenha os três ao
  mesmo tempo (nenhum produto de seed hoje tem isso simultaneamente, precisa cadastrar um de teste).
- **Nenhum risco de regressão de dado** — campos já existem e já são populados pelo backend desde
  ORD-075; é estritamente aditivo do lado do totem.
