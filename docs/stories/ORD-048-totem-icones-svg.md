# ORD-048 — Totem: substituir emojis por ícones SVG

**Status:** Ready
**Pontos:** 2
**Sprint:** —

---

## História

Como cliente no totem, quero ver ícones claros e consistentes nas telas, para ter uma experiência visual profissional independente do dispositivo ou sistema operacional.

## Contexto e motivação

As telas do totem utilizam emojis como elementos visuais principais (💰 💳 🏦 ⚡ 🧾 ✅ 🖨️ 👆). Em monitores touchscreen de quiosque, emojis são renderizados pelo sistema operacional — a aparência varia entre Windows, Linux e Android, e em tamanhos grandes (40-64px) ficam pixelados ou distorcidos. Avaliação comparativa com totem de referência profissional (São Bento/CPlug) confirmou que ícones SVG de linha (line art) transmitem mais credibilidade, são escaláveis em qualquer resolução e têm aparência consistente em todos os ambientes. A mudança é puramente visual — não altera fluxo, temas de cor, backend ou lógica de negócio.

## Fluxo principal

1. Cliente chega ao totem e vê a `WelcomeScreen` — ícone de toque/dedo SVG com animação pulse no lugar do emoji 👆
2. Insere CPF na `CpfScreen` — ícone de documento/recibo SVG no lugar do emoji 🧾
3. Seleciona método de pagamento na `PaymentScreen` — ícone SVG de cartão para crédito e débito, logo PIX para PIX, no lugar de 💳 🏦 ⚡; título da tela com ícone de pagamento no lugar de 💰
4. Aguarda confirmação na `SuccessScreen` — ícone de check-circle SVG no lugar de ✅; ícone de impressora SVG no lugar de 🖨️

## Fluxos alternativos / exceções

- Se a biblioteca Lucide React não estiver no projeto, deve ser adicionada como dependência; é leve (~1kb por ícone com tree-shaking)
- Ícone do PIX: o logo oficial do PIX (BACEN) deve ser usado como SVG inline — não há ícone equivalente no Lucide; verificar se já existe em `frontend/totem/src/assets/`

## Dependências

- Serviços envolvidos: nenhum (mudança exclusivamente frontend)
- Histórias bloqueantes: nenhuma
- Biblioteca: `lucide-react` (adicionar ao `package.json` de `frontend/totem/`)

## Critérios de aceite funcionais

- [ ] `WelcomeScreen`: emoji 👆 substituído por ícone SVG de toque (ex: `Hand` ou `TouchpadIcon` do Lucide), mantendo a animação pulse
- [ ] `CpfScreen`: emoji 🧾 substituído por ícone SVG de documento/recibo (ex: `FileText` do Lucide)
- [ ] `PaymentScreen`: emoji 💰 no título substituído por ícone SVG de pagamento (ex: `CreditCard`); emojis dos métodos substituídos — crédito: `CreditCard`, débito: `Landmark`, PIX: logo SVG oficial
- [ ] `SuccessScreen`: emoji ✅ substituído por `CheckCircle` SVG; emoji 🖨️ substituído por `Printer` SVG
- [ ] Todos os ícones SVG respeitam a cor do tema ativo (`T.text`, `T.roxo`, `T.btn`) via prop `color` ou `stroke`
- [ ] Nenhum emoji permanece visível em nenhuma das 4 telas afetadas
- [ ] Aparência visual consistente nos 3 temas de cor (dark, light, brand)

## Wireframe / Mockup

Referência visual: `/docs/exemples/totem1/` — telas do totem São Bento/CPlug com ícones line art nos métodos de pagamento, impressão e toque. Padrão visual: stroke fino (~1.5-2px), sem fill, cor herdada do tema.

---

## Tech Explorer

### Serviços impactados
- `frontend/totem` (React): substituição de emojis por ícones SVG em 4 telas. Nenhum serviço backend afetado.

### Decisão técnica: biblioteca de ícones

`lucide-react` **não está** no `package.json` atual — precisa ser adicionada. É a escolha correta: tree-shaking por ícone (~1 KB cada), stroke-based (herda cor via `color` prop), React 18 nativo, sem dependências extras.

```bash
npm install lucide-react
# frontend/totem/package.json
```

### Mapeamento emoji → ícone Lucide

| Tela | Emoji atual | Ícone Lucide | Prop sugerida |
|------|-------------|--------------|---------------|
| `WelcomeScreen` | 👆 | `Hand` | `size={88} color={T.roxo}` |
| `CpfScreen` | 🧾 | `FileText` | `size={44} color={T.roxo}` |
| `PaymentScreen` (título) | 💰 | `Wallet` | `size={44} color={T.roxo}` |
| `PaymentScreen` (Crédito) | 💳 | `CreditCard` | `size={40} color={currentColor}` |
| `PaymentScreen` (Débito) | 🏦 | `Landmark` | `size={40} color={currentColor}` |
| `PaymentScreen` (PIX) | ⚡ | SVG inline oficial | ver abaixo |
| `SuccessScreen` (check) | ✅ | `CheckCircle2` | `size={64} color={T.successColor}` |
| `SuccessScreen` (impressora) | 🖨️ | `Printer` | `size={28} color={T.muted}` |

### Logo PIX oficial

O Lucide não tem ícone do PIX. Usar o SVG oficial do BACEN como componente inline:

