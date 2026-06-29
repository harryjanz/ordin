export interface CompanyInfo {
  id: number;
  name: string;
  plan: string;
  visual_theme: string;
  visual_mode: string;
}

export interface TerminalInfo {
  id: number;
  label: string;
}

export interface AvailableTerminal {
  id: number;
  label: string;
  terminal_code: string | null;
  tef_number: string | null;
}

export interface Category {
  id: number;
  name: string;
}

export interface Product {
  id: number;
  category_id: number;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
}

export interface CartItem extends Product {
  qty: number;
}

export interface Ticket {
  ticket_code: string;
  qr_data: string;
  status: string;
  unit_number: number;
  total_units: number;
}

export interface CompletedOrder {
  order_ref: string;
  total: number;
  method: string;
  nsu: string | null;
  provider: string;
  tickets: Ticket[];
}

export type Screen =
  | "setup"
  | "pin"
  | "welcome"
  | "catalog"
  | "cpf"
  | "payment"
  | "pix"
  | "success"
  | "refused";
