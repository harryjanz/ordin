import { describe, expect, it } from "vitest";
import { matchesCommissionTableSearch } from "../CommissionTableListScreen";
import type { CommissionTable } from "../../types";

function makeTable(overrides: Partial<CommissionTable> = {}): CommissionTable {
  return {
    id: 1,
    name: "Tabela Padrão",
    is_default: true,
    setup_fee_per_totem: 150,
    recurring_percent: 3.5,
    note: null,
    vigente_desde: "2026-01-01T00:00:00",
    archived_at: null,
    created_at: "2026-01-01T00:00:00",
    ...overrides,
  };
}

describe("matchesCommissionTableSearch", () => {
  it("busca vazia sempre casa", () => {
    expect(matchesCommissionTableSearch(makeTable(), "")).toBe(true);
  });

  it("casa por substring, ignorando maiúsculas/minúsculas", () => {
    const table = makeTable({ name: "Acordo Fulano" });
    expect(matchesCommissionTableSearch(table, "fulano")).toBe(true);
    expect(matchesCommissionTableSearch(table, "FULANO")).toBe(true);
  });

  it("não casa quando o nome não contém o texto buscado", () => {
    expect(matchesCommissionTableSearch(makeTable({ name: "Tabela Padrão" }), "inexistente")).toBe(false);
  });
});
