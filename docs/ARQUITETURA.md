# Diretiva de Arquitetura — Ordin

> Documento autoritativo de decisões arquiteturais. Toda implementação segue estas diretivas.
> Baseado em: `TicketPro_Arquitetura_v2.docx` (referência) + decisões específicas do ordin (2026-06-10).

---

## 1. Visão Geral

O Ordin é uma plataforma de autoatendimento para food service, multi-tenant por empresa (`company_id`). Cada empresa possui catálogo, terminais, usuários e dados completamente isolados.

### 1.1 Hierarquia de Entidades

```
PLATAFORMA ORDIN (Super Admin)
  └── EMPRESA (Admin + Caixa)
        └── TERMINAL
              └── PEDIDO → ITENS → TICKETS → COLETA
```

### 1.2 Papéis (RBAC)

| Role | Escopo | Capacidades |
|---|---|---|
| `super_admin` | Plataforma | Gerencia todas as empresas |
| `admin` | Sua empresa | CRUD de catálogo, terminais, usuários |
| `cashier` | Sua empresa | Coleta tickets, visualiza pedidos |
| `kiosk` | Empresa + terminal específicos (do JWT) | Lê catálogo, cria pedido e pagamento |

---

## 2. Stack de Tecnologia

| Camada | Tecnologia | Decisão |
|---|---|---|
| **Backend** | Python 3.12 + FastAPI (async) | — |
| **ORM** | SQLAlchemy 2 async (`AsyncSession` + `aiomysql`) | — |
| **Migrations** | Alembic (`YYYYMMDD_HHMM_descricao.py`) | — |
| **Lint** | ruff | — |
| **Type check** | mypy | CI obrigatório desde o início |
| **Testes** | pytest + pytest-asyncio + httpx | — |
| **API Gateway** | **Kong (ECS Fargate)** + Konga UI | Desde o primeiro deploy |
| **Banco** | **Aurora MySQL Serverless v2** + RDS Proxy | Auto-scale para picos de almoço/jantar |
| **Cache / Rate limit** | ElastiCache Redis | — |
| **Filas** | **SQS FIFO** (críticos) + **SQS Standard** (volume) + **SNS** (fan-out) | SQS em prod, RabbitMQ apenas local |
| **Observabilidade** | **Datadog** (APM, logs, dashboards, SLOs) | Sidecar no ECS desde o início |
| **Frontend web** | React 18 + Vite + TypeScript | Servido por Nginx no ECS Fargate |
| **Frontend mobile** | React Native + Expo (EAS) | App do balcão |
| **IaC** | **Terraform modular** | Referência: `ms-payment/infra/modules/` |
| **Deploy** | **Blue/green via ECS + CodeDeploy** | Desde o primeiro deploy em prod |
| **WAF** | **AWS WAF** (OWASP Top 10) | Desde o primeiro deploy em prod |
| **Notificações** | — | Nenhum por agora; WebSocket cobre tempo real |

---

## 3. Arquitetura de Cada Serviço — Clean Architecture

Cada serviço segue a mesma estrutura em 4 camadas. Referência de implementação: `ms-payment/`.

```
services/<nome>/
  app/
    domain/         → dataclasses puras, ABCs de repositório, exceções de domínio
    application/    → casos de uso, DTOs (sem conhecimento de HTTP ou banco)
    infrastructure/ → AsyncSession SQLAlchemy, repositórios, clientes externos (SQS, Kong)
    interfaces/     → rotas FastAPI, schemas Pydantic, middlewares, dependências
  alembic/
  tests/
    unit/           → domínio e casos de uso (mocks)
    integration/    → endpoints FastAPI + banco de teste real
  pyproject.toml    → ruff + mypy + pytest config
  Dockerfile
```

**Regra de dependência:** `interfaces → application → domain`. A camada `domain` não importa nada de fora dela.

**Serviços existentes:**

