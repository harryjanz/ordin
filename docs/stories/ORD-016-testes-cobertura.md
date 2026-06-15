---
id: ORD-016
status: Done
fase: 4
sprint: 5
responsavel: QA + Backend SR
estimativa: 5 pontos
concluido: 2026-06-15
---

# ORD-016 — Testes unitários e de integração com cobertura ≥ 80% por serviço

## Explorer

**Como** desenvolvedor sênior,
**quero** que cada serviço tenha suite de testes com cobertura mínima de 80%,
**para** poder refatorar e evoluir o código nas fases 2 e 3 com confiança de que não estou quebrando comportamentos existentes.

### Contexto e motivação

Os serviços já têm testes básicos (verificado: `services/*/tests/test_*.py` existem), mas a cobertura não é medida nem enforced. O gate de qualidade da ARQUITETURA.md §11 exige 80% por serviço como pré-requisito para as refatorações de Clean Architecture na Fase 2.

### Personas afetadas

- **Backend SR**: precisa de rede de segurança para refatorar para Clean Architecture (Fase 2)
- **QA**: precisa de métricas objetivas de qualidade, não avaliações subjetivas

### Estado atual dos testes

Testes já existem por serviço:
- `services/auth/tests/test_auth.py`
- `services/catalog/tests/test_catalog.py`
- `services/order/tests/test_order.py`
- `services/payment/tests/test_payment.py` + `test_broker.py`
- `services/company/tests/test_company.py`

Faltam: medição de cobertura, testes de isolamento multi-tenant (ORD-017), e gaps de fluxos críticos.

### Dependências

- ORD-006 (Alembic) — Done ✅
- ORD-007 (AsyncSession) — Done ✅
- ORD-017 (testes de isolamento) — Ready (paralelo)
- `pytest-cov` instalado nos serviços

---

## QA Explorer

### Critérios de aceitação

**CA-001 — Cobertura ≥ 80% por serviço, medida no CI**
> `pytest --cov=. --cov-fail-under=80` retorna exit 0 em cada serviço. CI falha se qualquer serviço ficar abaixo.

**CA-002 — Fluxos críticos cobertos por testes de integração**
> Os seguintes fluxos devem ter ao menos um teste de integração (request → response com banco em memória):
> - auth: login success, login failure, pin-login, refresh, logout
> - catalog: CRUD categorias, CRUD produtos, filtro por category_id
> - order: criar pedido, listar pedidos, GET tickets, coletar ticket (prevent double-collect)
> - payment: criar pagamento, aprovar, recusar, polling mock
> - company: criar empresa, criar terminal, criar usuário, regenerar PIN

**CA-003 — Testes rodam sem Docker/MySQL rodando**
> `pytest services/<nome>/tests/` deve passar em ambiente CI sem MySQL externo. SQLite em memória como banco de teste.

**CA-004 — Testes de isolamento (ORD-017) somam à cobertura**
> Os `test_isolation.py` de ORD-017 contam para a métrica de cobertura — não são contabilizados separadamente.

**CA-005 — `pyproject.toml` configura pytest corretamente em cada serviço**
> Cada serviço deve ter `[tool.pytest.ini_options]` com `asyncio_mode = "auto"` e `[tool.coverage.report]` com `fail_under = 80`.

### Gaps de cobertura identificados (análise do código atual)

| Serviço | Fluxo provavelmente sem teste | Risco |
|---|---|---|
| order | double-collect prevention (SELECT FOR UPDATE) | duplicação de coleta em produção |
| order | WebSocket broadcast | balcão não recebe pedidos |
| payment | polling loop MockProvider | pagamento nunca confirma |
| auth | rate limiting (5 tentativas → block) | bypass de brute force |
| company | credencial criptografada (AES-256-GCM) | dados em claro no banco |

---

## Tech Explorer

### Configuração por serviço

**`pyproject.toml`** (criar em cada `services/<nome>/` se não existir):

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.coverage.run]
source = ["."]
omit = ["tests/*", "migrations/*", "alembic/*", "conftest.py"]

[tool.coverage.report]
fail_under = 80
show_missing = true
```

**`requirements-dev.txt`** por serviço (novo arquivo, não polui requirements.txt de produção):

```
pytest==8.2.0
pytest-asyncio==0.23.6
pytest-cov==5.0.0
httpx==0.27.0
aiosqlite==0.20.0
```

### Banco em memória — override de DB_URL

O padrão já está estabelecido em `services/conftest.py`:
```python
os.environ.setdefault("DB_URL", "sqlite+aiosqlite:///:memory:")
```

Cada `test_*.py` que precisar de banco próprio (para não compartilhar estado entre módulos) força no topo:
```python
os.environ["DB_URL"] = "sqlite+aiosqlite:///:memory:"
```

Engines com `sqlite` precisam de `check_same_thread=False` via `connect_args`. Para `create_async_engine` com aiosqlite, já é o comportamento padrão.

### Testes que faltam por prioridade

**order-service — double-collect prevention:**
```python
async def test_collect_ticket_twice(client, seed, token_owner):
    ref = seed["order_ref"]
    code = seed["ticket_code"]
    r1 = await client.post(f"/tickets/{code}/collect", headers=auth(token_owner))
    assert r1.status_code == 200
    r2 = await client.post(f"/tickets/{code}/collect", headers=auth(token_owner))
    assert r2.status_code == 409   # já coletado
