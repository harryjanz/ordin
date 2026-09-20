---
id: ORD-190
status: Ready
estimativa: 5 pontos (backend + frontend) — revisado de 3 na revisão de PM
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-190 — Estoque mínimo e conversão de unidade em `Option`

## Descrição
História **G3** do épico de estoque/ERP (`docs/estudo-modulo-estoque-erp.md`, Bloco G — Opções como
SKU real). Replica pra `Option` os dois recursos que **A3** (`ORD-183`, estoque mínimo) e **A5**
(`ORD-184`, conversão de unidade) já entregam pra `Product`: uma opção que representa um produto
real (G1 — `ean`/`cfop` próprios, G2 — `stock_item` próprio) merece o mesmo nível de controle de
estoque que um produto tem, não uma versão capada.

## Persona
**Empresa** (owner/manager/admin que gerencia catálogo e estoque).

## Explorer

### História
Como **Empresa**, quero configurar estoque mínimo e conversão de unidade de compra também numa
opção (não só num produto), para ter o mesmo nível de controle de estoque em cada sabor/variação
que já tenho hoje em produtos avulsos.

### Decisão de escopo — mesmos campos, mesmo dono conceitual, replicados em `Option`
- `Option.estoque_minimo` — `Numeric(12,3)`, default 0, não-negativo. Vive em `Option` (não em
  `stock_item`), mesmo racional já usado em `Product` (A3): configurável antes mesmo de existir
  `stock_item` pra essa opção.
- `Option.unidade_compra` (texto livre) + `Option.fator_conversao` (`Numeric(12,3)`, positivo) —
  sempre preenchidos juntos, mesma validação conjunta de `Product` (A5).
- Indicador visual "Abaixo do mínimo" (`quantidade_atual <= estoque_minimo`, mesmo `<=` já corrigido
  na revisão de QA da A3) e a conversão na movimentação (`quantidade × fator_conversao`, com
  `quantidade_original`/`unidade_original` guardados no `stock_movement`) funcionam **exatamente**
  como em `Product` — não há nenhuma regra de negócio nova aqui, só um segundo dono possível pros
  mesmos campos.

### Decisão de escopo — G3 implementa direto em cima da forma polimórfica atual, não repete a dessincronia de A3/A5 (achado da revisão de PM)
A revisão G2 (dentro da `ORD-181`) já refatorou os endpoints de estoque de `Product` em 3 funções
compartilhadas parametrizadas por dono: `_resolve_stock_owner`, `_get_stock_state`,
`_create_stock_movement`. As diffs de A3 e A5, porém, **foram escritas antes dessa refatoração
existir** — descrevem mudanças em cima das funções antigas, não-polimórficas
(`get_product_stock`/`create_stock_movement` standalone).

**Decisão**: isso não é problema de A3/A5 em si (nenhuma delas tem código real ainda — a
dessincronia é só entre documentos, não entre documento e produção) — é só um detalhe de
implementação que quem codar precisa adaptar na hora (a lógica de negócio não muda, só onde ela é
encaixada). **G3 não vai repetir esse padrão**: como é a primeira história do Bloco G a mexer de
fato nas 3 funções compartilhadas depois delas já existirem, a Tech Explorer desta história escreve
a versão **final e polimórfica** de `_get_stock_state`/`_create_stock_movement` com
estoque-mínimo/conversão — a mesma função passa a servir tanto `Product` quanto `Option`, sem
duplicar a lógica de comparação/conversão entre os dois donos. Quando A3/A5 forem efetivamente
implementadas, quem codar deve usar a forma que sai desta história como referência (nota
adicionada nos dois documentos, ver "Dependências" abaixo), não reescrever a lógica de novo do
zero pro lado de `Product`.

### Fluxo principal
1. Empresa abre a seção "Estoque" de uma opção (G2 — modal de edição em `OptionGroupFormScreen.tsx`).
2. Configura "Estoque mínimo" e, opcionalmente, "Unidade de compra"/"Fator de conversão" — mesmos
   campos, mesma UI, que já existem pra produto.
