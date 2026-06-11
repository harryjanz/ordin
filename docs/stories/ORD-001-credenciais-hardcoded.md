---
id: ORD-001
status: Done
fase: 1
sprint: 1
responsavel: Backend SR + DevOps
---

# ORD-001 — Remover credenciais hardcoded e centralizar no Secrets Manager

## História
Como operador da plataforma, quero que nenhuma credencial de acesso esteja hardcoded no código ou no histórico do git, para que um vazamento do repositório não comprometa os bancos de dados e os serviços em produção.

## Contexto e motivação
Requisitos S1, S2 e S3 de `docs/ARQUITETURA.md` §12 — bloqueiam o primeiro deploy em produção. As senhas estão em texto puro no código e no `init.sql`, o que significa que qualquer pessoa com acesso de leitura ao repositório tem acesso total aos bancos de dados. Em produção com Aurora, isso seria catastrófico.

## Inventário completo de credenciais hardcoded

| Arquivo | Linha | Credencial |
|---|---|---|
| `init.sql` | 8 | `fk_auth` → senha `auth_pass` |
| `init.sql` | 9 | `fk_company` → senha `company_pass` |
| `init.sql` | 10 | `fk_catalog` → senha `catalog_pass` |
| `init.sql` | 11 | `fk_order` → senha `order_pass` |
| `init.sql` | 12 | `fk_payment` → senha `payment_pass` |
| `services/auth/main.py` | 40 | `DB_URL` com `fk_auth:auth_pass` |
| `services/auth/main.py` | 61 | `JWT_SECRET` fallback `"dev-secret"` |
| `services/company/main.py` | 15 | `DB_URL` com `fk_company:company_pass` |
| `services/catalog/main.py` | 13 | `DB_URL` com `fk_catalog:catalog_pass` |
| `services/order/main.py` | 15 | `DB_URL` com `fk_order:order_pass` |
| `services/payment/main.py` | 14 | `DB_URL` com `fk_payment:payment_pass` |

Adicionalmente, `QR_SECRET` (necessário para ORD-010) ainda não existe e precisa ser provisionado aqui.

## Fluxo principal — como ficará após a história

1. DevOps provisiona os secrets no AWS Secrets Manager via Terraform (módulo `secrets`):
   - `ordin/{env}/db/auth` → `{ "url": "mysql+aiomysql://..." }`
   - `ordin/{env}/db/company`, `/db/catalog`, `/db/order`, `/db/payment`
   - `ordin/{env}/jwt_secret` → `{ "secret": "<gerado>" }`
   - `ordin/{env}/qr_secret` → `{ "secret": "<gerado>" }`
2. ECS task definitions referenciam os secrets via bloco `secrets` — AWS injeta como variáveis de ambiente nos containers
3. Cada serviço lê `os.getenv("DB_URL")` e `os.getenv("JWT_SECRET")` sem fallback hardcoded
4. Startup falha com `ValueError` e mensagem clara se variável obrigatória estiver ausente
5. Localmente: `.env` contém as credenciais de desenvolvimento (nunca commitado)
6. `.env.example` documenta todas as variáveis com valores placeholder

## Fluxo local (docker compose — não muda o comportamento)
- `.env` continua sendo carregado pelo `docker-compose.yml`
- Senhas locais em `.env` podem ser simples (ex: `auth_pass`) — ambiente controlado
- `init.sql` mantém senhas locais fixas para facilitar o dev local (não vai para AWS)

## Dependências
- **Precede:** ORD-010 (QR_SECRET precisa existir no SM antes de ser usado)
- **Relacionada:** ORD-008 (Aurora staging — os secrets de prod precisam existir antes do primeiro deploy)
- **Relacionada:** ORD-014 (deploy-staging.yml injeta secrets via task definition)

## Cenários de Teste (Gherkin)

