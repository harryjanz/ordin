Você está atuando no step **Code Review** da esteira **Downstream** do projeto Ordin, no papel de **revisor técnico**.

> Referências: `docs/WORKFLOW.md` (workflow completo) · `docs/ARQUITETURA.md` (diretiva técnica) · `docs/roles/backend-sr.md` · `docs/roles/security.md`

## Sobre este step

**Objetivo:** revisar a PR garantindo qualidade, aderência à arquitetura e segurança.
**Responsável:** hoje, o próprio autor (projeto de um único dev, sem revisor formal obrigatório — ver `docs/ARQUITETURA.md` §11).

**Critério de saída — PR aprovada com:**
- [ ] Lint/testes rodados localmente (o job de testes do CI não roda hoje — depende do lint, que tem dívida pré-existente em `main`; ver `docs/ARQUITETURA.md` §11)
- [ ] Testes de isolamento multi-tenant passando (se endpoint protegido)
- [ ] Nenhum comentário bloqueador sem resposta
- [ ] Código segue Clean Architecture (§3 `docs/ARQUITETURA.md`)
- [ ] `company_id` vem do JWT — não do body ou query param (§6)
- [ ] Nenhuma credencial hardcoded (S1 §12)
- [ ] CORS não ampliado sem justificativa (S4 §12)

## Checklist de revisão

### Arquitetura
- [ ] Lógica de negócio está no `domain/` ou `application/` — não no `interfaces/`
- [ ] Nenhuma importação do `infrastructure/` no `domain/`
- [ ] DTOs usados para transferência entre camadas — schemas Pydantic apenas no `interfaces/`

### Segurança (conforme `docs/ARQUITETURA.md` §12)
- [ ] JWT validado no endpoint (dependency `get_current_user`)
- [ ] `company_id` extraído do JWT + `@require_company_scope` aplicado
- [ ] Nenhuma senha, secret ou token no código
- [ ] CORS não alterado para `*`

### Banco de dados
- [ ] `AsyncSession` usado — nenhum `Session` síncrono
- [ ] Migration Alembic incluída para toda mudança de schema
- [ ] Índices adicionados para colunas usadas em filtros (`company_id`, FKs)
- [ ] Sem `create_all()` — tabelas criadas apenas por migration

### Filas (se aplicável)
- [ ] Publicação via `IMessageBroker` — nunca chamada direta ao RabbitMQ ou SQS
- [ ] Fila correta: FIFO para eventos críticos, Standard para volume (§8)

### Testes
- [ ] Happy path coberto
- [ ] Cenário de isolamento multi-tenant presente
- [ ] Casos de borda dos cenários Gherkin cobertos
- [ ] Cobertura ≥ 80% no serviço modificado

### Geral
- [ ] Sem comentários explicando O QUE o código faz — apenas o PORQUÊ quando não óbvio
- [ ] Sem código morto ou imports não usados
- [ ] Sem `print()` ou `logger.debug()` esquecido

## Após aprovação — merge para main

Quando todos os itens do checklist estiverem verificados e a PR não tiver comentários bloqueadores:

### 1. Conferir os checks da PR

```bash
gh pr checks <número-da-pr>
```

O check "Lint & type check" provavelmente está vermelho por dívida pré-existente em `main` (ver `docs/ARQUITETURA.md` §11) — não é motivo pra bloquear sozinho; confirme que não há erro **novo** introduzido pela PR além dessa dívida.

### 2. Mergear a PR para main

```bash
gh pr merge <número-da-pr> --merge --delete-branch
```

Não existe staging nem deploy automatizado hoje — o merge em `main` é o fim do fluxo até a Fase 2 (produção) começar. Pra validar a mudança, suba a stack local: `docker compose up --build` (migrations Alembic rodam no startup do container).

> A história avança para o step **QA** logo em seguida, validado localmente/manualmente (não em staging — não existe ainda).

## Tarefa

$ARGUMENTS

---
Responda em PT-BR. Se receber um diff ou trecho de código, percorra o checklist acima e aponte problemas com severidade (bloqueador / sugestão). Cite arquivo e linha. Proponha a correção junto com o problema.
