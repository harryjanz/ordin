---
id: ORD-188
status: Ready
estimativa: 2 pontos (backend + frontend)
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-188 — `Option` ganha EAN/CFOP/CEST

## Descrição
História **G1** do épico de estoque/ERP (`docs/estudo-modulo-estoque-erp.md`, Bloco G — Opções
como SKU real). Achado do próprio usuário, revisando a implementação da A1: opções (`Option`,
ORD-138/146) podem representar produtos reais — ex.: grupo "Sabor" com opções Coca-Cola/Fanta
Laranja/Fanta Uva/Guaraná Antarctica, cada uma com CFOP 5102, EAN e estoque próprios. Sem
dependência de nenhuma outra história do épico — fundação, mesmo papel que A1 tem pro Bloco A.

## Persona
**Empresa** (owner/manager/admin que configura grupos de opção do catálogo).

## Explorer

### História
Como **Empresa**, quero cadastrar EAN e CFOP em cada opção de um grupo, para dar identidade fiscal
própria a opções que representam produtos reais (ex.: cada sabor de um refrigerante), preparando o
caminho pra controle de estoque por opção (G2/G3) e classificação fiscal correta na nota (correção
pendente em `_build_nfce_payload`, dependente desta história).

### Decisão de escopo — reaproveitar validação já existente, não duplicar
`Option` ganha os mesmos 3 campos que `Product` já tem: `ean`, `cfop`, `cest`. Validação reaproveita
**as mesmas funções** já usadas em `Product`:
- Checksum de EAN: `_is_valid_gtin` (`services/catalog/main.py:844`, criada na `ORD-180`).
- CFOP válido: `_validate_cfop` (linha 1274, criada na `ORD-169`).

Nenhuma validação nova precisa ser escrita — só chamada nos campos de `Option` também.

### Posicionamento na UI (fechando lacuna da revisão de PM, verificado no código real)
`OptionGroupFormScreen.tsx` já é a tela que gerencia opções — e o próprio placeholder do campo
"Label" já usa **"Coca-Cola"** como exemplo (linha 548), sinal de que a UI já foi pensada com esse
caso em mente antes deste épico existir. O modal de edição de opção tem hoje, em ordem: Label +
Acréscimo de preço (mesma `formRow`, linhas 546-553), Descrição (555-561), SKU (562-567). **EAN e
CFOP entram logo depois do SKU**, na mesma seção (`modalSectionMain`), antes do painel de imagem
(`modalSectionSide`, linha 570).

### Decisão de escopo — CFOP da opção é livre, sem forçar igualdade com o produto
Confirmado com o usuário via pergunta direta: uma opção declara seu próprio CFOP, validado como
qualquer `Product` (precisa ser `"5101"` ou `"5102"`), **sem** nenhuma regra que exija ser igual ao
CFOP do produto guarda-chuva ao qual pertence. Na prática, quase sempre vai bater (como no exemplo
do usuário, onde produto e todas as opções são 5102), mas não é uma regra travada.

### Decisão de escopo — unicidade de EAN em nível de aplicação, não de banco
Mesmo racional já registrado pro `sku` de `Option` (`services/catalog/main.py:223`, comentário
"`Option` não tem `company_id` direto pra um `UniqueConstraint` de banco"): `Option` só chega em
`company_id` via `join` com `OptionGroup`, então a unicidade de `ean` por empresa é validada em
**aplicação**, dentro de `_set_option_group_options` (linha 476) — mesmo padrão que já existe pro
`sku`, só replicado pro campo novo.

### Fluxo principal
1. Empresa edita um grupo de opção (ex.: "Sabor", do produto "Refrigerante Lata 350ml").
2. Pra cada opção (Coca-Cola, Fanta Laranja...), preenche EAN e CFOP, além do que já existe
   (rótulo, preço adicional, SKU).
3. Salva — EAN validado por checksum, único por empresa (entre todas as opções, não só do mesmo
   grupo); CFOP validado contra o conjunto fechado (`5101`/`5102`).

### Fluxos alternativos / exceções
- **EAN com checksum inválido**: rejeitado, mesma mensagem já usada em `Product`
  ("código de barras inválido").
- **EAN duplicado** (entre opções da mesma empresa, inclusive de grupos diferentes): rejeitado,
  mesmo padrão do `sku` de `Option` já validado hoje.
