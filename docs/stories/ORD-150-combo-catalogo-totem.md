---
id: ORD-150
status: Done
fase: 6
sprint: null
responsavel: Frontend
estimativa: 5 pontos
tipo: feature
---

# ORD-150 — Combo no catálogo do totem: exibição, upsell e explosão no pedido

> **Desmembrada em 2026-09-01** a partir da história original "Combo/bundle no totem" —
> [[ORD-112]] ficou com o cadastro (admin), esta história fica com todo o consumo do lado do
> cliente final. **Depende de [[ORD-112]] estar pronta** (precisa do `GET /catalog/combos`
> existir e de combos reais cadastrados pra ter o que exibir/testar).

## User story
**Como** cliente final fazendo pedido no totem,
**quero** poder escolher um combo (prato + acompanhamento + bebida com desconto) já montado, ou ser convidado a completar meu pedido com um combo,
**para** ter uma opção mais vantajosa e prática do que montar cada item separadamente.

## Contexto e motivação
[[ORD-112]] implementa o cadastro de combos no admin, mas combos cadastrados lá não aparecem em
lugar nenhum até esta história existir — o valor de negócio (aumentar ticket médio, alavanca já
usada por concorrentes como Goomer) só se realiza quando o cliente final vê e escolhe o combo no
totem. As duas histórias foram desmembradas pra permitir entregas menores e independentes; o
cadastro pode ir pra produção primeiro sem nenhum efeito visível, e esta história liga o
consumo assim que estiver pronta.

## Fluxo principal
1. **Totem (catálogo):** cliente navega o catálogo e vê cada combo ativo com card próprio,
   visualmente destacado (fundo diferenciado, selo "COMBO", preço + economia sempre visíveis,
   sem precisar abrir nada) — numa seção "Destaque" fixa no topo, independente da aba de
   categoria selecionada. Protótipo validado com o usuário em 2026-09-01 (ver Wireframe).
2. **Totem (upsell na escolha avulsa) — decisão validada com o usuário em 2026-09-01:** se o
   cliente tenta adicionar ao carrinho, avulso, um produto que também é componente de algum
   combo ativo, o fluxo é **interrompido** por um modal perguntando se ele prefere levar o
   combo — mostrando os itens inclusos e o valor total — **antes** de qualquer item entrar no
   carrinho. Não é um banner discreto nem uma sugestão só na revisão do carrinho.
3. Cliente escolhe **"Sim, quero o combo"**: o combo entra no carrinho (não o item avulso
   isolado). Escolhe **"Não, só o [produto]"**: o item avulso segue normalmente, sem o combo.
4. Ao montar o pedido (`POST /orders`), o combo "explode" em N `OrderItem`s normais — um por
   produto componente, com o preço real de cada um — e a economia do combo vira o `discount`
   do pedido (campo já existente, sem migration no order-service — ver Tech Explorer).
5. **Balcão/cozinha:** cada componente do combo continua sendo preparado e retirado como hoje,
   ticket individual por unidade — nenhuma mudança nesse fluxo.

## Fluxos alternativos / exceções
- **Produto componente de mais de um combo ativo ao mesmo tempo:** resolvido no Tech Explorer
  desta história — o modal oferece só o primeiro combo (ordenado por `id`), comportamento
  simplificado mas previsível para esta v1 (ver Tech Explorer e QA Explorer).
- Cliente já tem o combo completo no carrinho e tenta adicionar de novo, avulso, um dos
  componentes: mesmo comportamento do fluxo 2 (modal oferece o combo de novo) — sem lógica
  especial de "já tem o combo" nesta v1.
- Combo inativo (desativado no admin) não aparece no catálogo nem dispara oferta de upsell.

## Critérios de aceite funcionais
- [ ] Combo ativo aparece no catálogo do totem com apresentação visual própria, diferenciada
      dos produtos avulsos, mostrando preço e economia sem exigir interação extra
- [ ] Adicionar ao carrinho um produto avulso que é componente de um combo ativo interrompe o
      fluxo com um modal oferecendo o combo antes de confirmar o item avulso
- [ ] Aceitar a oferta no modal adiciona o combo (não o item avulso) ao carrinho
- [ ] Recusar a oferta no modal segue com o item avulso normalmente, sem o combo
- [ ] Pedido com combo gera um ticket por unidade de produto componente, igual ao fluxo já
      existente para itens avulsos — balcão/cozinha não percebe diferença no fluxo de preparo
