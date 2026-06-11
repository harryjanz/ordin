---
id: ORD-026
status: New
fase: 1
sprint: 4
responsavel: Frontend
---

# ORD-026 — Frontend totem-v3 completo conectado à API real

## Descrição
O arquivo `frontend/totem-v3.tsx` é um stub vazio. Existe uma versão anterior funcional em `frontend/totem.tsx` (559 linhas) que usa `window.storage` compartilhado com mock local. É necessário completar o totem-v3 com o fluxo completo conectado à API real do backend.

## Contexto
O totem é a interface principal do usuário final — quem realiza o pedido no kiosk. Deve ser uma SPA React standalone que pode rodar tanto no browser (demo/piloto via ngrok) quanto embutida em um ambiente de quiosque. Base: `totem.tsx` v1 como referência de UI/UX, evoluindo para integração real.

## Fluxo completo a implementar

1. **Tela de PIN** — campo numérico 4 dígitos → `POST /auth/validate-pin`
2. **Seleção de terminal** — lista terminais da empresa → `GET /companies/{id}/terminals`
3. **Login** — `POST /auth/pin-login` → armazena JWT
4. **Catálogo** — carrega categorias e produtos → `GET /catalog/categories`, `GET /catalog/products`
5. **Carrinho** — drawer lateral, adicionar/remover itens, total
6. **CPF na nota** — campo opcional antes do pagamento
7. **Pagamento** — crédito/débito/PIX → `POST /payments` (com retry em recusa)
8. **Tela de sucesso** — exibe tickets com QR codes recebidos do backend
9. **Timeout de inatividade** — volta para tela de PIN após N segundos

## Integrações de API obrigatórias
- Autenticação: ORD-022 (refresh automático quando access token expira)
- Catálogo: depende de ORD-020 (seed) e ORD-023 (CRUD)
- Pagamento: flag PAYGO_MODE transparente para o frontend (ORD-025)
- WebSocket: conectar a `ws://host:8004/ws/orders?company_id=X` para atualização de status do pedido

## Restrições técnicas
- React 18 + Vite, sem dependência de Next.js
- Sem biblioteca de UI externa (styled-components ou CSS-in-JS inline, como no totem.tsx v1)
- Compatível com tela touch 1080×1920 (orientação portrait)

## Stakeholder
Usuário final no kiosk. É a interface mais crítica do piloto.
