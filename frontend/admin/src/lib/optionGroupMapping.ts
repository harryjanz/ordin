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
// selectionType==="multiple"; ignorado em "single" (sempre 1). Clampado
// entre 2 e o total de opções — não faz sentido pedir pra escolher mais
// opções do que existem no grupo.
export function radiosToMinMax(radios: OptionGroupRadios, optionCount: number, maxSelections?: number | null): { min_selections: number; max_selections: number } {
  const min_selections = radios.requiredness === "required" ? 1 : 0;
  if (radios.selectionType === "single") return { min_selections, max_selections: 1 };
  const upperBound = Math.max(optionCount, 2);
  const max_selections = Math.min(Math.max(maxSelections ?? upperBound, 2), upperBound);
  return { min_selections, max_selections };
}

// Combinações fora do que os radios representam (ex.: min=2/max=5 com só 3
// opções cadastradas, criado via API/Swagger) não têm volta segura —
// undefined sinaliza "modo avançado somente leitura" pra tela.
export function minMaxToRadios(min_selections: number, max_selections: number, optionCount: number): OptionGroupRadios | undefined {
  const requiredness: Requiredness = min_selections === 0 ? "optional" : "required";
  if (min_selections !== 0 && min_selections !== 1) return undefined;
  if (max_selections === 1) return { requiredness, selectionType: "single" };
  if (max_selections >= 2 && max_selections <= Math.max(optionCount, 1)) return { requiredness, selectionType: "multiple" };
  return undefined;
}
