# ORD-051 — Totem: número do pedido em destaque na tela de sucesso

**Status:** Done
**Pontos:** 1
**Sprint:** —

---

## História

Como cliente no totem, quero ver o número do meu pedido em destaque na tela de confirmação, para comunicá-lo facilmente ao operador do balcão ao retirar meu pedido.

## Contexto e motivação

A `SuccessScreen` atual exibe o `order_ref` (ex: `ORD-20240626-001`) em `fontSize: 13` junto ao método de pagamento e NSU — informação enterrada no texto secundário. Em um ambiente físico de food service, o cliente precisa falar ou mostrar o número ao operador. A referência São Bento/CPlug exibe "Número da compra: **147**" em fonte de ~80px, visível à distância e fácil de verbalizar. O `order_ref` atual do Ordin é longo demais para leitura em voz alta — a história deve resolver também o formato exibido (ref completo vs. número sequencial curto).

## Fluxo principal

1. Pagamento é aprovado
2. `SuccessScreen` é exibida
3. Acima de tudo: ícone de sucesso (check) + "Pedido confirmado!"
4. Imediatamente abaixo: label "Número do pedido" + número em fonte ~72-80px, bold, cor de destaque
5. Abaixo do número: informações secundárias (método, valor, NSU) em tamanho normal
6. Mais abaixo: status da impressão de tickets
7. Countdown de 30s e botão "Novo pedido" ao final

## Fluxos alternativos / exceções

- **Formato do número:** o `order_ref` atual (`ORD-20240626-001`) é longo. Duas opções a avaliar na Tech Explorer: (a) extrair apenas os últimos 3 dígitos numéricos para exibição em destaque; (b) adicionar campo `order_number` sequencial no backend (order-service). Preferência por (a) para evitar mudança de backend nesta sprint.
- **Tickets com QR:** a área de tickets/QR abaixo do número não deve ser suprimida — o número em destaque é adicional, não substitui o fluxo de impressão existente.

## Dependências

- Serviços envolvidos: possivelmente `order-service` se optar por `order_number` sequencial (opção b) — a ser decidido na Tech Explorer
- Histórias bloqueantes: nenhuma
- Telas afetadas: `SuccessScreen.tsx`

## Critérios de aceite funcionais

- [ ] `SuccessScreen` exibe um identificador numérico do pedido em fonte ≥ 72px, bold, com label "Número do pedido" acima
- [ ] O número é visível e legível a ~1 metro de distância da tela
- [ ] As informações secundárias (método, valor, NSU) permanecem visíveis mas em tamanho menor, abaixo do número em destaque
- [ ] O fluxo de impressão de tickets e o countdown de 30s não são afetados
- [ ] Funciona nos 3 temas de cor (número usa `T.text` ou `T.roxo` conforme contraste)
- [ ] A decisão de formato (sufixo do order_ref vs. order_number do backend) está documentada na Tech Explorer

## Wireframe / Mockup

Referência visual: `/docs/exemples/totem1/WhatsApp Image 2026-06-26 at 08.37.01 (2).jpeg` — "Compra realizada" + número **147** em fonte gigante centralizado + texto de redirecionamento discreto abaixo.

---

## Tech Explorer

### Serviços impactados
- `frontend/totem` (React): modificação de `SuccessScreen.tsx`. Nenhum serviço backend afetado.

### Decisão de formato: sem mudança de backend

O `order_ref` atual tem formato `ORD-YYYYMMDD-NNN` (ex: `ORD-20240626-007`). Exibir o ref completo em 72px seria ilegível — são 18 caracteres. Duas opções avaliadas:

| Opção | Prós | Contras | Decisão |
|-------|------|---------|---------|
| **A) Extrair sufixo numérico** (`"007"` → `7`) | Zero mudança de backend | Depende do formato do ref; colisão se > 999 pedidos/dia | ✅ **Escolhida para MVP** |
| B) Campo `order_number` sequencial no order-service | Número sempre curto e único | Migration + endpoint + mudança de contrato | Backlog — pós-MVP |

**Implementação da opção A:**

```tsx
// SuccessScreen.tsx
function extractOrderNumber(ref: string): string {
  const suffix = ref.split("-").at(-1) ?? ref;
  return String(parseInt(suffix, 10)); // remove zeros à esquerda: "007" → "7"
}

// Uso:
const orderNumber = extractOrderNumber(order.order_ref);
```

### Estrutura da SuccessScreen reformulada

