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
  // ORD-158 — timeout de inatividade do totem (era constante fixa, ver ORD-155).
  inactivity_timeout_min?: number;
  inactivity_warn_sec?: number;
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

// ORD-133 — terminal Point retornado por GET /companies/{id}/mp-terminals
// (proxy pro GET /terminals/v1/list do Mercado Pago).
export interface MpTerminal {
  id: string;
  operating_mode?: string | null;
  in_use_by: { terminal_id: number; label: string } | null;
}

export interface PaymentConfig {
  id: number;
  provider: string;
  environment: string;
  api_key: string;
  api_secret: string;
  webhook_secret?: string | null;
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

// ORD-144 — min_selections_override/max_selections_override valem só pra
// este vínculo produto↔grupo (null = sem override, usa min_selections/
// max_selections do próprio grupo, herdados sem mudança de OptionGroup).
// Valor efetivo é sempre override ?? padrão, calculado no cliente.
export interface ProductOptionGroup extends OptionGroup {
  min_selections_override: number | null;
  max_selections_override: number | null;
}

// ORD-160 — cross-sell sem combo. `active` reflete o produto sugerido, não
// a associação em si (a relação nunca é escondida — ver _get_product_related
// no catalog-service): um item aqui com active:false continua na lista,
// só marcado visivelmente como inativo.
export interface RelatedProduct {
  id: number;
  name: string;
  price: number;
  image_url: string | null;
  active: boolean;
}

// ORD-166 — anotação aditiva vinda de GET /catalog/products e /catalog/combos
// quando o item está coberto por uma promoção em vigor agora. final_price já
// vem com o desconto aplicado.
export interface PromotionAnnotation {
  promotion_id: number;
  promotion_name: string;
  discount_percent: number;
  final_price: number;
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
  // ORD-169 — classificação fiscal, sempre opcional.
  ncm: string | null;
  ncm_descricao: string | null;
  cfop: string | null;
  cest: string | null;
  allergens: Allergen[];
  option_groups: ProductOptionGroup[];
  related_products: RelatedProduct[];
  promotion: PromotionAnnotation | null;
}

// ORD-169 — resultado de GET /catalog/ncm/search (master data, sem company_id).
export interface NcmSearchResult {
  codigo: string;
  descricao: string;
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

// ORD-138/139 — grupos de opção reutilizáveis (sabor, tamanho, etc.).
// price_delta é um ACRÉSCIMO sobre o preço-base do produto, não um preço
// absoluto — ver ORD-142 (regra de cálculo: soma dos deltas escolhidos).
export interface OptionGroupOption {
  id: number;
  label: string;
  price_delta: number;
  image_url: string | null;
  thumbnail_url: string | null;
  sort_order: number | null;
  active: boolean;
  // ORD-146 — mesmo nível de detalhe que Product já tem (ORD-075), pra
  // opção que representa uma variante física própria (sabor, bebida).
  description: string | null;
  sku: string | null;
  allergens: Allergen[];
}

export interface OptionGroup {
  id: number;
  name: string;
  min_selections: number;
  max_selections: number;
  active: boolean;
  options: OptionGroupOption[];
}

export interface ProductMenuRef {
  id: number;
  name: string;
  via_category: string | null;
}

// ORD-112 — combo/bundle: conjunto de produtos existentes vendido com preço
// próprio. `items` vem denormalizado (nome/preço do produto no momento da
// consulta) — pensado pra ORD-150 renderizar o combo no totem sem chamada
// extra; o admin reaproveita o mesmo formato.
export interface ComboItem {
  product_id: number;
  name: string;
  price: number;
  // ORD-157 (addendum) — em camada com Combo.upsell_enabled: só dispara
  // sugestão de upsell no totem se os dois estiverem true.
  triggers_upsell: boolean;
}

export interface Combo {
  id: number;
  category_id: number | null;
  name: string;
  description: string | null;
  price: number;
  active: boolean;
  image_url: string | null;
  thumbnail_url: string | null;
  // ORD-157 — separado de `active`: combo continua à venda mesmo com a
  // sugestão de upsell desligada.
  upsell_enabled: boolean;
  items: ComboItem[];
  promotion: PromotionAnnotation | null;
}

// ORD-166 — promoção por período. Status é sempre computado pelo backend
// (nunca editável direto): rascunho (criada, nunca ativada) · ativa
// (is_enabled=true, dentro ou ainda antes do período — o desconto só passa a
// valer quando now cai dentro de [starts_at, ends_at]) · expirada (passou do
// fim) · conflito (algum item colide com outra promoção ativa no mesmo
// período — bloqueia ativação, mas nunca bloqueia o cadastro).
export type PromotionStatus = "rascunho" | "ativa" | "expirada" | "conflito";

export interface PromotionItem {
  id: number;
  item_type: "category" | "product" | "combo";
  category_id: number | null;
  product_id: number | null;
  combo_id: number | null;
  discount_percent_override: number | null;
  // false quando a categoria/produto/combo referenciado foi inativado ou
  // excluído do catálogo depois de compor a promoção — some do totem, mas
  // não invalida a promoção nem os demais itens.
  available: boolean;
}

export interface PromotionConflict {
  promotion_id: number;
  promotion_name: string;
  product_ids: number[];
  combo_ids: number[];
}

export interface Promotion {
  id: number;
  name: string;
  starts_at: string;
  ends_at: string;
  general_discount_percent: number;
  is_enabled: boolean;
  status: PromotionStatus;
  items: PromotionItem[];
  conflicts: PromotionConflict[];
}

// ORD-162 — tabela de preço comercial da plataforma (superadmin/admin), não
// confundir com CompanyContractScreen (contrato jurídico por empresa, outra
// entidade). status: draft (rascunho, editável) | active (vigente, só uma
// por vez) | historical (substituída, somente-leitura).
export type PriceTableStatus = "draft" | "active" | "historical";

// ORD-164 — independente do status: marca uma tabela já ativada (active ou
// historical) como disponível pra uso manual em contratos específicos, sem
// virar a vigente padrão. null = tabela comum, sem categoria especial.
export type PriceTableKind = "alternativa" | "promocional" | null;

export interface PriceTableTransactionTier {
  id: number;
  min_transactions: number;
  max_transactions: number | null; // null = faixa aberta, só permitido na última
  price_per_transaction: number;
}

export interface PriceTable {
  id: number;
  name: string;
  status: PriceTableStatus;
  kind: PriceTableKind;
  totem_price_1: number;
  totem_multiplier_2: number;
  totem_multiplier_3_5: number;
  created_at: string;
  activated_at: string | null;
  archived_at: string | null;
  transaction_tiers: PriceTableTransactionTier[];
  // ORD-163 (revisão) — não é sobre status: uma tabela vigente sem nenhuma
  // empresa vinculada ainda pode ser editada/excluída; uma com empresa
  // vinculada, não, mesmo que rascunho nunca chegue a ter vínculo. ORD-165
  // — passa a incluir histórico: uma tabela já vinculada alguma vez, mesmo
  // sem vínculo hoje, também fica travada pra sempre.
  editable: boolean;
  // ORD-165 — quantas empresas estão vinculadas a esta tabela AGORA (não é
  // o histórico completo, só o presente).
  linked_companies_count: number;
  // ORD-167 — nomes das empresas vinculadas AGORA (mesmo critério de
  // linked_companies_count), só no detalhe — usado na visualização
  // somente-leitura de tabela não editável.
  linked_companies: { id: number; name: string }[];
}

// Resumo devolvido por GET /commercial/price-tables (lista) — sem faixas
// nem multiplicadores, só o suficiente pra listar.
export interface PriceTableSummary {
  id: number;
  name: string;
  status: PriceTableStatus;
  kind: PriceTableKind;
  created_at: string;
  activated_at: string | null;
  editable: boolean;
  linked_companies_count: number;
}

// ORD-163 — plano comercial da empresa, vinculado à tabela de preço vigente
// no momento da criação/renovação. Nome "Plan", não "Contract": já existe
// o contrato JURÍDICO (CompanyContractScreen, upload de PDF), entidade
// completamente diferente — evitar confundir os dois no código.
export type CompanyPlanStatus = "Ativo" | "Vencido";

export interface CompanyPlan {
  company_id: number;
  price_table: { id: number; name: string; kind: PriceTableKind };
  started_at: string;
  expires_at: string;
  renewed_at: string | null;
  status: CompanyPlanStatus;
}

// ORD-165 — registro de toda troca de price_table_id do plano comercial,
// consultável por empresa. action distingue renovação (adianta vencimento)
// de aplicação direta (só troca a tabela).
export type CompanyPlanHistoryAction = "renew" | "apply";

export interface CompanyPlanHistoryEntry {
  from_price_table: { id: number; name: string; kind: PriceTableKind };
  to_price_table: { id: number; name: string; kind: PriceTableKind };
  action: CompanyPlanHistoryAction;
  created_at: string;
}

export interface CompanyPlanHistory {
  entries: CompanyPlanHistoryEntry[];
}

// ORD-168 — cadastro fiscal da empresa (certificado A1 + CSC). legal_name/
// state_registration/tax_regime/address_summary espelham Company (edição
// continua em CompanyContractScreen) — nunca traz certificado/CSC em texto
// puro, só flags de presença.
export interface FiscalConfig {
  legal_name: string | null;
  state_registration: string | null;
  tax_regime: string | null;
  address_summary: string | null;
  certificado_cadastrado: boolean;
  certificado_nome_arquivo: string | null;
  certificado_enviado_em: string | null;
  csc_producao_cadastrado: boolean;
  csc_homologacao_cadastrado: boolean;
  completo: boolean;
}

export interface FiscalConfigUpdate {
  certificado_base64?: string;
  certificado_senha?: string;
  certificado_nome_arquivo?: string;
  csc_producao?: string;
  id_token_producao?: string;
  csc_homologacao?: string;
  id_token_homologacao?: string;
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
  // ORD-147 — reembolso Mercado Pago (distinto de cancelamento).
  refunded_at: string | null;
  refund_reason: string | null;
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