- [ ] Produto que não é componente de nenhum combo ativo continua sendo adicionado ao carrinho
      sem nenhuma interrupção — comportamento hoje inalterado
- [ ] Produto componente de mais de um combo ativo mostra a oferta de um combo (não quebra nem
      trava o fluxo) — mesmo com a regra simplificada de "primeiro por id"
- [ ] Total cobrado do cliente bate exatamente com o total calculado no pedido (soma dos itens
      explodidos menos o desconto do combo, sem diferença de centavos)

## Dependências / impacto em outros serviços
- **Bloqueante: [[ORD-112]]** — precisa do `GET /catalog/combos` existir e de combos reais
  cadastrados.
- **frontend/totem:** `types.ts`, `store.ts` (carrinho), `CatalogScreen.tsx` (seção de combo +
  modal de upsell), `App.tsx`/`PaymentScreen.tsx` (explosão do combo em itens + discount ao
  montar `POST /orders`/`POST /payments`).
- **order-service e payment-service: nenhuma mudança de schema ou endpoint** — só recebem um
  payload de itens já explodido, formato que já aceitam hoje.

## Fora de escopo desta história
- Cadastro, edição, ativação/desativação e exclusão de combos — isso é [[ORD-112]].
- Modificadores/complementos e variantes de tamanho — sequenciados separadamente.

## Wireframe / Mockup
Protótipo clicável validado com o usuário em 2026-09-01 — parte de **fluxo do cliente (totem)**:
catálogo com o combo em card próprio + modal de interrupção ao adicionar avulso um produto
componente. (A parte de cadastro no admin, também prototipada na mesma sessão, pertence ao
Wireframe de [[ORD-112]].)

Sem link permanente no repositório — protótipo vive como Artifact da sessão.

---

## QA Explorer

