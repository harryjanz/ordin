---
id: ORD-160
status: Ready
estimativa: 3,5 pontos (1,5 backend + 1 admin + 1 totem)
tipo: feature
fase: 6
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-160 — Produtos correlacionados (cross-sell sem combo)

## Descrição
O catálogo do Ordin já cobre cardápio, grupos de opção (ORD-137 a 146) e combos com preço
próprio (ORD-112/150/157), mas não tem um jeito de indicar que dois produtos combinam bem sem
precisar empacotar os dois num `Combo`. Esta história adiciona **produtos correlacionados**:
o admin cadastra que um produto sugere outro (ex. "Batata Frita" sugere "Molho Barbecue"), e o
totem oferece essa sugestão quando o cliente adiciona o produto avulso ao carrinho — sem alterar
preço nem depender de um combo cadastrado.

## Persona
Admin da empresa (dono/gerente), que cadastra a correlação no painel administrativo. Cliente
final no totem, que recebe a sugestão e decide se aceita — objetivo de negócio é aumentar o
ticket médio, seguindo o mesmo racional (validado por pesquisa de mercado) que já motivou o
upsell de combo.

## Contexto
Levantado pelo usuário em 2026-09-08, ao revisar o backlog do catálogo: com cardápio, opções,
combos e categorias já maduros, a lacuna identificada é justamente cross-sell independente de
combo — pesquisa de mercado em `docs/analise-concorrentes-produtos-correlacionados.md` (Toast
POS "Menu Upsells" foi a única fonte de produto real encontrada; Goomer/iFood confirmam a
prática mas sem documentação de configuração pública). A pesquisa também levantou uma
possibilidade de sugestão assistida por IA (LLM sobre metadado do catálogo para empresas novas,
association rule mining sobre pedidos para empresas maduras) — decisão do usuário (2026-09-08):
**não faz parte desta história**, fica registrada como roadmap futuro
(`[[project_produtos_correlacionados_escopo]]`). Esta história é só o CRUD manual.

## Explorer

### História
Como admin da empresa, quero cadastrar produtos correlacionados a um produto do catálogo, para
que o totem sugira esse item complementar ao cliente quando ele adicionar o produto avulso ao
carrinho, aumentando o ticket médio sem precisar criar um combo com preço próprio.

### Contexto e motivação
Hoje o único mecanismo de sugestão no totem é o modal de upsell de combo (ORD-150/157), que só
dispara quando o produto é componente de um `Combo` ativo com sugestão ligada. Isso não cobre o
caso comum de "esses dois produtos combinam, mas não fazem sentido como pacote de preço fixo"
(ex: um produto de preço variável como uma sobremesa, ou um acompanhamento que o cliente pode
querer com qualquer sanduíche do cardápio, não um combo específico). A pesquisa de mercado
confirma que essa é uma categoria própria — o Toast POS chama de "Menu Upsells" e trata como
entidade separada de bundle/combo, exatamente a lacuna identificada.

**Nome do recurso:** "produtos correlacionados", escolhido de propósito pra não colidir com
"upsell", que no domínio do Ordin já significa outra coisa (trocar por combo com desconto).

**Prioridade combo > correlacionado — decisão fechada (2026-09-08):** `handleAddProduct` no
totem continua checando primeiro se o produto é componente de algum combo elegível
(`upsell_enabled`+`triggers_upsell`) — se achar, mantém o modal "Leve o Combo X" exatamente como
hoje, **sem nenhuma mudança de comportamento**. Só quando não há combo elegível é que a nova
checagem de produtos correlacionados entra em ação. É um `if`/`else if`: nunca os dois ao mesmo
tempo, então não existe cenário de dois modais concorrentes disputando o mesmo produto.

### Fluxo principal
1. Admin edita um produto existente no painel (`ProductEditScreen.tsx`) e vê uma nova seção
   "Produtos correlacionados".
2. Admin busca e seleciona um ou mais produtos ativos do catálogo da própria empresa pra
   correlacionar (ex.: em "Batata Frita", adiciona "Molho Barbecue" e "Molho Cheddar").
3. Admin salva — a correlação fica registrada só nessa direção (produto de origem → produtos
   sugeridos), sem criar automaticamente a correlação inversa.
