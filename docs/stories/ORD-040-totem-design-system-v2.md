# ORD-040 — Aplicar Design System v2 ao totem

**Status:** New
**Tipo:** UX / Design System / Frontend
**Referência:** `docs/design-system-totem-v2.html` + `docs/guia-layout-totem-autoatendimento.md`

---

## Contexto

O `design-system-totem-v2.html` foi adicionado ao repositório como documento autoritativo de identidade visual do totem. Define tokens, tipografia, estados de botão, cards de produto e comparações com BK/McDonald's. A implementação atual do totem (após ORD-039) usa o design system v1 implícito e diverge do v2 em 11 pontos.

---

## Problema

A implementação atual do totem diverge do DS v2 nos seguintes pontos:

### Tipografia
1. **Fonte errada** — app usa `-apple-system, BlinkMacSystemFont, "Segoe UI"`. DS v2 define `Lexend` (display: headings, botões, preços) + `Inter` (corpo: descrições). Google Fonts a importar via `index.html`.

### Tema e cores
2. **Dark como padrão** — DS v2 define Light como padrão de produção, com Dark como alternativo. `App.tsx` está hardcoded com `useState<ThemeKey>("dark")`.
3. **Header do light theme errado** — `themes.ts` define `header: "#1d1434"` em ambos os temas. No light o header deve ser `#ffffff` (branco), conforme o DS.
4. **Token de preço não adaptativo** — DS v2 introduz `--price-color`: `#1a9999` no light, `#33cccc` no dark. Atualmente o token `teal` é fixo no dark e `#1a9999` no light, mas não está mapeado semanticamente como "preço".
5. **Borda neutra ausente** — DS v2 tem dois tokens de borda: `--border` (com identidade da marca, roxa) e `--border-m` (neutra, `rgba(0,0,0,0.08)`). Cards de produto devem usar `border-m`, não a borda roxa.
6. **Sombra de card ausente** — DS v2 define `--card-sh`: `0 2px 12px rgba(153,0,255,0.10)` light / `0 2px 16px rgba(153,0,255,0.20)` dark. Atualmente cards não têm sombra no light.
7. **Token de sucesso ausente** — DS v2 define `--color-success: #198737`. Telas de pagamento aprovado precisam desse verde, mas o tema atual não tem o token.

### Componentes
8. **CTAs com border-radius errado** — DS v2 define `border-radius: var(--r-pill)` (999px) para todos os botões primários. Atual: 12–18px (rectangulares arredondados).
9. **Botão "+" do card não é circular** — DS v2: `border-radius: 50%`, dimensão `52×52px`. Atual: retangular arredondado `minHeight: 56px`.
10. **Placeholder de imagem do card sem gradiente** — DS v2 mostra `linear-gradient(135deg, #3a0080, #9900ff)` (roxo) ou `linear-gradient(135deg, #0d3333, #33cccc)` (teal) para produtos sem foto. Atual: fundo `numBg` sólido com emoji centralizado.
11. **Stepper de quantidade sem estilo pill** — DS v2 mostra stepper como pill com botões +/− roxos e valor centralizado. Atual: box com botões simples.

---

## Solução proposta

### 1. Fontes (index.html)
Adicionar import do Google Fonts com `Lexend` (400, 500, 600, 700, 800) e `Inter` (400, 500, 600, 700). Atualizar `body { font-family: 'Inter', sans-serif }`.

### 2. themes.ts — tokens novos e corrigidos

```typescript
// Novos tokens em ambos os temas:
priceColor: string   // "#1a9999" light / "#33cccc" dark
cardShadow: string   // "0 2px 12px rgba(153,0,255,0.10)" light / "0 2px 16px ..." dark
borderNeutral: string // "rgba(0,0,0,0.08)" light / "rgba(255,255,255,0.07)" dark
successColor: string  // "#198737" (igual em ambos)
fontDisplay: string   // "'Lexend', sans-serif"
fontBody: string      // "'Inter', sans-serif"

// Correção light:
header: "#ffffff"    // era "#1d1434" — bug
```

