// ORD-139 — a tela simplifica a configuração de um grupo de opção em dois
// radios (obrigatório/opcional × única/múltipla); o backend só entende
// min_selections/max_selections (ORD-138). Mapeamento documentado no Tech
// Explorer de ORD-139.
export type Requiredness = "required" | "optional";
export type SelectionType = "single" | "multiple";

export interface OptionGroupRadios {
  requiredness: Requiredness;
  selectionType: SelectionType;
}

// "Múltipla" tem um campo dedicado de "máximo de opções selecionáveis" (ex.:
// pizza com até 3 sabores — correção pós-implementação, 2026-09-01, pedido
// explícito do usuário). `maxSelections` é obrigatório quando
// selectionType==="multiple"; ignorado em "single" (sempre 1). Faixa fixa
// 1–20 (NumberSpinInput na tela) — desacoplada do total de opções
// cadastradas, pra não travar o campo com erro se o usuário definir o
// máximo antes de terminar de adicionar as opções.
export const MAX_SELECTIONS_MIN = 1;
export const MAX_SELECTIONS_MAX = 20;

export function radiosToMinMax(radios: OptionGroupRadios, optionCount: number, maxSelections?: number | null): { min_selections: number; max_selections: number } {
  const min_selections = radios.requiredness === "required" ? 1 : 0;
  if (radios.selectionType === "single") return { min_selections, max_selections: 1 };
  const max_selections = Math.min(Math.max(maxSelections ?? optionCount, MAX_SELECTIONS_MIN), MAX_SELECTIONS_MAX);
  return { min_selections, max_selections };
}

// Combinações fora do que os radios representam (ex.: min=2/max=30, criado
// via API/Swagger, fora da faixa 1–20 do campo) não têm volta segura —
// undefined sinaliza "modo avançado somente leitura" pra tela.
export function minMaxToRadios(min_selections: number, max_selections: number): OptionGroupRadios | undefined {
  const requiredness: Requiredness = min_selections === 0 ? "optional" : "required";
  if (min_selections !== 0 && min_selections !== 1) return undefined;
  if (max_selections === 1) return { requiredness, selectionType: "single" };
  if (max_selections >= MAX_SELECTIONS_MIN && max_selections <= MAX_SELECTIONS_MAX) return { requiredness, selectionType: "multiple" };
  return undefined;
}
