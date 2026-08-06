---
id: ORD-068
status: Done
fase: 5
sprint: null
responsavel: Backend SR / Frontend
estimativa: 5 pontos
---

# ORD-068 — Endereço: cidade com limite maior + UF vira ENUM (banco) e select (front)

## Descrição
Duas mudanças relacionadas ao endereço da empresa, pedidas juntas pelo usuário:
1. `companies.city` estava `VARCHAR(80)` — insuficiente para nomes de cidade com mais de 250 caracteres que o usuário precisa suportar. Ampliado para `VARCHAR(255)`.
2. `companies.state` (UF) vira `ENUM` das 27 siglas de estado brasileiro, `NOT NULL` no banco — e, como consequência direta no front, o campo deixa de ser um `<input>` de texto livre (2 caracteres, maiúsculo) e vira um `<select>` com as 27 opções, tanto no cadastro quanto na edição.

> **Nota de processo:** história escrita retroativamente. As duas partes (backend e frontend) foram pedidas em mensagens separadas do usuário na mesma sessão, mas formam uma única história de produto — não passaram pelo fluxo upstream (Explorer → QA Explorer → Tech Explorer → Ready) antes de serem codadas.

## Persona
**Super admin** cadastrando ou editando uma empresa — hoje pode digitar uma UF inválida (ex: "XX") sem nenhum feedback até tentar salvar; e cidades com nome longo eram truncadas/rejeitadas pelo limite antigo do banco.

## Contexto

### Decisão de backfill (confirmada com o usuário)
As 3 empresas seed (Burger House, Pasta & Co, Sweet Corner) estavam com `state` `NULL` — sem isso resolvido, o `ALTER COLUMN ... NOT NULL` falharia. Opções apresentadas: (a) `SP` como placeholder pras 3, (b) usuário informa valores reais, (c) adiar o `NOT NULL`. **Escolhida a opção (a)** — são dados fictícios de demo, sem endereço real cadastrado.

### Decisão de tipo cross-dialect
Tentativa inicial usou `sqlalchemy.dialects.mysql.ENUM` diretamente — funciona no MySQL real, mas **não compila contra SQLite** (usado pela suíte de testes via `conftest.py`, `DB_URL=sqlite+aiosqlite:///:memory:`), gerando `sqlalchemy.exc.CompileError: can't render element of type ENUM` em ~130 testes. Trocado para `sqlalchemy.Enum` genérico (`sa.Enum(*UF_VALUES, name="uf_enum")`), que compila como `ENUM(...)` nativo no MySQL (exatamente a DDL pedida) e como `VARCHAR` + `CHECK` no SQLite — mesma definição de coluna funciona nos dois dialetos.

### Impacto em cascata nos testes existentes
Tornar `state` obrigatório em `CompanyIn` quebrou ~28 chamadas de teste em 7 arquivos que criavam empresa sem informar `state` (ORD-056, 057, 058, 059, 061, 064, 065 e `test_coverage.py`/`test_isolation.py`/`test_company.py`/`test_audit.py`). Um caso notável: testes que esperavam `403` (`test_create_company_owner_forbidden`) passaram a receber `422` primeiro, porque a validação do Pydantic Body acontece **antes** do código do endpoint rodar (`_require_superadmin` nunca era alcançado) — todos corrigidos para incluir `"state": "SP"` no payload.

## Explorer

### Fluxo principal
1. Backend: `city` aceita até 255 caracteres; `state` só aceita uma das 27 siglas válidas, e é obrigatório na criação (`POST /companies`)
2. Frontend: campo UF vira `<select>` com as 27 opções, no wizard de cadastro (`NewCompanyScreen`) e na tela de edição (`CompanyContractScreen`)

### Critérios de aceite
- [x] `city` aceita string de 238+ caracteres sem erro de truncamento
- [x] `state` com UF fora da lista retorna 422 com mensagem clara
- [x] `POST /companies` sem `state` retorna 422 (campo obrigatório)
- [x] Campo UF no front é `<select>`, não input livre, no cadastro e na edição
- [x] E2E que preenchia UF com `.fill()` atualizado para `.selectOption()`

## QA Explorer

```gherkin
Feature: Endereço — cidade maior e UF validada

  Scenario: Cidade aceita nome longo
    Quando crio uma empresa com city de 238 caracteres
    Então o cadastro é aceito sem truncamento

  Scenario: UF inválida é rejeitada
    Quando tento cadastrar empresa com state="XX"
    Então recebo 422 "UF inválida — deve ser uma sigla de estado brasileiro"

  Scenario: UF em branco é rejeitada na criação
    Quando tento cadastrar empresa sem informar state
    Então recebo 422 (campo obrigatório)

  Scenario: Campo UF é select, não texto livre
    Dado que estou no wizard de cadastro, passo Endereço
    Então o campo UF é um dropdown com as 27 siglas, não um input de texto
```

Validado via API real (curl com UF válida/inválida, cidade de 238 chars direto no MySQL) e via suíte automatizada — 168/168 testes backend, 47/47 testes unitários frontend, `tsc --noEmit` limpo.

## Tech Explorer

### Serviços impactados
- **`services/company/domain/address.py`** — `UF_VALUES` (tupla das 27 siglas) + `is_valid_uf()`
- **`services/company/main.py`** — coluna `city` (255) e `state` (`Enum`, `nullable=False`); `CompanyIn.state` obrigatório com validador; `CompanyUpdate.state` opcional mas validado quando enviado
- **`services/company/migrations/versions/20260806_1400_expand_city_uf_enum.py`** — nova migration
- **7 arquivos de teste** — payloads/fixtures atualizados com `"state": "SP"`
- **`frontend/admin/src/lib/validators.ts`** — `UF_VALUES` espelhando o backend
- **`frontend/admin/src/screens/NewCompanyScreen.tsx`** — campo UF vira `<select>`
- **`frontend/admin/src/screens/CompanyContractScreen.tsx`** — campo UF (edição) vira `<select>`
- **`frontend/admin/e2e/cadastro-cliente.spec.ts`** — `.fill("SP")` → `.selectOption("SP")`

### Migration
```python
def upgrade() -> None:
    op.alter_column("companies", "city", existing_type=sa.String(80), type_=sa.String(255), existing_nullable=True)
    op.execute("UPDATE companies SET state = 'SP' WHERE state IS NULL")
    op.alter_column("companies", "state", existing_type=sa.String(2), type_=sa.Enum(*_UF_VALUES, name="uf_enum"), nullable=False)
```

### Testes
- Backend: 168/168 (suíte completa, incluindo os 28 pontos de ajuste retroativo)
- Frontend: 47/47 unitários + `tsc --noEmit` limpo

### Riscos
- `CompanyUpdate.state` continua opcional (não quebra edições parciais que não tocam endereço) — só valida contra a lista de UFs *quando* um valor é enviado.
- Nenhum dado de produção real afetado — mudança testada só contra a base de dev local.

### Estimativa
5 pontos — schema change com NOT NULL exigiu backfill, mudança cross-dialect (MySQL/SQLite) e correção em cascata de ~28 pontos de teste.

---

## Ready

**Explorer:** [x] decisão de backfill confirmada com o usuário, tipo cross-dialect resolvido · **QA Explorer:** [x] validado via API real e suíte completa (168+47 testes) · **Tech Explorer:** [x] migration, validação Pydantic, cascata de testes corrigida, front atualizado · **Aprovação final:** aprovado no chat pelo usuário em cada etapa (backend, depois front).

**Status: Done** — aplicado, testado e em produção local. História escrita retroativamente.
