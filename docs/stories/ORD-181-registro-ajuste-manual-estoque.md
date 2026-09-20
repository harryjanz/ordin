---
id: ORD-181
status: Ready
estimativa: 13 pontos (5 A2 + 8 G2 — revisão consolidada 2026-09-18)
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-181 — Registro e ajuste manual de estoque (+ estoque por opção, G2)

## Descrição
Segunda história (**A2**) do épico de estoque/ERP (`docs/estudo-modulo-estoque-erp.md`, Bloco A —
Fundação). É a peça mais central de todo o épico: introduz as tabelas `stock_item`/`stock_movement`
que praticamente todas as outras histórias (A3, A4, A5, D1, E1) vão depender. Escopo original: só o
registro manual de quantidade em estoque por produto e o histórico de movimentações — **sem** XML,
**sem** baixa automática por venda, **sem** ficha técnica. Isso vem em histórias futuras.

**Revisão 2026-09-18 (G2, Bloco G)**: como esta história estava `Ready` mas **nenhuma linha de
código tinha sido escrita ainda**, o desenho foi revisado em vez de virar uma história nova
(`ORD-189`) — ver `docs/estudo-modulo-estoque-erp.md`, seção "Achado de sequenciamento". Motivo:
opções (`Option`, ver `ORD-188`/G1, já Ready) também podem representar produtos reais com estoque
próprio (ex.: cada sabor de um refrigerante). Em vez de duplicar toda a lógica de movimentação numa
tabela paralela, `stock_item` passa a aceitar **`Product` OU `Option`** como dono. Os 5 pontos
originais da A2 (Product) e os 8 pontos da G2 (polimorfismo + UI gêmea em Option) somam os 13 pontos
do frontmatter — ver seção "Ready" pra detalhe de como cada rodada de revisão tratou essa fusão.

## Persona
**Empresa** (owner/manager/admin que gerencia o catálogo) — mesma persona de `ProductEditScreen.tsx`.

## Explorer

### História
Como **Empresa**, quero registrar e ajustar manualmente a quantidade em estoque de um produto, para
começar a controlar meu estoque mesmo antes de existir importação automática de nota fiscal.

### Decisão de escopo — modelagem de `stock_item.product_id` (revisado por G2 — dono polimórfico)
A revisão de backend do épico (na quebra em histórias) recomendou modelar insumo (item de estoque
que não é vendável, ex. "queijo") como o próprio `Product` com uma flag `is_sellable=False`, em vez
de uma tabela `RawIngredient` separada — decisão correta, mas que **pertence ao escopo da E1 (ficha
técnica)**, não desta história. Dentro do Bloco A, não existe ainda nenhum consumidor de insumo
puro (isso só nasce com a ficha técnica) — o único caso de uso real de A2 até D1 é estoque de
produto **já vendável** (CFOP 5102, revenda direta).

**Revisão G2**: `stock_item` deixa de ter só `product_id` obrigatório e passa a ter **`product_id`
E `option_id`, ambos nullable**, com exatamente um dos dois preenchido (validado por
`CheckConstraint` no banco, não só em aplicação — ver Tech Explorer). Motivo: uma `Option` que
representa um produto real (G1 — `ean`/`cfop` próprios) precisa do mesmo controle de estoque que um
`Product` tem, e duplicar `StockItem`/`StockMovement` numa tabela paralela só pra trocar a FK
duplicaria também toda a lógica de movimentação (validação de unidade, sinal por tipo, histórico)
que esta história já projeta — custo maior que o de tornar o dono polimórfico. Quando a E1 chegar e
adicionar `is_sellable` em `Product`, isso não muda nada aqui — `product_id` continua funcionando
igual, só passa a também poder apontar pra um `Product` com `is_sellable=False`.

**Risco de sequenciamento aceito conscientemente (achado da revisão de PM)**: G2 não depende de G1
nem de G4 (a história que detecta "produto guarda-chuva" e **rejeita** estoque cadastrado nele
quando já existe estoque na opção). Isso abre uma janela onde, entre G2 entrar no ar e G4 entrar no
ar, é tecnicamente possível cadastrar `stock_item` tanto no produto guarda-chuva quanto numa de
suas opções ao mesmo tempo, sem trava nenhuma. Decisão do PM: **não** virar critério de aceite
desta história (checar se o produto é guarda-chuva é literalmente o job da G4, colocar isso aqui
quebraria a separação de responsabilidades do bloco) — em vez disso, é uma recomendação de
**ordem de implementação**: priorizar G1 → G4 logo após ou junto com G2, pra minimizar essa janela
na prática. Nenhuma corrupção de dado ocorre nesse meio-tempo, só uma configuração inconsistente
que G4 ainda não impede.

### Decisão de escopo — onde a UI vive (posição exata, fechando lacuna da revisão de PM)
Mesmo padrão já usado por "Opções do produto" e "Produtos correlacionados" (`ProductEditScreen.tsx`,
linhas 685 e 734): uma nova seção **"Estoque"**, visível só quando o produto já existe (precisa de
`product_id`, mesma regra das seções citadas). Posição exata: **logo depois de "Classificação
fiscal" (linha 637-681) e antes de "Opções do produto" (linha 683)** — agrupa com as duas seções
seguintes por serem todas sub-recursos que dependem do produto já salvo, mas fica primeiro entre
elas por ser a peça mais fundamental do épico atual.

