---
id: ORD-189
status: Ready
estimativa: 5 pontos (backend + frontend) — revisado de 3 na revisão de QA
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-189 — Detecção de produto guarda-chuva

## Descrição
História **G4** do épico de estoque/ERP (`docs/estudo-modulo-estoque-erp.md`, Bloco G — Opções
como SKU real). Fecha o desenho iniciado em G1 (`ORD-188` — `Option` ganha `ean`/`cfop`/`cest`) e
G2 (`stock_item` polimórfico, fundida na `ORD-181`): quando um produto passa a ter opções que são
elas mesmas produtos reais (ex.: cada sabor de "Refrigerante Lata 350ml" com EAN/CFOP próprios), o
produto "guarda-chuva" deixa de fazer sentido como unidade de controle fiscal/estoque — isso migrou
pra cada opção. Esta história detecta esse estado e impede dado fiscal/estoque órfão no produto
base.

## Persona
**Empresa** (owner/manager/admin que gerencia o catálogo).

## Explorer

### História
Como **Empresa**, quero que o sistema identifique automaticamente quando um produto virou
"guarda-chuva" (suas opções passaram a ter EAN/CFOP próprios) e bloqueie tentativas de cadastrar
EAN ou estoque diretamente nesse produto, para não acabar com dois lugares divergentes controlando
o mesmo dado fiscal/estoque.

### Decisão de escopo — o que é "guarda-chuva" e quais campos ficam bloqueados
**Estado computado, nunca persistido** (mesmo racional de `estoque_controlado`, decisão 11 da A4):
um produto é guarda-chuva assim que **qualquer** opção de **qualquer** grupo vinculado a ele (via
`ProductOptionGroup`, `services/catalog/main.py:225`) tiver `ean` **ou** `cfop` preenchido (campos
da G1). Volta a não-guarda-chuva se todas as opções desses grupos perderem esses campos depois —
sem estado "trava uma vez, trava pra sempre".

**Campos bloqueados no produto guarda-chuva**: `ean` e `stock_item` (controle de estoque próprio).
**`cfop` do produto NÃO é bloqueado** — continua sendo o campo que Empresa preenche normalmente, e
é justamente ele (`"5102"`) que torna relevante a opção também ter seu próprio CFOP. `ncm`/`cest`
do produto também não são bloqueados por esta história — só `ean` e `stock_item`, que são os dois
campos que a decisão do épico identificou como "migrados pra opção" no exemplo do Refrigerante.

### Fluxo principal
1. Empresa cadastra `ean`/`cfop` na primeira opção de um grupo vinculado a um produto (via G1).
2. O produto passa a ser considerado guarda-chuva (estado computado, sem gravação extra).
3. Na tela do produto, a seção "Estoque" e o campo EAN em "Classificação fiscal" ficam desabilitados,
   com uma mensagem indicando que esses dados agora são controlados por opção.
4. Se a Empresa remover `ean`/`cfop` de todas as opções do(s) grupo(s), o produto deixa de ser
   guarda-chuva e os campos voltam a ficar habilitados normalmente.

### Fluxos alternativos / exceções
- **Tentativa de gravar `ean` num produto já guarda-chuva via API direta** (`PUT
  /catalog/products/{id}` com `ean` preenchido): rejeitado com 400, não ignorado em silêncio.
- **Tentativa de registrar movimentação de estoque num produto guarda-chuva** (`POST
  /catalog/products/{id}/stock/movements`): rejeitado com 400, mesma filosofia.
- **Produto tem opções, mas nenhuma com EAN/CFOP preenchido** (ex.: grupo "Tamanho" com só rótulo e
  acréscimo de preço, sem fiscal): produto **não** é guarda-chuva — continua normal. Ter opções não
  é a condição, ter opções com dado fiscal é.
