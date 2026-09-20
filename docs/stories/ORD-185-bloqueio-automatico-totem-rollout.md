---
id: ORD-185
status: Ready
estimativa: 5 pontos (backend + frontend) — revisado de 8 na revisão de PM, ver achado de escopo
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-185 — Bloqueio automático no totem + regra de rollout `estoque_controlado`

## Descrição
História **A4** do épico de estoque/ERP (`docs/estudo-modulo-estoque-erp.md`, Bloco A —
Fundação). Depende de A2 (`ORD-181`) e A3 (`ORD-183`), ambas Ready. É a história que efetivamente
esconde produto do cardápio do totem quando o estoque bate o mínimo — as anteriores (A2/A3) só
prepararam o dado, esta consome.

## Persona
**Cliente no totem** (efeito visível) — configurado indiretamente pela **Empresa** via A2/A3.

## Explorer

### História
Como **Cliente no totem**, quero deixar de ver produtos que atingiram o estoque mínimo, para não
tentar comprar algo que não está disponível.

### 🔎 Achado de código antes de qualquer estimativa: o refresh periódico já existe
A revisão de time do épico (PM, na quebra em histórias) estimou esta história em 8 pontos citando
"refresh em tempo real + superfície de teste de rollout" como motivo do aumento. Investigação direta
do código **antes** de escrever esta história encontrou que **o polling periódico do totem já
existe e já chama exatamente o endpoint que precisa ser filtrado**:

- `frontend/totem/src/screens/CatalogScreen.tsx:143` — `setInterval(() => { refreshCatalog({
  silent: true }); ... }, POLL_INTERVAL_MS)`, com `POLL_INTERVAL_MS = 90_000` (linha 31).
- `loadProducts` (linha 106-108) chama `GET /catalog/products?category_id=...` — **sem**
  `include_inactive`, ou seja, já usa o caminho de leitura "totem" (`include_inactive=False`) do
  `list_products` (`services/catalog/main.py:1632`).

**Consequência real de escopo**: não existe nenhum código de refresh a construir no frontend — o
totem já recarrega o catálogo a cada 90s e vai naturalmente refletir qualquer mudança que o backend
passar a filtrar. O trabalho real desta história é **quase inteiramente backend**: fazer
`list_products` parar de retornar produtos sem estoque. **Revisão de PM confirmou o achado como
verificado (não suposição) e revisou a estimativa de 8 para 5 pontos** — tamanho comparável à A2
(sem UI nova, com superfície de teste de rollout considerável), não aos 8 pontos originais que
incluíam trabalho de refresh que já não existe mais como pendência.