**Conteúdo da seção**:
- Estado vazio (produto sem nenhuma movimentação): texto "Sem controle de estoque ainda" + botão
  "Registrar entrada".
- Com pelo menos 1 movimentação: quantidade atual em destaque (`quantidade_atual` + `unidade`) +
  botão "Registrar movimentação" + tabela de histórico abaixo, colunas **Data · Tipo · Quantidade ·
  Motivo · Registrado por**, mais recente primeiro.
- Diálogo "Registrar movimentação" (`ConfirmDialog`, mesmo componente já usado em outras telas):
  campos na ordem **Tipo (entrada/ajuste) → Unidade (só na primeira movimentação, Dropdown, ver
  decisão abaixo) → Quantidade → Motivo** (obrigatório só se Tipo = ajuste).

### Decisão de escopo — UI gêmea em `OptionGroupFormScreen.tsx` é escopo obrigatório de G2 (achado da revisão de PM)
Cortar a UI e entregar só a API com `option_id` deixaria a Empresa sem NENHUM jeito de efetivamente
controlar estoque de uma opção — mesmo problema de "história sem efeito prático" que quase se
repetiu em G1. A seção **"Estoque"** descrita acima ganha uma versão idêntica dentro do modal de
edição de opção em `OptionGroupFormScreen.tsx` (mesmo local onde G1 posicionou EAN/CFOP/CEST — ver
`docs/stories/ORD-188-ean-cfop-cest-em-opcao.md`, seção "Posicionamento na UI"), logo depois desses
campos fiscais. É reuso puro do mesmo componente conceitual (estado vazio, diálogo, tabela de
histórico) — não há vocabulário de UI novo, só uma segunda instância chaveada por `option_id` em
vez de `product_id`.

### Decisão de escopo — unidade como Dropdown fixo, não texto livre (corrigido na revisão de PM)
`unidade` **não é texto livre** — é um `Dropdown` com um conjunto fixo pequeno: `un`, `kg`, `g`,
`L`, `ml`. Motivo do PM: texto livre geraria "kg"/"Kg"/"quilo"/"KILOGRAMA" pro mesmo conceito,
dívida de dado que a A5 (conversão de unidade de verdade) teria que normalizar depois. Custo de
usar `Dropdown` em vez de `InputBase` é o mesmo nesta história, sem a dívida. Continua sem lógica de
conversão (isso é A5) — é só o valor válido salvo, escolhido na primeira movimentação e
não-editável depois (mesma regra já definida no fluxo principal).

### Decisão de escopo — sinal de quantidade por tipo de movimentação (corrigido na revisão de PM)
- **Entrada manual**: sempre soma — quantidade informada é sempre positiva, nunca reduz o estoque.
- **Ajuste**: pode ser positivo ou negativo (correção pra cima ou pra baixo) — é o único tipo que
  pode reduzir a quantidade, e mesmo assim nunca abaixo de zero (ver fluxo alternativo).

### Fluxo principal
1. Empresa abre um produto já salvo, vai na seção "Estoque".
2. Se o produto nunca teve movimentação, a seção mostra "Sem controle de estoque ainda" com um
   botão "Registrar entrada".
3. Empresa registra uma movimentação: tipo (entrada manual / ajuste), quantidade, unidade (se for a
   primeira movimentação) e motivo (opcional em entrada, obrigatório em ajuste — ajuste é sempre uma
   correção que precisa de explicação, entrada não).
4. `stock_item` é criado (se não existir) ou atualizado; a movimentação fica no histórico, visível
   na mesma seção.

### Fluxos alternativos / exceções
- **Ajuste que deixaria a quantidade negativa**: bloqueado com erro claro — ajuste manual não pode
  levar estoque abaixo de zero (diferente da venda, que é escopo de D1 e tem sua própria decisão de
  concorrência; aqui é só correção humana, sem motivo legítimo de ficar negativo).
- **Primeira movimentação sem informar unidade**: bloqueado — a primeira movimentação de um produto
  define a unidade que ele usa daqui pra frente; movimentações seguintes reaproveitam a mesma
  unidade (não é editável depois, pra não invalidar o histórico já registrado com outra unidade).

### Dependências
- **Nenhuma bloqueante** — A1 (Ready, `ORD-180`) não é pré-requisito técnico de A2 (não usam o
  mesmo dado), mas ambas são histórias do mesmo bloco sem ordem obrigatória entre si. G1 (`ORD-188`)
  também não é dependência técnica dura desta história (o `CheckConstraint` XOR funciona
  independente de `Option` ter ou não `ean`/`cfop` preenchido) — só uma recomendação de **ordem de
  implementação** (ver decisão acima), não um bloqueio real.
- **Histórias futuras que consomem esta**: A3 (estoque mínimo), A4 (bloqueio automático), A5
  (conversão de unidade), D1 (baixa automática na venda), E1 (ficha técnica), G3 (`estoque_minimo`
  em `Option`), G4 (rejeição de estoque no produto guarda-chuva). **A8/A9 precisam ser revisadas
  depois** pra fazer `UNION` entre `Product` e `Option` como fontes de estoque — já antecipado no
  documento do épico, não é lacuna nova.

