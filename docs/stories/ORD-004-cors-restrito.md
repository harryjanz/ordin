---
id: ORD-004
status: Done
fase: 1
sprint: 1
responsavel: Backend SR + DevOps
---

# ORD-004 — Restringir CORS a origens conhecidas por ambiente

## História
Como operador da plataforma, quero que os serviços só aceitem requisições cross-origin de domínios conhecidos (totem, admin, balcão), para que browsers de outros domínios não consigam chamar a API diretamente e reduzirmos a superfície de ataques CSRF.

## Contexto e motivação
Vulnerabilidades A1 e A2 de `docs/ARQUITETURA.md` §12. Hoje todos os serviços FastAPI e o Nginx têm `allow_origins=["*"]`, o que significa que qualquer site na internet pode fazer requisições autenticadas à API se o usuário estiver logado. A restrição de CORS deve ser configurada por variável de ambiente para ser diferente em local, staging e produção.

## Fluxo principal — como ficará após a história

1. Browser do totem (ex: `http://localhost:3000`) faz requisição à API
2. FastAPI middleware CORS verifica se a origem está na lista `CORS_ORIGINS`
3. Se a origem está na lista → requisição processada normalmente, headers CORS corretos na resposta
4. Se a origem não está na lista → browser bloqueia a resposta (CORS policy)
5. Nginx também remove os headers `Access-Control-Allow-Origin: *` — FastAPI controla os CORS

## Dependências
- Sem dependências de outras histórias

## Cenários de Teste (Gherkin)

```gherkin
Feature: ORD-004 — CORS restritivo por ambiente

  # ─── ORIGEM PERMITIDA ─────────────────────────────────────────

  Scenario: Requisição de origem permitida recebe headers CORS corretos
    Dado que CORS_ORIGINS contém "http://localhost:3000"
    Quando o browser faz uma requisição de "http://localhost:3000" para GET /catalog/products
    Então a resposta contém header "Access-Control-Allow-Origin: http://localhost:3000"
    E a requisição é processada normalmente

  Scenario: Preflight OPTIONS de origem permitida retorna 200
    Dado que CORS_ORIGINS contém "http://localhost:3000"
    Quando o browser faz OPTIONS /orders com Origin: http://localhost:3000
    Então a resposta retorna HTTP 200
    E contém "Access-Control-Allow-Methods" com os métodos permitidos

  # ─── ORIGEM BLOQUEADA ─────────────────────────────────────────

  Scenario: Requisição de origem não permitida não recebe headers CORS
    Dado que CORS_ORIGINS NÃO contém "http://site-malicioso.com"
    Quando um browser faz requisição de "http://site-malicioso.com" para POST /orders
    Então a resposta NÃO contém header "Access-Control-Allow-Origin"
    E o browser bloqueia a resposta (CORS policy violation)

  # ─── MÚLTIPLAS ORIGENS ────────────────────────────────────────

  Scenario: Múltiplas origens podem ser configuradas
    Dado que CORS_ORIGINS é "http://localhost:3000,http://localhost:3001,http://localhost:3002"
    Quando requisição vem de "http://localhost:3001"
    Então a resposta contém "Access-Control-Allow-Origin: http://localhost:3001"

  # ─── CONFIGURAÇÃO POR AMBIENTE ────────────────────────────────

  Scenario: Em local, as origens são os frontends em localhost
    Dado que .env tem CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002
    Quando o serviço inicia
    Então o middleware CORS está configurado com essas 3 origens

  Scenario: Serviço falha no startup se CORS_ORIGINS não está configurado
    Dado que CORS_ORIGINS não está definido no ambiente
    Quando o serviço é iniciado
    Então o processo termina com código de saída diferente de zero
    E a mensagem de erro indica que CORS_ORIGINS é obrigatório
```

## Solução Técnica

### 1. Variável `CORS_ORIGINS` — lista separada por vírgula

```python
# services/shared/config.py (já criado em ORD-001)
# Adicionar parsing de CORS_ORIGINS:

def get_cors_origins() -> list[str]:
    raw = require_env("CORS_ORIGINS")
    return [o.strip() for o in raw.split(",") if o.strip()]
```

### 2. Aplicar em todos os serviços (mesmo padrão)

```python
# Em cada services/*/main.py — substituir o CORSMiddleware existente:

from shared.config import get_cors_origins

# ANTES (remover):
# app.add_middleware(CORSMiddleware, allow_origins=["*"], ...)

# DEPOIS:
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Internal-Secret"],
    allow_credentials=True,
)
```

Serviços afetados: `auth`, `company`, `catalog`, `order`, `payment`.

### 3. Nginx — remover headers CORS globais

O Nginx não deve mais adicionar headers CORS — isso é responsabilidade do FastAPI:

```nginx
# nginx.conf — REMOVER estas linhas:
# add_header Access-Control-Allow-Origin  "*" always;
# add_header Access-Control-Allow-Methods "GET,POST,PUT,PATCH,DELETE,OPTIONS" always;
# add_header Access-Control-Allow-Headers "Authorization,Content-Type" always;
```

### 4. `.env.example` — origens locais padrão

```dotenv
# ─── CORS ────────────────────────────────────────────────────────
# Local: portas dos frontends Vite
CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002
# Staging/prod: substituir pelos domínios reais
```

### 5. `docker-compose.yml` — passar CORS_ORIGINS para todos os serviços

```yaml
auth-service:
  environment:
    CORS_ORIGINS: ${CORS_ORIGINS}

order-service:
  environment:
    CORS_ORIGINS: ${CORS_ORIGINS}
# (idem para company, catalog, payment)
```

### Estimativa
- **Backend SR:** 2h (get_cors_origins() + aplicar em 5 serviços)
- **DevOps:** 30min (remover CORS headers do nginx.conf + docker-compose)

### Riscos
- **Risco:** Frontends em desenvolvimento podem rodar em portas diferentes por máquina
  → **Mitigação:** `.env` local pode ser editado para adicionar portas extras; em produção, origens são fixas

## Critérios de aceite funcionais
- [ ] `CORSMiddleware` em todos os serviços usa `get_cors_origins()` — sem `allow_origins=["*"]`
- [ ] Requisição de origem não listada não recebe header `Access-Control-Allow-Origin`
- [ ] Nginx não adiciona mais headers CORS globais
- [ ] Serviço não inicia se `CORS_ORIGINS` estiver ausente
- [ ] `.env.example` contém `CORS_ORIGINS` com origens localhost padrão
