---
id: ORD-012
status: New
fase: 2
sprint: 7
responsavel: DevOps
---

# ORD-012 — Provisionar Kong no ECS com kong.yml declarativo

## Descrição
Provisionar o Kong Gateway no ECS Fargate com Konga UI, configurar o `kong.yml` declarativo no repositório (`infra/kong/kong.yml`) com todas as rotas, plugins e upstreams dos 5 serviços conforme `docs/ARQUITETURA.md` §4. O `deck sync` deve aplicar a configuração no deploy.

## Contexto
Kong substitui o Nginx local e é o ponto de entrada único em produção (`docs/ARQUITETURA.md` §4). Pré-requisito para ORD-003 (bloquear `/internal/*`), para o plugin `company-scope` e para o `deploy-staging.yml` (ORD-014). Módulo Terraform `kong` necessário.

## Stakeholder
Time de desenvolvimento e operações. Kong centraliza autenticação JWT, rate limiting e isolamento multi-tenant no gateway.