3. Ao registrar movimentação nessa opção, o comportamento de indicador e conversão é idêntico ao de
   `Product`.

### Fluxos alternativos / exceções
Idênticos aos já definidos em A3 e A5 (valor negativo/zero rejeitado, campos de conversão
obrigatórios juntos, indicador não aparece sem `stock_item`, mudança de fator não recalcula
histórico) — sem nenhuma variação nova introduzida pelo dono ser `Option` em vez de `Product`.

### Dependências
- **Depende de G2** (fundida na `ORD-181`, Ready) — usa as funções compartilhadas de estoque.
- **Nota registrada em A3 (`ORD-183`) e A5 (`ORD-184`)**: quando forem implementadas, adaptar os
  diffs documentados pra forma atual (pós-G2) dos endpoints — a lógica de negócio das duas
  histórias não muda, só o ponto de encaixe no código.
- **Histórias futuras que consomem esta**: nenhuma dentro do épico atual.

### Critérios de aceite funcionais
- [ ] `Option.estoque_minimo` (default 0), configurável mesmo sem `stock_item` existir ainda
- [ ] `Option.unidade_compra`/`Option.fator_conversao` — ambos preenchidos ou ambos vazios, fator
      sempre positivo
- [ ] Indicador "Abaixo do mínimo" (`<=`) funciona pra opção do mesmo jeito que pra produto
- [ ] Movimentação registrada na unidade de compra de uma opção converte corretamente, com
      `quantidade_original`/`unidade_original` no histórico
- [ ] `_get_stock_state`/`_create_stock_movement` atendem `Product` e `Option` com a MESMA lógica
      de estoque mínimo/conversão, sem duplicação

## QA Explorer

### Rastreabilidade — cenários de A3/A5 aplicados ao caminho `Option`
Nenhuma regra de negócio muda entre donos — só a tabela de origem (`Product` → `Option`). Em vez de
reescrever o Gherkin inteiro, a tabela confirma que cada cenário já aprovado se aplica 1:1:

| Cenário original (A3/A5) | Aplica-se a `Option` sem variação? |
|---|---|
| Configurar estoque mínimo antes de qualquer movimentação existir | ✅ idêntico |
| Valor negativo de estoque mínimo rejeitado | ✅ idêntico |
| Indicador "Abaixo do mínimo" usa `<=`, aparece só com `stock_item` existente | ✅ idêntico |
| Configurar só um dos dois campos de conversão é rejeitado | ✅ idêntico |
| Fator zero ou negativo rejeitado | ✅ idêntico |
| Entrada/ajuste convertidos corretamente, piso zero sobre valor já convertido | ✅ idêntico |
| Histórico mostra quantidade original e convertida | ✅ idêntico |
| Arredondamento pra 3 casas decimais (`ROUND_HALF_UP`) | ✅ idêntico |
| Mudança de fator não recalcula movimentações antigas | ✅ idêntico |
| Produto/opção sem conversão mantém diálogo antigo, sem opção de unidade | ✅ idêntico |

### Cenários novos — específicos do contexto polimórfico