| Serviço | Schema Aurora | Porta |
|---|---|---|
| `auth-service` | `ordin_auth` | 8001 |
| `company-service` | `ordin_company` | 8002 |
| `catalog-service` | `ordin_catalog` | 8003 |
| `order-service` | `ordin_order` | 8004 |
| `payment-service` | `ordin_payment` | 8005 |

---

## 4. Kong API Gateway

Kong roda no ECS Fargate como ponto de entrada único. Configuração **declarativa** — todo estado vive em `infra/kong/kong.yml`, versionado no git. `deck sync kong.yml` executa no CI/CD a cada deploy.

### 4.1 Plugins ativos

| Plugin | Função |
|---|---|
| `jwt` | Valida token antes de chegar ao serviço |
| `rate-limiting` | 1000 req/min por consumer; 100 req/min para `/auth/login` |
| `cors` | Origens permitidas por ambiente (env var) |
| `request-transformer` | Extrai `company_id` do JWT e injeta como `X-Company-ID` |
| `prometheus` | Métricas para Datadog (latência, throughput, status codes) |
| `http-log` | Logs JSON estruturados → Datadog |
| `bot-detection` | Bloqueia crawlers não autorizados |
| `company-scope` | Plugin Lua customizado — valida `X-Company-ID` em todas as rotas protegidas |

### 4.2 Tabela de rotas

| Rota Kong | Upstream | Acesso |
|---|---|---|
| `/auth/*` | auth-service:8001 | Público (login, refresh) |
| `/companies/*` | company-service:8002 | JWT + company-scope |
| `/catalog/*` | catalog-service:8003 | JWT + company-scope |
| `/orders/*` | order-service:8004 | JWT + company-scope |
| `/tickets/*` | order-service:8004 | JWT + company-scope |
| `/payments/*` | payment-service:8005 | JWT + company-scope |
| `/ws/*` | order-service:8004 | JWT (WebSocket upgrade) |

**Endpoints `/internal/*` do company-service:** bloqueados no Kong — acessíveis apenas via VPC interna com header `X-Internal-Secret`.

---

## 5. Multi-Tenancy — Isolamento por Company

```
Regra absoluta: company_id é SEMPRE extraído do JWT. Nunca aceito do body ou query string.
```

- Toda tabela de negócio tem `company_id NOT NULL` com índice
- Middleware FastAPI injeta `company_id` do token no contexto de cada request
- `BaseRepository` aplica `.filter_by(company_id=ctx.company_id)` em todas as queries
- Decorator `@require_company_scope` valida em todos os endpoints protegidos
- Plugin Kong `company-scope` (Lua) valida `X-Company-ID` header
- **Testes obrigatórios no CI:** cada endpoint tem caso de teste verificando que empresa A não acessa dados da empresa B

---

## 6. Autenticação e JWT

| Token | Validade | Quem usa |
|---|---|---|
| Access token (`admin`, `cashier`) | **15 minutos** | Admin web, app balcão |
| Refresh token (`admin`, `cashier`) | 7 dias (com rotação) | Renovação automática no frontend |
| Access token (`kiosk`) | **4 horas** | Totem (ambiente controlado, sem refresh) |

- Refresh token rotation: novo token gerado a cada renovação; token anterior invalidado
- Redis blacklist para revogação imediata (ex: operador removido da empresa)
- Frontend renova token silenciosamente 60s antes do vencimento via interceptor Axios

---

## 7. QR Code de Tickets

```
ticket_code = base32_random(8 chars)
hmac_payload = f"{ticket_code}|{order_ref}|{product_name}|{unit_number}/{total_units}"
qr_data = f"{hmac_payload}|{HMAC-SHA256(hmac_payload, QR_SECRET)}"
```

- `QR_SECRET` armazenado no Secrets Manager
- Validação no `collect_ticket`: recomputar HMAC e comparar antes de aceitar
- Transferência de titularidade: não suportado no MVP (diferença do TicketPro)

---

## 8. Filas Assíncronas (SQS + SNS)

**Local (docker-compose):** RabbitMQ.
**Produção:** SQS + SNS.