- **EAN duplicado entre `Option` e `Product`** (ex.: uma opção e um produto avulso com o mesmo
  EAN): **fora de escopo desta história, mas registrado como pendência formal pra C1** (não é só
  "fica pra depois" solto — achado da revisão de PM: sem consumidor de EAN ainda, decidir a regra
  agora seria prematuro; a pergunta certa é "é erro, aviso, ou permitido de propósito?", e só faz
  sentido responder quando C1 desenhar o mecanismo de busca que vai precisar lidar com os dois
  universos).
- **Opção sem EAN/CFOP**: comportamento idêntico a hoje — são campos opcionais, não obrigam nada.

### Dependências
- **Nenhuma bloqueante.**
- **Histórias futuras que consomem esta**: G2 (`stock_item` aceita `Option` como dono), G4
  (detecção de produto guarda-chuva), e a correção pendente em `_build_nfce_payload` (fiscal, fora
  da numeração deste épico).

### Critérios de aceite funcionais
- [ ] `Option` aceita `ean`/`cfop`/`cest` opcionais
- [ ] EAN com checksum inválido é rejeitado (reaproveitando `_is_valid_gtin`)
- [ ] CFOP fora de `{"5101", "5102"}` é rejeitado (reaproveitando `_validate_cfop`)
- [ ] EAN duplicado entre opções da mesma empresa é rejeitado, mesmo padrão do `sku`
- [ ] CFOP da opção não precisa bater com o CFOP do produto guarda-chuva

## QA Explorer

### Ambiente de teste
Mesma fixture já usada em `test_ord180_cadastro_ean_produto.py` (SQLite em memória via
`svc.engine`/`svc.AsyncSessionLocal` sobrescritos, `Base.metadata.create_all`). Nenhuma infra
nova — os cenários abaixo entram num arquivo novo `test_ord188_ean_cfop_cest_em_opcao.py`,
exercitando `PUT /catalog/option-groups/{id}` (rota real de `_set_option_group_options`,
confirmada em `services/catalog/main.py:476`).

### Cenários

```gherkin
Funcionalidade: EAN, CFOP e CEST em Option

  Cenário: Happy path — opção recebe EAN, CFOP e CEST válidos
    Dado um grupo de opção "Sabor" do produto "Refrigerante Lata 350ml"
    Quando a Empresa salva a opção "Coca-Cola" com ean="7891000100103", cfop="5102", cest="0300100"
    Então a opção é salva com sucesso
    E a resposta retorna os 3 campos preenchidos

  Cenário: EAN com checksum inválido é rejeitado
    Dado um grupo de opção existente
    Quando a Empresa salva uma opção com ean="7891000100104" (dígito verificador errado)
    Então a API retorna 400
    E a mensagem de erro é a mesma já usada em Product ("código de barras inválido")

  Esquema do Cenário: CFOP fora do conjunto permitido é rejeitado
    Dado um grupo de opção existente
    Quando a Empresa salva uma opção com cfop="<cfop_invalido>"
    Então a API retorna 400
    Exemplos:
      | cfop_invalido |
      | 5405          |
      | ABC1          |
      | 510           |

  Cenário: EAN duplicado entre duas opções da mesma empresa, MESMO grupo, é rejeitado
    Dado a opção "Coca-Cola" já salva com ean="7891000100103" no grupo "Sabor"
    Quando a Empresa tenta salvar a opção "Fanta Laranja" do mesmo grupo com o mesmo ean
    Então a API retorna 400
    E a mensagem cita "código de barras", não "SKU"

  Cenário: EAN duplicado entre opções de GRUPOS DIFERENTES da mesma empresa é rejeitado
    Dado a opção "Coca-Cola" (grupo "Sabor", produto "Refrigerante") salva com ean="7891000100103"
    Quando a Empresa tenta salvar a opção "Grande" (grupo "Tamanho", produto "Pizza") com o mesmo ean
    Então a API retorna 400
    # relevante pq a unicidade é por EMPRESA, não por grupo nem por produto —
    # replica exatamente o alcance já testado pro sku de Option

  Cenário: Mesmo EAN em opções de empresas diferentes não conflita
    Dado a opção "Coca-Cola" da Empresa X salva com ean="7891000100103"
    Quando a Empresa Y salva uma opção própria com o mesmo ean
    Então a API retorna sucesso para a Empresa Y
    # cobre o padrão join-via-OptionGroup: a query de conflito precisa filtrar
    # por company_id através de OptionGroup.company_id, não confiar em Option
    # ter o campo direto

  Cenário: CFOP da opção diferente do CFOP do produto pai é aceito
    Dado o produto "Refrigerante Lata 350ml" com cfop="5102"
    Quando a Empresa salva a opção "Coca-Cola" desse produto com cfop="5101"
    Então a opção é salva com sucesso
    E nenhuma validação de igualdade é disparada
    # cobre a decisão fechada com o usuário — CFOP livre, sem trava

  Cenário: Opção sem EAN/CFOP/CEST continua funcionando como hoje
    Dado um grupo de opção existente
    Quando a Empresa salva uma opção só com label e price_delta, sem os 3 campos novos
    Então a opção é salva com sucesso
    E os 3 campos retornam null

  Cenário: EAN duplicado entre Option e Product (cross-entity) NÃO é bloqueado — fora de escopo
    Dado um Product com ean="7891000100103"
    Quando a Empresa salva uma Option de outro produto com o mesmo ean
    Então a API retorna sucesso (comportamento esperado nesta história)
    # não é regressão — é a pendência formal registrada pra C1; o teste existe
    # pra travar a fronteira do escopo, não pra validar uma regra de negócio
```