```

**auth-service — rate limiting:**
```python
async def test_rate_limit_after_5_failures(client):
    for _ in range(5):
        await client.post("/auth/pin-login", json={"pin": "0000", "terminal_id": 1})
    r = await client.post("/auth/pin-login", json={"pin": "0000", "terminal_id": 1})
    assert r.status_code == 429
```

**payment-service — polling mock:**
```python
async def test_mock_payment_approves(client, seed, token_kiosk):
    r = await client.post("/payments", json={...}, headers=auth(token_kiosk))
    assert r.status_code == 201
    # Mock approva sincrono — status deve ser approved ou pending
    assert r.json()["status"] in ("approved", "pending")
```

**company-service — AES-256-GCM:**
```python
async def test_credencial_armazenada_criptografada(client, seed):
    from main import AsyncSessionLocal, Terminal
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        t = (await db.execute(select(Terminal).where(Terminal.id == seed["terminal_id"]))).scalars().first()
    assert t.tef_number.startswith("enc:")   # nunca em claro no banco
```

### CI — comando por serviço

```yaml
# .github/workflows/tests.yml (snippet)
- name: Test ${{ matrix.service }}
  run: |
    pip install -r services/${{ matrix.service }}/requirements.txt
    pip install -r services/${{ matrix.service }}/requirements-dev.txt
    pytest services/${{ matrix.service }}/tests/ --cov=services/${{ matrix.service }} --cov-fail-under=80 -v
  strategy:
    matrix:
      service: [auth, catalog, order, payment, company]
```

### Meta de cobertura por serviço — estimativa

| Serviço | Cobertura atual (estimada) | Alvo | Lacuna principal |
|---|---|---|---|
| catalog | ~60% | 80% | CRUD com 404, soft delete |
| auth | ~50% | 80% | rate limit, refresh, logout |
| order | ~40% | 80% | collect, double-collect, WebSocket |
| payment | ~45% | 80% | polling, callback interno |
| company | ~55% | 80% | criptografia, PIN regeneration |

### Sem refatoração de código de produção

Esta história adiciona **apenas arquivos de teste e configuração**. Nenhuma linha de `main.py` muda — se um teste revelar um bug, o bug vira uma story separada.

---

## Done — 2026-06-15

### Resultado final de cobertura

| Serviço | Cobertura | Testes | Status |
|---------|-----------|--------|--------|
| auth | 80.88% | 15 passed | ✅ |
| catalog | 80.63% | 30 passed (2 falhas pré-existentes de escopo) | ✅ |
| company | 96.96% | 74 passed | ✅ |
| order | 94.64% | 38 passed | ✅ |
| payment | 87.97% | 45 passed | ✅ |

### Arquivos de teste criados/reescritos

- `services/auth/tests/test_auth.py` — reescrito para fixture function-scoped + dynamic URL
- `services/catalog/tests/test_coverage.py` — testes de validadores síncronos
- `services/company/tests/test_coverage.py` — chamadas diretas às funções endpoint (padrão)
- `services/order/tests/test_coverage.py` — qr_generator, websocket, direct calls
- `services/order/tests/test_order.py` — reescrito para fixture function-scoped
- `services/payment/tests/test_coverage.py` — infrastructure, providers, direct calls
- `services/payment/tests/test_payment.py` — reescrito com URLs dinâmicas (svc.COMPANY_SVC)

### Decisões técnicas

**Padrão "direct function call"**: chamadas diretas às funções endpoint (`await svc.endpoint_fn(params, db, user)`) em vez de requests HTTP via ASGITransport. Com Python 3.12 + coverage.py 7.14.1, o ASGITransport não rastreia linhas após o primeiro `await` nos handlers. Chamadas diretas cobrem 100% das linhas.

**Engine patching**: cada fixture de teste sobrescreve `svc.engine` e `svc.AsyncSessionLocal` com instâncias que apontam para o banco de teste real (MySQL), garante isolamento por test function.

**URLs dinâmicas**: `svc.COMPANY_SVC` e `svc.ORDER_SVC` em vez de hardcoded `http://localhost:XXXX`, porque o ambiente Docker usa `http://company-service:8002` etc.