### Critérios de aceite funcionais
- [ ] Produto sem movimentação nenhuma mostra estado "sem controle de estoque" (não quantidade 0
      enganosa — reforça a distinção que vai sustentar a regra de rollout da A4 mais adiante)
- [ ] Primeira movimentação cria `stock_item` com a unidade escolhida (Dropdown fixo: un/kg/g/L/ml)
- [ ] Movimentações seguintes reaproveitam a mesma unidade, sem poder alterá-la
- [ ] Entrada manual sempre soma (quantidade informada é sempre positiva)
- [ ] Ajuste aceita valor positivo ou negativo, mas nunca resulta em quantidade final negativa —
      bloqueado com erro claro se resultar
- [ ] Ajuste exige motivo; entrada não exige
- [ ] Histórico de movimentações é visível, com colunas Data/Tipo/Quantidade/Motivo/Registrado por,
      ordenado do mais recente pro mais antigo
- [ ] (G2) `stock_item` aceita `Option` como dono, com a mesma seção "Estoque" (estado vazio,
      diálogo, histórico) disponível no modal de edição de opção
- [ ] (G2) Tentar criar `stock_item` sem nenhum dono ou com os dois donos preenchidos é rejeitado
      pelo banco (`CheckConstraint`), não só em validação de aplicação

## QA Explorer

### Cenários Gherkin

```gherkin
Feature: Registro e ajuste manual de estoque
  Como Empresa
  Quero registrar e ajustar manualmente a quantidade em estoque de um produto
  Para começar a controlar meu estoque mesmo antes de existir importação automática

  Scenario: Primeira movimentação cria o stock_item
    Dado um produto sem nenhuma movimentação de estoque
    Quando registro uma entrada de 10 "kg"
    Então um stock_item é criado com quantidade_atual=10 e unidade="kg"
    E a movimentação aparece no histórico como tipo "entrada"

  Scenario: Segunda entrada soma à quantidade existente
    Dado um produto com stock_item de quantidade_atual=10 "kg"
    Quando registro uma nova entrada de 5 "kg"
    Então a quantidade_atual passa a ser 15 "kg"

  Scenario: Entrada com valor negativo é rejeitada
    Dado um produto com stock_item existente
    Quando tento registrar uma entrada com quantidade -3
    Então o sistema rejeita com erro "entrada deve ser positiva"

  Scenario: Ajuste negativo que não passa de zero é aceito
    Dado um produto com stock_item de quantidade_atual=10 "kg"
    Quando registro um ajuste de -4 "kg" com motivo "contagem física divergente"
    Então a quantidade_atual passa a ser 6 "kg"

  Scenario: Ajuste que resulta em exatamente zero é permitido
    Dado um produto com stock_item de quantidade_atual=6 "kg"
    Quando registro um ajuste de -6 "kg" com motivo informado
    Então a quantidade_atual passa a ser 0 "kg", sem erro

  Scenario: Ajuste que deixaria a quantidade negativa é bloqueado
    Dado um produto com stock_item de quantidade_atual=6 "kg"
    Quando tento registrar um ajuste de -10 "kg"
    Então o sistema rejeita com erro claro, sem alterar a quantidade_atual

  Scenario: Ajuste sem motivo é rejeitado
    Dado um produto com stock_item existente
    Quando tento registrar um ajuste sem preencher o motivo
    Então o sistema rejeita a movimentação

  Scenario: Ajuste com motivo só espaços em branco é tratado como ausente
    Dado um produto com stock_item existente
    Quando tento registrar um ajuste com motivo "   " (só espaços)
    Então o sistema rejeita, mesmo comportamento de motivo vazio

  Scenario: Entrada sem motivo é aceita
    Dado um produto com stock_item existente
    Quando registro uma entrada sem preencher o motivo
    Então a movimentação é aceita normalmente

  Scenario: Unidade não pode ser trocada após a primeira movimentação
    Dado um produto com stock_item já criado com unidade "kg"
    Quando tento registrar uma nova movimentação informando unidade "un"
    Então o sistema rejeita ou ignora a unidade informada, mantendo "kg"

  Scenario: Unidade fora do conjunto fixo é rejeitada mesmo via API direta
    Dado um produto sem stock_item ainda
    Quando uma chamada direta à API tenta registrar a primeira movimentação com unidade "caixa"
    Então o sistema rejeita — validação de unidade não pode depender só do Dropdown do frontend

  Scenario: Produto de outra empresa não recebe movimentação
    Dado um produto pertencente à empresa Y
    Quando um usuário autenticado da empresa X tenta registrar uma movimentação nesse produto
    Então o sistema retorna 404 (mesmo padrão de isolamento já usado em get_product)
```

### Cenários novos — revisão G2 (dono polimórfico: `Product` ou `Option`)