### Isolamento multi-tenant — cobertura específica além do padrão
O teste genérico "empresa A não vê dado de empresa B" não é suficiente aqui sozinho, porque
`Option` não tem `company_id` direto — o filtro de conflito de EAN precisa necessariamente passar
por `join(OptionGroup)`. Um bug plausível é a query de unicidade esquecer esse `join` e comparar
EAN **globalmente** (todas as empresas), o que o cenário "mesmo EAN em empresas diferentes não
conflita" pega diretamente. Vale também um teste negativo explícito de regressão: usar duas
empresas com várias opções cada, garantindo que a Empresa Y consegue reusar EANs já usados pela
Empresa X em massa (não só 1 caso isolado).

### Lacunas / riscos apontados
1. **CEST não tem validação nenhuma hoje em `Product`** (confirmado — só `ean` e `cfop` têm
   validador). `Option.cest` também não terá validação nesta história — paridade com `Product`,
   não omissão; vale deixar explícito no Tech Explorer.
2. **Update (edição) de opção existente** não coberto nos cenários acima — só criação. Recomendo
   replicar o cenário "EAN apagado vira null" (`test_ean_apagado_na_edicao_vira_null`, já existente
   pra Product) também para Option no Tech Explorer.
3. **Concorrência**: dois requests simultâneos salvando o mesmo EAN em duas opções diferentes da
   mesma empresa têm uma janela de corrida teórica (validação em aplicação, não constraint de
   banco). Mesmo risco já aceito hoje para `sku` de Option — não é regressão desta história, só
   registro pra não ser esquecido se aparecer em produção.

## Tech Explorer

### Diff de schema — `Option` (`services/catalog/main.py:208`)

```python
class Option(Base):
    __tablename__ = "options"
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
    ean             = Column(String(14), nullable=True)   # NOVO — mesmo tipo de Product.ean (linha ~145)
    cfop            = Column(String(4), nullable=True)    # NOVO — mesmo tipo de Product.cfop (linha 160)
    cest            = Column(String(7), nullable=True)    # NOVO — mesmo tipo de Product.cest (linha 161), sem validação (paridade)
```

Nenhum `UniqueConstraint` de banco pro `ean` — mesmo motivo já documentado pro `sku` na linha 223:
`Option` não tem `company_id` direto, só via `join` com `OptionGroup`. A unicidade entra em
aplicação, ao lado da checagem de `sku` já existente (ver abaixo).

### Migration — `20260918_0901_ean_cfop_cest_em_opcao.py`

Encadeia a partir de `20260918_0900` (a da ORD-180, criada hoje mesmo — por isso o timestamp
`0901`, um minuto depois, e não uma data futura).

```python
"""ORD-188 (G1): Option ganha ean/cfop/cest — opções que representam produtos
reais (ex.: sabores de um refrigerante, cada um CFOP 5102 com EAN próprio)
passam a ter identidade fiscal própria, preparando o terreno pro controle de
estoque por opção (G2/G3). Sem UniqueConstraint de banco pro ean: Option não
tem company_id direto, unicidade é validada em aplicação (mesmo padrão já
usado pro sku, ver _set_option_group_options). Sem backfill.

Revision ID: 20260918_0901
Revises: 20260918_0900
Create Date: 2026-09-18 09:01:00

"""
import sqlalchemy as sa
from alembic import op

revision = "20260918_0901"
down_revision = "20260918_0900"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("options", sa.Column("ean", sa.String(14), nullable=True))
    op.add_column("options", sa.Column("cfop", sa.String(4), nullable=True))
    op.add_column("options", sa.Column("cest", sa.String(7), nullable=True))


def downgrade() -> None:
    op.drop_column("options", "cest")
    op.drop_column("options", "cfop")
    op.drop_column("options", "ean")
```