```tsx
// frontend/totem/src/assets/PixLogo.tsx
export function PixLogo({ size = 40, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill={color}>
      {/* path oficial BACEN — domínio público */}
      <path d="M112.57 391.19..." />
    </svg>
  );
}
```

Obter o path do SVG oficial em: https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdeMarcadoPix.pdf (manual de marca) ou via CDN do gov.

### Arquivos a modificar

```
frontend/totem/
├── package.json                          ← adicionar lucide-react
├── src/
│   ├── assets/
│   │   └── PixLogo.tsx                  ← criar (SVG inline PIX oficial)
│   └── screens/
│       ├── WelcomeScreen.tsx            ← trocar 👆 por <Hand>
│       ├── CpfScreen.tsx                ← trocar 🧾 por <FileText>
│       ├── PaymentScreen.tsx            ← trocar 💰 <Wallet>, métodos SVGs
│       └── SuccessScreen.tsx            ← trocar ✅ <CheckCircle2>, 🖨️ <Printer>
```

### Padrão de uso dos ícones

```tsx
// Cor do tema via prop — nunca cor hardcoded
import { CreditCard } from "lucide-react";
<CreditCard size={40} color={method === m.id ? T.btnText : T.roxo} />

// WelcomeScreen mantém animação pulse no container externo — o ícone substitui só o emoji
<Hand size={88} color={T.roxo} strokeWidth={1.5} />
```

### Estimativa
- Frontend: **2 pontos** (mecânico mas envolve 4 telas + 1 asset novo)
- Backend: 0 pontos

### Riscos
- **Logo PIX**: o SVG oficial tem restrições de uso de marca — verificar se o contexto de produto nacional de pagamento permite uso direto. Alternativa: ícone genérico de QR code (`QrCode` do Lucide) enquanto aguarda aprovação.
- **`npm install` no ambiente de deploy**: se o build do totem for feito via Docker sem cache de node_modules, o tempo de build pode aumentar marginalmente (lucide-react ~800 KB antes de tree-shaking, ~1-2 KB após).

---

## QA Explorer

```gherkin
Feature: Ícones SVG no totem
  Como cliente no totem
  Quero ver ícones claros e consistentes nas telas
  Para ter uma experiência visual profissional em qualquer dispositivo

  Background:
    Dado que o totem está rodando com um dos 3 temas de cor disponíveis

  Scenario: WelcomeScreen exibe ícone SVG de toque no lugar do emoji
    Dado que o totem está na tela de boas-vindas (WelcomeScreen)
    Então nenhum emoji é visível na tela
    E um ícone SVG de toque/dedo está presente com animação pulse
    E o ícone herda a cor do tema ativo

  Scenario: CpfScreen exibe ícone SVG de documento no lugar do emoji
    Dado que o cliente está na tela de CPF (CpfScreen)
    Então nenhum emoji é visível na tela
    E um ícone SVG de documento/recibo está presente no topo da tela
    E o ícone herda a cor do tema ativo

  Scenario: PaymentScreen exibe ícones SVG para todos os métodos de pagamento
    Dado que o cliente está na tela de pagamento (PaymentScreen)
    Então nenhum emoji é visível na tela
    E o método "Crédito" exibe ícone SVG de cartão de crédito
    E o método "Débito" exibe ícone SVG de banco/cartão de débito
    E o método "PIX" exibe o logo oficial SVG do PIX
    E o título da tela exibe ícone SVG de pagamento no lugar de 💰

  Scenario: SuccessScreen exibe ícones SVG de confirmação e impressora
    Dado que o pagamento foi aprovado e o totem está na SuccessScreen
    Então nenhum emoji é visível na tela
    E um ícone SVG de check-circle está presente no topo
    E o estado de impressão exibe ícone SVG de impressora

  Scenario: Ícones respeitam o tema dark
    Dado que o tema ativo é "dark"
    Quando o cliente navega por WelcomeScreen, CpfScreen, PaymentScreen e SuccessScreen
    Então todos os ícones SVG são visíveis com contraste adequado sobre o fundo escuro
    E nenhum ícone aparece invisível ou com cor incorreta

  Scenario: Ícones respeitam o tema light
    Dado que o tema ativo é "light"
    Quando o cliente navega por WelcomeScreen, CpfScreen, PaymentScreen e SuccessScreen
    Então todos os ícones SVG são visíveis com contraste adequado sobre o fundo claro
    E nenhum ícone aparece invisível ou com cor incorreta

  Scenario: Ícones respeitam o tema brand
    Dado que o tema ativo é "brand"
    Quando o cliente navega por WelcomeScreen, CpfScreen, PaymentScreen e SuccessScreen
    Então todos os ícones SVG são visíveis com contraste adequado
    E nenhum ícone aparece invisível ou com cor incorreta

  Scenario: Logo PIX é o oficial do BACEN
    Dado que o cliente está na tela de pagamento (PaymentScreen)
    Quando visualiza o método PIX
    Então o ícone exibido é o logo oficial do PIX (BACEN)
    E não é um ícone genérico de raio/relâmpago ⚡

  Scenario: Nenhum emoji residual em nenhuma tela afetada
    Dado que o cliente percorre o fluxo completo: Welcome → CPF → Pagamento → Sucesso
    Então nenhum dos seguintes emojis é renderizado em nenhuma das telas: 👆 🧾 💰 💳 🏦 ⚡ ✅ 🖨️
```