```gherkin
Funcionalidade: Estoque mínimo e conversão independentes entre Product e Option

  Cenário: Produto e uma de suas opções têm estoque mínimo independente
    Dado um produto "Refrigerante Lata 350ml" com estoque_minimo=10
    E a opção "Coca-Cola" desse produto com estoque_minimo=5
    Quando ambos têm quantidade_atual=7
    Então o produto mostra "Abaixo do mínimo" (7 <= 10)
    E a opção NÃO mostra "Abaixo do mínimo" (7 > 5)
    # confirma que a comparação lê o estoque_minimo do PRÓPRIO dono, nunca do outro

  Cenário: Produto e opção têm fator de conversão independente
    Dado um produto com unidade_compra="fardo"/fator_conversao=6
    E uma opção do mesmo produto com unidade_compra="caixa"/fator_conversao=12
    Quando registro uma entrada de 2 na unidade de compra em cada um
    Então a quantidade_atual do produto vira 12 (2×6)
    E a quantidade_atual da opção vira 24 (2×12)
    # confirma que _create_stock_movement lê fator_conversao do dono resolvido, não de um cache
    # ou variável compartilhada entre as duas chamadas na mesma request/sessão

  Cenário: Opção tem conversão configurada, produto guarda-chuva não tem — sem acoplamento
    Dado um produto SEM unidade_compra/fator_conversao configurados
    E uma de suas opções COM unidade_compra="caixa"/fator_conversao=12
    Quando registro uma entrada na opção usando a unidade de compra
    Então a conversão funciona normalmente pra opção
    E o produto continua sem nenhuma opção de conversão no seu próprio diálogo de movimentação

  Cenário: Produto tem conversão configurada, opção específica não tem — sem herança
    Dado um produto COM unidade_compra="fardo"/fator_conversao=6
    E uma de suas opções SEM conversão configurada
    Quando abro o diálogo "Registrar movimentação" da opção
    Então NÃO aparece opção de escolha de unidade — a opção não herda a conversão do produto pai
    # acoplamento errado seria a opção "herdar" configuração do produto guarda-chuva; não deve
    # acontecer — cada dono configura os próprios campos, sem fallback implícito pro outro

  Cenário: Regressão — generalizar as funções compartilhadas não quebra o caminho Product já aprovado
    Dado os cenários de A3 e A5 já aprovados, agora rodando contra _get_stock_state/
    _create_stock_movement generalizadas por esta história
    Então todos passam sem nenhuma alteração de comportamento observável pro caminho Product
    # não é um cenário de negócio novo — é o critério de saída que garante que a refatoração da
    # G3 é puramente estrutural (extrair lógica comum), não uma reescrita de regra
```

### Lacuna encontrada
A Explorer não menciona explicitamente um **teste de regressão automatizado** que rode a suíte
completa de A3/A5 (caminho `Product`) depois da generalização das funções compartilhadas — só
descreve a intenção em prosa ("sem duplicar lógica"). Recomendo que a suíte de testes desta
história **reúse literalmente** os casos de teste já escritos pra A3/A5 (parametrizando por dono,
não duplicando o arquivo), em vez de só confiar em cenários novos — é a forma mais direta de provar
que a generalização não introduziu regressão no caminho já aprovado.

## Tech Explorer

### Diff de schema — `Option` (`services/catalog/main.py:208`, mesmo padrão de `Product`/`ORD-183`/`ORD-184`)

```python
class Option(Base):
    __tablename__ = "options"
    __table_args__ = (
        CheckConstraint(
            "(unidade_compra IS NULL) = (fator_conversao IS NULL)",
            name="ck_options_conversao_junta",
        ),
    )
    id              = Column(Integer, primary_key=True)
    option_group_id = Column(Integer, ForeignKey("option_groups.id"), nullable=False)
    label           = Column(String(80), nullable=False)
    price_delta     = Column(Numeric(10, 2), nullable=False, default=0)
    image_url       = Column(String(500))
    thumbnail_url   = Column(String(500))
    sort_order      = Column(Integer)
    active          = Column(Boolean, nullable=False, default=True)
    description     = Column(String(500))
    sku             = Column(String(50))
    ean             = Column(String(14), nullable=True)
    cfop            = Column(String(4), nullable=True)
    cest            = Column(String(7), nullable=True)
    estoque_minimo  = Column(Numeric(12, 3), nullable=False, default=0, server_default="0")  # NOVO (G3)
    unidade_compra  = Column(String(30), nullable=True)     # NOVO (G3)
    fator_conversao = Column(Numeric(12, 3), nullable=True)  # NOVO (G3)
```

### Diff de schema — `StockMovement` (`services/catalog/main.py`, dentro da revisão G2/`ORD-181`)

