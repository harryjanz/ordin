export type Role = "admin" | "owner" | "manager" | "cashier" | "kiosk";

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  companyId: number | null;
  role: Role | null;
  userName: string | null;
}

export interface OrderSummary {
  order_ref: string;
  status: string;
  total: number;
  terminal_id: number;
  created_at: string;
  tickets_total: number;
  tickets_collected: number;
  // ORD-108 — "local" | "viagem" | null (empresa sem a opção ligada, ou
  // pedido anterior à feature).
  consumption_type?: string | null;
}

export interface Ticket {
  ticket_code: string;
  qr_data: string;
  status: string;
  unit_number: number;
  total_units: number;
  collected_at: string | null;
  collected_by: string | null;
  collection_method?: string | null;
}

export interface WsEvent {
  event: string;
  order_ref?: string;
  total?: number;
  terminal_label?: string;
  ticket_code?: string;
  product_name?: string;
  progress?: string;
  collected_by?: string;
}