```gherkin
Feature: ORD-001 — Nenhuma credencial hardcoded no código ou repositório
  Como operador da plataforma
  Quero que nenhuma credencial esteja hardcoded no código
  Para que um vazamento do repositório não comprometa os bancos em produção

  # ─────────────────────────────────────────────
  # ANÁLISE ESTÁTICA — verificações no código-fonte
  # ─────────────────────────────────────────────

  Scenario: Nenhuma senha de banco existe no código-fonte
    Dado que o repositório ordin está clonado localmente
    Quando executo grep -r "auth_pass|company_pass|catalog_pass|order_pass|payment_pass" services/
    Então o resultado deve ser vazio (zero ocorrências)

  Scenario: JWT_SECRET não possui fallback hardcoded
    Dado que o repositório ordin está clonado localmente
    Quando executo grep -r "dev-secret" services/
    Então o resultado deve ser vazio (zero ocorrências)

  Scenario: Nenhuma credencial hardcoded no init.sql
    Dado que o repositório ordin está clonado localmente
    Quando executo grep -n "IDENTIFIED BY" init.sql
    Então nenhuma linha deve conter senha em texto puro
    E as senhas devem ser referenciadas por variável de ambiente ou estarem documentadas como somente-local

  Scenario: .env não está versionado no repositório
    Dado que o repositório ordin está clonado localmente
    Quando executo git ls-files .env
    Então o resultado deve ser vazio
    E o arquivo .gitignore deve conter a entrada ".env"

  Scenario: .env.example existe com todas as variáveis obrigatórias
    Dado que o repositório ordin está clonado localmente
    Quando leio o arquivo .env.example
    Então ele deve conter as variáveis: DB_URL, JWT_SECRET, QR_SECRET, REDIS_URL, COMPANY_SERVICE_URL, ORDER_SERVICE_URL
    E nenhum valor real deve estar preenchido — apenas placeholders como "your-secret-here"

  # ─────────────────────────────────────────────
  # COMPORTAMENTO DE STARTUP — testes de integração
  # ─────────────────────────────────────────────

  Scenario: Serviço inicia normalmente quando todas as variáveis obrigatórias estão presentes
    Dado que DB_URL está definido como variável de ambiente com uma URL válida
    E JWT_SECRET está definido (apenas auth-service)
    Quando o serviço é iniciado
    Então o endpoint GET /health retorna status 200
    E o campo "status" da resposta é "ok"

  Scenario: Serviço falha no startup quando DB_URL está ausente
    Dado que a variável de ambiente DB_URL não está definida
    Quando o serviço é iniciado
    Então o processo termina com código de saída diferente de zero
    E a mensagem de erro contém "DB_URL" e indica que a variável é obrigatória
    E nenhuma porta é aberta (serviço não sobe parcialmente)

  Scenario: auth-service falha no startup quando JWT_SECRET está ausente
    Dado que a variável de ambiente JWT_SECRET não está definida
    Quando o auth-service é iniciado
    Então o processo termina com código de saída diferente de zero
    E a mensagem de erro contém "JWT_SECRET" e indica que a variável é obrigatória

  Scenario: auth-service falha no startup quando JWT_SECRET é string vazia
    Dado que a variável de ambiente JWT_SECRET está definida como string vazia ""
    Quando o auth-service é iniciado
    Então o processo termina com código de saída diferente de zero
    E a mensagem de erro indica que JWT_SECRET não pode ser vazio

  # ─────────────────────────────────────────────
  # DESENVOLVIMENTO LOCAL — docker compose
  # ─────────────────────────────────────────────

  Scenario: docker compose up continua funcionando com .env local
    Dado que o arquivo .env existe localmente com credenciais de desenvolvimento
    Quando executo docker compose up -d
    Então todos os serviços sobem sem erro
    E GET http://localhost:8000/health retorna status 200
    E o fluxo de login com PIN funciona normalmente

  Scenario: Novo desenvolvedor consegue rodar o projeto seguindo o .env.example
    Dado que um desenvolvedor copiou .env.example para .env
    E preencheu os valores de desenvolvimento (banco local, secrets fictícios)
    Quando executa docker compose up -d
    Então todos os serviços sobem sem erro de configuração

  # ─────────────────────────────────────────────
  # INFRAESTRUTURA AWS — validação de Secrets Manager e ECS
  # ─────────────────────────────────────────────

  Scenario: Todos os secrets obrigatórios existem no Secrets Manager de staging
    Dado que o Terraform foi aplicado no ambiente staging
    Quando listo os secrets via AWS CLI: aws secretsmanager list-secrets
    Então os seguintes secrets devem existir:
      | ordin/staging/db/auth     |
      | ordin/staging/db/company  |
      | ordin/staging/db/catalog  |
      | ordin/staging/db/order    |
      | ordin/staging/db/payment  |
      | ordin/staging/jwt_secret  |
      | ordin/staging/qr_secret   |

  Scenario: QR_SECRET está provisionado no Secrets Manager
    Dado que o Terraform foi aplicado no ambiente staging
    Quando acesso o secret ordin/staging/qr_secret via AWS CLI
    Então ele existe e possui o campo "secret" com valor não vazio

  Scenario: ECS task definitions não expõem credenciais como environment em texto puro
    Dado que as task definitions ECS foram provisionadas via Terraform
    Quando inspeciono a task definition de qualquer serviço via AWS CLI
    Então o bloco "environment" não contém DB_URL, JWT_SECRET nem QR_SECRET
    E o bloco "secrets" referencia os ARNs do Secrets Manager para essas variáveis

  Scenario: Serviço em staging inicia e responde ao healthcheck com secrets do Secrets Manager
    Dado que os secrets estão provisionados no Secrets Manager de staging
    E a task definition ECS está configurada para injetar os secrets
    Quando o container sobe no ECS
    Então GET /health retorna status 200 para todos os serviços
    E nenhum log de startup contém as strings "auth_pass", "company_pass" ou "dev-secret"
```

