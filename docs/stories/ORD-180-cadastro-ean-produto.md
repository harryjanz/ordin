---
id: ORD-180
status: Ready
estimativa: 1 ponto (backend + frontend)
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-180 — Cadastro de EAN / código de barras no produto

## Descrição
Primeira história (**A1**) do épico de estoque/ERP (`docs/estudo-modulo-estoque-erp.md`, Bloco A —
Fundação). Hoje o `Product` já tem `sku` (ORD-169), mas é um campo de preenchimento livre, sem
relação com nenhum código real de fornecedor ou código de barras — serve só como identificador
interno da empresa no catálogo. Esta história adiciona um campo **novo e distinto**: `ean`, o
código de barras real do produto (GTIN-8/12/13/14), que futuramente (história **C1** do mesmo
épico) será usado pra casar automaticamente itens de XML de nota fiscal de compra contra produtos
já cadastrados. Sem escopo de estoque, XML ou vínculo automático aqui — só o campo e a validação.

## Persona
**Empresa** (owner/manager/admin que cadastra produtos no catálogo) — mesma persona de
`ProductEditScreen.tsx`.

## Explorer

### História
Como **Empresa**, quero cadastrar o código de barras (EAN) de um produto, além do SKU que já
existe, para no futuro permitir que o sistema vincule automaticamente itens de notas fiscais de
compra a esse produto.

### Decisão de escopo
- Campo novo `ean` em `Product` — **distinto de `sku`**: `sku` é identificador interno de livre
  escolha da empresa; `ean` é o código de barras real (GTIN) impresso na embalagem/usado pelo
  fornecedor, com formato e checksum padronizados.
- Nullable — produto sem EAN continua funcionando exatamente como hoje (campo 100% opcional).
- Único por empresa (`UniqueConstraint("company_id", "ean")`), mesmo padrão já usado por `sku`
  (`services/catalog/main.py:131`) — evita dois produtos da mesma empresa reivindicando o mesmo
  código de barras, o que quebraria o vínculo automático da C1 mais tarde.
- Aceita GTIN-8, GTIN-12 (UPC-A) ou GTIN-13/14 — só dígitos, validado por checksum (dígito
  verificador padrão GTIN), mesmo nível de rigor já aplicado ao CPF no totem (`isValidCpf`,
  `frontend/totem/src/lib/cpf.ts`). EAN com checksum inválido é rejeitado no cadastro, não só
  avisado.
- **Fora de escopo** (fica pras próximas histórias do épico): nenhuma lógica de estoque, nenhum
  parsing de XML, nenhum vínculo automático — só o campo, a validação e a exibição no formulário.

### Fluxo principal
1. Empresa abre o formulário de edição/criação de um produto (`ProductEditScreen.tsx`).
2. Preenche o campo "EAN / código de barras" (opcional), **na seção "Detalhes" (linha 580), ao
   lado do campo SKU já existente (linha 590-596)** — não na seção "Classificação fiscal" (linha
   638, onde vivem NCM/CFOP/CEST). Motivo: EAN é conceitualmente um identificador de produto, como
   SKU, não uma classificação fiscal.
3. Salva — se o EAN informado for numericamente válido (checksum GTIN) e não estiver em uso por
   outro produto da mesma empresa, o produto é salvo normalmente.

### Posicionamento no formulário (fechando a lacuna apontada na revisão de PM)
A seção "Detalhes" hoje tem uma `formRow` com 2 campos lado a lado: "Calorias (kcal)" e "SKU"
(linhas 581-597). O campo EAN entra como um **terceiro campo na mesma `formRow`** — se o layout de
grid não comportar 3 colunas de forma legível, abrir uma segunda `formRow` logo abaixo só com o
campo EAN, mantendo-o na seção "Detalhes", nunca em "Classificação fiscal". Rótulo: "EAN / código
de barras", `placeholder="Opcional"` (mesmo tom do placeholder já usado no SKU, "Opcional, único
por empresa").