```python
class StockMovement(Base):
    __tablename__ = "stock_movements"
    id                   = Column(Integer, primary_key=True)
    stock_item_id        = Column(Integer, ForeignKey("stock_items.id"), nullable=False, index=True)
    tipo                 = Column(String(10), nullable=False)
    quantidade           = Column(Numeric(12, 3), nullable=False)
    quantidade_original  = Column(Numeric(12, 3), nullable=True)  # NOVO (G3, desenhado na ORD-184)
    unidade_original     = Column(String(30), nullable=True)      # NOVO (G3, desenhado na ORD-184)
    motivo               = Column(String(255), nullable=True)
    criado_por           = Column(Integer, nullable=False)
    criado_em            = Column(DateTime, default=datetime.utcnow)
```

Campos nullable — movimentação sem conversão (caminho de hoje) simplesmente não os preenche, sem
lógica extra pra distinguir "não teve conversão" de "teve conversão zerada".

### `_resolve_stock_owner` passa a retornar a linha carregada, não só validar (supersede a versão de G2/G4)

Antes (G2/G4) a função só confirmava posse e levantava 404 — agora, como G3 precisa **ler**
`estoque_minimo`/`unidade_compra`/`fator_conversao` do dono, ela passa a devolver a própria linha
(`Product` ou `Option`) já carregada, evitando uma segunda consulta. A checagem de produto
guarda-chuva (G4) continua exatamente onde estava, só o tipo de retorno muda:

```python
async def _resolve_stock_owner(
    db: AsyncSession, company_id: int, *, product_id: int | None = None, option_id: int | None = None,
) -> "Product | Option":
    """G3: retorna a linha do dono já carregada (não só None), pra ler estoque_minimo/
    unidade_compra/fator_conversao sem query extra. G4: checagem de guarda-chuva inalterada."""
    if product_id is not None:
        p = (await db.execute(
            select(Product).filter_by(id=product_id, company_id=company_id, deleted=False)
        )).scalars().first()
        if not p:
            raise HTTPException(404)
        if await _is_umbrella_product(db, product_id):
            raise HTTPException(
                400, detail="produto guarda-chuva: estoque é controlado pelas opções, não pelo produto"
            )
        return p
    else:
        o = (await db.execute(
            select(Option)
            .join(OptionGroup, OptionGroup.id == Option.option_group_id)
            .filter(Option.id == option_id, OptionGroup.company_id == company_id)
        )).scalars().first()
        if not o:
            raise HTTPException(404)
        return o
```

**Nota de consistência**: isso supersede a assinatura de `_resolve_stock_owner` mostrada nos
Tech Explorers da `ORD-181` (G2) e `ORD-189` (G4) — a lógica de isolamento/guarda-chuva não muda
uma linha, só o tipo de retorno. Registrar essa nota nos dois documentos pra quem for implementar
não se confundir com a versão anterior (`-> None`).

### `_get_stock_state` generalizada (estoque mínimo pros dois donos)

```python
async def _get_stock_state(
    db: AsyncSession, company_id: int, *, product_id: int | None = None, option_id: int | None = None,
) -> dict:
    owner = await _resolve_stock_owner(db, company_id, product_id=product_id, option_id=option_id)
    item = (await db.execute(
        select(StockItem).filter_by(product_id=product_id, option_id=option_id)
    )).scalars().first()
    if not item:
        return {
            "has_stock_item": False, "quantidade_atual": None, "unidade": None,
            "estoque_minimo": owner.estoque_minimo, "abaixo_do_minimo": False, "movements": [],
        }

    movements = (await db.execute(
        select(StockMovement).filter_by(stock_item_id=item.id).order_by(StockMovement.criado_em.desc())
    )).scalars().all()
    return {
        "has_stock_item": True,
        "quantidade_atual": item.quantidade_atual,
        "unidade": item.unidade,
        "estoque_minimo": owner.estoque_minimo,
        "abaixo_do_minimo": item.quantidade_atual <= owner.estoque_minimo,  # <= (achado QA da A3)
        "movements": [
            {"tipo": m.tipo, "quantidade": m.quantidade, "motivo": m.motivo,
             "quantidade_original": m.quantidade_original, "unidade_original": m.unidade_original,
             "criado_por": m.criado_por, "criado_em": m.criado_em}
            for m in movements
        ],
    }
```

