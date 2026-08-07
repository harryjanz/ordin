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

### Produção (AWS) — estado alvo, ainda não implementado

> Fase 2 (produção/staging) está bloqueada por decisão do usuário — nada abaixo existe hoje (sem conta AWS provisionada, sem Kong, sem Aurora). Ver [§9](#9-deploy-em-produção).

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
| `auth-service` | `ordin_auth` | 8001 | JWT (access 60min configurável + refresh 7d), PIN login para totens, refresh rotation, Redis blacklist |
| `company-service` | `ordin_company` | 8002 | Empresas, usuários, terminais; endpoints `/internal/*` consumidos pelo auth |
| `catalog-service` | `ordin_catalog` | 8003 | Categorias e produtos por empresa |
| `order-service` | `ordin_order` | 8004 | Pedidos, tickets por unidade, coleta via QR, WebSocket broadcast |
| `payment-service` | `ordin_payment` | 8005 | TEF PayGo (simulado 95% aprovação); notifica order-service via internal API |

### RBAC

> Roles reais em produção (confirmados no seed e nas checagens de código) — **não** `super_admin`/`admin`/`cashier`/`kiosk` como versões antigas deste doc afirmavam.

| Role | Escopo | Capacidades |
|---|---|---|
| `superadmin` | Plataforma | Único que cria/edita/desativa empresas, consulta CNPJ/CEP, aprova pareamento de totem, mexe em status de contrato |
| `owner` | Sua empresa | Tudo que `manager` faz, mais: promover usuário a `owner`, editar configuração de pagamento ativa, responsável legal da empresa |
| `manager` | Sua empresa | CRUD de catálogo, terminais, usuários (exceto promover a `owner`), configurações de pagamento, contatos |
| `cashier` | Sua empresa | Autenticado — hoje sem restrição de role própria além de estar logado (coleta de ticket e listagem de pedidos não checam role no código) |
| `kiosk` | Empresa + terminal (do JWT) | Lê catálogo, cria pedido e pagamento; token de 12h, sem refresh |

Muitos endpoints só exigem "autenticado nesta empresa" (`get_current_user`), sem checagem de role específica — a coluna **Role** na [Referência de API](#6-referência-de-api) reflete isso quando for o caso (`Autenticado`, sem role própria imposta).

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

`GET /health` de cada serviço só responde na porta direta — **não** existe através do gateway com prefixo (`/auth/health`, `/catalog/health` etc. retornam `404`, ver [§6](#6-referência-de-api)):

```bash
curl http://localhost:8001/health   # auth
curl http://localhost:8002/health   # company
curl http://localhost:8003/health   # catalog
curl http://localhost:8004/health   # order
curl http://localhost:8005/health   # payment

# Catch-all estático do gateway (não verifica os serviços de fato)
curl http://localhost:8000/health
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

O gateway (Nginx local / Kong em prod) roteia por prefixo. Todos os endpoints protegidos exigem `Authorization: Bearer <access_token>`. Rotas `/internal/*` retornam `403` direto no gateway (`nginx.conf`) — nunca chegam ao serviço vindas de fora.

> **Coluna Role:** reflete o que o código realmente checa hoje, não uma intenção. `Autenticado` significa que o endpoint só exige um JWT válido da empresa (`get_current_user`) — sem checagem de role própria no código, mesmo que o nome do endpoint sugira um público mais restrito (isso é real em vários endpoints de `order-service`/`payment-service`, ver nota abaixo da tabela de cada serviço).
>
> **Healthcheck:** `GET /health` de cada serviço só responde na porta direta do serviço (ex.: `:8003/health`) — a rota **não** existe com o prefixo do gateway (`/catalog/health` etc. retornam `404`). O único healthcheck que responde em `localhost:8000/health` é um catch-all estático do próprio Nginx (`{"status":"ok","gateway":"ordin"}`), que não verifica os serviços de verdade. Ver seção [4.4](#4-instalação-local).

### auth-service — `/auth/*`

| Método | Rota | Role | Descrição |
|---|---|---|---|
| `POST` | `/auth/validate-pin` | Público | Valida um PIN de empresa sem efetuar login |
| `POST` | `/auth/pin-login` | Público | Login de totem com PIN da empresa + terminal; retorna JWT `kiosk` (12h, sem refresh) |
| `POST` | `/auth/login` | Público | Login com email + senha; retorna access (60min) + refresh (7d) |
| `POST` | `/auth/refresh` | Refresh token válido | Rotaciona refresh token; invalida o anterior |
| `POST` | `/auth/logout` | Autenticado | Revoga refresh token (adiciona à blacklist Redis) |
| `POST` | `/auth/device/challenge` | Público | Gera código de pareamento para um totem novo |
| `GET` | `/auth/device/status` | Público | Consulta status do pareamento (polling do totem) |
| `GET` | `/health` | Público (porta direta) | Healthcheck |

### company-service — `/companies/*` (+ `/internal/*`, bloqueado no gateway)

| Método | Rota | Role | Descrição |
|---|---|---|---|
| `GET` | `/companies` | `superadmin` | Listar empresas |
| `POST` | `/companies` | `superadmin` | Criar empresa |
| `GET` | `/companies/cnpj-lookup/{cnpj}` | `superadmin` | Consultar CNPJ na Receita Federal |
| `GET` | `/companies/cep-lookup/{cep}` | `superadmin` | Consultar CEP (BrasilAPI/ViaCEP/OpenCEP) |
| `GET` | `/companies/{id}` | `superadmin` ou dono da empresa | Detalhe da empresa |
| `PUT` | `/companies/{id}` | `superadmin` | Editar empresa |
| `DELETE` | `/companies/{id}` | `superadmin` | Desativar empresa |
| `PATCH` | `/companies/{id}/appearance` | `superadmin` | Atualizar tema visual do totem |
| `POST` | `/companies/{id}/regenerate-pin` | `superadmin` | Gerar novo PIN (bcrypt rounds=12) |
| `GET` | `/companies/{id}/terminals` | `owner`, `manager` | Listar terminais |
| `POST` | `/companies/{id}/terminals` | `owner`, `manager` | Criar terminal |
| `PUT` | `/companies/{id}/terminals/{tid}` | `owner`, `manager` | Editar terminal |
| `DELETE` | `/companies/{id}/terminals/{tid}` | `owner`, `manager` | Desativar terminal |
| `POST` | `/companies/{id}/terminals/{tid}/heartbeat` | `kiosk` (só o terminal vinculado) | Heartbeat do totem ativo |
| `GET` | `/companies/{id}/users` | `owner`, `manager` | Listar usuários da empresa |
| `POST` | `/companies/{id}/users` | `owner`, `manager` | Criar usuário (`manager` não pode criar role `owner`) |
| `PUT` | `/companies/{id}/users/{uid}` | `owner`, `manager` | Editar usuário (`manager` não pode promover a `owner`) |
| `DELETE` | `/companies/{id}/users/{uid}` | `owner`, `manager` | Desativar usuário |
| `GET` | `/companies/{id}/payment-configs` | `owner`, `manager` | Listar configurações de pagamento |
| `POST` | `/companies/{id}/payment-configs` | `owner`, `manager` | Criar configuração de pagamento |
| `PUT` | `/companies/{id}/payment-configs/{cid}` | `owner`, `manager` | Atualizar configuração |
| `DELETE` | `/companies/{id}/payment-configs/{cid}` | `owner`, `manager` | Desativar configuração |
| `PATCH` | `/companies/{id}/payment-configs/{cid}/activate` | `owner`, `manager` | Ativa uma config (desativa as demais do mesmo provider) |
| `POST` | `/companies/{id}/contacts` | `owner`, `manager` | Criar contato (comercial/financeiro/técnico) |
| `GET` | `/companies/{id}/contacts` | `owner`, `manager` | Listar contatos |
| `POST` | `/companies/{id}/legal-representative` | `owner` ou `superadmin` | Cadastrar/atualizar responsável legal |
| `GET` | `/companies/{id}/legal-representative` | `owner` ou `superadmin` | Consultar responsável legal |
| `PATCH` | `/companies/{id}/contract-status` | `superadmin` | Atualizar status do contrato (rastreio manual de envio/assinatura) |
| `GET` | `/companies/{id}/contract-document-url` | `superadmin` | URL assinada (temporária) do contrato assinado |
| `POST` | `/companies/{id}/devices/approve` | `superadmin` ou dono da empresa | Aprovar pareamento de totem por código |
| `POST` | `/internal/validate-pin` | Internal | Consumido por `auth-service` |
| `POST` | `/internal/verify-pin` | Internal | Consumido por `auth-service` no PIN login |
| `POST` | `/internal/verify-credentials` | Internal | Consumido por `auth-service` no login por senha |
| `GET` | `/internal/terminals/{tid}` | Internal | Consumido por `auth-service` |
| `GET` | `/health` | Público (porta direta) | Healthcheck |

### catalog-service — `/catalog/*`

| Método | Rota | Role | Descrição |
|---|---|---|---|
| `GET` | `/catalog/categories` | Autenticado | Lista categorias da empresa (`include_inactive` pro admin) |
| `GET` | `/catalog/products` | Autenticado | Lista produtos (filtrável por `category_id`, `include_inactive`) |
| `GET` | `/catalog/products/{id}` | Autenticado | Detalhes de um produto |
| `GET` | `/catalog/allergens` | Autenticado | Lista de alérgenos oficiais (RDC 727/2022) — master data |
| `POST` | `/catalog/categories` | `owner`, `manager`, `admin` | Criar categoria |
| `PUT` | `/catalog/categories/{id}` | `owner`, `manager`, `admin` | Editar categoria |
| `DELETE` | `/catalog/categories/{id}` | `owner`, `manager`, `admin` | Desativar ou excluir definitivamente |
| `POST` | `/catalog/products` | `owner`, `manager`, `admin` | Criar produto |
| `PUT` | `/catalog/products/reorder` | `owner`, `manager`, `admin` | Reordenar produtos de uma categoria (drag-and-drop no admin) |
| `PUT` | `/catalog/products/{id}` | `owner`, `manager`, `admin` | Editar produto |
| `DELETE` | `/catalog/products/{id}` | `owner`, `manager`, `admin` | Desativar ou excluir definitivamente |
| `POST` | `/catalog/products/{id}/image` | `owner`, `manager`, `admin` | Enviar imagem (gera thumbnail) |
| `DELETE` | `/catalog/products/{id}/image` | `owner`, `manager`, `admin` | Remover imagem |
| `GET` | `/health` | Público (porta direta) | Healthcheck |

`_WRITE_ROLES = {"admin", "owner", "manager"}` no código — `admin` está na lista por herança do desenho original do RBAC, mas nenhum usuário real tem esse role hoje (ver §3).

### order-service — `/orders/*`, `/tickets/*`

| Método | Rota | Role | Descrição |
|---|---|---|---|
| `POST` | `/orders` | Autenticado | Criar pedido; gera tickets individuais + QR codes HMAC |
| `GET` | `/orders` | Autenticado | Listar pedidos da empresa |
| `PATCH` | `/orders/{ref}/status` | Autenticado | Atualizar status do pedido |
| `GET` | `/orders/{ref}/tickets` | Autenticado | Listar tickets de um pedido com progresso de coleta |
| `POST` | `/tickets/{code}/collect` | Autenticado | Coletar ticket (`SELECT FOR UPDATE`); finaliza pedido ao último ticket |
| `GET` | `/ws/orders` | Autenticado | WebSocket — eventos `order.created`, `ticket.collected`, `order.completed` |
| `PATCH` | `/internal/orders/{ref}/status` | Internal | Atualizar status via serviço interno (payment) |
| `GET` | `/health` | Público (porta direta) | Healthcheck |

Os docstrings do código mencionam "Requer role: kiosk/cashier/admin" em alguns desses endpoints, mas isso **não é aplicado** — hoje qualquer usuário autenticado da empresa acessa qualquer um deles. Se isso importa pro seu caso de uso, trate como um gap conhecido, não como comportamento documentado-e-garantido.

### payment-service — `/payments/*`

| Método | Rota | Role | Descrição |
|---|---|---|---|
| `POST` | `/payments` | Autenticado | Processar pagamento TEF/PIX; notifica order-service ao aprovar |
| `GET` | `/payments` | Autenticado | Listar transações da empresa |
| `POST` | `/payments/{id}/cancel` | Autenticado | Cancelar transação aprovada; notifica order-service |
| `POST` | `/payments/test-connection` | `kiosk` (terminal vinculado) | Testar conexão com a máquina de pagamento (R$0,01 auto-cancelado) |
| `GET` | `/payments/{id}/status` | Autenticado | Consultar status de pagamento PIX (polling do totem) |
| `DELETE` | `/payments/{id}` | Autenticado | Cancelar PIX pendente (timeout ou desistência) |
| `POST` | `/payments/webhook` | Público (validado por assinatura do provider) | Webhook de notificações (Mercado Pago PIX/Point, PayGo) |
| `GET` | `/health` | Público (porta direta) | Healthcheck |

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
| Access token (owner, manager, cashier, superadmin) | **60 minutos** (`JWT_ACCESS_EXP_MINUTES`, configurável — valor atual no `.env`) | Painel web, app balcão |
| Refresh token (owner, manager, cashier, superadmin) | 7 dias, com rotação | Renovação silenciosa via interceptor Axios |
| Access token (kiosk) | **12 horas** (hardcoded em `auth-service`) | Totem (sem refresh — ambiente controlado) |

- Refresh token rotation: token anterior invalidado a cada renovação
- Redis blacklist para revogação imediata (ex: operador removido)

### QR Code (HMAC-SHA256)

```
payload  = "{ticket_code}|{product_name}|{order_ref}|{timestamp}"
qr_data  = "{payload}|{HMAC-SHA256(payload, QR_SECRET)}"
```

Validação no `collect_ticket`: HMAC recomputado e comparado com `hmac.compare_digest` (timing-safe) antes de qualquer acesso ao banco.

### Endpoints internos

Rotas `/internal/*` são bloqueadas no gateway — hoje no **Nginx** (`location ~ ^/internal/ { return 403; }` em `nginx.conf`), **Kong** em produção quando essa fase existir. Acessíveis apenas internamente, com o header `X-Internal-Secret` (validado com `secrets.compare_digest`).

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
| **To Do** | Branch `feature/<id>-descricao` criada a partir de `main` |
| **In Progress** | Código + testes unitários passando localmente; `ruff` + `mypy` limpos; PR aberta referenciando a história e os Gherkins |
| **Code Review** | PR revisada (hoje: pelo próprio autor); testes rodados localmente — CI não bloqueia hoje (ver §9) |
| **QA** | Todos os cenários Gherkin passando (hoje: validado localmente/manualmente — não existe staging ainda) |
| **Deploy** | Merge em `main`; validado rodando `docker compose up --build` local (pipeline de produção ainda não existe, ver §9) |

### Convenções de branch e commit

> **Fluxo real hoje** (não o modelo `develop`/`main` com 2 revisores que versões antigas deste doc descreviam): projeto de um único desenvolvedor, sem staging automatizado. Toda branch parte de `main`; a PR é revisada e mergeada pelo próprio autor; não há proteção de branch configurada no GitHub (sem revisor obrigatório, sem status check bloqueante). Fica documentado assim para não prometer um processo que não está em vigor — se o time crescer, esse é o primeiro ponto a formalizar (branch protection + revisor obrigatório).

```
feature/<id>-descricao   # trabalho novo
fix/<id>-descricao       # correção
sprint/<id(s)>-descricao # trabalho acumulado de mais de uma história
```

- Branch criada a partir de `main`
- Commits em PT-BR descrevendo o **porquê**, não o que
- PR referencia a história (`docs/stories/<ID>-*.md`) e os cenários Gherkin
- Merge direto em `main` (fast-forward ou merge commit) após CI e revisão — sem branch `develop` intermediária

---

## 9. Deploy em Produção

> **Status real (2026-08):** nada nesta seção está implementado ainda. Não existe ambiente de produção, staging, Kong, Aurora nem pipeline de deploy — só `.github/workflows/ci.yml` (lint + testes) roda hoje. A Fase 2 (produção/staging) está **deliberadamente bloqueada** até decisão explícita de seguir em frente; o que segue é a diretiva de como implementar quando essa fase começar, não uma descrição do estado atual. Ver `docs/ARQUITETURA.md` §14 (Decisões Pendentes).

### CI/CD Pipeline hoje

```
Push em qualquer branch / PR para main
  ci.yml → security checks → ruff + mypy (lint) → pytest --cov-fail-under=40 → build Docker
```

O job de testes e o de build só rodam se o lint passar (`needs: lint`) — hoje o lint falha em `main` por uma dívida técnica pré-existente (~579 erros ruff, não é regressão de nenhuma PR específica), então **o job de testes não roda no CI atualmente**; validação de testes é feita localmente/manualmente antes do merge. Sem branch protection configurada, isso não bloqueia merges.

### CI/CD Pipeline — alvo pra quando a Fase 2 começar

```
Push feature/*
  ci.yml → ruff → mypy → pytest (unit + integration) → build Docker

PR para main
  ci.yml + testes de isolamento multi-tenant

Merge em main → staging
  deploy-staging.yml
    → build → push ECR
    → deck sync infra/kong/kong.yml
    → alembic upgrade head  (bloqueia o deploy se falhar)
    → deploy ECS blue/green (staging)

Promoção manual staging → produção
  deploy-prod.yml
    → build → push ECR
    → deck sync kong.yml
    → alembic upgrade head
    → deploy ECS blue/green
    → healthcheck 60s → rollback automático se falhar
    → evento de deploy registrado no Datadog
```

- Autenticação AWS via **OIDC** (GitHub Actions — sem chaves de longa duração)
- Kong config versionada em `infra/kong/kong.yml` (arquivo ainda não existe); `deck sync` no CI a cada deploy
- Módulos Terraform em `infra/modules/` — hoje só `secrets/` e `ecs/` (parcial) existem; `networking, rds, elasticache, sqs, ecr, kong, alb, waf` ainda não foram escritos

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