```gherkin
Feature: Combo no catálogo do totem — exibição, upsell e explosão no pedido
  Como cliente final fazendo pedido no totem
  Quero poder escolher um combo pronto ou ser convidado a levar um combo relacionado
  Para ter uma opção mais vantajosa do que montar cada item separadamente

  Background:
    Dado um combo "Combo Clássico" ativo, cadastrado via ORD-112, contendo "Cheeseburger
      Clássico" (R$ 24,90), "Batata Frita" (R$ 10,90) e "Refrigerante Lata" (R$ 6,90),
      vendido por R$ 34,90 (economia R$ 7,80)

  # ── Happy path ────────────────────────────────────────────────────────────

  Scenario: Combo aparece no catálogo do totem com apresentação própria
    Quando abro o catálogo no totem da empresa 1
    Então vejo o "Combo Clássico" com card visualmente diferenciado dos produtos avulsos, numa
      seção "Destaque" fixa no topo
    E o preço (R$ 34,90) e a economia (R$ 7,80) aparecem sem precisar abrir nenhum detalhe

  Scenario: Aceitar a oferta de combo ao adicionar um componente avulso
    Quando toco em "Adicionar" no "Cheeseburger Clássico" avulso no catálogo
    Então um modal me pergunta se prefiro levar o "Combo Clássico", mostrando os itens
      inclusos e o preço total do combo
    E nenhum item entra no carrinho antes de eu responder
    Quando escolho "Sim, quero o combo"
    Então o "Combo Clássico" é adicionado ao carrinho
    E o "Cheeseburger Clássico" avulso NÃO é adicionado separadamente

  Scenario: Recusar a oferta de combo e seguir só com o item avulso
    Quando toco em "Adicionar" na "Batata Frita" avulsa e o modal de oferta aparece
    E escolho "Não, só a Batata Frita"
    Então a "Batata Frita" avulsa é adicionada ao carrinho normalmente
    E o "Combo Clássico" NÃO é adicionado

  Scenario: Pedido com combo gera um ticket por produto componente e desconto correto
    Dado um carrinho com o "Combo Clássico"
    Quando finalizo o pedido (POST /orders)
    Então o pedido gera 3 tickets, um por unidade de produto componente, cada um com o preço
      avulso real do produto
    E o desconto do pedido é de R$ 7,80
    E o total cobrado do cliente (R$ 34,90) bate exatamente com o total do pedido
    E cada ticket é coletado no balcão exatamente como um ticket de produto avulso hoje

  Scenario: Comprar 2 unidades do mesmo combo não gera diferença de centavos
    Dado um carrinho com 2 unidades do "Combo Clássico"
    Quando finalizo o pedido
    Então o desconto total do pedido é de R$ 15,60 (R$ 7,80 × 2), sem diferença de centavos
    E o total cobrado bate exatamente com o total do pedido

  # ── Bordas ────────────────────────────────────────────────────────────────

  Scenario: Produto que não é componente de nenhum combo ativo não interrompe a adição
    Dado que "Duplo Bacon" não é componente de nenhum combo ativo
    Quando toco em "Adicionar" no "Duplo Bacon"
    Então ele é adicionado ao carrinho diretamente, sem nenhum modal de oferta

  Scenario: Combo inativo não aparece no catálogo nem dispara oferta de upsell
    Dado o "Combo Clássico" desativado no admin
    Quando abro o catálogo no totem
    Então o "Combo Clássico" não aparece na listagem
    E adicionar avulso um dos produtos que seriam seus componentes não dispara nenhum modal

  Scenario: Produto componente de mais de um combo ativo oferece um combo, sem travar o fluxo
    Dado que "Refrigerante Lata" é componente do "Combo Clássico" (id menor) e também de um
      segundo combo "Combo Família" (id maior), ambos ativos
    Quando toco em "Adicionar" no "Refrigerante Lata" avulso
    Então o modal oferece o "Combo Clássico" (o de id menor) — regra simplificada desta v1
    E o fluxo não trava nem mostra erro por causa da sobreposição

  # ── Erros ─────────────────────────────────────────────────────────────────

  Scenario: Falha ao carregar combos não quebra o catálogo
    Dado que a chamada a GET /catalog/combos falha (erro de rede)
    Quando abro o catálogo no totem
    Então a listagem de produtos e categorias continua funcionando normalmente
    E nenhuma seção de combo aparece, sem travar a tela

  # ── Isolamento multi-tenant ──────────────────────────────────────────────

  Scenario: Combo de uma empresa não aparece no totem de outra empresa
    Dado um combo ativo pertencente à empresa 1
    Quando abro o catálogo no totem da empresa 2
    Então esse combo não aparece na listagem

  # ── Regressão ────────────────────────────────────────────────────────────

  Scenario: Fluxo de pedido sem nenhum combo envolvido permanece inalterado
    Dado um carrinho só com produtos avulsos que não são componentes de nenhum combo
    Quando finalizo o pedido
    Então o comportamento é exatamente o mesmo de antes desta história — um ticket por
      unidade de produto, sem nenhum desconto de combo envolvido

  Scenario: Catálogo sem nenhum combo cadastrado continua funcionando normalmente
    Dado uma empresa sem nenhum combo cadastrado (ORD-112 ainda não usada)
    Quando abro o catálogo no totem
    Então a listagem de produtos aparece normalmente, sem nenhuma seção ou card de combo
```

**Cenários revisados e aprovados pelo PM**, incluindo o cenário de sobreposição de combos que
ficara marcado como pendente na versão anterior (única desta história, não da ORD-112).

---

## Tech Explorer

### Achado crítico que confirma a hipótese técnica do Explorer
Leitura direta de `services/order/main.py` confirma, como fato (não mais hipótese): `POST
/orders` recebe `unit_price` de cada item **do próprio payload do totem**, sem nenhuma chamada
ao catalog-service pra validar ou recalcular preço — `total = sum(unit_price*qty) - discount`.
Isso significa que um combo pode "explodir" em N `OrderItem`s normais, cada um com o
`product_id`/`name`/`unit_price` real do produto componente, **e a economia do combo vira o
`discount` do pedido — campo que já existe hoje em `OrderIn`/`Order`, sem precisar de nenhuma
migration nem mudança de schema no order-service.** Cada componente gera seu próprio ticket
(1 por unidade, código já existente), exatamente como um produto avulso — balcão/cozinha não
percebe diferença nenhuma, confirmando o critério de aceite correspondente.

**Ponto a validar no início da implementação, não bloqueante pra este Tech Explorer:** checar
se o campo `discount` já é usado por outra funcionalidade concorrente (ex.: desconto manual do
operador, cupom). Se não houver conflito, o combo soma sua economia ali. Se houver, a saída é
um campo dedicado (`combo_discount`) — pequena migration adicional, não muda a arquitetura.