### 3. App.tsx
`useState<ThemeKey>("light")` — light como padrão.

### 4. CatalogScreen.tsx

**Header:** fundo `T.header` (branco no light), logo com Lexend, botão "Início" com estilo `btn-g` do DS (ghost).

**Categoria chips:** pill shape (border-radius 999px), Lexend 700, padding `10px 20px`.

**Card de produto:**
- Borda: `T.borderNeutral` (não mais a borda roxa)
- Sombra: `T.cardShadow`
- Imagem placeholder: gradiente `linear-gradient(135deg, #3a0080, #9900ff)` alternando com teal dependendo do índice do produto
- Nome: Lexend 700 20px
- Descrição: Inter 400 14px
- Preço: Lexend 800 22px com `T.priceColor`
- Botão "+": circular, `width: 52, height: 52, borderRadius: "50%"`, background roxo, Lexend

**Stepper (qty > 0):** pill container, botões roxos com `color: T.roxo`, Lexend.

**CTA carrinho:** pill (border-radius 999px), minHeight 90px, Lexend 800.

### 5. WelcomeScreen.tsx
- H1 "Toque para começar": Lexend 800 42px
- Sub "Faça seu pedido em minutos": Inter 400 16px
- Background: light usa gradiente suave sobre `#DFE8ED`

### 6. CpfScreen.tsx, PaymentScreen.tsx, SuccessScreen.tsx, SetupScreen.tsx
- Botões primários: pill (border-radius 999px), Lexend 700–800
- Títulos de tela: Lexend
- Corpo/labels: Inter
- PaymentScreen: botões de método com sombra `T.cardShadow`
- SuccessScreen: título "Pagamento aprovado!" com `T.successColor` (verde)

### 7. App.tsx — modal de inatividade
Botão "Continuar": pill, Lexend.

---

## Critérios de aceite

- [ ] Fontes Lexend e Inter carregam no totem (verificar DevTools → Network)
- [ ] Tema Light é o padrão ao carregar (background `#DFE8ED`, surface `#ffffff`, header `#ffffff`)
- [ ] Header do catálogo é branco no light (não roxo escuro)
- [ ] Preço do produto usa `priceColor`: `#1a9999` no light, `#33cccc` no dark
- [ ] Cards de produto têm borda neutra sutil e sombra suave roxo no light
- [ ] Placeholder de imagem tem gradiente roxo ou teal (não fundo sólido)
- [ ] CTAs primários têm shape pill (bordas completamente arredondadas)
- [ ] Botão "+" do card é circular
- [ ] Stepper +/− tem estilo pill com texto roxo
- [ ] Título "Toque para começar" em Lexend 42px na WelcomeScreen
- [ ] Pagamento aprovado exibe sucesso em verde (`#198737`)
- [ ] Toggle dark/light funciona corretamente (todas as cores alternam)

---

## Fora do escopo

- Temas BK e McDonald's mencionados no DS são referência comparativa, não são implementados como temas do produto
- Mudanças de backend, banco ou infraestrutura

---

## Arquivos afetados

- `frontend/totem/index.html` — importar Lexend + Inter, font-family global
- `frontend/totem/src/themes.ts` — tokens novos/corrigidos, light como primeiro tema
- `frontend/totem/src/App.tsx` — default "light", expor toggle de tema (opcional para testes)
- `frontend/totem/src/screens/WelcomeScreen.tsx` — Lexend, cores light/dark
- `frontend/totem/src/screens/CatalogScreen.tsx` — borda neutra, sombra, placeholder gradiente, stepper, pill CTAs
- `frontend/totem/src/screens/CpfScreen.tsx` — pill buttons, Lexend
- `frontend/totem/src/screens/PaymentScreen.tsx` — pill buttons, Lexend, card shadow
- `frontend/totem/src/screens/SuccessScreen.tsx` — successColor, Lexend, pill
- `frontend/totem/src/screens/SetupScreen.tsx` — pill buttons, Lexend

