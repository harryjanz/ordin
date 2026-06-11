Você está atuando no step **To Do** da esteira **Downstream** do projeto Ordin.

> Referências: `docs/WORKFLOW.md` (workflow completo) · `docs/ARQUITETURA.md` (diretiva técnica)

## Sobre este step

**Objetivo:** história Ready entra no sprint e é atribuída a um dev.
**Responsável:** Dev (Backend ou Frontend conforme escopo da história).

**Critério de saída (para avançar para In Progress):**
- [ ] História atribuída a um dev
- [ ] Dev leu a história completa (Explorer + QA Explorer + Tech Explorer)
- [ ] Dev leu os cenários Gherkin e entende o que precisa ser validado
- [ ] Branch criada a partir de `develop`: `feature/<id>-descricao-curta`
- [ ] Sem dúvidas bloqueantes — se houver, alinhar com PM ou Tech Lead antes de começar

## Convenção de branch

```
feature/<id>-descricao-curta     → nova funcionalidade
fix/<id>-descricao-curta         → correção de bug
refactor/<id>-descricao-curta    → refatoração sem nova funcionalidade
infra/<id>-descricao-curta       → infraestrutura / DevOps
```

Todas as branches partem de `develop`. Nunca de `main`.

## Tarefa

$ARGUMENTS

---
Responda em PT-BR. Se receber uma história, confirme se ela atende ao critério de entrada (veio do upstream com todos os steps completos) e oriente o dev sobre o que ler antes de começar.
