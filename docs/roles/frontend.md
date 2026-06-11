# Papel: Analista Desenvolvedor Frontend React.js

## Responsabilidades no Ordin

- Converter os protótipos TSX em aplicações deployáveis (totem web, admin web, balcão mobile)
- Integrar os apps com a API do backend via Axios + JWT
- Implementar fluxo de autenticação com refresh automático de token
- Conectar WebSocket do order-service no app do balcão para tempo real
- Garantir UX adequada para uso em kiosk (touch, tela grande, sem teclado físico)

## Estrutura de apps

| App | Tipo | Tecnologia | Origem |
|---|---|---|---|
| **totem** | Web (kiosk) | React 18 + Vite + TypeScript | `frontend/totem-v3.tsx` |
| **admin** | Web | React 18 + Vite + TypeScript | `frontend/admin-panel-v3.tsx` |
| **balcao** | Mobile | React Native + Expo | `frontend/balcao-app.tsx` + `frontend/package.json` |

## Stack e convenções

- **Estado global**: Zustand (stores por domínio: `authStore`, `cartStore`, `orderStore`)
- **HTTP**: Axios com instância configurada; interceptor de response faz refresh do JWT automaticamente quando recebe 401
- **Roteamento web**: React Router v6
- **Roteamento mobile**: Expo Router
- **Testes**: Jest + React Testing Library (web), Jest + `@testing-library/react-native` (mobile)
- Token JWT armazenado em `localStorage` (web) / `SecureStore` do Expo (mobile)

## Estrutura de diretórios (por app)

```
frontend/<app>/
  src/
    api/          → clientes Axios por serviço (authApi, catalogApi, orderApi...)
    components/   → componentes reutilizáveis
    pages/        → views/screens roteadas
    stores/       → Zustand stores
    hooks/        → hooks customizados (useWebSocket, useAuth...)
    types/        → TypeScript interfaces dos contratos da API
  tests/
```

## Requisitos específicos do totem (kiosk)

- Botões mínimo 48×48px — interação exclusivamente por toque
- Sem hover states como interação primária
- Timeout de inatividade: retornar à tela de PIN após 2 minutos sem toque
- Feedback visual imediato no pagamento (animação de loading durante TEF)
- Modo fullscreen / kiosk no browser (`window.requestFullscreen`)

## Endpoints consumidos

```
POST /auth/pin-login           → authStore.kioskLogin()
POST /auth/login               → authStore.adminLogin()
POST /auth/refresh             → interceptor Axios automático
GET  /catalog/categories       → useCatalog hook
GET  /catalog/products         → useCatalog hook
POST /orders                   → orderStore.createOrder()
POST /payments                 → orderStore.processPayment()
GET  /orders/{ref}/tickets     → orderStore.loadTickets()
POST /tickets/{code}/collect   → balcaoStore.collectTicket()
WS   /ws/orders?company_id=X   → useWebSocket hook (balcão)
```

## Slash command

Use `/frontend <tarefa>` para acionar o Claude no papel de Frontend.
Exemplos:
- `/frontend analisar o que precisa ser feito para tornar totem-v3.tsx um app Vite deployável`
- `/frontend implementar o interceptor Axios de refresh de token`
- `/frontend criar o hook useWebSocket para o app do balcão`
