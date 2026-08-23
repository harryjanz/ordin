# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Ordin** (também chamado FoodKiosk) é uma plataforma de autoatendimento para food service multi-tenant. Cinco microsserviços FastAPI + frontends React/React Native. Gateway Nginx localmente, Kong em produção.

## Comandos

```bash
# Stack completa
docker compose up --build

# Serviço específico
docker compose up --build auth-service
docker compose logs -f order-service

# Rodar um serviço localmente (sem Docker)
cd services/<nome>
pip install -r requirements.txt          # cada serviço tem seu próprio requirements.txt
uvicorn main:app --reload --port 800X

# Migrations (cada serviço tem seu próprio alembic.ini)
cd services/<nome>
alembic upgrade head
alembic downgrade -1
alembic revision --autogenerate -m "desc"   # convenção: YYYYMMDD_HHMM_descricao.py

# Fotos do catálogo de demonstração da Burger House (ORD-117) — passo manual,
# opcional, roda depois da migration de seed (que só cria as linhas sem
# imagem). Migrations não fazem I/O de rede neste projeto.
cd services/catalog
python -m scripts.seed_demo_images

# Lint e type check
ruff check services/
mypy services/<nome>/

# Testes
pytest services/<nome>/tests/ -v
pytest services/<nome>/tests/unit/ -v
pytest services/<nome>/tests/integration/ -v

# E2E (Playwright) — ORD_ID aponta a evidência pra pasta certa da história
ORD_ID=ORD-XXX npx playwright test
```

O gateway Nginx fica em `http://localhost:8000`. Cada serviço também expõe sua porta diretamente (8001–8005).

**Evidências de teste (regra permanente, vale para toda história):** screenshots, vídeos e traces do Playwright, e prints de validação manual de QA, são salvos **dentro do repositório** em `docs/stories/<ID>/evidencias/` — nunca em diretório temporário fora do projeto. Detalhe da convenção em `docs/roles/qa.md`; critério de saída obrigatório no step QA do downstream (`docs/WORKFLOW.md`).

## Arquitetura

### Microsserviços

| Serviço | Porta | Banco (`fk_*`) | Responsabilidade |
|---------|-------|----------------|-----------------|
| `auth` | 8001 | `fk_auth` | JWT (access 60min via `JWT_ACCESS_EXP_MINUTES`, configurável + kiosk 12h hardcoded + refresh 7d), PIN login, rate limiting Redis |
| `company` | 8002 | `fk_company` | Multi-tenant: empresas, usuários, terminais; endpoints `/internal/*` para auth |
| `catalog` | 8003 | `fk_catalog` | Catálogo de produtos: categorias e produtos por empresa |
| `order` | 8004 | `fk_order` | Pedidos, tickets por unidade, WebSocket tempo real, QR com HMAC |
| `payment` | 8005 | `fk_payment` | PayGo TEF (atualmente mockado 95% aprovação); notifica order-service |
| `notification` | 8006 | — (stateless) | E-mail transacional (convite/definição de senha, ORD-087); sem rota pública, só `/internal/send-invite` via `X-Internal-Secret` |

**Estado atual:** cada serviço é um `main.py` monolítico com SQLAlchemy async. **Estado alvo** (definido em `docs/ARQUITETURA.md`): Clean Architecture em 4 camadas — `domain / application / infrastructure / interfaces` — com referência de implementação em `ms-payment/`. As migrations correm via Alembic no startup do container (`alembic upgrade head && uvicorn ...`).

### Fluxo de autenticação

- **Totem:** `POST /auth/pin-login` → auth-service chama company-service internamente (`POST /internal/verify-pin`) → retorna JWT com `role: kiosk`, `company_id`, `terminal_id`
- **Admin/caixa:** `POST /auth/login` → auth-service chama `POST /internal/verify-credentials` → retorna access + refresh tokens
- **Rate limiting:** 5 tentativas de PIN erradas → IP bloqueado 15 min (Redis `pin_attempts:{ip}:{md5(pin)}`)
- **Revogação imediata:** Redis blacklist (ex: operador removido da empresa invalida token instantaneamente)

