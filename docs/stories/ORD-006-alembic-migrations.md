---
id: ORD-006
status: Done
fase: 1
sprint: 2
responsavel: Backend SR
---

# ORD-006 — Introduzir Alembic em todos os serviços (remover create_all)

## História
Como desenvolvedor do time, quero que o schema do banco seja gerenciado por migrations Alembic em vez de `create_all()`, para que mudanças de schema sejam versionadas, reversíveis e aplicadas de forma controlada em qualquer ambiente.

## Contexto e motivação
Todos os 5 serviços criam tabelas com `Base.metadata.create_all(engine)` no startup. Isso funciona para desenvolvimento mas impede controle de schema em produção: sem migrations, um `ALTER TABLE` numa coluna exige downtime manual ou script ad-hoc. Alembic é o pré-requisito direto de ORD-009 (adicionar `pin_hash` via migration) e de qualquer evolução futura de schema.

## Decisão de arquitetura
- **Alembic é o único dono do schema.** `create_all()` é removido de todos os serviços.
- **`init.sql` simplificado:** mantém apenas criação de bancos/usuários/grants. Tabelas e seeds migram para Alembic.
- **Seeds como migration:** uma segunda migration `002_seed_initial` insere os dados demo via `op.execute()`. Isso garante que seeds rodem na ordem certa (após as tabelas existirem).
- **Entrypoint do Dockerfile:** `alembic upgrade head && uvicorn main:app ...` — migrations rodam antes do serviço subir.
- **Convenção de nome:** `YYYYMMDD_HHMM_descricao.py` (ex: `20260611_0900_initial_schema.py`).

## Dependências
- **Precede:** ORD-009 (PIN bcrypt — precisa de migration para adicionar pin_hash)
- **Precede:** ORD-011 (CI — testes de integração precisam de schema via Alembic)

## Cenários de Teste (Gherkin)

```gherkin
Feature: ORD-006 — Alembic migrations

  Scenario: docker compose up cria schema via Alembic em banco vazio
    Dado que o volume mysql_data não existe (banco vazio)
    Quando executo docker compose up
    Então o auth-service aplica migration 001 e 002 sem erro
    E a tabela refresh_tokens existe no fk_auth
    E os dados de seed existem em fk_company e fk_catalog

  Scenario: Alembic não recria tabelas em banco já migrado
    Dado que o banco já passou pela migration 001
    Quando o serviço reinicia e roda alembic upgrade head
    Então não ocorre erro de "tabela já existe"
    E alembic_version registra a revisão mais recente

  Scenario: Rollback de migration funciona
    Dado que a migration 002 foi aplicada
    Quando executo alembic downgrade -1
    Então a migration 002 é revertida sem erro
    E alembic_version registra a revisão 001

  Scenario: Serviço não sobe se migration falhar
    Dado que o banco está inacessível durante o startup
    Quando o entrypoint tenta rodar alembic upgrade head
    Então o container termina com código de saída diferente de zero
    E o serviço não inicia o uvicorn

  Scenario: create_all foi removido de todos os serviços
    Quando analiso o código dos 5 serviços
    Então nenhum arquivo main.py contém Base.metadata.create_all
```

## Solução Técnica

### Estrutura por serviço

```
services/<nome>/
  alembic.ini
  migrations/
    env.py
    script.py.mako
    versions/
      20260611_0900_initial_schema.py
      20260611_0901_seed_initial.py
  main.py   ← remove create_all
  Dockerfile ← atualiza CMD/entrypoint
```

### `alembic.ini` (mesmo padrão para os 5 serviços, só muda sqlalchemy.url)

```ini
[alembic]
script_location = migrations
file_template = %%(year)d%%(month)02d%%(day)02d_%%(hour)02d%%(minute)02d_%%(slug)s
sqlalchemy.url = driver://user:pass@localhost/dbname
```

A URL real vem de variável de ambiente em `migrations/env.py`:

```python
# migrations/env.py
from config import require_env
config.set_main_option("sqlalchemy.url", require_env("DB_URL"))
```

### `migrations/env.py` — padrão

```python
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
from config import require_env
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from main import Base

config = context.config
config.set_main_option("sqlalchemy.url", require_env("DB_URL"))
if config.config_file_name:
    fileConfig(config.config_file_name)
target_metadata = Base.metadata

def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()

run_migrations_online()
```

### Migration 001 — initial schema

Gerada com `alembic revision --autogenerate -m "initial_schema"`. Conteúdo igual ao CREATE TABLE atual mas via Alembic ops. Cada serviço tem sua própria migration refletindo apenas o schema do seu banco.

### Migration 002 — seed inicial (apenas nos serviços company e catalog)

```python
# services/company/migrations/versions/20260611_0901_seed_initial.py
def upgrade():
    op.execute("""
        INSERT IGNORE INTO companies (id,name,document,pin,plan,active) VALUES
        (1,'Burger House','12.345.678/0001-99','1234','pro',1), ...
    """)
    op.execute("""INSERT IGNORE INTO users ...""")
    op.execute("""INSERT IGNORE INTO terminals ...""")

def downgrade():
    op.execute("DELETE FROM users WHERE id <= 7")
    op.execute("DELETE FROM terminals WHERE id <= 3")
    op.execute("DELETE FROM companies WHERE id <= 3")
```

> **Nota:** após ORD-009 (PIN bcrypt), a migration 002 do company-service será atualizada para inserir `pin_hash` em vez de `pin` plaintext.

### Dockerfile — entrypoint atualizado

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 800X"]
```

### `init.sql` simplificado

Remove todas as cláusulas CREATE TABLE e INSERT. Mantém apenas:
```sql
CREATE DATABASE IF NOT EXISTS fk_auth;
...
CREATE USER IF NOT EXISTS 'fk_auth'@'%' ...;
GRANT ALL ON fk_auth.* TO 'fk_auth'@'%';
...
FLUSH PRIVILEGES;
```

### `requirements.txt` — adicionar alembic

```
alembic==1.13.1
```

### Estimativa
- **Backend SR:** 6h (alembic.ini + env.py para 5 serviços + migrations iniciais + seeds + Dockerfiles + init.sql simplificado)

### Riscos
- **Risco:** `alembic revision --autogenerate` pode gerar ops desnecessários se o modelo Python divergir das tabelas do init.sql
  → **Mitigação:** gerar autogenerate com banco limpo, revisar diff antes de commitar
- **Risco:** Ordem de startup no docker-compose — se MySQL não estiver pronto, `alembic upgrade head` falha
  → **Mitigação:** `depends_on: mysql: condition: service_healthy` já está no docker-compose (✓)

## Critérios de aceite funcionais
- [x] `Base.metadata.create_all()` removido dos 5 `main.py`
- [x] `docker compose up` com volume vazio cria todas as tabelas e seeds via Alembic
- [x] `alembic upgrade head` é idempotente (pode rodar múltiplas vezes sem erro)
- [x] `alembic downgrade -1` funciona sem erro para todos os serviços
- [x] `alembic_version` existe em cada banco após startup
- [x] `init.sql` não contém mais CREATE TABLE
