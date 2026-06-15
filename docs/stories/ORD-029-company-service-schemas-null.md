---
id: ORD-029
status: Done
fase: 1
sprint: corrections
responsavel: Backend SR
estimativa: 2 pontos
prioridade: P0
bugs: BUG-001, BUG-002
---

# ORD-029 — Company Service: schemas não tolerantes a NULL quebram tela Empresa

## Explorer

**Como** owner ou admin do painel,  
**quero** que a tela "Empresa" carregue terminais e usuários sem erros,  
**para** conseguir gerenciar terminais, usuários e regenerar PIN sem precisar de suporte técnico.

### Contexto e motivação

Dois endpoints do company-service retornam HTTP 500 ao listar terminais e usuários seed:

- `GET /companies/{id}/users` → `ResponseValidationError: created_at` é `datetime` não-opcional no schema `UserOut`, mas os registros seed (ids 1–7) têm `created_at = NULL` no banco.
- `GET /companies/{id}/terminals` → `ResponseValidationError: environment` é `str` não-opcional em `TerminalOut`, mas os registros seed (ids 1–3) têm `environment = NULL`.

Esses NULLs existem porque o `init.sql` insere os registros seed antes das migrations Alembic aplicarem os defaults (`DEFAULT CURRENT_TIMESTAMP`, `DEFAULT 'sandbox'`). Registros criados via API após o seed têm os valores corretos — o problema é exclusivo dos seeds.

A tela "Empresa" do admin (:3001) fica em branco silenciosamente (sem mensagem de erro) quando esses endpoints falham.

### Personas afetadas
- **Owner**: não consegue ver nem gerenciar terminais e usuários da empresa
- **Admin Ordin**: não consegue ver nenhuma empresa

### Dependências
- `services/company/main.py` — schemas `UserOut`, `TerminalOut`
- `init.sql` — seed data
- BUG-008 (ORD-034) — melhora o feedback de erro no frontend quando ocorre falha de API

---

## QA Explorer

```gherkin
Feature: Company Service — GET /companies/{id}/users e /terminals sem 500

  Background:
    Given o banco fk_company tem registros seed (users ids 1-7, terminals ids 1-3)
    And o admin está logado como carlos@burgerhouse.com

  Scenario: Listar usuários retorna 200
    When o admin navega para Empresa → aba "Usuários"
    Then a API GET /companies/1/users retorna HTTP 200
    And a lista exibe pelo menos "Carlos Oliveira", "Ana Souza", "João Caixa"
    And usuários com created_at NULL aparecem sem campo de data (ou com valor vazio)

  Scenario: Listar terminais retorna 200
    When o admin navega para Empresa → aba "Terminais"
    Then a API GET /companies/1/terminals retorna HTTP 200
    And a lista exibe "Totem 1 - Entrada", "Totem 2 - Caixa", "Totem 1 - Salão"
    And terminais com environment NULL aparecem com valor padrão "sandbox"

  Scenario: Usuário criado via API tem created_at preenchido
    When o admin cria um novo usuário via POST /companies/1/users
    Then o usuário aparece na listagem com created_at preenchido corretamente

  Scenario: Terminal criado via API tem environment preenchido
    When o admin cria um terminal via POST /companies/1/terminals
    Then o terminal aparece na listagem com environment "sandbox"

  Scenario: Regressão — outros campos de UserOut permanecem obrigatórios
    Given um usuário criado via API tem todos os campos preenchidos
    When o admin lista os usuários
    Then id, name, email, role, active são sempre retornados (não-nullable)
```

---

## Tech Explorer

### Causa raiz

Os schemas Pydantic usam tipos não-opcionais para campos que podem ser NULL na seed data:

```python
# services/company/main.py — linha ~222
class UserOut(BaseModel):
    id: int
    company_id: int
    name: str
    email: str
    role: str
    active: bool
    created_at: datetime          # ← falha com NULL
    model_config = {"from_attributes": True}

# linha ~181
class TerminalOut(BaseModel):
    id: int
    label: str
    ...
    environment: str = "sandbox"  # ← default não protege contra NULL vindo do ORM
    active: bool = True
    model_config = {"from_attributes": True}
```

O `default="sandbox"` no Pydantic não tem efeito quando `from_attributes=True` retorna `None` de um campo SQL — o Pydantic tenta validar `None` como `str` e falha.

### Fix — Backend (2 linhas)

**`services/company/main.py`**:

```python
from typing import Optional
from datetime import datetime

class UserOut(BaseModel):
    id: int
    company_id: int
    name: str
    email: str
    role: str
    active: bool
    created_at: Optional[datetime] = None   # tolerante a NULL
    model_config = {"from_attributes": True}

class TerminalOut(BaseModel):
    id: int
    label: str
    terminal_code: Optional[str] = None
    tef_number: Optional[str] = None
    tef_serial: Optional[str] = None
    paygo_terminal_id: Optional[str] = None
    environment: Optional[str] = "sandbox"  # tolerante a NULL, fallback "sandbox"
    active: bool = True
    model_config = {"from_attributes": True}
```

### Fix — Seed data (preventivo)

Atualizar `init.sql` para preencher os NULLs nos seeds, evitando recorrência:

```sql
-- Após INSERT de users seed
UPDATE fk_company.users SET created_at = NOW() WHERE created_at IS NULL;

-- Após INSERT de terminals seed  
UPDATE fk_company.terminals SET environment = 'sandbox' WHERE environment IS NULL;
```

Ou — preferível — ajustar os próprios INSERTs para incluir `created_at` e `environment` explicitamente.

### Cobertura de testes

Adicionar ao `services/company/tests/test_coverage.py`:

```python
async def test_list_users_com_created_at_null(db_session):
    """Garante que users com created_at NULL são serializados sem 500."""
    import main as svc
    async with db_session() as db:
        u = svc.User(company_id=1, name="Null User", email="null@test.com",
                     password_hash="x", role="cashier", active=True,
                     created_at=None)
        db.add(u); await db.commit()
        result = await svc.list_users(1, db, _user("owner", 1))
    assert "users" in result

async def test_list_terminals_com_environment_null(db_session):
    """Garante que terminals com environment NULL são serializados sem 500."""
    import main as svc
    async with db_session() as db:
        t = svc.Terminal(company_id=1, label="Null Env Terminal",
                         environment=None)
        db.add(t); await db.commit()
        result = await svc.list_terminals(1, db, _user("owner", 1))
    assert "terminals" in result
```

### Impacto em outros serviços
- Nenhum. Mudança puramente interna ao company-service.

### Estimativa
2 pontos — 4 linhas de código + 2 testes + atualizar init.sql

### Riscos
- Nenhum. Tornar campos opcionais é backward-compatible. A API continua retornando os campos quando presentes.

---

## Ready ✅

- [x] User story documentada
- [x] Causa raiz identificada (NULL em campos não-opcionais em Pydantic with from_attributes)
- [x] Cenários Gherkin escritos
- [x] Solução técnica definida (2 linhas de schema + seed fix + 2 testes)
- [x] Estimativa: 2 pontos
- [x] Sem bloqueadores
