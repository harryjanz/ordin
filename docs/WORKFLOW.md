# Workflow — Ordin

Duas esteiras independentes com handoff no **Ready → To Do**.

---

> **Regra inviolável: nenhuma história é implementada sem estar `Ready`.**
>
> Toda história deve percorrer o upstream completo antes de qualquer linha de código ser escrita:
>
> ```
> [ New ] → [ Explorer ] → [ QA Explorer ] → [ Tech Explorer ] → [ Ready ]
> ```
>
> Isso vale sem exceção — inclusive para histórias "simples" ou "urgentes". O upstream existe para evitar retrabalho, não para atrasar. Se uma história parece óbvia demais para precisar de upstream, o upstream leva 15 minutos e confirma isso.
>
> **O que significa estar `Ready`:**
> - User story documentada (Como / Quero / Para)
> - Critérios de aceitação escritos e aprovados
> - Solução técnica definida (endpoints, schemas, impacto em outros serviços)
> - Estimativa acordada
> - Sem bloqueadores abertos
>
> **Quando uma história não está Ready e alguém quer implementar:** rodar o upstream primeiro, apresentar ao time para aprovação em cada fase, só então codar.

---

---

## Esteira Upstream — Discovery até Ready

O objetivo do upstream é garantir que nenhuma história entre no sprint sem estar completamente entendida, testável e com solução técnica definida.

```
[ New ] → [ Explorer ] → [ QA Explorer ] → [ Tech Explorer ] → [ Ready ]
```

### New
**O que acontece:** história criada com ao menos a descrição do que precisa ser feito.
**Responsável:** qualquer membro do time pode abrir.
**Critério de saída:** título + descrição mínima do problema ou necessidade escritos.

---

### Explorer
**O que acontece:** aprofundamento da história — descrição mais detalhada, contexto de negócio, personas afetadas, fluxos envolvidos, dependências com outros serviços.
**Responsável:** PM + Produto.
**Critério de saída:**
- História no formato *Como [persona], quero [ação], para [benefício]*
- Contexto e motivação documentados
- Dependências de outros serviços ou histórias identificadas
- Wireframe ou mockup anexado (se frontend)

---

### QA Explorer
**O que acontece:** QA lê a história e cria os cenários de teste em Gherkin (Given/When/Then). Os cenários passam a ser o contrato de aceite da história.
**Responsável:** QA.
**Critério de saída:**
- Happy path coberto em Gherkin
- Cenários de borda e erro documentados
- Cenários revisados e aprovados pelo PM

---

### Tech Explorer
**O que acontece:** Backend e/ou Frontend analisam a história e definem a solução técnica: endpoints a criar/alterar, schemas de banco, contratos de API, impacto em outros serviços.
**Responsável:** Backend SR + Frontend (conforme escopo da história).
**Critério de saída:**
- Solução técnica documentada na história (endpoints, payloads, migrations necessárias)
- Estimativa de esforço definida
- Riscos técnicos identificados
- Sem bloqueios não resolvidos

---

### Ready
**O que acontece:** história revisada e aprovada pelo time em sessão de refinamento. Entra no sprint backlog priorizado.
**Responsável:** Time (PM + Dev + QA).
**Critério de saída:**
- Todos os campos anteriores preenchidos
- Estimativa acordada
- História priorizada no backlog
- ✅ Pode entrar no próximo sprint

---

## Esteira Downstream — Sprint até Deploy

O downstream começa quando uma história **Ready** é puxada para o sprint. O objetivo é entregar com qualidade e rastreabilidade até o deploy em produção.

```
[ To Do ] → [ In Progress ] → [ Code Review ] → [ QA ] → [ Deploy ]
```

### To Do
**O que acontece:** história entra no sprint, dev pega para desenvolver.
**Responsável:** Dev (Backend ou Frontend conforme escopo).
**Critério de saída:**
- História atribuída a um dev
- Branch criada a partir de `develop` com nome `feature/<id>-descricao`
- Dev leu a história, os cenários Gherkin e a solução técnica

---

### In Progress
**O que acontece:** dev está desenvolvendo a solução técnica definida no Tech Explorer. Ao final, abre a PR.
**Responsável:** Dev.
**Critério de saída:**
- Código implementado conforme a solução técnica
- Testes unitários escritos e passando localmente
- `ruff` e `mypy` sem erros
- PR aberta para `develop` com descrição referenciando a história e os cenários Gherkin

---

### Code Review
**O que acontece:** time revisa a PR — código, arquitetura, cobertura de testes, aderência à diretiva de arquitetura (`docs/ARQUITETURA.md`).
**Responsável:** Time (ao menos 1 aprovação de Backend SR; Frontend SR se escopo frontend).
**Critério de saída:**
- PR aprovada sem comentários bloqueadores
- CI verde: ruff + mypy + pytest (cobertura ≥ 80%) + build Docker
- Testes de isolamento multi-tenant passando (se endpoint protegido)

---

### QA
**O que acontece:** QA executa e valida os cenários Gherkin escritos no upstream. Valida em ambiente de staging (ou local com docker compose).
**Responsável:** QA.
**Critério de saída:**
- Todos os cenários Gherkin passando
- Nenhum cenário de borda ou erro falhando
- Regressão nos fluxos críticos verificada (happy path completo)
- Evidências de teste (screenshots/vídeos/traces E2E do Playwright, prints de validação manual) salvas em `docs/stories/<ID>/evidencias/` **dentro do repositório** — nunca em diretório temporário fora do projeto (ver `docs/roles/qa.md`)
- QA aprova o merge para `main`

---

### Deploy
**O que acontece:** merge na `main`, pipeline executa deploy blue/green em produção via CodeDeploy. Healthcheck de 60s — rollback automático se falhar.
**Responsável:** DevOps + Dev (acompanha o deploy).
**Critério de saída:**
- Merge aprovado na `main` (2 revisores conforme `docs/ARQUITETURA.md` §11)
- Pipeline `deploy-prod.yml` executado com sucesso
- Healthcheck passou em todos os serviços afetados
- Evento de deploy registrado no Datadog
- História marcada como **Done**

---

## Handoff e regras gerais

- **Única porta de entrada no downstream:** história deve estar em **Ready** para entrar em To Do. Nenhuma história entra no sprint sem passar pelo upstream completo.
- **Sprint travada por história não-Ready:** se ao iniciar uma sprint qualquer história proposta não estiver `Ready`, o sprint **não começa**. O time deve ser alertado com a lista de histórias bloqueadas e em qual fase do upstream cada uma está. O sprint só é desbloqueado quando todas as histórias atingem `Ready`.
- **Bloqueios:** se uma história bloquear em qualquer step, volta ao step anterior com comentário explicando o bloqueio.
- **Referências obrigatórias em cada PR:** número/ID da história + link para os cenários Gherkin.
- **Diretiva de arquitetura:** toda decisão técnica segue `docs/ARQUITETURA.md`. Desvios precisam ser justificados na história durante o Tech Explorer.

---

## Slash commands por step

| Esteira | Step | Comando |
|---|---|---|
| Upstream | New | `/upstream-new` |
| Upstream | Explorer | `/upstream-explorer` |
| Upstream | QA Explorer | `/upstream-qa-explorer` |
| Upstream | Tech Explorer | `/upstream-tech-explorer` |
| Upstream | Ready | `/upstream-ready` |
| Downstream | To Do | `/downstream-todo` |
| Downstream | In Progress | `/downstream-in-progress` |
| Downstream | Code Review | `/downstream-code-review` |
| Downstream | QA | `/downstream-qa` |
| Downstream | Deploy | `/downstream-deploy` |
