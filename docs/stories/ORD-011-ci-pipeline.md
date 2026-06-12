---
id: ORD-011
status: Done
fase: 1
sprint: 3
responsavel: DevOps + Backend SR
---

# ORD-011 — Pipeline CI com ruff + mypy + pytest + build Docker

## História
Como desenvolvedor do time, quero um pipeline de CI completo com lint, type check, testes e build Docker, para que nenhuma PR com código quebrado, sem tipos ou sem testes seja mergeada na branch principal.

## Contexto e motivação
O `ci.yml` atual tem lint (ruff), type check (mypy) e Docker build, mas **não tem pytest**. Sem o gate de testes, regressões chegam ao branch principal invisíveis. Esta história adiciona o job de pytest e configura a cobertura mínima. Depende de ORD-006 (Alembic configurado) e ORD-007 (AsyncSession) para que os testes de integração possam rodar contra o banco corretamente.

> **Sprint 3 (não Sprint 2):** posicionado após ORD-006/007 porque o ambiente de teste precisa de Alembic para criar o schema de teste e de AsyncSession para testes de integração assíncronos.

**Threshold de cobertura:** começa em 40% (realista para Sprint 3 antes de ORD-016) e sobe para 80% conforme ORD-016 (testes unitários) e ORD-018 (E2E) avançam.

## Dependências
- **Depende de:** ORD-006 (Alembic — schema via migration para banco de teste)
- **Depende de:** ORD-007 (AsyncSession — pytest-asyncio para testes assíncronos)
- **Precede:** ORD-016 (testes unitários — precisam do CI para rodar automaticamente)

## Cenários de Teste (Gherkin)

```gherkin
Feature: ORD-011 — CI Pipeline completo

  Scenario: PR com lint error não passa no CI
    Dado que uma PR tem um import não utilizado no código
    Quando o CI roda ruff check services/
    Então o job lint falha e a PR não pode ser mergeada

  Scenario: PR com teste falhando não passa no CI
    Dado que uma PR quebra um teste existente
    Quando o CI roda pytest
    Então o job test falha e bloqueia o merge

  Scenario: PR com cobertura abaixo do threshold não passa
    Dado que a cobertura cai abaixo de 40%
    Quando o CI roda pytest --cov com --cov-fail-under=40
    Então o job falha

  Scenario: PR limpa passa em todos os jobs
    Dado que código, tipos, testes e Docker estão corretos
    Quando o CI roda todos os jobs
    Então security → lint → test → build passam em sequência
    E a PR pode ser mergeada

  Scenario: Build Docker falha se Dockerfile tem erro
    Dado que um Dockerfile tem instrução inválida
    Quando o CI roda docker build
    Então o job build falha
```

## Solução Técnica

### CI atualizado — `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  security:
    name: Security checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Verificar credenciais hardcoded
        run: |
          ! grep -rn \
            "auth_pass\|company_pass\|catalog_pass\|order_pass\|payment_pass\|dev-secret" \
            services/

  lint:
    name: Lint & type check
    runs-on: ubuntu-latest
    needs: security
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - name: Install dependencies
        run: pip install ruff mypy
      - name: ruff
        run: ruff check services/
      - name: mypy
        run: mypy services/ --ignore-missing-imports

  test:
    name: Testes + cobertura
    runs-on: ubuntu-latest
    needs: lint
    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: test_root
          MYSQL_DATABASE: fk_test
        ports:
          - 3306:3306
        options: --health-cmd="mysqladmin ping" --health-interval=10s --health-retries=5
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - name: Install dependencies
        run: |
          pip install -r services/requirements.txt
          pip install pytest pytest-asyncio pytest-cov
      - name: Run tests
        env:
          AUTH_DB_URL: mysql+aiomysql://root:test_root@localhost:3306/fk_test
          JWT_SECRET: test-secret-ci
          INTERNAL_SECRET: test-internal-ci
          CORS_ORIGINS: http://localhost:3000
          REDIS_URL: redis://localhost:6379/0
          COMPANY_SERVICE_URL: http://localhost:8002
          QR_SECRET: test-qr-secret-ci
        run: |
          pytest services/ \
            --cov=services \
            --cov-report=term-missing \
            --cov-fail-under=40 \
            -v

  build:
    name: Build Docker images
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - name: Build all services
        run: |
          for svc in auth company catalog order payment; do
            docker build -t ordin-$svc:ci ./services/$svc
          done
```

### Estrutura de testes

```
services/
  auth/
    tests/
      test_auth.py          # login, refresh, rate limit
  company/
    tests/
      test_company.py       # validate-pin, verify-pin, terminals
  order/
    tests/
      test_order.py         # create_order, collect_ticket
  payment/
    tests/
      test_payment.py       # create_payment, cancel
  catalog/
    tests/
      test_catalog.py       # categories, products
  conftest.py               # fixtures compartilhados (DB, JWT factory)
```

### `conftest.py` compartilhado

```python
# services/conftest.py
import pytest
from httpx import AsyncClient, ASGITransport

@pytest.fixture
def valid_jwt(tmp_path):
    from jose import jwt
    from datetime import datetime, timedelta
    return jwt.encode(
        {"sub": "1", "company": 1, "role": "owner",
         "exp": datetime.utcnow() + timedelta(hours=1)},
        "test-secret-ci", algorithm="HS256"
    )
```

### `pytest.ini` ou `pyproject.toml`

```ini
[pytest]
asyncio_mode = auto
testpaths = services
```

### requirements.txt — adicionar dependências de dev

```
pytest==8.2.0
pytest-asyncio==0.23.6
pytest-cov==5.0.0
httpx==0.27.0       # já presente — usado para AsyncClient nos testes
```

> Considerar separar `requirements-dev.txt` para não instalar pytest em produção.

### Estimativa
- **DevOps:** 2h (atualizar ci.yml + configurar services MySQL/Redis no Actions)
- **Backend SR:** 4h (criar estrutura de testes + conftest + primeiros testes por serviço para atingir 40%)

### Riscos
- **Médio:** Threshold 40% pode ser difícil de atingir sem testes existentes
  → **Mitigação:** começar com 20% se necessário; criar pelo menos 2–3 testes por serviço antes de abrir a PR de ORD-011
- **Baixo:** MySQL no GitHub Actions pode ser mais lento para subir
  → **Mitigação:** `health-cmd` garante que o container está pronto antes dos testes

## Critérios de aceite funcionais
- [ ] CI roda em cada PR para `main` e `develop`
- [ ] Jobs em sequência: security → lint → test → build
- [ ] PR com teste falhando não pode ser mergeada
- [ ] Cobertura mínima de 40% (configurável via `--cov-fail-under`)
- [ ] Relatório de cobertura visível no output do CI
- [ ] Docker build de todos os 5 serviços no CI
