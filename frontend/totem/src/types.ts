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
  // ORD-118 — "por_item" (padrão, ticket unitário) ou "retirada_unica"
  // (produção centralizada, ticket compacto com QR único do pedido).
  fulfillment_mode: "por_item" | "retirada_unica";
}

export interface TerminalInfo {
  id: number;
  label: string;
  // Usado só pra decidir dicas de UX específicas do provider (ex: aviso da
  // maquininha Mercado Pago) — nunca pra decisão de negócio, que é sempre
  // resolvida no payment-service a partir da config real da empresa.
  payment_provider?: string;
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
  // ORD-075 — lista livre (sem enum fixo), ex: "vegano", "picante", "mais vendido".
  tags?: string[] | null;
}

// ORD-150 — combo/bundle: conjunto de produtos existentes vendido com preço
// próprio. `items` vem denormalizado do catalog-service (nome/preço reais no
// momento da consulta) — usado tanto pro card do catálogo quanto pra checar
// se um produto avulso é componente de algum combo ativo (upsell).
export interface ComboItemRef {
  product_id: number;
  name: string;
  price: number;
}

export interface Combo {
  id: number;
  // ORD-112 — categoria em que o combo foi alocado no admin. Decisão
  // revisada em 2026-09-02: o combo só aparece nessa categoria específica no
  // totem, nunca numa seção "Destaque" global — null nunca aparece em
  // nenhuma categoria.
  category_id: number | null;
  name: string;
  description: string | null;
  price: number;
  items: ComboItemRef[];
}

// `key` distingue produto de combo no carrinho (`product:<id>` ou
// `combo:<id>`) — combo.id e product.id são sequências independentes no
// catalog-service, então dois itens diferentes podem ter o mesmo `id`
// numérico. Nunca usar `id` sozinho como chave de agrupamento do carrinho.
export interface CartItem {
  key: string;
  kind: "product" | "combo";
  id: number;
  name: string;
  price: number;
  qty: number;
  // Só presente quando kind === "combo" — usado pra explodir o combo em
  // itens reais (com preço avulso de cada um) na hora de montar o pedido,
  // ver App.tsx/handleCpfDone.
  comboItems?: ComboItemRef[];
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
  // ORD-118 — QR do pedido inteiro, usado no modelo "retirada_unica" (o
  // impresso vira um ticket compacto com este QR só, em vez de um bloco
  // por unidade em `tickets`).
  order_qr_data: string | null;
}

export type Screen =
  | "setup"
  | "pin"
  | "welcome"
  | "catalog"
  | "consumption"
  | "cpf"
  | "pickup"
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
