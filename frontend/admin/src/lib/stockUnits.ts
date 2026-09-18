import type { DropdownOptions } from "design-system";

// ORD-181 — mesmo conjunto fechado do backend (STOCK_UNITS), com rótulo
// amigável pro usuário em vez do código técnico (feedback do usuário: "un"/
// "kg" ficavam pouco claros no Dropdown). O value enviado pra API continua
// sendo o código curto ("kg", não "Quilo") — só a exibição muda. Compartilhado
// entre ProductEditScreen e OptionGroupFormScreen pra não divergir entre as
// duas telas de estoque.
export const STOCK_UNIT_OPTIONS: DropdownOptions[] = [
  { value: "un", label: "Unidade" },
  { value: "kg", label: "Quilo" },
  { value: "g", label: "Grama" },
  { value: "L", label: "Litro" },
  { value: "ml", label: "Mililitro" },
];

export function stockUnitLabel(code: string | null | undefined): string {
  return STOCK_UNIT_OPTIONS.find((o) => o.value === code)?.label ?? code ?? "";
}
