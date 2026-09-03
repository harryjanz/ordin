---
id: ORD-142
status: Ready
fase: 6
sprint: null
responsavel: Backend
estimativa: 3 pontos
tipo: feature
---

# ORD-142 — Grupos de opção: OrderItem carrega a opção escolhida

## Descrição
`OrderItem` (order-service) hoje é plano — `product_id`, `product_name`, `unit_price`, `quantity`, `subtotal`, sem nenhum campo pra opção escolhida (confirmado em `services/order/main.py`). Esta história adiciona esse conceito: ao criar um pedido com um produto que tem opção selecionada, o `OrderItem` persiste qual opção foi escolhida (e o preço final já reflete `unit_price` do produto + `price_delta` da opção). Este é o custo reconhecido em `docs/analise-concorrentes-grupos-opcao-produto.md` da decisão de modelar como conceito de primeira classe em vez de "explodir em produtos".

## Persona
Sistema (order-service) — consumido depois pelo ticket impresso (ORD-143) e potencialmente por relatórios futuros.

## Contexto
Depende de ORD-138 (schema de grupo/opção precisa existir pro order-service referenciar). Pode andar em paralelo com ORD-141 (não depende da UI do totem estar pronta, só do contrato de API). Ver `docs/stories/ORD-137-grupos-opcao-produto.md` pra contexto da iniciativa completa.

**Decisão de produto resolvida (discussão em ORD-138, 31/08): soma, sempre, uma regra só.**

Regra de cálculo: preço final = `unit_price` do produto + soma do `price_delta` de cada opção escolhida, em qualquer grupo (seleção única ou múltipla). O ponto que fazia soma parecer errada pro caso de pizza meio a meio (`docs/analise-mogo-fluxo-pizza.md`) partia de um modelo de precificação diferente do nosso: o Mogo parece dar **preço absoluto próprio a cada sabor**, daí a regra de mercado ser "cobra pelo sabor mais caro". No modelo do Ordin, `price_delta` não é o preço do sabor — é **quanto aquela opção especificamente acrescenta ao preço-base do produto** (delta zero = sabor padrão, incluído no preço-base; delta positivo = ingrediente/sabor que custa a mais). Sob essa convenção, somar os deltas está correto pros dois casos da iniciativa (adicionais E pizza), sem precisar de regra configurável por grupo.

Exemplo validado (pizza G, base R$ 50,00, 2 sabores escolhidos — 1 padrão delta=0, 1 requintado delta=+R$5,00): total = 50 + 0 + 5 = **R$ 55,00**. Consequência aceita, não bug: escolher 2 sabores requintados na mesma pizza soma os dois acréscimos (usou ingrediente extra duas vezes) — mais caro que só um requintado, o que é esperado.

**Implicação pro cadastro (ORD-139):** o campo de preço de cada opção precisa deixar claro na UI que é "acréscimo" (incremental), não "preço da opção" — pra quem cadastra não confundir as duas convenções.

## Explorer

### História
Como operador de balcão/cozinha (via ORD-143, que consome o que esta história persiste), quero que o pedido registre qual opção o cliente escolheu para cada item, para preparar o pedido certo — hoje a opção escolhida no totem (ORD-141) existe só na tela do cliente e desaparece ao finalizar a compra.

### Contexto e motivação
ORD-141 já resolve a escolha e o preço corretos no totem, mas `POST /orders` (contrato atual,
`ItemIn`: `product_id, name, qty, unit_price`) não tem onde guardar QUAL opção foi escolhida —
só o preço final chega ao order-service, sem o rótulo. Sem esta história, o pedido é cobrado
certo mas a cozinha/balcão não sabe se foi "Guaraná" ou "Coca-Cola", nem qual sabor de pizza —
a mesma lacuna que qualquer sistema teria se cobrasse a diferença de preço sem registrar o motivo
dela. Esta história fecha esse buraco: persistir o quê, não só o quanto.

### Fluxo principal
1. Totem monta `POST /orders` com cada item incluindo a(s) opção(ões) escolhida(s) (rótulo +
   `price_delta`, um por opção — grupo de seleção múltipla manda mais de uma entrada pro mesmo
   item).
2. `create_order` (order-service) persiste, pra cada `OrderItem`, as opções escolhidas
   associadas — denormalizado (rótulo da opção e do grupo, preço), no mesmo espírito de
   `product_name` já ser denormalizado hoje (o catálogo pode mudar/a opção pode ser excluída
   depois; o pedido precisa continuar mostrando exatamente o que foi vendido naquele momento).
3. `total`/`unit_price`/`subtotal` continuam calculados exatamente como hoje — o totem já manda o
   `unit_price` com o(s) `price_delta` somado(s) (ORD-141); order-service não recalcula, só
   guarda o detalhe de quais opções compuseram esse valor.
