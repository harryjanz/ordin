---
id: ORD-021
status: Done
fase: 1
sprint: 2
responsavel: Backend SR
---

# ORD-021 — Integrar WebSocket ao order-service

## Descrição
O arquivo `services/order/websocket.py` já implementa o `ConnectionManager` e os eventos `ticket.collected`, `order.completed` e `order.created`, mas não está registrado no `main.py`. O router de WebSocket precisa ser importado e montado na aplicação FastAPI para que o balcão e outros clientes possam receber notificações em tempo real.

## Contexto
Sem WebSocket integrado, o operador de balcão não vê pedidos chegando em tempo real — precisa recarregar a tela manualmente. Isso torna o fluxo de balcão inutilizável em operação real. O código já existe; é uma questão de registro e disparo dos eventos nos endpoints de criação de pedido e coleta de ticket.

O Nginx já tem o bloco de upgrade configurado para `/ws/`. A URL esperada pelo frontend é `ws://host:8004/ws/orders?company_id=X`.

## O que precisa ser feito
1. Importar e registrar o `ws_router` em `services/order/main.py`
2. Disparar `broadcast_order_created` no endpoint `POST /orders`
3. Disparar `broadcast_ticket_collected` e `broadcast_order_completed` no endpoint `POST /tickets/{code}/collect`
4. Validar que o heartbeat a cada 30s está funcionando

## Stakeholder
Operador de balcão. Sem notificações em tempo real o fluxo de coleta de tickets depende de atualização manual.
