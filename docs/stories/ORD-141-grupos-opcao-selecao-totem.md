---
id: ORD-141
status: Done
fase: 6
sprint: null
responsavel: Frontend
estimativa: 5 pontos (só frontend)
tipo: feature
---

# ORD-141 — Grupos de opção: seleção no totem

## Descrição
No totem, ao tentar adicionar ao carrinho um produto que tem grupo(s) de opção obrigatório vinculado, o cliente é obrigado a escolher antes de confirmar (ex.: escolher o sabor do refrigerante ou o tamanho da batata). Grupos opcionais (`min_selections=0`) não bloqueiam a adição, mas ficam disponíveis pra escolha. Precisa decidir no Explorer: tela própria de seleção vs. seleção inline no card do produto.

## Persona
Cliente final, comprando no totem.

## Contexto
Depende de ORD-139/140 (precisa existir grupo cadastrado e vinculado a um produto pra ter o que selecionar). Ver `docs/stories/ORD-137-grupos-opcao-produto.md` pra contexto da iniciativa completa.

## Explorer

### História
Como cliente final comprando no totem, quero escolher a opção (sabor, tamanho, ou modificador) de um produto que tem grupo de opção vinculado antes de adicionar ao carrinho, para montar meu pedido do jeito que quero sem precisar corrigir depois no balcão.

### Contexto e motivação
Hoje `Product` é plano — o totem não tem nenhum jeito de capturar "qual sabor" ou "qual tamanho" o cliente quer; ORD-138/139/140 já entregam o modelo, o cadastro admin e o vínculo produto↔grupo, mas sem UI de totem esse dado cadastrado não tem efeito nenhum na experiência de compra. Esta história é o primeiro ponto de contato do cliente final com o primitivo de grupos de opção.

Duas decisões de produto, levantadas explicitamente no step New, ficam resolvidas aqui:

1. **Seleção via modal, não inline no card.** Mesmo padrão já usado no upsell de combo (ORD-150): clicar "+" no card de um produto com grupo(s) de opção vinculado(s) abre um modal com os grupos e opções, cliente escolhe e confirma. Reaproveita um componente/UX já validado no totem (interrupção do fluxo de adicionar-ao-carrinho via modal) em vez de introduzir um segundo padrão concorrente, e evita ter que redesenhar o card (hoje compacto, pensado pra grade densa) pra caber seletor.
2. **Modal aparece também para grupo só opcional** (`min_selections=0`, ex. modificador "sem cebola"), sem bloquear o botão de confirmar — dá a chance de personalizar sem forçar escolha. Produto sem nenhum grupo de opção vinculado continua indo direto pro carrinho, sem modal, exatamente como hoje.

**Fora de escopo desta história (registrado, não esquecido):** a regra de cálculo de preço quando o cliente seleciona mais de uma opção do mesmo grupo (`max_selections > 1`, caso pizza multi-sabor) é uma decisão de produto ainda em aberto — ORD-137 já registra isso como pendência endereçada no Tech Explorer, junto com a definição de contrato do backend (ORD-142). O Tech Explorer desta história precisa propor a regra (candidato natural: soma dos `price_delta` das opções selecionadas, mesmo padrão observado na pesquisa de mercado) e confirmar com o usuário antes da implementação.

**Limitação conhecida e aceita para esta fatia:** como `OrderItem` (order-service) ainda não carrega a opção escolhida (isso é ORD-142) e o ticket impresso ainda não a exibe (ORD-143), a opção escolhida nesta história fica visível **só no totem** — no card do carrinho e no total. Depois de finalizado o pedido, a opção some (ticket mostra só o nome do produto). Isso é uma lacuna temporária conhecida, não um bug — cada história da série resolve uma fatia, seguindo o mesmo sequenciamento de ORD-124–128 (cardápios por horário).

