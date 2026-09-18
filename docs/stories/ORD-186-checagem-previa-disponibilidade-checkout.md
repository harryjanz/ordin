---
id: ORD-186
status: Ready
estimativa: 5 pontos (backend + frontend)
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-186 — Checagem prévia de disponibilidade do carrinho antes de cobrar no TEF

## Descrição
História **A4b** do épico de estoque/ERP (`docs/estudo-modulo-estoque-erp.md`, Bloco A —
Fundação). Última história do bloco — fecha a fundação inteira do épico. Depende de A4
(`ORD-185`, Ready). Nasceu da revisão de QA na quebra do épico em histórias: o desenho original só
cobria "item some do cardápio" (A4); esta história cobre o caso de um item **já estar no carrinho**
quando esgota, evitando cobrar o cliente por algo que já não existe — o estorno automático (D2,
história futura) vira fallback raro, não o caminho principal.

## Persona
**Cliente no totem** (efeito direto).

## Explorer

### História
Como **Cliente no totem**, quero que o sistema confirme a disponibilidade dos itens do meu
carrinho antes de eu ser cobrado, para nunca pagar por algo que esgotou enquanto eu navegava.

### Ponto exato de inserção no fluxo (verificado no código)
`frontend/totem/src/App.tsx`, função `handleCpfDone` (linha 183) — é a função que monta a lista de
`items` a partir do `cart` e chama `POST /orders` (linha 240), logo antes de trocar pra tela de
pagamento (`setScreen("payment")`, linha 248). A checagem entra **no início desta função**, antes
de montar `items` e antes de chamar `POST /orders` — não modifica `POST /orders` nem
`order-service` de forma nenhuma; é uma camada de checagem que só decide se a função continua ou
para ali.

### Decisão de escopo — endpoint novo em `catalog-service`, não em `order-service`
`POST /catalog/products/check-availability` (autenticação idêntica às outras rotas de catálogo do
totem, incluindo role `kiosk`). Corpo: lista de `product_id`. Resposta: lista de
`unavailable_product_ids`. Reaproveita **a mesma lógica de disponibilidade já usada pela A4**
(`_visible`/checagem de `stock_item`+`estoque_minimo` em `list_products`,
`services/catalog/main.py:1632`) — extraída pra uma função compartilhada, não duplicada. Ficar em
`catalog-service` (não em `order-service`) mantém toda a lógica de estoque no mesmo serviço que já
é dono dela desde A1 — `order-service` **não é tocado nesta história**.

### Decisão de escopo — mensagem é modal, não toast (fechando lacuna da revisão de PM)
Diferente de um toast auto-dismiss, a mensagem de remoção usa um **modal com confirmação
explícita** — mesma disciplina já aplicada a todo elemento novo do totem (`CLAUDE.md`, regra de UX
obrigatória): conteúdo relevante (cliente perdendo item que queria) não pode depender de o cliente
ver a tela no momento certo antes de sumir sozinho. Texto: *"Alguns itens esgotaram enquanto você
montava seu pedido e foram removidos do carrinho: [lista de nomes]. Você pode continuar com o
restante do pedido."* Botão único: **"Entendi, continuar"** — fecha o modal e mantém o cliente na
tela atual, carrinho já atualizado sem os itens removidos.

### Decisão de escopo — combo inteiro removido, sem oferecer substituição (confirmado na revisão de PM)
Se um componente de combo estiver indisponível, o **combo inteiro** é removido — oferecer trocar o
componente por outro exigiria conhecer as regras de substituição do grupo de opção (ORD-138/146),
recalcular preço e checar disponibilidade do substituto, o que é uma feature de edição de combo,
não uma rede de segurança de checkout. Fora de escopo desta história, registrado como possível
melhoria futura.

### Fronteira com D1/D2 — quem cobre qual janela de risco (explicitado na revisão de PM)
Existem duas janelas de risco distintas, com donos diferentes:
1. **Entre a checagem (passo 2) e a criação do pedido (`POST /orders`, passo 3)** — janela curta,
   coberta por esta história (A4b). Se algo mudar bem nesse intervalo de milissegundos, ainda pode
   escapar — mas é o caso raro, não o comum.
2. **Entre a criação do pedido e a cobrança real no TEF** (cliente ainda digita CPF, escolhe forma
   de pagamento) — janela maior, mas **não é escopo desta história**. É coberta pelas decisões já
   registradas no épico pra D1/D2 (Bloco D, histórias futuras): baixa automática na aprovação do
   pagamento + estorno automático se falhar. A4b resolve o caso comum e barato (antes de qualquer
   coisa acontecer); D1/D2 resolvem o que sobra até o instante real da cobrança.

