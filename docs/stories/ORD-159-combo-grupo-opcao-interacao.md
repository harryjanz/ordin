---
id: ORD-159
status: Done
fase: 6
sprint: null
responsavel: Produto
estimativa: 1 ponto backend + 5 pontos frontend
tipo: feature
---

# ORD-159 — Interação entre combo e grupo de opção

## Descrição
Combo (ORD-150) e grupo de opção (ORD-137/138-146) foram desenvolvidos em sequência (grupo de
opção em 31/08, combo a partir de 01/09) sem nenhum ponto de contato entre os dois modelos —
`Combo`/`ComboItem` (catalog-service) não tem nenhuma referência a `OptionGroup`. Hoje, se um
produto componente de um combo tiver grupo de opção obrigatório vinculado, o fluxo de adicionar
combo ao carrinho (`addComboToCart`, `CatalogScreen.tsx`) ignora completamente a obrigatoriedade —
o cliente nunca é perguntado qual sabor/tamanho quer para aquele componente.

**Achado concreto que motivou o registro desta pendência (2026-09-03):** o único combo real do
ambiente de demonstração ("Combo Classic Cheddar") tinha seu componente "Classic Cheddar Burger"
vinculado, por engano, ao grupo obrigatório "Sabores de bebida" — vínculo de teste esquecido de
quando ORD-138/139/140 foram desenvolvidas, sem relação de negócio real (removido em
2026-09-03, ver `docs/stories/ORD-141-grupos-opcao-selecao-totem.md`). O vínculo errado expôs o
gap: nada no código teria impedido — nem sinalizado — esse combo vender um "burger com sabor de
bebida obrigatório e nunca perguntado" caso o dado estivesse certo desde o início.

Esta história não tenta resolver o gap agora — só registra formalmente a pendência, achada durante
o Tech Explorer de ORD-141, para que a decisão de prioridade/desenho fique com o usuário, e não se
perca. Fica fora do escopo de ORD-141/142/143 (produto avulso no totem), que continuam tratando
apenas o fluxo de `handleAddProduct`, sem tocar `addComboToCart`.

## Persona
Cliente final no totem, ao comprar um combo cujo componente tem grupo de opção vinculado — hoje
não tem como personalizar (sabor/tamanho) esse componente specific dentro do combo.

## Contexto
Depende, no mínimo, de ORD-141 (seleção de opção no totem) já existir pra ter um padrão de UI a
reaproveitar. Decisão de produto em aberto: seleção por componente dentro do combo é obrigatória
do mesmo jeito que produto avulso, ou o combo pode restringir/proibir vincular grupo obrigatório a
um dos seus componentes no cadastro admin (mais simples, mas limita o catálogo)? Nenhuma das duas
foi avaliada ainda — fica pro Explorer desta história.

**Atualização (2026-09-04) — cenário real, não mais só achado de teste:** o usuário reconfigurou
o "Combo Classic Cheddar" pra usar "Refrigerante Lata 350ml" (id 6) como componente — produto
que tem, de propósito, o grupo obrigatório "Refrigerantes Lata 350ml" (min=1, max=1) vinculado
legitimamente (não é mais o vínculo acidental do burger, já corrigido). Confirma que o caso é
real: "Classic Cheddar Burger + Refrigerante Lata 350ml" é um combo genuíno que precisa deixar o
cliente escolher o sabor da bebida. O usuário decidiu a pergunta em aberto acima: seleção
**precisa ser possível** (não vale restringir/proibir o cadastro dessa combinação) — "precisamos
estabelecer a forma de selecionar os opcionais do produto na jornada de seleção de combo".

## Explorer

### História
Como cliente final comprando um combo no totem, quero escolher a opção (sabor, tamanho) de qualquer componente do combo que tenha grupo de opção vinculado, para montar meu combo do jeito que eu quero, do mesmo jeito que já posso fazer com produto avulso (ORD-141).