### Fluxo principal
1. Cliente navega o catálogo e toca "+" no card de um produto que tem ao menos um grupo de opção vinculado (obrigatório e/ou opcional).
2. Abre um modal mostrando cada grupo vinculado ao produto, com seu nome e suas opções (label, preço adicional quando `price_delta > 0`, imagem/thumbnail quando cadastrada).
3. Para grupo com `min_selections ≥ 1` (obrigatório): cliente precisa selecionar entre `min_selections` e `max_selections` opções antes de poder confirmar. Botão "Confirmar" fica desabilitado enquanto a regra não for satisfeita, com indicação visual de quantas faltam.
4. Para grupo com `min_selections = 0` (opcional): seleção é livre, não bloqueia o botão "Confirmar".
5. Cliente toca "Confirmar" — produto (com a(s) opção(ões) escolhida(s) e preço já somado) entra no carrinho. Modal fecha.
6. Cliente pode tocar em "Cancelar"/fechar o modal a qualquer momento sem adicionar nada ao carrinho (equivalente a não ter clicado "+").
7. Se o mesmo produto for adicionado de novo com uma opção **diferente** da já presente no carrinho, vira uma linha nova no carrinho (não soma quantidade na linha existente) — evita misturar "1 Coca-Cola + 1 Guaraná" numa única linha ambígua de "Refrigerante x2".
8. Se o mesmo produto for adicionado de novo com a **mesma** opção já escolhida, soma quantidade na linha existente (comportamento já existente hoje pra produto sem grupo).

### Fluxos alternativos / exceções
- **Produto sem grupo de opção vinculado**: comportamento inalterado — clicar "+" adiciona direto ao carrinho, sem modal (mesmo caminho de hoje).
- **Produto com grupo de opção E elegível a upsell de combo (ORD-150/157)**: os dois modais não podem abrir ao mesmo tempo. Ordem proposta pro Tech Explorer decidir: resolver a seleção de opção primeiro (produto só entra "completo" no carrinho depois de ter a opção definida), upsell de combo continua dependendo do estado pós-adição (`getQty` do produto), então roda depois, igual já roda hoje.
- **Grupo com todas as opções indisponíveis/inativas** (ex: opção desativada via ORD-145 depois do produto já estar em cache do totem): grupo aparece no modal sem opções selecionáveis; se o grupo for obrigatório, produto fica impossível de adicionar — Tech Explorer decide se omite o grupo inteiro nesse caso ou bloqueia com mensagem explícita.
- **Conexão cai no meio da seleção**: nada é adicionado ao carrinho até "Confirmar" ser tocado com sucesso — sem estado parcial persistido.

### Dependências
- Serviços envolvidos: catalog-service (dado já exposto por ORD-138/140 via `GET /catalog/products`), nenhuma mudança de backend nesta história — é só consumo do campo `option_groups` já retornado.
- Frontend: `frontend/totem/src/screens/CatalogScreen.tsx` (`handleAddProduct`/`addProductToCart`, mesmo arquivo do modal de upsell ORD-150) e `frontend/totem/src/types.ts` (`Product.option_groups` — campo novo a adicionar no tipo; `CartItem` precisa carregar a(s) opção(ões) escolhida(s) e sua contribuição de preço).
- Histórias bloqueantes: nenhuma — ORD-139/140 já estão `Ready` (fornecem o dado que este story consome). ORD-142/143 dependem desta, não o contrário.

### Critérios de aceite funcionais
- [ ] Produto com grupo de opção obrigatório vinculado não entra no carrinho sem seleção válida (`min_selections` a `max_selections` opções escolhidas).
- [ ] Produto com apenas grupo opcional pode ser adicionado com ou sem seleção.
- [ ] Produto sem nenhum grupo de opção vinculado continua sendo adicionado direto ao carrinho, sem modal.
- [ ] Preço mostrado no carrinho reflete o preço base do produto mais o(s) `price_delta` da(s) opção(ões) escolhida(s).
- [ ] Duas adições do mesmo produto com opções diferentes geram duas linhas distintas no carrinho; com a mesma opção, somam quantidade na mesma linha.
- [ ] Fechar/cancelar o modal não adiciona nada ao carrinho.
- [ ] Fluxo de upsell de combo (ORD-150/157) continua funcionando sem conflito quando o produto componente também tem grupo de opção.

