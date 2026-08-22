// Escala de consistência visual do totem (ORD-113) — radius, tipografia e
// espaçamento. Independente do sistema de marca/cor (`themes.ts`): nenhum
// valor aqui muda com a empresa ou o modo claro/escuro, só a paleta muda.
//
// Radius do design-system do admin (4px fixo) foi avaliado e descartado de
// propósito (ver docs/estudo-design-system-totem.md) — 4px é adequado pra
// ferramenta administrativa densa, não pra interface de toque. Os valores
// abaixo consolidam o que já era o padrão de facto no totem (12/999) mais
// um nível pra painéis grandes.
export const RADIUS = {
  sm: 12,   // cards, campos, teclas de numpad — padrão da maioria dos elementos
  lg: 20,   // painéis/modais grandes
  pill: 999, // CTAs primários, badges, botão circular
} as const;

// Ritmo de 4px — inspirado no $spacing do design-system (que usa 8px, sem
// degrau em 12), mas o totem já tinha 12/20/28 como valores de facto
// comuns antes desta história — forçar só os múltiplos de 8 geraria mais
// mudança de tamanho de alvo de toque do que consistência ganha. Regra:
// qualquer múltiplo de 4 é válido, arredondando pro múltiplo mais próximo
// (empate vai pro maior, nunca reduz alvo de toque).
export const SPACE = [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 88, 96] as const;

// Piso comum com os degraus pequenos/médios do design-system (10-12-14-16-
// -20-26); extensão própria acima disso pros títulos de tela cheia do
// totem, vistos a 60cm-1m — o DS para em 60px.
export const FONT = {
  caption: 10,
  label: 12,
  body: 14,
  bodyLg: 16,
  subtitle: 20,
  title: 26,
  headline: 38,
  headlineLg: 52,
  display: 64,
  displayLg: 80,
  hero: 100,
} as const;
