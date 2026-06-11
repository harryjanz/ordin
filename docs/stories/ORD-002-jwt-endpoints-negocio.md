---
id: ORD-002
status: Done
fase: 1
sprint: 1
responsavel: Backend SR
---

# ORD-002 — JWT obrigatório em todos os endpoints de negócio

## História
Como administrador da plataforma, quero que todos os endpoints de negócio exijam um token JWT válido, para que nenhuma requisição não autenticada consiga criar pedidos, processar pagamentos ou acessar dados de catálogo e empresa.

## Contexto e motivação
Vulnerabilidade crítica C3 de `docs/ARQUITETURA.md` §12 — bloqueia deploy em produção. Hoje os serviços `order`, `catalog`, `payment` e `company` não validam JWT: qualquer requisição HTTP consegue criar pedidos, listar produtos, cancelar transações e consultar dados de empresa sem autenticação alguma. O auth-service já emite JWTs com `company_id`, `role` e `sub` — falta apenas a dependency de validação nos outros serviços. Pré-requisito direto para ORD-005 (company_id do JWT).

## Fluxo principal — como ficará após a história

1. Cliente envia `Authorization: Bearer <token>` em qualquer requisição protegida
2. A dependency `get_current_user` é chamada antes do handler
3. Dependency decodifica o JWT com `SECRET` e `HS256`
4. Se token ausente → 401 com mensagem "Token ausente"
5. Se token expirado → 401 com mensagem "Token expirado"
6. Se token inválido → 401 com mensagem "Token inválido"
7. Se válido → retorna `TokenPayload(sub, company_id, role, terminal_id?)` para o handler
8. Handler usa o payload sem precisar revalidar o token

## Endpoints que permanecem públicos (sem JWT)
- `POST /auth/login`
- `POST /auth/pin-login`
- `POST /auth/validate-pin`
- `POST /auth/refresh`
- `GET /health` (todos os serviços)

## Dependências
- **Precede:** ORD-005 (company_id do JWT — depende que o JWT já esteja sendo validado)
- **Depende de:** ORD-001 (JWT_SECRET via env, não hardcoded)

## Cenários de Teste (Gherkin)

```gherkin
Feature: ORD-002 — JWT obrigatório em todos os endpoints de negócio

  # ─── HAPPY PATH ───────────────────────────────────────────────

  Scenario: Requisição autenticada com token válido é autorizada
    Dado que um usuário tem um access token JWT válido emitido pelo auth-service
    Quando envia GET /catalog/categories?company_id=1 com header Authorization: Bearer <token>
    Então o endpoint retorna 200
    E a resposta contém os dados da empresa do token

  Scenario: Requisição autenticada com token de kiosk acessa endpoint de pedidos
    Dado que um totem tem um access token JWT com role=kiosk e company_id=1
    Quando envia POST /orders com os dados do pedido
    Então o endpoint retorna 201

  # ─── ERRO — TOKEN AUSENTE ─────────────────────────────────────

  Scenario: Requisição sem header Authorization é rejeitada com 401
    Dado que não há header Authorization na requisição
    Quando envio POST /orders sem token
    Então o serviço retorna HTTP 401
    E o corpo contém {"detail": "Token ausente"}

  Scenario: Requisição sem token em catalog-service é rejeitada
    Dado que não há header Authorization na requisição
    Quando envio GET /catalog/products?company_id=1 sem token
    Então o serviço retorna HTTP 401

  Scenario: Requisição sem token em payment-service é rejeitada
    Dado que não há header Authorization na requisição
    Quando envio POST /payments sem token
    Então o serviço retorna HTTP 401

  # ─── ERRO — TOKEN INVÁLIDO ────────────────────────────────────

  Scenario: Token com assinatura incorreta é rejeitado com 401
    Dado que o token foi assinado com um secret diferente
    Quando envio a requisição com esse token
    Então o serviço retorna HTTP 401
    E o corpo contém {"detail": "Token inválido"}

  Scenario: Token expirado é rejeitado com 401
    Dado que o access token emitido expirou (> 60 min)
    Quando envio a requisição com esse token
    Então o serviço retorna HTTP 401
    E o corpo contém {"detail": "Token expirado"}

  Scenario: Token malformado (não é JWT) é rejeitado com 401
    Dado que o header Authorization contém "Bearer nao-e-um-jwt"
    Quando envio a requisição
    Então o serviço retorna HTTP 401

  # ─── ENDPOINTS PÚBLICOS — NÃO DEVEM EXIGIR TOKEN ─────────────

  Scenario: POST /auth/login funciona sem token
    Quando envio POST /auth/login com email e senha válidos, sem Authorization header
    Então o serviço retorna HTTP 200

  Scenario: GET /health funciona sem token em todos os serviços
    Quando envio GET /health para catalog-service sem Authorization header
    Então o serviço retorna HTTP 200

  # ─── MULTI-SERVIÇO ────────────────────────────────────────────

  Scenario: O mesmo token é aceito em múltiplos serviços
    Dado que um usuário tem um access token JWT válido
    Quando usa o mesmo token para acessar catalog-service, order-service e payment-service
    Então todos os três retornam 200 (não 401)
```