### Wireframe / Mockup
Não há mockup formal — reaproveita a estrutura visual já existente do modal de upsell de combo (`CatalogScreen.tsx`, seção `{/* Modal de upsell (ORD-150) */}`): overlay escuro + card central, título, lista de opções com imagem/label/preço, e barra de ação inferior. Layout exato (lista de grupos, indicador de seleção obrigatória/quantidade restante, botão desabilitado) fica pro Tech Explorer + Frontend detalhar.

## QA Explorer

Não há endpoint novo nesta história (consumo de dado já exposto por ORD-138/140) — sem cenário de
isolamento multi-tenant ou auth próprio; a superfície testável é o comportamento do totem
(`CatalogScreen.tsx`) diante dos dados de `option_groups` já vindos do catalog-service.

```gherkin
Feature: Seleção de grupo de opção no totem
  Como cliente final comprando no totem
  Quero escolher a opção de um produto que tem grupo de opção vinculado
  Para montar meu pedido do jeito que quero antes de pagar

  Background:
    Dado o totem está autenticado num terminal de uma empresa com catálogo carregado

  # ── Happy path ──────────────────────────────────────────────────────────

  Scenario: Grupo obrigatório de seleção única — feliz
    Dado um produto "Refrigerante lata 350ml" com grupo "Sabor" (min_selections=1, max_selections=1)
      E o grupo tem as opções "Coca-Cola" (price_delta=0), "Guaraná Antarctica" (price_delta=0)
    Quando o cliente toca "+" no card do produto
    Então um modal abre mostrando o grupo "Sabor" e suas opções
      E o botão "Confirmar" está desabilitado até uma opção ser selecionada
    Quando o cliente seleciona "Guaraná Antarctica" e toca "Confirmar"
    Então o modal fecha
      E o carrinho tem uma linha "Refrigerante lata 350ml — Guaraná Antarctica" com o preço base do produto

  Scenario: Grupo obrigatório com opção de preço adicional
    Dado um produto "Batata frita" com grupo "Tamanho" (min_selections=1, max_selections=1)
      E o grupo tem as opções "P" (price_delta=0), "M" (price_delta=3.00), "G" (price_delta=6.00)
    Quando o cliente seleciona "G" e confirma
    Então a linha do carrinho mostra o preço do produto somado a R$ 6,00

  Scenario: Grupo opcional — cliente escolhe não selecionar nada
    Dado um produto "X-Burger" com grupo opcional "Sem ingrediente" (min_selections=0, max_selections=3)
    Quando o cliente toca "+" no card do produto
    Então o modal abre com o botão "Confirmar" já habilitado, mesmo sem nenhuma seleção
    Quando o cliente toca "Confirmar" sem selecionar nada
    Então o produto entra no carrinho sem nenhuma opção associada, preço base inalterado

  Scenario: Grupo opcional — cliente escolhe personalizar
    Dado um produto "X-Burger" com grupo opcional "Sem ingrediente" contendo a opção "Sem cebola" (price_delta=0)
    Quando o cliente seleciona "Sem cebola" e confirma
    Então a linha do carrinho mostra "X-Burger — Sem cebola"

  Scenario: Produto sem grupo de opção vinculado — comportamento inalterado
    Dado um produto "Água mineral" sem nenhum grupo de opção vinculado
    Quando o cliente toca "+" no card do produto
    Então nenhum modal abre
      E o produto é adicionado direto ao carrinho, como hoje

  # ── Bordas ──────────────────────────────────────────────────────────────

  Scenario: Múltiplas opções permitidas dentro do limite (max_selections > 1)
    Dado um produto "Pizza G" com grupo "Sabores" (min_selections=1, max_selections=2)
    Quando o cliente seleciona 2 sabores e confirma
    Então o produto entra no carrinho com as 2 opções associadas
      E tentar selecionar uma 3ª opção não é permitido (opção fica desabilitada ou seleção anterior é substituída — Tech Explorer decide qual)

  Scenario: Produto com dois grupos vinculados, um obrigatório e um opcional
    Dado um produto "Combo Individual" com grupo obrigatório "Bebida" (min=1, max=1) e grupo opcional "Adicional" (min=0, max=2)
    Quando o cliente seleciona só a bebida e confirma
    Então o botão "Confirmar" estava habilitado (grupo opcional não bloqueia)
      E o produto entra no carrinho só com a opção de bebida associada

  Scenario: Mesmo produto adicionado duas vezes com opções diferentes
    Dado o carrinho já tem "Refrigerante lata 350ml — Coca-Cola" (qty 1)
    Quando o cliente adiciona "Refrigerante lata 350ml" de novo e seleciona "Guaraná Antarctica"
    Então o carrinho passa a ter 2 linhas distintas, cada uma com qty 1

  Scenario: Mesmo produto adicionado duas vezes com a mesma opção
    Dado o carrinho já tem "Refrigerante lata 350ml — Coca-Cola" (qty 1)
    Quando o cliente adiciona "Refrigerante lata 350ml" de novo e seleciona "Coca-Cola" de novo
    Então o carrinho continua com 1 linha, agora com qty 2

  Scenario: Produto com grupo de opção e também elegível a upsell de combo
    Dado um produto "X-Burger" com grupo obrigatório "Ponto da carne" e também componente de um combo com upsell ativo
    Quando o cliente toca "+", seleciona o ponto da carne e confirma
    Então o produto entra no carrinho com a opção escolhida
      E, em seguida, o modal de upsell de combo (ORD-150) abre normalmente, sem conflito com o modal já fechado

  # ── Cancelamento / erro ─────────────────────────────────────────────────

  Scenario: Cliente fecha o modal sem confirmar
    Dado o modal de seleção de opção está aberto para um produto qualquer
    Quando o cliente toca fora do modal ou no botão de fechar
    Então o modal fecha
      E nada é adicionado ao carrinho

  Scenario: Grupo obrigatório sem nenhuma opção disponível (todas inativas)
    Dado um produto com grupo obrigatório "Sabor" cujas opções estão todas com active=false
    Quando o cliente toca "+" no card do produto
    Então o comportamento segue a decisão do Tech Explorer (grupo omitido do modal vs. bloqueio com mensagem) — cenário fica pendente até essa decisão
```

