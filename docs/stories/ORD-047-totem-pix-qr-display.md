# ORD-047 — Totem: exibição do QR PIX na tela de pagamento

**Status:** Done  
**Pontos:** 3  
**Sprint:** Pagamentos MP

---

## Explorer

Quando o cliente escolhe pagar via PIX no totem, o backend (payment-service via MPProvider) cria o pagamento e retorna os campos `qr_code` (string EMV) e `qr_code_base64` (PNG base64). O totem precisa exibir esse QR na tela, aguardar a confirmação do pagamento via polling, e seguir para a tela de sucesso quando o backend confirmar `status="approved"`.

Hoje o totem já tem um fluxo de checkout simplificado; a tela de pagamento atual apenas chama `POST /orders` e navega direto para sucesso. A partir desta história, o fluxo diverge por método de pagamento:

| Método | Fluxo |
|---|---|
| Crédito / Débito | `POST /orders` → backend envia ao terminal físico MP Point → totem aguarda polling → sucesso/erro |
| PIX | `POST /orders` com `payment_method=pix` → backend retorna QR code → totem exibe QR + countdown → polling → sucesso/erro |

### Tela PIX (mockup)

```
┌──────────────────────────────────────────────────────────────┐
│              Pague com PIX                                    │
│                                                              │
│   ┌──────────────────────────────────────────────┐           │
│   │                                              │           │
│   │             [QR Code 280×280]                │           │
│   │                                              │           │
│   └──────────────────────────────────────────────┘           │
│                                                              │
│         Aponte a câmera do seu celular para o QR             │
│                                                              │
│   ┌─────────────────────────────────────────────┐            │
│   │  00020126580014BR.GOV.BCB.PIX...            │            │
│   │                              [Copiar Código] │            │
│   └─────────────────────────────────────────────┘            │
│                                                              │
│   Total: R$ 26,00                                            │
│   Aguardando pagamento...  ⏳ 09:42                           │
│                                                              │
│   [Cancelar pagamento]                                       │
└──────────────────────────────────────────────────────────────┘
```

### Fluxo de telas (totem)

```
SelectionScreen (crédito/débito/pix)
  ↓ seleciona PIX
CheckoutScreen (resumo do pedido)
  ↓ "Pagar com PIX"
PIXPaymentScreen (QR + countdown + polling)
  ↓ payment status=approved
PaymentSuccessScreen  (existente)
  ↓ timeout ou cancelamento  
CatalogScreen  (reinicia)
```

### Timeout e cancelamento

- PIX expira em 10 minutos (timeout configurado no MPProvider)
- Countdown visível na tela (MM:SS)
- Polling: a cada 5s o totem consulta `GET /payments/{transaction_id}/status`
- Após aprovação: navega para PaymentSuccessScreen
- Após timeout (600s) ou cliente toca "Cancelar": chama `DELETE /payments/{transaction_id}` e volta ao catálogo

### Integração com CheckoutScreen

A `CheckoutScreen` existente precisará de uma nova seção para seleção do método de pagamento antes de confirmar:

```
[Pagar com Cartão]   [Pagar com PIX]
```

O botão "Pagar com Cartão" segue o fluxo atual (terminal Point). O botão "Pagar com PIX" inicia o fluxo novo (QRCode na tela).

---

## QA Explorer

### Cenário 1 — PIX criado e QR exibido
```gherkin
Dado que o cliente está na CheckoutScreen com itens no carrinho
Quando toca "Pagar com PIX"
Então o totem chama POST /orders com payment_method="pix"
E o backend retorna qr_code e qr_code_base64
E a PIXPaymentScreen exibe o QR code (imagem base64)
E exibe a string EMV para copiar/colar
E inicia o countdown de 10 minutos
E inicia polling a cada 5s em GET /payments/{id}/status
```

### Cenário 2 — PIX pago com sucesso
```gherkin
Dado que a PIXPaymentScreen está exibindo o QR
Quando o polling retorna status="approved"
Então a tela navega para PaymentSuccessScreen
E exibe mensagem "Pagamento confirmado!"
```

### Cenário 3 — PIX expirado (timeout)
```gherkin
Dado que a PIXPaymentScreen está exibindo o QR
Quando o countdown chega a 00:00 sem pagamento
Então o totem exibe mensagem "Tempo esgotado"
E chama DELETE /payments/{id} para cancelar
E volta para a CatalogScreen após 3s
```