### Contexto e motivação
**Achado técnico chave:** o problema não é só de frontend. `_serialize_combo`
(`catalog-service/main.py:451`) monta `items` de um combo com um SELECT direto (`product_id,
name, price, triggers_upsell`) — nunca chama `_get_product_option_groups`, que já existe e já é
usado por `_serialize_product` pra resolver os grupos de opção de um produto avulso. A API de
combo (`GET /catalog/combos`, `ComboItemOut`) **não expõe hoje** os grupos de opção dos
componentes — o totem não teria como saber que "Refrigerante Lata 350ml" dentro do combo tem
grupo de opção, mesmo que quisesse perguntar. Sem isso resolvido no backend, nenhuma mudança de
frontend sozinha resolveria o problema.

Isso muda o escopo real desta história: não é só "reaproveitar o modal do ORD-141 no fluxo de
combo" — é primeiro fechar o mesmo gap que `_serialize_product` já fechou pra produto avulso, só
que pra `_serialize_combo`.

### Fluxo principal
1. `GET /catalog/combos` passa a incluir, pra cada item do combo, os `option_groups` do produto
   componente (mesmo formato já usado em `GET /catalog/products`) — mudança aditiva, sem quebrar
   consumidor existente.
2. Cliente toca "Adicionar combo"/"+" num combo cujo algum componente tem grupo de opção com
   opção ativa.
3. Abre um modal (mesma estrutura visual do ORD-141) — mas organizado **por componente**: pra
   cada item do combo que tem grupo de opção, uma seção com o nome do componente como cabeçalho,
   seguida dos grupos/opções desse componente (igual o modal de produto avulso, só que repetido
   por componente em vez de repetido por grupo dentro de 1 produto só). Componente sem grupo de
   opção não aparece no modal — segue incluso no combo sem pergunta nenhuma.
4. Botão "Confirmar" trava até todo grupo obrigatório de todo componente estar satisfeito (mesma
   regra do ORD-141, aplicada por componente).
5. Combo entra no carrinho como uma linha só (comportamento atual mantido), carregando a(s)
   opção(ões) escolhida(s) por componente.
6. Ao finalizar o pedido, o combo continua explodindo em itens reais (`App.tsx handleCpfDone`,
   ORD-150) — cada item explodido agora também carrega `selected_options`, usando o mesmo
   contrato já definido no ORD-142 (`group_name`/`option_label`/`price_delta`).
7. Ticket impresso do componente com opção escolhida já reflete isso automaticamente — reusa
   `splitNameOption` do ORD-143 sem mudança nenhuma ali, desde que o nome do item explodido
   inclua o sufixo da opção do mesmo jeito que produto avulso já faz.

### Fluxos alternativos / exceções
- **Combo sem nenhum componente com grupo de opção** (caso mais comum hoje): comportamento
  atual inalterado — sem modal, adiciona direto.
- **Upsell de combo (ORD-150/157)**: quando o upsell mostra "Sim, quero o combo", e o combo tem
  componente com opção, o mesmo modal de seleção por componente precisa abrir — mesma decisão já
  tomada no ORD-141 pra produto avulso (seleção resolve antes/depois do upsell, a definir no Tech
  Explorer olhando o código atual do upsell).
- **Mesmo combo adicionado 2x com opções diferentes**: gera 2 linhas distintas no carrinho — mesma
  regra de `key` do ORD-141, adaptada pra incluir as opções de todos os componentes do combo.
- **Componente com grupo obrigatório sem opção ativa** (todas desativadas): mesma decisão do
  ORD-141 — grupo tratado como ausente, não trava a venda do combo inteiro.
- **Componente com seleção múltipla**: mesma lógica de troca-automática-no-limite já corrigida no
  ORD-141 (pós-QA rodada 3), reaproveitada sem mudança.

### Dependências
- Serviços envolvidos: **catalog-service** (mudança real, `_serialize_combo`/`ComboItemOut`) +
  **frontend/totem** (modal, explosão do pedido, chave do carrinho).
- Histórias bloqueantes: nenhuma tecnicamente — ORD-141/142/143 já `Done`, fornecem o padrão de
  UI e o contrato de `selected_options` a reaproveitar.