```gherkin
  Scenario: stock_item criado com option_id segue o mesmo fluxo de entrada/ajuste
    Dado uma opção "Coca-Cola" sem nenhuma movimentação de estoque
    Quando registro uma entrada de 24 "un" nessa opção
    Então um stock_item é criado com option_id preenchido, product_id nulo, quantidade_atual=24
    E um ajuste subsequente na mesma opção funciona com as mesmas regras de sinal/saldo do Product

  Scenario: Duas opções do mesmo grupo têm quantidades independentes
    Dado as opções "Coca-Cola" e "Fanta Laranja" do mesmo grupo "Sabor", cada uma com stock_item próprio
    Quando registro uma entrada de 10 só em "Coca-Cola"
    Então a quantidade_atual de "Fanta Laranja" permanece inalterada
    # relevante pq o polimorfismo não pode acidentalmente compartilhar linha entre dois donos —
    # cada (product_id | option_id) precisa gerar um stock_item isolado, nunca reaproveitado

  Cenário: stock_item sem nenhum dono é rejeitado pelo banco
    Quando uma tentativa direta de INSERT em stock_items é feita com product_id=NULL e option_id=NULL
    Então o CheckConstraint XOR rejeita a operação
    # teste de integridade de schema, não de endpoint — a API nunca deveria deixar chegar aqui,
    # mas o constraint existe justamente pra não depender só da camada de aplicação

  Cenário: stock_item com os dois donos preenchidos é rejeitado pelo banco
    Quando uma tentativa direta de INSERT em stock_items é feita com product_id E option_id preenchidos
    Então o CheckConstraint XOR rejeita a operação

  Cenário: Isolamento multi-tenant no caminho de Option — cenário dedicado, não reaproveita o de Product
    Dado uma opção pertencente a um grupo de opção da empresa Y
    Quando um usuário autenticado da empresa X tenta registrar uma movimentação nessa opção
    Então o sistema retorna 404
    # NÃO é coberto pelo cenário "Produto de outra empresa não recebe movimentação" (esse só
    # exercita o join Product->company_id direto). Option só chega em company_id via join com
    # OptionGroup — é um caminho de código diferente (get_option_or_404 análogo, se existir, ou
    # a query precisa incluir esse join explicitamente). Sem esse cenário dedicado, um bug onde o
    # endpoint de Option esquece o filtro de company_id passaria despercebido.
```

### Lacuna encontrada na revisão G2
O cenário de isolamento multi-tenant já existente (via `get_product`, linhas 173-176 originais)
**não cobre** o caminho de `Option` — são queries e joins diferentes. É obrigatório por
`docs/ARQUITETURA.md` §6 ter um cenário próprio pro caminho de `Option`, não presumir que o teste
de `Product` "já cobre o conceito". Incorporado acima como cenário dedicado.

### Critérios de aceite testáveis
- [ ] Validação de unidade acontece no backend (enum fechado `un`/`kg`/`g`/`L`/`ml`), não só no
      Dropdown do frontend
- [ ] Ajuste que resulta em exatamente zero é permitido (borda de `<` vs `<=`)
- [ ] Motivo só com espaços em branco é tratado como ausente (trim antes de validar)
- [ ] Isolamento multi-tenant: produto de outra empresa retorna 404 pra qualquer tentativa de
      movimentação

### Confirmações da revisão de QA (não pendências)
- **Concorrência**: ação manual e de baixa frequência (diferente de D1) — `UPDATE` atômico já é
  suficiente, sem necessidade de `SELECT FOR UPDATE` dedicado nesta história.

### O que ainda impede o avanço pro Tech Explorer
Nada bloqueante — revisão de QA aprovada com os 4 critérios adicionais incorporados.

## Tech Explorer

**Nota da revisão G2**: como nenhuma migration real desta história tinha sido criada ainda, o
desenho abaixo já nasce polimórfico — não existe um "desenho A2" seguido de uma migration de
correção G2. Implementar direto como está aqui.

### Models novos (`services/catalog/main.py`, logo após `Product`, antes de `ProductAllergen` linha 169)

```python
STOCK_UNITS = ("un", "kg", "g", "L", "ml")  # mesmo racional já usado pra CFOP (linha 153):
                                              # texto simples, validado na aplicação, sem tabela

class StockItem(Base):
    __tablename__ = "stock_items"
    __table_args__ = (
        UniqueConstraint("product_id", name="uq_stock_items_product"),
        UniqueConstraint("option_id", name="uq_stock_items_option"),
        # G2 — dono polimórfico: MySQL e SQLite (o banco usado na suíte de testes) tratam NULL
        # como valor distinto em UNIQUE, então múltiplas linhas com option_id=NULL (donas
        # product_id) não colidem entre si na uq_stock_items_option, e vice-versa — cada
        # UniqueConstraint só passa a valer quando a coluna correspondente é não-nula.
        CheckConstraint(
            "(product_id IS NOT NULL AND option_id IS NULL) OR (product_id IS NULL AND option_id IS NOT NULL)",
            name="ck_stock_items_owner_xor",
        ),
    )

    id               = Column(Integer, primary_key=True)
    company_id       = Column(Integer, nullable=False, index=True)
    product_id       = Column(Integer, ForeignKey("products.id"), nullable=True)   # G2: nullable
    option_id        = Column(Integer, ForeignKey("options.id"), nullable=True)    # NOVO (G2)
    quantidade_atual = Column(Numeric(12, 3), nullable=False, default=0)
    unidade          = Column(String(2), nullable=False)  # um de STOCK_UNITS
    created_at       = Column(DateTime, default=datetime.utcnow)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class StockMovement(Base):
    __tablename__ = "stock_movements"

    id             = Column(Integer, primary_key=True)
    stock_item_id  = Column(Integer, ForeignKey("stock_items.id"), nullable=False, index=True)
    tipo           = Column(String(10), nullable=False)  # "entrada" | "ajuste"
    quantidade     = Column(Numeric(12, 3), nullable=False)  # já com sinal aplicado
    motivo         = Column(String(255), nullable=True)
    criado_por     = Column(Integer, nullable=False)  # user_id do JWT
    criado_em      = Column(DateTime, default=datetime.utcnow)
```

