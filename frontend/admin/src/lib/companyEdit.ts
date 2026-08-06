import type { Company } from "../types";

// Campos cadastrais/endereço editáveis (ORD-063) — document fica de fora
// porque é imutável (ver UpdateCompanyPayload em api/companies.ts).
export interface CompanyEditForm {
  name: string;
  legal_name: string;
  state_registration: string;
  tax_regime: string;
  company_size: string;
  cnae_code: string;
  zip_code: string;
  street: string;
  address_number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}

export function companyToEditForm(c: Company): CompanyEditForm {
  return {
    name: c.name ?? "",
    legal_name: c.legal_name ?? "",
    state_registration: c.state_registration ?? "",
    tax_regime: c.tax_regime ?? "simples_nacional",
    company_size: c.company_size ?? "ME",
    cnae_code: c.cnae_code ?? "",
    zip_code: c.zip_code ?? "",
    street: c.street ?? "",
    address_number: c.address_number ?? "",
    complement: c.complement ?? "",
    neighborhood: c.neighborhood ?? "",
    city: c.city ?? "",
    state: c.state ?? "",
  };
}

// Compara campo a campo contra o formulário original (não contra um
// histórico de "toques") — reverter um campo manualmente pro valor
// original faz ele parar de contar como alterado, por design.
export function diffFields(
  original: CompanyEditForm,
  draft: CompanyEditForm
): Partial<CompanyEditForm> {
  const changed: Partial<CompanyEditForm> = {};
  (Object.keys(draft) as (keyof CompanyEditForm)[]).forEach((key) => {
    if (draft[key] !== original[key]) {
      changed[key] = draft[key];
    }
  });
  return changed;
}
