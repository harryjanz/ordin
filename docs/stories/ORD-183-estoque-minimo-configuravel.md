---
id: ORD-183
status: Ready
estimativa: 2 pontos (backend + frontend)
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-183 — Estoque mínimo configurável por produto

## Descrição
História **A3** do épico de estoque/ERP (`docs/estudo-modulo-estoque-erp.md`, Bloco A —
Fundação). Depende de A2 (`ORD-181`, Ready) — usa o mesmo domínio de estoque já criado
(`stock_item`). Escopo aqui é **só a configuração do limiar** — a decisão original do épico (decisão
3: "Fanta Uva com mínimo 3 pausa a venda com 3 latas ainda em estoque") é sobre o *efeito* de
bloquear a venda, que é escopo da **A4** (bloqueio automático no totem), não desta história. A3
entrega a configuração e um indicador visual no admin; não mexe em nada que o cliente vê no totem.

## Persona
**Empresa** (owner/manager/admin que gerencia catálogo e estoque).

## Explorer

### História
Como **Empresa**, quero configurar um estoque mínimo por produto (default 0), para identificar
quando esse produto está com estoque baixo, mesmo antes de chegar a zero.

### Decisão de escopo — `estoque_minimo` vive em `Product`, não em `stock_item`
O esboço técnico original do épico cogitava `estoque_minimo` como coluna de `stock_item`
(`ORD-181`). Decisão nesta história: colocar em **`Product`** em vez de `stock_item`. Motivo:
`stock_item` só existe depois da primeira movimentação (criação lazy, ver `ORD-181`) — se
`estoque_minimo` morasse lá, a Empresa não conseguiria configurar o limiar **antes** de fazer a
primeira entrada de estoque, um fluxo real (planejar a política de reposição antes de ter estoque
físico ainda). Em `Product`, a configuração fica disponível desde o cadastro do produto,
independente de já existir `stock_item` — e fica dormente sem efeito nenhum até o produto ficar
"controlado" (regra de rollout, decisão 11 do épico, história A4).

### Decisão de escopo — indicador visual como valor entregue nesta história
Sem A4 ainda, esta história sozinha não bloqueia nada — mas entrega valor real por conta própria: a
seção "Estoque" (`ORD-181`) ganha um indicador visual "Abaixo do mínimo" quando
`quantidade_atual <= estoque_minimo`, visível só no admin. Isso dá à Empresa visibilidade de estoque
baixo antes mesmo do bloqueio automático (A4) existir — resolve a preocupação de "história
fundação sem valor próprio" que já apareceu nas revisões anteriores do épico (A1/A2).

### Posicionamento exato na seção "Estoque" (fechando lacuna da revisão de PM)
A seção "Estoque" (`ORD-181`) tem hoje: estado vazio **ou** quantidade atual + unidade em destaque
→ botão "Registrar movimentação" → histórico. O campo **"Estoque mínimo"** entra como um campo
`NumberInput` **logo abaixo da quantidade atual em destaque**, sempre visível (inclusive no estado
vazio, sem `stock_item` ainda — reforça a decisão de que a configuração não depende de estoque já
existir). O indicador **"Abaixo do mínimo"** (`Tag variant="warning"`) aparece **ao lado da
quantidade atual em destaque**, não como linha separada — mesmo padrão visual já usado nas outras
telas do admin pra sinalizar estado junto do dado principal (ex.: `Tag` ao lado de status em
tabelas). Só aparece quando existe `stock_item` (há quantidade atual pra comparar).

### Fluxo principal
1. Empresa abre a seção "Estoque" de um produto (`ORD-181`).
2. Configura o campo "Estoque mínimo" (numérico, default 0).
3. Se a quantidade atual já estiver abaixo do valor configurado, a seção mostra um indicador
   visual (`Tag variant="warning"`, texto "Abaixo do mínimo").

### Fluxos alternativos / exceções
- **Estoque mínimo negativo**: rejeitado — não existe margem de segurança negativa.
- **Produto sem `stock_item` ainda** (nenhuma movimentação registrada): o campo "Estoque mínimo"
  continua configurável normalmente (é campo de `Product`, não depende de `stock_item` existir); o
  indicador visual simplesmente não aparece, porque não há quantidade atual pra comparar.
- **Estoque mínimo configurado acima da quantidade atual**: permitido sem aviso de bloqueio — só
  ativa o indicador visual "Abaixo do mínimo" (não impede nada nesta história).