### Critérios de aceite funcionais
- [ ] `GET /catalog/combos` retorna `option_groups` de cada componente que tiver grupo vinculado.
- [ ] Combo com componente de grupo obrigatório não entra no carrinho sem seleção válida desse
      componente.
- [ ] Combo sem nenhum componente com grupo de opção continua funcionando idêntico a hoje.
- [ ] Combo explodido no pedido carrega a opção escolhida de cada componente (mesmo contrato do
      ORD-142).
- [ ] Ticket impresso do componente com opção mostra a opção (reuso do ORD-143, sem mudança lá).
- [ ] Fluxo de upsell de combo (ORD-150/157) continua funcionando quando o combo ofertado tem
      componente com opção.

### Wireframe / Mockup
Sem mockup formal — reaproveita a estrutura visual do modal do ORD-141 (overlay + card central,
760px, miniatura de opção 88px), organizada em seções por componente do combo em vez de repetir
só por grupo.

## QA Explorer

```gherkin
Feature: Seleção de opção de componentes dentro de um combo
  Como cliente final comprando um combo no totem
  Quero escolher a opção de qualquer componente do combo que tenha grupo vinculado
  Para montar meu combo do jeito que eu quero

  Background:
    Dado um totem autenticado de uma empresa com um combo cujo componente "Refrigerante Lata
      350ml" tem grupo obrigatório "Refrigerantes Lata 350ml" (min=1, max=1) vinculado

  # ── Happy path ──────────────────────────────────────────────────────────

  Scenario: GET /catalog/combos expõe option_groups dos componentes
    Quando o totem consulta GET /catalog/combos
    Então o item "Refrigerante Lata 350ml" do combo retorna option_groups com o grupo
      "Refrigerantes Lata 350ml" e suas opções
      E o item "Classic Cheddar Burger" (sem grupo vinculado) retorna option_groups vazio

  Scenario: Combo com componente de opção abre modal de seleção
    Quando o cliente toca "Adicionar combo"
    Então um modal abre com uma seção "Refrigerante Lata 350ml" listando as opções do grupo
      "Refrigerantes Lata 350ml"
      E o botão "Confirmar" está desabilitado até uma opção ser selecionada
    Quando o cliente seleciona "Guaraná Antarctica" e confirma
    Então o combo entra no carrinho como uma linha só, carregando a opção escolhida do componente

  Scenario: Pedido finalizado explode o combo com a opção do componente persistida
    Dado o combo com "Guaraná Antarctica" escolhido já no carrinho
    Quando o cliente finaliza e paga o pedido
    Então o item explodido "Refrigerante Lata 350ml" no pedido carrega selected_options com
      "Guaraná Antarctica" (mesmo contrato do ORD-142)
      E o ticket impresso desse item mostra "Refrigerante Lata 350ml — Guaraná Antarctica"
      (reuso do ORD-143, sem mudança lá)

  # ── Bordas ──────────────────────────────────────────────────────────────

  Scenario: Combo sem nenhum componente com grupo de opção — comportamento inalterado
    Dado um combo cujos componentes não têm grupo de opção vinculado
    Quando o cliente toca "Adicionar combo"
    Então nenhum modal abre, o combo entra direto no carrinho — igual antes desta história

  Scenario: Upsell de combo com componente de opção
    Dado um produto avulso elegível a upsell de um combo cujo componente tem grupo de opção
    Quando o cliente toca "Sim, quero o combo" no modal de upsell
    Então o modal de seleção de opção do componente abre em seguida, antes do combo entrar no
      carrinho

  Scenario: Mesmo combo adicionado 2x com opções diferentes do mesmo componente
    Dado o combo já no carrinho com "Guaraná Antarctica" escolhido
    Quando o cliente adiciona o mesmo combo de novo e escolhe "Coca-Cola" pro componente
    Então o carrinho passa a ter 2 linhas distintas do combo, uma por opção escolhida

  Scenario: Componente com grupo obrigatório sem opção ativa
    Dado o componente "Refrigerante Lata 350ml" com todas as opções do grupo desativadas
    Quando o cliente toca "Adicionar combo"
    Então o grupo desse componente não aparece no modal (ou o modal nem abre, se for o único
      componente com grupo) — não trava a venda do combo inteiro

  # ── Isolamento multi-tenant ─────────────────────────────────────────────

  Scenario: Empresa B não vê grupo de opção de empresa A dentro de combo
    Dado um combo da empresa A com componente vinculado a um grupo de opção da empresa A
    Quando um usuário da empresa B consulta GET /catalog/combos (dos combos da própria empresa B)
    Então nenhum item de combo da empresa B expõe grupo de opção de outra empresa — isolamento já
      garantido por `OptionGroup.company_id`, apenas confirmado aqui no contexto aninhado
```