**Cenários aprovados pelo PM** — cobrem happy path (seleção única, seleção com preço adicional,
grupo opcional com e sem escolha, produto sem grupo), bordas (multi-seleção dentro do limite,
produto com dois grupos, diferenciação de linha no carrinho por opção escolhida, interação com
upsell de combo) e cancelamento. O cenário de "grupo sem opção disponível" fica marcado como
pendente — não bloqueia o avanço pro Tech Explorer, mas precisa ser resolvido lá antes da
implementação (mesma pendência já registrada no Explorer sobre a regra de preço multi-seleção).

## Tech Explorer

**Correção importante antes de detalhar a solução:** ORD-138/139/140/144/145/146 — que o Explorer
tratou como dependências "prontas mas não implementadas" — **já estão implementadas e mergeadas em
`main`** (commits `cd9fd6d`, `c3eb817`, `8ddc006`, `af34f35`/`4f8e4e4`, `b568c29`, `c0290ce`; PRs
#111/#112 confirmados). Os docs dessas histórias só nunca tiveram o campo `status:` atualizado de
`Ready` pra `Done` — débito de documentação, não de código. Isso muda a natureza desta história:
não é mais "espera o backend existir", é "consumir uma API já real e testada em produção". Os dois
pontos que o Explorer registrou como pendentes **já estão resolvidos no código existente**, não
precisam de decisão nova:
- **Regra de preço multi-seleção**: já documentada no próprio modelo (`services/catalog/main.py:172-175`,
  docstring de `Option`): "Ver ORD-142 pra regra de cálculo com múltiplas opções escolhidas (soma
  dos deltas)". Confirma o candidato que o Explorer propôs — não é mais suposição, é a regra de
  projeto já registrada.
- **Opção inativa dentro de um grupo**: a API já devolve `active: bool` por opção
  (`_get_option_group_options`, `main.py:310-328`) sem filtrar — decisão de exibir/ocultar é do
  cliente. Resolvido abaixo em "Comportamento: grupo sem opção ativa".

