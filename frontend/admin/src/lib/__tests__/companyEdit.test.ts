import { describe, expect, it } from "vitest";
import { companyToEditForm, diffFields, type CompanyEditForm } from "../companyEdit";
import type { Company } from "../../types";

const baseCompany: Company = {
  id: 1, name: "Sabor Caseiro", slug: "sabor-caseiro", plan: "free", active: true,
  legal_name: "Sabor Caseiro Ltda", state_registration: "ISENTO", tax_regime: "simples_nacional",
  company_size: "ME", cnae_code: "5611-2/01", zip_code: "01310100", street: "Av. Paulista",
  address_number: "1000", complement: null, neighborhood: "Bela Vista", city: "São Paulo", state: "SP",
};

describe("diffFields", () => {
  it("não detecta nenhuma alteração quando o draft é idêntico ao original", () => {
    const form = companyToEditForm(baseCompany);
    expect(diffFields(form, { ...form })).toEqual({});
  });

  it("detecta um único campo alterado", () => {
    const form = companyToEditForm(baseCompany);
    const draft: CompanyEditForm = { ...form, city: "Campinas" };
    expect(diffFields(form, draft)).toEqual({ city: "Campinas" });
  });

  it("detecta múltiplos campos alterados", () => {
    const form = companyToEditForm(baseCompany);
    const draft: CompanyEditForm = { ...form, city: "Campinas", company_size: "EPP" };
    expect(diffFields(form, draft)).toEqual({ city: "Campinas", company_size: "EPP" });
  });

  it("reverter um campo manualmente pro valor original tira ele do diff", () => {
    const form = companyToEditForm(baseCompany);
    const draftAlterado: CompanyEditForm = { ...form, city: "Campinas" };
    const draftRevertido: CompanyEditForm = { ...draftAlterado, city: form.city };
    expect(diffFields(form, draftRevertido)).toEqual({});
  });
});

describe("companyToEditForm", () => {
  it("usa string vazia para campos nulos, não null/undefined", () => {
    const company: Company = { ...baseCompany, legal_name: null, complement: null };
    const form = companyToEditForm(company);
    expect(form.legal_name).toBe("");
    expect(form.complement).toBe("");
  });
});
