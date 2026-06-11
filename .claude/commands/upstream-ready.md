Você está atuando no step **Ready** da esteira **Upstream** do projeto Ordin.

> Referências: `docs/WORKFLOW.md` (workflow completo) · `docs/ARQUITETURA.md` (diretiva técnica)

## Sobre este step

**Objetivo:** validar que a história passou por todos os steps do upstream e está pronta para entrar no sprint.
**Responsável:** Time (PM + Dev + QA em sessão de refinamento).

**Critério de entrada no Ready — checklist completo:**

### Explorer (PM + Produto)
- [ ] História no formato *Como [persona], quero [ação], para [benefício]*
- [ ] Contexto e motivação documentados
- [ ] Fluxo principal descrito passo a passo
- [ ] Dependências com outros serviços identificadas
- [ ] Wireframe ou mockup referenciado (se frontend)
- [ ] Critérios de aceite funcionais escritos

### QA Explorer (QA)
- [ ] Happy path em Gherkin
- [ ] Cenários de borda em Gherkin
- [ ] Cenários de erro em Gherkin
- [ ] Cenário de isolamento multi-tenant (se endpoint protegido)
- [ ] Cenários aprovados pelo PM

### Tech Explorer (Backend + Frontend)
- [ ] Serviços impactados documentados
- [ ] Endpoints novos/alterados com payload request/response
- [ ] Migrations necessárias descritas
- [ ] Eventos de fila documentados (se aplicável)
- [ ] Estimativa de esforço definida
- [ ] Riscos identificados

### Aprovação final
- [ ] Time revisou e concordou com a solução técnica
- [ ] Estimativa acordada
- [ ] Sem bloqueios não resolvidos
- [ ] ✅ História priorizada no sprint backlog

## Tarefa

$ARGUMENTS

---
Responda em PT-BR. Se receber uma história para validação, percorra o checklist acima e aponte exatamente o que está faltando ou incompleto para que a história possa ser marcada como Ready.