### Serviços impactados
- **catalog-service**: nenhuma mudança — `GET /catalog/products` e `GET /catalog/products/{id}`
  já retornam `option_groups` completo (confirmado em `_serialize_product`, `main.py:659-678`).
  Esta história é puramente de consumo.
- **frontend/totem**: único serviço alterado.
  - `src/types.ts`: `Product` ganha campo `option_groups: ProductOptionGroup[]` — mesmo formato já
    usado em `frontend/admin/src/types.ts:174-241` (`OptionGroup`, `OptionGroupOption`,
    `ProductOptionGroup` com `min_selections_override`/`max_selections_override`), copiado 1:1
    pra manter consistência entre os dois frontends que consomem a mesma API.
  - `CartItem` ganha campo opcional `selectedOptions?: { group_id: number; group_name: string; option_id: number; option_label: string; price_delta: number }[]` — carrega o que foi escolhido, pra exibir no carrinho (`Refrigerante — Guaraná Antarctica`) e, mais adiante, alimentar ORD-142/143 sem precisar redesenhar o tipo de novo.
  - `src/screens/CatalogScreen.tsx`: novo estado `optionModal: { product: Product } | null` (mesmo
    padrão do `upsell` existente, linha 51), novo componente de modal (reaproveita a estrutura
    visual do modal de upsell ORD-150, seção a partir da linha ~675) e mudança em
    `handleAddProduct`/`addProductToCart`.

### Endpoints
Nenhum novo, nenhuma mudança de contrato. Referência do que já existe (sem alteração):

`GET /catalog/products` — trecho relevante da resposta já em produção:
```json
{
  "products": [{
    "id": 501,
    "name": "Refrigerante lata 350ml",
    "price": 6.00,
    "option_groups": [{
      "id": 12,
      "name": "Sabor",
      "min_selections": 1,
      "max_selections": 1,
      "active": true,
      "min_selections_override": null,
      "max_selections_override": null,
      "options": [
        { "id": 101, "label": "Coca-Cola", "price_delta": 0, "active": true, "image_url": null, "thumbnail_url": null, "sort_order": 1, "description": null, "sku": null, "allergens": [] },
        { "id": 102, "label": "Guaraná Antarctica", "price_delta": 0, "active": true, "image_url": null, "thumbnail_url": null, "sort_order": 2, "description": null, "sku": null, "allergens": [] }
      ]
    }]
  }]
}
```

### Migrations
Nenhuma — sem mudança de schema em nenhum serviço.

### Eventos de fila
N/A — mudança 100% frontend, sem I/O assíncrono novo.

### Impacto em outros serviços
Nenhum. `POST /orders` (order-service) continua recebendo `unit_price` já calculado pelo totem
(confirmado em `services/order/main.py:335`, `total = sum(i.unit_price*i.qty ...)` — order-service
não recalcula contra o catalog-service, mesmo comportamento já usado hoje pra combo). Ou seja: o
preço com `price_delta` somado precisa estar **correto no totem**, porque é o valor que vira
verdade no pedido — mas o *nome da opção escolhida* (ex. "Guaraná Antarctica") ainda não tem onde
ser persistido no `OrderItem` até ORD-142 existir. Ver limitação conhecida já registrada no
Explorer.

### Detalhes de implementação

**Cálculo de valores efetivos** (por causa do override do ORD-144):
```
effective_min = group.min_selections_override ?? group.min_selections
effective_max = group.max_selections_override ?? group.max_selections
```
Todo lugar que hoje usaria `min_selections`/`max_selections` direto do grupo (validação de
"Confirmar" habilitado, contagem de quantas faltam) usa o valor efetivo, não o do `OptionGroup`
cru.

**Comportamento: grupo sem opção ativa.** Se, depois de filtrar `active=false`, um grupo com
`effective_min ≥ 1` fica com zero opções selecionáveis, o grupo é **omitido do modal** e excluído
do cálculo de "pode confirmar" — tratado como se não estivesse vinculado ao produto. Justificativa:
bloquear a venda de um produto inteiro por causa de uma opção temporariamente desativada (ORD-145)
é uma consequência desproporcional a uma decisão operacional (ex.: acabou o sabor X) — e é
reversível a qualquer momento sem intervenção de dev, só reativando a opção. Fecha o cenário
pendente do QA Explorer.

