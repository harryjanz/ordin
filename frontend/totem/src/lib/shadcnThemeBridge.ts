import type { Theme } from "../themes";

// EXPERIMENTO totem-shadcn-react-aria — traduz o Theme já resolvido
// (themes.ts, por empresa/modo) pras CSS custom properties que o shadcn/
// Tailwind consomem (globals.css). Fonte de verdade única: ThemeTokens.
// Componentes ainda não convertidos continuam lendo T.* via inline style
// normalmente — os dois sistemas ficam sincronizados porque partem do
// mesmo objeto, nunca de uma cópia separada.
const SHADCN_VARS: Record<string, keyof Theme> = {
  "--background": "bg",
  "--foreground": "text",
  "--card": "surface",
  "--card-foreground": "text",
  "--popover": "surface",
  "--popover-foreground": "text",
  "--primary": "btn",
  "--primary-foreground": "btnText",
  "--secondary": "numBg",
  "--secondary-foreground": "text",
  "--muted": "numBg",
  "--muted-foreground": "muted",
  "--accent": "catActive",
  "--accent-foreground": "catText",
  "--destructive": "errorText",
  "--border": "borderNeutral",
  "--input": "borderNeutral",
  "--ring": "roxo",
  // Extensões próprias do totem, sem equivalente direto no vocabulário
  // semântico do shadcn (header ≠ card, preço tem cor própria por marca,
  // "brand" é o roxo/vermelho de destaque usado fora de botão/CTA).
  "--header": "header",
  "--price": "priceColor",
  "--brand": "roxo",
  "--success": "successColor",
};

export function applyShadcnThemeBridge(T: Theme): void {
  const root = document.documentElement.style;
  for (const [cssVar, themeKey] of Object.entries(SHADCN_VARS)) {
    root.setProperty(cssVar, T[themeKey]);
  }
}
