export type Role = "superadmin" | "admin" | "owner" | "manager" | "cashier";

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: number | null;
  companyId: number | null;
  role: Role | null;
}

export interface Company {
  id: number;
  name: string;
  slug: string;
  plan: string;
  active: boolean;
  created_at?: string | null;
  document?: string | null;
  legal_name?: string | null;
  state_registration?: string | null;
  municipal_registration?: string | null;
  tax_regime?: string | null;
  company_size?: string | null;
  cnae_code?: string | null;
  cadastral_status?: string | null;
  zip_code?: string | null;
  street?: string | null;
  address_number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  contract_status?: string;
  contract_sent_at?: string | null;
  contract_signed_at?: string | null;
  contract_document_url?: string | null;
}

export type ContactType = "comercial" | "financeiro" | "tecnico";

export interface Contact {
  id: number;
  company_id: number;
  contact_type: ContactType;
  name: string;
  role_title?: string | null;
  email: string;
  phone?: string | null;
  created_at: string;
}

export interface LegalRepresentative {
  id: number;
  company_id: number;
  name: string;
  cpf: string;
  role_title?: string | null;
  email: string;
  phone?: string | null;
  created_at: string;
}

export interface CnpjLookupResult {
  found: boolean;
  reason?: string | null;
  cadastral_status: string;
  legal_name?: string | null;
  trade_name?: string | null;
  zip_code?: string | null;
  street?: string | null;
  address_number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
}

export interface CepLookupResult {
  found: boolean;
  reason?: string | null;
  street?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
}

export interface Terminal {
  id: number;
  company_id: number;
  label: string;
  environment?: string;
  mp_device_id?: string | null;
  active: boolean;
}

export interface PaymentConfig {
  id: number;
  provider: string;
  environment: string;
  api_key: string;
  api_secret: string;
  extra_config?: Record<string, string> | null;
  active: boolean;
  created_at: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

export interface Category {
  id: number;
  company_id: number;
  name: string;
  active: boolean;
  sort_order: number;
}

export interface Product {
  id: number;
  company_id: number;
  category_id: number;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  active: boolean;
  sort_order: number;
}

export interface Order {
  order_ref: string;
  status: string;
  total: number;
  terminal_id: number;
  created_at: string;
  tickets_total: number;
  tickets_collected: number;
}

export interface Ticket {
  ticket_code: string;
  status: string;
  unit_number: number;
  total_units: number;
  collected_at: string | null;
  collected_by: string | null;
}

export interface Transaction {
  id: number;
  order_ref: string;
  method: string;
  amount: number;
  status: string;
  provider: string;
  nsu: string | null;
  authorization: string | null;
  created_at: string;
}