4. No totem, cliente adiciona "Batata Frita" avulsa ao carrinho. Como não há combo elegível pra
   ela, o sistema verifica produtos correlacionados ativos e oferece a sugestão (ex.: "Que tal
   também um Molho Barbecue?").
5. Cliente aceita (produto sugerido é adicionado ao carrinho também) ou recusa (segue só com o
   produto original) — produto original sempre é adicionado ao carrinho independente da escolha.

### Fluxos alternativos / exceções
- Produto tem combo elegível E produtos correlacionados cadastrados → só o modal de combo
  aparece (prioridade combo > correlacionado, decisão fechada acima).
- Produto correlacionado sugerido está inativo (`active: false`) ou foi excluído
  (`deleted: true`) → não entra na lista de candidatos a sugestão, mesmo que a associação ainda
  exista no cadastro (mesmo padrão de soft-delete já usado em `Product`/`Category`/`Combo`).
- Produto sem nenhum combo elegível nem produtos correlacionados cadastrados → comportamento
  atual, adiciona direto ao carrinho sem nenhum modal.
- Admin tenta correlacionar um produto a ele mesmo → bloqueado na validação (sem sentido de
  negócio, produto não pode sugerir a si próprio).
- Produto de origem é excluído (`deleted: true`) → suas correlações somem junto (não aparecem
  mais como origem de sugestão); produtos que o tinham como *sugestão* também deixam de
  oferecê-lo, pela mesma checagem de `active`/`deleted` acima.

### Dependências
- Serviços envolvidos: `catalog` (nova tabela de associação produto-produto, novos endpoints ou
  extensão do endpoint de produto) e `frontend/admin` (`ProductEditScreen.tsx`) e
  `frontend/totem` (`CatalogScreen.tsx`, `handleAddProduct`).
- Depende do modelo já existente de `Combo`/`ComboItem` (ORD-112) como precedente estrutural, mas
  sem acoplamento de dado — é uma tabela nova, independente.
- Sem histórias bloqueantes.
- Fora de escopo, registrado à parte: sugestão automática/assistida por IA — roadmap futuro, ver
  `docs/analise-concorrentes-produtos-correlacionados.md` e
  `[[project_produtos_correlacionados_escopo]]`.

### Critérios de aceite funcionais
- [ ] Admin consegue, na edição de um produto, buscar e associar um ou mais produtos ativos do
      catálogo da mesma empresa como "produtos correlacionados".
- [ ] Admin consegue remover uma correlação já cadastrada.
- [ ] A correlação é unidirecional — cadastrar "Batata → Molho" não cria automaticamente
      "Molho → Batata".
- [ ] No totem, adicionar um produto avulso que tem produtos correlacionados ativos, e NÃO tem
      combo elegível, mostra a sugestão desses produtos.
- [ ] No totem, adicionar um produto avulso que tem combo elegível continua mostrando só o modal
      de combo (comportamento do ORD-150/157 inalterado), mesmo que esse produto também tenha
      produtos correlacionados cadastrados.
- [ ] Cliente pode aceitar (adiciona também o produto sugerido) ou recusar (segue só com o
      original) a sugestão — produto original é adicionado ao carrinho nos dois casos.
- [ ] Produto correlacionado inativo ou excluído não aparece como sugestão **no totem** — mas a
      relação continua existindo e visível no admin (não é removida por desativação do produto
      correlacionado).
- [ ] Na lista de produtos correlacionados do admin, cada item mostra visivelmente se está ativo
      ou inativo (ex.: badge "Inativo") — admin não precisa abrir o outro produto pra descobrir.
- [ ] Não é possível cadastrar um produto como correlacionado a ele mesmo.
- [ ] Isolamento multi-tenant: correlação cadastrada por uma empresa não aparece nem é editável
      por outra.

### Wireframe / Mockup
N/A — reaproveita padrão de busca+seleção múltipla já usado em outras associações do admin (ex.
seleção de produtos ao montar um `Combo` em `ComboFormScreen.tsx`).

**Aprovação final (2026-09-08):** aprovado no chat pelo usuário após o Tech Explorer, incluindo
a correção de semântica de desativação (relação nunca some, só a oferta no totem) e o requisito
de status visível no admin. `Ready` — sem bloqueios, apto a entrar no sprint backlog.

## QA Explorer

```gherkin
Feature: Produtos correlacionados (cross-sell sem combo)
  Como admin da empresa
  Quero cadastrar produtos correlacionados a um produto do catálogo
  Para que o totem sugira esse item complementar sem depender de combo

  Background:
    Dado os produtos ativos "Batata Frita" e "Molho Barbecue" da empresa "Burger House"

  Scenario: Admin cadastra um produto correlacionado
    Quando o admin edita "Batata Frita" e adiciona "Molho Barbecue" como produto correlacionado
    E salva
    Então "Molho Barbecue" aparece na lista de produtos correlacionados de "Batata Frita"

  Scenario: Admin remove uma correlação já cadastrada
    Dado "Batata Frita" com "Molho Barbecue" como produto correlacionado
    Quando o admin remove essa correlação e salva
    Então "Molho Barbecue" não aparece mais na lista de correlacionados de "Batata Frita"

  Scenario: Correlação é unidirecional
    Dado "Batata Frita" com "Molho Barbecue" como produto correlacionado
    Quando o admin abre a edição de "Molho Barbecue"
    Então "Batata Frita" NÃO aparece automaticamente como correlacionado de "Molho Barbecue"

  Scenario: Admin não consegue correlacionar um produto a ele mesmo
    Quando o admin tenta adicionar "Batata Frita" como correlacionado dela própria
    Então o sistema bloqueia com um erro de validação
    E nenhuma correlação é salva

  Scenario: Sugestão aparece no totem quando não há combo elegível
    Dado "Batata Frita" com "Molho Barbecue" como produto correlacionado
    E "Batata Frita" não é componente de nenhum combo ativo
    Quando o cliente no totem adiciona "Batata Frita" avulsa ao carrinho
    Então aparece a sugestão oferecendo "Molho Barbecue"
    E "Batata Frita" já está no carrinho nesse momento

  Scenario: Combo tem prioridade sobre produto correlacionado
    Dado "Batata Frita" é componente do combo ativo "Combo Lanche Grande" com sugestão de upsell ligada
    E "Batata Frita" também tem "Molho Barbecue" como produto correlacionado
    Quando o cliente no totem adiciona "Batata Frita" avulsa ao carrinho
    Então aparece o modal de upsell do "Combo Lanche Grande"
    E a sugestão de produto correlacionado NÃO aparece

  Scenario: Cliente aceita a sugestão de produto correlacionado
    Dado a sugestão de "Molho Barbecue" apareceu após adicionar "Batata Frita"
    Quando o cliente aceita a sugestão
    Então "Molho Barbecue" é adicionado ao carrinho
    E "Batata Frita" continua no carrinho

  Scenario: Cliente recusa a sugestão de produto correlacionado
    Dado a sugestão de "Molho Barbecue" apareceu após adicionar "Batata Frita"
    Quando o cliente recusa a sugestão
    Então "Molho Barbecue" NÃO é adicionado ao carrinho
    E "Batata Frita" continua normalmente no carrinho

  Scenario: Múltiplos produtos correlacionados aparecem juntos na sugestão
    Dado "Batata Frita" com "Molho Barbecue" e "Molho Cheddar" como produtos correlacionados, ambos ativos
    E "Batata Frita" não é componente de nenhum combo ativo
    Quando o cliente no totem adiciona "Batata Frita" avulsa ao carrinho
    Então a sugestão oferece "Molho Barbecue" e "Molho Cheddar" juntos, não só o primeiro

  Scenario: Produto correlacionado inativo não aparece como sugestão, mas a relação continua
    Dado "Batata Frita" com "Molho Barbecue" como produto correlacionado
    E "Molho Barbecue" está com active: false
    Quando o cliente no totem adiciona "Batata Frita" avulsa ao carrinho
    Então nenhuma sugestão de "Molho Barbecue" aparece
    Mas ao editar "Batata Frita" no admin, "Molho Barbecue" continua na lista de correlacionados
    E aparece marcado visivelmente como inativo

  Scenario: Produto correlacionado reativado volta a ser sugerido, sem recadastrar nada
    Dado "Batata Frita" com "Molho Barbecue" como produto correlacionado, "Molho Barbecue" inativo
    Quando o admin reativa "Molho Barbecue" (active: true)
    E o cliente no totem adiciona "Batata Frita" avulsa ao carrinho
    Então a sugestão de "Molho Barbecue" volta a aparecer, sem nenhuma nova associação cadastrada

  Scenario: Produto correlacionado excluído não aparece como sugestão
    Dado "Batata Frita" com "Molho Barbecue" como produto correlacionado
    E "Molho Barbecue" foi excluído (deleted: true)
    Quando o cliente no totem adiciona "Batata Frita" avulsa ao carrinho
    Então nenhuma sugestão de "Molho Barbecue" aparece

  Scenario: Produto de origem excluído deixa de disparar suas correlações
    Dado "Batata Frita" com "Molho Barbecue" como produto correlacionado
    Quando "Batata Frita" é excluída (deleted: true)
    Então a correlação não é mais consultada
    E "Molho Barbecue" não aparece mais como sugestão de "Batata Frita" em nenhum lugar

  Scenario: Produto sem combo e sem produtos correlacionados segue sem sugestão
    Dado um produto ativo sem nenhum combo elegível e sem produtos correlacionados cadastrados
    Quando o cliente no totem adiciona esse produto avulso ao carrinho
    Então o produto é adicionado direto, sem nenhum modal de sugestão

  Scenario: Isolamento multi-tenant
    Dado a empresa "Burger House" com "Batata Frita" correlacionada a "Molho Barbecue"
    Quando a empresa "Pasta & Co" consulta ou edita seus próprios produtos
    Então a correlação da "Burger House" não é visível nem editável pela "Pasta & Co"
```

**Cenários revisados e aprovados pelo PM:** sim — cobrem happy path (cadastrar/remover
correlação, sugestão aparecendo e sendo aceita/recusada), a borda mais arriscada da história
(prioridade combo > correlacionado, cenário que valida a decisão de coexistência do Explorer),
múltiplas sugestões simultâneas, os dois níveis de soft-delete (`active`/`deleted`) tanto do lado
sugerido quanto do lado de origem, unidirecionalidade, autocorrelação bloqueada, e isolamento
multi-tenant.

## Solução Técnica

### Serviços impactados
- `catalog`: nova tabela de associação `related_products`, extensão de `ProductOut`/`ProductUpdate`,
  novo par de helpers `_get_product_related`/`_set_product_related` (mesmo padrão de
  `_get_product_allergens`/`_set_product_allergens`). Sem endpoint novo — reaproveita
  `PUT /catalog/products/{product_id}`.
- `frontend/admin`: `ProductEditScreen.tsx` ganha uma seção "Produtos correlacionados" com
  busca+seleção múltipla, mesmo padrão de UI já usado no seletor de produtos do
  `ComboFormScreen.tsx`.
- `frontend/totem`: `CatalogScreen.tsx` (`handleAddProduct`) ganha um segundo `else if` depois da
  checagem de combo existente, e um novo modal/estado pra oferecer os produtos correlacionados;
  `types.ts` (admin e totem) ganham o campo no tipo `Product`.

### Endpoints

Sem endpoint novo. Contrato alterado no já existente:

#### PUT /catalog/products/{product_id} (alterado)
**Serviço:** catalog-service
**Auth:** JWT obrigatório | role: admin/owner
**company_id:** extraído do JWT

Request (novo campo, opcional, replace completo — mesma semântica de `allergen_ids`):
```json
{
  "related_product_ids": [1042, 1055]
}
```

Response 200 (`ProductOut`, novo campo):
```json
{
  "id": 1030,
  "name": "Batata Frita",
  "...": "...",
  "related_products": [
    { "id": 1042, "name": "Molho Barbecue", "price": 4.5, "image_url": "https://...", "active": true },
    { "id": 1055, "name": "Molho Cheddar", "price": 4.5, "image_url": "https://...", "active": false }
  ]
}
```

Erros novos:
- `400` — `related_product_ids` contém id que não existe, não pertence à empresa, ou é o próprio
  `product_id` (autocorrelação bloqueada, critério de aceite do Explorer).

`GET /catalog/products` e `POST /catalog/products` (criação) também passam a devolver
`related_products` no `ProductOut` (lista vazia por padrão pra produto novo), mas **sem** aceitar
`related_product_ids` no `POST` — o Explorer descreve o fluxo só a partir da edição de um produto
já existente, criar e correlacionar na mesma chamada fica fora de escopo (evita também o caso sem
sentido de um produto referenciar um id que ainda não existe).

### Migrations
- Nova tabela `related_products`:
  ```
  product_id          INTEGER NOT NULL REFERENCES products(id)
  related_product_id  INTEGER NOT NULL REFERENCES products(id)
  sort_order           INTEGER
  PRIMARY KEY (product_id, related_product_id)
  ```
  Sem `company_id` próprio — isolamento via join com `Product` nos dois lados (mesmo padrão de
  `ComboItem`/`ProductAllergen`), validado na escrita (`_set_product_related` abaixo).

### Mudança de implementação

**Backend (`services/catalog/main.py`):**
```python
class RelatedProduct(Base):
    __tablename__ = "related_products"
    product_id         = Column(Integer, ForeignKey("products.id"), primary_key=True)
    related_product_id = Column(Integer, ForeignKey("products.id"), primary_key=True)
    sort_order          = Column(Integer)

async def _get_product_related(db: AsyncSession, product_id: int) -> list[dict]:
    """Devolve a relação inteira, incluindo produtos inativos — a associação
    em si nunca é escondida (admin precisa continuar vendo e gerenciando o
    par mesmo com o correlacionado desativado). Filtra só `deleted`, que é
    irreversível e já é escondido em todo o resto do catálogo. Quem decide
    esconder o inativo da OFERTA ao cliente é o consumidor do dado (totem),
    olhando o campo `active` de cada item — mesmo padrão já usado hoje pra
    `option_groups`/`options` (endpoint devolve tudo, totem filtra active no
    client, ver CatalogScreen.tsx)."""
    result = await db.execute(
        select(Product)
        .join(RelatedProduct, RelatedProduct.related_product_id == Product.id)
        .filter(RelatedProduct.product_id == product_id, Product.deleted == False)
        .order_by(RelatedProduct.sort_order)
    )
    return [
        {"id": r.id, "name": r.name, "price": float(r.price),
         "image_url": presigned_download_url(r.image_url) if r.image_url else None,
         "active": r.active}
        for r in result.scalars().all()
    ]

async def _set_product_related(db: AsyncSession, company_id: int, product_id: int, related_ids: list[int]) -> None:
    if product_id in related_ids:
        raise HTTPException(400, detail="Produto não pode ser correlacionado a si mesmo")
    unique_ids = list(dict.fromkeys(related_ids))  # dedup preservando ordem de sort_order
    if unique_ids:
        result = await db.execute(
            select(Product.id).filter(Product.id.in_(unique_ids), Product.company_id == company_id, Product.deleted == False)
        )
        found_ids = set(result.scalars().all())
        if found_ids != set(unique_ids):
            raise HTTPException(400, detail="related_product_ids contém id que não existe ou não pertence à empresa")
    await db.execute(delete(RelatedProduct).where(RelatedProduct.product_id == product_id))
    for index, related_id in enumerate(unique_ids):
        db.add(RelatedProduct(product_id=product_id, related_product_id=related_id, sort_order=index))
```

`_serialize_product` ganha `"related_products": await _get_product_related(db, p.id)`.
`ProductOut` ganha `related_products: list[RelatedProductOut] = []` (`RelatedProductOut = {id, name, price, image_url, active}` — o campo `active` é o que o totem usa pra decidir se oferece ou não, sem precisar de uma segunda chamada).
`ProductUpdate` ganha `related_product_ids: list[int] | None = None`.
`update_product` — mesmo ponto onde `allergen_ids` é tratado hoje (linha ~1391): adicionar
`exclude={"allergen_ids", "related_product_ids", "confirm_deactivate_combos"}` no `model_dump` do
loop de campos simples, e chamar `_set_product_related` quando `body.related_product_ids is not None`.

**Admin (`ProductEditScreen.tsx`):** nova seção "Produtos correlacionados", reaproveitando o
componente de busca+seleção múltipla já usado em `ComboFormScreen.tsx` pra escolher os produtos
do combo — mesma UX, filtrado pra excluir o próprio produto sendo editado da lista de busca (
reforça no client o que o backend já valida). Novo state `relatedProductIds`, incluído no payload
de `PUT` como `related_product_ids`.

**Requisito explícito do usuário (2026-09-08): o status do produto correlacionado precisa ficar
visível na lista, não escondido.** Cada linha da lista de "Produtos correlacionados" já
selecionados mostra o `active` de cada item (badge/tag "Inativo", mesmo padrão visual já usado em
outras listas do admin pra produto/combo/opção desativados) — o admin precisa enxergar de cara
que aquele par existe mas não está sendo oferecido no momento, sem precisar abrir o outro produto
pra descobrir. Isso vira critério de aceite novo (adicionado na seção de Explorer).

**Totem (`CatalogScreen.tsx`):**
```ts
function handleAddProduct(p: Product) {
  if (getQty(`product:${p.id}`) === 0) {
    const combo = combos.find((c) =>
      c.upsell_enabled && c.items.some((i) => i.product_id === p.id && i.triggers_upsell)
    );
    if (combo) { setUpsell({ combo, product: p }); return; }
    // related_products vem com inativos também (mesmo padrão de option_groups/options,
    // que a API já devolve por completo hoje) — quem decide o que oferecer é o totem.
    const offerable = p.related_products.filter((r) => r.active);
    if (offerable.length > 0) {
      setRelatedSuggestion({ product: p, related: offerable });
      addProductToCart(p);  // produto original entra no carrinho de qualquer forma (critério de aceite)
      return;
    }
  }
  addProductToCart(p);
}
```
Novo modal (componente próprio, não reaproveita o modal de upsell de combo — layout diferente: N
produtos com botão de adicionar cada um, não uma escolha binária "leve o combo/só o avulso"),
listando cada item de `offerable` com um botão "Adicionar" individual e um botão "Continuar sem
adicionar" pra fechar sem mais nenhum item. Produto original já foi adicionado ao carrinho antes
do modal abrir (diferente do combo, que decide entre as duas opções antes de adicionar qualquer
coisa) — reflete a semântica do Explorer: a sugestão é umas duas opções, não um garfo.

### Eventos de fila
Nenhum.

### Impacto em outros serviços
Nenhum — `order-service` não precisa saber que um item foi adicionado via sugestão de produto
correlacionado; cada item entra no pedido como uma linha independente, igual a qualquer produto
avulso adicionado manualmente.

### Estimativa
- Backend: 1,5 pontos (tabela + migration + helpers + validação de autocorrelação/company_id +
  extensão de 1 endpoint já existente).
- Admin: 1 ponto (reaproveita componente de busca+seleção já existente no combo).
- Totem: 1 ponto (novo modal, mais simples que o de combo — sem cálculo de economia/preço).

### Riscos
- ~~Produto correlacionado desativado some da relação~~ — **corrigido após avaliação com o
  usuário (2026-09-08): não é isso que acontece, e não seria aceitável se fosse.** A relação em
  si **nunca desaparece** — a linha em `related_products` continua existindo e visível pro admin
  independente do estado do produto correlacionado. O que muda é só a **oferta ao cliente final**:
  com o produto correlacionado desativado (motivo operacional comum, ex. falta de estoque), o
  totem para de sugeri-lo — mas o admin continua vendo e gerenciando o par normalmente, e a
  sugestão volta sozinha se o produto for reativado, sem precisar recadastrar nada. Corrigido no
  desenho técnico: `_get_product_related` devolve a relação inteira (com o campo `active` de cada
  item), e é o **totem quem filtra** o que oferece, mesmo padrão que `option_groups`/`options` já
  usam hoje (API devolve tudo, `CatalogScreen.tsx` filtra `active` no client). Ponto de atenção
  real, fora de escopo desta história: a semântica de **exclusão** (`deleted: true`) é diferente
  de desativação — o Ordin mantém produtos excluídos no
  banco pra preservar histórico de vendas (linha de `OrderItem`/`Ticket` referencia o produto
  mesmo depois de excluído), então vale uma análise própria, numa história separada, sobre se
  "produto correlacionado excluído" deveria se comportar exatamente igual a "desativado" (como
  implementado aqui) ou precisar de algum tratamento diferente. Não bloqueia esta história.
- **Confusão de nomenclatura com "upsell" de combo** — mitigado desde o Explorer com o nome
  "produtos correlacionados" e o `if`/`else if` que impede os dois modais concorrerem; ainda assim,
  o admin vê dois lugares diferentes pra configurar "sugestão automática" (combo e produto), vale
  texto de apoio nas duas telas explicando a diferença (mesma mitigação usada no ORD-157 pro par
  `active`/`upsell_enabled`).
- **Nenhum teste de regressão do modal de upsell de combo deve quebrar** — `handleAddProduct` é
  reescrito, não só estendido; a suíte de frontend (se existir para `CatalogScreen.tsx`) e a
  validação manual do fluxo de combo (ORD-150/157) precisam ser repetidas mesmo sem mudança de
  comportamento esperada nele.