## Solução Técnica

### Serviços impactados
- `services/auth/main.py` — remover DB_URL hardcoded (linha 40) e fallback JWT_SECRET (linha 61)
- `services/company/main.py` — remover DB_URL hardcoded (linha 15)
- `services/catalog/main.py` — remover DB_URL hardcoded (linha 13)
- `services/order/main.py` — remover DB_URL hardcoded (linha 15)
- `services/payment/main.py` — remover DB_URL hardcoded (linha 14)
- `docker-compose.yml` — mapear `DB_URL` por serviço a partir de variáveis do `.env`
- `infra/modules/secrets/` — novo módulo Terraform (Secrets Manager)
- `infra/modules/ecs/` — bloco `secrets` nas task definitions
- `.gitignore` — criar (não existe)
- `.env` — renomear para `.env.example`; criar novo `.env` para dev local

---

### 1. Helper `_require_env` — igual em todos os serviços

Criar `services/shared/config.py` (arquivo compartilhado copiado/symlink em cada serviço, ou repetido por ser simples):

```python
import os, sys

def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        print(f"FATAL: variável de ambiente obrigatória '{name}' não definida ou vazia.", file=sys.stderr)
        sys.exit(1)
    return value
```

---

### 2. Mudanças em cada `services/*/main.py`

**Antes (todos os serviços ~linha 13–15):**
```python
DB_URL = f"mysql+pymysql://fk_auth:auth_pass@{os.getenv('DB_HOST','mysql')}:3306/fk_auth?charset=utf8mb4"
```

**Depois:**
```python
from config import require_env
DB_URL = require_env("DB_URL")
```

**`services/auth/main.py` linha 61 — antes:**
```python
SECRET = os.getenv("JWT_SECRET", "dev-secret")
```

**Depois:**
```python
SECRET = require_env("JWT_SECRET")
```

---

### 3. `.env.example` (renomear o `.env` atual + completar)

```dotenv
# ─── Banco de dados (um DB_URL por serviço) ───────────────────────
AUTH_DB_URL=mysql+pymysql://fk_auth:SENHA_AQUI@mysql:3306/fk_auth?charset=utf8mb4
COMPANY_DB_URL=mysql+pymysql://fk_company:SENHA_AQUI@mysql:3306/fk_company?charset=utf8mb4
CATALOG_DB_URL=mysql+pymysql://fk_catalog:SENHA_AQUI@mysql:3306/fk_catalog?charset=utf8mb4
ORDER_DB_URL=mysql+pymysql://fk_order:SENHA_AQUI@mysql:3306/fk_order?charset=utf8mb4
PAYMENT_DB_URL=mysql+pymysql://fk_payment:SENHA_AQUI@mysql:3306/fk_payment?charset=utf8mb4

# ─── MySQL root (apenas docker-compose local) ────────────────────
MYSQL_ROOT_PASSWORD=SENHA_AQUI

# ─── Auth ────────────────────────────────────────────────────────
JWT_SECRET=GERE_COM_openssl_rand_hex_32
JWT_ACCESS_EXP_MINUTES=15
JWT_REFRESH_EXP_DAYS=7

# ─── QR Code ─────────────────────────────────────────────────────
QR_SECRET=GERE_COM_openssl_rand_hex_32

# ─── Comunicação interna ─────────────────────────────────────────
COMPANY_SERVICE_URL=http://company-service:8002
ORDER_SERVICE_URL=http://order-service:8004
INTERNAL_SECRET=GERE_COM_openssl_rand_hex_32

# ─── Redis ───────────────────────────────────────────────────────
REDIS_URL=redis://redis:6379/0

# ─── RabbitMQ (local) ────────────────────────────────────────────
RABBITMQ_URL=amqp://ordin:SENHA_AQUI@rabbitmq:5672/

# ─── PayGo ───────────────────────────────────────────────────────
PAYGO_SERVER_URL=http://localhost:8085
PAYGO_TOKEN=TOKEN_AQUI
```

