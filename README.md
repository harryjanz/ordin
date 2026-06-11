# Ordin — Plataforma de Autoatendimento para Food Service

Ordin é uma plataforma **multi-tenant** de autoatendimento para food service. Clientes fazem pedidos em totens, pagam via TEF e retiram os itens escaneando QR codes. Operadores de balcão coletam tickets em tempo real; administradores gerenciam catálogo, terminais e usuários.

---

## Índice

1. [Visão do Produto](#1-visão-do-produto)
2. [Arquitetura](#2-arquitetura)
3. [Serviços](#3-serviços)
4. [Instalação Local](#4-instalação-local)
5. [Variáveis de Ambiente](#5-variáveis-de-ambiente)
6. [Referência de API](#6-referência-de-api)
7. [Modelo de Segurança](#7-modelo-de-segurança)
8. [Workflow de Desenvolvimento](#8-workflow-de-desenvolvimento)
9. [Deploy em Produção](#9-deploy-em-produção)
10. [SLOs](#10-slos)

---

## 1. Visão do Produto

### Personas

| Persona | Interface | Fluxo |
|---|---|---|
| **Cliente** | Totem (kiosk) | Seleciona itens → paga no TEF → recebe QR codes impressos |
| **Operador de balcão** | App mobile (React Native) | Escaneia QR de cada ticket → registra coleta |
| **Administrador** | Painel web (React + Vite) | Gerencia catálogo, terminais, usuários, TEF |
| **Super Admin** | API direta | Provisionamento de novas empresas |

### Fluxo principal

```
Cliente no totem
  └─ POST /orders          → order-service cria pedido + tickets (1 por unidade)
  └─ POST /payments        → payment-service processa TEF → notifica order-service
  └─ QR codes gerados      → HMAC-SHA256 por ticket

Operador no balcão
  └─ POST /tickets/{code}/collect  → SELECT FOR UPDATE → marca ticket como coletado
  └─ Quando último ticket coletado → pedido finalizado automaticamente
```

Cada empresa opera em isolamento total: catálogo, terminais, usuários e pedidos são segregados por `company_id` extraído do JWT.

---

## 2. Arquitetura

### Local (desenvolvimento)

```
                    ┌─────────────────────────────┐
Browser / App       │   Nginx Gateway :8000        │
                    │   (proxy reverso por path)   │
                    └──────────┬──────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
   auth :8001         company :8002        catalog :8003
   order :8004        payment :8005

   MySQL 8.0 :3306    Redis 7 :6379    RabbitMQ :5672
```

### Produção (AWS)

```
Route 53 → ACM (HTTPS)
  └── ALB
        ├── WAF (OWASP Top 10, rate limiting por IP)
        └── Kong ECS Fargate  (plugin jwt + rate-limiting + company-scope Lua)
              ├── auth-service     ECS Fargate
              ├── company-service  ECS Fargate
              ├── catalog-service  ECS Fargate
              ├── order-service    ECS Fargate  (sticky sessions WebSocket)
              └── payment-service  ECS Fargate

Aurora MySQL Serverless v2
  └── RDS Proxy → schemas: ordin_auth, ordin_company, ordin_catalog, ordin_order, ordin_payment

ElastiCache Redis     → rate limiting + blacklist de tokens
SQS FIFO              → payment.* events (order crítico, sem perda)
SQS Standard          → order.*, ticket.* events (WebSocket broadcast)
SNS                   → fan-out para múltiplos consumidores SQS
ECR                   → 1 repositório por serviço
Secrets Manager       → DB_URL, JWT_SECRET, QR_SECRET, PayGo credentials, DD_API_KEY
KMS                   → Aurora at-rest, S3, Secrets Manager
Datadog               → APM (ddtrace), logs JSON, DogStatsD, SLOs
CodeDeploy            → deploy blue/green com rollback automático (healthcheck 60s)
```

### Stack de tecnologia

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.12 + FastAPI (async) |
| ORM | SQLAlchemy 2 async (`AsyncSession` + `aiomysql`) |
| Migrations | Alembic (`YYYYMMDD_HHMM_descricao.py`) |
| Lint / Type check | ruff + mypy |
| Testes | pytest + pytest-asyncio + httpx |
| API Gateway (prod) | Kong ECS Fargate + Konga UI |
| API Gateway (local) | Nginx |
| Banco (prod) | Aurora MySQL Serverless v2 + RDS Proxy |
| Cache / Rate limit | ElastiCache Redis |
| Filas (prod) | SQS FIFO + SQS Standard + SNS |
| Filas (local) | RabbitMQ |
| Observabilidade | Datadog APM + DogStatsD + sidecar ECS |
| Frontend web | React 18 + Vite + TypeScript |
| Frontend mobile | React Native + Expo (EAS) |
| IaC | Terraform modular (`infra/modules/`) |
| Deploy | Blue/green via ECS + CodeDeploy |

---

## 3. Serviços

| Serviço | Schema Aurora | Porta | Responsabilidade |
|---|---|---|---|
| `auth-service` | `ordin_auth` | 8001 | JWT (access 15min + refresh 7d), PIN login para totens, refresh rotation, Redis blacklist |
| `company-service` | `ordin_company` | 8002 | Empresas, usuários, terminais; endpoints `/internal/*` consumidos pelo auth |
| `catalog-service` | `ordin_catalog` | 8003 | Categorias e produtos por empresa |
| `order-service` | `ordin_order` | 8004 | Pedidos, tickets por unidade, coleta via QR, WebSocket broadcast |
| `payment-service` | `ordin_payment` | 8005 | TEF PayGo (simulado 95% aprovação); notifica order-service via internal API |

### RBAC

| Role | Escopo | Capacidades |
|---|---|---|
| `super_admin` | Plataforma | Gerencia todas as empresas |
| `admin` | Sua empresa | CRUD de catálogo, terminais, usuários |
| `cashier` | Sua empresa | Coleta tickets, visualiza pedidos |
| `kiosk` | Empresa + terminal (do JWT) | Lê catálogo, cria pedido e pagamento |

### Comunicação entre serviços

| Chamada | Origem | Destino | Tipo |
|---|---|---|---|
| Validação de PIN | auth-service | `company-service /internal/verify-pin` | HTTP + `X-Internal-Secret` |
| Aprovação de pagamento | payment-service | `order-service /internal/orders/{ref}/status` | HTTP + `X-Internal-Secret` |
| Cancelamento de pagamento | payment-service | `order-service /internal/orders/{ref}/status` | HTTP + `X-Internal-Secret` |
| Broadcast tempo real | order-service | WebSocket clients | WS (`/ws/orders?company_id=X`) |

---

## 4. Instalação Local

### Pré-requisitos

- Docker 24+ e Docker Compose v2
- `make` (opcional, mas recomendado)

### 1. Clonar e configurar

```bash
git clone <repo-url> ordin
cd ordin
cp .env.example .env   # edite com suas chaves locais
```

### 2. Configurar o `.env`

Veja a seção [Variáveis de Ambiente](#5-variáveis-de-ambiente) para a lista completa. Para desenvolvimento local, os valores mínimos são:

```env
MYSQL_ROOT_PASSWORD=root

AUTH_DB_URL=mysql+aiomysql://ordin_user:ordin_pass@mysql:3306/ordin_auth
COMPANY_DB_URL=mysql+aiomysql://ordin_user:ordin_pass@mysql:3306/ordin_company
CATALOG_DB_URL=mysql+aiomysql://ordin_user:ordin_pass@mysql:3306/ordin_catalog
ORDER_DB_URL=mysql+aiomysql://ordin_user:ordin_pass@mysql:3306/ordin_order
PAYMENT_DB_URL=mysql+aiomysql://ordin_user:ordin_pass@mysql:3306/ordin_payment

JWT_SECRET=dev-jwt-secret-local-apenas
INTERNAL_SECRET=dev-internal-secret-local
QR_SECRET=dev-qr-secret-local

REDIS_URL=redis://redis:6379/0
COMPANY_SERVICE_URL=http://company-service:8002
ORDER_SERVICE_URL=http://order-service:8004
CORS_ORIGINS=http://localhost:3000,http://localhost:8000
```

### 3. Subir o stack

```bash
docker compose up --build
```

O `init.sql` é executado automaticamente no primeiro start do MySQL, criando bancos, usuário e grants. As migrations Alembic rodam no startup de cada serviço.

**Dados de demonstração disponíveis após o seed:**

| Empresa | PIN | Terminais |
|---|---|---|
| Burger House | `1234` | T1, T2 |
| Pasta & Co | `5678` | T1 |
| Sweet Corner | `9999` | T1 |

### 4. Verificar saúde dos serviços

```bash
curl http://localhost:8000/auth/health
curl http://localhost:8000/catalog/health
curl http://localhost:8000/orders/health
```

### 5. Rodar um serviço isolado

```bash
cd services/auth
pip install -r ../requirements.txt
uvicorn main:app --reload --port 8001
```

### 6. Migrations Alembic

```bash
# Rodar migrations de um serviço
cd services/auth
alembic upgrade head

# Criar nova migration
alembic revision --autogenerate -m "descricao_da_mudanca"
# Renomear o arquivo gerado para o padrão YYYYMMDD_HHMM_descricao.py
```

### 7. Testes

```bash
# De dentro do diretório do serviço
cd services/auth
pytest -v

# Com cobertura
pytest --cov=. --cov-report=term-missing

# Testes de isolamento multi-tenant (obrigatórios antes de PR)
pytest tests/integration/ -v -k "company_isolation"
```

---

## 5. Variáveis de Ambiente

### Variáveis compartilhadas (todos os serviços)

| Variável | Descrição | Exemplo |
|---|---|---|
| `JWT_SECRET` | Chave de assinatura JWT | `min-32-chars-secret` |
| `CORS_ORIGINS` | Origens permitidas (vírgula) | `https://admin.ordin.com.br` |

### Por serviço

#### auth-service

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DB_URL` | Sim | `mysql+aiomysql://user:pass@host:3306/ordin_auth` |
| `JWT_SECRET` | Sim | Chave HMAC-SHA256 para assinar tokens |
| `INTERNAL_SECRET` | Sim | Segredo compartilhado para chamadas `/internal/*` |
| `COMPANY_SERVICE_URL` | Sim | URL base do company-service |
| `REDIS_URL` | Sim | `redis://redis:6379/0` |
| `CORS_ORIGINS` | Sim | Origens permitidas |

#### company-service

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DB_URL` | Sim | `mysql+aiomysql://user:pass@host:3306/ordin_company` |
| `JWT_SECRET` | Sim | Necessário para validar tokens em endpoints protegidos |
| `INTERNAL_SECRET` | Sim | Valida header `X-Internal-Secret` nos endpoints internos |
| `CORS_ORIGINS` | Sim | Origens permitidas |

#### catalog-service

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DB_URL` | Sim | `mysql+aiomysql://user:pass@host:3306/ordin_catalog` |
| `JWT_SECRET` | Sim | Validação de tokens |
| `CORS_ORIGINS` | Sim | Origens permitidas |

#### order-service

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DB_URL` | Sim | `mysql+aiomysql://user:pass@host:3306/ordin_order` |
| `JWT_SECRET` | Sim | Validação de tokens |
| `INTERNAL_SECRET` | Sim | Autenticação de chamadas internas |
| `QR_SECRET` | Sim | Chave HMAC-SHA256 para assinar/verificar QR codes |
| `CORS_ORIGINS` | Sim | Origens permitidas |

#### payment-service

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DB_URL` | Sim | `mysql+aiomysql://user:pass@host:3306/ordin_payment` |
| `JWT_SECRET` | Sim | Validação de tokens |
| `INTERNAL_SECRET` | Sim | Header `X-Internal-Secret` para notificar order-service |
| `ORDER_SERVICE_URL` | Sim | URL base do order-service |
| `CORS_ORIGINS` | Sim | Origens permitidas |

---

## 6. Referência de API

O gateway (Nginx local / Kong em prod) roteia por prefixo. Todos os endpoints protegidos exigem `Authorization: Bearer <access_token>`.

### auth-service — `/auth/*`

| Método | Rota | Role | Descrição |
|---|---|---|---|
| `POST` | `/auth/login` | Público | Login com email + senha; retorna access + refresh tokens |
| `POST` | `/auth/pin-login` | Público | Login de totem com PIN da empresa + terminal; retorna JWT `kiosk` (4h) |
| `POST` | `/auth/refresh` | Público | Rotaciona refresh token; invalida o anterior |
| `POST` | `/auth/logout` | Autenticado | Revoga refresh token (adiciona à blacklist Redis) |
| `GET` | `/auth/health` | Público | Healthcheck |

### company-service — `/companies/*`

| Método | Rota | Role | Descrição |
|---|---|---|---|
| `GET` | `/companies/me` | admin, cashier | Dados da empresa do usuário autenticado |
| `POST` | `/companies` | super_admin | Criar nova empresa |
| `GET` | `/companies/{id}/users` | admin | Listar usuários da empresa |
| `POST` | `/companies/{id}/users` | admin | Criar usuário (admin ou cashier) |
| `GET` | `/companies/{id}/terminals` | admin | Listar terminais |
| `POST` | `/companies/{id}/terminals` | admin | Criar terminal |
| `POST` | `/companies/{id}/regenerate-pin` | admin | Gerar novo PIN (bcrypt rounds=12) |
| `POST` | `/internal/verify-pin` | Internal | Verifica PIN para login de totem |
| `GET` | `/companies/health` | Público | Healthcheck |

### catalog-service — `/catalog/*`

| Método | Rota | Role | Descrição |
|---|---|---|---|
| `GET` | `/catalog/categories` | Autenticado | Lista categorias ativas da empresa |
| `GET` | `/catalog/products` | Autenticado | Lista produtos ativos (filtrável por `category_id`) |
| `GET` | `/catalog/products/{id}` | Autenticado | Detalhes de um produto |
| `GET` | `/catalog/health` | Público | Healthcheck |

### order-service — `/orders/*`, `/tickets/*`

| Método | Rota | Role | Descrição |
|---|---|---|---|
| `POST` | `/orders` | kiosk | Criar pedido; gera tickets individuais + QR codes HMAC |
| `GET` | `/orders/{ref}/tickets` | admin, cashier | Listar tickets de um pedido com progresso de coleta |
| `PATCH` | `/orders/{ref}/status` | admin | Atualizar status do pedido |
| `POST` | `/tickets/{code}/collect` | cashier | Coletar ticket (SELECT FOR UPDATE); finaliza pedido ao último ticket |
| `GET` | `/ws/orders` | Autenticado | WebSocket — eventos `order.created`, `ticket.collected`, `order.completed` |
| `PATCH` | `/internal/orders/{ref}/status` | Internal | Atualizar status via serviço interno (payment) |
| `GET` | `/orders/health` | Público | Healthcheck |

### payment-service — `/payments/*`

| Método | Rota | Role | Descrição |
|---|---|---|---|
| `POST` | `/payments` | kiosk | Processar pagamento TEF; notifica order-service ao aprovar |
| `GET` | `/payments` | admin | Listar transações da empresa (últimas 100) |
| `POST` | `/payments/{id}/cancel` | admin | Cancelar transação aprovada; notifica order-service |
| `GET` | `/payments/health` | Público | Healthcheck |

---

## 7. Modelo de Segurança

### Multi-tenancy

```
Regra absoluta: company_id é SEMPRE extraído do JWT. Nunca aceito do body ou query string.
```

- Toda tabela de negócio tem `company_id NOT NULL` com índice
- Middleware FastAPI injeta `company_id` do token no contexto de cada request
- `BaseRepository` aplica `.filter_by(company_id=...)` em todas as queries
- Plugin Kong `company-scope` (Lua) valida o header `X-Company-ID` em produção
- **CI obriga:** cada endpoint tem teste verificando que empresa A não acessa dados da empresa B

### Autenticação JWT

| Token | Validade | Uso |
|---|---|---|
| Access token (admin, cashier) | 15 minutos | Painel web, app balcão |
| Refresh token (admin, cashier) | 7 dias, com rotação | Renovação silenciosa via interceptor Axios |
| Access token (kiosk) | 4 horas | Totem (sem refresh — ambiente controlado) |

- Refresh token rotation: token anterior invalidado a cada renovação
- Redis blacklist para revogação imediata (ex: operador removido)

### QR Code (HMAC-SHA256)

```
payload  = "{ticket_code}|{product_name}|{order_ref}|{timestamp}"
qr_data  = "{payload}|{HMAC-SHA256(payload, QR_SECRET)}"
```

Validação no `collect_ticket`: HMAC recomputado e comparado com `hmac.compare_digest` (timing-safe) antes de qualquer acesso ao banco.

### Endpoints internos

Rotas `/internal/*` são **bloqueadas no Kong** — acessíveis apenas dentro da VPC com o header `X-Internal-Secret` (validado com `secrets.compare_digest`).

### Checklist de produção (S1–S13)

| # | Requisito |
|---|---|
| S1 | Zero credenciais hardcoded — tudo no Secrets Manager |
| S2 | JWT obrigatório em todos os endpoints de negócio |
| S3 | `/internal/*` bloqueado no Kong; `X-Internal-Secret` entre serviços |
| S4 | CORS restrito a origens conhecidas por ambiente |
| S5 | HTTPS obrigatório via ACM no ALB |
| S6 | `company_id` extraído sempre do JWT |
| S7 | PIN de empresa hashado com bcrypt rounds=12 |
| S8 | RabbitMQ local com credenciais não-default; portas não expostas na AWS |
| S9 | QR Code assinado com HMAC-SHA256 |
| S10 | Audit log de ações sensíveis (login, cancelamento, regeneração de PIN) |
| S11 | WAF com OWASP Top 10 ativo na frente do ALB |
| S12 | Aurora KMS encryption at rest + SSL in transit |
| S13 | IAM Database Authentication (sem senha para DB nos containers) |

**Nenhum item S1–S5 pode estar aberto no primeiro deploy em produção.**

---

## 8. Workflow de Desenvolvimento

O projeto usa **duas esteiras independentes** com handoff no _Ready → To Do_.

### Esteira Upstream (Discovery)

```
[ New ] → [ Explorer ] → [ QA Explorer ] → [ Tech Explorer ] → [ Ready ]
```

| Step | Responsável | Critério de saída |
|---|---|---|
| **New** | Qualquer membro | Título + descrição mínima |
| **Explorer** | PM + Produto | História em formato Como/Quero/Para; mockup se frontend |
| **QA Explorer** | QA | Cenários Gherkin (happy path + bordas + erros) aprovados pelo PM |
| **Tech Explorer** | Backend SR + Frontend | Endpoints, schemas, estimativa, riscos técnicos documentados |
| **Ready** | Time completo | Todos os campos preenchidos; estimativa acordada; priorizado no backlog |

### Esteira Downstream (Sprint)

```
[ To Do ] → [ In Progress ] → [ Code Review ] → [ QA ] → [ Deploy ]
```

| Step | Critério de saída |
|---|---|
| **To Do** | Branch `feature/<id>-descricao` criada a partir de `develop` |
| **In Progress** | Código + testes unitários passando; `ruff` + `mypy` limpos; PR aberta referenciando a história e os Gherkins |
| **Code Review** | PR aprovada (≥1 Backend SR); CI verde: ruff + mypy + pytest ≥80% + build Docker + testes multi-tenant |
| **QA** | Todos os cenários Gherkin passando em staging; regressão nos fluxos críticos verificada |
| **Deploy** | Merge em `main` (2 revisores); pipeline executado; healthcheck passou; evento registrado no Datadog |

### Convenções de branch e commit

```
feature/<id>-descricao   # trabalho novo
fix/<id>-descricao       # correção
```

- Commits em PT-BR descrevendo o **porquê**, não o que
- PR obrigatoriamente referencia: ID da história + link para os cenários Gherkin
- `develop` → staging automático; `main` → produção (2 aprovações obrigatórias)

---

## 9. Deploy em Produção

### CI/CD Pipeline

```
Push feature/*
  ci.yml → ruff → mypy → pytest (unit + integration) → build Docker

PR para develop
  ci.yml + testes de isolamento multi-tenant

Merge develop → staging
  deploy-staging.yml
    → build → push ECR
    → deck sync infra/kong/kong.yml
    → alembic upgrade head  (bloqueia o deploy se falhar)
    → deploy ECS blue/green (staging)

Merge main → produção  (2 revisores obrigatórios)
  deploy-prod.yml
    → build → push ECR
    → deck sync kong.yml
    → alembic upgrade head
    → deploy ECS blue/green
    → healthcheck 60s → rollback automático se falhar
    → evento de deploy registrado no Datadog
```

- Autenticação AWS via **OIDC** (GitHub Actions — sem chaves de longa duração)
- Kong config versionada em `infra/kong/kong.yml`; `deck sync` no CI a cada deploy
- Módulos Terraform em `infra/modules/` (networking, rds, elasticache, sqs, ecr, kong, ecs, alb, waf, secrets)

### Rodar migrations em produção manualmente

```bash
# Via ECS Run Task (mesmo container do serviço)
aws ecs run-task \
  --cluster ordin-prod \
  --task-definition auth-service-migrate \
  --overrides '{"containerOverrides":[{"name":"app","command":["alembic","upgrade","head"]}]}'
```

### Observabilidade (Datadog)

```bash
# Inicialização do serviço via ddtrace
CMD: ddtrace-run uvicorn app.interfaces.main:app --host 0.0.0.0 --port 800X
```

| O que | Como |
|---|---|
| Logs | JSON estruturado via `ddtrace` + Python `logging`; `DD_LOGS_ENABLED=true` |
| APM / Tracing | Auto-instrumentation FastAPI; trace completo Kong → Serviço → Aurora → SQS |
| Métricas de negócio | DogStatsD porta 8125 (pedidos/hora, aprovações/hora) |
| Métricas Kong | Plugin Prometheus + scrape Datadog |
| Sample rate | Prod: `DD_TRACE_SAMPLE_RATE=0.1`; Staging: `1.0` |

---

## 10. SLOs

| SLO | Target |
|---|---|
| Disponibilidade da plataforma | 99.9% (janela 30 dias) |
| Latência Kong p95 | < 200ms em 95% das requisições |
| Validação de QR Code p95 | < 300ms |
| Pagamentos processados sem erro | 99.5% (janela 24h) |

---

## Documentação Adicional

| Documento | Conteúdo |
|---|---|
| [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) | Decisões arquiteturais autoritativas; toda implementação segue este documento |
| [`docs/WORKFLOW.md`](docs/WORKFLOW.md) | Detalhamento completo das esteiras upstream/downstream e slash commands por step |
| [`CLAUDE.md`](CLAUDE.md) | Guia para desenvolvimento assistido por IA neste repositório |