### Decisão de escopo — carrinho com combo
O `cart` do totem tem itens avulsos (`line.id` = `product_id`) e combos (`line.comboItems[]`, cada
componente com seu próprio `product_id`). A checagem envia **todos** os `product_id` envolvidos,
avulsos e de dentro de combos. Se um componente de um combo estiver indisponível, **o combo inteiro
é removido do carrinho** (não dá pra vender metade de um combo) — os outros itens do carrinho,
avulsos ou de outros combos, continuam normalmente se estiverem disponíveis.

### Decisão de escopo — falha na própria chamada de checagem (não é "item indisponível")
Se a chamada a `POST /catalog/products/check-availability` falhar (rede, catalog-service fora do
ar) — diferente de "item indisponível", que é uma resposta válida — o fluxo **não avança pra
`POST /orders`**. Mostra mensagem de "não foi possível confirmar disponibilidade, tente novamente"
e mantém o cliente na tela atual. Falha aqui é fail-safe (bloqueia), não fail-open (nunca assume
"tudo disponível" só porque não conseguiu perguntar) — nenhum dinheiro foi movimentado ainda nesse
ponto, então bloquear é a opção mais segura e mais barata (não é uma reversão de cobrança, é só
adiar a tentativa).

### Fluxo principal
1. Cliente monta o carrinho e avança pra pagamento (tela de CPF/consumo, `handleCpfDone`).
2. Antes de montar o pedido, o totem chama `POST /catalog/products/check-availability` com todos os
   `product_id` do carrinho (avulsos + componentes de combo).
3. Se todos disponíveis: segue exatamente como hoje — monta `items`, chama `POST /orders`, vai pra
   tela de pagamento.
4. Se algum indisponível: remove do carrinho (combo inteiro, se for componente de combo), mostra
   mensagem nomeando o(s) item(ns) removido(s), permanece na tela atual — cliente pode revisar o
   carrinho atualizado e tentar de novo.

### Fluxos alternativos / exceções
- **Falha na própria chamada de checagem**: bloqueia o avanço, mensagem de "tente novamente" (ver
  decisão de escopo acima) — não assume disponibilidade por padrão.
- **Carrinho fica vazio depois de remover itens indisponíveis**: cliente volta pra tela de catálogo
  (mesmo destino de um carrinho vazio hoje).
- **Todos os itens disponíveis**: nenhuma mudança de comportamento visível — checagem é
  transparente no caminho feliz.

### Dependências
- **Depende de A4** (`ORD-185`, Ready) — reaproveita a mesma lógica de disponibilidade.
- **Fecha o Bloco A** — não há história futura do Bloco A que dependa desta.
- Relacionada (não bloqueante): D2 (estorno automático, Bloco D) cobre o caso raro que esta história
  não pega (concorrência exata no mesmo instante entre a checagem e a aprovação do TEF).

### Critérios de aceite funcionais
- [ ] Carrinho com todos os itens disponíveis: fluxo idêntico ao atual, sem mudança perceptível
- [ ] Item avulso indisponível: removido do carrinho, mensagem específica, pedido não é criado
- [ ] Componente de combo indisponível: combo inteiro removido, não só o componente
- [ ] Falha na chamada de checagem (não "indisponível", falha de verdade): bloqueia avanço, não
      assume disponibilidade
- [ ] `order-service` e `POST /orders` não sofrem nenhuma alteração nesta história

## QA Explorer

### Cenários Gherkin