- **Transição retroativa — produto já tinha EAN ou `stock_item` próprios ANTES de virar
  guarda-chuva** (achado da revisão de PM, ver abaixo): **bloqueada na origem**. Ao tentar salvar
  `ean`/`cfop` numa opção de um grupo vinculado a um produto que já tem `ean` preenchido ou já tem
  um `stock_item` com movimentações, a gravação da **opção** é rejeitada com 400, explicando que é
  preciso primeiro limpar o EAN do produto e/ou resolver o estoque existente (registrar um ajuste
  zerando a quantidade, por exemplo) antes de tornar o produto guarda-chuva. Não existe migração
  automática de dado do produto pra opção — a Empresa decide explicitamente.

### Dependências
- **G1** (`ORD-188`, Ready) — precisa dos campos `ean`/`cfop` em `Option` existirem pra detecção
  fazer sentido.
- **G2** (achado da revisão de PM, não estava na tabela original do épico): a checagem de
  transição retroativa precisa consultar `stock_items`, que só existe a partir da revisão G2
  (fundida na `ORD-181`, já Ready). **G4 depende de G1 E, na prática, também de G2** — a tabela do
  épico listava só G1; corrigido aqui e a corrigir também no documento do épico.
- **Histórias que consomem esta**: nenhuma dentro do épico — é o fim da cadeia do Bloco G.

### Critérios de aceite funcionais
- [ ] Produto com opções sem nenhum EAN/CFOP preenchido continua não-guarda-chuva
- [ ] Produto vira guarda-chuva assim que qualquer opção de qualquer grupo vinculado ganha
      `ean`/`cfop`
- [ ] Produto guarda-chuva rejeita (400) tentativa de gravar `ean` via `PUT /catalog/products/{id}`
- [ ] Produto guarda-chuva rejeita (400) tentativa de registrar movimentação de estoque
- [ ] Produto volta a não-guarda-chuva se todas as opções perderem `ean`/`cfop`
- [ ] Salvar `ean`/`cfop` numa opção é bloqueado (400) se o produto vinculado já tiver `ean` próprio
      ou `stock_item` com movimentações — sem migração automática, Empresa resolve manualmente

## QA Explorer

### Cenários

```gherkin
Funcionalidade: Detecção de produto guarda-chuva

  Cenário: Produto com opções sem fiscal continua normal
    Dado um produto com um grupo de opção "Tamanho" (opções sem ean/cfop)
    Então o produto não é guarda-chuva
    E aceita normalmente PUT com ean e POST de movimentação de estoque

  Cenário: Produto vira guarda-chuva ao primeira opção ganhar ean
    Dado um produto "Refrigerante Lata 350ml" com grupo "Sabor", nenhuma opção com dado fiscal
    Quando a Empresa salva a opção "Coca-Cola" com ean="7891000100103"
    Então o produto passa a ser guarda-chuva

  Cenário: Produto vira guarda-chuva ao opção ganhar só cfop, sem ean
    Dado um produto com grupo de opção sem nenhum dado fiscal
    Quando a Empresa salva uma opção só com cfop="5102", sem ean
    Então o produto passa a ser guarda-chuva
    # confirma que é OR (ean OU cfop), não AND — a Explorer é explícita sobre isso, teste evita
    # regressão se alguém implementar como "precisa dos dois"

  Cenário: PUT de ean no produto guarda-chuva é rejeitado
    Dado um produto guarda-chuva (opção com ean/cfop já configurado)
    Quando a Empresa tenta PUT /catalog/products/{id} com ean preenchido
    Então a API retorna 400

  Cenário: POST de movimentação de estoque no produto guarda-chuva é rejeitado
    Dado um produto guarda-chuva
    Quando a Empresa tenta POST /catalog/products/{id}/stock/movements
    Então a API retorna 400

  Cenário: Produto guarda-chuva continua aceitando cfop/ncm/cest normalmente
    Dado um produto guarda-chuva
    Quando a Empresa faz PUT /catalog/products/{id} só com cfop, ncm ou cest
    Então a API aceita normalmente (200), sem nenhuma rejeição
    # crítico — só ean e stock_item são bloqueados, confirma que o backend não bloqueia o PUT
    # inteiro, só os campos específicos

  Cenário: Produto deixa de ser guarda-chuva quando a última opção perde ean/cfop
    Dado um produto guarda-chuva com uma única opção tendo ean/cfop preenchidos
    Quando a Empresa remove ean e cfop dessa opção (replace completo do grupo, sem os campos)
    Então o produto deixa de ser guarda-chuva
    E volta a aceitar PUT de ean e POST de movimentação de estoque normalmente

  Cenário: Transição retroativa bloqueada — produto já tem ean próprio
    Dado um produto com ean="96385074" já cadastrado (via A1/ORD-180) e um grupo de opção vinculado
    Quando a Empresa tenta salvar ean numa opção desse grupo
    Então a API rejeita com 400, orientando a limpar o ean do produto primeiro
    E o ean da opção NÃO é salvo

  Cenário: Transição retroativa bloqueada — produto já tem stock_item com movimentação
    Dado um produto com stock_item e ao menos 1 movimentação registrada (via A2/G2)
    Quando a Empresa tenta salvar ean ou cfop numa opção desse grupo
    Então a API rejeita com 400, orientando a resolver o estoque existente primeiro
    E o dado fiscal da opção NÃO é salvo

  Cenário: Produto com múltiplos grupos de opção — guarda-chuva se QUALQUER grupo tiver opção fiscal
    Dado um produto com dois grupos vinculados: "Sabor" (sem fiscal) e "Tamanho" (uma opção com cfop)
    Então o produto é guarda-chuva
    # não precisa que TODOS os grupos tenham opção fiscal — um só já basta
```

