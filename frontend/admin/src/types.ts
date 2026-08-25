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
  // ORD-117 — empresa de demonstração da plataforma (indicação interna, superadmin only).
  is_demo?: boolean;
  // ORD-118 — "por_item" (padrão) ou "retirada_unica" (QR único de pedido).
  fulfillment_mode?: string;
  // ORD-119 — só usado com fulfillment_mode="retirada_unica".
  prep_urgency_minutes?: number;
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
  sort_order: number | null;
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

// ORD-125 — cardápio por horário: dias da semana (0=segunda..6=domingo,
// mesmo datetime.weekday() do backend) + janela de horário única.
export interface MenuRef {
  id: number;
  name: string;
}

export interface Menu {
  id: number;
  name: string;
  weekdays: number[];
  start_time: string; // "HH:MM"
  end_time: string;
  active: boolean;
  categories: MenuRef[];
  products: MenuRef[];
}

export interface ProductMenuRef {
  id: number;
  name: string;
  via_category: string | null;
}

export interface Order {
  order_ref: string;
  status: string;
  total: number;
  company_id: number;
  terminal_id: number;
  cpf: string | null;
  pickup_name?: string | null;
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

// ORD-119 — primeiro consumidor de WebSocket no admin (FulfillmentScreen),
// mesmo formato de evento já usado no app de balcão.
export interface WsEvent {
  event: string;
  order_ref?: string;
  pickup_name?: string | null;
  total?: number;
  terminal_id?: number;
}

export interface Ticket {
  ticket_code: string;
  // ORD-119 — nome do produto vem embutido no qr_data (mesmo formato usado
  // no app de balcão: "{code}|{product_name}|{order_ref}|{ts}|{hmac}").
  qr_data: string;
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

// ORD-119 (item 3, análise de concorrentes 2026-08-24) — relatório de
// tempo médio de preparo / gargalo, GET /orders/prep-stats.
export interface PrepStatsHourItem {
  hour: number;
  count: number;
  avg_minutes: number;
}

export interface PrepStats {
  count: number;
  avg_prep_minutes: number | null;
  by_hour: PrepStatsHourItem[];
  // Melhorias de UX 2026-08-24 — comparação com a janela anterior de mesma
  // duração (24h antes das 24h atuais), mesmo padrão do Dashboard.
  avg_prep_minutes_prev: number | null;
  change_pct: number | null;
  peak_hour_prev: PrepStatsHourItem | null;
}
