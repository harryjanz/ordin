---
id: ORD-027
status: Done
fase: 1
sprint: 4
responsavel: Frontend
estimativa: 5 pontos
---

# ORD-027 — Frontend balcão completo conectado à API real + WebSocket

## Explorer

**Como** operador de balcão,  
**quero** ver pedidos chegando em tempo real e dar baixa nos tickets via leitura de QR code,  
**para** que a entrega dos itens seja registrada sem papel e sem erro.

### Contexto e motivação
O app de balcão é a contrapartida do totem: é ele quem recebe o pedido e entrega os itens. Sem ele funcional, o fluxo de ponta a ponta fica incompleto — o cliente paga no totem mas não há interface para o operador entregar. `frontend/balcao-app.tsx` é um stub (28 linhas). A versão de produção será React Native/Expo, mas para o piloto é entregue como web app (Vite + React 18) para reduzir complexidade de distribuição.

### Persona
- **Operador de balcão**: usa o app em um tablet ou computador durante o turno. Não precisa entender a plataforma — a interface deve ser autoexplicativa.
- **Manager**: pode usar o mesmo app com visibilidade ampliada (todos os pedidos do turno).

### Fluxo

1. **Login** — PIN → `POST /auth/pin-login` com role cashier/manager → JWT (15min access + 7d refresh)
2. **Tela principal — fila de pedidos** — lista carregada na inicialização via `GET /orders?status=pending` + atualizações em tempo real via WebSocket
3. **Badge de urgência** — pedidos com mais de 10 minutos aguardando exibem badge vermelho
4. **Detalhe do pedido** — click expande e exibe os tickets com status de coleta
5. **Coleta de ticket** — câmera via `getUserMedia` lê QR → `POST /tickets/{code}/collect` (com fallback para input manual)
6. **Modo Turbo** — toggle que coleta sem confirmação ao ler o QR, para operação rápida
7. **Feedback** — visual (badge atualiza) + sonoro (Web Audio API: beep de sucesso / erro)
8. **Bloqueio por inatividade** — 15 min sem interação → volta para login
9. **Busca** — filtro por número de pedido na fila

### Dependências
- ORD-021 (WebSocket no order-service) — **feito**
- ORD-022 (refresh token) — **feito**; balcão usa refresh automático (access token expira em 15min)
- **Novo endpoint necessário**: `GET /orders` no order-service (ver Tech Explorer)

---

## QA Explorer

```gherkin
Feature: Balcão — recebimento e coleta de pedidos

  Background:
    Given o operador fez login com PIN do cashier da Burger House
    And o WebSocket está conectado em ws://localhost:8000/ws/orders?company_id=1

  Scenario: Happy path — novo pedido chega e ticket é coletado
    Given a fila de pedidos está vazia
    When o totem cria um pedido "ORD-ABC1" com 2 tickets
    Then o app de balcão exibe "ORD-ABC1" na fila em até 2 segundos via WebSocket
    When o operador abre o pedido e lê o QR code do primeiro ticket
    Then o sistema envia POST /tickets/{code}/collect
    And o ticket é marcado como "coletado" visualmente (tachado ou ícone)
    And o progresso do pedido atualiza de "0/2" para "1/2"
    When o operador lê o segundo ticket
    Then o pedido é marcado como "concluído" e sai da fila de pendentes

  Scenario: QR code inválido
    Given o operador está coletando um ticket
    When o leitor captura um QR de outro sistema
    Then o sistema retorna 400
    And o app exibe feedback sonoro de erro e mensagem "QR inválido"
    And nenhum ticket é marcado como coletado

  Scenario: Ticket já coletado
    Given um ticket já foi coletado anteriormente
    When o operador tenta coletar o mesmo ticket novamente
    Then o sistema retorna 409
    And o app exibe "Ticket já foi coletado" sem alterar o estado

  Scenario: Badge de urgência
    Given há um pedido na fila há mais de 10 minutos
    Then o pedido exibe badge vermelho "URGENTE"
    And o pedido fica no topo da fila (ordenado por urgência)

  Scenario: Modo Turbo ativado
    Given o operador ativou o Modo Turbo
    When o leitor captura um QR válido
    Then o sistema coleta o ticket imediatamente sem diálogo de confirmação
    And o feedback sonoro de sucesso é emitido

  Scenario: Modo Turbo desativado
    Given o Modo Turbo está desativado
    When o leitor captura um QR válido
    Then o app exibe modal de confirmação com dados do ticket
    And o operador confirma para coletar

  Scenario: WebSocket cai e reconecta
    Given o WebSocket está conectado
    When a conexão é perdida (servidor reinicia ou rede cai)
    Then o app exibe indicador "Reconectando..."
    And tenta reconectar com backoff exponencial (1s, 2s, 4s, máx 30s)
    And ao reconectar, recarrega a fila via GET /orders

  Scenario: Bloqueio por inatividade
    Given o operador fez login e está na tela principal
    When não há interação por 15 minutos
    Then o app volta para a tela de login automaticamente
    And o JWT é descartado da memória

  Scenario: Refresh automático do token
    Given o access token vai expirar em menos de 1 minuto
    When qualquer chamada API é feita
    Then o interceptor axios faz POST /auth/refresh antes da chamada
    And a chamada original prossegue com o novo token
```

