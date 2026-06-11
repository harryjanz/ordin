---
id: ORD-003
status: Done
fase: 1
sprint: 1
responsavel: Backend SR + DevOps
---

# ORD-003 — Bloquear endpoints /internal/* no gateway e autenticar comunicação entre serviços

## História
Como operador da plataforma, quero que os endpoints internos do company-service (`/internal/*`) não sejam acessíveis externamente e que toda comunicação entre serviços seja autenticada com um secret compartilhado, para que nenhum cliente externo possa enumerar PINs ou validar credenciais diretamente.

## Contexto e motivação
Vulnerabilidade crítica C4 de `docs/ARQUITETURA.md` §12. Os endpoints `POST /internal/validate-pin`, `/internal/verify-pin` e `/internal/verify-credentials` do company-service são chamados internamente pelo auth-service mas estão expostos via gateway. Um atacante com acesso à URL do gateway pode tentar bruteforce de PINs (4 dígitos = 9000 combinações) diretamente nesses endpoints, sem passar pelo rate limiting do auth-service.

**Adaptação para o piloto:** a história originalmente referenciava Kong (ORD-012) para bloquear no gateway. Como Kong está na Fase 2, a solução do piloto usa Nginx para bloqueio no gateway + header `X-Internal-Secret` na camada de aplicação para defesa em profundidade.

## Fluxo principal — como ficará após a história

1. Cliente externo tenta `POST http://localhost:8000/internal/validate-pin`
2. Nginx retorna **403 Forbidden** — rota `/internal/` não está mapeada ou está explicitamente bloqueada
3. Auth-service chama `http://company-service:8002/internal/verify-pin` diretamente (não via gateway)
4. Auth-service passa o header `X-Internal-Secret: <INTERNAL_SECRET>`
5. Company-service valida o header antes de processar — retorna 403 se ausente ou incorreto

## Dependências
- **Depende de:** ORD-001 (INTERNAL_SECRET via env, não hardcoded)
- **Fase 2:** Kong substituirá o bloqueio no Nginx e adicionará plugin `request-termination` para `/internal/*`

## Cenários de Teste (Gherkin)

```gherkin
Feature: ORD-003 — Endpoints /internal/* bloqueados externamente

  # ─── BLOQUEIO NO GATEWAY ──────────────────────────────────────

  Scenario: Acesso externo a /internal/validate-pin é bloqueado pelo gateway
    Dado que o gateway Nginx está rodando na porta 8000
    Quando envio POST http://localhost:8000/internal/validate-pin com body {"pin":"1234"}
    Então o gateway retorna HTTP 403
    E o company-service não recebe a requisição

  Scenario: Acesso externo a /internal/verify-credentials é bloqueado
    Dado que o gateway Nginx está rodando na porta 8000
    Quando envio POST http://localhost:8000/internal/verify-credentials com body {"email":"x","password":"y"}
    Então o gateway retorna HTTP 403

  # ─── AUTENTICAÇÃO INTERNA ─────────────────────────────────────

  Scenario: auth-service chama company-service com secret correto e é autorizado
    Dado que INTERNAL_SECRET está configurado em ambos os serviços
    Quando auth-service faz POST /internal/verify-pin com header X-Internal-Secret correto
    Então company-service processa a requisição e retorna 200

  Scenario: Chamada sem X-Internal-Secret é rejeitada pelo company-service
    Dado que INTERNAL_SECRET está configurado no company-service
    Quando envio POST http://localhost:8002/internal/verify-pin sem o header X-Internal-Secret
    Então company-service retorna HTTP 403
    E o body contém {"detail": "Acesso interno não autorizado"}

  Scenario: Chamada com X-Internal-Secret incorreto é rejeitada
    Dado que INTERNAL_SECRET correto é "secret-real"
    Quando envio POST /internal/verify-pin com header X-Internal-Secret: "secret-errado"
    Então company-service retorna HTTP 403

  # ─── FLUXO NORMAL NÃO QUEBRADO ────────────────────────────────

  Scenario: Login de totem continua funcionando após a mudança
    Dado que INTERNAL_SECRET está configurado em auth-service e company-service
    Quando totem faz POST /auth/pin-login com PIN e terminal_id válidos
    Então auth-service chama company-service com o header correto
    E o login retorna HTTP 200 com access_token

  Scenario: Login de admin continua funcionando após a mudança
    Dado que INTERNAL_SECRET está configurado em auth-service e company-service
    Quando admin faz POST /auth/login com email e senha válidos
    Então auth-service chama company-service internamente com header correto
    E o login retorna HTTP 200 com access_token e refresh_token
```