**Cenários aprovados pelo PM** — happy path cobre a exposição do dado pela API, a abertura do
modal por componente, e a persistência/impressão ponta a ponta reaproveitando ORD-142/143. Bordas
cobrem combo sem opção (regressão), upsell, duas linhas por opção diferente, e grupo sem opção
ativa. Isolamento confirma que o dado aninhado dentro de combo respeita o mesmo isolamento já
garantido pra `option_groups` isoladamente.

## Solução Técnica

### Serviços impactados
- **catalog-service**: `_serialize_combo` passa a resolver `option_groups` por componente,
  reaproveitando `_get_product_option_groups` (já usado por `_serialize_product`, sem mudança
  nela). `ComboItemOut` ganha o campo novo.
- **frontend/totem**: `CatalogScreen.tsx` (modal por componente, `addComboToCart`, integração com
  upsell), `types.ts` (`ComboItemRef`, `CartItem`), `App.tsx` (`handleCpfDone` — explosão do combo
  passa a propagar `selected_options` por componente). `printService.ts`/`SuccessScreen.tsx`:
  **sem mudança** — `splitNameOption` (ORD-143) já funciona pra qualquer `product_name`
  combinado, incluindo o de um item de combo explodido.

### Endpoints

#### GET /catalog/combos (alterado, aditivo)
**Serviço:** catalog-service
**Auth:** JWT obrigatório | role: kiosk/cashier/admin/super_admin (inalterado)
**company_id:** extraído do JWT (inalterado)

Response 200 — cada item do combo ganha `option_groups` (mesmo formato de
`ProductOut.option_groups`, incluindo `min_selections_override`/`max_selections_override` do
ORD-144):
```json
{
  "combos": [{
    "id": 13,
    "name": "Combo Classic Cheddar",
    "items": [
      { "product_id": 1, "name": "Classic Cheddar Burger", "price": 24.9, "triggers_upsell": true, "option_groups": [] },
      { "product_id": 6, "name": "Refrigerante Lata 350ml", "price": 6.9, "triggers_upsell": false,
        "option_groups": [{
          "id": 50, "name": "Refrigerantes Lata 350ml", "min_selections": 1, "max_selections": 1,
          "active": true, "min_selections_override": null, "max_selections_override": null,
          "options": [{ "id": 201, "label": "Guaraná Antarctica", "price_delta": 0, "active": true, "..." : "..." }]
        }]
      }
    ]
  }]
}
```
Componente sem grupo vinculado retorna `option_groups: []` — consumidor antigo (que ignora o
campo) continua funcionando sem alteração de comportamento.

Erros: inalterados (endpoint já existente, sem mudança de contrato de erro).

### Migrations
Nenhuma — `_get_product_option_groups` já lê tabelas existentes (`OptionGroup`, `Option`,
`ProductOptionGroup`); a ligação relevante é `ProductOptionGroup.product_id`, que já existe desde
ORD-137/144 e já vale pra um produto seja ele vendido avulso ou como componente de combo (a
tabela não sabe nem precisa saber a diferença).

### Eventos de fila
N/A.

### Impacto em outros serviços
Nenhum — `order-service` já aceita `selected_options` por item desde ORD-142
(`ItemIn.selected_options`), sem distinguir se o item veio de um combo explodido ou de um produto
avulso; o totem só precisa passar a preencher esse campo também pros itens vindos de
`line.comboItems`, hoje deixados sem essa chave (comentário `// ORD-159 (pendência registrada)`
em `App.tsx:190` — será removido nesta implementação).

