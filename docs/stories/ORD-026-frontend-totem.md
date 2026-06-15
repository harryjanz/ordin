---
id: ORD-026
status: Done
fase: 1
sprint: 4
responsavel: Frontend
estimativa: 5 pontos
---

# ORD-026 — Frontend totem-v3 completo conectado à API real

## Explorer

**Como** usuário final no quiosque de autoatendimento,  
**quero** navegar pelo cardápio, montar meu pedido e pagar de forma autônoma,  
**para** que eu não precise esperar atendimento humano.

### Contexto e motivação
O totem é a interface mais crítica do piloto — é o ponto de entrada de toda a receita. Sem ele funcional, a stack inteira não tem valor demonstrável. O arquivo `frontend/totem-v3.tsx` é atualmente um stub (23 linhas, `export default function App() { return null }`). Existe `frontend/totem.tsx` (559 linhas) como referência de UI/UX com mock via `window.storage` compartilhado — deve servir de base visual, não de arquitetura.

### Persona
- **Usuário final**: qualquer pessoa que usa o quiosque físico. Não tem conta, não sabe de JWT. Interage via tela touch 1080×1920 (portrait).
- **Técnico de implantação**: configura o terminal_id no dispositivo na primeira instalação.

### Fluxo

1. **Setup do dispositivo** (uma vez): se não há `terminal_id` em `localStorage`, exibe tela de configuração. Técnico informa o terminal_id (obtido no admin panel). Armazena no `localStorage`.
2. **Tela de PIN** — teclado numérico 4 dígitos → `POST /auth/validate-pin` (identifica empresa, sem token)
3. **Login automático** — `POST /auth/pin-login` com PIN + terminal_id armazenado → JWT kiosk 4h
4. **Catálogo** — carrega categorias e produtos da empresa autenticada
5. **Carrinho** — drawer lateral, adicionar/remover itens, total em tempo real
6. **CPF na nota** — campo opcional antes de prosseguir
7. **Pagamento** — seleciona método (crédito/débito/PIX) → `POST /payments`
8. **Tela de sucesso** — exibe `GET /orders/{ref}/tickets` com QR codes
9. **Reset** — após sucesso ou timeout de inatividade, volta ao PIN

### Dependências
- ORD-020 (seed de empresas, terminais e catálogo) — **feito**
- ORD-022 (refresh token) — não se aplica; totem usa JWT 4h sem refresh
- ORD-023 (CRUD catálogo) — **feito**; endpoints `/catalog/categories` e `/catalog/products` disponíveis
- ORD-025 (abstração PayGo/Mock) — **feito**; frontend só chama `POST /payments`, flag é transparente

---

## QA Explorer

```gherkin
Feature: Totem — fluxo completo de autoatendimento

  Background:
    Given o totem está configurado com terminal_id=1 em localStorage
    And o backend está rodando com seed Burger House (PIN 1234)

  Scenario: Happy path — pedido e pagamento aprovados
    Given o totem exibe a tela de PIN
    When o usuário digita "1234"
    Then o sistema valida o PIN via POST /auth/validate-pin
    And o sistema faz login via POST /auth/pin-login com terminal_id=1
    And o totem exibe o catálogo da Burger House
    When o usuário adiciona "X-Burguer" ao carrinho
    And o usuário confirma o pedido sem CPF
    And o usuário seleciona pagamento por crédito
    Then o sistema envia POST /payments com method="credit"
    And o sistema exibe a tela de sucesso com o QR code do ticket

  Scenario: PIN incorreto — feedback imediato
    Given o totem exibe a tela de PIN
    When o usuário digita "0000"
    And o sistema retorna 401 de POST /auth/validate-pin
    Then o totem exibe "PIN inválido" e limpa os dígitos

  Scenario: Rate limiting — 5 tentativas erradas
    Given o usuário errou o PIN 4 vezes consecutivas
    When o usuário digita o PIN errado pela 5ª vez
    Then o sistema retorna 429
    And o totem exibe mensagem "Muitas tentativas. Aguarde 15 minutos."
    And os controles de PIN ficam desabilitados por 15 minutos

  Scenario: Timeout de inatividade
    Given o totem está na tela de catálogo
    When não há interação por 120 segundos
    Then o totem exibe modal de contagem regressiva (10s)
    And se o usuário não interagir, retorna à tela de PIN e limpa o carrinho

  Scenario: Pagamento recusado — retry
    Given o totem está na tela de pagamento
    And o backend retorna status "refused" para POST /payments
    Then o totem exibe "Pagamento recusado. Tente outro método."
    And o usuário pode selecionar outro método de pagamento
    And o sistema envia novo POST /payments

  Scenario: CPF na nota
    Given o carrinho tem itens
    When o usuário informa CPF "123.456.789-09"
    Then o CPF é enviado no body de POST /orders e POST /payments

  Scenario: Setup do dispositivo — primeiro acesso
    Given localStorage não contém terminal_id
    When o totem é aberto
    Then exibe tela "Configuração do Dispositivo" com campo para terminal_id
    And após salvar, exibe a tela de PIN normalmente

  Scenario: Produto sem imagem
    Given um produto no catálogo não tem image_url
    When o catálogo é exibido
    Then o produto exibe um placeholder visual (ícone genérico)
    And o fluxo de compra continua normalmente
```