### Fluxo de pedido

1. Totem cria pedido → `POST /orders` (gera 1 ticket por unidade de item, QR assinado com HMAC-SHA256)
2. Totem paga → `POST /payments` → payment-service notifica order via `PATCH /internal/orders/{ref}/status`
3. Caixa coleta ticket → `POST /tickets/{code}/collect` com `SELECT FOR UPDATE` (previne dupla coleta)
4. Quando todos os tickets de um pedido são coletados → ordem marcada automaticamente como `completed`

**QR format:** `{ticket_code}|{product_name}|{order_ref}|{timestamp}|{HMAC-SHA256(payload, QR_SECRET)}` (confirmado em `_make_qr_data()`, `services/order/main.py`)

### WebSocket

`ws://host:8004/ws/orders?company_id=X` — emite `ticket.collected`, `order.completed`, `order.created` agrupados por empresa. Heartbeat 30s.

### Comunicação interna entre serviços

Rotas `/internal/*` são bloqueadas no Nginx/Kong — acessíveis apenas via VPC com header `X-Internal-Secret`.

| Chamada | Quem chama | Endpoint |
|---------|-----------|---------|
| Validar PIN do totem | auth → company | `POST /internal/verify-pin` |
| Verificar credenciais admin | auth → company | `POST /internal/verify-credentials` |
| Atualizar status do pedido | payment → order | `PATCH /internal/orders/{ref}/status` |

### Multi-tenancy

`company_id` é **sempre** extraído do JWT, nunca do body ou query string. Toda tabela de negócio tem `company_id NOT NULL` com índice. O CI tem testes obrigatórios verificando que empresa A não acessa dados da empresa B (ORD-017).

### Filas assíncronas

**Local:** RabbitMQ. **Produção:** SQS FIFO (pagamentos: `payment.approved/refused/cancelled`) + SQS Standard (volume: `order.created`, `ticket.collected`) + SNS fan-out. A interface `IMessageBroker` no `domain` abstrai as implementações — `RabbitMQBroker` (local) e `SQSBroker` (prod) são injetadas no startup.

### Shared utilities (`services/shared/`)

- `auth.py` — `TokenPayload` (sub, company_id, role, terminal_id) + `get_current_user()` dependency FastAPI
- `config.py` — `require_env(name)` (falha no startup se ausente) + `get_cors_origins()` (parseia CORS_ORIGINS)

Cada serviço copia ou importa esses utilitários. `services/requirements.txt` é compartilhado entre os serviços.

## Variáveis de Ambiente

Copie `.env.example` para `.env`. Variáveis obrigatórias:

