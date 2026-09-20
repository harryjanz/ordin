---
id: ORD-184
status: Ready
estimativa: 5 pontos (backend + frontend) — revisado de 3 na revisão de PM
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-184 — Unidade de medida com fator de conversão (entrada manual)

## Descrição
História **A5** do épico de estoque/ERP (`docs/estudo-modulo-estoque-erp.md`, Bloco A —
Fundação). Depende de A2 (`ORD-181`, Ready). Escopo **reduzido de propósito** (nota já deixada na
`ORD-181`): cobre só a conversão usada no registro manual de entrada — o "fator reaplicado
automaticamente por fornecedor" que a pesquisa de mercado do épico encontrou é, na prática, escopo
da história C1 (vínculo automático via XML), não desta.

## Persona
**Empresa** (owner/manager/admin que gerencia catálogo e estoque).

## Explorer

### História
Como **Empresa**, quero configurar uma unidade de compra diferente da unidade de estoque de um
produto, com um fator de conversão entre elas, para registrar entradas na unidade que eu realmente
compro (ex.: caixa, fardo, kg), sem precisar converter manualmente antes de digitar.

### Decisão de escopo — `unidade_compra` é texto livre, `fator_conversao` faz o trabalho de verdade
Diferente de `stock_item.unidade` (`ORD-181`, conjunto fixo `un`/`kg`/`g`/`L`/`ml` — porque
alimenta comparação/agregação entre produtos), `unidade_compra` aqui é **texto livre** ("caixa de
12", "fardo", "saco de 25kg", "kg"). Motivo pra não repetir a decisão de enum fixo desta vez: **não
há, no escopo atual do épico**, nenhuma feature que compare `unidade_compra` entre produtos
diferentes — é só um rótulo exibido ao lado do fator. Quem faz o trabalho real de conversão é o
número (`fator_conversao`), não o texto (formulação corrigida na revisão de PM — a versão anterior
dizia "nada no sistema" de forma absoluta, quando na verdade um relatório futuro tipo "custo por
caixa vs. kg" — Fase 4, dashboards de estoque, já adiado — sofreria o mesmo problema de dado sujo
do enum fixo; não é motivo pra mudar a decisão agora, só pra não prometer garantia permanente).

### Decisão de escopo — onde os campos vivem (posição exata, fechando lacuna da revisão de PM)
`unidade_compra` e `fator_conversao` vivem em **`Product`** (mesmo racional já usado em A3 pro
`estoque_minimo`): configuráveis independente de `stock_item` existir, e reaproveitáveis pro caso
de insumo puro que a E1 vai introduzir. Os dois campos são opcionais, mas **sempre juntos** —
definir um sem o outro não faz sentido (validação: ambos preenchidos ou ambos vazios). **Posição na
UI**: dentro da seção "Estoque" (`ORD-181`), agrupados perto de "Unidade" e "Estoque mínimo"
(`ORD-183`) — não é uma seção nova.

### Decisão de escopo — como isso entra no registro de movimentação (A2)
O diálogo "Registrar movimentação" (`ORD-181`, ordem já fixada: Tipo → Unidade → Quantidade →
Motivo) ganha, **só quando o produto tem conversão configurada**, uma nova escolha **logo depois de
"Tipo" e antes de "Quantidade"**: em qual unidade a Empresa está digitando — a unidade de estoque
(comportamento de hoje, sem mudança) ou a unidade de compra configurada. Se escolher a de compra, o
backend converte (`quantidade_informada × fator_conversao`) antes de gravar — o `stock_movement`
sempre guarda a quantidade final na unidade de estoque (não muda o que já existe), mas passa a
guardar também, quando houve conversão, a quantidade e unidade **originais** informadas
(`quantidade_original`/`unidade_original`, nullable), só pra exibir no histórico
("2 caixa de 12 → 24 un") sem perder a rastreabilidade do que a Empresa realmente digitou.

### Caso de borda — mudança do fator de conversão não recalcula movimentações passadas
Se a Empresa corrigir o `fator_conversao` depois de já ter movimentações registradas com o fator
anterior, **essas movimentações não são recalculadas retroativamente** — `stock_movement.quantidade`
já gravado é histórico imutável, mesmo princípio de auditoria já estabelecido na `ORD-181` (erro
passado se corrige com um `ajuste` novo, nunca reescrevendo o passado). Precisa estar explícito pra
não virar dúvida de suporte depois.

### Fluxo principal
1. Empresa configura, no cadastro do produto, "Unidade de compra" (texto livre) e "Fator de
   conversão" (ex.: "caixa de 12" → 12, significando 1 caixa = 12 unidades de estoque).
2. Ao registrar uma entrada (`ORD-181`), escolhe se está digitando na unidade de estoque ou na de
   compra.
3. Se escolher a de compra, informa "2" (caixas) — sistema converte pra 24 (unidades de estoque) e
   salva a movimentação, mostrando no histórico "2 caixa de 12 → 24 un".

### Fluxos alternativos / exceções
- **Fator de conversão zero ou negativo**: rejeitado.
- **`unidade_compra` preenchida sem `fator_conversao`, ou vice-versa**: rejeitado — os dois campos
  são obrigatórios juntos.
- **Produto sem conversão configurada**: diálogo de movimentação continua exatamente como na
  `ORD-181`, sem opção de escolha de unidade (comportamento de hoje, sem regressão).
- **Ajuste também aceita conversão**: mesma lógica da entrada — correção pode ser descrita na
  unidade de compra também (ex.: "achei 1 caixa a menos na contagem").

### Dependências
- **Depende de A2** (`ORD-181`, Ready) — estende o diálogo de movimentação já criado.
- **Histórias futuras que consomem esta**: E1 (ficha técnica) — insumo comprado numa unidade,
  consumido em outra na receita.

### Critérios de aceite funcionais
- [ ] `Product.unidade_compra` e `Product.fator_conversao` — ambos preenchidos ou ambos vazios
- [ ] Fator de conversão deve ser positivo
- [ ] Movimentação registrada na unidade de compra é convertida corretamente pra unidade de estoque
- [ ] Histórico mostra a quantidade original e a convertida quando houve conversão
- [ ] Produto sem conversão configurada mantém o fluxo de movimentação exatamente como na `ORD-181`
- [ ] Alterar o fator de conversão não recalcula movimentações já registradas

## QA Explorer

### Achado: precisão decimal na conversão
Nenhum critério cobria o que acontece quando `fator_conversao × quantidade_informada` produz mais
casas decimais do que `stock_item.quantidade_atual` suporta (`Numeric(12,3)`, `ORD-181`). Precisa de
regra explícita: arredondar pra 3 casas decimais antes de gravar.

### Cenários Gherkin

```gherkin
Feature: Unidade de medida com fator de conversão (entrada manual)
  Como Empresa
  Quero configurar uma unidade de compra com fator de conversão
  Para registrar entradas na unidade que eu realmente compro

  Scenario: Configurar conversão com sucesso
    Dado um produto sem conversão configurada
    Quando informo unidade de compra "caixa de 12" e fator de conversão 12
    Então a configuração é salva

  Scenario: Configurar só um dos dois campos é rejeitado
    Dado um produto sem conversão configurada
    Quando informo só a unidade de compra, sem o fator, ou só o fator, sem a unidade
    Então o sistema rejeita — os dois campos são obrigatórios juntos

  Scenario: Fator zero ou negativo é rejeitado
    Dado um produto sem conversão configurada
    Quando tento configurar fator de conversão 0 ou -5
    Então o sistema rejeita

  Scenario: Entrada convertida corretamente
    Dado um produto com conversão "caixa de 12" = 12, estoque atual 0
    Quando registro uma entrada de 2, escolhendo a unidade de compra
    Então a quantidade_atual passa a ser 24 (2 × 12)
    E a movimentação grava quantidade_original=2, unidade_original="caixa de 12"

  Scenario: Ajuste convertido corretamente, respeitando o piso de zero na quantidade convertida
    Dado um produto com conversão "caixa de 12" = 12, estoque atual 24
    Quando registro um ajuste de -1, escolhendo a unidade de compra, com motivo informado
    Então a quantidade_atual passa a ser 12 (ajuste de -12 já convertido)
    E se o ajuste convertido resultasse em negativo, o sistema bloqueia (mesma regra da ORD-181,
    aplicada sobre o valor JÁ convertido, não sobre o valor bruto informado)

  Scenario: Entrada na unidade de compra também exige valor positivo
    Dado um produto com conversão configurada
    Quando tento registrar uma "entrada" com valor -1 na unidade de compra
    Então o sistema rejeita (mesma regra de "entrada sempre positiva" da ORD-181, checada antes da
    conversão)

  Scenario: Histórico mostra quantidade original e convertida
    Dado uma movimentação registrada com conversão (2 caixas de 12 → 24 un)
    Quando consulto o histórico de movimentações
    Então a linha mostra "2 caixa de 12 → 24 un", não só "24 un"

  Scenario: Movimentação antiga sem conversão continua exibida normalmente
    Dado uma movimentação registrada antes de qualquer conversão existir pro produto
    Quando consulto o histórico
    Então essa linha mostra só a quantidade na unidade de estoque, sem "quantidade original"

  Scenario: Produto sem conversão mantém o diálogo antigo, sem opção de unidade
    Dado um produto sem conversão configurada
    Quando abro o diálogo "Registrar movimentação"
    Então não aparece nenhuma opção de escolha de unidade — comportamento idêntico à ORD-181

  Scenario: Mudança de fator não recalcula movimentações antigas
    Dado um produto com conversão "caixa" = 12 e uma entrada já registrada de 2 caixas (24 un)
    Quando altero o fator de conversão pra 10
    Então a movimentação antiga continua mostrando 24 un — nada é recalculado retroativamente

  Scenario: Arredondamento de resultado com muitas casas decimais
    Dado um produto com fator de conversão 0.333
    Quando registro uma entrada de 7 na unidade de compra
    Então o resultado é arredondado pra 3 casas decimais antes de gravar (2.331), sem estourar o
    tipo da coluna
```

### Critérios de aceite testáveis (completos)
- [ ] Precisão: resultado da conversão arredondado pra 3 casas decimais antes de gravar
- [ ] Piso de zero (`ORD-181`) checado sobre o valor **convertido**, não o valor bruto informado
- [ ] Regra "entrada sempre positiva" (`ORD-181`) checada sobre o valor bruto, antes da conversão
- [ ] Movimentação antiga (sem conversão na época) não ganha `quantidade_original` retroativamente
- [ ] Mudança de fator não altera movimentações já gravadas

### Confirmação da revisão de QA (não é lacuna)
**Isolamento multi-tenant**: `unidade_compra`/`fator_conversao` são só mais campos do endpoint de
`Product` já isolado (mesmo padrão de `estoque_minimo`, `ORD-183`) — sem necessidade de teste novo.

### O que ainda impede o avanço pro Tech Explorer
Nada bloqueante — revisão de QA aprovada com os cenários e a regra de arredondamento incorporados.

## Tech Explorer

### Migration e model (`Product`, `services/catalog/main.py` linha 129)

```python
unidade_compra  = Column(String(30), nullable=True)
fator_conversao = Column(Numeric(12, 3), nullable=True)
```

`CheckConstraint` a nível de banco, além da validação do Pydantic — defesa em profundidade (mesmo
racional já usado nos `field_validator` de EAN/CNPJ, `ORD-180`/`ORD-182`):

```python
__table_args__ = (
    UniqueConstraint("company_id", "sku", name="uq_products_company_sku"),
    UniqueConstraint("company_id", "ean", name="uq_products_company_ean"),
    CheckConstraint(
        "(unidade_compra IS NULL) = (fator_conversao IS NULL)",
        name="ck_products_conversao_junta",
    ),
)
```

### Model (`StockMovement`, criado na `ORD-181`) — 2 colunas novas

```python
quantidade_original = Column(Numeric(12, 3), nullable=True)
unidade_original    = Column(String(30), nullable=True)
```

Nullable — só preenchido quando a movimentação usou conversão; movimentação antiga ou sem conversão
simplesmente não tem esses campos, resolvendo o cenário de QA "movimentação antiga continua exibida
normalmente" sem nenhuma lógica extra.

### Schema — validação conjunta (`ProductIn`)

```python
unidade_compra: str | None = None
fator_conversao: Decimal | None = None

@model_validator(mode="after")
def _conversao_valida(self) -> "ProductIn":
    if (self.unidade_compra is None) != (self.fator_conversao is None):
        raise ValueError("unidade_compra e fator_conversao devem ser preenchidos juntos")
    if self.fator_conversao is not None and self.fator_conversao <= 0:
        raise ValueError("fator de conversão deve ser positivo")
    return self
```

### Diff no endpoint `POST /catalog/products/{product_id}/stock/movements` (`ORD-181`)

Só o que muda — o resto do endpoint (busca do produto, isolamento multi-tenant, `UPDATE`
condicional atômico, checagem de motivo obrigatório em ajuste) continua igual:

```python
class StockMovementIn(BaseModel):
    tipo: Literal["entrada", "ajuste"]
    quantidade: Decimal
    unidade: str | None = None
    motivo: str | None = None
    em_unidade_compra: bool = False  # NOVO — escolhe unidade de compra em vez da de estoque

# dentro de create_stock_movement, logo após buscar `p` (Product) e antes de tudo que já existia:

quantidade_original: Decimal | None = None
unidade_original: str | None = None

if body.em_unidade_compra:
    if p.fator_conversao is None:
        raise HTTPException(400, detail="produto não tem conversão de unidade configurada")
    if body.quantidade <= 0 and body.tipo == "entrada":
        raise HTTPException(400, detail="entrada deve ser positiva")  # checa o valor BRUTO
    quantidade_original, unidade_original = body.quantidade, p.unidade_compra
    quantidade = (body.quantidade * p.fator_conversao).quantize(
        Decimal("0.001"), rounding=ROUND_HALF_UP  # achado de QA: arredondar pra 3 casas
    )
else:
    quantidade = body.quantidade  # caminho antigo, sem nenhuma mudança

# ... todo o resto do endpoint (UPDATE condicional, checagem de piso zero, criação de
# StockMovement) usa `quantidade` (já convertida) em vez de `body.quantidade` diretamente —
# é uma renomeação de variável, não uma reescrita de lógica.

movement = StockMovement(
    stock_item_id=item.id, tipo=body.tipo, quantidade=quantidade,
    quantidade_original=quantidade_original, unidade_original=unidade_original,
    motivo=motivo, criado_por=current_user.sub,
)
```

**Por que a checagem de piso zero (`ORD-181`) não precisa mudar**: ela já opera sobre `quantidade`
(a variável que agora contém o valor convertido) — trocar `body.quantidade` por `quantidade` no
`UPDATE` condicional já existente é suficiente, a regra "nunca fica negativo" continua correta sem
lógica nova.

### Confirmação: mudança de fator não afeta movimentações antigas (por design, sem código extra)
A conversão acontece só no momento do registro — o valor já convertido é gravado direto em
`stock_movement.quantidade`, sem nenhuma referência de volta pro `fator_conversao` usado. Mudar
`Product.fator_conversao` depois não tem como afetar uma linha já persistida.

### Migration
`services/catalog/migrations/versions/YYYYMMDD_HHMM_conversao_unidade.py` — adiciona
`unidade_compra`/`fator_conversao` em `products` (com a `CheckConstraint`) e
`quantidade_original`/`unidade_original` em `stock_movements`.

### Riscos
- Precisão de arredondamento (`ROUND_HALF_UP`, 3 casas) precisa de teste unitário dedicado com
  fatores "feios" (ex. `0.333`), não só números redondos.
- Nenhum outro risco relevante — extensão aditiva de um endpoint já existente e testado.

### Estimativa
**5 pontos confirmados** (revisado de 3 pela PM) — schema em duas tabelas, validação conjunta em
duas camadas, extensão de um endpoint com lógica condicional e arredondamento, e UI que reage à
presença ou ausência de conversão configurada.

### O que ainda impede o avanço pro Ready
Nada bloqueante.

## Ready

Upstream repassado formalmente por papel (PM, QA, backend) — cada fase achou e corrigiu pelo menos
um problema real antes de aprovar a passagem pra próxima:

**Explorer:** [x] história · [x] decisão de escopo (`unidade_compra` texto livre vs. `fator_conversao`
fazendo o trabalho real) · [x] fluxo principal · [x] dependências (A2) · [x] critérios de aceite.
**Revisão de PM**: achou posição dos campos não especificada (corrigido: seção "Estoque", perto de
"Unidade"/"Estoque mínimo"); achou a justificativa do texto livre superafirmando (corrigido pra
"nenhuma feature no escopo atual", não "nada no sistema"); achou pontuação desatualizada (3 → 5
pontos); achou caso de borda não coberto (mudança de fator não recalcula histórico).

**QA Explorer:** [x] happy path (entrada e ajuste convertidos) · [x] bordas (campos conjuntos,
fator inválido, piso zero sobre valor convertido, entrada positiva sobre valor bruto, arredondamento)
· [x] cenários aprovados. **Revisão de QA**: achou lacuna de precisão decimal não coberta —
corrigido com regra de arredondamento explícita (3 casas, `ROUND_HALF_UP`).

**Tech Explorer:** [x] migration (2 tabelas) · [x] validação em duas camadas (Pydantic +
`CheckConstraint`) · [x] diff do endpoint existente (`ORD-181`), sem reescrever lógica já validada
· [x] riscos — arredondamento como único ponto de atenção.

**Status: Ready.** Quinta história do épico de estoque/ERP, depende só de A2 (`ORD-181`, já Ready)
— pode ser feita em paralelo com A4/A4b.