### Lacunas encontradas

1. **Nenhum endpoint expõe o estado computado pro frontend** (achado real — a Explorer não
   especifica isso). Sem um campo tipo `is_umbrella` na resposta de `GET`/`PUT`
   `/catalog/products/{id}` (e na listagem, se a UI precisar desabilitar campo já na tela de
   edição sem esperar um segundo round-trip), o frontend não tem como saber quando desabilitar a
   seção "Estoque"/campo EAN sem tentar salvar e receber 400 — UX ruim (erro só depois do clique
   em salvar, não preventivo). **Bloqueante pro Tech Explorer**: precisa decidir onde esse campo
   entra na serialização.
2. **Performance da detecção**: calcular guarda-chuva por produto exige `join` de
   `ProductOptionGroup → OptionGroup → Option`, filtrando `ean IS NOT NULL OR cfop IS NOT NULL`.
   Pra uma tela de EDIÇÃO de produto (1 produto por vez) isso é barato — 1 query, N pequeno. Pra
   uma futura LISTAGEM de produtos (se algum dia precisar mostrar "guarda-chuva" como badge na
   lista, fora do escopo desta história), o mesmo cálculo por linha ficaria caro sem
   desnormalização — sinalizar como risco futuro, não bloqueante aqui, já que a Explorer só cobre
   a tela de edição.
3. **Mensagem de erro da transição retroativa precisa ser específica o bastante** pra Empresa
   entender o que fazer (limpar EAN do produto vs. resolver estoque são ações diferentes) — a
   Explorer usa linguagem genérica "orientando a...". Recomendo ao Tech Explorer usar 2 mensagens
   distintas (uma por causa de bloqueio), não uma genérica só, senão a Empresa não sabe qual das
   duas ações tomar.

## Tech Explorer

### Detecção — `_is_umbrella_product` (nova, `services/catalog/main.py`, perto de `_validate_cfop`)

```python
async def _is_umbrella_product(db: AsyncSession, product_id: int) -> bool:
    """True se QUALQUER Option de QUALQUER OptionGroup vinculado a este produto (via
    ProductOptionGroup, linha 225) tiver ean OU cfop preenchido (campos da G1). Estado
    computado a cada chamada, nunca persistido — mesmo racional de estoque_controlado (A4)."""
    result = await db.execute(
        select(Option.id)
        .join(OptionGroup, OptionGroup.id == Option.option_group_id)
        .join(ProductOptionGroup, ProductOptionGroup.option_group_id == OptionGroup.id)
        .filter(
            ProductOptionGroup.product_id == product_id,
            or_(Option.ean.isnot(None), Option.cfop.isnot(None)),
        )
        .limit(1)
    )
    return result.scalars().first() is not None
```

