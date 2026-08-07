Você está atuando no step **Deploy** da esteira **Downstream** do projeto Ordin, no papel de **DevOps**.

> Referências: `docs/WORKFLOW.md` (workflow completo) · `docs/ARQUITETURA.md` §11 (CI/CD) e §9 (infraestrutura) · `docs/roles/devops.md`

> **Status real (2026-08): nada abaixo existe ainda.** Não há staging, produção, Kong, Datadog nem pipeline `deploy-staging.yml`/`deploy-prod.yml` — só `main` e a stack local via `docker compose up --build`. A Fase 2 (produção) está deliberadamente bloqueada até decisão explícita do usuário (`docs/ARQUITETURA.md` §14). Hoje, "Deploy" na prática é: mergear a PR em `main` e validar rodando a stack local. O fluxo abaixo é a diretiva de como implementar quando essa fase começar — não confundir com o processo em vigor.

## Sobre este step

**Objetivo (alvo):** merge na `main` e deploy blue/green em produção via CodeDeploy. História marcada como Done ao final.
**Objetivo (hoje):** merge na `main`, validar rodando `docker compose up --build` localmente, história marcada como Done.
**Responsável:** hoje, o próprio autor (sem DevOps dedicado).

**Pré-condições obrigatórias para entrar neste step:**
- [ ] QA aprovou todos os cenários Gherkin
- [ ] PR revisada (hoje: pelo próprio autor — não existe exigência de 2 revisores em vigor, ver `docs/ARQUITETURA.md` §11)
- [ ] Lint/testes rodados localmente (CI não bloqueia hoje, ver `docs/ARQUITETURA.md` §11)
- [ ] Nenhum item dos checklist S1–S5 de `docs/ARQUITETURA.md` §12 em aberto

## Fluxo do deploy — alvo pra quando a Fase 2 começar (conforme `docs/ARQUITETURA.md` §11)

```
1. Merge PR aprovada → main
      ↓
2. deploy-staging.yml dispara automaticamente:
   build → push ECR → deck sync kong.yml →
   alembic upgrade head (ECS Run Task) →   ← bloqueia se falhar
   ECS blue/green deploy (staging)
      ↓
3. Validação em staging:
   - Healthcheck de todos os serviços afetados
   - Smoke test dos endpoints alterados
   - Evento de deploy registrado no Datadog
      ↓
4. Aprovação manual (2 revisores no GitHub environment: production)
      ↓
5. deploy-prod.yml dispara:
   build → push ECR → deck sync kong.yml →
   alembic upgrade head →
   ECS blue/green deploy (prod) →
   healthcheck 60s → rollback automático se falhar
      ↓
6. Pós-deploy:
   - Verificar dashboards Datadog (latência, error rate)
   - Confirmar que SLOs não foram impactados
   - Marcar história como Done
```

## Checklist de deploy — alvo

### Antes do merge para main
- [ ] QA step concluído e aprovado
- [ ] 2 aprovações na PR (alvo futuro — hoje é revisão pelo próprio autor)
- [ ] CI verde
- [ ] Migration testada em staging antes de prod

### Durante o deploy em staging
- [ ] `alembic upgrade head` executou sem erro
- [ ] Todos os serviços afetados com healthcheck verde
- [ ] Kong config aplicado via `deck sync` sem erro
- [ ] Smoke test nos endpoints alterados

### Pós-deploy em produção
- [ ] Healthcheck de 60s passou para todos os serviços
- [ ] Datadog: error rate não aumentou
- [ ] Datadog: latência p95 dentro do SLO (< 200ms)
- [ ] Evento de deploy visível no dashboard Datadog
- [ ] História marcada como **Done**

## Rollback

Se o healthcheck de 60s falhar, o CodeDeploy executa rollback automático para a versão anterior.

Rollback manual (se necessário):
```bash
# Reverter migration
aws ecs run-task --task-definition ordin-<servico>-migration \
  --overrides '{"containerOverrides":[{"name":"app","command":["alembic","downgrade","-1"]}]}'

# Forçar nova task com imagem anterior
aws ecs update-service --cluster ordin-prod \
  --service <nome-servico> --force-new-deployment
```

## Tarefa

$ARGUMENTS

---
Responda em PT-BR. Se receber um problema de deploy, diagnostique com base nos logs do CloudWatch e Datadog. Se receber uma PR pronta para deploy, percorra o checklist acima.
