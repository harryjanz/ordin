import api from "../api";
import type { CepLookupResult, CnpjLookupResult, Company, CompanyStatusSummary, Contact, ContactType, LegalRepresentative, Terminal, User } from "../types";
import { normalizeCnpj } from "../lib/validators";

export async function lookupCnpj(cnpj: string): Promise<CnpjLookupResult> {
  const r = await api.get<CnpjLookupResult>(`/companies/cnpj-lookup/${encodeURIComponent(cnpj)}`);
  return r.data;
}

export async function lookupCep(cep: string): Promise<CepLookupResult> {
  const r = await api.get<CepLookupResult>(`/companies/cep-lookup/${encodeURIComponent(cep)}`);
  return r.data;
}

// Usado pelo painel de detalhe da transação (ORD-080) pra mostrar o nome do
// terminal em vez do ID puro — busca a lista inteira da empresa de uma vez
// (não existe GET de terminal único), cacheada por company_id no chamador.
export async function listTerminals(companyId: number): Promise<Terminal[]> {
  const r = await api.get<{ terminals: Terminal[]; total: number }>(`/companies/${companyId}/terminals`, {
    params: { limit: 200 },
  });
  return r.data.terminals;
}

// Mesmo racional do listTerminals acima — usado pra resolver "coletado por"
// (Order/Ticket.collected_by, um id de usuário) pro nome real na tela de
// Pedidos, em vez do id puro.
export async function listUsers(companyId: number): Promise<User[]> {
  const r = await api.get<{ users: User[]; total: number }>(`/companies/${companyId}/users`, {
    params: { limit: 200, status: "all" },
  });
  return r.data.users;
}

export type ContractStatusFilter = "pendente" | "enviado" | "assinado" | "";

export interface CompanyListFilters {
  q?: string;
  document?: string;
  contractStatus?: ContractStatusFilter;
  dateFrom?: string;
  dateTo?: string;
  skip?: number;
  limit?: number;
}

// Função pura — monta os query params a partir do estado de filtro da tela
// de listagem (ORD-062). Separada do fetch pra ser testável sem montar o
// componente inteiro.
export function buildCompanyListQuery(filters: CompanyListFilters): Record<string, string | number> {
  const params: Record<string, string | number> = {
    skip: filters.skip ?? 0,
    limit: filters.limit ?? 50,
  };
  if (filters.q?.trim()) params.q = filters.q.trim();
  // O backend filtra por PREFIXO de document (ORD-061) — filtra
  // progressivamente a partir do 3º dígito digitado, sem exigir CNPJ
  // completo. Abaixo de 3 dígitos o filtro fica largo demais (bate
  // praticamente tudo) e não compensa o round-trip.
  if (filters.document?.trim()) {
    const normalized = normalizeCnpj(filters.document);
    if (normalized.length >= 3) params.document = normalized;
  }
  if (filters.contractStatus) params.contract_status = filters.contractStatus;
  if (filters.dateFrom) params.date_from = filters.dateFrom;
  if (filters.dateTo) params.date_to = filters.dateTo;
  return params;
}

export async function listCompanies(
  filters: CompanyListFilters
): Promise<{ companies: Company[]; total: number; summary: CompanyStatusSummary }> {
  const r = await api.get<{ companies: Company[]; total: number; summary: CompanyStatusSummary }>("/companies", {
    params: buildCompanyListQuery(filters),
  });
  return r.data;
}

export interface CreateCompanyPayload {
  name: string;
  document?: string;
  legal_name?: string;
  state_registration?: string;
  municipal_registration?: string;
  tax_regime?: string;
  company_size?: string;
  cnae_code?: string;
  zip_code?: string;
  street?: string;
  address_number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  plan?: string;
  payment_provider?: string;
}

export async function createCompany(payload: CreateCompanyPayload): Promise<{ company: Company; pin: string }> {
  const r = await api.post("/companies", payload);
  return r.data;
}

export async function getCompany(id: number): Promise<Company> {
  const r = await api.get<Company>(`/companies/${id}`);
  return r.data;
}

// document não faz parte deste payload — é imutável após a criação (ORD-061,
// ver CompanyUpdate no company-service). Trocar o CNPJ é recadastro, não edição.
export interface UpdateCompanyPayload {
  name?: string;
  legal_name?: string;
  state_registration?: string;
  municipal_registration?: string;
  tax_regime?: string;
  company_size?: string;
  cnae_code?: string;
  zip_code?: string;
  street?: string;
  address_number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

export async function updateCompany(id: number, payload: UpdateCompanyPayload): Promise<Company> {
  const r = await api.put<Company>(`/companies/${id}`, payload);
  return r.data;
}

export interface CreateContactPayload {
  contact_type: ContactType;
  name: string;
  role_title?: string;
  email: string;
  phone?: string;
}

export async function createContact(companyId: number, payload: CreateContactPayload): Promise<Contact> {
  const r = await api.post<Contact>(`/companies/${companyId}/contacts`, payload);
  return r.data;
}

export async function listContacts(companyId: number): Promise<Contact[]> {
  const r = await api.get<{ contacts: Contact[] }>(`/companies/${companyId}/contacts`);
  return r.data.contacts;
}

export interface LegalRepresentativePayload {
  name: string;
  cpf: string;
  role_title?: string;
  email: string;
  phone?: string;
}

export async function upsertLegalRepresentative(
  companyId: number,
  payload: LegalRepresentativePayload
): Promise<LegalRepresentative> {
  const r = await api.post<LegalRepresentative>(`/companies/${companyId}/legal-representative`, payload);
  return r.data;
}

export async function getLegalRepresentative(companyId: number): Promise<LegalRepresentative | null> {
  try {
    const r = await api.get<LegalRepresentative>(`/companies/${companyId}/legal-representative`);
    return r.data;
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) return null;
    throw err;
  }
}

export async function updateContractStatus(
  companyId: number,
  status: "enviado" | "assinado",
  signedDocument?: File
): Promise<Company> {
  const form = new FormData();
  form.append("status", status);
  if (signedDocument) form.append("signed_document", signedDocument);
  const r = await api.patch<Company>(`/companies/${companyId}/contract-status`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return r.data;
}

export async function getContractDocumentUrl(companyId: number): Promise<string> {
  const r = await api.get<{ url: string }>(`/companies/${companyId}/contract-document-url`);
  return r.data.url;
}