```gherkin
Feature: Checagem prévia de disponibilidade do carrinho
  Como Cliente no totem
  Quero que o sistema confirme a disponibilidade do meu carrinho antes de eu ser cobrado
  Para nunca pagar por algo que esgotou enquanto eu navegava

  Scenario: Carrinho todo disponível segue o fluxo normal
    Dado um carrinho com itens todos disponíveis
    Quando avanço pra pagamento
    Então o pedido é criado normalmente (POST /orders), sem nenhum modal ou interrupção

  Scenario: Item avulso indisponível é removido com modal
    Dado um carrinho com um item avulso que esgotou
    Quando avanço pra pagamento
    Então o item é removido do carrinho, um modal aparece nomeando o item, e o pedido só é
    criado depois que eu tocar em "Entendi, continuar"

  Scenario: Componente de combo indisponível remove o combo inteiro
    Dado um carrinho com um combo cujo componente esgotou
    Quando avanço pra pagamento
    Então o combo inteiro é removido (não só o componente), e o modal nomeia o combo removido

  Scenario: Múltiplos itens indisponíveis aparecem juntos na mesma mensagem
    Dado um carrinho com 2 itens avulsos e 1 combo, todos indisponíveis
    Quando avanço pra pagamento
    Então um único modal lista os 3 (nomeados), não 3 modais em sequência

  Scenario: Falha na chamada de checagem bloqueia o avanço (fail-safe)
    Dado que a chamada a POST /catalog/products/check-availability falha (timeout, 5xx)
    Quando avanço pra pagamento
    Então o pedido NÃO é criado, uma mensagem de "tente novamente" aparece, e o carrinho
    permanece intacto (nada é removido — a falha não significa "indisponível")

  Scenario: Carrinho vazio após remoção volta pro catálogo
    Dado um carrinho com um único item, que esgotou
    Quando avanço pra pagamento e o item é removido
    Então, ao fechar o modal, sou levado de volta à tela de catálogo (carrinho vazio)

  Scenario: Isolamento multi-tenant na checagem de disponibilidade
    Dado um product_id pertencente à empresa Y
    Quando um totem autenticado como empresa X inclui esse product_id na checagem
    Então o backend trata como indisponível (nunca confirma disponibilidade de produto de outra
    empresa, nem vaza informação sobre ele)

  Scenario: product_id inexistente é tratado como indisponível, sem erro
    Dado um product_id que não existe mais (excluído)
    Quando esse id é incluído na checagem de disponibilidade
    Então o backend responde normalmente, listando esse id como indisponível

  Scenario: valor total do carrinho é recalculado após remoção
    Dado um carrinho com 3 itens, um deles indisponível
    Quando o item indisponível é removido automaticamente
    Então o valor total exibido reflete só os 2 itens restantes

  Scenario: modal de disponibilidade não bloqueia o timeout de inatividade existente
    Dado o modal de itens removidos aberto na tela
    Quando o cliente fica inativo pelo tempo configurado (ORD-158)
    Então o totem volta pra tela de PIN normalmente, como em qualquer outra tela
```

### Critérios de aceite testáveis
- [ ] `product_id` inexistente tratado como indisponível, sem erro 500
- [ ] Total do carrinho recalculado corretamente após remoção automática
- [ ] Modal não interfere no timeout de inatividade global já existente (`ORD-158`)
- [ ] Isolamento multi-tenant: `product_id` de outra empresa sempre retorna como indisponível

### O que ainda impede o avanço pro Tech Explorer
Nada bloqueante — revisão de QA aprovada com os cenários acima incorporados.

## Tech Explorer

### Lógica de disponibilidade compartilhada (`services/catalog/main.py`)

Em vez de reimplementar a checagem, extraio a regra completa de disponibilidade (menu + estoque) —
já usada em `list_products` desde a `ORD-185` — numa função só, reutilizável por qualquer endpoint
que precise saber "esse produto está disponível pro cliente agora":

```python
# NOVA função — reaproveita _menus_by_category, _menus_by_product, _is_menu_active_now
# (já existentes) e _stock_items_by_product (ORD-185)
async def _availability_map(
    db: AsyncSession, company_id: int, product_ids: list[int]
) -> dict[int, bool]:
    """True = disponível. Produto inexistente ou de outra empresa nunca aparece
    no dict resultante com True — fica ausente ou False, tratado como
    indisponível pelo chamador (fail-safe, nunca confirma o que não achou)."""
    availability = {pid: False for pid in product_ids}  # default: indisponível
    if not product_ids:
        return availability

    result = await db.execute(
        select(Product).filter(
            Product.id.in_(product_ids), Product.company_id == company_id, Product.deleted == False
        )
    )
    products = {p.id: p for p in result.scalars().all()}  # ids de outra empresa/inexistentes: ausentes daqui

    menus_by_cat = await _menus_by_category(db, company_id)
    menus_by_prod = await _menus_by_product(db, company_id)
    stock_by_product = await _stock_items_by_product(db, list(products.keys()))

    for pid, p in products.items():
        linked = list(menus_by_prod.get(pid, []))
        if p.category_id is not None:
            linked += menus_by_cat.get(p.category_id, [])
        menu_ok = not linked or any(_is_menu_active_now(m) for m in linked)
        availability[pid] = menu_ok and _is_stock_available(p, stock_by_product)
    return availability
```

**Nota de coordenação pra quem implementar**: se a `ORD-185` ainda não tiver sido codada quando
esta história começar, vale já nascer com `_availability_map` como a fonte única de verdade — o
`_visible` de `list_products` (`ORD-185`) deveria chamar essa mesma função em vez de duplicar a
combinação menu+estoque inline. Se a `ORD-185` já estiver em produção nesse ponto, documentar a
duplicação como dívida técnica pequena e não bloqueante (mesma regra, dois lugares, baixo risco de
divergência porque a lógica é simples).

### Endpoint novo