`estoque_minimo`/`abaixo_do_minimo` lidos de `owner` (seja `Product` ou `Option`) — nenhum `if`
distinguindo os dois tipos, porque ambos têm os mesmos nomes de coluna.

### `_create_stock_movement` generalizada (conversão de unidade pros dois donos)

```python
async def _create_stock_movement(
    db: AsyncSession, company_id: int, body: "StockMovementIn", current_user: TokenPayload,
    *, product_id: int | None = None, option_id: int | None = None,
) -> dict:
    owner = await _resolve_stock_owner(db, company_id, product_id=product_id, option_id=option_id)
    item = (await db.execute(
        select(StockItem).filter_by(product_id=product_id, option_id=option_id)
    )).scalars().first()

    motivo = (body.motivo or "").strip() or None
    if body.tipo == "ajuste" and motivo is None:
        raise HTTPException(400, detail="ajuste exige motivo")

    quantidade_original: Decimal | None = None
    unidade_original: str | None = None
    if body.em_unidade_compra:
        if owner.fator_conversao is None:
            raise HTTPException(400, detail="dono não tem conversão de unidade configurada")
        if body.tipo == "entrada" and body.quantidade <= 0:
            raise HTTPException(400, detail="entrada deve ser positiva")  # valor BRUTO, achado A5
        quantidade_original, unidade_original = body.quantidade, owner.unidade_compra
        quantidade = (body.quantidade * owner.fator_conversao).quantize(
            Decimal("0.001"), rounding=ROUND_HALF_UP  # achado de QA (A5): 3 casas
        )
    else:
        quantidade = body.quantidade

    if item is None:
        if body.tipo != "entrada":
            raise HTTPException(400, detail="primeira movimentação precisa ser uma entrada")
        if body.unidade is None:
            raise HTTPException(400, detail="unidade é obrigatória na primeira movimentação")
        _validate_stock_unit(body.unidade)
        if quantidade <= 0:
            raise HTTPException(400, detail="entrada deve ser positiva")
        item = StockItem(
            company_id=company_id, product_id=product_id, option_id=option_id,
            quantidade_atual=quantidade, unidade=body.unidade,
        )
        db.add(item)
        await db.flush()
        delta = quantidade
    else:
        if body.unidade is not None and body.unidade != item.unidade:
            raise HTTPException(400, detail=f"unidade já definida como {item.unidade}, não pode ser alterada")
        if body.tipo == "entrada":
            if quantidade <= 0:
                raise HTTPException(400, detail="entrada deve ser positiva")
            delta = quantidade
        else:
            if quantidade == 0:
                raise HTTPException(400, detail="ajuste não pode ser zero")
            delta = quantidade
            result = await db.execute(
                update(StockItem)
                .where(StockItem.id == item.id, StockItem.quantidade_atual + delta >= 0)
                .values(quantidade_atual=StockItem.quantidade_atual + delta)
            )
            if result.rowcount == 0:
                raise HTTPException(400, detail="ajuste resultaria em quantidade negativa")

    if body.tipo == "entrada" and item.id is not None:
        await db.execute(
            update(StockItem).where(StockItem.id == item.id, StockItem.quantidade_atual + delta >= 0)
            .values(quantidade_atual=StockItem.quantidade_atual + delta)
        )

    movement = StockMovement(
        stock_item_id=item.id, tipo=body.tipo, quantidade=delta,
        quantidade_original=quantidade_original, unidade_original=unidade_original,
        motivo=motivo, criado_por=current_user.sub,
    )
    db.add(movement)
    await db.commit()
    await db.refresh(item)
    return {"quantidade_atual": item.quantidade_atual, "unidade": item.unidade}
```