Uma única query com 2 `join`s, `LIMIT 1` (não precisa contar, só saber se existe). Chamada em 3
pontos: `update_product`, `_resolve_stock_owner` (caminho `Product`) e na serialização de saída —
ver abaixo cada um.

### Bloqueio de `ean` — `update_product` (`services/catalog/main.py`, ~linha 1980, ao lado da validação `_is_valid_gtin` já existente)

```python
    if body.ean is not None and await _is_umbrella_product(db, product_id):
        raise HTTPException(
            400, detail="produto guarda-chuva: EAN é controlado pelas opções, não pelo produto"
        )
    if body.ean is not None and not _is_valid_gtin(body.ean):
        raise HTTPException(400, detail="código de barras inválido")
```

Checagem de guarda-chuva vem **antes** da de checksum — não faz sentido validar formato de um
campo que já vai ser rejeitado por não poder existir ali.

### Bloqueio de estoque — `_resolve_stock_owner` (revisão G2, `ORD-181`)

```python
async def _resolve_stock_owner(
    db: AsyncSession, company_id: int, *, product_id: int | None = None, option_id: int | None = None,
) -> None:
    if product_id is not None:
        p = (await db.execute(
            select(Product.id).filter_by(id=product_id, company_id=company_id, deleted=False)
        )).scalars().first()
        if not p:
            raise HTTPException(404)
        if await _is_umbrella_product(db, product_id):   # NOVO (G4)
            raise HTTPException(
                400, detail="produto guarda-chuva: estoque é controlado pelas opções, não pelo produto"
            )
    else:
        ...  # caminho Option inalterado
```

Único ponto de inserção — como `_get_stock_state` e `_create_stock_movement` já delegam pra essa
função (revisão G2), tanto `GET` quanto `POST` de estoque no produto guarda-chuva ficam cobertos
automaticamente, sem duplicar a checagem.

### Bloqueio de transição retroativa — `_set_option_group_options` (linha 476, achado do QA: 2 mensagens distintas)

```python
async def _validate_no_retroactive_umbrella_conflict(
    db: AsyncSession, option_group_id: int, options: list["OptionIn"],
) -> None:
    """G4 — impede que uma opção ganhe ean/cfop se isso tornaria guarda-chuva um produto que
    já tem dado próprio (ean ou stock_item) que ficaria órfão. Sem migração automática — a
    Empresa resolve manualmente (limpa o ean do produto, ou zera/resolve o estoque) antes de
    tentar de novo. Roda ANTES do DELETE das opções antigas (linha 527) — se rejeitar, nada
    no grupo é alterado."""
    if not any(opt.ean or opt.cfop for opt in options):
        return  # nenhuma opção deste payload está ganhando dado fiscal — nada a checar

    product_ids = (await db.execute(
        select(ProductOptionGroup.product_id).filter_by(option_group_id=option_group_id)
    )).scalars().all()
    if not product_ids:
        return

    conflicting_ean = (await db.execute(
        select(Product.id).filter(Product.id.in_(product_ids), Product.ean.isnot(None))
    )).scalars().first()
    if conflicting_ean is not None:
        raise HTTPException(
            400,
            detail="produto já tem EAN próprio cadastrado — remova o EAN do produto antes de "
                   "cadastrar EAN/CFOP nas opções",
        )

    conflicting_stock = (await db.execute(
        select(StockItem.product_id).filter(StockItem.product_id.in_(product_ids))
    )).scalars().first()
    if conflicting_stock is not None:
        raise HTTPException(
            400,
            detail="produto já tem estoque próprio registrado — resolva o estoque existente "
                   "antes de cadastrar EAN/CFOP nas opções",
        )
```

Chamada logo no início de `_set_option_group_options`, depois do `if not options: raise...`
(linha 498) e antes das checagens de SKU/EAN entre opções — falha rápido, sem gastar query de
duplicidade se a transição em si já é inválida.

### Campo computado exposto na API (achado do QA — lacuna real, fechada aqui)

`ProductOut` (schema, perto da linha 1253) ganha:

```python
class ProductOut(BaseModel):
    ...
    ean: str | None = None
    is_umbrella: bool = False   # NOVO (G4) — computado, nunca persistido
```

E `_serialize_product` (linha ~829, ao lado de `"cfop": p.cfop, "cest": p.cest`) ganha:

```python
        "cfop": p.cfop,
        "cest": p.cest,
        "is_umbrella": await _is_umbrella_product(db, p.id),   # NOVO (G4)
```

Isso permite o frontend desabilitar preventivamente a seção "Estoque" e o campo EAN assim que a
tela de edição carrega, em vez de deixar a Empresa preencher e só descobrir com um 400 ao salvar —
fecha a lacuna de UX que o QA identificou.

### Estimativa
**5 pontos** (revisado de 3, achado da revisão de QA: o campo computado na serialização e a
checagem de transição retroativa com 2 mensagens distintas são trabalho real que a estimativa
inicial de 3 não cobria — 1 função de detecção + 3 pontos de chamada + 1 checagem de conflito
retroativo com 2 branches + 1 campo novo de schema/serialização).

### Riscos
- **N+1 não é preocupação real aqui**: `_is_umbrella_product` é chamada no máximo 1 vez por
  request, em endpoints de **um produto só** (`GET`/`PUT /catalog/products/{id}`,
  `POST .../stock/movements`) — não existe um loop chamando isso por vários produtos numa
  listagem (fora de escopo desta história, já sinalizado pelo QA como risco futuro se um dia a
  listagem precisar mostrar isso como badge).
- **Mensagens de erro da transição retroativa precisam ficar sincronizadas com a UI**: o frontend
  vai precisar tratar esses 2 `detail` de forma diferenciada (ex: linkar direto pra seção
  "Estoque" ou pro campo EAN do produto) — não é ambíguo no backend, mas exige atenção na
  implementação do frontend pra não tratar como erro genérico.
- **Nenhum risco de concorrência**: leitura pura (não há `UPDATE` em `_is_umbrella_product`),
  mesma classe de operação de baixo risco que as outras histórias de G3/G4 já preveem.

## Ready
Passou pelas 3 rodadas de revisão (PM, QA, Backend SR).

- **PM**: escreveu a Explorer e, na autorrevisão, achou o gap real de transição retroativa (produto
  que já tinha `ean`/`stock_item` próprios antes de virar guarda-chuva) — decidiu bloquear na
  origem (rejeitar a gravação do lado da opção), sem migração automática de dado.
- **QA**: cenários cobrindo detecção (por `ean` isolado, por `cfop` isolado, múltiplos grupos),
  campos não-bloqueados (cfop/ncm/cest do produto seguem liberados), reversão do estado, e as duas
  transições retroativas. Achou 2 lacunas reais: falta de campo computado exposto na API pro
  frontend desabilitar preventivamente (não só via 400) e falta de mensagens distintas pras duas
  causas de bloqueio retroativo — ambas incorporadas.
- **Backend SR**: `_is_umbrella_product` (1 query, 2 `join`s, `LIMIT 1`), 3 pontos de chamada
  (`update_product`, `_resolve_stock_owner` via G2, `_set_option_group_options` via G1) e o campo
  `is_umbrella` em `ProductOut`/`_serialize_product`. Confirmou que N+1 não é risco real no escopo
  atual (só tela de edição de 1 produto). Estimativa revisada de 3 para **5 pontos**.

### Dependências reais (corrige a tabela do épico)
Depende de **G1** (`ORD-188`, Ready) e, na prática, também de **G2** (fundida na `ORD-181`, Ready)
— a checagem de transição retroativa consulta `stock_items`, que só existe a partir da revisão G2.
A tabela original do Bloco G listava só G1; ambas as dependências já estão Ready, então **G4 pode
ser implementada assim que G1 e G2 estiverem codificadas** (não apenas Ready em documento).

**Nota de consistência (adicionada pela G3, `ORD-190`)**: `_resolve_stock_owner` usada acima (só
valida e levanta 404/400) é um estágio intermediário — a G3 revisa essa mesma função pra também
retornar a linha carregada do dono. Implementar direto na forma final descrita em `ORD-190`.
