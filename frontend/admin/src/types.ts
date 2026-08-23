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
  // ORD-108 — quando true, o totem pergunta "Comer no local"/"Para levar".
  consumption_mode_enabled?: boolean;
  // ORD-116 — "horizontal" (padrão) ou "vertical" pro menu de categorias do totem.
  catalog_menu_layout?: string;
}

// ORD-115 — vídeo de modo espera (attract mode) do totem.
export interface TotemVideo {
  id: number;
  name: string;
  active: boolean;
  video_url: string;
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
  terminal_code?: string | null;
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
  pending_setup: boolean;
  mfa_enabled: boolean;
  has_trusted_device: boolean;
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

// ORD-101/ORD-102 — GET /payments/analytics
export interface PeriodMetrics {
  revenue: number;
  ticket_medio: number;
  volume: number;
}

export type AnalyticsGranularity = "hour" | "day" | "week" | "month";

// label já formatado pelo backend conforme a granularidade pedida
// ("00h".."23h" | "DD/MM" | "MM/AAAA") — ver ORD-102.
export interface RevenuePoint {
  label: string;
  revenue: number;
  // Mesma posição/granularidade, janela do período anterior — alinhado por
  // índice, não por data. Ver ORD-103.
  previous_revenue: number;
}

export interface TerminalBreakdown {
  terminal_id: number;
  revenue: number;
  ticket_medio: number;
  volume: number;
}

export interface MethodBreakdown {
  method: string;
  revenue: number;
  ticket_medio: number;
  volume: number;
}

export interface PaymentAnalytics {
  current: PeriodMetrics;
  previous: PeriodMetrics;
  // null quando o período anterior tem denominador 0 — não dá pra calcular
  // variação percentual "a partir de zero".
  change_pct: { revenue: number | null; ticket_medio: number | null; volume: number | null };
  granularity: AnalyticsGranularity;
  series: RevenuePoint[];
  by_terminal: TerminalBreakdown[];
  by_method: MethodBreakdown[];
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

// ORD-092: dispositivo confiável — não expõe token nem hash, só o
// suficiente pro usuário reconhecer e decidir revogar.
export interface TrustedDevice {
  id: number;
  device_label: string | null;
  created_at: string | null;
  last_used_at: string | null;
  expires_at: string;
}