**Por que `unidade` é `String(2)` validado na aplicação, não um `Enum` do banco**: mesma convenção
já estabelecida pra `cfop` (linha 153) — evita migration de ALTER TYPE toda vez que um valor novo
for aceito no futuro (ex. se um dia precisar de "cx" pra caixa). `STOCK_UNITS` é a fonte da verdade,
igual `CFOP_VALIDOS` já é hoje.

**Por que `company_id` duplicado em `StockItem`** (já dá pra chegar em `company_id` via
`product_id → Product.company_id`): evita um `JOIN` em toda consulta de isolamento multi-tenant —
mesmo trade-off já aceito em outras tabelas do projeto que denormalizam `company_id` por
performance de filtro. **Isso importa ainda mais pro caso `Option` (G2)**: como `Option` não tem
`company_id` direto (só via `join` com `OptionGroup`, igual `_set_option_group_options`,
`services/catalog/main.py:476`), resolver e persistir `company_id` uma única vez na CRIAÇÃO do
`stock_item` (ver `_resolve_stock_owner` abaixo) evita que toda leitura subsequente precise
refazer esse `join` — o `join` acontece uma vez, no `POST`, não em todo `GET`.

### Validação de unidade (achado da revisão de QA — backend, não só frontend)

```python
def _validate_stock_unit(unidade: str) -> None:
    if unidade not in STOCK_UNITS:
        raise HTTPException(400, detail=f"unidade inválida — use uma de {', '.join(STOCK_UNITS)}")
```

### Resolução de dono + isolamento multi-tenant (G2 — função compartilhada)

Extraída pra não duplicar a lógica de isolamento entre os 4 endpoints (2 de `Product`, 2 de
`Option`). É o ponto central que garante o cenário de isolamento dedicado que o QA exigiu pro
caminho de `Option`.

```python
async def _resolve_stock_owner(
    db: AsyncSession, company_id: int, *, product_id: int | None = None, option_id: int | None = None,
) -> None:
    """Confirma que o dono (Product OU Option, nunca os dois — chamado sempre com exatamente um
    dos dois kwargs) pertence à company_id do JWT. 404 se não existir ou for de outra empresa.

    Option não tem company_id direto — mesmo padrão de _set_option_group_options (linha 476):
    isolamento passa por join com OptionGroup, não por filtro direto. Repetir esse join aqui é
    obrigatório, não opcional — é exatamente o caminho que o QA sinalizou como não coberto pelo
    teste de isolamento já existente de Product."""
    if product_id is not None:
        p = (await db.execute(
            select(Product.id).filter_by(id=product_id, company_id=company_id, deleted=False)
        )).scalars().first()
        if not p:
            raise HTTPException(404)
    else:
        o = (await db.execute(
            select(Option.id)
            .join(OptionGroup, OptionGroup.id == Option.option_group_id)
            .filter(Option.id == option_id, OptionGroup.company_id == company_id)
        )).scalars().first()
        if not o:
            raise HTTPException(404)


async def _get_stock_state(
    db: AsyncSession, company_id: int, *, product_id: int | None = None, option_id: int | None = None,
) -> dict:
    await _resolve_stock_owner(db, company_id, product_id=product_id, option_id=option_id)
    item = (await db.execute(
        select(StockItem).filter_by(product_id=product_id, option_id=option_id)
    )).scalars().first()
    if not item:
        return {"has_stock_item": False, "quantidade_atual": None, "unidade": None, "movements": []}

    movements = (await db.execute(
        select(StockMovement).filter_by(stock_item_id=item.id).order_by(StockMovement.criado_em.desc())
    )).scalars().all()
    return {
        "has_stock_item": True,
        "quantidade_atual": item.quantidade_atual,
        "unidade": item.unidade,
        "movements": [
            {"tipo": m.tipo, "quantidade": m.quantidade, "motivo": m.motivo,
             "criado_por": m.criado_por, "criado_em": m.criado_em}
            for m in movements
        ],
    }


async def _create_stock_movement(
    db: AsyncSession, company_id: int, body: "StockMovementIn", current_user: TokenPayload,
    *, product_id: int | None = None, option_id: int | None = None,
) -> dict:
    await _resolve_stock_owner(db, company_id, product_id=product_id, option_id=option_id)
    item = (await db.execute(
        select(StockItem).filter_by(product_id=product_id, option_id=option_id)
    )).scalars().first()

    motivo = (body.motivo or "").strip() or None  # achado de QA: espaço em branco = ausente
    if body.tipo == "ajuste" and motivo is None:
        raise HTTPException(400, detail="ajuste exige motivo")

    if item is None:
        # primeira movimentação — só entrada faz sentido (não existe saldo pra "ajustar" ainda)
        if body.tipo != "entrada":
            raise HTTPException(400, detail="primeira movimentação precisa ser uma entrada")
        if body.unidade is None:
            raise HTTPException(400, detail="unidade é obrigatória na primeira movimentação")
        _validate_stock_unit(body.unidade)
        if body.quantidade <= 0:
            raise HTTPException(400, detail="entrada deve ser positiva")
        item = StockItem(
            company_id=company_id, product_id=product_id, option_id=option_id,
            quantidade_atual=body.quantidade, unidade=body.unidade,
        )
        db.add(item)
        await db.flush()  # garante item.id antes do StockMovement
        delta = body.quantidade
    else:
        if body.unidade is not None and body.unidade != item.unidade:
            raise HTTPException(400, detail=f"unidade já definida como {item.unidade}, não pode ser alterada")
        if body.tipo == "entrada":
            if body.quantidade <= 0:
                raise HTTPException(400, detail="entrada deve ser positiva")
            delta = body.quantidade
        else:  # ajuste — pode ser positivo ou negativo, nunca deixa o saldo negativo
            if body.quantidade == 0:
                raise HTTPException(400, detail="ajuste não pode ser zero")
            delta = body.quantidade
            # UPDATE condicional atômico — sem SELECT FOR UPDATE (QA confirmou frequência baixa),
            # mas ainda seguro contra corrida: o WHERE só passa se o saldo final não ficar negativo
            result = await db.execute(
                update(StockItem)
                .where(StockItem.id == item.id, StockItem.quantidade_atual + delta >= 0)
                .values(quantidade_atual=StockItem.quantidade_atual + delta)
            )
            if result.rowcount == 0:
                raise HTTPException(400, detail="ajuste resultaria em quantidade negativa")

    if body.tipo == "entrada" and item.id is not None:
        # entrada em stock_item já existente — soma via UPDATE condicional (delta sempre > 0,
        # a condição >= 0 nunca barra entrada, é o mesmo caminho do ajuste por simplicidade)
        await db.execute(
            update(StockItem).where(StockItem.id == item.id, StockItem.quantidade_atual + delta >= 0)
            .values(quantidade_atual=StockItem.quantidade_atual + delta)
        )

    movement = StockMovement(
        stock_item_id=item.id, tipo=body.tipo, quantidade=delta,
        motivo=motivo, criado_por=current_user.sub,
    )
    db.add(movement)
    await db.commit()
    await db.refresh(item)
    return {"quantidade_atual": item.quantidade_atual, "unidade": item.unidade}
```

