---
id: ORD-192
status: Ready
estimativa: 3 pontos (backend + frontend)
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-192 — Filtros de estoque na listagem de produtos

## Descrição
História **A8** do épico de estoque/ERP (`docs/estudo-modulo-estoque-erp.md`, Bloco F —
Visibilidade e custo, achado nos prints do Mercado Livre). Depende de A2 (`ORD-181`), A3
(`ORD-183`) e A4 (`ORD-185`), todas Ready. Adiciona filtro de estoque à listagem de produtos do
**admin** (`include_inactive=true`) — diferente da A4, que filtra o caminho de leitura do **totem**.

## Persona
**Empresa** (owner/manager/admin que gerencia catálogo e estoque).

## Explorer

### História
Como **Empresa**, quero filtrar a listagem de produtos por estado de estoque (com estoque / baixo /
esgotado / indefinido), para encontrar rapidamente o que precisa de reposição sem abrir produto por
produto.

### Decisão de escopo — partição dos 4 estados, mutuamente exclusivos
| Estado | Condição |
|---|---|
| **Indefinido** | Produto sem `stock_item` (nunca teve movimentação — regra de rollout já estabelecida na A4) |
| **Esgotado** | `stock_item` existe, `quantidade_atual == 0` |
| **Baixo** | `stock_item` existe, `0 < quantidade_atual <= estoque_minimo` (mesmo `<=` já fixado na A3) |
| **Com estoque** | `stock_item` existe, `quantidade_atual > estoque_minimo` |

Todo produto cai em exatamente um dos 4 — sem sobreposição, sem "nenhum dos 4".

### Limitação conhecida, documentada e não resolvida nesta história (achado da revisão de PM)
O épico já tem o Bloco G (Ready): opções podem ser produtos reais com `stock_item` **próprio**, e um
produto "guarda-chuva" (G4) **nunca** tem `stock_item` próprio — a gravação é rejeitada de propósito
pra evitar dado duplicado. Sob a partição acima, **todo produto guarda-chuva aparece sempre como
"Indefinido"**, mesmo que suas opções estejam com estoque baixíssimo ou esgotado de verdade (ex.:
"Refrigerante Lata 350ml" some do filtro "esgotado" mesmo se todas as 4 opções de sabor estiverem
zeradas).

**Decisão**: **não resolver isso nesta história** — fica como limitação conhecida, documentada aqui
e não escondida. Resolver de verdade exigiria uma consulta agregada (pior estado entre as opções do
produto) via `UNION`/`JOIN` entre `Product` e `Option` como fontes de estoque — custo já antecipado
no documento do épico ("A8/A9/C1 precisam de `UNION` entre `Product` e `Option`"), maior que
"variação de `WHERE`" que já motivou a estimativa de 3 pontos. Tratar como pendência formal pra
quando **C1** (vínculo automático) for desenhada, mesmo padrão já usado pra outras lacunas
cross-entity do Bloco G (ex.: EAN duplicado entre `Option` e `Product`, `ORD-188`).

### Decisão de escopo — onde entra o filtro
`GET /catalog/products` (mesmo endpoint, `include_inactive=true`, listagem do admin) ganha um novo
query param `stock_filter: "com_estoque" | "baixo" | "esgotado" | "indefinido" | None`. Sem filtro
(`None`), comportamento idêntico a hoje. Na UI, um `Dropdown`/conjunto de `Tag`s clicáveis acima da
tabela de produtos (mesma posição de outros filtros já existentes na listagem, se houver).

### Fluxo principal
1. Empresa abre a listagem de produtos no admin.
2. Seleciona um dos 4 filtros de estoque.
3. A listagem mostra só os produtos naquele estado.

### Fluxos alternativos / exceções
- **Nenhum filtro selecionado**: listagem completa, comportamento de hoje, sem regressão.
- **Produto guarda-chuva**: sempre aparece em "Indefinido" — limitação conhecida acima, não um bug
  desta história.
- **Filtro combinado com `category_id`** (já existente): os dois filtros se combinam com `AND`,
  mesmo padrão que A4 já usa pra combinar filtro de menu-ativo com filtro de estoque no totem.

### Dependências
- **Depende de A2, A3 e A4** (todas Ready) — usa `stock_item.quantidade_atual` (A2),
  `estoque_minimo` (A3) e reaproveita o mesmo racional de "controlado" já estabelecido na A4.
- **Pendência registrada pra C1**: resolver o estado agregado de produtos guarda-chuva via `UNION`
  com `Option`.

### Critérios de aceite funcionais
- [ ] 4 estados mutuamente exclusivos, cobrindo 100% dos produtos
- [ ] Sem filtro: comportamento idêntico ao endpoint de hoje
- [ ] Filtro combina com `category_id` já existente via `AND`
- [ ] Produto guarda-chuva aparece em "Indefinido" (limitação documentada, não bug)

## QA Explorer