## Solução Técnica

### 1. Nginx — bloquear `/internal/` externamente

```nginx
# nginx.conf — adicionar antes dos location blocks existentes
location ~ ^/internal/ {
    return 403 '{"detail":"Acesso interno não autorizado"}';
    add_header Content-Type application/json;
}
```

### 2. company-service — validar `X-Internal-Secret`

Criar dependency de autenticação interna:

```python
# em services/company/main.py — adicionar dependency
from fastapi import Header, HTTPException
import os, secrets

INTERNAL_SECRET = os.getenv("INTERNAL_SECRET", "")

def require_internal(x_internal_secret: str = Header(default="")):
    if not INTERNAL_SECRET:
        raise RuntimeError("INTERNAL_SECRET não configurado")
    if not secrets.compare_digest(x_internal_secret, INTERNAL_SECRET):
        raise HTTPException(403, detail="Acesso interno não autorizado")

# Aplicar nos 3 endpoints internos:
@app.post("/internal/validate-pin")
def validate_pin(body: dict, db: Session = Depends(get_db),
                 _: None = Depends(require_internal)):
    ...

@app.post("/internal/verify-pin")
def verify_pin(body: dict, db: Session = Depends(get_db),
               _: None = Depends(require_internal)):
    ...

@app.post("/internal/verify-credentials")
def verify_credentials(body: dict, db: Session = Depends(get_db),
                       _: None = Depends(require_internal)):
    ...
```

> `secrets.compare_digest` previne timing attacks na comparação do secret.

### 3. auth-service — passar `X-Internal-Secret` em todas as chamadas internas

```python
# em services/auth/main.py — atualizar todas as chamadas httpx
INTERNAL_SECRET = os.getenv("INTERNAL_SECRET", "")
INTERNAL_HEADERS = {"X-Internal-Secret": INTERNAL_SECRET}

# Exemplo — validate_pin:
async with httpx.AsyncClient() as c:
    r = await c.post(
        f"{COMPANY_SVC}/internal/validate-pin",
        json={"pin": body.pin},
        headers=INTERNAL_HEADERS
    )

# Mesmo padrão para verify-pin e verify-credentials
```

### 4. `.env.example` — nova variável

```dotenv
# ─── Comunicação interna ─────────────────────────────────────────
INTERNAL_SECRET=GERE_COM_openssl_rand_hex_32
```

### 5. `docker-compose.yml` — expor INTERNAL_SECRET nos serviços relevantes

```yaml
auth-service:
  environment:
    INTERNAL_SECRET: ${INTERNAL_SECRET}

company-service:
  environment:
    INTERNAL_SECRET: ${INTERNAL_SECRET}
```

### Estimativa
- **DevOps:** 1h (nginx.conf — adicionar bloqueio)
- **Backend SR:** 2h (dependency `require_internal` no company-service + atualizar 3 chamadas httpx no auth-service)

### Riscos
- **Risco:** Em Fase 2, Kong assumirá o bloqueio. O header `X-Internal-Secret` continua como defesa em profundidade.
  → **Decisão:** a implementação de aplicação (company-service) é permanente; o bloqueio Nginx será substituído por Kong sem mudar o código.

## Critérios de aceite funcionais
- [ ] `POST http://localhost:8000/internal/validate-pin` retorna 403 (bloqueado no Nginx)
- [ ] `POST http://localhost:8002/internal/verify-pin` sem `X-Internal-Secret` retorna 403
- [ ] `POST http://localhost:8002/internal/verify-pin` com secret errado retorna 403
- [ ] Login de totem (`POST /auth/pin-login`) continua funcionando normalmente
- [ ] Login de admin (`POST /auth/login`) continua funcionando normalmente
- [ ] `INTERNAL_SECRET` está no `.env.example` e não hardcoded
