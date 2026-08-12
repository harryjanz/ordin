// superadmin/admin são usuários da própria Ordin (gestão da plataforma, não
// de uma empresa cliente) — hoje praticamente equivalentes em capacidades
// (mesmas rotas em ROLE_ROUTES/MENU, mesmo _require_platform_admin no
// company-service). A distinção entre os dois fica reservada pra quando uma
// função específica precisar ser restrita só a um deles. Ver docs/ARQUITETURA.md §1.2.
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

export interface Allergen {
  id: number;
  code: string;
  name: string;
  category: string | null;
}

export interface Product {
  id: number;
  company_id: number;
  category_id: number;
  name: string;
  description: string | null;
  description_long: string | null;
  price: number;
  image_url: string | null;
  thumbnail_url: string | null;
  active: boolean;
  tags: string[] | null;
  calories: number | null;
  sku: string | null;
  sort_order: number | null;
  allergens: Allergen[];
}

export interface Order {
  order_ref: string;
  status: string;
  total: number;
  company_id: number;
  terminal_id: number;
  cpf: string | null;
  created_at: string;
  tickets_total: number;
  tickets_collected: number;
}

export interface OrderStatusSummaryItem {
  count: number;
  total: number;
}

// Sempre com os 4 status reais (pending/paid/completed/cancelled)
// presentes, mesmo zerados — ver ORD-081, mesmo padrão do PaymentStatusSummary.
export type OrderStatusSummary = Record<string, OrderStatusSummaryItem>;

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
  // Campos do painel de detalhe expansível — ver ORD-080.
  company_id: number;
  terminal_id: number;
  environment: string | null;
  provider_transaction_id: string | null;
  tef_number: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  refused_reason: string | null;
}

export interface StatusSummaryItem {
  count: number;
  amount: number;
}

// Sempre com os 5 status do TransactionStatus (backend) presentes, mesmo
// zerados — ver ORD-078.
export type PaymentStatusSummary = Record<string, StatusSummaryItem>;

// Sempre com os 3 status de contrato (pendente/enviado/assinado) presentes,
// mesmo zerados — mesmo padrão do PaymentStatusSummary/OrderStatusSummary,
// mas só contagem (sem valor monetário) — ver ORD-084.
export type CompanyStatusSummary = Record<string, number>;
