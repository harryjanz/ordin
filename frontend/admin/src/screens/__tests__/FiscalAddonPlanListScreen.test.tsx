import { describe, expect, it } from "vitest";
import { matchesFiscalAddonPlanSearch } from "../FiscalAddonPlanListScreen";
import type { FiscalAddonPlan } from "../../types";

function makePlan(overrides: Partial<FiscalAddonPlan> = {}): FiscalAddonPlan {
  return {
    id: 1,
    name: "Plano Básico",
    monthly_price: 50,
    price_per_document: 0.1,
    created_at: "2026-01-01T00:00:00",
    linked_companies_count: 0,
    editable: true,
    ...overrides,
  };
}

describe("matchesFiscalAddonPlanSearch", () => {
  it("busca vazia sempre casa", () => {
    expect(matchesFiscalAddonPlanSearch(makePlan(), "")).toBe(true);
  });

  it("casa por substring, ignorando maiúsculas/minúsculas", () => {
    const plan = makePlan({ name: "Plano Avançado" });
    expect(matchesFiscalAddonPlanSearch(plan, "avançado")).toBe(true);
    expect(matchesFiscalAddonPlanSearch(plan, "AVANÇADO")).toBe(true);
  });

  it("não casa quando o nome não contém o texto buscado", () => {
    expect(matchesFiscalAddonPlanSearch(makePlan({ name: "Plano Básico" }), "premium")).toBe(false);
  });
});