### Endpoints — 2 pares finos delegando pras funções compartilhadas (G2)

```python
@app.get(
    "/catalog/products/{product_id}/stock",
    tags=["Catálogo"],
    summary="Consultar estoque e histórico de movimentações de um produto",
    responses={404: {"description": "Produto não encontrado ou de outra empresa"}},
)
async def get_product_stock(
    product_id: int, db: AsyncSession = Depends(get_db), company_id: int = Depends(resolve_company_id),
):
    return await _get_stock_state(db, company_id, product_id=product_id)


@app.get(
    "/catalog/options/{option_id}/stock",
    tags=["Catálogo"],
    summary="Consultar estoque e histórico de movimentações de uma opção",
    responses={404: {"description": "Opção não encontrada ou de outra empresa"}},
)
async def get_option_stock(
    option_id: int, db: AsyncSession = Depends(get_db), company_id: int = Depends(resolve_company_id),
):
    return await _get_stock_state(db, company_id, option_id=option_id)


@app.post(
    "/catalog/products/{product_id}/stock/movements",
    status_code=201,
    tags=["Catálogo"],
    summary="Registrar entrada ou ajuste manual de estoque de um produto",
    responses={
        400: {"description": "movimentação inválida (unidade, sinal, motivo ou saldo insuficiente)"},
        404: {"description": "Produto não encontrado ou de outra empresa"},
    },
)
async def create_product_stock_movement(
    product_id: int, body: StockMovementIn, db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user), company_id: int = Depends(resolve_company_id_write),
):
    return await _create_stock_movement(db, company_id, body, current_user, product_id=product_id)


@app.post(
    "/catalog/options/{option_id}/stock/movements",
    status_code=201,
    tags=["Catálogo"],
    summary="Registrar entrada ou ajuste manual de estoque de uma opção",
    responses={
        400: {"description": "movimentação inválida (unidade, sinal, motivo ou saldo insuficiente)"},
        404: {"description": "Opção não encontrada ou de outra empresa"},
    },
)
async def create_option_stock_movement(
    option_id: int, body: StockMovementIn, db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user), company_id: int = Depends(resolve_company_id_write),
):
    return await _create_stock_movement(db, company_id, body, current_user, option_id=option_id)
```

### Schemas

```python
class StockMovementIn(BaseModel):
    tipo: Literal["entrada", "ajuste"]
    quantidade: Decimal
    unidade: str | None = None  # obrigatório só na primeira movimentação
    motivo: str | None = None
```

### Migration (já nasce polimórfica — G2)
`services/catalog/migrations/versions/YYYYMMDD_HHMM_stock_item_movement.py`:

```python
def upgrade() -> None:
    op.create_table(
        "stock_items",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("company_id", sa.Integer, nullable=False),
        sa.Column("product_id", sa.Integer, sa.ForeignKey("products.id"), nullable=True),
        sa.Column("option_id", sa.Integer, sa.ForeignKey("options.id"), nullable=True),
        sa.Column("quantidade_atual", sa.Numeric(12, 3), nullable=False, server_default="0"),
        sa.Column("unidade", sa.String(2), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=True),
        sa.Column("updated_at", sa.DateTime, nullable=True),
        sa.UniqueConstraint("product_id", name="uq_stock_items_product"),
        sa.UniqueConstraint("option_id", name="uq_stock_items_option"),
        sa.CheckConstraint(
            "(product_id IS NOT NULL AND option_id IS NULL) OR (product_id IS NULL AND option_id IS NOT NULL)",
            name="ck_stock_items_owner_xor",
        ),
    )
    op.create_index("ix_stock_items_company_id", "stock_items", ["company_id"])
    op.create_table(
        "stock_movements",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("stock_item_id", sa.Integer, sa.ForeignKey("stock_items.id"), nullable=False),
        sa.Column("tipo", sa.String(10), nullable=False),
        sa.Column("quantidade", sa.Numeric(12, 3), nullable=False),
        sa.Column("motivo", sa.String(255), nullable=True),
        sa.Column("criado_por", sa.Integer, nullable=False),
        sa.Column("criado_em", sa.DateTime, nullable=True),
    )
    op.create_index("ix_stock_movements_stock_item_id", "stock_movements", ["stock_item_id"])


def downgrade() -> None:
    op.drop_table("stock_movements")
    op.drop_table("stock_items")
```

Sem backfill — nenhum produto/opção tem estoque até a primeira movimentação ser registrada
manualmente. Só existe UMA migration pra essa história (não uma da A2 seguida de uma correção da
G2) — exatamente o ganho de revisar em vez de implementar em duas ondas.

### Por que o `UPDATE` condicional substitui `SELECT FOR UPDATE` aqui
QA já confirmou que a frequência de concorrência real é baixíssima (ação manual humana, não venda
automatizada). Em vez de pagar o custo de um lock explícito, uma única instrução `UPDATE ... WHERE
quantidade_atual + :delta >= 0` já é atômica no nível do banco — ou o `WHERE` bate e a linha
atualiza, ou não bate e `rowcount == 0` avisa que o saldo ficaria negativo. Não existe janela onde
duas transações leem o mesmo valor e escrevem por cima uma da outra, mesmo sem lock explícito — o
próprio banco serializa o `UPDATE` na linha.

### Riscos
- Nenhum risco técnico de alta severidade — escopo isolado, sem tocar em fluxo de venda/pagamento.
- Único cuidado de implementação: manter um caminho só de `UPDATE` condicional pra entrada e ajuste
  (mesma instrução, delta com sinal diferente), em vez de duplicar a lógica — já refletido no
  código acima.
- **(G2) `CheckConstraint` exige MySQL ≥ 8.0.16**: versões anteriores do MySQL aceitavam a sintaxe
  de `CHECK` mas **ignoravam silenciosamente** a validação (bug conhecido, corrigido só na 8.0.16).
  Aurora MySQL Serverless v2 (stack-alvo de produção) já roda em base 8.0 recente, então não é
  bloqueio real, mas vale confirmar a versão exata do cluster antes do deploy — se for mais antiga,
  o XOR precisaria de um `TRIGGER` como rede de segurança adicional. SQLite (usado nos testes locais
  via `test_ord180_cadastro_ean_produto.py`-style fixture) honra `CHECK` nativamente, então a suíte
  de testes já valida a constraint de verdade, não é um teste "falso positivo" que só passaria em
  SQLite e falharia em produção.
- **(G2) Refatoração virou zero-custo por causa do timing**: como nenhum código da A2 original tinha
  sido escrito, "extrair função compartilhada" não foi um refactor de código existente — foi
  simplesmente a forma como a história nasceu. Esse risco (quebrar comportamento já validado em
  produção ao extrair função) só existiria se a implementação original já tivesse sido feita e
  mergeada antes da revisão G2 chegar — não é o caso aqui.
- **(G2) Constraint de banco não impede erro de rota** (ex.: código futuro chamar
  `_create_stock_movement(..., product_id=body.option_id)` por engano, um bug de "parâmetro trocado"
  dentro da própria aplicação) — o `CheckConstraint` protege contra dado inconsistente no banco, não
  contra bug lógico na camada de rota. Mitigado por serem apenas 2 pontos de chamada (as 2 rotas
  `POST`), cada um passando literalmente um dos dois kwargs, e pelos cenários de QA dedicados por
  caminho (Product vs. Option).

### Estimativa
**13 pontos confirmados** (5 originais da A2 + 8 da revisão G2): duas tabelas novas com dono
polimórfico, 4 endpoints (2 pares), validação de regra de negócio em camadas (unidade, sinal,
motivo, saldo, isolamento via `join` pro caminho de `Option`), e **duas** seções de UI com estado
vazio + diálogo + histórico (`ProductEditScreen.tsx` e o modal de opção em
`OptionGroupFormScreen.tsx`). Os 8 pontos de G2 cobrem o polimorfismo de schema/endpoint (menor
parte do esforço, dado o reuso via função compartilhada) e principalmente a segunda instância de UI
— maior parte do custo real, confirmando a preocupação da revisão de PM de que 8 pontos só fariam
sentido incluindo a UI gêmea, não só backend.

