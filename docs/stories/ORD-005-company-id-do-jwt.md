---
id: ORD-005
status: Done
fase: 1
sprint: 1
responsavel: Backend SR
---

# ORD-005 — company_id sempre extraído do JWT, nunca aceito do body

## História
Como admin de empresa, quero que meu `company_id` seja sempre extraído do meu token JWT e nunca aceito do body da requisição, para que seja impossível que um usuário autenticado da empresa A crie pedidos, acesse pagamentos ou liste dados da empresa B.

## Contexto e motivação
Vulnerabilidade A2 de `docs/ARQUITETURA.md` §12 e regra central de multi-tenancy (§6). Hoje `POST /orders` aceita `company_id` no body — qualquer usuário autenticado pode passar `company_id: 2` e criar pedidos para outra empresa. O mesmo vale para `GET /payments?company_id=X`. Depende de ORD-002 (JWT validado) para funcionar.

**Regra inviolável:** `company_id` vem SEMPRE do `current_user.company_id` — nunca do body, nunca de query param de escrita. A única exceção são super admins com `role="superadmin"` que podem operar em múltiplas empresas (mas isso é controlado por role, não por parâmetro livre).

## Fluxo principal — como ficará após a história

1. Totem autenticado envia `POST /orders` com items (sem `company_id` no body)
2. Handler extrai `current_user.company_id` do JWT via dependency (ORD-002)
3. Pedido é criado com `company_id` do JWT — body não pode sobrescrever
4. Se body tiver `company_id`, é ignorado (ou erro 422 se o campo for removido do schema)
5. `GET /payments` não aceita `company_id` como query param — retorna apenas transações da empresa do JWT

## Dependências
- **Depende de:** ORD-002 (JWT obrigatório — `current_user` deve estar disponível)

## Cenários de Teste (Gherkin)

```gherkin
Feature: ORD-005 — company_id sempre do JWT, nunca do body

  # ─── ISOLAMENTO MULTI-TENANT — ESCRITA ────────────────────────

  Scenario: Pedido é criado com company_id do JWT, não do body
    Dado que usuário autenticado tem company_id=1 no JWT
    Quando envia POST /orders com body contendo company_id=2 e items válidos
    Então o pedido é criado com company_id=1
    E nenhum dado da empresa 2 é afetado

  Scenario: company_id do body é silenciosamente ignorado em POST /orders
    Dado que usuário autenticado tem company_id=1 no JWT
    Quando envia POST /orders com company_id=999 no body
    Então o pedido é criado com company_id=1
    E o response retorna order_ref sem erros

  Scenario: Pagamento é criado com company_id do JWT
    Dado que usuário autenticado tem company_id=1 no JWT
    Quando envia POST /payments com company_id=2 no body
    Então a transação é registrada com company_id=1

  # ─── ISOLAMENTO MULTI-TENANT — LEITURA ────────────────────────

  Scenario: GET /payments retorna apenas transações da empresa do JWT
    Dado que usuário autenticado tem company_id=1 no JWT
    E existem transações das empresas 1, 2 e 3 no banco
    Quando envia GET /payments (sem query param)
    Então a resposta contém apenas transações com company_id=1

  Scenario: Tentativa de ler pagamentos de outra empresa via query param é ignorada
    Dado que usuário autenticado tem company_id=1 no JWT
    Quando envia GET /payments?company_id=2
    Então a resposta contém apenas transações com company_id=1 (query param é ignorado)

  Scenario: Token da empresa A não retorna tickets da empresa B
    Dado que o totem da empresa A tem um JWT com company_id=1
    E existe um pedido da empresa B com order_ref="P999999"
    Quando envia GET /orders/P999999/tickets com token da empresa A
    Então recebe HTTP 404 (pedido não encontrado para company_id=1)

  # ─── KIOSK ROLE ───────────────────────────────────────────────

  Scenario: Totem com role=kiosk cria pedido com company_id do JWT
    Dado que totem tem JWT com role=kiosk e company_id=2 e terminal_id=3
    Quando envia POST /orders com items mas sem company_id no body
    Então o pedido é criado com company_id=2 e terminal_id=3 (do JWT)
```