### Eventos do sistema

| Evento | Publicado por | Consumido por | Fila |
|---|---|---|---|
| `payment.approved` | payment-service | order-service (atualiza status `paid`) | SQS FIFO |
| `payment.refused` | payment-service | order-service (mantém `pending`) | SQS FIFO |
| `payment.cancelled` | payment-service | order-service (atualiza `cancelled`) | SQS FIFO |
| `order.created` | order-service | WebSocket broadcast (tempo real) | SQS Standard |
| `ticket.collected` | order-service | WebSocket broadcast (tempo real) | SQS Standard |

Interface de publicação: `IMessageBroker` (ABC no `domain`). Implementações concretas: `RabbitMQBroker` (local) e `SQSBroker` (prod), injetadas no startup.

---

## 9. Infraestrutura AWS

```
Route 53 → ACM (HTTPS)
  └── ALB
        ├── WAF (OWASP Top 10, rate limiting por IP)
        └── Kong (ECS Fargate, mín. 2 tasks)
              ├── auth-service     (ECS Fargate)
              ├── company-service  (ECS Fargate)
              ├── catalog-service  (ECS Fargate)
              ├── order-service    (ECS Fargate, sticky sessions para WS)
              └── payment-service  (ECS Fargate)

Aurora MySQL Serverless v2
  └── RDS Proxy → schemas: ordin_auth, ordin_company, ordin_catalog, ordin_order, ordin_payment

ElastiCache Redis   → rate limiting + Redis blacklist de tokens
SQS FIFO            → payment.* events
SQS Standard        → order.*, ticket.* events
SNS                 → fan-out para múltiplos consumidores SQS
ECR                 → 1 repositório por serviço + Kong customizado
Secrets Manager     → DB_URL, JWT_SECRET, QR_SECRET, PayGo credentials, DD_API_KEY
KMS                 → Aurora at-rest, S3, Secrets Manager
CloudWatch Logs     → complementar ao Datadog para métricas nativas AWS
```

### Módulos Terraform

```
infra/
  modules/
    networking/    → VPC, subnets pub/priv, NAT GW, SGs
    rds/           → Aurora Serverless v2, RDS Proxy, subnet group
    elasticache/   → Redis
    sqs/           → filas FIFO e Standard, políticas IAM
    ecr/           → repositórios (lifecycle: manter últimas 10 imagens)
    kong/          → ECS service Kong + Konga, deck sync no CI
    ecs/           → cluster, task definitions, services, IAM roles, OIDC GitHub
    alb/           → target groups, listeners, ACM, sticky sessions para WS
    waf/           → AWS WAF, regras OWASP Top 10
    secrets/       → Secrets Manager entries
  envs/
    staging/
    prod/
```

---

## 10. Observabilidade — Datadog

Datadog Agent como **sidecar** em cada Task Definition ECS.

```
CMD: ddtrace-run uvicorn app.interfaces.main:app --host 0.0.0.0 --port 800X
```

| Área | Implementação |
|---|---|
| Logs | JSON estruturado via `ddtrace` + Python logging. `DD_LOGS_ENABLED=true` |
| APM / Tracing | Auto-instrumentation FastAPI. Trace completo: Kong → Serviço → Aurora → SQS |
| Métricas infra | Datadog Agent sidecar: CPU, memória, network por task |
| Métricas Kong | Plugin Prometheus + scrape Datadog |
| Métricas negócio | DogStatsD porta UDP 8125 (pedidos/hora, aprovações/hora) |
| Unified Service Tagging | `DD_ENV`, `DD_SERVICE`, `DD_VERSION` em todos os containers |
| Sample rate | Prod: `DD_TRACE_SAMPLE_RATE=0.1`; Staging: `1.0` |

### Dashboards mínimos

- **Gateway (Kong):** latência p50/p95/p99, req/s, error rate
- **Serviços:** latência por endpoint, error rate, saturação de memória
- **Aurora:** QPS, connections, slow queries
- **Negócio:** pedidos criados/hora, tickets coletados/hora, pagamentos aprovados/recusados