### Cenários

```gherkin
Funcionalidade: Filtros de estoque na listagem de produtos

  Esquema do Cenário: Cada estado isolado retorna só os produtos correspondentes
    Dado produtos nos 4 estados: indefinido, esgotado, baixo, com_estoque
    Quando filtro a listagem por stock_filter=<estado>
    Então só os produtos daquele estado aparecem
    Exemplos:
      | estado |
      | indefinido |
      | esgotado |
      | baixo |
      | com_estoque |

  Cenário: quantidade_atual == estoque_minimo cai em "baixo", não "com estoque"
    Dado um produto com stock_item, quantidade_atual=3, estoque_minimo=3
    Quando filtro por stock_filter=baixo
    Então o produto aparece
    Quando filtro por stock_filter=com_estoque
    Então o produto NÃO aparece
    # reaproveita o <= já fixado na A3 — mesma borda, mesma regra, sem reinterpretação aqui

  Cenário: quantidade_atual == 0 com estoque_minimo > 0 cai em "esgotado", não "baixo"
    Dado um produto com stock_item, quantidade_atual=0, estoque_minimo=5
    Quando filtro por stock_filter=esgotado
    Então o produto aparece
    Quando filtro por stock_filter=baixo
    Então o produto NÃO aparece
    # confirma que "esgotado" tem precedência sobre "baixo" — são estados discretos, não uma escala
    # contínua onde 0 seria só o extremo de "baixo"; a partição não deixa ambiguidade nesse ponto

  Cenário: Filtro combinado com category_id (AND)
    Dado produtos esgotados em duas categorias diferentes
    Quando filtro por stock_filter=esgotado E category_id=X
    Então só os produtos esgotados DA categoria X aparecem

  Cenário: Sem filtro nenhum mantém comportamento de hoje
    Dado produtos em todos os 4 estados
    Quando chamo GET /catalog/products sem stock_filter
    Então todos os produtos aparecem, sem nenhum sido excluído

  Cenário: Produto guarda-chuva aparece em "indefinido" mesmo com opções esgotadas (comportamento esperado, não regressão)
    Dado um produto guarda-chuva (sem stock_item próprio, rejeitado por G4) cujas opções estão
    todas com quantidade_atual=0
    Quando filtro por stock_filter=indefinido
    Então o produto aparece
    Quando filtro por stock_filter=esgotado
    Então o produto NÃO aparece
    # documentando a limitação conhecida como comportamento intencional — não é bug desta história,
    # é a lacuna já registrada e adiada pra C1
```

### Lacunas encontradas

1. **Reuso da função de batch fetch já existente (achado real, checar antes de implementar)**: a
   `ORD-185` (A4) já criou `_stock_items_by_product(db, product_ids)` pra evitar N+1 no caminho do
   totem. **Esta história precisa reaproveitar a MESMA função**, não escrever uma segunda query
   batch equivalente — do contrário, `list_products` (admin) ganharia sua própria versão paralela
   da mesma lógica, divergindo com o tempo. Bloqueante pro Tech Explorer confirmar o reuso
   explicitamente, com o mesmo teste de contagem de queries já usado na `ORD-185`
   (`test_list_products_stock_filter_sem_n_mais_1`) adaptado pro caminho admin.
2. **Isolamento multi-tenant**: não precisa de teste novo dedicado — `list_products` já filtra por
   `company_id` antes de qualquer coisa (mesma base da A4), e o filtro de estoque só adiciona uma
   condição sobre produtos que já vieram filtrados por empresa. Confirmação, não lacuna.
3. **Estado "esgotado" com `estoque_minimo=0` (produto sem mínimo configurado)**: não coberto
   explicitamente na Explorer — `quantidade_atual=0` e `estoque_minimo=0` significa `quantidade_atual
   <= estoque_minimo` também é verdadeiro (0<=0), mas a partição prioriza "esgotado" sobre "baixo"
   quando `quantidade_atual==0` independente do valor de `estoque_minimo` (inclusive 0) — vale um
   cenário explícito de teste pra essa combinação específica, já que é o caso mais comum (a maioria
   dos produtos provavelmente não configura `estoque_minimo`, ficando com o default 0).

## Tech Explorer

### Função de classificação (nova, reaproveita `_stock_items_by_product` da `ORD-185`/A4)

```python
def _classify_stock_state(item: "StockItem | None", estoque_minimo: Decimal) -> str:
    """Ordem importa: "esgotado" é checado ANTES de "baixo" — garante precedência quando
    quantidade_atual==0 e estoque_minimo também é 0 (caso mais comum, produto sem mínimo
    configurado), achado da revisão de QA."""
    if item is None:
        return "indefinido"
    if item.quantidade_atual == 0:
        return "esgotado"
    if item.quantidade_atual <= estoque_minimo:  # mesmo <= já fixado na ORD-183
        return "baixo"
    return "com_estoque"
```

