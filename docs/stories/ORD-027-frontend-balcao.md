---
id: ORD-027
status: New
fase: 1
sprint: 4
responsavel: Frontend
---

# ORD-027 — Frontend balcão completo conectado à API real + WebSocket

## Descrição
O arquivo `frontend/balcao-app.tsx` é um stub vazio (~650 linhas necessárias). É necessário completar o app do balcão com o fluxo de login, recebimento de pedidos em tempo real via WebSocket e coleta de tickets por leitura de QR Code.

## Contexto
O operador de balcão usa essa interface para acompanhar pedidos chegando do totem e coletar os tickets dos clientes ao entregar os itens. A versão React (web) é usada no piloto; a versão React Native (Expo) é a versão de produção para dispositivos móveis — o código deve ser estruturado para facilitar essa migração.

## Fluxo completo a implementar

1. **Login** — PIN do operador → `POST /auth/pin-login` com role cashier/manager
2. **Tela principal** — fila de pedidos pendentes em tempo real via WebSocket (`ws://host:8004/ws/orders?company_id=X`)
3. **Badge de urgência** — destaca pedidos com mais de 10 minutos aguardando
4. **Leitura de QR** — simulador de câmera na web (input manual ou câmera via `getUserMedia`)
5. **Coleta de ticket** — `POST /tickets/{code}/collect` → feedback visual e sonoro
6. **Modo Turbo** — coleta sem confirmação para operação rápida
7. **Bloqueio por inatividade** — 15 min sem interação → volta para login
8. **Busca de pedido** — filtro por número de pedido ou nome

## Integrações de API obrigatórias
- WebSocket: depende de ORD-021 (integração WebSocket no order-service)
- Coleta: `POST /tickets/{code}/collect`
- Login: `POST /auth/pin-login` + refresh via ORD-022

## Restrições técnicas
- React 18 + Vite para versão web (piloto)
- Estrutura compatível com migração futura para React Native/Expo
- Web Audio API para feedback sonoro na versão web
- Suporte a câmera via `getUserMedia` (web) com fallback para input manual

## Stakeholder
Operador de balcão. Interface de trabalho contínuo durante o turno.
