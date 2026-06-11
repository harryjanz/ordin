# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Ordin** (também conhecido como FoodKiosk) é uma plataforma de autoatendimento para food service composta por microsserviços Python/FastAPI e frontends React/React Native.

## Running the Stack

```bash
# Subir todos os serviços
docker compose up --build

# Subir um serviço específico
docker compose up --build auth-service

# Ver logs de um serviço
docker compose logs -f order-service
```

O gateway Nginx fica em `http://localhost:8000`. Cada serviço também expõe sua porta diretamente (8001–8005).

## Running a Single Service Locally

```bash
cd services/<nome-do-servico>
pip install -r ../requirements.txt
uvicorn main:app --reload --port 800X
```

O `requirements.txt` compartilhado fica em `services/requirements.txt`. Cada serviço usa seu próprio banco de dados MySQL (`fk_auth`, `fk_company`, `fk_catalog`, `fk_order`, `fk_payment`).

## Architecture

### Backend — Microsserviços FastAPI

Cada serviço vive em `services/<nome>/main.py` com SQLAlchemy (MySQL) e expõe endpoints REST. Não há framework de migrations — os modelos são criados via `Base.metadata.create_all()` no startup.

| Serviço | Porta | Responsabilidade |
|---|---|---|
| `auth` | 8001 | JWT (access 60min + refresh 7d), PIN login para totens, rate limiting via Redis |
| `company` | 8002 | Empresas, usuários, terminais; expõe endpoints `/internal/*` consumidos pelo auth |
| `catalog` | 8003 | Catálogo de produtos (serviço a implementar) |
| `order` | 8004 | Pedidos, tickets por unidade de item, WebSocket para notificações em tempo real |
| `payment` | 8005 | Integração PayGo TEF (simulada); notifica order-service ao aprovar/cancelar |

**Fluxo de autenticação:**
- Totem → `POST /auth/pin-login` → auth-service chama company-service internamente → retorna JWT com `role: kiosk`
- Admin/operador → `POST /auth/login` → auth-service chama company-service → retorna access + refresh tokens

**Fluxo de pedido:**
1. Totem cria pedido → `POST /orders` (order-service gera tickets individuais por unidade)
2. Totem processa pagamento → `POST /payments` (payment-service notifica order-service via `PATCH /orders/{ref}/status`)
3. Balcão coleta tickets → `POST /tickets/{code}/collect` com `SELECT FOR UPDATE` para evitar dupla coleta
4. Quando todos os tickets de um pedido são coletados, o pedido é marcado automaticamente como `completed`

**WebSocket** (order-service): `ws://host:8004/ws/orders?company_id=X` — emite eventos `ticket.collected`, `order.completed`, `order.created` agrupados por empresa. Heartbeat a cada 30s.

### Frontend

Os arquivos em `frontend/` são componentes React standalone (para uso em plataformas como Claude Artifacts ou similares):

- `totem-v3.tsx` — interface do totem de autoatendimento (fluxo PIN → terminal → catálogo → carrinho → pagamento → tickets/QR)
- `balcao-app.tsx` — app do operador de balcão para coleta de tickets via QR
- `admin-panel-v3.tsx` — painel administrativo (empresas, terminais, usuários, catálogo, TEF)
- `totem.tsx` / `totem-v3.tsx` — versões do totem

O `package.json` descreve um app Expo/React Native (para a versão mobile do balcão), usando Zustand para estado e Axios para chamadas HTTP.

### Nginx Gateway

`nginx.conf` roteia por prefixo de path para os serviços upstream. WebSocket (`/ws/`) tem proxy com upgrade configurado. CORS está habilitado globalmente no gateway e também em cada serviço FastAPI.

### Banco de Dados

`init.sql` cria os bancos, usuários MySQL com senhas hardcoded, tabelas e dados de seed:
- **Empresas demo:** Burger House (PIN 1234), Pasta & Co (PIN 5678), Sweet Corner (PIN 9999)
- **Terminais demo:** 3 terminais vinculados às empresas acima

As credenciais do banco são hardcoded em `init.sql` e referenciadas por string de conexão em cada `main.py`. Em produção, devem ser movidas para variáveis de ambiente.

## Environment Variables

O `docker-compose.yml` carrega `.env` para todos os serviços. Variáveis relevantes:

```
MYSQL_ROOT_PASSWORD=
DB_HOST=mysql
JWT_SECRET=
JWT_ACCESS_EXP_MINUTES=60
REDIS_URL=redis://redis:6379/0
COMPANY_SERVICE_URL=http://company-service:8002
ORDER_SERVICE_URL=http://order-service:8004
```

## Key Design Decisions

- **Sem migrations:** SQLAlchemy cria tabelas no startup; `init.sql` define o schema SQL canônico e seed data.
- **Autenticação delegada:** auth-service não tem banco de usuários próprio — ele delega verificação de credenciais e PINs para company-service via chamadas HTTP internas.
- **Tickets por unidade:** Cada unidade de um item gera um ticket independente com QR code único (`ticket_code`), permitindo coleta parcial.
- **Prevenção de dupla coleta:** `SELECT FOR UPDATE` no endpoint de coleta de ticket.
- **catalog-service:** Listado no `docker-compose.yml` mas sem código em `services/catalog/` — é o serviço a ser implementado.