```tsx
// Hierarquia visual nova (de cima para baixo):
// 1. Ícone check SVG (64px)
// 2. "Pagamento aprovado!" (28px bold)
// 3. ─── separador ───
// 4. Label "Número do pedido" (16px muted)
// 5. Número em destaque (80px bold, T.text ou T.roxo)
// 6. ─── separador ───
// 7. Valor + método + NSU (13px muted) — como hoje
// 8. Card de status de impressão — como hoje
// 9. Botão "Novo pedido" — como hoje
// 10. Countdown "Novo pedido em Xs…" — como hoje

<div style={{ fontSize: 80, fontWeight: 900, fontFamily: FONT_D, color: T.text, lineHeight: 1 }}>
  {orderNumber}
</div>
<p style={{ color: T.muted, fontFamily: FONT_B, fontSize: 14, marginTop: 4 }}>
  Número do pedido
</p>
```

### Arquivos a modificar

```
frontend/totem/src/screens/
└── SuccessScreen.tsx   ← adicionar extractOrderNumber(), reorganizar hierarquia visual
```

### Estimativa
- Frontend: **1 ponto** (mudança cirúrgica de layout + função de extração)
- Backend: 0 pontos

### Riscos
- **Formato do `order_ref`**: a extração `ref.split("-").at(-1)` depende do formato atual. Se o order-service mudar o formato (ex: UUID), a extração quebra silenciosamente — exibiria um hash. Mitigação: adicionar fallback `|| ref` para exibir o ref completo caso o parse falhe, e documentar o formato esperado com um comentário no código.
- **Colisão de números no dia**: com > 999 pedidos/dia o sufixo volta a ter mais dígitos. Para food service de médio porte isso é raro — aceitável para MVP. A opção B (backend) resolve definitivamente quando necessário.

---

## QA Explorer

```gherkin
Feature: Número do pedido em destaque na SuccessScreen
  Como cliente no totem
  Quero ver o número do meu pedido em destaque na tela de confirmação
  Para comunicá-lo facilmente ao operador do balcão

  Background:
    Dado que um pagamento foi aprovado e o totem exibe a SuccessScreen

  Scenario: Número do pedido é exibido em fonte grande e centralizado
    Dado que a SuccessScreen está visível
    Então um identificador do pedido é exibido em fonte de pelo menos 72px
    E o identificador está centralizado na tela
    E o label "Número do pedido" está visível acima do número

  Scenario: Número do pedido aparece acima das informações secundárias
    Dado que a SuccessScreen está visível
    Então o número do pedido em destaque aparece antes de: método de pagamento, valor e NSU
    E as informações secundárias permanecem visíveis abaixo do número, em tamanho menor

  Scenario: Número é curto o suficiente para ser lido em voz alta
    Dado que a SuccessScreen está visível
    Então o identificador exibido em destaque tem no máximo 4 caracteres numéricos
    E não exibe o prefixo longo "ORD-AAAAMMDD-" em tamanho grande

  Scenario: Fluxo de impressão de tickets não é afetado
    Dado que a SuccessScreen está visível com pedido contendo tickets
    Então a área de status de impressão ainda é exibida abaixo do número em destaque
    E o comportamento de abertura da janela de impressão permanece inalterado

  Scenario: Countdown de 30s e botão "Novo pedido" permanecem funcionais
    Dado que a SuccessScreen está visível
    Então o countdown de 30s para novo pedido está presente e decrementa normalmente
    E o botão "Novo pedido" está disponível e funcional

  Scenario: Número é legível no tema dark
    Dado que o tema ativo é "dark"
    Quando a SuccessScreen é exibida após pagamento aprovado
    Então o número do pedido em destaque tem contraste adequado sobre o fundo escuro

  Scenario: Número é legível no tema light
    Dado que o tema ativo é "light"
    Quando a SuccessScreen é exibida após pagamento aprovado
    Então o número do pedido em destaque tem contraste adequado sobre o fundo claro

  Scenario: Número é legível no tema brand
    Dado que o tema ativo é "brand"
    Quando a SuccessScreen é exibida após pagamento aprovado
    Então o número do pedido em destaque tem contraste adequado sobre o fundo do tema

  Scenario: Tela de sucesso PIX também exibe número em destaque
    Dado que um pagamento via PIX foi aprovado
    Quando a SuccessScreen é exibida
    Então o número do pedido em destaque também é exibido (comportamento igual ao cartão)
```
