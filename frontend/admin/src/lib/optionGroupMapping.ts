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

// "Múltipla" não tem campo de "máximo" dedicado nesta tela — max_selections
// vira o total de opções cadastradas (equivalente a "pode escolher quantas
// quiser dentro da lista"). Gap documentado, não regressão — ver Tech
// Explorer de ORD-139.
export function radiosToMinMax(radios: OptionGroupRadios, optionCount: number): { min_selections: number; max_selections: number } {
  const min_selections = radios.requiredness === "required" ? 1 : 0;
  const max_selections = radios.selectionType === "single" ? 1 : Math.max(optionCount, 1);
  return { min_selections, max_selections };
}

// Combinações fora do que os radios representam (ex.: min=2/max=5, criado
// via API/Swagger) não têm volta segura — undefined sinaliza "modo avançado
// somente leitura" pra tela.
export function minMaxToRadios(min_selections: number, max_selections: number, optionCount: number): OptionGroupRadios | undefined {
  const requiredness: Requiredness = min_selections === 0 ? "optional" : "required";
  if (min_selections !== 0 && min_selections !== 1) return undefined;
  if (max_selections === 1) return { requiredness, selectionType: "single" };
  if (max_selections === Math.max(optionCount, 1)) return { requiredness, selectionType: "multiple" };
  return undefined;
}