### Diff em `list_products` (`services/catalog/main.py`, mesmo endpoint que a `ORD-185`/A4 já modificou)

O ponto central: o batch fetch de `stock_item` (`_stock_items_by_product`, criado na A4) passa a
rodar **sempre que for necessário pra QUALQUER um dos dois filtros** (menu+estoque do totem, OU
`stock_filter` do admin) — nunca duas vezes, nunca uma função paralela:

```python
async def list_products(
    category_id: int | None = None,
    include_inactive: bool = False,
    stock_filter: Literal["com_estoque", "baixo", "esgotado", "indefinido"] | None = None,  # NOVO (A8)
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

    # NOVO (A8): um único batch fetch, reaproveitado pelos dois filtros que possam precisar dele —
    # A4 (menu+estoque, só quando include_inactive=False) e A8 (stock_filter, qualquer valor de
    # include_inactive). Sem essa unificação, a combinação include_inactive=False + stock_filter
    # dispararia a mesma query duas vezes.
    stock_by_product: dict[int, "StockItem"] = {}
    if not include_inactive or stock_filter is not None:
        stock_by_product = await _stock_items_by_product(db, [p.id for p in products])

    if not include_inactive:
        menus_by_cat = await _menus_by_category(db, company_id)
        menus_by_prod = await _menus_by_product(db, company_id)

        def _visible(p: "Product") -> bool:
            linked = list(menus_by_prod.get(p.id, []))
            if p.category_id is not None:
                linked += menus_by_cat.get(p.category_id, [])
            if linked and not any(_is_menu_active_now(m) for m in linked):
                return False
            stock_item = stock_by_product.get(p.id)
            if stock_item is not None and stock_item.quantidade_atual <= p.estoque_minimo:
                return False
            return True

        products = [p for p in products if _visible(p)]  # filtro A4 (totem), inalterado

    if stock_filter is not None:  # NOVO (A8) — independente de include_inactive
        products = [
            p for p in products
            if _classify_stock_state(stock_by_product.get(p.id), p.estoque_minimo) == stock_filter
        ]

    return {"products": [await _serialize_product(db, p) for p in products]}
```

**Por que `stock_filter` funciona com `include_inactive=True` ou `False`**: os dois filtros (A4 e
A8) são independentes e compõem por `AND` naturalmente — cada um é um `list comprehension`
separado que só reduz a lista `products`, nunca a reconstrói. Na prática, o frontend admin sempre
chama com `include_inactive=True`, então a combinação `include_inactive=False` +
`stock_filter` preenchido é só uma possibilidade teórica da API, não um fluxo real da UI — mas o
backend não precisa de nenhuma exceção especial pra lidar com ela corretamente.

**`Literal` no parâmetro de query** (em vez de `str`): FastAPI/Pydantic já rejeitam valor fora do
conjunto com 422 automático — sem precisar de validação manual tipo `_validate_cfop`.

### Estimativa
**3 pontos confirmados** — reaproveita 100% do batch fetch já existente (A4), só adiciona a função
de classificação e o filtro final sobre a lista já carregada. Sem schema novo, sem migration.

### Riscos
- Nenhum risco técnico relevante — extensão aditiva sobre uma função já testada (`ORD-185`), sem
  introduzir N+1 novo (reaproveita o mesmo batch fetch, nunca duplicado).
- **Limitação de produto guarda-chuva** (já registrada na Explorer): não é risco técnico, é
  limitação de produto conhecida e aceita — só reforçando aqui que o Tech Explorer não tenta
  contornar isso silenciosamente.

## Ready
Passou pelas 3 rodadas de revisão (PM, QA, Backend SR).

- **PM**: fechou a partição de 4 estados mutuamente exclusivos; achou o gap real de produto
  guarda-chuva (Bloco G) sempre cair em "indefinido" mesmo com opções esgotadas — decidiu **não**
  resolver agora (exigiria `UNION` entre `Product` e `Option`, custo já antecipado no épico),
  registrado como limitação conhecida e pendência formal pra C1.
- **QA**: cenários pros 4 estados, bordas (`quantidade_atual == estoque_minimo`,
  `quantidade_atual == 0` com `estoque_minimo > 0`), filtro combinado com `category_id`, e o
  comportamento esperado (não-bug) do produto guarda-chuva. Exigiu reuso da função de batch fetch
  já criada na A4 (`_stock_items_by_product`), não uma duplicata.
- **Backend SR**: unificou o batch fetch entre o filtro de A4 (totem) e o novo `stock_filter`
  (admin) num único ponto, evitando query duplicada na combinação teórica
  `include_inactive=False` + `stock_filter`. `_classify_stock_state` com ordem de checagem que
  garante "esgotado" ter precedência sobre "baixo" quando `quantidade_atual==0`, mesmo com
  `estoque_minimo=0` (caso mais comum). Estimativa confirmada em 3 pontos.