### Fluxos alternativos / exceções
- **EAN com checksum inválido**: formulário bloqueia o salvamento com mensagem clara ("código de
  barras inválido"), mesmo padrão de erro inline já usado no CPF do totem.
- **EAN duplicado na mesma empresa**: erro 409 do backend, mensagem indicando qual produto já usa
  aquele código.
- **EAN duplicado entre empresas diferentes**: permitido — cada empresa é escopo independente
  (mesmo princípio de multi-tenancy de `sku`).
- **Produto sem EAN**: comportamento idêntico ao de hoje, nenhuma mudança.

### Dependências
- **Nenhuma bloqueante** — é a primeira história do épico, sem dependência de outra história ainda
  não implementada.
- Histórias futuras do mesmo épico que vão **consumir** este campo: C1 (vínculo automático por
  EAN/`cProd`) e B1 indiretamente (o XML de compra traz `cEAN` a ser comparado contra este campo).

### Critérios de aceite funcionais
- [ ] `Product` aceita `ean` opcional, único por `company_id`
- [ ] EAN com checksum GTIN inválido é rejeitado no cadastro (backend e frontend)
- [ ] Dois produtos da mesma empresa não podem ter o mesmo EAN
- [ ] Dois produtos de empresas diferentes podem ter o mesmo EAN, sem conflito
- [ ] Produto sem EAN continua sendo criado/editado normalmente

## QA Explorer

### Cenários Gherkin

```gherkin
Feature: Cadastro de EAN no produto
  Como Empresa
  Quero cadastrar o código de barras do produto
  Para permitir vínculo automático futuro com notas fiscais de compra

  Scenario Outline: EAN válido aceito em todos os comprimentos GTIN suportados
    Dado um produto existente sem EAN
    Quando informo o código "<codigo>" (GTIN-<tamanho>, checksum correto)
    Então o produto é salvo com o EAN informado

    Examples:
      | tamanho | codigo         |
      | 8       | 96385074       |
      | 12      | 036000291452   |
      | 13      | 7891000100103  |
      | 14      | 17891000100100 |

  Scenario: EAN com checksum inválido é rejeitado
    Dado um produto existente
    Quando informo um código de barras com dígito verificador incorreto
    Então o salvamento é bloqueado com mensagem "código de barras inválido"

  Scenario: Comprimento fora do padrão GTIN é rejeitado
    Dado um produto existente
    Quando informo um código numérico com 10 dígitos (nem 8, 12, 13 nem 14)
    Então o salvamento é bloqueado com mensagem "código de barras inválido"

  Scenario: Campo EAN apagado (string vazia) é tratado como ausente
    Dado um produto com EAN já cadastrado
    Quando o campo EAN é apagado e o formulário é salvo
    Então o produto é salvo com ean=null, sem erro de validação, mesmo padrão já usado em `cest`
    (`ProductEditScreen.tsx:449`)

  Scenario: EAN duplicado na mesma empresa
    Dado um produto A da empresa X já cadastrado com EAN "7891000100103"
    Quando tento salvar um produto B da mesma empresa X com o mesmo EAN
    Então o backend retorna 400 "código de barras já cadastrado para esta empresa" (mesmo padrão
    e status já usado hoje pro conflito de SKU, `services/catalog/main.py:1874`)

  Scenario: Mesmo EAN em empresas diferentes não conflita
    Dado um produto da empresa X cadastrado com EAN "7891000100103"
    Quando um produto da empresa Y é salvo com o mesmo EAN
    Então ambos os produtos são salvos sem erro

  Scenario: Produto sem EAN continua funcionando
    Dado um produto sem EAN cadastrado
    Quando o produto é salvo sem alterar o campo EAN
    Então nenhum erro ocorre e o produto é salvo normalmente
```

### Critérios de aceite testáveis
- [ ] Checksum GTIN validado corretamente para 8, 12, 13 e 14 dígitos (Scenario Outline)
- [ ] Comprimento fora do padrão (nem 8/12/13/14) rejeitado com mensagem clara
- [ ] String vazia tratada como `ean=null`, mesmo padrão já usado em `cest`
- [ ] Conflito de EAN só é bloqueado dentro da mesma empresa
- [ ] Campo opcional não quebra nenhum fluxo existente de criação/edição de produto

### Confirmações da revisão de QA (não pendências, registro explícito)
- **Isolamento multi-tenant**: não precisa de teste dedicado novo — reaproveita `PUT /products/{id}`
  já existente e já coberto pelo isolamento padrão do catalog-service; o cenário "mesmo EAN em
  empresas diferentes não conflita" já basta pra provar o escopo correto do `UniqueConstraint`.
- **Concorrência**: risco real mas de frequência baixíssima (não é hot path) — o `UniqueConstraint`
  do banco é rede de segurança suficiente, desde que a violação vire 409 tratado (`IntegrityError`
  capturado), não 500 cru. Sem teste de concorrência dedicado nesta história.

### O que ainda impede o avanço pro Tech Explorer
Nada bloqueante — revisão de QA aprovada com os 2 cenários adicionais incorporados.

## Tech Explorer

### Serviços impactados
- **catalog-service** (`services/catalog/main.py`): novo campo em `Product`, migration nova,
  validação de checksum, exposição em `ProductIn`/`ProductOut`.
- **frontend/admin** (`ProductEditScreen.tsx`): novo campo de formulário, mesmo padrão do `sku`.

### Mudança no model (`services/catalog/main.py`)
```python
# linha 131 — UniqueConstraint ganha uma segunda tupla
__table_args__ = (
    UniqueConstraint("company_id", "sku", name="uq_products_company_sku"),
    UniqueConstraint("company_id", "ean", name="uq_products_company_ean"),
)

# logo após a linha 145 (sku)
ean = Column(String(14), nullable=True)  # GTIN-8/12/13/14 — ORD-180
```

### Validação de checksum (nova função, mesmo racional de `_validate_ncm_exists`, linha 829)
```python
def _is_valid_gtin(code: str) -> bool:
    if not code.isdigit() or len(code) not in (8, 12, 13, 14):
        return False
    digits = [int(d) for d in code[:-1]]
    check = int(code[-1])
    total = sum(d * (3 if i % 2 == (len(digits) - 1) % 2 else 1) for i, d in enumerate(reversed(digits)))
    return (10 - total % 10) % 10 == check
```
Chamada em `create_product`/`update_product`, antes do commit — mesmo ponto onde `_validate_ncm_exists`
já é chamado hoje, levantando `HTTPException(400, detail="código de barras inválido")`.

### Tratamento de `IntegrityError` — achado da revisão de backend
O padrão já existente (`create_product` linha 1872, `update_product` linha 1948) captura
`IntegrityError` genericamente e sempre responde "SKU já cadastrado" — reaproveitar como está
mostraria a mensagem errada quando é o **EAN** que colide, não o SKU. Precisa distinguir pela
mensagem do erro original:
```python
try:
    await db.commit()
except IntegrityError as e:
    await db.rollback()
    if "uq_products_company_ean" in str(e.orig):
        raise HTTPException(400, detail="código de barras já cadastrado para esta empresa")
    raise HTTPException(400, detail="SKU já cadastrado para esta empresa")
```
Status **400** (não 409) — segue o padrão já em produção pro conflito de SKU, não introduz uma
convenção nova de status code pra este mesmo tipo de erro dentro do mesmo arquivo.

### Schemas — com normalização defensiva de string vazia
`cest` não tem `UniqueConstraint`, então confia só no frontend pra normalizar string vazia
(`cest.trim() || null`, `ProductEditScreen.tsx:449`). `ean` **tem** `UniqueConstraint`, então uma
string vazia vinda de qualquer chamador (bug de frontend, API direta, app futuro) colidiria com
outra string vazia — `NULL` é ignorado por unique constraints, string vazia não. Por isso o backend
normaliza também, não só o frontend:
```python
# ProductIn e ProductUpdate
ean: str | None = None

@field_validator("ean")
@classmethod
def _empty_ean_to_none(cls, v: str | None) -> str | None:
    return v.strip() or None if v is not None else None
```
- `ProductOut` (linha 1224, ao lado de `sku`): `ean: str | None = None` (sem validator, é só leitura)

### Migration
Nova em `services/catalog/migrations/versions/`, convenção `YYYYMMDD_HHMM_ean_produto.py`:
adiciona coluna `ean` (nullable) + índice único composto `(company_id, ean)`. Sem backfill — produto
existente fica com `ean=NULL` até a empresa preencher.

### Frontend (`ProductEditScreen.tsx`)
Mesmo padrão de `sku` (linhas 81, 168, 443, 591-594): campo no tipo local, no `useState` inicial,
no payload de save, e um novo `InputBase` **na seção "Detalhes" (linha 580), na mesma `formRow` do
SKU (linhas 581-597) — nunca na seção "Classificação fiscal" (linha 638)**, ver posicionamento
detalhado na seção Explorer acima. Validação de checksum no `onChange` (reaproveitando o mesmo
racional de `frontend/totem/src/lib/cpf.ts`, mas para GTIN) pra dar erro inline antes mesmo de
tentar salvar.

### Riscos
- Função de checksum precisa de teste unitário cobrindo os 4 comprimentos válidos (8, 12, 13, 14
  dígitos), não só o caso comum de 13 — já refletido nos cenários Gherkin (Scenario Outline).
- **Colisão de string vazia na `UniqueConstraint`** (achado da revisão de backend): mitigado pelo
  `field_validator` que normaliza `""` → `None` no schema, além do trim já feito no frontend —
  defesa em duas camadas, não só uma.
- Reaproveitar o `except IntegrityError` genérico sem distinguir a constraint mostraria a mensagem
  de erro errada pro EAN — mitigado verificando o nome da constraint na mensagem do erro original.

### O que ainda impede o avanço pro Ready
Nada bloqueante.

## Ready

Upstream repassado formalmente por papel (PM, QA, backend), não só autodeclarado — cada fase achou
e corrigiu pelo menos um problema real antes de aprovar a passagem pra próxima:

**Explorer:** [x] história · [x] decisão de escopo (campo novo, distinto de `sku`, opcional, único
por empresa) · [x] fluxo principal · [x] dependências (nenhuma bloqueante) · [x] critérios de
aceite. **Revisão de PM**: achou a falta de posicionamento do campo no formulário (critério de
wireframe/mockup do Explorer) — corrigido com a localização exata (seção "Detalhes", ao lado do
SKU, nunca em "Classificação fiscal").

**QA Explorer:** [x] happy path · [x] borda (checksum inválido) · [x] borda (comprimento fora do
padrão GTIN) · [x] borda (string vazia tratada como ausente) · [x] borda (duplicado na mesma
empresa) · [x] borda (mesmo EAN em empresas diferentes, sem conflito) · [x] cenários aprovados.
**Revisão de QA**: achou que o checksum só tinha cenário pra 1 comprimento (virou Scenario Outline
com os 4 GTINs válidos) e faltava o caso de string vazia — ambos incorporados.

**Tech Explorer:** [x] serviços impactados (catalog-service + frontend) · [x] mudança de código
detalhada (model, validação, schema, migration, frontend) · [x] riscos identificados e mitigados.
**Revisão de backend**: achou que reaproveitar o `except IntegrityError` genérico mostraria mensagem
errada pra conflito de EAN (corrigido distinguindo pela constraint) e que a normalização de string
vazia pedida pelo QA precisa existir também no backend, não só no frontend, por causa do
`UniqueConstraint` que o `cest` não tem (corrigido com `field_validator`).

**Status: Ready.** Primeira história do épico de estoque/ERP, escopo mínimo e isolado, upstream
repassado por 3 papéis com achados reais incorporados — pode entrar no sprint assim que o usuário
priorizar.