4. `GET /orders/{order_ref}/tickets` (consumido pelo totem logo após a criação do pedido pra
   imprimir, e é onde ORD-143 vai buscar o dado) passa a incluir a opção escolhida de cada
   ticket — sem isso, persistir a opção sem conseguir lê-la de volta deixaria a história
   incompleta.

### Fluxos alternativos / exceções
- **Item sem opção nenhuma** (produto sem grupo vinculado, ORD-141 não abre modal): campo de
  opções vem vazio/ausente no request — comportamento idêntico ao de hoje, sem regressão.
- **Item de combo** (`kind: "combo"`, explodido em produtos reais antes de `POST /orders` — ver
  ORD-150): cada produto explodido do combo pode, em tese, ter opção escolhida — mas hoje
  `addComboToCart` nem oferece a seleção (ver `docs/stories/ORD-159-combo-grupo-opcao-interacao.md`,
  pendência separada). Nesta história, item vindo de combo simplesmente não carrega opção
  nenhuma, igual item de produto avulso sem grupo — não é regressão, é o estado atual do combo.
- **Grupo de seleção múltipla** (`max_selections > 1`, ex. pizza 2 sabores): mais de uma opção
  associada ao mesmo `OrderItem` — schema precisa suportar N opções por item, não 1.
- **`unit_price` que o totem manda não bate com preço-base + soma dos deltas enviados**: fora do
  escopo desta história validar/recalcular (order-service já não faz esse tipo de checagem hoje,
  nem pra combo) — registrado como risco preexistente, não novo.

### Dependências
- Serviços envolvidos: order-service (único alterado). catalog-service não é chamado — mesmo
  padrão de hoje, order-service nunca consulta catalog-service pra validar preço/produto.
- Histórias bloqueantes: nenhuma tecnicamente (ORD-138 já `Done`, fornece o conceito). Faz mais
  sentido andar depois de ORD-141 estar implementada de verdade (não só `Ready`), porque o
  contrato de request (`ItemIn`) que esta história define do lado do order-service precisa bater
  com o que o totem realmente vai mandar — mas as duas podem ser desenvolvidas em paralelo desde
  que o contrato seja acordado no Tech Explorer.
- ORD-143 depende desta (usa o dado aqui persistido/exposto pra imprimir).

### Critérios de aceite funcionais
- [ ] `POST /orders` aceita opção(ões) escolhida(s) por item, sem quebrar chamadas que não
      mandam nenhuma (produto sem grupo continua funcionando idêntico a hoje).
- [ ] Pedido criado com item que tem opção escolhida persiste essa opção associada ao
      `OrderItem` correspondente.
- [ ] Item com múltiplas opções escolhidas (mesmo grupo, seleção múltipla) persiste todas, não
      só a última.
- [ ] `total`/`subtotal` do pedido continuam calculados exatamente como hoje (sem mudança de
      regra de preço nesta história — preço já vem pronto do totem).
- [ ] `GET /orders/{order_ref}/tickets` retorna a opção escolhida de cada ticket/item.
- [ ] Isolamento multi-tenant inalterado (nenhum campo novo depende de company_id além do que já
      existe na cadeia Order→OrderItem→Ticket).

### Wireframe / Mockup
N/A — história 100% backend, sem UI própria (consumida por ORD-143).

## QA Explorer