**Seleção múltipla (`effective_max > 1`)**: checkboxes, não radio. Ao atingir `effective_max`,
opções não selecionadas do mesmo grupo ficam desabilitadas (visualmente esmaecidas) até o cliente
desmarcar uma — sem substituição automática da mais antiga, que seria uma mudança de estado não
solicitada pelo cliente.

**Chave do carrinho**: `product:${id}:${sortedOptionIds.join(',')}` quando há opção(ões)
selecionada(s) (`sortedOptionIds` ordenado numericamente, pra "Coca-Cola+Gelo" e "Gelo+Coca-Cola"
gerarem a mesma chave); `product:${id}` sem sufixo quando não há grupo vinculado — mesma chave de
hoje, zero mudança pro caso sem opção.

**Ordem de modais** (grupo de opção × upsell de combo ORD-150/157): seleção de opção resolve
primeiro. `handleAddProduct` passa a: (1) se produto tem `option_groups` não-vazio, abre o modal de
opção; a confirmação dali chama a mesma lógica de hoje que decide upsell (`combo`/`setUpsell`) —
upsell continua olhando a quantidade pós-adição, sem mudança de regra, só passa a rodar depois do
modal de opção fechar em vez de direto no clique do "+".

### Estimativa
- Frontend: 5 pontos (tipo novo + modal novo reaproveitando padrão visual existente + lógica de
  chave de carrinho/preço + integração com fluxo de upsell já existente). Sem backend.