### Dependências
- **Depende de A2** (`ORD-181`, Ready) — usa a seção "Estoque" já criada.
- **Histórias futuras que consomem esta**: A4 (bloqueio automático no totem, usa `estoque_minimo`
  pra decidir quando esconder o produto do cardápio).

### Critérios de aceite funcionais
- [ ] `Product.estoque_minimo` (default 0), configurável mesmo sem `stock_item` existir ainda
- [ ] Valor negativo é rejeitado
- [ ] Indicador visual "Abaixo do mínimo" aparece quando `quantidade_atual <= estoque_minimo`
- [ ] Indicador não aparece pra produto sem `stock_item` (sem quantidade atual pra comparar)

## QA Explorer

### Achado: o indicador precisa usar `<=`, não `<` (corrigindo o rascunho de PM)
A decisão 3 do épico (`docs/estudo-modulo-estoque-erp.md`) define o comportamento de bloqueio como
"chega no `estoque_minimo`" — `<=`, não `<`. Se o indicador desta história usasse `<` e a A4
(bloqueio de verdade) usar `<=`, existiria uma janela inconsistente: o totem bloqueia a venda mas o
admin não tinha mostrado aviso nenhum um passo antes. O indicador usa `<=`, batendo exatamente com
o que a A4 vai implementar depois.

### Cenários Gherkin

```gherkin
Feature: Estoque mínimo configurável por produto
  Como Empresa
  Quero configurar um estoque mínimo por produto
  Para identificar quando esse produto está com estoque baixo

  Scenario: Configurar estoque mínimo antes de qualquer movimentação existir
    Dado um produto sem stock_item ainda
    Quando configuro o estoque mínimo como 5
    Então o valor é salvo, mesmo sem quantidade atual pra comparar

  Scenario: Configurar estoque mínimo com stock_item já existente
    Dado um produto com stock_item de quantidade_atual=10
    Quando configuro o estoque mínimo como 3
    Então o valor é salvo normalmente

  Scenario: Valor negativo é rejeitado
    Dado um produto qualquer
    Quando tento configurar o estoque mínimo como -1
    Então o sistema rejeita com erro claro

  Scenario: Indicador aparece quando a quantidade fica exatamente no mínimo
    Dado um produto com estoque mínimo=3 e quantidade_atual=3
    Quando abro a seção Estoque desse produto
    Então o indicador "Abaixo do mínimo" aparece (limite é <=, não só <)

  Scenario: Indicador aparece quando a quantidade fica abaixo do mínimo
    Dado um produto com estoque mínimo=3 e quantidade_atual=2
    Quando abro a seção Estoque desse produto
    Então o indicador "Abaixo do mínimo" aparece

  Scenario: Indicador não aparece quando a quantidade está acima do mínimo
    Dado um produto com estoque mínimo=3 e quantidade_atual=10
    Quando abro a seção Estoque desse produto
    Então nenhum indicador aparece

  Scenario: Indicador não aparece sem stock_item
    Dado um produto com estoque mínimo configurado mas sem nenhuma movimentação
    Quando abro a seção Estoque desse produto
    Então nenhum indicador aparece (não há quantidade atual pra comparar)

  Scenario: Indicador some após nova entrada trazer a quantidade de volta pro normal
    Dado um produto com estoque mínimo=3 e quantidade_atual=2 (indicador visível)
    Quando registro uma entrada de 5 unidades (ORD-181)
    Então a quantidade_atual passa a ser 7 e o indicador some
```

### Critérios de aceite testáveis
- [ ] Limite de comparação é `<=` (achado desta revisão), não `<`
- [ ] Estoque mínimo configurável independente de `stock_item` existir
- [ ] Valor negativo rejeitado
- [ ] Indicador reage corretamente a entradas/ajustes subsequentes (`ORD-181`), não é um valor
      calculado uma vez só

### Confirmação da revisão de QA (não é lacuna)
**Isolamento multi-tenant**: `estoque_minimo` é só mais um campo do endpoint de `Product` já
existente e já isolado (mesmo padrão de SKU/EAN, `ORD-180`) — não precisa de teste de isolamento
novo e dedicado, o já existente cobre.

### O que ainda impede o avanço pro Tech Explorer
Nada bloqueante — revisão de QA aprovada com a correção de `<=` e os cenários acima incorporados.

## Tech Explorer

### Migration e model (`Product`, `services/catalog/main.py` linha 129)

```python
estoque_minimo = Column(Numeric(12, 3), nullable=False, default=0, server_default="0")
```