### O que ainda impede o avanço pro Ready
Nada bloqueante.

## Ready

Upstream repassado formalmente por papel (PM, QA, backend) — cada fase achou e corrigiu pelo menos
um problema real antes de aprovar a passagem pra próxima:

**Explorer:** [x] história · [x] decisão de escopo (FK obrigatória a `Product`, `is_sellable`
adiado pra E1, sinal por tipo de movimentação) · [x] fluxo principal · [x] dependências (nenhuma
bloqueante) · [x] critérios de aceite. **Revisão de PM**: achou posição/conteúdo da seção "Estoque"
subespecificados (corrigido: logo após "Classificação fiscal", antes de "Opções do produto", com
conteúdo do estado vazio/diálogo/histórico detalhado); achou que `unidade` como texto livre criaria
dívida de dado pra A5 (corrigido: `Dropdown` fixo un/kg/g/L/ml); achou ambiguidade entre entrada e
ajuste quanto a sinal (corrigido: entrada sempre positiva, ajuste pode ser negativo sem passar de
zero).

**QA Explorer:** [x] happy path · [x] bordas (ajuste até zero, ajuste que passaria de zero, entrada
negativa rejeitada, motivo obrigatório em ajuste e tratamento de espaço em branco, unidade não
editável) · [x] isolamento multi-tenant · [x] cenários aprovados. **Revisão de QA**: achou que a
validação de unidade não podia depender só do Dropdown do frontend (corrigido com validação também
no backend) e que faltava cenário de isolamento multi-tenant nos critérios de aceite (incorporado).

**Tech Explorer:** [x] models e migration (`stock_items`/`stock_movements`) · [x] endpoints (GET
consulta, POST movimentação) · [x] schemas · [x] tratamento de concorrência (UPDATE condicional
atômico, sem necessidade de lock explícito) · [x] riscos — nenhum de alta severidade.

**Status original: Ready.** Segunda história do épico de estoque/ERP, upstream repassado por 3
papéis com achados reais incorporados.

---

### Revisão G2 (2026-09-18) — `stock_item` passa a aceitar `Option` como dono, re-repassada pelos 3 papéis

**Explorer (revisão):** [x] decisão de escopo revisada (dono polimórfico via `product_id`/
`option_id` nullable + `CheckConstraint` XOR) · [x] UI gêmea em `OptionGroupFormScreen.tsx` ·
[x] dependências revisadas (G1 não é bloqueio duro, só recomendação de ordem) · [x] critérios de
aceite novos. **Revisão de PM**: confirmou que revisar a mesma história (não abrir `ORD-189`) é a
decisão certa dado que zero código tinha sido escrito; achou que a UI gêmea precisava ser escopo
obrigatório de G2, não opcional (corrigido — sem isso a história ficaria sem efeito prático pra
opções, mesmo problema já evitado em G1); avaliou a janela de exposição entre G2 e G4 (produto
guarda-chuva sem trava) e decidiu **não** transformar em critério de aceite desta história — é job
da G4, registrado como recomendação de ordem de implementação, não bloqueio.

**QA Explorer (revisão):** [x] cenários novos (stock_item via `option_id`, dois donos com
quantidades independentes, `CheckConstraint` rejeitando dono ausente ou duplo, isolamento
multi-tenant dedicado pro caminho de `Option`). **Revisão de QA**: achou que o cenário de
isolamento já existente (via `Product`) não cobre o caminho de `Option` — `Option` não tem
`company_id` direto, é um `join` diferente — e exigiu um cenário dedicado (incorporado, e o Tech
Explorer garante isso via `_resolve_stock_owner` compartilhada).

**Tech Explorer (revisão):** [x] model com `CheckConstraint` XOR · [x] 2 endpoints novos de
`Option`, extraídos em `_resolve_stock_owner`/`_get_stock_state`/`_create_stock_movement`
compartilhadas (sem duplicar lógica de entrada/ajuste/unidade) · [x] migration única, já nascendo
polimórfica (sem migration de correção separada) · [x] riscos novos (versão mínima de MySQL pro
`CheckConstraint`, refactor de custo zero pelo timing, constraint de banco não substitui teste de
rota) · [x] estimativa revisada pra 13 pontos.

**Status: Ready** (revisão G2 incorporada). Cobre agora A2 (Product) e G2 (Option) na mesma
história — pode entrar no sprint assim que o usuário priorizar, com a recomendação de sequenciar
G1 → G4 logo em seguida pra fechar a janela de exposição documentada acima.

**Nota de consistência (adicionada pela G3, `ORD-190`)**: `_resolve_stock_owner` mostrada acima
retorna `None` implicitamente (só valida) — a G3 revisa essa função pra retornar a linha carregada
do dono, pra poder ler `estoque_minimo`/`unidade_compra`/`fator_conversao`. Quem for implementar
deve usar a forma final descrita em `ORD-190`, não esta versão intermediária.
