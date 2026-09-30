import { describe, expect, it } from "vitest";
import { matchesPriceTableSearch } from "../PriceTableListScreen";
import type { PriceTableSummary } from "../../types";

function makeTable(overrides: Partial<PriceTableSummary> = {}): PriceTableSummary {
  return {
    id: 1,
    name: "Tabela Padrão",
    status: "active",
    kind: null,
    created_at: "2026-01-01T00:00:00",
    activated_at: "2026-01-01T00:00:00",
    editable: false,
    linked_companies_count: 0,
    ...overrides,
  };
}

describe("matchesPriceTableSearch", () => {
  it("busca vazia sempre casa", () => {
    expect(matchesPriceTableSearch(makeTable({ name: "Qualquer coisa" }), "")).toBe(true);
  });

  it("casa por substring, ignorando maiúsculas/minúsculas", () => {
    const table = makeTable({ name: "Acordo Especial" });
    expect(matchesPriceTableSearch(table, "acordo")).toBe(true);
    expect(matchesPriceTableSearch(table, "ACORDO")).toBe(true);
    expect(matchesPriceTableSearch(table, "especial")).toBe(true);
  });

  it("não casa quando o nome não contém o texto buscado", () => {
    expect(matchesPriceTableSearch(makeTable({ name: "Tabela Padrão" }), "inexistente")).toBe(false);
  });
});