`server_default="0"` faz o backfill automático de produtos já existentes na própria migration
(`ALTER TABLE ... ADD COLUMN ... DEFAULT 0`), sem precisar de `UPDATE` separado — mesmo tipo
`Numeric(12, 3)` já usado em `stock_item.quantidade_atual` (`ORD-181`), pra comparação numérica não
ter problema de tipo incompatível entre as duas colunas.

Migration nova: `services/catalog/migrations/versions/YYYYMMDD_HHMM_estoque_minimo_produto.py`.

### Schema (`ProductIn`/`ProductUpdate`/`ProductOut`)

```python
estoque_minimo: Decimal = Decimal("0")

@field_validator("estoque_minimo")
@classmethod
def _estoque_minimo_non_negative(cls, v: Decimal) -> Decimal:
    if v < 0:
        raise ValueError("estoque mínimo não pode ser negativo")
    return v
```

### Ajuste no endpoint `GET /catalog/products/{product_id}/stock` (criado na `ORD-181`)

O endpoint já carrega `Product` pra checagem de isolamento multi-tenant, antes mesmo de olhar
`stock_item` — adicionar `estoque_minimo` na resposta **não custa nenhuma consulta extra**, só ler
um campo que já está em memória:

```python
async def get_product_stock(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id),
):
    p = (await db.execute(
        select(Product).filter_by(id=product_id, company_id=company_id, deleted=False)
    )).scalars().first()
    if not p:
        raise HTTPException(404)

    item = (await db.execute(select(StockItem).filter_by(product_id=product_id))).scalars().first()
    if not item:
        return {
            "has_stock_item": False, "quantidade_atual": None, "unidade": None,
            "estoque_minimo": p.estoque_minimo, "abaixo_do_minimo": False, "movements": [],
        }

    movements = (await db.execute(
        select(StockMovement).filter_by(stock_item_id=item.id).order_by(StockMovement.criado_em.desc())
    )).scalars().all()
    return {
        "has_stock_item": True,
        "quantidade_atual": item.quantidade_atual,
        "unidade": item.unidade,
        "estoque_minimo": p.estoque_minimo,
        "abaixo_do_minimo": item.quantidade_atual <= p.estoque_minimo,  # achado de QA: <=, não <
        "movements": [
            {"tipo": m.tipo, "quantidade": m.quantidade, "motivo": m.motivo,
             "criado_por": m.criado_por, "criado_em": m.criado_em}
            for m in movements
        ],
    }
```

`abaixo_do_minimo` calculado no backend, não no frontend — evita duplicar a regra de comparação em
dois lugares.

### Frontend
`ProductEditScreen.tsx`, seção "Estoque" (`ORD-181`): `NumberInput` "Estoque mínimo" logo abaixo da
quantidade atual (posição já definida no Explorer); `Tag variant="warning"` "Abaixo do mínimo" ao
lado da quantidade, renderizada quando `abaixo_do_minimo === true` (valor já vem calculado do
backend, frontend só exibe).

### Riscos
Nenhum risco técnico relevante — mudança aditiva, sem impacto em fluxo existente, reaproveita
endpoint e tipo de dado já criados na `ORD-181`.

### Estimativa
**2 pontos confirmados** — schema pequeno, endpoint já existente ganha 2 campos calculados a mais,
sem custo de consulta extra.

### O que ainda impede o avanço pro Ready
Nada bloqueante.

## Ready

Upstream repassado formalmente por papel (PM, QA, backend) — cada fase achou e corrigiu pelo menos
um problema real antes de aprovar a passagem pra próxima:

**Explorer:** [x] história · [x] decisão de escopo (`estoque_minimo` em `Product`, não
`stock_item`) · [x] fluxo principal · [x] dependências (A2) · [x] critérios de aceite. **Revisão de
PM**: confirmou a decisão de modelagem como correta (inclusive antecipando o caso de insumo puro da
E1) e achou que posição exata do campo/indicador na seção "Estoque" não estava especificada
(corrigido).

**QA Explorer:** [x] happy path (com e sem `stock_item`) · [x] bordas (negativo, limite exato,
reação a novas movimentações) · [x] cenários aprovados. **Revisão de QA — achado mais importante**:
o indicador usaria `<` em vez de `<=`, o que criaria inconsistência com a regra de bloqueio real que
a A4 vai implementar (decisão 3 do épico) — corrigido em todo o documento.

**Tech Explorer:** [x] migration, schema, validação · [x] ajuste do endpoint existente (`ORD-181`)
sem custo de consulta extra · [x] riscos — nenhum relevante.

**Status: Ready.** Quarta história do épico de estoque/ERP, depende só de A2 (`ORD-181`, já
Ready) — pode ser feita em paralelo com A5 e A6.
