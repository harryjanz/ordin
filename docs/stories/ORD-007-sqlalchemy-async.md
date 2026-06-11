---
id: ORD-007
status: Done
fase: 1
sprint: 2
responsavel: Backend SR
---

# ORD-007 — Migrar SQLAlchemy para AsyncSession + aiomysql

## História
Como desenvolvedor do time, quero que todas as queries ao banco usem `AsyncSession` do SQLAlchemy, para que o event loop do FastAPI não seja bloqueado durante operações de I/O e o serviço mantenha throughput adequado sob carga.

## Contexto e motivação
Todos os 5 serviços usam `Session` síncrono dentro de handlers `async def`. Cada query bloqueia o event loop inteiro do Python enquanto espera o banco responder — com carga real (múltiplos totens simultâneos), uma query lenta de 200ms bloqueia todas as outras requisições. Com `AsyncSession` + `aiomysql`, as queries são awaited sem bloquear o loop. Isso é essencial para Aurora Serverless v2 + RDS Proxy na Fase 2, onde conexões síncronas esgotariam o pool rapidamente.

> **Aviso de escopo (levantado no Tech Explorer):** esta história toca os 5 serviços simultaneamente e, sem testes automatizados (ORD-016), qualquer regressão só será detectada manualmente. Considerar executar ORD-016 (testes) em paralelo ou logo após, e manter a versão síncrona em branch de segurança.

## Dependências
- **Requerido por:** ORD-011 (CI com pytest assíncrono) 
- **Relacionada:** ORD-016 (testes de integração — valida que a migração não introduziu regressões)

## Cenários de Teste (Gherkin)

```gherkin
Feature: ORD-007 — AsyncSession em todos os serviços

  Scenario: POST /orders funciona com AsyncSession
    Dado que order-service usa AsyncSession
    Quando envio POST /orders com token JWT válido e items
    Então recebo HTTP 201 com order_ref
    E o pedido existe no banco com company_id correto

  Scenario: SELECT FOR UPDATE funciona com AsyncSession
    Dado que dois requests simultâneos tentam coletar o mesmo ticket
    Quando ambos chamam POST /tickets/{code}/collect ao mesmo tempo
    Então apenas um retorna 200 e o outro retorna 409
    E o SELECT FOR UPDATE evita dupla coleta

  Scenario: Transação com múltiplas operações é atômica
    Dado que create_order cria Order + OrderItems + Tickets em uma transação
    Quando o banco falha no meio da criação dos Tickets
    Então nenhum registro é persistido (rollback completo)

  Scenario: GET /payments retorna dados corretos com AsyncSession
    Dado que existem transações no banco para company_id=1
    Quando envio GET /payments com JWT da empresa 1
    Então recebo apenas as transações da empresa 1

  Scenario: Conexão assíncrona com pool funciona sob carga
    Dado que 10 requests simultâneos chegam ao order-service
    Quando todos chamam POST /orders ao mesmo tempo
    Então todos recebem resposta (nenhum timeout por esgotamento de pool)
    E cada pedido tem company_id correto do JWT
```

## Solução Técnica

### Dependências — adicionar ao requirements.txt

```
aiomysql==0.2.0
```

### Padrão de migração (igual para os 5 serviços)

**Antes (síncrono):**
```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

engine = create_engine(DB_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()
```

**Depois (assíncrono):**
```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

DB_URL_ASYNC = DB_URL.replace("mysql+pymysql://", "mysql+aiomysql://")
engine = create_async_engine(DB_URL_ASYNC, pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as db:
        yield db
```

> A substituição de `pymysql` → `aiomysql` na URL pode ser feita com `.replace()` ou configurando `DB_URL_ASYNC` diretamente. Opção mais robusta: usar `require_env("DB_URL")` com `aiomysql` e ajustar as strings em `.env`.

### Handlers — padrão de queries

**Antes:**
```python
def create_order(body: OrderIn, db: Session = Depends(get_db), ...):
    order = db.query(Order).filter_by(company_id=...).first()
    db.add(order); db.commit(); db.refresh(order)
```

**Depois:**
```python
from sqlalchemy import select

async def create_order(body: OrderIn, db: AsyncSession = Depends(get_db), ...):
    result = await db.execute(select(Order).filter_by(company_id=...))
    order = result.scalars().first()
    db.add(order); await db.commit(); await db.refresh(order)
```

Operações que mudam:
| Síncrono | Assíncrono |
|---|---|
| `db.query(Model).filter_by(...)` | `(await db.execute(select(Model).filter_by(...))).scalars()` |
| `db.get(Model, id)` | `await db.get(Model, id)` |
| `db.add(obj)` | `db.add(obj)` (síncrono) |
| `db.commit()` | `await db.commit()` |
| `db.refresh(obj)` | `await db.refresh(obj)` |
| `db.flush()` | `await db.flush()` |
| `.with_for_update()` | `.with_for_update()` (mantém) |

### SELECT FOR UPDATE com AsyncSession

```python
result = await db.execute(
    select(Ticket)
    .filter(Ticket.ticket_code == ticket_code)
    .with_for_update()
)
ticket = result.scalars().first()
```

### Alembic env.py — usar engine síncrono para migrations

O Alembic continua usando engine síncrono (pymysql) para as migrations. Apenas o runtime FastAPI usa aiomysql. O `migrations/env.py` não precisa mudar.

### Estimativa
- **Backend SR:** 8h (5 serviços × ~1.5h cada + testes manuais de integração)

### Riscos
- **ALTO:** Refatoração extensa sem cobertura de testes automatizados. Cada handler precisa ser testado manualmente.
  → **Mitigação:** fazer uma história de cada vez, `docker compose up` e testar os endpoints críticos após cada serviço
- **Médio:** `expire_on_commit=False` no AsyncSession muda o comportamento de lazy loading
  → **Mitigação:** usar `selectinload` explícito para relacionamentos (ex: `Order.items`)
- **Baixo:** `aiomysql` não está no requirements.txt atual
  → **Mitigação:** adicionar `aiomysql==0.2.0` antes de iniciar

## Critérios de aceite funcionais
- [x] Nenhum `Session` síncrono nos 5 serviços (apenas `AsyncSession`)
- [x] Nenhum `create_engine` síncrono no runtime (apenas `create_async_engine`)
- [x] `POST /orders` e `POST /payments` retornam 201 corretamente
- [x] `SELECT FOR UPDATE` em `collect_ticket` continua evitando dupla coleta
- [x] `GET /health` retorna 200 em todos os serviços
- [x] `docker compose up` sobe todos os serviços sem erros de import ou conexão