### SLOs

| SLO | Target |
|---|---|
| Disponibilidade da plataforma | 99.9% (30 dias) |
| Latência Kong p95 | < 200ms em 95% das requisições |
| Validação de QR Code | < 300ms p95 |
| Pagamentos processados | 99.5% sem erro (24h) |

---

## 11. CI/CD Pipeline

```
Push feature/* branch:
  ci.yml → ruff → mypy → pytest (unit + integration) → build Docker

PR para develop:
  ci.yml + testes de isolamento multi-tenant (empresa A não acessa dados de empresa B)

Merge develop:
  deploy-staging.yml → build → push ECR → deck sync kong.yml →
    migrate (ECS Run Task alembic upgrade head) → deploy ECS blue/green (staging)

Merge main (após aprovação de 2 revisores):
  deploy-prod.yml → build → push ECR → deck sync → migrate → deploy ECS blue/green →
    healthcheck 60s → rollback automático se falhar
```

- Autenticação AWS via **OIDC** (GitHub Actions sem chaves de longa duração)
- `alembic upgrade head` **bloqueia** o deploy se falhar
- Kong config: `deck sync infra/kong/kong.yml` no deploy
- Evento de deploy registrado no Datadog (correlaciona anomalias pós-deploy)

---

## 12. Segurança — Checklist de Produção

| # | Requisito | Origem |
|---|---|---|
| S1 | Zero credenciais hardcoded — tudo no Secrets Manager | C1, C2, C3 |
| S2 | JWT obrigatório em todos os endpoints de negócio | C4 |
| S3 | `/internal/*` bloqueado no Kong; `X-Internal-Secret` entre serviços | C5 |
| S4 | CORS restrito a origens conhecidas (env var por ambiente) | A1, A2 |
| S5 | HTTPS obrigatório via ACM no ALB | A3 |
| S6 | `company_id` extraído sempre do JWT | A4 |
| S7 | PIN de empresa hashado com bcrypt | A5 |
| S8 | RabbitMQ local com credenciais não-default; portas não expostas na AWS | M1 |
| S9 | QR Code assinado com HMAC-SHA256 | M2 |
| S10 | Audit log de ações sensíveis (login, cancelamento, regeneração de PIN) | M3 |
| S11 | WAF com OWASP Top 10 ativo na frente do ALB | — |
| S12 | Aurora KMS encryption at rest + SSL in transit | — |
| S13 | IAM Database Authentication (sem senha para DB nos containers) | — |

**Nenhum item S1–S5 pode estar aberto no primeiro deploy em produção.**

---

## 13. Convenções de Código

- **Async everywhere:** `AsyncSession` + `aiomysql`; nenhum `Session` síncrono
- **Re-exportações:** `Name as Name` em `__init__.py` (exigência do ruff)
- **`asyncio_mode = "auto"`** no pytest
- **Cobertura mínima:** 80% por serviço (CI bloqueia se abaixo)
- **Nomes de migration:** `YYYYMMDD_HHMM_descricao.py`
- **Comentários:** apenas quando o *porquê* não é óbvio; nunca docstrings longas
- **Commits:** PT-BR; mensagem descreve o *porquê*, não o *o quê*

---

## 14. Decisões Pendentes (a definir em fases futuras)

| Decisão | Contexto | Prazo |
|---|---|---|
| Integração PayGo TEF real | Atualmente simulada (95% aleatório). Requer credenciais e ambiente de homologação PayGo. | Fase 2 — iniciar contato com provedor |
| notification-service | Nenhum email por agora. Adicionar se produto precisar de confirmações para o cliente. | Pós Fase 3 |
| Módulo de relatórios | Sem analytics-service no MVP. Relatório financeiro básico via queries diretas no Aurora. | Fase 3 |
| multi-tenant nível plataforma | Super Admin gerenciando múltiplas empresas independentes. MVP foca em poucas empresas conhecidas. | Pós lançamento |
