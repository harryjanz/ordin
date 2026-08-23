export interface CompanyInfo {
  id: number;
  name: string;
  plan: string;
  visual_theme: string;
  visual_mode: string;
  // ORD-108 — quando true, mostra a tela "Comer no local"/"Para levar"
  // depois de fechar o carrinho, antes do CPF.
  consumption_mode_enabled: boolean;
  // ORD-116 — "horizontal" (padrão) ou "vertical" pro menu de categorias do catálogo.
  catalog_menu_layout: "horizontal" | "vertical";
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
  | "consumption"
  | "cpf"
  | "payment"
  | "pix"
  | "success"
  | "refused";

// ORD-108 — "local" (comer no local) ou "viagem" (para levar).
export type ConsumptionType = "local" | "viagem";

// ORD-115 — vídeo de modo espera (attract mode) da tela ociosa.
export interface TotemVideo {
  id: number;
  name: string;
  active: boolean;
  video_url: string;
}
