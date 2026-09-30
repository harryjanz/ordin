import { describe, expect, it } from "vitest";
import { matchesPartnerSearch } from "../PartnerListScreen";
import type { Partner } from "../../types";

function makePartner(overrides: Partial<Partner> = {}): Partner {
  return {
    id: 1,
    name: "Fulano de Tal",
    partner_type: "PF",
    document: "12345678909",
    email: "fulano@parceiro.com",
    phone: "11999999999",
    acceptance_reference: "referência de teste",
    commission_table: { id: 1, name: "Tabela Padrão" },
    status: "ativo",
    accepted_term_version: "v1",
    accepted_at: "2026-01-01T00:00:00",
    registered_by_user_id: 1,
    created_at: "2026-01-01T00:00:00",
    deactivated_at: null,
    referred_companies_count: 0,
    ...overrides,
  };
}

describe("matchesPartnerSearch", () => {
  it("busca vazia sempre casa", () => {
    expect(matchesPartnerSearch(makePartner(), "")).toBe(true);
  });

  it("casa por nome, ignorando maiúsculas/minúsculas", () => {
    expect(matchesPartnerSearch(makePartner({ name: "Maria Parceira" }), "maria")).toBe(true);
  });

  // ORD-211 — achado do repasse de QA: o texto digitado vem COM máscara
  // (pontuação), mas o documento salvo em Partner.document está SEM
  // máscara — a normalização precisa acontecer dos dois lados.
  it("casa por CPF digitado com máscara contra documento salvo sem máscara", () => {
    const partner = makePartner({ document: "12345678909" });
    expect(matchesPartnerSearch(partner, "123.456.789-09")).toBe(true);
  });

  it("casa por CNPJ digitado com máscara contra documento salvo sem máscara", () => {
    const partner = makePartner({ partner_type: "PJ", document: "11222333000181" });
    expect(matchesPartnerSearch(partner, "11.222.333/0001-81")).toBe(true);
  });

  it("casa por documento digitado sem máscara também", () => {
    expect(matchesPartnerSearch(makePartner({ document: "12345678909" }), "12345678909")).toBe(true);
  });

  it("não casa quando nem nome nem documento contêm o texto buscado", () => {
    const partner = makePartner({ name: "Fulano de Tal", document: "12345678909" });
    expect(matchesPartnerSearch(partner, "inexistente")).toBe(false);
  });
});