### Serviços impactados
- **frontend/totem**: `types.ts`, `store.ts` (carrinho), `CatalogScreen.tsx` (seção de combo +
  modal de upsell), `App.tsx`/`PaymentScreen.tsx` (explosão do combo em itens + discount ao
  montar `POST /orders`/`POST /payments`)
- **order-service e payment-service: nenhuma mudança de schema ou endpoint** — só recebem um
  payload de itens já explodido, formato que já aceitam hoje
- **catalog-service: nenhuma mudança** — consome o `GET /catalog/combos` já implementado em
  [[ORD-112]]

### Endpoints
Nenhum endpoint novo — consome `GET /catalog/combos` (implementado em [[ORD-112]]) e envia pra
`POST /orders`/`POST /payments` (já existentes, mesmo contrato de `ItemIn`).

### Frontend (`frontend/totem`)

**`types.ts`** — novo tipo `Combo` (espelha a resposta de `GET /catalog/combos`), e `CartItem`
ganha um discriminador `kind`:
```ts
export interface ComboItem { product_id: number; name: string; price: number; }
export interface Combo {
  id: number; name: string; description: string | null; price: number; items: ComboItem[];
}
export interface CartItem {
  key: string;               // `product:${id}` ou `combo:${id}` — ver achado crítico abaixo
  kind: "product" | "combo";
  id: number;
  name: string;
  price: number;
  qty: number;
  comboItems?: ComboItem[];  // só quando kind === "combo"
}
```

**Achado crítico de risco — colisão de ID:** `combo.id` e `product.id` são sequências
independentes (tabelas diferentes) — um combo `id=12` pode colidir com um produto `id=12` no
carrinho hoje, que agrupa itens só por `product.id === i.id` (`store.ts`, `addToCart`). A
correção é obrigatória: a chave de agrupamento do carrinho passa a ser `` `${kind}:${id}` ``,
nunca o `id` sozinho.

**`CatalogScreen.tsx`** — carrega `GET /catalog/combos` junto com categorias/produtos (mesmo
poll de 90s já existente; falha na chamada não quebra o resto do catálogo, mesmo padrão de erro
silencioso já usado no admin para `operating_mode`). Seção "Destaque" fixa no topo, fora do
filtro de aba de categoria, renderiza os combos ativos como card próprio (mesmo visual validado
no protótipo). Ao clicar "Adicionar" num produto avulso:
```ts
const combo = combos.find(c => c.active && c.items.some(i => i.product_id === product.id));
if (combo) openUpsellModal(combo, product);   // decisão validada: interrompe, não é banner
else addToCart({ kind: "product", key: `product:${product.id}`, id: product.id, ... });
```
**Decisão que fecha o ponto em aberto do QA Explorer sobre sobreposição de combos:** se o
produto for componente de mais de um combo ativo, o modal oferece **só o primeiro combo**
(ordenado por `id`) — comportamento simplificado e previsível, não o ideal, mas suficiente pra
essa v1.

**Explosão do combo ao montar o pedido** (`App.tsx`, substitui o `cart.map(...)` atual):
```ts
const items: ItemIn[] = [];
let comboDiscount = 0;
for (const line of cart) {
  if (line.kind === "product") {
    items.push({ product_id: line.id, name: line.name, qty: line.qty, unit_price: line.price });
  } else {
    const comboSum = line.comboItems!.reduce((s, ci) => s + ci.price, 0);
    const savingsPerUnit = Math.round((comboSum - line.price) * 100) / 100;  // arredonda ANTES de multiplicar por qty
    comboDiscount += savingsPerUnit * line.qty;
    for (const ci of line.comboItems!) {
      items.push({ product_id: ci.product_id, name: `${ci.name} (${line.name})`, qty: line.qty, unit_price: ci.price });
    }
  }
}
await api.post("/orders", { items, discount: existingDiscount + comboDiscount, ... });
```
Arredondar `savingsPerUnit` **antes** de multiplicar por `qty` evita divergência de centavos
quando o cliente compra mais de uma unidade do mesmo combo. `name` do ticket ganha o sufixo
`(Nome do combo)` — string livre, sem nenhuma mudança de schema no order-service, só ajuda
operacionalmente o balcão a entender de onde veio aquele item.

