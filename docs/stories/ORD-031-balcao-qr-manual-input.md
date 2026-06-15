---
id: ORD-031
status: Done
fase: 1
sprint: corrections
responsavel: Frontend
estimativa: 1 ponto
prioridade: P1
bugs: BUG-004
---

# ORD-031 — Balcão: entrada manual de código de ticket retorna HTTP 400

## Explorer

**Como** operador de balcão em situação de câmera indisponível,  
**quero** poder coletar um ticket digitando apenas o código alfanumérico,  
**para** que falhas de câmera não bloqueiem a entrega de pedidos.

### Contexto e motivação

O componente `QrScanner.tsx` possui um fallback de texto quando a câmera falha (`cameraError = true`). O placeholder diz "Código do ticket", mas o valor digitado é enviado como `qr_data` ao endpoint de coleta. O endpoint valida o HMAC do QR quando `qr_data` é fornecido — um código solto como `4QDJAFXP` não tem 5 segmentos pipe-separated, então `_verify_qr` retorna False e a API responde HTTP 400 "QR inválido".

O operador vê "QR inválido ou de outro sistema" e não consegue coletar o ticket, mesmo com o código correto em mãos.

**Nota:** o endpoint `POST /tickets/{code}/collect` aceita `qr_data` como campo **opcional**. Quando `qr_data` é null/ausente, a validação HMAC é pulada e o ticket é coletado apenas pelo código. O fix é no frontend — não enviar `qr_data` quando o input vem do modo manual.

### Personas afetadas
- **Cashier**: bloqueado em situação de câmera inoperante

### Dependências
- `frontend/balcao/src/components/QrScanner.tsx`
- `frontend/balcao/src/screens/OrderDetailScreen.tsx`

---

## QA Explorer

```gherkin
Feature: Balcão — coleta manual de ticket quando câmera falha

  Background:
    Given existe um pedido P-TEST com 1 ticket código "ABCD1234" no status "paid"
    And o operador está na tela de detalhe do pedido P-TEST

  Scenario: Câmera indisponível — coleta via código manual
    Given a câmera falhou (cameraError = true)
    And o operador digita "ABCD1234" no campo de texto e confirma
    Then a API recebe POST /tickets/ABCD1234/collect com qr_data ausente ou null
    And a resposta é HTTP 200
    And o ticket é marcado como "coletado" na interface

  Scenario: Câmera disponível — coleta via scan continua funcionando
    Given a câmera está disponível
    When o operador scanneia o QR code completo de "ABCD1234"
    Then a API recebe POST /tickets/ABCD1234/collect com qr_data preenchido (string pipe-separated)
    And a resposta é HTTP 200

  Scenario: Código inexistente via manual
    Given a câmera falhou
    And o operador digita "NAOEXISTE" no campo de texto
    Then a API responde HTTP 404
    And o operador vê "Erro ao coletar ticket."

  Scenario: Código de outra empresa via manual
    Given a câmera falhou
    And o ticket "OUTREMP" pertence à Pasta & Co (company_id=2)
    When o operador (Burger House) digita "OUTREMP"
    Then a API responde HTTP 404 (isolamento multi-tenant)
```

---

## Tech Explorer

### Causa raiz

Em `OrderDetailScreen.tsx`, a função `collectTicket(qrData: string)` sempre envia `qr_data: qrData`:

```typescript
async function collectTicket(qrData: string) {
  const ticketCode = qrData.split("|")[0];
  await api.post(`/tickets/${ticketCode}/collect`, {
    collected_by: "balcao",
    collection_device: "balcao-web",
    qr_data: qrData,              // ← enviado mesmo quando qrData é só o código
  });
}
```

Quando o scan vem da câmera, `qrData` tem o formato `TICK|product|order_ref|ts|hmac` (válido). Quando vem do input manual, `qrData` = `"ABCD1234"` — sem pipes, HMAC inválido.

### Fix — Frontend

**`frontend/balcao/src/screens/OrderDetailScreen.tsx`**:

Detectar se o valor escaneado é QR completo (contém `|`) ou apenas código:

```typescript
async function collectTicket(qrData: string) {
  if (collecting) return;
  setCollecting(true);
  setScanning(false);
  setPendingTicket(null);

  const isFullQr = qrData.includes("|");
  const ticketCode = isFullQr ? qrData.split("|")[0] : qrData;

  try {
    await api.post(`/tickets/${ticketCode}/collect`, {
      collected_by: "balcao",
      collection_device: "balcao-web",
      ...(isFullQr ? { qr_data: qrData } : {}),   // omite qr_data no modo manual
    });
    // ... resto igual
  }
```

Também atualizar o modal de confirmação (`pendingTicket`) para exibir o código correto:

```typescript
// linha ~171 — já usa pendingTicket.split("|")[0], ok para ambos os casos
{pendingTicket.split("|")[0]}
```

### Impacto em outros serviços
- Nenhum. O endpoint já aceita `qr_data` como opcional.

### Estimativa
1 ponto — 3 linhas modificadas

### Riscos
- Nenhum. Sem HMAC, a validação de segurança é pulada — mas isso é o comportamento documentado do endpoint para coleta de emergência. O isolamento multi-tenant ainda é garantido via `company_id` do JWT.

---

## Ready ✅

- [x] User story documentada
- [x] Causa raiz: `qr_data` sempre enviado mesmo quando input é só código
- [x] Cenários Gherkin escritos (manual, câmera, 404, multi-tenant)
- [x] Solução: detectar `qrData.includes("|")` e omitir `qr_data` no modo manual
- [x] Estimativa: 1 ponto
- [x] Sem bloqueadores
