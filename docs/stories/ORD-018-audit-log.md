---
id: ORD-018
status: Done
fase: 4
sprint: 5
responsavel: Backend SR
estimativa: 2 pontos
---

# ORD-018 — Audit log de ações sensíveis

## Explorer

**Como** super admin ou admin de empresa,
**quero** um registro estruturado de toda ação sensível realizada na plataforma (login, logout, regeneração de PIN, cancelamento de pagamento),
**para** investigar fraudes, acessos indevidos e incidentes operacionais com rastreabilidade completa.

### Contexto e motivação

Hoje nenhuma dessas ações deixa rastro além do log genérico do uvicorn. Se um admin fizer login de um IP incomum às 3h, ou regenerar o PIN da empresa sem autorização, não há como investigar depois. Isso viola o requisito S10 da ARQUITETURA.md §12.

Em **produção** o Datadog sidecar no ECS coleta o stdout dos containers automaticamente — basta emitir JSON estruturado. No **piloto local** o Docker Compose já captura o stdout de cada container (`docker logs`), então a mesma abordagem funciona sem infra adicional.

### Personas afetadas

- **Super admin**: precisa de visibilidade sobre todos os logins e ações administrativas cross-tenant
- **Admin da empresa**: precisa de rastreabilidade para investigar uso indevido por operadores internos
- **Compliance / Auditoria**: trilha de auditoria é requisito para certificações futuras (PCI-DSS, LGPD)

### Ações sensíveis a registrar

| Ação | Onde | Trigger |
|---|---|---|
| `login_success` | auth-service | `POST /auth/login` com credenciais válidas |
| `login_failure` | auth-service | `POST /auth/login` com credenciais inválidas |
| `pin_login_success` | auth-service | `POST /auth/pin-login` com sucesso |
| `pin_login_failure` | auth-service | `POST /auth/pin-login` com PIN inválido |
| `logout` | auth-service | `POST /auth/logout` |
| `pin_regenerated` | company-service | `POST /companies/{id}/regenerate-pin` |
| `payment_cancelled` | payment-service | `POST /payments/{id}/cancel` (futuro) |

### Campos obrigatórios de cada entrada

```json
{
  "audit": true,
  "event": "login_success",
  "actor": "carlos@burgerhouse.com",
  "actor_id": 2,
  "company_id": 1,
  "ip": "192.168.1.10",
  "result": "success",
  "detail": {},
  "timestamp": "2026-06-15T12:00:00Z"
}
```

### Dependências

- Nenhuma nova migration ou tabela — logs vão para stdout JSON
- Serviços afetados: auth-service, company-service

### Fora do escopo

- Interface visual de audit log no admin panel (Fase 2)
- Retenção e pesquisa de logs (responsabilidade do Datadog em produção)
- payment_cancelled (endpoint de cancelamento ainda não existe)

---

## QA Explorer

### Critérios de aceitação

**CA-001** — Toda ação sensível gera exatamente uma linha de audit log no stdout com `"audit": true`.

**CA-002** — Campos obrigatórios sempre presentes: `audit`, `event`, `actor`, `actor_id`, `company_id`, `ip`, `result`, `timestamp`.

**CA-003** — `login_failure` é logado **antes** de retornar o 401 — o evento nunca é silenciado.

**CA-004** — `ip` reflete o cliente real: lê `X-Forwarded-For` (via nginx) ou `request.client.host`.

**CA-005** — Em `login_failure`, `actor` = email submetido e `actor_id` = `null`.

**CA-006** — Filtrar `"audit": true` no stdout retorna apenas eventos de audit, sem mistura com logs operacionais.

**CA-007** — `pin_regenerated` registra o admin que executou a ação (do JWT), não o owner da empresa.

### Cenários de teste

| # | Cenário | Ação | Log esperado |
|---|---|---|---|
| A1 | Login bem-sucedido | POST /auth/login com credenciais corretas | `event=login_success`, `result=success` |
| A2 | Login com senha errada | POST /auth/login com senha errada | `event=login_failure`, `result=failure`, `actor_id=null` |
| A3 | Login com email inexistente | POST /auth/login com email desconhecido | `event=login_failure`, `actor=email_submetido` |
| A4 | PIN login sucesso | POST /auth/pin-login com PIN correto | `event=pin_login_success` |
| A5 | PIN login errado | POST /auth/pin-login com PIN errado | `event=pin_login_failure` |
| A6 | Logout | POST /auth/logout com token válido | `event=logout`, `result=success` |
| A7 | Regenerar PIN | POST /companies/1/regenerate-pin | `event=pin_regenerated`, `actor=admin_que_chamou` |

---

## Tech Explorer

### Módulo compartilhado `audit.py`

Novo arquivo `services/shared/audit.py` (mesmo diretório de `auth.py`). Cada serviço que precisar importa:

```python
# services/shared/audit.py
import json
import sys
from datetime import datetime, timezone
from fastapi import Request
from typing import Any

def _get_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

def emit_audit(
    event: str,
    request: Request,
    *,
    actor: str | None,
    actor_id: int | None,
    company_id: int | None,
    result: str,
    detail: dict[str, Any] | None = None,
) -> None:
    entry = {
        "audit": True,
        "event": event,
        "actor": actor,
        "actor_id": actor_id,
        "company_id": company_id,
        "ip": _get_ip(request),
        "result": result,
        "detail": detail or {},
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
    }
    print(json.dumps(entry, ensure_ascii=False), file=sys.stdout, flush=True)
```

`print(..., flush=True)` garante que a linha chega ao stdout do container antes de qualquer resposta HTTP. Sem dependência externa — não usa structlog, não usa logger do Python (que uvicorn pode interceptar e formatar diferente).

### auth-service — pontos de hook

Três endpoints em `services/auth/main.py`:

**`POST /auth/login`:**
```python
from shared.audit import emit_audit   # ou caminho relativo se copiado

async def login(body: LoginReq, request: Request, ...):
    # ...chamada ao company-service...
    if r.status_code != 200:
        emit_audit("login_failure", request,
                   actor=body.email, actor_id=None, company_id=None, result="failure")
        raise HTTPException(401, "Credenciais inválidas")
    u = r.json()
    # ...gera tokens...
    emit_audit("login_success", request,
               actor=body.email, actor_id=u["id"], company_id=u["company_id"], result="success")
    return {...}
```

**`POST /auth/pin-login`:**
```python
async def pin_login(body: PinLoginReq, request: Request, ...):
    # ...chamada ao company-service...
    if r.status_code != 200:
        emit_audit("pin_login_failure", request,
                   actor=f"terminal-{body.terminal_id}", actor_id=None, company_id=None,
                   result="failure", detail={"terminal_id": body.terminal_id})
        raise HTTPException(401, "PIN ou terminal inválido")
    data = r.json()
    emit_audit("pin_login_success", request,
               actor=f"terminal-{body.terminal_id}", actor_id=body.terminal_id,
               company_id=data["company"]["id"], result="success",
               detail={"terminal_id": body.terminal_id})
    return {...}
```

**`POST /auth/logout`:**
```python
async def logout(body: RefreshReq, request: Request, db: ...):
    # ...revoga token...
    # Decodifica JWT para pegar actor sem exigir token válido (best-effort)
    try:
        payload = jwt.decode(body.refresh_token, SECRET, algorithms=[ALGO], options={"verify_exp": False})
        actor = payload.get("sub")
        company_id = payload.get("company")
    except Exception:
        actor = None
        company_id = None
    emit_audit("logout", request,
               actor=actor, actor_id=int(actor) if actor else None,
               company_id=company_id, result="success")
    return {"detail": "Logout realizado"}
```

Nota: `logout` adiciona `request: Request` no parâmetro — FastAPI injeta automaticamente sem declaração adicional.

### company-service — ponto de hook

**`POST /companies/{company_id}/regenerate-pin`** em `services/company/main.py`:

```python
from shared.audit import emit_audit   # ou path relativo

async def regenerate_pin(company_id: int, request: Request, db: ..., current_user: TokenPayload = ...):
    if current_user.company_id != company_id and current_user.role != "superadmin":
        raise HTTPException(403, "Acesso negado")
    # ...lógica existente...
    emit_audit("pin_regenerated", request,
               actor=str(current_user.sub),
               actor_id=current_user.sub,
               company_id=current_user.company_id,
               result="success",
               detail={"company_id_alvo": company_id})
    return {"pin": new_pin}
```

### Onde colocar o arquivo `audit.py`

Dois serviços precisam: auth e company. O padrão do projeto é copiar `shared/auth.py` para cada serviço (verificar `services/shared/` vs cópia local). Seguir o mesmo padrão já em uso.

### Testes em `test_audit.py`

Capturar stdout com `capsys` do pytest e verificar que a linha JSON é emitida:

```python
async def test_login_failure_emite_audit(client, capsys):
    await client.post("/auth/login", json={"email": "x@x.com", "password": "errado"})
    out = capsys.readouterr().out
    lines = [json.loads(l) for l in out.splitlines() if '"audit"' in l]
    assert any(l["event"] == "login_failure" for l in lines)
    entry = next(l for l in lines if l["event"] == "login_failure")
    assert entry["actor"] == "x@x.com"
    assert entry["actor_id"] is None
    assert entry["result"] == "failure"
    assert "timestamp" in entry
```

### Zero migrations, zero novas tabelas

Toda a implementação é: 1 arquivo `audit.py` novo + chamadas `emit_audit()` nos 4 pontos de hook. Nenhum schema muda.
