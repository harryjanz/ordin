---
id: ORD-038
status: Done
fase: 1
sprint: setup-revisao
responsavel: Frontend
estimativa: 2 pontos
prioridade: P1
---

# ORD-038 — Totem: simulação de impressão térmica ao finalizar pedido

## Explorer

**Como** cliente do totem,  
**quero** que meus tickets sejam impressos na impressora térmica ao finalizar o pedido,  
**para** que eu possa pegar o comprovante e apresentar no balcão.

**Simulação:** abre nova aba com layout de impressora térmica (80mm) + `window.print()` automático.

## QA Explorer

- Popup blocker: em kiosk dedicado não é problema; fallback: botão "Imprimir agora" se aba não abrir
- Timing QR: useEffect extrai SVG após pintura → SVGs já renderizados
- `@page { size: 80mm auto; margin: 4mm }` para largura correta
- Linha de recorte: `- - - ✂ - - -` com `border-top: 1px dashed`
- `window.onafterprint` não fecha automaticamente (kiosk lida com isso)
- Product name: parse de `qr_data.split("|")[1]`

## Tech Explorer

- SuccessScreen recebe nova prop `companyName: string`
- Renderiza div oculto com `<QRCodeSVG>` por ticket, cada um com `data-ticket-qr`
- `useEffect`: coleta `querySelectorAll('[data-ticket-qr] svg')` → outerHTML → build HTML → `window.open()`
- App.tsx passa `company?.name ?? "ordin"` para SuccessScreen