### Detalhes de implementação

**Backend** (`_serialize_combo`, `catalog-service/main.py:451`): dentro do loop que monta cada
item, chamar `groups = await _get_product_option_groups(db, pid)` e incluir
`"option_groups": groups` no dict do item. `ComboItemOut.option_groups: list[ProductOptionGroupOut] = []`
(reaproveita o mesmo schema já usado em `ProductOut.option_groups`, linha 834 — não o
`OptionGroupOut` genérico da linha 742, que não carrega os campos de override do ORD-144). Sem
filtro de `active`/opção-ativa no backend — mesmo padrão do produto avulso, onde
`selectableOptionGroups` (frontend) já faz esse filtro.

**Frontend — tipos** (`types.ts`): `ComboItemRef` ganha `option_groups?: ProductOptionGroup[]`
(dado vindo da API) e `selectedOptions?: SelectedOption[]` (só preenchido em cópias de item
dentro do carrinho, nunca vem da API — mesmo racional de `CartItem.selectedOptions` do ORD-141,
só que por componente em vez de por linha inteira).

**Frontend — helper compartilhado**: generalizar `selectableOptionGroups(p: Product)` pra aceitar
qualquer `{ option_groups?: ProductOptionGroup[] }` (produto avulso ou item de combo usam a mesma
função sem duplicar a regra de filtro).

**Frontend — modal por componente**: novo estado `comboOptionModal: { combo: Combo; selections:
Record<number, Record<number, number[]>> } | null` — chave externa é `product_id` do componente,
interna é `option_group.id -> ids selecionados`, mesma estrutura de `optionModal.selections`
(ORD-141) só que aninhada mais um nível. `toggleOption`/`canConfirmOptionModal` do ORD-141 são
generalizados pra operar sobre `(productId, groupId, optionId)` em vez de só `(groupId,
optionId)` — reaproveita a mesma regra de troca-automática-no-limite (ORD-141 pós-QA), sem
reescrever a lógica.

**Fluxo de adicionar combo unificado**: extrair um `tryAddCombo(c: Combo)` chamado tanto pelo
botão "+"/"Adicionar combo" do catálogo quanto pelo botão "Sim, quero o combo" do modal de upsell
(`CatalogScreen.tsx:989`, hoje chama `addComboToCart(upsell.combo)` direto, sem checar opção).
`tryAddCombo` decide: algum item tem `selectableOptionGroups(item).length > 0`? Abre
`comboOptionModal`. Senão, adiciona direto (comportamento atual, sem regressão pro combo sem
opção). Resolve o "Fluxo alternativo — upsell" do Explorer: seleção de opção do componente abre
**depois** de "Sim, quero o combo", antes do combo efetivamente entrar no carrinho — mesma ordem
já validada no ORD-141 pra upsell de produto avulso (seleção resolve antes do carrinho, upsell é
decidido antes disso ainda, na escolha do produto avulso original).

**Confirmar modal de combo**: monta, por componente, `SelectedOption[]` (mesmo formato do
ORD-141/142) e acumula todos os ids de opção selecionados (de todos os componentes, em ordem) num
array só, ordenado, pra compor a `key` do carrinho: `combo:${c.id}:${allIds.join(",")}` (com
opção) ou `combo:${c.id}` (sem opção, igual hoje) — resolve o critério "mesmo combo 2x com opções
diferentes = 2 linhas", mesmo racional de `key` do produto avulso (ORD-141). `comboItems` salvo no
`CartItem` passa a ser a lista de componentes **com** `selectedOptions` já resolvido por item
(cópia local, não o array vindo direto da API).