### Schema Pydantic — `OptionIn` (linha 1100) e `OptionOut` (linha 1108)

```python
class OptionIn(BaseModel):
    label: str
    price_delta: float = 0
    active: bool = True
    description: str | None = None
    sku: str | None = None
    ean: str | None = None    # NOVO
    cfop: str | None = None   # NOVO
    cest: str | None = None   # NOVO — sem validador, paridade com Product.cest
    allergen_ids: list[int] = []

    @field_validator("cfop")
    @classmethod
    def cfop_valid(cls, v: str | None) -> str | None:
        return _validate_cfop(v)   # reaproveita a função da linha 1274, tal como está

    @field_validator("ean")
    @classmethod
    def _empty_ean_to_none(cls, v: str | None) -> str | None:
        # mesmo racional do ProductIn (linha 1308): string vazia do formulário
        # vira None aqui no schema, não só no frontend — evita colisão de ""
        # contra "" na checagem de unicidade em aplicação abaixo.
        return v.strip() or None if v is not None else None

class OptionOut(BaseModel):
    id: int
    label: str
    price_delta: float
    image_url: str | None = None
    thumbnail_url: str | None = None
    sort_order: int | None = None
    active: bool = True
    description: str | None = None
    sku: str | None = None
    ean: str | None = None    # NOVO
    cfop: str | None = None   # NOVO
    cest: str | None = None   # NOVO
    allergens: list[AllergenOut] = []
```

Diferente de `ProductIn`/`ProductUpdate`, `Option` não precisa de uma checagem de checksum
(`_is_valid_gtin`) **no validator do Pydantic** — ela entra em `_set_option_group_options`, junto
com a checagem de duplicidade, pelo mesmo motivo que a duplicidade está lá: a validação de
unicidade só faz sentido com a lista inteira de opções do grupo em mãos, e colocar o checksum no
mesmo lugar evita duas passadas pela lista.

### `_set_option_group_options` (linha 476) — checagem de EAN ao lado da de SKU

```python
    skus = [opt.sku for opt in options if opt.sku]
    if len(skus) != len(set(skus)):
        raise HTTPException(400, detail="SKU já cadastrado para esta empresa")
    if skus:
        dup_result = await db.execute(
            select(Option.sku)
            .join(OptionGroup, OptionGroup.id == Option.option_group_id)
            .filter(OptionGroup.company_id == company_id, Option.option_group_id != option_group_id, Option.sku.in_(skus))
        )
        if dup_result.scalars().first() is not None:
            raise HTTPException(400, detail="SKU já cadastrado para esta empresa")

    # NOVO (ORD-188) — mesmo padrão acima, replicado pro ean. Checksum primeiro
    # (mais barato, sem ir ao banco) e só então a checagem de duplicidade.
    for opt in options:
        if opt.ean is not None and not _is_valid_gtin(opt.ean):
            raise HTTPException(400, detail="código de barras inválido")

    eans = [opt.ean for opt in options if opt.ean]
    if len(eans) != len(set(eans)):
        raise HTTPException(400, detail="código de barras já cadastrado para esta empresa")
    if eans:
        dup_ean_result = await db.execute(
            select(Option.ean)
            .join(OptionGroup, OptionGroup.id == Option.option_group_id)
            .filter(OptionGroup.company_id == company_id, Option.option_group_id != option_group_id, Option.ean.in_(eans))
        )
        if dup_ean_result.scalars().first() is not None:
            raise HTTPException(400, detail="código de barras já cadastrado para esta empresa")
```

`cfop` não precisa de checagem extra aqui — já é validado no `field_validator` do `OptionIn`
(contra `VALID_CFOP`), e por decisão fechada da Explorer não há regra de igualdade com o produto
pai, então não há nada além disso pra checar nesta função.

Na criação do `Option` (linha ~531), os 3 campos novos entram junto com os já existentes:

```python
        option = Option(
            option_group_id=option_group_id, label=opt.label, price_delta=opt.price_delta, sort_order=index,
            active=opt.active, description=opt.description, sku=opt.sku,
            ean=opt.ean, cfop=opt.cfop, cest=opt.cest,   # NOVO
        )
```