---

## Tech Explorer

### Decisão de estrutura

Cada frontend vira um projeto Vite independente dentro de `frontend/`:

```
frontend/
  totem/
    index.html
    vite.config.ts
    tsconfig.json
    package.json
    src/
      main.tsx          # monta <App /> no #root
      App.tsx           # máquina de estados: PIN | CATALOG | CART | PAYMENT | SUCCESS
      api.ts            # axios instance + interceptors
      store.ts          # Zustand: auth, cart, session
      screens/
        PinScreen.tsx
        CatalogScreen.tsx
        CartDrawer.tsx
        CpfScreen.tsx
        PaymentScreen.tsx
        SuccessScreen.tsx
        DeviceSetupScreen.tsx
      types.ts
```

Deps: `vite`, `react`, `react-dom`, `typescript`, `axios`, `zustand`  
Sem biblioteca de UI — CSS-in-JS inline como no `totem.tsx` v1.

### Contratos de API

| Ação | Método | Endpoint | Auth |
|---|---|---|---|
| Validar PIN | POST | `/auth/validate-pin` | nenhuma |
| Login kiosk | POST | `/auth/pin-login` | nenhuma |
| Listar categorias | GET | `/catalog/categories` | Bearer JWT kiosk |
| Listar produtos | GET | `/catalog/products?category_id=X` | Bearer JWT kiosk |
| Criar pedido | POST | `/orders` | Bearer JWT kiosk |
| Listar tickets | GET | `/orders/{ref}/tickets` | Bearer JWT kiosk |
| Pagar | POST | `/payments` | Bearer JWT kiosk |

### Payloads chave

**POST /auth/validate-pin**
```json
{ "pin": "1234" }
→ { "ok": true, "company": { "id": 1, "name": "Burger House", "plan": "basic" } }
```

**POST /auth/pin-login**
```json
{ "pin": "1234", "terminal_id": 1 }
→ { "ok": true, "access_token": "...", "token_type": "bearer", "company": {...}, "terminal": {...} }
```

**POST /orders**
```json
{
  "items": [{ "product_id": 1, "name": "X-Burguer", "qty": 2, "unit_price": 25.90 }],
  "discount": 0,
  "cpf": null
}
→ { "order_ref": "ORD-XXXX", "total": 51.80, "status": "pending" }
```

**POST /payments**
```json
{
  "order_ref": "ORD-XXXX",
  "method": "credit",
  "amount": 51.80,
  "items": [{ "product_id": 1, "name": "X-Burguer", "qty": 2, "unit_price": 25.90 }],
  "cpf": null
}
→ { "ok": true, "transaction_id": 42, "status": "approved", "nsu": "...", "authorization": "..." }
```

### Decisão: seleção de terminal

`GET /companies/{id}/terminals` exige JWT. O totem não tem JWT antes do login. **Decisão**: terminal_id é pré-configurado no dispositivo e armazenado em `localStorage["ordin_terminal_id"]`. A tela de "Configuração do Dispositivo" (campo de input manual) aparece apenas na primeira vez ou quando o localStorage é limpo. O técnico de implantação obtém o terminal_id no admin panel.

**Impacto**: nenhum endpoint novo necessário para este fluxo.

### Zustand store

```ts
// auth slice
{ company: CompanyInfo | null, terminal: TerminalInfo | null, token: string | null }

// cart slice
{ items: CartItem[], total: number, cpf: string | null, orderRef: string | null }

// session slice
{ lastActivity: number, inactivityTimeoutSec: number }
```

### Gestão do JWT kiosk

- Kiosk token: 4h, **sem refresh**. Ao expirar, volta para tela de PIN automaticamente (interceptor axios retorna 401 → reset do store).
- Token salvo apenas em memória (Zustand), não em `localStorage` — a cada PIN o usuário re-autentica.

### Riscos técnicos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| CORS bloqueando o Vite dev server | Média | Adicionar `http://localhost:5173` em `CORS_ORIGINS` no `.env` |
| PayGo mock retornando lento (polling 90s) | Baixa | Totem exibe spinner com countdown; timeout de 120s no frontend |
| `localStorage` limpo no navegador do quiosque | Baixa | Tela de setup reaparece graciosamente |

### Estimativa
5 pontos — implementação da SPA completa (~700 linhas), Vite config, testes manuais com seed.