```
# DB (uma por serviço, driver aiomysql)
AUTH_DB_URL=mysql+aiomysql://fk_auth:PASSWORD@mysql:3306/fk_auth?charset=utf8mb4
COMPANY_DB_URL=...  CATALOG_DB_URL=...  ORDER_DB_URL=...  PAYMENT_DB_URL=...

# Auth
JWT_SECRET=<hex 32 chars>
JWT_ACCESS_EXP_MINUTES=60
JWT_REFRESH_EXP_DAYS=7

# Segurança
QR_SECRET=<hex 32 chars>            # assina QR codes dos tickets
INTERNAL_SECRET=<hex 32 chars>      # header X-Internal-Secret entre serviços

# Infraestrutura
REDIS_URL=redis://redis:6379/0
RABBITMQ_URL=amqp://ordin:PASSWORD@rabbitmq:5672/

# URLs internas
COMPANY_SERVICE_URL=http://company-service:8002
ORDER_SERVICE_URL=http://order-service:8004

CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

## Frontend

Arquivos standalone em `frontend/` — componentes React para uso direto (ex: Claude Artifacts):

| Arquivo | Descrição |
|---------|-----------|
| `totem-v3.tsx` | Fluxo completo do totem: PIN → terminal → catálogo → carrinho → pagamento → tickets/QR |
| `balcao-app.tsx` | App React Native (Expo) do operador de balcão: QR scan, coleta de tickets, feedback sonoro/háptico |
| `admin-panel-v3.tsx` | Painel admin: CRUD empresas/terminais/usuários/catálogo, monitoramento TEF |

Stack: React 18 + TypeScript, Zustand (estado), Axios (HTTP), Expo (mobile), AsyncStorage.

## Banco de Dados

`init.sql` cria os 5 bancos MySQL (`fk_auth/company/catalog/order/payment`), usuários com grants, e seed data de desenvolvimento:
- Empresas demo: Burger House (PIN 184623), Pasta & Co (507219), Sweet Corner (936845) — PIN do totem tem 6 dígitos (ORD-109; os PINs de 4 dígitos originais da seed inicial foram substituídos numa migration posterior pra bater com o tamanho gerado por regenerate-pin)
- 3 terminais e usuário admin: carlos@burgerhouse.com / burger123

O schema canônico e as migrations ficam em `services/<nome>/migrations/`. O `init.sql` não define schema de tabelas — isso é responsabilidade do Alembic.

## Infraestrutura (Produção)

Terraform modular em `infra/modules/` (`ecs/`, `secrets/`). Arquitetura AWS alvo:

```
Route 53 → ACM → ALB + WAF (OWASP Top 10)
  └── Kong ECS Fargate (config declarativa: infra/kong/kong.yml, aplicada via deck sync)
        └── 5 serviços ECS Fargate
Aurora MySQL Serverless v2 + RDS Proxy
ElastiCache Redis | SQS FIFO + SQS Standard + SNS | ECR (1 repo/serviço)
Datadog APM + logs | Secrets Manager (ordin/{env}/db/{svc}, jwt_secret, qr_secret, internal_secret)
```

**Deploy:** blue/green via ECS + CodeDeploy. Secrets injetados via Secrets Manager — nunca em texto na task definition. OIDC GitHub Actions (sem chaves de longa duração).

## Regra de implementação obrigatória

**Nunca escrever código de produção para uma história antes de ela estar `Ready`.**

O fluxo obrigatório antes de qualquer implementação:
```
[ New ] → [ Explorer ] → [ QA Explorer ] → [ Tech Explorer ] → [ Ready ]
```

Ao iniciar uma sprint ou receber um pedido de implementação:
1. Verificar o status de cada história em `docs/stories/ORD-xxx.md`
2. **Se qualquer história da sprint não estiver `Ready`: TRAVAR o início da sprint**
   - Listar quais histórias estão bloqueadas e em qual fase do upstream estão
   - Não escrever nenhuma linha de código até o problema ser resolvido
   - Rodar o upstream das histórias pendentes (Explorer → QA Explorer → Tech Explorer → Ready)
3. Só após **todas** as histórias da sprint estarem `Ready` → começar a implementar

Referência completa: `docs/WORKFLOW.md`.

## Documentação

`docs/` é o repositório de decisões arquiteturais e contexto de trabalho:

- **`ARQUITETURA.md`** — documento autoritativo: stack, Clean Architecture alvo, Kong plugins, multi-tenancy, QR, filas, SLOs, segurança. Ler antes de qualquer mudança estrutural.
- **`WORKFLOW.md`** — fluxo upstream/downstream completo com a regra de Ready obrigatório.
- **`roles/`** — guias por papel: `backend-sr.md`, `frontend.md`, `devops.md`, `qa.md`, `pm.md`, `security.md`
- **`stories/ORD-xxx.md`** — contexto de cada issue implementada (credentials, JWT, bcrypt, QR, Alembic, Kong, etc.)
