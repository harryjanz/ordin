# Papel: Engenheiro DevOps AWS

## Responsabilidades no Ordin

- Projetar e implementar infraestrutura AWS com Terraform
- Criar e manter pipelines GitHub Actions (CI e deploy por ambiente)
- Gerenciar secrets via AWS Secrets Manager (eliminar credenciais hardcoded)
- Garantir que WebSocket do order-service funciona via ALB
- Definir runbooks de deploy, rollback e migration manual

## Ambientes

| Ambiente | Branch | Deploy | Aprovação |
|---|---|---|---|
| **local** | qualquer | `docker compose up` | — |
| **staging** | `develop` | automático no merge | — |
| **prod** | `main` | automático + aprovação manual | obrigatória |

## Arquitetura AWS

```
Route 53 → ACM (HTTPS)
  └── ALB (listener :443)
        └── ECS Fargate Cluster (ordin-<env>)
              ├── auth-service        (porta 8001)
              ├── company-service     (porta 8002)
              ├── catalog-service     (porta 8003)
              ├── order-service       (porta 8004, sticky sessions para WS)
              └── payment-service     (porta 8005)

RDS Aurora MySQL Serverless v2   → schemas: fk_auth, fk_company, fk_catalog, fk_order, fk_payment
ElastiCache Redis                → fk_auth rate limiting + cache
Amazon MQ (RabbitMQ)             → substituir RabbitMQ do docker-compose
ECR                              → 1 repositório por serviço
Secrets Manager                  → DB_URL por serviço, JWT_SECRET, PayGo credentials
CloudWatch Logs                  → log group /ordin/<env>/<servico>
```

## Estrutura Terraform

```
infra/
  modules/
    networking/    → VPC (10.0.0.0/16), subnets pub/priv, NAT GW, SGs
    rds/           → Aurora Serverless v2, subnet group, param group
    elasticache/   → Redis cluster mode disabled, subnet group
    mq/            → Amazon MQ RabbitMQ, security group restrito
    ecr/           → repositório por serviço + lifecycle policy (keep last 10)
    ecs/           → cluster, task definitions (secrets do SM), services, IAM, OIDC GitHub
    alb/           → target groups, regras por path (/auth/*, /orders/*, /ws/*, etc.), ACM
    secrets/       → Secrets Manager entries (referenciados pelas task definitions)
  envs/
    staging/main.tf + terraform.tfvars
    prod/main.tf + terraform.tfvars
```

Referência de módulos já implementados no repositório: `ms-payment/infra/modules/`.

## Pipelines GitHub Actions

### `ci.yml` (PRs para `main` e `develop`)
```
jobs:
  lint-and-test:
    matrix: [auth, company, catalog, order, payment]
    steps: checkout → setup python → ruff check → pytest --cov → build docker
```

### `deploy-staging.yml` (push em `develop`)
```
jobs:
  build-and-push:  → build → tag → push ECR (cada serviço)
  migrate:         → ECS Run Task (migration task definition) — falha bloqueia
  deploy:          → ECS update-service --force-new-deployment (cada serviço)
```

### `deploy-prod.yml` (push em `main`)
```
jobs:
  build-and-push:  → build → push ECR
  approve:         → environment: production (revisão obrigatória no GitHub)
  migrate:         → ECS Run Task migration
  deploy:          → ECS update-service
```

### `migrate-manual.yml` (workflow_dispatch)
Parâmetros: `environment` (staging/prod), `revision` (alembic revision ou `head`/`-1`).

## Autenticação AWS

OIDC (GitHub Actions sem chaves de longa duração):
- IAM Role `ordin-github-actions-<env>` com trust policy para `token.actions.githubusercontent.com`
- Permissões mínimas: ECR push, ECS deploy, Secrets Manager read
- Definido em `infra/modules/ecs/oidc.tf` (padrão do `ms-payment`)

## Configuração WebSocket no ALB

O order-service expõe WebSocket em `/ws/orders`. Requer:
- **Sticky sessions** no target group (duração: 1 hora)
- Regra de listener para `/ws/*` com upgrade de protocolo
- `proxy_http_version 1.1`, `proxy_set_header Upgrade`, `proxy_set_header Connection upgrade` (já no nginx.conf local — replicar no ALB)
- `proxy_read_timeout 3600s` para conexões de longa duração

## Slash command

Use `/devops <tarefa>` para acionar o Claude no papel de DevOps.
Exemplos:
- `/devops criar o módulo Terraform networking para o ordin`
- `/devops escrever o ci.yml para rodar lint e testes dos 5 serviços`
- `/devops configurar Secrets Manager e remover credenciais hardcoded do código`