---

## Explorer

### Análise de viabilidade técnica

**Google Fonts (Lexend + Inter):** Import via `<link>` em `index.html`. O totem roda em rede local interna — verificar se há acesso à internet no hardware de produção. Se não houver, a alternativa é self-host as fontes no build do Vite. Para MVP e testes, o import online é suficiente.

**themes.ts:** Adicionar tokens ao objeto TypeScript. Todos os componentes que usam `T.border` para cards devem migrar para `T.borderNeutral`. O token `teal` permanece no tema para usos não-preço (ex: highlights), mas `priceColor` passa a ser o token semântico de preço.

**Pill border-radius:** `borderRadius: 999` (ou `"999px"`) em CSS inline. Mudança puramente visual, sem impacto lógico.

**Botão "+" circular:** `borderRadius: "50%"`, `width: 52, height: 52`. O conteúdo "+" centra automaticamente com `display: flex, alignItems: center, justifyContent: center`.

**Placeholder gradiente:** `background: i % 2 === 0 ? "linear-gradient(135deg,#3a0080,#9900ff)" : "linear-gradient(135deg,#0d3333,#33cccc)"` — alterna roxo/teal por índice. No dark: `#1d0040`/`#9900ff` e `#051212`/`#33cccc`. Simples de implementar.

**Stepper pill:** Envolver em `div` com `borderRadius: 999, overflow: "hidden", border: 1px solid T.border`. Botões com `color: T.roxo` e hover `background: T.roxoSubtle`.

**Riscos:** Nenhum técnico. Risco visual: em viewports estreitos de dev o pill pode parecer exagerado — normal em resolução de desenvolvimento, correto em 1080×1920.

---

## QA Explorer

### Cenários de teste

**Tema Light (padrão)**
1. Ao carregar o totem pela primeira vez: background `#DFE8ED`, header branco, cards brancos com sombra sutil
2. Preços dos produtos exibidos em `#1a9999` (teal escuro)
3. Cards com borda `rgba(0,0,0,0.08)` — quase imperceptível, não roxa
4. Placeholder de produtos sem imagem: gradiente roxo/teal (não fundo cinza)

**Tipografia**
5. "Toque para começar" na WelcomeScreen em Lexend (verificar DevTools → Elements → Computed → font-family)
6. Nome dos produtos em Lexend 700
7. Preços em Lexend 800
8. Descrições em Inter 400
9. Botões com texto em Lexend 700

**Componentes**
10. Botões "Adicionar", "Finalizar pedido", "Pagar", "Confirmar CPF": todos com borda completamente arredondada (pill)
11. Botão "+" no card de produto: círculo perfeito 52×52px
12. Stepper +/−: pill container, texto em roxo, valores em Lexend
13. Abas de categoria: pill shape, chip ativo com background roxo

**Toggle de tema**
14. (Se exposto) Alternar para dark: background `#0e0b1a`, preço em `#33cccc`, header `#1d1434`
15. Todas as telas (welcome, catalog, cpf, payment, success) respeitam o tema ativo

**Regressão**
16. Fluxo completo: welcome → catálogo → cart → CPF → pagamento → sucesso funciona normalmente
17. WelcomeScreen: toque inicia o catálogo
18. Botão "Início": volta para welcome

---

## Tech Explorer

### Plano de implementação detalhado

**index.html — adicionar Google Fonts e atualizar body:**
```html
<link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  body { font-family: 'Inter', sans-serif; ... }
</style>
```

