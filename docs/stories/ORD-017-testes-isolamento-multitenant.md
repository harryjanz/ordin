---
id: ORD-017
status: Done
fase: 4
sprint: 5
responsavel: QA + Backend SR
estimativa: 3 pontos
---

# ORD-017 — Testes de isolamento multi-tenant obrigatórios por endpoint

## Explorer

**Como** admin de uma empresa na plataforma Ordin,
**quero** que o sistema garanta automaticamente, a cada merge, que meu token JWT não acessa dados de nenhuma outra empresa,
**para** que vazamentos de dados entre tenants sejam detectados antes de chegar em produção.

### Contexto e motivação

Multi-tenancy via `company_id` no JWT é a garantia de isolamento central da plataforma. Hoje essa regra existe no código (todo endpoint filtra por `current_user.company_id`), mas **não existe nenhum teste automatizado que a verifique**. Uma refatoração descuidada num endpoint — por exemplo, remover um `.filter_by(company_id=...)` — passaria no CI atual e chegaria em produção sem nenhuma barreira.

A ARQUITETURA.md §6 e §11 exige testes de isolamento como requisito de segurança não-negociável.

### Personas afetadas

- **Admin da empresa**: tem expectativa absoluta de que seus dados (catálogo, pedidos, pagamentos, usuários) não são visíveis nem modificáveis por outras empresas
- **Super admin da plataforma**: precisa de confiança técnica para onboarding de novas empresas sem risco de vazamento cross-tenant

### Dependências

- ORD-002 (JWT nos endpoints) — Done ✅
- ORD-005 (company_id do JWT) — Done ✅
- Seed com pelo menos 2 empresas (Burger House company_id=1, Pasta & Co company_id=2) — Done ✅

### Escopo

| Serviço | Endpoints | Risco |
|---|---|---|
| catalog | `GET /catalog/categories`, `GET /catalog/products`, `POST/PUT/DELETE /catalog/categories`, `POST/DELETE /catalog/products` | Leitura de cardápio alheio |
| order | `GET /orders`, `GET /orders/{ref}/tickets`, `POST /orders` | Leitura e criação de pedidos |
| payment | `GET /payments`, `POST /payments` | Leitura de transações financeiras |
| company | `GET /companies/{id}/terminals`, `GET /companies/{id}/users` | Leitura de estrutura interna |

### Fora do escopo

- Testes de performance ou carga
- Endpoints `/internal/*` (bloqueados no Nginx, não expostos)
- auth-service (não tem dados de negócio isolados por company_id)

---

## QA Explorer

### Critérios de aceitação

**CA-001 — Leitura cross-tenant retorna lista vazia, não dados alheios**
> Dado um token da empresa A, quando faço `GET` em endpoints de listagem, então recebo apenas os dados da empresa A — nunca dados da empresa B.

**CA-002 — Leitura por ID de recurso alheio retorna 404**
> Dado um token da empresa A, quando faço `GET /catalog/products/{id}` onde `id` pertence à empresa B, então recebo HTTP 404.

**CA-003 — Escrita com ID de recurso alheio retorna 404**
> Dado um token da empresa A, quando faço `PUT` ou `DELETE` em recurso da empresa B, então recebo HTTP 404.

**CA-004 — company endpoint com ID alheio retorna 403**
> Dado um token da empresa A (company_id=1), quando faço `GET /companies/2/terminals`, então recebo HTTP 403.

**CA-005 — Token inválido ou ausente retorna 401**
> Todos os endpoints de negócio retornam 401 quando chamados sem token.

**CA-006 — Criação de recurso vincula ao company_id do JWT, nunca ao body**
> Dado um token da empresa A, o recurso criado tem `company_id = A` independente de qualquer campo no body.

**CA-007 — Suite bloqueia CI se algum teste falhar**
> O job pytest de isolamento deve retornar exit code 1 se qualquer caso falhar.

### Edge cases

- Token com `company_id` ausente no payload → 401 (não 500)
- Token de totem (sem role) tentando endpoint admin → 403
- `company_id` injetado no body da request → ignorado, usa o do JWT

---

## Tech Explorer

### Estratégia

**SQLite em memória por serviço** — cada `test_isolation.py` sobe o próprio app com banco em memória (`sqlite+aiosqlite:///:memory:`), cria o schema, semeia dados de duas empresas e fecha. Sem dependência de MySQL rodando. Mesmo padrão já usado nos demais testes (`ASGITransport`).

### Mudanças necessárias

#### 1. `services/conftest.py` — adicionar fixture `token_company_b`

```python
@pytest.fixture
def token_company_b():
    return make_jwt(role="admin", company_id=2)
```