`StockMovementIn` ganha `em_unidade_compra: bool = False` (mesmo campo desenhado na `ORD-184`).
Nenhum `if product_id else option_id` na lógica de conversão — `owner.fator_conversao`/
`owner.unidade_compra` funcionam idênticos pros dois tipos, porque `_resolve_stock_owner` já
entregou a linha certa.

### Migration
Uma migration só: adiciona `estoque_minimo`/`unidade_compra`/`fator_conversao` (+
`ck_options_conversao_junta`) em `options`, e `quantidade_original`/`unidade_original` em
`stock_movements`. Encadeada depois da migration de G1 (`ean`/`cfop`/`cest` em `options`) e da
migration de A2+G2 (que cria `stock_items`/`stock_movements` do zero, já polimórfica) — como
nenhuma das duas existe como arquivo real ainda, a ordem de criação na implementação real vai
definir os `down_revision` exatos; documentado aqui como dependência lógica, não como revisão
fixa.

### Estimativa
**5 pontos confirmados** — 3 campos novos em `Option` + `CheckConstraint`, 2 campos novos em
`StockMovement`, e a generalização de 3 funções compartilhadas que efetivamente implementam pela
primeira vez em código real o que A3 e A5 desenhavam só pra `Product`. É mais trabalho que "copiar
3 colunas", por isso a revisão de PM já tinha subido de 3 para 5 pontos.

### Riscos
- **Nota de consistência entre documentos** (não é risco de código, é risco de leitura): quem
  implementar A2+G2 (`ORD-181`), G4 (`ORD-189`) e G3 (esta história) precisa saber que a forma
  FINAL de `_resolve_stock_owner`/`_get_stock_state`/`_create_stock_movement` é a desta história —
  as versões mostradas nos outros dois documentos são estágios intermediários do mesmo desenho,
  não implementações alternativas. Recomendo implementar os 3 documentos em sequência lógica
  (A2+G2 → G4 → G3) e considerar a versão desta história como a que efetivamente vai pro código,
  não reimplementar cada estágio à risca.
- **Arredondamento**: mesmo cuidado já sinalizado na `ORD-184` — testar fatores "feios" (ex.
  `0.333`), não só números redondos, também no caminho `Option`.
- Nenhum risco de concorrência ou multi-tenant novo — reaproveita isolamento já resolvido em G2.

## Ready
Passou pelas 3 rodadas de revisão (PM, QA, Backend SR).

- **PM**: identificou a dessincronia entre as diffs de A3/A5 (escritas antes da revisão G2 existir)
  e a forma atual polimórfica dos endpoints — decidiu que G3 deveria nascer já implementando a
  versão final generalizada (mesmo espírito da fusão G2↔A2), em vez de repetir o padrão de
  documentar contra código que vai mudar de novo. Revisou estimativa de 3 para 5 pontos.
- **QA**: tabela de rastreabilidade confirmando que todos os cenários de A3/A5 se aplicam 1:1 ao
  caminho `Option`, mais cenários novos de independência entre donos (estoque mínimo e conversão
  de produto e opção não vazam um pro outro, sem herança implícita). Apontou a necessidade de
  reusar literalmente os testes de A3/A5 como regressão parametrizada por dono, não só escrever
  cenários novos.
- **Backend SR**: schema em `Option` e `StockMovement`, e a generalização real de
  `_resolve_stock_owner`/`_get_stock_state`/`_create_stock_movement` pra ler configuração do dono
  resolvido sem `if`s por tipo. Registrou nota de consistência: esta é a versão final dessas 3
  funções — as mostradas em `ORD-181` (G2) e `ORD-189` (G4) são estágios intermediários do mesmo
  desenho, não alternativas.

### Nota de implementação (propagada pra `ORD-181` e `ORD-189`)
Quem for codar deve implementar `_resolve_stock_owner`/`_get_stock_state`/`_create_stock_movement`
já na forma final desta história — não implementar a versão de G2 primeiro e depois "migrar" pra
versão de G3 depois.