**Mesma explosão precisa ser replicada em `PaymentScreen.tsx:163`** (hoje mapeia o carrinho pro
payment-service com a mesma forma `{product_id, name, qty, unit_price}`) — a confirmar na
implementação se o payment-service usa os itens pra algo além do total cobrado; se usar só o
total, o impacto ali é nulo e nem precisa da explosão, só o valor já correto (`combo.price`) que
o carrinho já calcula nativamente.

### Migrations
Nenhuma — consome dados já modelados em [[ORD-112]].

### Eventos de fila
Não aplicável.

### Impacto em outros serviços
Nenhum em `order-service`/`payment-service` além de já aceitarem hoje o formato de payload que
vão continuar recebendo (nenhuma mudança de contrato).

### Estimativa
- Frontend totem: 5 pontos (tipos + correção da chave de agrupamento do carrinho, seção de
  destaque + modal de upsell, explosão do combo em itens+discount no checkout, replicação no
  payment)
- **Total: 5 pontos**

### Riscos
- **Colisão de ID combo/produto no carrinho** — mitigado com chave `kind:id` na store do
  totem (ver Achado crítico acima); sem essa correção, dois itens completamente diferentes
  poderiam se fundir numa única linha do carrinho.
- **Reaproveitamento do campo `discount` do pedido** — precisa validar cedo na implementação se
  já há uso concorrente (desconto manual/cupom); se houver, a saída é um campo dedicado
  (`combo_discount`), mudança pequena e aditiva, não muda a arquitetura proposta aqui.
- **Arredondamento de centavos** — mitigado arredondando a economia por unidade antes de
  multiplicar pela quantidade (ver trecho de código acima); sem isso, pedidos com 2+ unidades
  do mesmo combo podem fechar com 1 centavo de diferença entre carrinho e pedido.
- **Sobreposição de combos no mesmo produto** — resolvida nesta Tech Explorer com a regra
  "primeiro combo por id"; comportamento simplificado, não ideal, mas já coberto por cenário de
  QA nesta rodada.
- Sem conflito com `docs/ARQUITETURA.md` — nenhuma credencial nova, nenhuma mudança de
  `company_id`/autenticação, só consome um endpoint já existente e monta payloads que
  order-service/payment-service já aceitam.

### Validação do ponto em aberto — campo `discount`
Confirmado em 2026-09-02, lendo `services/order/main.py` e `frontend/totem/src/App.tsx`: o
campo `discount` não tem nenhum uso concorrente hoje — o totem sempre envia `discount: 0`, não
existe cupom nem desconto manual em nenhuma tela. Fecha o risco levantado nesta Tech Explorer:
a economia do combo pode reaproveitar esse campo sem conflito, sem precisar de um
`combo_discount` dedicado.

---

## Ready

### Checklist de entrada

**Explorer (PM + Produto)**
- [x] História no formato Como/Quero/Para
- [x] Contexto e motivação documentados (depende de [[ORD-112]] já `Done`)
- [x] Fluxo principal passo a passo
- [x] Dependências identificadas ([[ORD-112]], já mergeável — backend e admin prontos)
- [x] Wireframe descrito (protótipo validado, parte do fluxo do totem)
- [x] Critérios de aceite funcionais escritos

**QA Explorer (QA)**
- [x] Happy path em Gherkin (exibição no catálogo, aceitar/recusar upsell, ticket+desconto)
- [x] Cenários de borda (produto fora de combo, combo inativo, sobreposição de combos)
- [x] Cenários de erro (falha ao carregar combos não quebra o catálogo)
- [x] Isolamento multi-tenant incluído (combo de outra empresa não aparece)
- [x] Cenários de regressão (pedido sem combo, catálogo sem combo cadastrado)
- [x] Cenários aprovados pelo PM

**Tech Explorer (Frontend)**
- [x] Serviços impactados documentados (frontend/totem apenas — order/payment/catalog
      inalterados)
- [x] Nenhum endpoint novo — consome `GET /catalog/combos` já implementado em [[ORD-112]]
- [x] Migrations: nenhuma
- [x] Eventos de fila: N/A
- [x] Estimativa definida (5 pontos, só frontend)
- [x] Riscos identificados com mitigação (colisão de ID no carrinho, reaproveitamento de
      `discount` — validado sem conflito, arredondamento de centavos, sobreposição de combos)