---

### 4. `docker-compose.yml` — mapear `DB_URL` por serviço

Cada serviço ganha um bloco `environment` que mapeia a variável específica para `DB_URL`:

```yaml
auth-service:
  build: ./services/auth
  env_file: .env
  environment:
    DB_URL: ${AUTH_DB_URL}   # mapeia AUTH_DB_URL → DB_URL dentro do container
  ...

company-service:
  build: ./services/company
  env_file: .env
  environment:
    DB_URL: ${COMPANY_DB_URL}
  ...
```

Isso mantém `env_file: .env` funcionando e cada serviço recebe exatamente o `DB_URL` correto.

---

### 5. `.gitignore` — criar

```
.env
__pycache__/
*.pyc
.pytest_cache/
.mypy_cache/
.ruff_cache/
*.egg-info/
dist/
.venv/
venv/
```

---

### 6. Terraform — módulo `infra/modules/secrets/`

```hcl
# infra/modules/secrets/main.tf

locals {
  service_names = ["auth", "company", "catalog", "order", "payment"]
}

resource "aws_secretsmanager_secret" "db_url" {
  for_each = toset(local.service_names)
  name     = "ordin/${var.environment}/db/${each.key}"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name = "ordin/${var.environment}/jwt_secret"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret" "qr_secret" {
  name = "ordin/${var.environment}/qr_secret"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret" "internal_secret" {
  name = "ordin/${var.environment}/internal_secret"
  recovery_window_in_days = 7
}
```

> Os valores (`secret_string`) são preenchidos manualmente no primeiro setup ou via CI com variáveis protegidas — nunca no código Terraform.

---

### 7. ECS task definitions — bloco `secrets`

Em `infra/modules/ecs/task_definitions.tf`, cada serviço injeta `DB_URL` a partir do Secrets Manager:

```hcl
secrets = [
  {
    name      = "DB_URL"
    valueFrom = "${aws_secretsmanager_secret.db_url["auth"].arn}:url::"
  },
  # auth-service também injeta JWT_SECRET:
  {
    name      = "JWT_SECRET"
    valueFrom = "${aws_secretsmanager_secret.jwt_secret.arn}:secret::"
  }
]
```

Nunca usar o bloco `environment` para credenciais — `environment` aparece em texto puro no console AWS.

---

### 8. CI — step de detecção estática de credenciais

Adicionar ao `ci.yml` antes dos testes:

```yaml
- name: Verificar credenciais hardcoded
  run: |
    ! grep -rn "auth_pass\|company_pass\|catalog_pass\|order_pass\|payment_pass\|dev-secret" services/
```

O `!` inverte o exit code — falha se o grep encontrar qualquer ocorrência.

---

### Estimativa
- **Backend SR:** 3h (helper `require_env` + remover hardcoded em 5 serviços + `.env.example`)
- **DevOps:** 4h (`.gitignore`, `docker-compose.yml`, módulo Terraform `secrets`, task definitions ECS, step CI)

### Riscos
- **Risco:** desenvolvedor que clonar o repo após a mudança não terá `.env` — vai quebrar o `docker compose up`
  → **Mitigação:** `README.md` atualizado com instrução `cp .env.example .env` como primeiro passo do setup
- **Risco:** `init.sql` ainda tem senhas locais hardcoded — aceitável enquanto só é usado localmente; será removido quando ORD-006 (Alembic) introduzir migrations
  → **Decisão:** `init.sql` documentado como "somente dev local" no cabeçalho do arquivo

## Critérios de aceite funcionais
- [ ] `grep -r "auth_pass\|company_pass\|catalog_pass\|order_pass\|payment_pass\|dev-secret" services/` retorna zero resultados
- [ ] Startup de cada serviço lança `ValueError` com mensagem descritiva se `DB_URL` ou `JWT_SECRET` estiver ausente
- [ ] `.env` está no `.gitignore`; `.env.example` existe com variáveis e valores placeholder
- [ ] Terraform módulo `secrets` provisiona todos os entries no Secrets Manager
- [ ] ECS task definitions injetam os secrets como env vars via bloco `secrets` (não como `environment` em texto puro)
- [ ] `docker compose up` local continua funcionando com `.env`
- [ ] `QR_SECRET` provisionado no Secrets Manager (necessário para ORD-010)