**themes.ts — estrutura do tipo Theme atualizada:**
```typescript
export const THEMES = {
  light: {
    bg:            "#DFE8ED",
    surface:       "#ffffff",
    header:        "#ffffff",      // CORRIGIDO (era #1d1434)
    border:        "rgba(153,0,255,0.18)",
    borderNeutral: "rgba(0,0,0,0.08)",   // NOVO
    text:          "#1d1434",
    muted:         "rgba(29,20,52,0.45)",
    roxo:          "#9900ff",
    roxoSubtle:    "rgba(153,0,255,0.12)",  // NOVO
    btn:           "#9900ff",
    btnText:       "#ffffff",
    glow:          "0 4px 20px rgba(153,0,255,0.35)",
    radial:        "radial-gradient(ellipse at 60% 0%,rgba(153,0,255,0.07) 0%,transparent 55%),#DFE8ED",
    priceColor:    "#1a9999",   // NOVO (era teal: "#1a9999")
    cardShadow:    "0 2px 12px rgba(153,0,255,0.10)",  // NOVO
    catActive:     "#9900ff",
    catText:       "#ffffff",
    numBg:         "rgba(153,0,255,0.10)",
    numHover:      "rgba(153,0,255,0.22)",
    successColor:  "#198737",   // NOVO
    errorBg:       "rgba(255,77,109,0.08)",
    errorText:     "#ff4d6d",
  },
  dark: {
    bg:            "#0e0b1a",
    surface:       "#1d1434",
    header:        "#1d1434",
    border:        "rgba(153,0,255,0.22)",
    borderNeutral: "rgba(255,255,255,0.07)",  // NOVO
    text:          "#DFE8ED",
    muted:         "rgba(223,232,237,0.45)",
    roxo:          "#9900ff",
    roxoSubtle:    "rgba(153,0,255,0.12)",   // NOVO
    btn:           "#9900ff",
    btnText:       "#ffffff",
    glow:          "0 4px 20px rgba(153,0,255,0.35)",
    radial:        "radial-gradient(ellipse at 60% 0%,rgba(153,0,255,0.18) 0%,transparent 60%),#0e0b1a",
    priceColor:    "#33cccc",   // NOVO (era teal: "#33cccc")
    cardShadow:    "0 2px 16px rgba(153,0,255,0.20)",  // NOVO
    catActive:     "#9900ff",
    catText:       "#ffffff",
    numBg:         "rgba(153,0,255,0.12)",
    numHover:      "rgba(153,0,255,0.25)",
    successColor:  "#198737",   // NOVO
    errorBg:       "rgba(255,77,109,0.10)",
    errorText:     "#ff4d6d",
  },
} as const;
```

**App.tsx:** `useState<ThemeKey>("light")` — expor toggle para testes via botão no header (pequeno, discreto).

**CatalogScreen — placeholder gradiente:**
```typescript
const cardGradient = (i: number, dark: boolean) =>
  i % 2 === 0
    ? dark ? "linear-gradient(135deg,#1d0040,#9900ff)" : "linear-gradient(135deg,#3a0080,#9900ff)"
    : dark ? "linear-gradient(135deg,#051212,#33cccc)" : "linear-gradient(135deg,#0d3333,#33cccc)";
```
Como o tema vem de `T`, precisamos saber se é dark. Alternativa: adicionar token `placeholderGradientA` e `placeholderGradientB` ao tema — mais limpo.

**Botão "+" circular:**
```typescript
style={{ width: 52, height: 52, borderRadius: "50%", background: T.btn, color: T.btnText, ... }}
```

**Stepper pill:**
```typescript
// container
style={{ display: "flex", alignItems: "center", background: T.numBg, border: `1px solid ${T.border}`, borderRadius: 999, overflow: "hidden" }}
// botões
style={{ width: 52, height: 52, background: "none", border: "none", color: T.roxo, fontSize: 26, fontWeight: 700, cursor: "pointer" }}
```

**Aplicação global de Lexend nos componentes:**
- Acrescentar `fontFamily: "'Lexend', sans-serif"` em: títulos (h1/h2/h3), preços, labels de botão, nomes de produto, abas de categoria
- Acrescentar `fontFamily: "'Inter', sans-serif"` em: descrições de produto, textos mutados, labels de campo

**Não há mudanças de API, banco ou infraestrutura.**

---

**Status:** Ready