### Cenário 4 — Cancelamento pelo cliente
```gherkin
Dado que a PIXPaymentScreen está exibindo o QR
Quando o cliente toca "Cancelar pagamento"
Então o totem exibe modal de confirmação "Deseja cancelar?"
E se confirmado: chama DELETE /payments/{id}
E volta para a CatalogScreen
```

### Cenário 5 — Copiar código PIX
```gherkin
Dado que a PIXPaymentScreen está exibindo o QR
Quando o cliente toca "Copiar Código"
Então o código EMV é copiado para o clipboard
E o botão exibe "Copiado!" por 2 segundos
```

### Cenário 6 — Erro ao criar PIX
```gherkin
Dado que o backend retorna erro ao criar PIX (ex: credencial inválida)
Quando a CheckoutScreen tenta criar o pagamento
Então exibe mensagem de erro inline
E o cliente permanece na CheckoutScreen para tentar novamente
```

---

## Tech Explorer

### Arquivo novo
`frontend/totem/src/screens/PIXPaymentScreen.tsx`

### Props
```tsx
interface Props {
  T: Theme;
  transactionId: number;
  qrCodeBase64: string;
  qrCodeString: string;
  amount: number;
  onSuccess: () => void;
  onCancel: () => void;
}
```

### Estrutura do componente
```tsx
export default function PIXPaymentScreen({ T, transactionId, qrCodeBase64, qrCodeString, amount, onSuccess, onCancel }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(600); // 10 min
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<"pending" | "approved" | "expired" | "error">("pending");

  // Countdown
  useEffect(() => {
    const t = setInterval(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) handleTimeout();
  }, [secondsLeft]);

  // Polling a cada 5s
  useEffect(() => {
    const t = setInterval(async () => {
      const r = await api.get(`/payments/${transactionId}/status`);
      if (r.data.status === "approved") { setStatus("approved"); onSuccess(); }
      if (r.data.status === "expired" || r.data.status === "cancelled") handleTimeout();
    }, 5000);
    return () => clearInterval(t);
  }, [transactionId]);

  const handleTimeout = async () => {
    await api.delete(`/payments/${transactionId}`).catch(() => null);
    onCancel();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(qrCodeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  // ... render
}
```

### Endpoint novo no payment-service
```
GET /payments/{id}/status
→ {status: "pending" | "approved" | "expired" | "cancelled", transaction_id: int}
```

Este endpoint consulta o banco local (não faz nova chamada ao MP — o polling com o MP é feito pelo MPProvider no momento da criação; o status final fica gravado na transação). **Alternativa:** o MPProvider continua o polling em background e atualiza o status no banco via WebSocket ou callback. Para MVP: o payment-service guarda o status da transação e este endpoint apenas lê do banco.

### POST /orders — extensão do response
O endpoint de criação de pedido (order-service) que internamente chama o payment-service precisará propagar `qr_code` e `qr_code_base64` na resposta ao totem:

```json
{
  "order_id": 42,
  "status": "pending",
  "payment": {
    "transaction_id": 99,
    "status": "processing",
    "qr_code": "00020126...",
    "qr_code_base64": "iVBORw..."
  }
}
```

O totem extrai `payment.qr_code` e `payment.qr_code_base64` e navega para `PIXPaymentScreen`.

### CheckoutScreen — mudanças
Adicionar seleção de método antes de confirmar:
```tsx
// Novo estado
const [payMethod, setPayMethod] = useState<"card" | "pix">("card");

// Dois botões de pagamento
<button onClick={() => handlePay("card")}>Pagar com Cartão</button>
<button onClick={() => handlePay("pix")}>Pagar com PIX</button>

// handlePay inclui payment_method no body do POST /orders
```

### Rota no App.tsx do totem
Não necessário (navegação por estado, não por rotas URL — totem já usa state machine).

### Dependência de implementação
- ORD-045 (admin config MP) — credenciais necessárias para o MPProvider funcionar
- ORD-046 (backend MPProvider) — `POST /orders` com PIX precisa retornar qr_code
- Esta história (ORD-047) só pode ser testada end-to-end após as anteriores