## Solução Técnica

### Módulo compartilhado `services/shared/auth.py`

Criar um módulo de autenticação compartilhado. Como cada serviço tem seu próprio diretório em `services/<nome>/`, o arquivo pode ser copiado em cada serviço ou montado como volume no docker-compose. A abordagem mais simples para o piloto é copiar:

```python
# services/shared/auth.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from pydantic import BaseModel
from typing import Optional
import os

SECRET = os.getenv("JWT_SECRET", "")
ALGO   = "HS256"

bearer_scheme = HTTPBearer(auto_error=False)

class TokenPayload(BaseModel):
    sub:         str
    company_id:  int
    role:        str
    terminal_id: Optional[int] = None

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)
) -> TokenPayload:
    if not credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Token ausente")
    try:
        payload = jwt.decode(credentials.credentials, SECRET, algorithms=[ALGO])
        return TokenPayload(
            sub=payload["sub"],
            company_id=payload["company"],
            role=payload["role"],
            terminal_id=payload.get("terminal"),
        )
    except JWTError as e:
        msg = "Token expirado" if "expired" in str(e) else "Token inválido"
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=msg)
```

### Aplicar a dependency em cada serviço

**order-service** — endpoints protegidos: `POST /orders`, `POST /tickets/{code}/collect`, `PATCH /orders/{ref}/status`, `GET /orders/{ref}/tickets`

```python
from shared.auth import get_current_user, TokenPayload

@app.post("/orders", status_code=201)
def create_order(body: OrderIn, db: Session = Depends(get_db),
                 current_user: TokenPayload = Depends(get_current_user)):
    ...
```

**payment-service** — endpoints protegidos: `POST /payments`, `GET /payments`, `POST /payments/{id}/cancel`

**catalog-service** — endpoints protegidos: `GET /catalog/categories`, `GET /catalog/products`, `GET /catalog/products/{id}`

**company-service** — endpoints protegidos: `GET /companies/{id}/terminals`, `POST /companies/{id}/regenerate-pin`
> Os endpoints `/internal/*` **não** usam `get_current_user` — usam `X-Internal-Secret` (ORD-003)

### docker-compose.yml — montar shared como volume

```yaml
auth-service:
  volumes:
    - ./services/shared:/app/shared

order-service:
  volumes:
    - ./services/shared:/app/shared

catalog-service:
  volumes:
    - ./services/shared:/app/shared

payment-service:
  volumes:
    - ./services/shared:/app/shared

company-service:
  volumes:
    - ./services/shared:/app/shared
```

### JWT_SECRET — mesma variável em todos os serviços

Cada serviço precisa da variável `JWT_SECRET` para validar os tokens emitidos pelo auth-service. Adicionar ao `docker-compose.yml` em cada serviço:

```yaml
order-service:
  env_file: .env
  environment:
    DB_URL: ${ORDER_DB_URL}
    JWT_SECRET: ${JWT_SECRET}
```

### Estimativa
- **Backend SR:** 4h (módulo shared/auth.py + aplicar dependency em 4 serviços + docker-compose volumes)

### Riscos
- **Risco:** catalog-service tem endpoints de leitura pública (catálogo do totem). O totem usa token kiosk — ok. Mas se houver um cenário de catálogo público no futuro, a dependency precisará aceitar requests sem token
  → **Decisão:** por ora, todos os endpoints de catálogo exigem JWT. Catálogo público pode ser endpoint separado `/catalog/public/*` sem auth quando necessário

## Critérios de aceite funcionais
- [ ] `GET /catalog/products?company_id=1` sem token retorna 401
- [ ] `POST /orders` sem token retorna 401 com `{"detail":"Token ausente"}`
- [ ] Token expirado retorna 401 com `{"detail":"Token expirado"}`
- [ ] Token válido emitido pelo auth-service é aceito em catalog, order e payment
- [ ] `POST /auth/login` e `GET /health` continuam funcionando sem token
- [ ] `JWT_SECRET` é lido de variável de ambiente em todos os serviços (sem fallback)