### Decisão de escopo — `estoque_controlado` não precisa de coluna nova
A regra de rollout (decisão 11 do épico: produto só entra em controle automático depois da 1ª
entrada registrada) não precisa de um campo novo `estoque_controlado` no banco. `stock_item`
(`ORD-181`) só é criado depois de uma primeira movimentação, e essa primeira movimentação **só pode
ser do tipo "entrada"** (regra já validada na `ORD-181`: "primeira movimentação de um produto
precisa ser uma entrada"). Logo, **`estoque_controlado` é logicamente equivalente a "o produto tem
`stock_item`"** — não precisa de flag nova, computado, nem persistido.

### Decisão explícita — não existe "descontrole" de estoque (achado da revisão de PM)
Não há, nesta história nem em nenhuma anterior do épico, um endpoint pra remover o `stock_item` de
um produto e voltá-lo ao estado "nunca teve movimentação". Isso é **intencional**: uma vez que a
Empresa começa a rastrear estoque de um produto, não faz sentido de produto "desistir" e voltar ao
controle manual puro — o caminho correto pra qualquer situação depois disso é usar `ajuste`
(`ORD-181`) pra corrigir a quantidade, nunca desfazer o controle em si. Registrado aqui como decisão
consciente, não como lacuna.

### Verificação de código — categoria vazia por esgotamento de estoque (achado da revisão de PM)
Antes de decidir se isso é escopo desta história, verifiquei `list_categories`
(`services/catalog/main.py:1600`): a listagem de categorias do totem (`include_inactive=False`) já
filtra **só pela janela de menu ativo** (`_menus_by_category`/`_is_menu_active_now`), **não** por
existir algum produto visível dentro da categoria. Ou seja, **uma categoria já pode aparecer vazia
pro cliente hoje**, antes mesmo desta história existir (ex.: todos os produtos de uma categoria com
`active=False` manual). A A4 não introduz esse comportamento — só adiciona mais uma causa possível
pro mesmo efeito que já existe. **Fora de escopo desta história** corrigir isso; se o usuário achar
que vale a pena esconder categoria vazia (por qualquer causa), isso é uma história própria, não
uma consequência obrigatória de A4.

### Decisão de escopo — onde a regra se aplica
Só no caminho de leitura usado pelo totem (`list_products` com `include_inactive=False`,
`services/catalog/main.py:1632`) — a listagem do admin (`include_inactive=True`) continua mostrando
todos os produtos, sem filtro de estoque. Indicador de estoque baixo pro admin já existe por
produto individual (seção "Estoque", A3) — **não é escopo desta história** adicionar indicador na
listagem geral do admin (isso é Fase 4, dashboards, já adiado).

### Fluxo principal
1. Produto tem `stock_item` (controlado) com `quantidade_atual <= estoque_minimo`.
2. Cliente no totem está navegando o cardápio (já carregado) ou abre o cardápio agora.
3. Na próxima chamada de `GET /catalog/products` (carregamento inicial, troca de categoria, ou
   poll silencioso a cada 90s), o produto não aparece mais na resposta.

### Fluxos alternativos / exceções
- **Produto sem `stock_item`** (nunca teve movimentação): aparece normalmente, independente de
  `estoque_minimo` — regra de rollout, já decidida no épico.
- **Produto com `stock_item` mas `quantidade_atual > estoque_minimo`**: aparece normalmente.
- **Cliente já estava com o carrinho montado quando o produto some**: **fora de escopo desta
  história** — é exatamente o que a A4b (checkout) resolve.

### Dependências
- **Depende de A2** (`ORD-181`, Ready) e **A3** (`ORD-183`, Ready).
- **Histórias futuras que consomem esta**: A4b (checkout, usa o mesmo dado de disponibilidade); D1
  (baixa automática, também vai checar `estoque_controlado` via presença de `stock_item`).

### Critérios de aceite funcionais
- [ ] Produto controlado e abaixo do mínimo não aparece em `GET /catalog/products` (caminho totem)
- [ ] Produto sem `stock_item` aparece normalmente, mesmo com `estoque_minimo` configurado
- [ ] Listagem do admin (`include_inactive=True`) não é afetada por este filtro
- [ ] Produto volta a aparecer automaticamente (no próximo poll ou reload) se uma entrada trouxer o
      estoque de volta pra cima do mínimo

## QA Explorer

### Cenários Gherkin

```gherkin
Feature: Bloqueio automático no totem por estoque mínimo
  Como Cliente no totem
  Quero deixar de ver produtos que atingiram o estoque mínimo
  Para não tentar comprar algo indisponível

  Scenario: Produto controlado abaixo do mínimo some da listagem do totem
    Dado um produto com stock_item, quantidade_atual=2, estoque_minimo=3
    Quando chamo GET /catalog/products sem include_inactive
    Então o produto não aparece na resposta

  Scenario: Produto controlado exatamente no mínimo também some (borda)
    Dado um produto com stock_item, quantidade_atual=3, estoque_minimo=3
    Quando chamo GET /catalog/products sem include_inactive
    Então o produto não aparece (limite é <=, mesma regra já fixada na ORD-183)

  Scenario: Produto controlado acima do mínimo aparece normalmente
    Dado um produto com stock_item, quantidade_atual=10, estoque_minimo=3
    Quando chamo GET /catalog/products sem include_inactive
    Então o produto aparece normalmente

  Scenario: Produto sem stock_item aparece mesmo com estoque_minimo configurado
    Dado um produto sem stock_item, mas com estoque_minimo=5 configurado
    Quando chamo GET /catalog/products sem include_inactive
    Então o produto aparece normalmente (regra de rollout)

  Scenario: Produto menu-inativo continua escondido independente do estoque
    Dado um produto fora da janela de menu ativo, mas com estoque disponível
    Quando chamo GET /catalog/products sem include_inactive
    Então o produto não aparece (filtro de menu já existente continua funcionando em conjunto
    com o novo filtro de estoque, não um substituindo o outro)

  Scenario: Listagem do admin não é afetada
    Dado um produto controlado e abaixo do mínimo
    Quando chamo GET /catalog/products com include_inactive=true
    Então o produto aparece normalmente na listagem do admin

  Scenario: Produto volta a aparecer após nova entrada
    Dado um produto controlado e abaixo do mínimo (não aparece na listagem)
    Quando uma entrada (ORD-181) traz a quantidade de volta pra acima do mínimo
    Então a próxima chamada de GET /catalog/products já mostra o produto de novo — sem precisar
    de nenhuma ação além do poll de 90s já existente no totem (CatalogScreen.tsx:143)

  Scenario: Filtro de estoque não introduz N+1
    Dado uma categoria com 50 produtos, metade com stock_item e metade sem
    Quando chamo GET /catalog/products para essa categoria
    Então o número de queries executadas não escala com a quantidade de produtos (uma query pra
    buscar produtos + uma query batch pra stock_item, não uma query de estoque por produto)
```

### Critérios de aceite testáveis
- [ ] Borda exata (`quantidade_atual == estoque_minimo`) também esconde o produto
- [ ] Filtro de estoque e filtro de menu-ativo funcionam em conjunto (AND), não um substitui o outro
- [ ] Batch fetch de `stock_item` não introduz N+1 (teste de contagem de queries)
- [ ] Produto reaparece automaticamente após nova entrada, sem ação manual além do poll existente

### Confirmação da revisão de QA (não é lacuna)
**Isolamento multi-tenant no batch fetch de `stock_item`**: não precisa de filtro adicional de
`company_id` — os `product_id` já vieram de uma consulta de `Product` já filtrada por `company_id`,
então o `product_id IN (...)` já está implicitamente isolado.

### O que ainda impede o avanço pro Tech Explorer
Nada bloqueante — revisão de QA aprovada com os cenários acima incorporados.

## Tech Explorer

### Diff em `list_products` (`services/catalog/main.py:1632`)

Só o que muda — a query inicial, a serialização final e o resto do endpoint continuam idênticos:

```python
# NOVA função, mesmo padrão de _menus_by_category/_menus_by_product já existentes no arquivo
async def _stock_items_by_product(db: AsyncSession, product_ids: list[int]) -> dict[int, "StockItem"]:
    if not product_ids:
        return {}
    result = await db.execute(select(StockItem).filter(StockItem.product_id.in_(product_ids)))
    return {si.product_id: si for si in result.scalars().all()}


async def list_products(
    category_id: int | None = None,
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id),
):
    q = select(Product).filter_by(company_id=company_id, deleted=False)
    if not include_inactive:
        q = q.filter_by(active=True)
    if category_id:
        q = q.filter_by(category_id=category_id)
    q = q.order_by(Product.sort_order.asc(), Product.id.asc())
    result = await db.execute(q)
    products = result.scalars().all()

    if not include_inactive:
        menus_by_cat = await _menus_by_category(db, company_id)
        menus_by_prod = await _menus_by_product(db, company_id)
        stock_by_product = await _stock_items_by_product(db, [p.id for p in products])  # NOVO

        def _visible(p: "Product") -> bool:
            linked = list(menus_by_prod.get(p.id, []))
            if p.category_id is not None:
                linked += menus_by_cat.get(p.category_id, [])
            if linked and not any(_is_menu_active_now(m) for m in linked):
                return False
            stock_item = stock_by_product.get(p.id)  # NOVO — estoque_controlado = existe stock_item
            if stock_item is not None and stock_item.quantidade_atual <= p.estoque_minimo:  # NOVO
                return False  # achado de QA: <=, mesma regra da ORD-183
            return True

        products = [p for p in products if _visible(p)]

    return {"products": [await _serialize_product(db, p) for p in products]}
```

**Por que isso não introduz N+1**: `_stock_items_by_product` faz **uma** query com `IN (...)` pra
todos os produtos já carregados na página, exatamente o mesmo padrão de `_menus_by_category`/
`_menus_by_product` — não uma consulta por produto dentro do loop de `_visible`.

**Por que não precisa de filtro de `company_id` na query de `StockItem`** (confirmação de QA): os
`product_ids` passados já vieram da consulta de `Product` acima, que já filtrou por `company_id` —
`product_id IN (...)` já está implicitamente isolado por tenant.

**Reestruturação da condição em `_visible`**: troquei `return not linked or any(...)` (forma
original) por um `if linked and not any(...): return False` seguido da checagem de estoque — é
logicamente equivalente pra menu, só reescrito pra dar espaço à segunda condição (estoque) sem
empilhar tudo numa expressão booleana só.

### Teste de N+1 (achado de QA)

```python
async def test_list_products_stock_filter_sem_n_mais_1(db_session, ...):
    query_count = 0
    def _count(*args, **kwargs):
        nonlocal query_count
        query_count += 1
    event.listen(engine.sync_engine, "before_cursor_execute", _count)
    try:
        await client.get("/catalog/products")
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", _count)
    assert query_count <= 4  # produtos + menus_by_cat + menus_by_prod + stock_by_product, fixo
```
Número fixo de queries independente de N produtos — se subir com N, o teste falha.

### Riscos
Nenhum risco técnico relevante — extensão de uma função já existente e já testada (menu-visibility),
seguindo o mesmo padrão de batch fetch, sem schema novo.

### Estimativa
**5 pontos confirmados** (revisado de 8 pela PM, após o achado de que o refresh do frontend já
existe) — o trabalho real é um diff pequeno numa função já existente, mais a superfície de teste de
rollout (produto controlado/não controlado, borda exata, N+1).

### O que ainda impede o avanço pro Ready
Nada bloqueante.

## Ready

Upstream repassado formalmente por papel (PM, QA, backend) — cada fase achou e corrigiu pelo menos
um problema real antes de aprovar a passagem pra próxima:

**Explorer:** [x] história · [x] decisão de escopo (`estoque_controlado` sem coluna nova) · [x]
fluxo principal · [x] dependências (A2, A3) · [x] critérios de aceite. **Revisão de PM — achado
mais importante de toda a história**: verificação de código confirmou que o refresh periódico do
totem (`CatalogScreen.tsx:143`, 90s) já existe e já chama o endpoint certo — eliminou a necessidade
de qualquer trabalho de frontend de polling, revisando a estimativa de 8 pra 5 pontos. Também
confirmou "não existe descontrole de estoque" como decisão consciente, e verificou (não assumiu)
que categoria vazia por esgotamento é comportamento pré-existente, fora de escopo.

**QA Explorer:** [x] happy path · [x] bordas (limite exato, produto sem `stock_item`, filtro de
menu + estoque em conjunto) · [x] listagem do admin não afetada · [x] performance (N+1) · [x]
cenários aprovados.

**Tech Explorer:** [x] diff exato de `list_products`, reaproveitando o padrão de batch fetch já
existente · [x] teste de N+1 · [x] riscos — nenhum relevante.

**Status: Ready.** Penúltima história do Bloco A — depende de A2 e A3 (ambas Ready). Só falta A4b
(checkout) pra fechar a fundação inteira do épico.