**Explosão do pedido** (`App.tsx handleCpfDone`, dentro do `if (line.kind === "combo" &&
line.comboItems)`): pra cada `ci` de `line.comboItems`, se `ci.selectedOptions?.length`, o `name`
do item explodido passa a ser `` `${ci.name} (${line.name}) — ${ci.selectedOptions.map(o =>
o.option_label).join(", ")}` `` (mantém o sufixo `(Nome do Combo)` já existente **antes** do
separador `" — "` do ORD-141/143, não depois — decisão deliberada: `splitNameOption` corta no
primeiro `" — "`, então colocar o sufixo do combo depois da opção faria ele virar parte do texto
da opção no ticket; colocando antes, o ticket mostra nome "Refrigerante Lata 350ml (Combo Classic
Cheddar)" na linha principal e "Guaraná Antarctica" na sub-linha, sem mudar `splitNameOption` nem
`printService.ts`/`SuccessScreen.tsx`). `items.push` ganha `selected_options:
ci.selectedOptions?.map(o => ({ group_name: o.group_name, option_label: o.option_label,
price_delta: o.price_delta }))` — mesmo shape já usado pro item avulso duas linhas abaixo.

**Preço do combo não muda com a opção escolhida**: `price_delta` da opção do componente continua
só informativo (vai em `selected_options`, aparece no ticket via `option_label`), mas **não** é
somado ao preço do combo — o preço do combo já é fixo e independente da soma dos componentes
(é assim que o `discount` do ORD-150 é calculado hoje, `comboSum - line.price`). Mantém esse
racional inalterado; não é uma mudança de precificação, é a ausência deliberada de uma.

### Estimativa
- Backend: 1 ponto (reaproveita `_get_product_option_groups` já existente, sem query nova, sem
  migration).
- Frontend: 5 pontos (modal novo por componente reaproveitando lógica do ORD-141 generalizada,
  unificação do fluxo de upsell de combo, extensão de tipos e da explosão de pedido — mais
  superfície que ORD-141 por ter que lidar com N componentes em vez de 1 produto, mas sem
  conceito novo).

### Riscos
- **Combo com o mesmo `product_id` repetido em 2 componentes distintos**: não observado no
  catálogo real hoje, mas o desenho usa `product_id` como chave externa de
  `comboOptionModal.selections` — se acontecer, as duas ocorrências colapsariam numa seleção só.
  Mitigação: não é um caso de negócio esperado (um combo não costuma ter "2x o mesmo item"
  representado como 2 linhas — isso seria modelado como quantidade, que `ComboItem` não tem
  hoje); aceito como limitação não bloqueante, documentar se aparecer.
- **Opção com `price_delta` != 0 num componente de combo**: preço do combo continua fixo (ver
  acima) — cliente vê a opção escolhida no ticket, mas não paga a diferença. Se isso for
  indesejado pro catálogo real (hoje a opção real, "Refrigerantes Lata 350ml", tem
  `price_delta: 0` em todas as opções, então não é observável ainda), é um ajuste de regra de
  negócio pra história futura, não bloqueia esta.
- **Reaproveitamento de `toggleOption`/`canConfirmOptionModal` generalizados**: risco de
  regressão no modal de produto avulso (ORD-141) se a generalização para aceitar `productId`
  quebrar o caminho existente — mitigado por ser o mesmo componente de modal reaproveitado (não
  uma cópia paralela), então qualquer teste manual do fluxo de produto avulso já cobre o
  caminho compartilhado.
- **Sem impressora física pra validar o ticket do componente com opção dentro de combo**: mesma
  limitação já aceita no ORD-143 — validação fica em dado estruturado (`selected_options` do
  pedido) + preview HTML, não em impressão física real.

## Ready

**Explorer**
- [x] História no formato Como/Quero/Para
- [x] Contexto e motivação documentados (achado técnico: `_serialize_combo` nunca resolve
      `option_groups`, gap real desde que o combo passou a ter um componente com grupo legítimo)
- [x] Fluxo principal passo a passo (7 passos)
- [x] Dependências identificadas (ORD-141/142/143, todas `Done`)
- [x] Wireframe/mockup: reaproveita estrutura visual do modal do ORD-141
- [x] Critérios de aceite funcionais escritos (6 itens)

**QA Explorer**
- [x] Happy path em Gherkin (3 cenários — API, modal, explosão/impressão)
- [x] Cenários de borda (4: combo sem opção, upsell, 2 linhas por opção diferente, grupo sem
      opção ativa)
