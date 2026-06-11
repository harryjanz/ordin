---
id: ORD-014
status: New
fase: 2
sprint: 7
responsavel: DevOps
---

# ORD-014 — Pipeline deploy-staging.yml com blue/green via CodeDeploy

## Descrição
Criar o `deploy-staging.yml` no GitHub Actions que dispara no merge para `develop`: build das imagens → push para ECR → `deck sync kong.yml` → migration ECS Run Task (`alembic upgrade head`) → deploy ECS blue/green via CodeDeploy com healthcheck de 60s e rollback automático.

## Contexto
Pipeline de deploy definido em `docs/ARQUITETURA.md` §11. Blue/green é obrigatório desde o primeiro deploy. Autenticação AWS via OIDC (sem chaves). Depende de ORD-008 (Aurora staging), ORD-012 (Kong), ORD-011 (CI verde).

## Stakeholder
Time de desenvolvimento e operações. Primeiro deploy automatizado em staging valida a esteira completa.