### Serialização de saída — `_get_option_group_options` (linha ~450-464)

```python
        {
            "id": o.id, "label": o.label, "price_delta": o.price_delta,
            "image_url": o.image_url, "thumbnail_url": o.thumbnail_url,
            "sort_order": o.sort_order, "active": o.active, "description": o.description,
            "sku": o.sku,
            "ean": o.ean, "cfop": o.cfop, "cest": o.cest,   # NOVO
            "allergens": await _get_option_allergens(db, o.id),
        }
```

### Caso de update/edição (lacuna apontada pelo QA) — resolvido por herança do padrão existente, não por código novo

Investigando `_set_option_group_options` (linha 476) confirma-se: **não existe update parcial de
`Option`**. O endpoint que a chama faz *replace completo* do grupo — deleta todas as opções
antigas (`DELETE ... WHERE option_group_id = ...`, linha 527) e recria do zero a partir da lista
enviada no payload inteiro. É o mesmo mecanismo que já existe pra `sku`/`active`/`allergen_ids`
hoje, não um caso novo introduzido por esta história.

Isso significa que o caso "EAN apagado vira null" que o QA pediu pra cobrir **não precisa de
tratamento especial tipo `model_fields_set`** (o problema que existiu em `update_product` com
`exclude_none=True`, ORD-180). Como cada `PUT` reconstrói a opção inteira a partir do `OptionIn`
recebido, uma opção editada sem o campo `ean` no payload simplesmente nasce com `ean=None` — não
há valor antigo pra "vazar" porque a linha antiga foi deletada. O cenário Gherkin do QA ainda vale
como teste de regressão (confirma esse comportamento na prática), só não implica uma linha de
código dedicada além do que já está no bloco de criação acima.

### Estimativa
**2 pontos**, confirmando a estimativa inicial da Explorer — mudança é aditiva, reaproveita 100%
da validação já testada (`_is_valid_gtin`, `_validate_cfop`), e o "caso de update" que poderia
inflar o escopo se resolve de graça pelo mecanismo de replace completo já existente.

### Riscos técnicos
1. **Concorrência na checagem de unicidade em aplicação** (já sinalizado pelo QA): mesma janela de
   corrida teórica que já existe hoje pro `sku` de `Option` — não é risco novo, é risco herdado.
   Sem action item nesta história; só registrar caso vire problema real em produção.
2. **CEST sem validação** é decisão deliberada de paridade com `Product`, não descuido — mas vale
   deixar comentado no código (como já é em `Product`, linha 158) pra não parecer omissão numa
   leitura futura.
3. **EAN duplicado entre `Option` e `Product`** (cross-entity) permanece não-tratado por esta
   história — pendência formal já registrada em `docs/estudo-modulo-estoque-erp.md`, dependente do
   desenho de C1.

## Ready
Passou pelas 3 rodadas de revisão (PM, QA, Backend SR). Sem dependências bloqueantes — pode ser
implementada imediatamente, em paralelo com A7/ORD-187.

- **PM**: aprovado após 2 ajustes — posicionamento exato na UI (`OptionGroupFormScreen.tsx`,
  citando linhas reais) e fortalecimento da nota sobre EAN cross-entity (`Option` × `Product`) como
  pendência formal nomeada pra C1, não um "decide depois" vago.
- **QA**: cenários Gherkin cobrindo happy path, checksum inválido, CFOP fora do conjunto, EAN
  duplicado (mesmo grupo, grupos diferentes, mesma empresa) e não-conflito entre empresas, CFOP
  livre em relação ao produto pai, e o caso explicitamente fora de escopo (EAN duplicado entre
  `Option` e `Product`, tratado como comportamento esperado, não bug). Apontou 3 lacunas: CEST sem
  validação (confirmado como paridade, não omissão), caso de update (resolvido no Tech Explorer —
  replace completo elimina a necessidade de tratamento especial), e risco de concorrência na
  checagem em aplicação (herdado do padrão já existente pro `sku`, não é risco novo).
- **Backend SR**: schema, migration (`20260918_0901`, encadeada a partir de `20260918_0900` da
  ORD-180), schema Pydantic e o ponto exato de inserção da checagem de EAN em
  `_set_option_group_options`, tudo reaproveitando `_is_valid_gtin` e `_validate_cfop` sem
  duplicar. Confirmou que o "caso de update" do QA não exige código dedicado, graças ao mecanismo
  de replace completo já existente. Estimativa mantida em 2 pontos.