#### 2. Um arquivo `test_isolation.py` por serviço

**catalog-service** → `services/catalog/tests/test_isolation.py`

```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ["DB_URL"] = "sqlite+aiosqlite:///:memory:"

import pytest
from httpx import AsyncClient, ASGITransport

@pytest.fixture(scope="module")
async def client():
    from main import app, Base, engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c

@pytest.fixture(scope="module")
async def ids(client):
    from main import AsyncSessionLocal, Category, Product
    async with AsyncSessionLocal() as db:
        cat_a = Category(company_id=1, name="Lanches", active=True)
        cat_b = Category(company_id=2, name="Pizzas", active=True)
        db.add_all([cat_a, cat_b])
        await db.flush()
        prod_b = Product(company_id=2, category_id=cat_b.id, name="Margherita", price=40.0, active=True)
        db.add(prod_b)
        await db.commit()
        return {"cat_b_id": cat_b.id, "prod_b_id": prod_b.id}

# CA-001: listagem só retorna dados da própria empresa
async def test_list_categories_nao_vaza(client, ids, token_owner):
    r = await client.get("/catalog/categories", headers={"Authorization": f"Bearer {token_owner}"})
    assert r.status_code == 200
    names = [c["name"] for c in r.json()["categories"]]
    assert "Pizzas" not in names      # dado da empresa 2 não aparece para empresa 1

# CA-002: GET por ID alheio → 404
async def test_get_produto_de_outra_empresa(client, ids, token_owner):
    r = await client.get(f"/catalog/products/{ids['prod_b_id']}",
                         headers={"Authorization": f"Bearer {token_owner}"})
    assert r.status_code == 404

# CA-003: PUT em categoria alheia → 404
async def test_update_categoria_alheia(client, ids, token_owner):
    r = await client.put(f"/catalog/categories/{ids['cat_b_id']}",
                         json={"name": "Invadida"},
                         headers={"Authorization": f"Bearer {token_owner}"})
    assert r.status_code == 404

# CA-003: DELETE em produto alheio → 404
async def test_delete_produto_alheio(client, ids, token_owner):
    r = await client.delete(f"/catalog/products/{ids['prod_b_id']}",
                            headers={"Authorization": f"Bearer {token_owner}"})
    assert r.status_code == 404

# CA-005: sem token → 401
async def test_sem_token(client):
    r = await client.get("/catalog/categories")
    assert r.status_code == 401

# CA-006: criação vincula company do JWT
async def test_create_vincula_company_do_jwt(client, token_owner):
    from main import AsyncSessionLocal, Category
    from sqlalchemy import select
    r = await client.post("/catalog/categories", json={"name": "Nova"},
                          headers={"Authorization": f"Bearer {token_owner}"})
    assert r.status_code == 201
    cat_id = r.json()["id"]
    async with AsyncSessionLocal() as db:
        cat = (await db.execute(select(Category).where(Category.id == cat_id))).scalars().first()
    assert cat.company_id == 1      # sempre o do JWT, nunca body
```

**order-service** → `services/order/tests/test_isolation.py`

```python
# mesma estrutura: seed order com company_id=2, testa que token empresa 1
# não consegue GET /orders/{ref_b}/tickets (→ 404) e que GET /orders não retorna pedidos de B
```

**payment-service** → `services/payment/tests/test_isolation.py`

```python
# seed payment com company_id=2, testa que GET /payments com token empresa 1
# retorna lista sem os pagamentos de B
```

**company-service** → `services/company/tests/test_isolation.py`

```python
# testa GET /companies/2/terminals com token company_id=1 → 403
# testa GET /companies/2/users com token company_id=1 → 403
```

### Fixture `token_company_b` no conftest raiz

`services/conftest.py` já tem `make_jwt(company_id=N)`. Basta adicionar:

```python
@pytest.fixture
def token_company_b():
    return make_jwt(role="admin", company_id=2)
```

### Banco em memória por serviço

Cada `test_isolation.py` força `DB_URL = "sqlite+aiosqlite:///:memory:"` antes de importar `main`. O `engine` do serviço usa essa variável → banco isolado por processo de teste, sem conflito entre serviços rodando em paralelo.

Dependência nova: `aiosqlite` em `requirements-dev.txt` de cada serviço (já pode existir nos testes atuais — verificar).

### CI — onde adicionar

Já existe um job de testes. Garantir que `pytest services/*/tests/test_isolation.py` está no step de CI. Se qualquer teste falhar → exit 1 → merge bloqueado.

### Sem novos endpoints, sem migrations

Esses testes validam código já existente. Nenhuma linha de código de produção muda nesta história — apenas arquivos de teste são adicionados.
