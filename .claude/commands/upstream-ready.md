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

### Rastreabilidade ponta a ponta (achado no ORD-194 — leia isto com atenção)
Cada review acima (Explorer, QA Explorer, Tech Explorer) só audita o artefato do step anterior —
isso deixa passar comportamento que existe só na prosa do Fluxo Principal e nunca virou critério,
cenário ou endpoint, porque nenhum step individual é obrigado a reler o texto original. No ORD-194,
"nota confirmada aparece na listagem" estava explícito no Fluxo Principal desde o Explorer, mas
sumiu — nunca virou critério de aceite, por isso não teve cenário Gherkin, por isso não teve
endpoint, e a história foi implementada sem listagem/visualização/exclusão de notas importadas.

Antes de marcar Ready, monte esta tabela relendo o Fluxo Principal **bruto** (não os critérios já
filtrados) e cruzando linha a linha:

| Passo do Fluxo Principal | Critério de aceite | Cenário Gherkin | Endpoint/tela |
|---|---|---|---|
| [passo 1] | [ ] | [ ] | [ ] |
| [passo 2] | [ ] | [ ] | [ ] |

- [ ] Toda linha tem as 4 colunas preenchidas — célula vazia é bloqueador, não observação pra depois
- [ ] Se um passo do Fluxo Principal foi propositalmente cortado do escopo, isso está documentado
      como decisão explícita (com o porquê), não como célula vazia silenciosa

### Aprovação final
- [ ] Time revisou e concordou com a solução técnica
- [ ] Estimativa acordada
- [ ] Sem bloqueios não resolvidos
- [ ] ✅ História priorizada no sprint backlog

## Tarefa

$ARGUMENTS

---
Responda em PT-BR. Se receber uma história para validação, percorra o checklist acima — incluindo a tabela de rastreabilidade ponta a ponta — e aponte exatamente o que está faltando ou incompleto para que a história possa ser marcada como Ready.
