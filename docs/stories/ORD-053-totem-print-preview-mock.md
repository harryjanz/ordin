# ORD-053 — Preview de impressão no modo mock do totem

## Status
`Done`

## Descrição
Durante o desenvolvimento, quando o payment-service está em modo mock (`provider: "mock"` na resposta da API), o desenvolvedor não tem como visualizar o layout do ticket térmico sem uma impressora física ou QZ Tray instalado. A impressão silenciosa (ORD-052) cai no fallback `window.open()`, mas em ambiente Docker o popup pode ser bloqueado. Precisamos que, ao receber `provider: "mock"` na resposta de pagamento aprovado, o HTML de impressão seja aberto automaticamente em uma nova aba para validação visual do layout — exatamente o que seria enviado à impressora. Em produção (provider diferente de `"mock"`), esse preview não deve ocorrer.

## Persona
**Desenvolvedor / QA** — precisa validar o layout do ticket térmico (formatação, QR Code, guilhotina, campos) sem depender de hardware físico durante o desenvolvimento local.

## Contexto
Com a integração ESC/POS da ORD-052, o layout do ticket é gerado como stream binário opaco. O HTML de fallback (`buildPrintHtml`) é a representação visual legível do ticket. Expô-lo automaticamente em modo mock fecha o ciclo de feedback sem exigir infraestrutura adicional.

---

## História
Como **desenvolvedor trabalhando com o payment-service em modo mock**, quero que o preview de impressão do ticket seja exibido automaticamente após o pagamento aprovado, para validar o layout sem precisar de impressora física ou QZ Tray.

## Fluxo principal
1. Cliente conclui pagamento no totem (modo mock)
2. API retorna `status: "approved"` com `provider: "mock"`
3. Frontend recebe a resposta e navega para `SuccessScreen`
4. `SuccessScreen` detecta `provider === "mock"` no objeto `CompletedOrder`
5. Após 300ms, abre automaticamente o HTML de impressão em nova aba (sem tentar QZ Tray)
6. UI exibe "Preview de impressão aberto (modo mock)"

## Fluxos alternativos
- **`window.open()` bloqueado em mock**: exibe botão "Ver preview do ticket" para abertura manual
- **Provider diferente de `"mock"`**: `silentPrint()` segue fluxo normal (QZ Tray → fallback)

## Dependências
- ORD-052 (já implementada) — `silentPrint()` e `buildPrintHtml()` em `printService.ts`
- Campo `provider` na resposta `POST /payments` — já retornado pelo backend
- Sem dependência de backend (leitura do campo existente)

## Critérios de aceite funcionais
- [ ] Com `provider === "mock"`: HTML de impressão abre em nova aba automaticamente, sem tentativa de QZ Tray
- [ ] Com `provider !== "mock"`: comportamento da ORD-052 inalterado (QZ Tray → fallback)
- [ ] `CompletedOrder` inclui campo `provider: string`
- [ ] UI exibe mensagem diferenciada indicando modo mock
- [ ] `tsc --noEmit` sem erros

---

## Explorer

### Contexto e motivação
O campo `provider` já está presente na resposta do `POST /payments` (`"mock"`, `"paygo"`, `"mercadopago"`). Basta propagar esse campo até o `CompletedOrder` no frontend e usá-lo para bifurcar o comportamento de impressão. Zero mudança de backend.

### Wireframe
Sem alteração visual além da mensagem no card de status:
- Mock: "Preview aberto — modo mock" (com ícone Printer + badge "DEV")
- Produção: comportamento atual da ORD-052

---

## QA Explorer

```gherkin
Feature: Preview de impressão em modo mock
  Como desenvolvedor
  Quero ver o preview do ticket automaticamente em modo mock
  Para validar o layout sem hardware físico

  Background:
    Dado que o pagamento foi processado com sucesso

  Scenario: Preview automático com provider mock
    Dado que a resposta da API contém "provider": "mock"
    Quando a SuccessScreen é exibida
    Então o HTML de impressão é aberto em nova aba automaticamente
    E a UI exibe "Preview aberto — modo mock"
    E o QZ Tray NÃO é tentado

  Scenario: Comportamento normal com provider real
    Dado que a resposta da API contém "provider": "paygo" ou "mercadopago"
    Quando a SuccessScreen é exibida
    Então silentPrint() segue o fluxo normal (QZ Tray → window.print())
    E nenhuma aba extra de preview é aberta

  Scenario: window.open() bloqueado em modo mock
    Dado que a resposta contém "provider": "mock"
    E o navegador bloqueia window.open()
    Quando a SuccessScreen é exibida
    Então a UI exibe o botão "Ver preview do ticket"
    E ao clicar, abre o HTML em nova aba

  Scenario: HTML de preview contém todos os dados do pedido
    Dado que o pedido tem 2 tickets
    Quando o preview é aberto em modo mock
    Então o HTML contém o nome da empresa, order_ref, valor, método
    E cada ticket tem: nome do produto, unidade X/Y, código, QR Code SVG
```

---

## Tech Explorer

### Serviços impactados
- `frontend/totem/` — apenas

### Arquivos alterados
| Arquivo | Mudança |
|---------|---------|
| `src/types.ts` | Adicionar campo `provider: string` em `CompletedOrder` |
| `src/screens/PaymentScreen.tsx` | Propagar `provider` da resposta da API para `onSuccess(order)` |
| `src/screens/SuccessScreen.tsx` | Se `order.provider === "mock"`, abrir preview HTML direto (sem QZ Tray); mensagem diferenciada |

### Decisão técnica
Não usar `import.meta.env.DEV` para detectar mock — o campo `provider` da API é mais preciso: permite testar com provider real em dev sem ver o preview, e garante que ambientes de staging com mock ativado também mostrem o preview.

### Estimativa
- Frontend: 1h

### Riscos
Nenhum significativo — é uma bifurcação de lógica de impressão isolada ao `SuccessScreen`, sem impacto em outros fluxos.
