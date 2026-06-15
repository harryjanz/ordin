---
id: ORD-030
status: Done
fase: 1
sprint: corrections
responsavel: Backend SR
estimativa: 2 pontos
prioridade: P1
bugs: BUG-003
---

# ORD-030 — Balcão não recebe pedidos pagos via WebSocket

## Explorer

**Como** operador de balcão,  
**quero** que um novo pedido apareça automaticamente na fila assim que o pagamento for aprovado,  
**para** que eu não perca pedidos e não precise recarregar a página para ver o trabalho.

### Contexto e motivação

O fluxo atual tem uma lacuna de eventos WebSocket:

1. Totem cria pedido → order-service emite `order.created` (WS) — pedido ainda está `pending`
2. Totem paga → payment-service chama `PATCH /internal/orders/{ref}/status` com `{"status": "paid"}`
3. order-service atualiza o status no banco — **mas não emite nenhum evento WS**

O balcão reage ao `order.created` refazendo `GET /orders?status=paid` — mas nesse momento o pedido ainda é `pending` (o pagamento acontece depois). Com o mock provider (síncrono) pode funcionar por acidente em demos lentas, mas em produção (onde o polling de TEF pode levar segundos) o pedido apareceria na fila apenas após o próximo evento de outro pedido, ou nunca.

O resultado operacional é que o operador não sabe que chegou um novo pedido e o cliente aguarda na fila sem atendimento.

### Personas afetadas
- **Cashier/Operador de balcão**: perde pedidos pagos, cliente não é atendido
- **Manager**: relatório de tempo de atendimento fica incorreto

### Dependências
- ORD-021 (WebSocket order-service) — Done ✅
- `services/order/websocket.py` — `ConnectionManager`, funções `broadcast_*`
- `services/order/main.py` — `internal_update_status`

---

## QA Explorer

```gherkin
Feature: Balcão — pedido pago aparece automaticamente na fila

  Background:
    Given o operador está logado no balcão e WebSocket está "● ao vivo"
    And a fila de pedidos está vazia

  Scenario: Happy path — pedido pago aparece na fila sem refresh manual
    When o totem cria um pedido P-TEST01 e imediatamente paga com crédito mock
    Then em até 3 segundos o pedido P-TEST01 aparece na fila do balcão
    And o card exibe "Terminal 1 · agora · R$ 25,90"
    And o progresso mostra "0/1 tickets"

  Scenario: Múltiplos pedidos em sequência
    When 3 pedidos são pagos em sequência no totem
    Then os 3 aparecem na fila do balcão em ordem cronológica (mais antigo primeiro)

  Scenario: Pedido pendente não aparece na fila
    When o totem cria um pedido mas ainda não pagou
    Then o pedido NÃO aparece na fila do balcão (status ainda é "pending")

  Scenario: Pedido pago de outra empresa não aparece
    Given o operador está logado na Burger House (company_id=1)
    When um pedido é criado e pago na Pasta & Co (company_id=2)
    Then o pedido NÃO aparece na fila do balcão da Burger House

  Scenario: Balcão desconectado não perde pedidos ao reconectar
    Given o WebSocket está desconectado
    When 2 pedidos são pagos durante a desconexão
    And o WebSocket reconecta
    Then os 2 pedidos aparecem na fila (via poll inicial ao reconectar)
```

---

## Tech Explorer

### Causa raiz

`internal_update_status` em `services/order/main.py` (linha ~414) atualiza o banco mas não dispara evento WebSocket:

```python
async def internal_update_status(order_ref, body, db, _):
    o = ...
    o.status = body["status"]
    await db.commit()
    return {"order_ref": order_ref, "status": o.status}   # sem broadcast
```

### Fix — Backend

**1. Adicionar `broadcast_order_paid` em `services/order/websocket.py`:**