---

## Tech Explorer

### Gap identificado: endpoint `GET /orders` ausente

O order-service não possui `GET /orders` (listagem de pedidos da empresa). O balcão precisa da fila inicial ao conectar. **Solução**: adicionar `GET /orders?status=pending&limit=50` ao order-service como parte da implementação de ORD-027.

**Endpoint a criar no order-service:**
```
GET /orders?status=pending&limit=50&skip=0
Authorization: Bearer JWT (role: cashier | manager | admin)
→ { "orders": [...], "total": N }
```

Cada order item retorna: `order_ref`, `status`, `total`, `created_at`, `terminal_id`, progresso de tickets.

### Decisão de estrutura

```
frontend/
  balcao/
    index.html
    vite.config.ts
    tsconfig.json
    package.json
    src/
      main.tsx
      App.tsx              # máquina: LOGIN | QUEUE | ORDER_DETAIL
      api.ts               # axios instance + interceptors de refresh
      store.ts             # Zustand: auth, orders, ws
      ws.ts                # WebSocket manager (connect, reconnect, event dispatch)
      screens/
        LoginScreen.tsx
        QueueScreen.tsx    # fila de pedidos com WebSocket
        OrderDetailScreen.tsx
      components/
        QrScanner.tsx      # getUserMedia + fallback input
        UrgencyBadge.tsx
        AudioFeedback.ts   # Web Audio API
      types.ts
```

Deps: `vite`, `react`, `react-dom`, `typescript`, `axios`, `zustand`

### Contratos de API

| Ação | Método | Endpoint | Auth |
|---|---|---|---|
| Login cashier | POST | `/auth/pin-login` | nenhuma |
| Refresh token | POST | `/auth/refresh` | nenhuma (body: refresh_token) |
| Listar pedidos | GET | `/orders?status=pending` | Bearer JWT (a criar) |
| Detalhe tickets | GET | `/orders/{ref}/tickets` | Bearer JWT |
| Coletar ticket | POST | `/tickets/{code}/collect` | Bearer JWT |
| WebSocket | WS | `/ws/orders?company_id=X` | token via query param |

### WebSocket: eventos recebidos

```ts
// order.created — novo pedido chegou (emitido pelo order-service)
{ type: "order.created", order_ref: "ORD-XXX", total: 51.80, terminal: "Terminal 1" }

// ticket.collected — ticket baixado (atualiza progresso)
{ type: "ticket.collected", order_ref: "ORD-XXX", ticket_code: "TC-XXX", progress: "1/2" }

// order.completed — todos tickets coletados (remove da fila)
{ type: "order.completed", order_ref: "ORD-XXX" }
```

### WebSocket: autenticação

O endpoint WS no order-service lê `company_id` via query param (sem auth no WS por enquanto — isolamento por company_id). Verificar se é necessário adicionar auth via query param token para o piloto.

### Payload `POST /tickets/{code}/collect`

```json
{ "collected_by": "cashier_name", "collection_device": "balcao-web", "qr_data": "..." }
```

`qr_data` é o conteúdo completo do QR escaneado (string no formato `{ticket_code}|{order_ref}|{product_name}|{unit}/{total}|{HMAC}`).

### Gestão de refresh token

```
axios interceptor (response) →
  se 401 → POST /auth/refresh com refresh_token do store →
    sucesso → atualiza store, repete request original
    falha (refresh expirado) → logout, volta para login
```

### Câmera / QR Scanner

- Web: `getUserMedia({ video: { facingMode: "environment" } })` + canvas frame analysis via `jsQR` lib
- Fallback: input text manual (operador digita o código)
- Permissão negada → mostra apenas fallback manual

### Feedback sonoro (Web Audio API)

```ts
const ctx = new AudioContext();
function beepSuccess() { /* 880Hz, 0.1s */ }
function beepError()   { /* 220Hz, 0.3s */ }
```

### Riscos técnicos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| `getUserMedia` bloqueado sem HTTPS | Alta (em dev) | Usar `localhost` (browsers permitem) ou ngrok com HTTPS |
| jsQR não lê QR do totem | Média | Validar com QR real do seed antes de finalizar |
| WebSocket cai sem reconexão | Baixa | Backoff exponencial implementado em `ws.ts` |
| GET /orders ausente | Confirmada | Criar endpoint no order-service como parte desta história |

### Estimativa
5 pontos — implementação web + WebSocket + QR scanner + GET /orders no backend (1 ponto do total).