```python
class CheckAvailabilityIn(BaseModel):
    product_ids: list[int]

class CheckAvailabilityOut(BaseModel):
    unavailable_product_ids: list[int]

@app.post(
    "/catalog/products/check-availability",
    response_model=CheckAvailabilityOut,
    tags=["Catálogo"],
    summary="Checar disponibilidade de uma lista de produtos antes do checkout",
)
async def check_products_availability(
    body: CheckAvailabilityIn,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id),  # mesmo auth de list_products, inclui role kiosk
):
    unique_ids = list(set(body.product_ids))
    availability = await _availability_map(db, company_id, unique_ids)
    unavailable = [pid for pid, ok in availability.items() if not ok]
    return {"unavailable_product_ids": unavailable}
```

`resolve_company_id` (não `_write`) — mesma dependency já usada em `list_products`, aceita o papel
`kiosk` do totem. Isolamento multi-tenant e "produto inexistente" resolvidos de graça pelo
`_availability_map`: um `product_id` de outra empresa nunca entra no `products` carregado, então
nunca vira `True` — cai automaticamente na lista de indisponíveis, sem erro nem vazamento de
informação sobre a existência do produto em outra empresa.

### Diff no frontend (`frontend/totem/src/App.tsx`, `handleCpfDone`, linha 183)

Só o início da função muda — o restante (montagem de `items`, `POST /orders`, linha 240 em diante)
continua idêntico:

```typescript
async function handleCpfDone(c: string | null, consumptionTypeOverride?: ConsumptionType | null, pickupName?: string | null) {
  setCpf(c);

  // NOVO — ORD-186: checagem de disponibilidade antes de montar o pedido
  const productIds = new Set<number>();
  for (const line of cart) {
    if (line.kind === "combo" && line.comboItems) {
      for (const ci of line.comboItems) productIds.add(ci.product_id);
    } else {
      productIds.add(line.id);
    }
  }

  let unavailableIds: number[] = [];
  try {
    const res = await api.post("/catalog/products/check-availability", {
      product_ids: Array.from(productIds),
    });
    unavailableIds = res.data.unavailable_product_ids ?? [];
  } catch {
    setAvailabilityCheckFailed(true);  // modal de "tente novamente" — fail-safe, não avança
    return;
  }

  if (unavailableIds.length > 0) {
    const removedNames = removeUnavailableFromCart(unavailableIds);  // novo no cart store (zustand)
    setRemovedItemsModal(removedNames);  // modal "Entendi, continuar" (decisão de PM)
    return;  // não monta items, não chama POST /orders
  }

  try {
    // ... resto da função exatamente como hoje (linha 185 em diante)
```

`removeUnavailableFromCart` (novo no store do carrinho): recebe `unavailableIds`, remove linhas
avulsas cujo `id` está na lista, remove **combos inteiros** cujo qualquer
`comboItems[].product_id` está na lista (decisão de PM), retorna os nomes removidos pro modal.

### Riscos
- Duplicação pequena de lógica entre `_visible` (`ORD-185`) e `_availability_map`, se as duas
  histórias forem implementadas fora de ordem — mitigável na hora (nota de coordenação acima), não
  bloqueante.
- Nenhum outro risco relevante — `order-service` não é tocado, endpoint novo é aditivo e reaproveita
  padrões já testados.

### Estimativa
**5 pontos confirmados** — endpoint novo com lógica reaproveitada (baixo risco técnico), diff de
frontend localizado numa função já existente, e um componente de modal novo (touch-friendly, já
especificado pela PM).

### O que ainda impede o avanço pro Ready
Nada bloqueante.

## Ready

Upstream repassado formalmente por papel (PM, QA, backend) — cada fase achou e corrigiu pelo menos
um problema real antes de aprovar a passagem pra próxima:

**Explorer:** [x] história · [x] ponto exato de inserção verificado no código
(`App.tsx:183`/`:240`) · [x] decisões de escopo (endpoint em catalog-service, combo inteiro
removido, fail-safe em falha de checagem) · [x] dependências (A4) · [x] critérios de aceite.
**Revisão de PM**: achou que a mensagem de remoção não estava especificada o suficiente (corrigido:
modal com texto e botão exatos, não toast); confirmou a decisão de remover combo inteiro; explicitou
a fronteira de responsabilidade entre esta história e D1/D2 (Bloco D, futuro) pras janelas de risco
restantes.

**QA Explorer:** [x] happy path · [x] bordas (item avulso, combo, múltiplos itens, falha de
checagem fail-safe, carrinho vazio, produto inexistente) · [x] isolamento multi-tenant · [x]
recálculo de total · [x] interação com timeout de inatividade (`ORD-158`) · [x] cenários aprovados.

**Tech Explorer:** [x] lógica de disponibilidade extraída e compartilhável · [x] endpoint novo,
isolamento e "produto inexistente" resolvidos pela mesma função · [x] diff exato do frontend,
localizado numa função já existente · [x] riscos — duplicação pequena e não bloqueante.

**Status: Ready.** Última história do Bloco A — com esta, a fundação inteira do épico de
estoque/ERP está pronta pra entrar em sprint.
