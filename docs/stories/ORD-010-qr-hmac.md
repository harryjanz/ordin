---
id: ORD-010
status: Done
fase: 1
sprint: 2
responsavel: Backend SR
---

# ORD-010 — Assinar QR Code de tickets com HMAC-SHA256

## História
Como operador de balcão, quero que o QR code do ticket tenha assinatura criptográfica, para que seja impossível criar QR codes falsos com dados adulterados e garantindo que apenas tickets emitidos pelo sistema são aceitos na coleta.

## Contexto e motivação
Vulnerabilidade M2 de `docs/ARQUITETURA.md` §12. O `qr_data` atual é `"{code}|{name}|{ref}|{ts}"` — uma string simples sem integridade criptográfica. Qualquer pessoa que conheça o formato pode criar um QR adulterado com dados modificados (ex: mudar o nome do produto para confundir o balcão). O HMAC-SHA256 com `QR_SECRET` garante que o conteúdo do QR é exatamente o que foi emitido pelo sistema no momento do pedido.

**Fluxo de coleta com HMAC:** o app do balcão escaneia o QR, lê o payload completo (incluindo o HMAC) e envia para o endpoint de coleta. O backend valida a assinatura antes de processar a coleta.

> `QR_SECRET` já está em `.env` e `.env.example` — nenhuma mudança de infra necessária.

## Dependências
- **Depende de:** ORD-001 (QR_SECRET via env) ✓ já aplicado

## Cenários de Teste (Gherkin)

```gherkin
Feature: ORD-010 — HMAC no QR Code de tickets

  # ─── HAPPY PATH ───────────────────────────────────────────────

  Scenario: Ticket criado tem HMAC válido no qr_data
    Dado que um pedido é criado via POST /orders
    Quando consulto os tickets gerados
    Então cada qr_data tem o formato "code|name|ref|ts|hmac"
    E o HMAC é SHA256 do payload "code|name|ref|ts" com QR_SECRET

  Scenario: Coleta com QR válido é aceita
    Dado que o balcão escaneia um QR legítimo com payload "ABC|X-Burguer|P123456|2026-...|abc123"
    Quando envia POST /tickets/ABC/collect com {"qr_data": "ABC|X-Burguer|P123456|2026-...|abc123"}
    Então recebe HTTP 200

  # ─── QR ADULTERADO ────────────────────────────────────────────

  Scenario: Coleta com QR sem HMAC é rejeitada
    Dado que o payload do QR é "ABC|X-Burguer|P123456|ts" (sem HMAC)
    Quando envia POST /tickets/ABC/collect com esse qr_data
    Então recebe HTTP 400 com {"detail": "QR inválido"}

  Scenario: Coleta com HMAC incorreto é rejeitada
    Dado que o payload tem HMAC calculado com secret errado
    Quando envia POST /tickets/ABC/collect
    Então recebe HTTP 400 com {"detail": "QR inválido"}

  Scenario: Coleta com nome de produto adulterado é rejeitada
    Dado que o payload original é "ABC|X-Burguer|P123456|ts|hmac_correto"
    Quando alguém muda para "ABC|X-Premium|P123456|ts|hmac_correto"
    Então o HMAC não bate e recebe HTTP 400

  # ─── RETROCOMPATIBILIDADE ─────────────────────────────────────

  Scenario: Ticket sem qr_data no body ainda funciona (campo opcional com grace period)
    Dado que o app do balcão ainda não foi atualizado para enviar qr_data
    Quando envia POST /tickets/ABC/collect sem campo qr_data
    Então recebe HTTP 200 (validação HMAC é pulada se qr_data ausente)
```

> **Nota sobre retrocompatibilidade:** o campo `qr_data` no body de `CollectIn` é **opcional** inicialmente para não quebrar clientes existentes. Após todos os frontends serem atualizados (Sprint 4), remover a exceção.

## Solução Técnica

### Gerar HMAC na criação do ticket (order-service)

```python
import hmac as hmaclib
import hashlib
from config import require_env, get_cors_origins

QR_SECRET = require_env("QR_SECRET")

def _make_qr_data(code: str, name: str, ref: str, ts: str) -> str:
    payload = f"{code}|{name}|{ref}|{ts}"
    sig = hmaclib.new(QR_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}|{sig}"
```

Atualizar a geração do ticket em `create_order`:

```python
# ANTES:
qr = f"{code}|{item.name}|{ref}|{datetime.utcnow().isoformat()}"

# DEPOIS:
ts = datetime.utcnow().isoformat()
qr = _make_qr_data(code, item.name, ref, ts)
```

### Validar HMAC na coleta (order-service)

```python
def _verify_qr(qr_data: str) -> bool:
    parts = qr_data.split("|")
    if len(parts) != 5:
        return False
    *data_parts, received_sig = parts
    payload = "|".join(data_parts)
    expected = hmaclib.new(QR_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return hmaclib.compare_digest(expected, received_sig)
```

Atualizar `CollectIn` e `collect_ticket`:

```python
class CollectIn(BaseModel):
    collected_by: Optional[str] = "balcao"
    collection_device: Optional[str] = None
    qr_data: Optional[str] = None  # opcional durante grace period

@app.post("/tickets/{ticket_code}/collect")
async def collect_ticket(ticket_code: str, body: CollectIn, ...):
    # Valida HMAC se qr_data foi enviado
    if body.qr_data is not None:
        if not _verify_qr(body.qr_data):
            raise HTTPException(400, detail="QR inválido")
        # Extrai ticket_code do qr_data e verifica que bate com o path
        qr_code = body.qr_data.split("|")[0]
        if qr_code != ticket_code:
            raise HTTPException(400, detail="QR inválido")
    # ... resto da lógica de coleta
```

### docker-compose — adicionar QR_SECRET ao order-service

```yaml
order-service:
  environment:
    QR_SECRET: ${QR_SECRET}
```

> `QR_SECRET` já está em `.env` e `.env.example`. Apenas o `docker-compose.yml` precisa ser atualizado para o order-service.

### Estimativa
- **Backend SR:** 3h (geração + validação + docker-compose + testes manuais)

### Riscos
- **Baixo:** Tickets criados antes desta história têm `qr_data` sem HMAC. O campo opcional em `CollectIn` cobre esse caso durante a transição.
- **Baixo:** `qr_data` contém `item.name` que pode ter caracteres `|`. Solução: usar encoding (ex: substituir `|` por ` ` no nome) ou limitar `name` a alphanumeric no schema do produto.
  → **Mitigação:** truncar `item.name` para 50 chars e substituir `|` por `-` antes de incluir no payload.

## Critérios de aceite funcionais
- [x] `qr_data` de tickets novos tem formato `code|name|ref|ts|hmac` (5 partes)
- [x] HMAC calculado com `hmac.compare_digest` (timing-safe)
- [x] `collect_ticket` com `qr_data` com HMAC errado retorna 400
- [x] `collect_ticket` sem `qr_data` no body ainda retorna 200 (retrocompatibilidade)
- [x] `QR_SECRET` lido via `require_env` no order-service
- [x] `QR_SECRET` no docker-compose do order-service