### Riscos
- **Regressão no fluxo de upsell de combo (ORD-150/157)**: `handleAddProduct` é o mesmo ponto de
  entrada dos dois fluxos — mudança precisa ser cirúrgica pra não quebrar o upsell de produtos sem
  grupo de opção. Mitigação: cenário de QA Explorer dedicado ("produto com grupo de opção e também
  elegível a upsell de combo") + regressão manual do fluxo de upsell puro (sem grupo de opção)
  antes de fechar a história.
- **Divergência de tipo entre `frontend/admin` e `frontend/totem`**: os dois frontends têm cópias
  próprias de `OptionGroup`/`ProductOptionGroup` (sem pacote compartilhado de tipos no monorepo).
  Mitigação: copiar o tipo do admin (já validado contra a API real em produção) em vez de redigitar
  do zero, reduzindo chance de divergência de campo.
- **Preço "verdade" definido no totem sem validação server-side**: já é o comportamento existente
  (combo funciona assim hoje) — não é risco novo introduzido por esta história, é uma característica
  preexistente da arquitetura atual do order-service. Registrado aqui só pra não parecer que passou
  despercebido.
- **Fora do escopo desta história, registrado à parte**: `addComboToCart` (fluxo de combo,
  distinto de `handleAddProduct`/produto avulso) não tem nenhuma noção de grupo de opção — se um
  produto componente de combo tiver grupo obrigatório vinculado, o combo adiciona sem perguntar
  nada. Achado concreto durante este Tech Explorer (o único combo real do ambiente tinha esse
  exato vínculo, por engano — corrigido, ver seção acima). Registrado como história separada,
  `docs/stories/ORD-159-combo-grupo-opcao-interacao.md` — não bloqueia esta história, que trata
  apenas produto avulso.

## Ready

**Explorer**
- [x] História no formato Como/Quero/Para
- [x] Contexto e motivação documentados (dependência de ORD-139/140, decisão modal vs. inline resolvida)
- [x] Fluxo principal passo a passo (8 passos)
- [x] Dependências identificadas (ORD-139/140 — já `Done`; ORD-142/143 dependem desta, não o contrário)
- [x] Wireframe/mockup referenciado (reaproveita estrutura visual do modal de upsell ORD-150)
- [x] Critérios de aceite funcionais escritos (7 itens)

**QA Explorer**
- [x] Happy path em Gherkin (5 cenários)
- [x] Cenários de borda (4 cenários: multi-seleção, dois grupos, diferenciação de carrinho, upsell)
- [x] Cenário de cancelamento (equivalente a "erro" nesta história, sem endpoint que produza 4xx)
- [x] Isolamento multi-tenant: **N/A** — sem endpoint novo, história é consumo de dado já servido por endpoint existente e já coberto por isolamento em ORD-017
- [x] Cenários aprovados pelo PM

**Tech Explorer**
- [x] Serviços impactados documentados (só `frontend/totem`; catalog-service inalterado)
- [x] Endpoints: nenhum novo — payload de `GET /catalog/products` já em produção documentado
- [x] Migrations: nenhuma
- [x] Eventos de fila: N/A
- [x] Estimativa definida (5 pontos, só frontend)
- [x] Riscos identificados (3, todos com mitigação ou registrados como preexistentes)

**Aprovação final**
- [x] Time revisou e concordou com a solução técnica (usuário aprovou avançar direto pro Ready)
- [x] Estimativa acordada (5 pontos)
- [x] Sem bloqueios não resolvidos — as duas pendências do Explorer/QA Explorer (regra de preço multi-seleção, grupo sem opção ativa) foram fechadas no Tech Explorer com base em código já existente
- [x] Priorizada no sprint backlog

**Status final: Ready.**

## Validação (implementação, 2026-09-03)

Implementado conforme o Tech Explorer, com uma simplificação de UI não antecipada lá: produto com
grupo de opção deixa de usar o stepper +/- direto no card (ambíguo — qual variante incrementar,
se pode haver mais de uma linha no carrinho pro mesmo produto?). Card sempre mostra "Toque para
adicionar", e o ajuste de quantidade por variante acontece no carrinho, onde cada linha já tem seu
próprio +/- por `key` (mecanismo que já existia, reaproveitado sem mudança).

- `types.ts`: `OptionGroupOption`/`ProductOptionGroup` (copiados do admin), `Product.option_groups`,
  `CartItem.selectedOptions`.
- `CatalogScreen.tsx`: modal de seleção (mesma estrutura visual do upsell ORD-150), `handleAddProduct`
  decide entre abrir o modal ou seguir direto pro fluxo de upsell/adicionar, `confirmOptionModal`
  computa preço (soma dos `price_delta`) e a `key` do carrinho (`product:<id>:<ids ordenados>`),
  `maybeUpsellOrAdd` resolve upsell de combo depois da opção já definida (ordem definida no Tech
  Explorer). Grupo sem opção ativa é filtrado antes de qualquer decisão (`selectableOptionGroups`).
- `App.tsx`: payload de `POST /orders` ganha `selected_options` por item, batendo com o contrato
  fixado no Tech Explorer de ORD-142 (`group_name`/`option_label`/`price_delta`). Item de combo
  nunca carrega opção (ORD-159).

**Achado durante o teste manual:** o dado de demonstração não tinha nenhum produto com grupo de
opção vinculado de forma coerente (o único vínculo existente era o do burger, já corrigido/removido
durante o Tech Explorer de ORD-141). Vinculado "Sabores de bebida" (id 50) ao produto real
"Refrigerante Lata 350ml" (id 6, Burger House) via `PUT /catalog/products/6/option-groups` — mesmo
exemplo usado na própria ORD-137. Fica como demo funcional pra próximas validações.

`npx tsc --noEmit` limpo. Sem suite de testes automatizados no totem (projeto não tem
vitest/jest configurado) — validação 100% manual via `npm run dev` + Chrome, conforme convenção do
projeto pra este frontend específico:
- Grupo obrigatório: modal abre ao tocar "+", botão Confirmar desabilitado até selecionar,
  habilita após selecionar "Guaraná Antarctica", confirma e entra no carrinho como
  "Refrigerante Lata 350ml — Guaraná Antarctica" (R$ 6,90).
- Duas adições do mesmo produto com opções diferentes (Guaraná, depois Coca-Cola) geram 2 linhas
  distintas no carrinho, total R$ 13,80 — confirma a regra de `key`.
- Pedido finalizado (fluxo real até a tela de pagamento) e verificado via API
  (`GET /orders/{ref}/tickets`): as 2 opções escolhidas persistidas corretamente pelo order-service
  (ORD-142), inclusive no `qr_data` do ticket (nome do produto já com o sufixo da opção) — confirma
  a integração ponta a ponta ORD-141 → ORD-142 com dado real, não mockado.
- Regressão do upsell de combo (ORD-150/157): "Classic Cheddar Burger" (sem grupo de opção após a
  correção de dado) continua disparando o modal de upsell normalmente; "Não, só Classic Cheddar
  Burger" adiciona ao carrinho com preço e stepper +/- funcionando como antes — zero regressão.

Não testado visualmente: grupo só-opcional (não há grupo desse tipo ainda cadastrado no ambiente
de demo) e seleção múltipla (`max_selections > 1`, ex. pizza 2 sabores — grupo "Pizzas Tradicionais"
existe mas sem produto vinculado). Lógica desses dois casos é a mesma já exercitada (mesmas
funções `toggleOption`/`confirmOptionModal`/`canConfirmOptionModal`), só não foi clicada na tela —
registrado aqui por transparência, não bloqueia o fechamento da história.

### Correção pós-QA do usuário (2026-09-03)

Testando manualmente, o usuário apontou 2 problemas reais no modal (nenhum dos dois coberto pelos
cenários do QA Explorer, que focaram em comportamento, não em apresentação visual):

1. **Preço adicional e total não ficavam evidentes.** O `price_delta` de cada opção já era exibido,
   mas sem destaque (mesmo peso visual do resto do texto) e **não havia nenhum total visível** —
   o cliente via "+R$ 2,50" numa opção mas não tinha como saber quanto o produto ficava no fim.
   Corrigido: preço adicional agora usa `T.priceColor` em negrito (mesmo tom usado pro preço do
   produto em todo o resto do catálogo) e some quando `price_delta = 0` (evita "+R$ 0,00", que
   soaria como cobrança dupla do sabor padrão); adicionado rodapé "Total" recalculado em tempo
   real (`optionModalTotal`, preço-base + soma dos deltas selecionados) e "A partir de {preço
   base}" abaixo do nome do produto no topo do modal.