**Aprovação final**
- [x] Time (usuário) aprovou avançar pra implementação — "agora devemos ir para o 150" /
      "vez do totem" (2026-09-02)
- [x] Estimativa acordada (5 pontos)
- [x] Sem bloqueios não resolvidos — ponto em aberto do `discount` validado sem conflito
- [x] Priorização aprovada para implementação imediata

**Status: Ready** — apta para implementação.

---

## Done

Implementado em `feature/ord-150-combo-catalogo-totem` (branch criada a partir de
`feature/ord-112-combo-cadastro-admin`, já com o backend de combo pronto). `frontend/totem`:
`types.ts` (`Combo`/`ComboItemRef`, `CartItem` com `kind`/`key`), `store.ts` (agrupamento do
carrinho por `key`, não mais `id`), `CatalogScreen.tsx` (seção "Destaque", modal de upsell,
stepper de combo), `App.tsx` (explosão do combo em itens reais + `discount` ao montar
`POST /orders`). `PaymentScreen.tsx` não precisou de nenhuma mudança — confirmado lendo
`services/payment/main.py` que `items` do `PaymentIn` nunca é lido em lugar nenhum do backend,
só `amount` importa pro pagamento (achado que simplificou o escopo real da implementação).
Build limpo (`tsc && vite build`), zero erros de TypeScript.

**QA manual em ambiente real, ciclo completo testado no navegador (2026-09-02):** combo real
exibido na seção "Destaque" com preço/economia corretos; clicar em "Adicionar" num produto
componente disparou o modal de upsell; "Sim, quero o combo" adicionou o combo (não o produto)
ao carrinho, com tag "COMBO" visível na linha do carrinho; pedido finalizado de verdade
confirmou no banco do order-service a explosão correta — 2 `order_items` com preço avulso real
(`unit_price` de cada componente, não dividido), `discount=2.00` batendo exatamente com a
economia do combo, e 2 tickets gerados (um por componente), balcão sem nenhuma diferença de
fluxo. Teste feito na empresa Pasta & Co com um combo temporário criado e removido só para o
teste (não afeta dado de produção).

**Achados durante o QA manual:**
- Terminal 1 da Burger House (produção, Mercado Pago) está com o access token inválido
  (`Access token inválido HTTP 404`), bloqueando o teste de conexão do setup do totem — **achado
  não relacionado a esta história**, sinalizado para o usuário investigar separadamente
  (possível expiração de credencial).
- Confirmado o ponto em aberto da Tech Explorer: `PaymentScreen.tsx` não precisa de explosão de
  combo porque `payment-service` nunca lê o campo `items` — simplificação real, não suposição.

**Correção pós-QA do usuário (2026-09-02):** três ajustes pedidos depois de ver a implementação
rodando de verdade:
1. **Combo restrito à categoria alocada** — decisão original desta Tech Explorer (seção
   "Destaque" fixa, independente da categoria) foi revertida a pedido do usuário: o combo só
   aparece na categoria em que foi alocado (`category_id`, ORD-112). Isso já respeita o contexto
   de cardápio (ORD-127) de graça — `activeCat` só existe entre categorias que o backend já
   filtrou por janela de horário, então um combo alocado numa categoria fora da janela some
   junto. Combo sem `category_id` não aparece em nenhuma categoria.
2. **Modal de upsell centralizado e maior** — era um bottom sheet, ficava pouco visível; virou
   um diálogo centralizado na tela, maior, com botão de fechar explícito.
3. **Bug de contraste no badge "Combo disponível"** — usava `color: T.btn` sobre
   `background: T.catActive`, par que só tem contraste garantido em alguns temas (ex.: tema
   "ordin"); no tema real da Burger House ("bk", Laranja Grelhado) o texto ficava quase
   invisível. Corrigido para `color: T.catText`, o par de contraste que o próprio tema já
   declara para `catActive` (mesmo padrão já usado na pill de categoria ativa). Confirmado
   visualmente no tema "bk" depois da correção.

Reteste manual completo depois da correção, na Burger House real (empresa 1, tema "bk"):
combo real "Combo Bacon Smash Duplo" (e outros combos reais cadastrados pelo usuário) aparecendo
corretamente só na categoria "Combos", sem aparecer em "Lanches"; modal de upsell centralizado
com contraste correto ao adicionar "Bacon Smash Duplo" avulso.

**Status: Done.**