```gherkin
Feature: OrderItem persiste a opção escolhida
  Como operador de balcão/cozinha (via ORD-143)
  Quero que o pedido registre qual opção foi escolhida em cada item
  Para preparar o pedido certo, não só cobrar o preço certo

  Background:
    Dado um totem autenticado (role kiosk) de uma empresa com catálogo e grupos de opção cadastrados

  # ── Happy path ──────────────────────────────────────────────────────────

  Scenario: Pedido com item de seleção única persiste a opção escolhida
    Quando o totem envia POST /orders com um item "Refrigerante lata 350ml" (qty=1, unit_price=6.00)
      e opção escolhida {group: "Sabor", option: "Guaraná Antarctica", price_delta: 0}
    Então o pedido é criado com sucesso (mesmo comportamento de hoje)
      E o OrderItem correspondente tem a opção "Guaraná Antarctica" associada
    Quando o totem consulta GET /orders/{order_ref}/tickets
    Então o ticket desse item retorna a opção "Guaraná Antarctica" na resposta

  Scenario: Pedido com item de seleção múltipla persiste todas as opções escolhidas
    Quando o totem envia POST /orders com um item "Pizza G" (unit_price já somado com os deltas)
      e 2 opções escolhidas do grupo "Sabores": "Marguerita" (delta=0) e "Calabresa" (delta=5.00)
    Então o OrderItem tem as 2 opções associadas, não só a última enviada
      E GET /orders/{order_ref}/tickets retorna as 2 opções no ticket desse item

  Scenario: Pedido com múltiplos itens, cada um com opção diferente
    Quando o totem envia POST /orders com 2 itens: "Refrigerante — Coca-Cola" e "Refrigerante — Guaraná"
    Então cada OrderItem persiste só a sua própria opção, sem mistura entre os dois

  # ── Regressão (sem opção) ──────────────────────────────────────────────

  Scenario: Item sem grupo de opção vinculado continua funcionando sem mudança
    Quando o totem envia POST /orders com um item sem nenhuma opção no payload (produto sem grupo, como hoje)
    Então o pedido é criado normalmente, OrderItem sem nenhuma opção associada
      E GET /orders/{order_ref}/tickets retorna o ticket sem campo de opção preenchido (mesmo formato de hoje pra esse caso)

  Scenario: Item vindo de combo não carrega opção (comportamento atual, sem regressão)
    Dado um combo explodido em produtos reais antes do POST /orders (ORD-150)
    Quando o totem envia o pedido com os itens do combo
    Então nenhum item de combo carrega opção — mesmo estado de hoje (gap documentado em ORD-159, fora desta história)

  Scenario: total e subtotal do pedido não mudam de fórmula
    Quando o totem envia POST /orders com itens que têm opção escolhida (preço já somado no unit_price)
    Então total = soma(unit_price × qty) − discount, exatamente como antes de existir opção — sem recálculo server-side do price_delta

  # ── Isolamento multi-tenant ─────────────────────────────────────────────

  Scenario: Empresa B não lê a opção escolhida de pedido da empresa A
    Dado um pedido da empresa A com item que tem opção escolhida
    Quando um usuário da empresa B chama GET /orders/{order_ref}/tickets desse pedido
    Então a resposta é 404 (mesmo isolamento já existente — ORD-017), o campo de opção novo não abre nenhuma brecha
```

**Cenários aprovados pelo PM** — happy path cobre seleção única e múltipla e múltiplos itens
independentes; regressão cobre item sem opção e item de combo (ligado à pendência ORD-159, sem
bloquear); isolamento multi-tenant confirma que o campo novo não introduz vazamento — herda a
proteção já existente de `GET /orders/{order_ref}/tickets`.

## Solução Técnica

### Serviços impactados
- **order-service**: único serviço alterado — modelo (tabela nova + relacionamento), schemas de
  request/response, `create_order` e `list_order_tickets`.
- **catalog-service**: nenhuma mudança (não é chamado por `create_order`, mesmo comportamento de
  hoje).
- **frontend/totem**: precisa mandar o campo novo no request de `POST /orders` — fica a cargo de
  ORD-141 (contrato definido aqui, implementação de quem manda fica lá) ou de um ajuste pontual em
  `App.tsx`/`handleCpfDone` (onde o payload de `POST /orders` é montado hoje a partir do carrinho)
  se ORD-141 já estiver implementada antes desta.

### Endpoints

#### POST /orders (alterado — campo novo, aditivo)
**Serviço:** order-service
**Auth:** JWT obrigatório | role: `kiosk`
**company_id:** extraído do JWT (inalterado)

Request (trecho novo em `ItemIn`, resto inalterado):
```json
{
  "items": [{
    "product_id": 501,
    "name": "Refrigerante lata 350ml",
    "qty": 1,
    "unit_price": 6.00,
    "selected_options": [
      { "group_name": "Sabor", "option_label": "Guaraná Antarctica", "price_delta": 0 }
    ]
  }]
}
```
`selected_options` default `[]` — item sem opção manda lista vazia ou omite o campo, sem quebrar
nenhuma chamada existente (mesmo padrão aditivo já usado em `option_groups` no catalog-service,
ORD-138).

Response: inalterada (`OrderOut` — `order_ref`, `total`, `status`; total continua vindo de
`unit_price` já pronto, sem recálculo).

Erros: inalterados (400/401/403 já existentes — nenhum novo caso de erro introduzido).

#### GET /orders/{order_ref}/tickets (alterado — campo novo, aditivo)
**Serviço:** order-service
**Auth:** JWT obrigatório | qualquer role autenticado da empresa (inalterado)
**company_id:** filtro por `Order.company_id == current_user.company_id`, já existente

Response (trecho novo em cada item de `tickets`, resto inalterado):
```json
{
  "order_ref": "ABC123",
  "tickets": [{
    "ticket_code": "X7F2K9",
    "selected_options": [
      { "group_name": "Sabor", "option_label": "Guaraná Antarctica", "price_delta": 0 }
    ]
  }]
}
```
Erros: inalterados (404 — pedido não encontrado ou de outra empresa).

