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
- [ ] PR aberta para `main` com:
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

## Commit ao final do desenvolvimento

Ao finalizar a implementação, antes de abrir a PR, execute os passos abaixo na ordem:

### 1. Atualizar o Swagger (obrigatório se a história criar ou modificar endpoints)

```bash
cd services/<nome-do-servico>
python3 generate_openapi.py
# inclui o openapi.json atualizado no commit abaixo
```

O `generate_openapi.py` importa o app FastAPI e regenera `openapi.json`. Executar de dentro do diretório do serviço com as dependências instaladas (ou via `docker exec`):

```bash
docker exec ordin-<nome>-service-1 sh -c "cd /app && python3 generate_openapi.py"
docker cp ordin-<nome>-service-1:/app/openapi.json services/<nome>/openapi.json
```

### 2. Commitar as alterações

```bash
# Adicionar apenas os arquivos da história (evitar .env e arquivos não relacionados)
git add services/<nome>/main.py
git add services/<nome>/openapi.json        # se API foi alterada
git add services/<nome>/migrations/         # se schema foi alterado

# Commit em PT-BR descrevendo o porquê (não o que)
git commit -m "feat(<serviço>): <descrição do porquê da mudança>"
```

**Convenção de mensagem de commit:**
- Prefixo: `feat`, `fix`, `refactor`, `infra`, `docs`
- Escopo: nome do serviço (ex: `auth`, `order`, `payment`)
- Corpo: descreve a motivação, não a implementação

### 3. Abrir a PR

```bash
gh pr create \
  --title "feat(ORD-XXX): <título da história>" \
  --body "$(cat <<'EOF'
## História
[ID e título]

## O que foi implementado
- [Item 1]
- [Item 2]

## Cenários Gherkin
[Link para os cenários do QA Explorer]

## Como testar localmente
1. `docker compose up -d`
2. [passos específicos]

## Checklist
- [ ] ruff sem erros
- [ ] mypy sem erros
- [ ] Testes unitários passando
- [ ] Migration incluída (se aplicável)
- [ ] openapi.json atualizado (se API alterada)
- [ ] company_id vem do JWT (não do body)
EOF
)" \
  --base main
```

## Tarefa

$ARGUMENTS

---
Responda em PT-BR. Se receber uma história ou um trecho de código para revisar durante o desenvolvimento, analise com base na diretiva de arquitetura (`docs/ARQUITETURA.md`) e nas convenções do `docs/roles/backend-sr.md` ou `docs/roles/frontend.md`.