- [x] Cenário de isolamento multi-tenant (grupo de opção aninhado dentro de combo)
- [x] Cenários aprovados pelo PM

**Tech Explorer**
- [x] Serviços impactados documentados (catalog-service + frontend/totem)
- [x] Endpoint alterado documentado (`GET /catalog/combos`, mudança aditiva)
- [x] Migrations: nenhuma
- [x] Eventos de fila: N/A
- [x] Estimativa definida (1 ponto backend + 5 pontos frontend)
- [x] Riscos identificados (4, todos com mitigação ou aceite explícito)

**Aprovação final**
- [x] Time revisou e concordou com a solução técnica
- [x] Estimativa acordada (1 + 5 pontos)
- [x] Sem bloqueios não resolvidos
- [x] Priorizada no sprint backlog

**Status final: Ready.**

## Validação (implementação, 2026-09-04)

Backend e frontend implementados conforme a Solução Técnica. Testado ao vivo pelo usuário no
totem real (Burger House): combo → modal por componente → seleção de sabor → checkout → ticket.

**Achado 1 — apresentação do resultado precisava de ajuste (não previsto na Solução Técnica
original):** o primeiro teste mostrou os componentes do combo como linhas soltas
(`"1x Refrigerante Lata 350ml (Combo Classic Cheddar)"`, `"1x Classic Cheddar Burger (Combo
Classic Cheddar)"`), sem nenhum vínculo visual entre eles. Usuário pediu explicitamente: "deveria
vir uma linha principal do combo e abaixo os itens... no caso de dois combos iguais replicar as
linhas pois podem ter adicionais diferentes". Expandido o escopo (aprovado pelo usuário na hora,
sem reabrir Explorer — mudança de apresentação/dado, não de regra de negócio nova):

- `order_items` ganha `combo_instance_key`/`combo_name` (migration `20260904_1200`) — cada
  UNIDADE de combo comprada (não cada linha do carrinho) gera uma key nova, nunca reaproveitada
  entre 2 combos idênticos, propagada via `ItemIn`/`TicketOut`.
- `App.tsx handleCpfDone` para de explodir componentes com `qty:line.qty` num só `OrderItem` —
  agora faz loop explícito por unidade, cada uma com sua própria `combo_instance_key`.
- `printService.ts` (ESC/POS) e `SuccessScreen.tsx` (preview HTML) agrupam tickets consecutivos
  com a mesma `combo_instance_key` sob um cabeçalho com o nome do combo.
- Segundo ajuste do usuário, depois de ver o resultado agrupado: repetir "(Nome do Combo)" no
  nome de cada item ficava redundante com o cabeçalho — `stripComboSuffix` remove esse sufixo só
  na exibição (ESC/POS e HTML), nunca em `product_name`/`qr_data` persistido (o app de balcão
  depende desse sufixo pra saber que o item é parte de um combo, ver
  `frontend/balcao/src/lib/orderItems.ts`).

**Achado 2 — bug real, não relacionado ao escopo desta história:** depois do ajuste acima, a
opção escolhida (ex. "Guaraná Antarctica") continuava sumindo do ticket, mesmo com o dado
correto em `selected_options`. Investigação com `console.log` temporário (frontend) + `curl`
direto na API confirmou que o **frontend montava o nome certo**, mas o valor **persistido no
banco vinha cortado**. Causa raiz: `_make_qr_data` (`order-service`, existente desde ORD-052/053,
bem antes de combo ou grupo de opção) tinha `[:50]` — e
`"Refrigerante Lata 350ml (Combo Classic Cheddar) — "` sozinho já bate exatamente 50 caracteres,
cortando qualquer opção escolhida, sempre, silenciosamente. Corrigido pra `[:100]`. Teste de
regressão adicionado. Ver `[[gotcha-truncamento-qr-data-50-chars]]` (memória).

Validado ponta a ponta pelo usuário depois das duas correções: ticket mostra cabeçalho "Combo
Classic Cheddar", componentes indentados abaixo, opção completa visível
("Refrigerante Lata 350ml — Guaraná Antarctica").