```python
async def broadcast_order_paid(company_id: int, order_ref: str, total: float, terminal_id: int):
    await manager.broadcast(company_id, {
        "event": "order.paid",
        "order_ref": order_ref,
        "total": total,
        "terminal_id": terminal_id,
    })
```

**2. Chamar em `internal_update_status` em `services/order/main.py`:**

```python
from websocket import ws_router, broadcast_order_created, broadcast_ticket_collected, \
                      broadcast_order_completed, broadcast_order_paid

async def internal_update_status(order_ref, body, db, _):
    result = await db.execute(select(Order).filter_by(order_ref=order_ref))
    o = result.scalars().first()
    if not o: raise HTTPException(404)
    o.status = body["status"]
    await db.commit()
    if body["status"] == "paid":
        await broadcast_order_paid(o.company_id, order_ref, float(o.total), o.terminal_id)
    return {"order_ref": order_ref, "status": o.status}
```

**3. Frontend — balcão `QueueScreen.tsx` — tratar `order.paid`:**

```typescript
const handleWsEvent = useCallback((event: WsEvent) => {
  if (event.event === "order.paid" && event.order_ref) {
    // Adicionar à fila sem recarregar tudo (mais eficiente)
    api.get(`/orders?status=paid&limit=50`)
      .then((r) => setOrders(r.data.orders ?? []))
      .catch(() => null);
  }
  if (event.event === "order.created") {
    // Manter refresh em order.created como fallback (timing do mock)
    // mas o evento principal agora é order.paid
  }
  if (event.event === "ticket.collected" && event.order_ref && event.progress) {
    const [col, total] = event.progress.split("/").map(Number);
    updateOrderProgress(event.order_ref, col, total);
  }
  if (event.event === "order.completed" && event.order_ref) {
    removeOrder(event.order_ref);
  }
}, []);
```

**4. Tipos `balcao/src/types.ts` — adicionar `order.paid` ao `WsEvent`:**

Não é necessário — `WsEvent.event` é `string`, aceita qualquer valor.

### Cobertura de testes

Adicionar em `services/order/tests/test_coverage.py`:

```python
async def test_broadcast_order_paid():
    from websocket import broadcast_order_paid, manager
    from unittest.mock import patch, AsyncMock
    with patch.object(manager, 'broadcast', new_callable=AsyncMock) as mock_broadcast:
        await broadcast_order_paid(1, "ORD-001", 25.90, 1)
    mock_broadcast.assert_called_once()
    args = mock_broadcast.call_args[0]
    assert args[0] == 1
    assert args[1]["event"] == "order.paid"
    assert args[1]["order_ref"] == "ORD-001"

async def test_internal_update_paid_emits_ws(db_session):
    """Confirma que mudar status para 'paid' dispara broadcast."""
    import main as svc
    from unittest.mock import patch, AsyncMock
    order_id, oi_id, t_id = await _create_order(db_session)
    with patch('main.broadcast_order_paid', new_callable=AsyncMock) as mock_broadcast:
        async with db_session() as db:
            await svc.internal_update_status("ORD-COV01", {"status": "paid"}, db, None)
    mock_broadcast.assert_called_once()
    await _cleanup_order(db_session)
```

### Impacto em outros serviços
- `payment-service` chama `internal_update_status` — sem alteração necessária nele
- O evento `order.paid` é puramente aditivo ao WS — clientes que não tratam esse evento continuam funcionando

### Estimativa
2 pontos — 1 função nova + 4 linhas no handler existente + frontend + 2 testes

### Riscos
- Broadcast de WS pode falhar silenciosamente se não houver conexão — aceitável (já é o comportamento existente em outros broadcasts)

---

## Ready ✅

- [x] User story documentada
- [x] Causa raiz identificada (internal_update_status sem broadcast WS)
- [x] Cenários Gherkin escritos (incluindo multi-tenant e reconexão)
- [x] Solução técnica: `broadcast_order_paid` + chamar em `internal_update_status` + frontend
- [x] Estimativa: 2 pontos
- [x] Sem bloqueadores