### Migrations
`services/order/migrations/versions/20260903_1800_order_item_options.py` (nome ilustrativo, data
real na implementação):
- Tabela nova `order_item_options`:
  - `id` (PK)
  - `order_item_id` (FK → `order_items.id`, `nullable=False`, índice)
  - `group_name` (`String(80)`, `nullable=False`) — denormalizado, mesmo racional de `product_name`
  - `option_label` (`String(80)`, `nullable=False`) — denormalizado
  - `price_delta` (`Numeric(10,2)`, `nullable=False`, `default=0`)

Sem alteração em `order_items`/`orders`/`tickets` — 1:N puro, tabela filha nova.
`OrderItem` ganha `selected_options = relationship("OrderItemOption", cascade="all, delete")`
(mesmo padrão de `tickets = relationship("Ticket", ...)` já existente na mesma classe).

### Eventos de fila
N/A — `broadcast_order_created`/`broadcast_ticket_collected` (WebSocket, não fila) continuam
carregando só o que já carregam hoje (nome do produto, não a opção) — nenhum consumidor downstream
precisa da opção em tempo real; ORD-143 lê via `GET /orders/{order_ref}/tickets`, não via evento.

### Impacto em outros serviços
Nenhum — order-service continua não chamando catalog-service (mesmo padrão já existente de
confiar no `unit_price`/nome que o totem manda, igual combo já faz hoje).

### Detalhes de implementação

**`create_order`**: depois de `db.add(oi); await db.flush()` (linha ~351, pra ter `oi.id`), loop
`for opt in item.selected_options: db.add(OrderItemOption(order_item_id=oi.id, group_name=opt.group_name, option_label=opt.option_label, price_delta=opt.price_delta))` — mesmo ponto onde os
`Ticket` já são criados no loop seguinte, sem mudar a ordem/lógica existente de geração de ticket.

**`list_order_tickets`**: query atual (`select(Ticket, Order.qr_data)` com join em `Order`)
precisa também trazer `Ticket.order_item_id` pra buscar as opções — adiciona join com `OrderItem`
e uma segunda query (ou join direto) trazendo `OrderItemOption` agrupado por `order_item_id`,
anexado no dict de cada ticket como `selected_options`. Uma segunda query simples (`WHERE
order_item_id IN (...)`) é mais direta que um join triplo com agregação em Python — poucos itens
por pedido, sem custo de performance relevante.

### Estimativa
- Backend: 3 pontos (migration + modelo + 2 endpoints alterados de forma aditiva + testes).

### Riscos
- **Contrato de request precisa bater com o que ORD-141 realmente manda**: como as duas histórias
  podem ser implementadas em paralelo, o nome dos campos (`group_name`/`option_label`/
  `price_delta`) definido aqui vira o contrato que ORD-141 precisa seguir do lado do totem.
  Mitigação: contrato já fixado neste Tech Explorer antes de qualquer implementação — se ORD-141
  for implementada primeiro, conferir que bate com isso antes de escrever o payload no totem.
- **Query N+1 em `list_order_tickets` se implementada ingenuamente** (uma query de opções por
  ticket, dentro do loop de serialização): mitigado explicitamente acima — uma única query
  batelada por `order_item_id`, não uma por ticket.
- **Nenhum recálculo/validação server-side do `price_delta` somado**: já registrado no Explorer
  como risco preexistente (mesmo comportamento de combo hoje) — não é novo, só reafirmado aqui
  pra não ficar reintroduzindo a mesma discussão history assim que alguém revisar o código.

## Ready

**Explorer**
- [x] História no formato Como/Quero/Para
- [x] Contexto e motivação documentados (regra de preço já resolvida desde ORD-138)
- [x] Fluxo principal passo a passo
- [x] Dependências identificadas (ORD-138 `Done`; contrato acordado com ORD-141 em paralelo)
- [x] Wireframe/mockup: N/A, história backend
- [x] Critérios de aceite funcionais escritos (6 itens)

**QA Explorer**
- [x] Happy path em Gherkin (3 cenários)
- [x] Cenários de borda/regressão (3 cenários: sem opção, item de combo, fórmula de total)
- [x] Cenário de isolamento multi-tenant
- [x] Cenários aprovados pelo PM

**Tech Explorer**
- [x] Serviços impactados documentados (order-service; catalog-service explicitamente inalterado)
- [x] Endpoints alterados com payload request/response completo
- [x] Migration descrita (tabela `order_item_options`)
- [x] Eventos de fila: N/A, justificado
- [x] Estimativa definida (3 pontos)
- [x] Riscos identificados (3, com mitigação)

**Aprovação final**
- [x] Time revisou e concordou com a solução técnica
- [x] Estimativa acordada (3 pontos)
- [x] Sem bloqueios não resolvidos
- [x] Priorizada no sprint backlog

**Status final: Ready.**