2. **Opção com foto cadastrada não tinha layout que suportasse imagem.** O modal original só
   renderizava `label` + `price_delta` em texto puro — nenhuma leitura de `image_url`/
   `thumbnail_url`, mesmo esses campos já existindo no tipo e vindo preenchidos da API (ORD-138).
   Corrigido: cada opção ganhou uma miniatura 56×56 à esquerda do rótulo (mesmo padrão de
   placeholder com emoji do card de combo, ORD-153, quando a opção não tem foto cadastrada).

Validado com dado real: `price_delta=2,50` setado em "Guaraná Antarctica" e foto real enviada pra
"Coca-Cola" (`PUT /catalog/option-groups/50/options` + `POST /catalog/options/113/image`) — modal
mostra a foto da Coca-Cola, placeholder 🍽️ nas opções sem foto, "+R$ 2,50" em destaque no Guaraná,
e o Total atualiza de R$ 6,90 pra R$ 9,40 ao selecionar — confirmado também no carrinho e no total
final do pedido.

### Correção pós-QA do usuário, rodada 2 (2026-09-03)

Com a foto aparecendo, usuário pediu miniatura maior — 56×56 ficava pequeno pra dar destaque real
à imagem da opção. Modal aumentado de `min(640px, 100%)` pra `min(760px, 100%)` e miniatura de
56×56 pra 88×88 (com placeholder também maior, `FONT.title` em vez de `FONT.subtitle`).

Validado de novo no navegador: dessa vez todas as 4 opções do grupo "Sabores de bebida" já tinham
foto real (job de seed automático de imagens do catalog-service preencheu as 3 que faltavam, sem
ação manual) — miniaturas nítidas de cada lata de refrigerante, modal com espaço confortável,
seleção e total (R$ 6,90 → R$ 9,40) continuam funcionando sem regressão.