## Solução Técnica

### 1. `TokenPayload` já tem `company_id` — disponível nos handlers (ORD-002)

### 2. order-service — remover `company_id` e `terminal_id` do body

```python
# ANTES:
class OrderIn(BaseModel):
    company_id: int    # ← REMOVER
    terminal_id: int   # ← MOVER para JWT (kiosk) ou body opcional para admin
    items: List[ItemIn]
    cpf: Optional[str] = None
    discount: float = 0

# DEPOIS:
class OrderIn(BaseModel):
    items: List[ItemIn]
    cpf: Optional[str] = None
    discount: float = 0

@app.post("/orders", status_code=201)
def create_order(
    body: OrderIn,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user)
):
    # company_id e terminal_id vêm do JWT
    order = Order(
        company_id=current_user.company_id,
        terminal_id=current_user.terminal_id or 0,
        ...
    )
```

> Para role=kiosk: `terminal_id` está no JWT (emitido em `pin-login`).
> Para role=cashier/manager criando pedido manual: `terminal_id` pode ser passado no body.

### 3. payment-service — remover `company_id` do body e do query param

```python
# PaymentIn — remover company_id:
class PaymentIn(BaseModel):
    order_ref: str; terminal_id: int
    tef_number: str; method: str; amount: float
    items: List[ItemIn]; cpf: Optional[str] = None
    # company_id: int  ← REMOVER

@app.post("/payments", status_code=201)
async def create_payment(
    body: PaymentIn,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user)
):
    tx = Transaction(
        company_id=current_user.company_id,  # ← sempre do JWT
        ...
    )

# GET /payments — company_id do JWT, não de query param:
@app.get("/payments")
def list_payments(
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user)
):
    txs = db.query(Transaction).filter_by(
        company_id=current_user.company_id  # ← sempre do JWT
    ).order_by(Transaction.created_at.desc()).limit(100).all()
```

### 4. catalog-service — `company_id` de query param é substituído pelo JWT

```python
@app.get("/catalog/categories")
def list_categories(
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user)
):
    cats = db.query(Category).filter_by(
        company_id=current_user.company_id,  # ← do JWT
        active=True
    ).all()
```

### 5. order-service — validar que `order_ref` pertence à empresa do JWT

```python
@app.get("/orders/{order_ref}/tickets")
def list_order_tickets(
    order_ref: str,
    db: Session = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user)
):
    tickets = db.query(Ticket).join(Order).filter(
        Ticket.order_ref == order_ref,
        Order.company_id == current_user.company_id  # ← isolamento
    ).all()
    if not tickets:
        raise HTTPException(404, "Pedido não encontrado")
```

### Estimativa
- **Backend SR:** 4h (remover company_id do body em order + payment, aplicar JWT company_id em catalog + order GET, validar ownership nos GETs)

### Riscos
- **Risco:** Testes existentes (se houver) passam `company_id` no body — vão quebrar
  → **Mitigação:** não há testes automatizados ainda (ORD-016); no piloto o cliente deve ser atualizado junto
- **Risco:** `terminal_id` para admins criando pedido manual precisa de tratamento especial
  → **Decisão:** terminal_id=0 para pedidos criados manualmente pelo admin (sem terminal TEF)

## Critérios de aceite funcionais
- [ ] `POST /orders` com `company_id` no body cria o pedido com `company_id` do JWT
- [ ] `GET /payments` retorna apenas transações da empresa do JWT (sem query param `company_id`)
- [ ] `GET /orders/{ref}/tickets` retorna 404 se o pedido não pertence à empresa do JWT
- [ ] `GET /catalog/categories` retorna apenas categorias da empresa do JWT
- [ ] Usuário da empresa A não consegue ver dados da empresa B em nenhum endpoint
