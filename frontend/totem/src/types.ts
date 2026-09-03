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
  // ORD-158 — timeout de inatividade do totem, configurável por empresa
  // (era constante fixa, ver ORD-155). Minutos até limpar o carrinho e
  // voltar pra welcome; segundos finais desse período mostrando o aviso
  // "Ainda está aí?" antes do reset.
  inactivity_timeout_min: number;
  inactivity_warn_sec: number;
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

// ORD-138/139/141 — grupos de opção reutilizáveis (sabor, tamanho, etc.).
// price_delta é um ACRÉSCIMO sobre o preço-base do produto, não um preço
// absoluto — regra de cálculo (soma dos deltas escolhidos) decidida em
// ORD-138/142. Mesmo shape de frontend/admin/src/types.ts, copiado 1:1 pra
// bater com o que a mesma API (GET /catalog/products) já retorna.
export interface OptionGroupOption {
  id: number;
  label: string;
  price_delta: number;
  image_url: string | null;
  thumbnail_url: string | null;
  sort_order: number | null;
  active: boolean;
}

// ORD-144 — min/max_selections_override valem só pro vínculo produto↔grupo
// (null = sem override, usa min_selections/max_selections do próprio
// grupo). Valor efetivo é sempre override ?? padrão, calculado no cliente.
export interface ProductOptionGroup {
  id: number;
  name: string;
  min_selections: number;
  max_selections: number;
  active: boolean;
  min_selections_override: number | null;
  max_selections_override: number | null;
  options: OptionGroupOption[];
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
  option_groups?: ProductOptionGroup[];
}

// ORD-150 — combo/bundle: conjunto de produtos existentes vendido com preço
// próprio. `items` vem denormalizado do catalog-service (nome/preço reais no
// momento da consulta) — usado tanto pro card do catálogo quanto pra checar
// se um produto avulso é componente de algum combo ativo (upsell).
export interface ComboItemRef {
  product_id: number;
  name: string;
  price: number;
  // ORD-157 (addendum) — em camada com Combo.upsell_enabled: só dispara
  // sugestão de upsell se os dois estiverem true.
  triggers_upsell: boolean;
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
  // ORD-153 — imagem do combo (opcional; card e upsell caem no placeholder
  // padrão, mesmo comportamento de produto sem imagem, quando ausente).
  image_url: string | null;
  thumbnail_url: string | null;
  // ORD-157 — quando false, o combo não entra na disputa por sugestão de
  // upsell ao comprar um produto componente avulso (mas continua vendável
  // normalmente pelo próprio card no catálogo).
  upsell_enabled: boolean;
  items: ComboItemRef[];
}

// `key` distingue produto de combo no carrinho (`product:<id>` ou
// `combo:<id>`) — combo.id e product.id são sequências independentes no
// catalog-service, então dois itens diferentes podem ter o mesmo `id`
// numérico. Nunca usar `id` sozinho como chave de agrupamento do carrinho.
// ORD-141 — opção de grupo de opção escolhida pro item (produto avulso).
// price_delta guardado aqui só pra composição de exibição — o preço já
// somado é o que vai em CartItem.price, ver addProductToCart.
export interface SelectedOption {
  group_name: string;
  option_label: string;
  price_delta: number;
}

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
  // ORD-141 — só presente quando o produto tinha grupo de opção vinculado
  // e o cliente escolheu algo. Enviado em POST /orders (ORD-142) pro
  // order-service persistir o que foi escolhido.
  selectedOptions?: SelectedOption[];
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
