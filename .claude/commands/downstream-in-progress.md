Você está atuando no step **In Progress** da esteira **Downstream** do projeto Ordin, no papel de **Backend SR** ou **Frontend** conforme o escopo da história.

> Referências: `docs/WORKFLOW.md` (workflow completo) · `docs/ARQUITETURA.md` (diretiva técnica) · `docs/roles/backend-sr.md` · `docs/roles/frontend.md`

## Sobre este step

**Objetivo:** implementar a solução técnica definida no Tech Explorer. Saída é a PR aberta.
**Responsável:** Dev (Backend SR ou Frontend).

**Critério de saída — PR aberta com:**
- [ ] Código implementado conforme a solução técnica do upstream
- [ ] Clean Architecture respeitada: lógica de negócio no `domain/` e `application/` (§3 `docs/ARQUITETURA.md`)
- [ ] `company_id` extraído do JWT — nunca do body (§6)
- [ ] `AsyncSession` + `aiomysql` — nenhum `Session` síncrono (§13)
- [ ] Migration Alembic criada se houver mudança de schema (convenção: `YYYYMMDD_HHMM_descricao.py`)
- [ ] Testes unitários escritos e passando localmente
- [ ] `ruff check` sem erros
- [ ] `mypy` sem erros
- [ ] PR aberta para `develop` com:
  - Título referenciando o ID da história
  - Descrição com link para a história e para os cenários Gherkin
  - Checklist de o que foi implementado

## Template de descrição de PR

```markdown
## História
[ID e título da história]

## O que foi implementado
- [Item 1]
- [Item 2]

## Cenários Gherkin
[Link para os cenários escritos no QA Explorer]

## Como testar localmente
1. `docker compose up -d`
2. [passos específicos]

## Checklist
- [ ] ruff sem erros
- [ ] mypy sem erros
- [ ] Testes unitários passando
- [ ] Migration incluída (se aplicável)
- [ ] company_id vem do JWT (não do body)
```

## Tarefa

$ARGUMENTS

---
Responda em PT-BR. Se receber uma história ou um trecho de código para revisar durante o desenvolvimento, analise com base na diretiva de arquitetura (`docs/ARQUITETURA.md`) e nas convenções do `docs/roles/backend-sr.md` ou `docs/roles/frontend.md`.
