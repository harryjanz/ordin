export interface CompanyInfo {
  id: number;
  name: string;
  plan: string;
  visual_theme: string;
  visual_mode: string;
  consumption_mode_enabled: boolean;
  catalog_menu_layout: string;
  fulfillment_mode: string;
  // ORD-119 — minutos até um pedido em preparo virar urgente (laranja na
  // metade do tempo, vermelho ao passar), configurável por empresa.
  prep_urgency_minutes: number;
}

export interface OrderSummary {
  order_ref: string;
  status: string;
  pickup_name: string | null;
  created_at: string;
}

export interface WsEvent {
  event: string;
  order_ref?: string;
  pickup_name?: string | null;
  total?: number;
  terminal_id?: number;
}
