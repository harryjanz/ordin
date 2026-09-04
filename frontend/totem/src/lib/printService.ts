import type { CompletedOrder } from "../types";

// Strip diacritics — ESC/POS ASCII safe for most printer code pages
function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// ORD-143 — product_name já vem combinado com a opção escolhida desde
// ORD-141/142 (ex.: "Refrigerante Lata 350ml — Guaraná Antarctica"), no
// mesmo separador " — " que addProductWithOptionsToCart (CatalogScreen.tsx)
// usa pra montá-lo. Faz o split aqui, na camada de impressão, em vez de
// mudar o formato de product_name em si — evita tocar o carrinho/tela de
// compra já validados no ORD-141. Risco aceito: nome de produto real
// contendo " — " seria mal interpretado como tendo opção; mesmo racional de
// confiança já usado no parsing de qr_data.split("|") neste arquivo.
export function splitNameOption(combined: string): { name: string; option: string | null } {
  const idx = combined.indexOf(" — ");
  if (idx === -1) return { name: combined, option: null };
  return { name: combined.slice(0, idx), option: combined.slice(idx + 3) };
}

// ORD-159 — o nome do componente (product_name/qr_data) carrega
// "(Nome do Combo)" pro app de balcão, que mostra o item solto sem
// cabeçalho de combo (ver frontend/balcao/src/lib/orderItems.ts). Na
// impressão/tela do totem, onde o cabeçalho do combo já aparece antes do
// grupo, esse sufixo fica redundante — removido só aqui, na exibição,
// nunca no qr_data/product_name em si.
export function stripComboSuffix(name: string, comboName?: string | null): string {
  if (!comboName) return name;
  const suffix = ` (${comboName})`;
  return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}

const METHOD_LABEL: Record<string, string> = {
  credit: "Credito", debit: "Debito", pix: "PIX", voucher: "Voucher",
};
const fmtMethod = (m: string) => METHOD_LABEL[m] ?? m;
const fmtMoney = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ---------------------------------------------------------------------------
// ESC/POS builder
// ---------------------------------------------------------------------------
// ORD-118 — modelo "retirada_unica": produção centralizada, pedido inteiro
// entregue de uma vez. Ticket vira uma lista compacta de itens (sem bloco
// por unidade, sem corte parcial entre itens) com um único QR do pedido.
function buildEscPosBase64Compact(order: CompletedOrder, companyName: string): string {
  const bytes: number[] = [];
  function raw(...bs: number[]): void { bytes.push(...bs); }
  function text(s: string): void {
    const clean = norm(s);
    for (let i = 0; i < clean.length; i++) {
      const c = clean.charCodeAt(i);
      bytes.push(c < 128 ? c : 0x3F);
    }
  }
  function nl(n = 1): void { for (let i = 0; i < n; i++) bytes.push(0x0A); }
  function qrCode(data: string): void {
    const encoded = new TextEncoder().encode(data);
    const storeLen = encoded.length + 3;
    const pL = storeLen & 0xFF;
    const pH = (storeLen >> 8) & 0xFF;
    raw(0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    raw(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x05);
    raw(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31);
    raw(0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30);
    encoded.forEach((b) => bytes.push(b));
    raw(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);
  }

  raw(0x1B, 0x40); // Init

  raw(0x1B, 0x61, 0x01); // Center
  raw(0x1B, 0x45, 0x01); // Bold
  raw(0x1D, 0x21, 0x11); // Double
  text(norm(companyName).toUpperCase()); nl();
  raw(0x1D, 0x21, 0x00);
  raw(0x1B, 0x45, 0x00);

  text("ordin - autoatendimento"); nl();
  text(new Date().toLocaleString("pt-BR")); nl();

  raw(0x1B, 0x61, 0x00); // Left
  text(`Pedido: ${order.order_ref}`); nl();
  text(`${fmtMethod(order.method)}${order.nsu ? ` - NSU ${order.nsu}` : ""}`); nl(2);

  // Lista compacta de itens — sem bloco por unidade, retirada é do pedido
  // inteiro de uma vez.
  raw(0x1B, 0x61, 0x01); // Center
  text("- - - - - - - - - - - - - - - - -"); nl();
  raw(0x1B, 0x61, 0x00); // Left
  // order.tickets tem 1 linha por unidade (qty=2 -> 2 tickets) — só a
  // unidade 1 de cada item representa a linha, senão duplica no impresso.
  // ORD-159 — componentes com o mesmo combo_instance_key (mesma unidade de
  // combo comprada) ganham um cabeçalho com o nome do combo antes do
  // grupo, em vez de repetir "(Nome do Combo)" em cada linha solta.
  let lastComboKeyCompact: string | null = null;
  for (const tk of order.tickets.filter((t) => t.unit_number === 1)) {
    const parts = tk.qr_data.split("|");
    const productName = parts[1] ?? "";
    const { name, option } = splitNameOption(productName);
    if (tk.combo_instance_key && tk.combo_instance_key !== lastComboKeyCompact) {
      raw(0x1B, 0x45, 0x01); // Bold
      text(norm(tk.combo_name ?? "Combo")); nl();
      raw(0x1B, 0x45, 0x00);
    }
    lastComboKeyCompact = tk.combo_instance_key ?? null;
    const displayName = stripComboSuffix(name, tk.combo_name);
    text(`${tk.combo_instance_key ? "  " : ""}${tk.total_units}x ${norm(displayName)}`); nl();
    if (option) { text(`   ${norm(option)}`); nl(); }
  }
  nl();

  raw(0x1B, 0x61, 0x01); // Center
  raw(0x1B, 0x45, 0x01);
  raw(0x1D, 0x21, 0x01); // Double height
  text(norm(fmtMoney(order.total))); nl();
  raw(0x1D, 0x21, 0x00);
  raw(0x1B, 0x45, 0x00);
  nl();

  if (order.order_qr_data) qrCode(order.order_qr_data);
  nl(2);

  text("Retire seu pedido completo no balcao"); nl(2);

  raw(0x1B, 0x64, 0x04); // Feed
  raw(0x1D, 0x56, 0x01); // Cut — único, no fim

  const arr = new Uint8Array(bytes);
  let binary = "";
  arr.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function buildEscPosBase64(order: CompletedOrder, companyName: string): string {
  const bytes: number[] = [];

  function raw(...bs: number[]): void { bytes.push(...bs); }

  function text(s: string): void {
    const clean = norm(s);
    for (let i = 0; i < clean.length; i++) {
      const c = clean.charCodeAt(i);
      bytes.push(c < 128 ? c : 0x3F); // '?' for non-ASCII
    }
  }

  function nl(n = 1): void { for (let i = 0; i < n; i++) bytes.push(0x0A); }

  function qrCode(data: string): void {
    const encoded = new TextEncoder().encode(data);
    const storeLen = encoded.length + 3;
    const pL = storeLen & 0xFF;
    const pH = (storeLen >> 8) & 0xFF;

    raw(0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // Model 2
    raw(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x05);        // Size 5
    raw(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31);        // Error correction M
    raw(0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30);            // Store
    encoded.forEach((b) => bytes.push(b));
    raw(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);        // Print
  }

  // Initialize
  raw(0x1B, 0x40);

  // Header — company name centered, bold, duplo
  raw(0x1B, 0x61, 0x01);         // Center
  raw(0x1B, 0x45, 0x01);         // Bold on
  raw(0x1D, 0x21, 0x11);         // Double width + height
  text(norm(companyName).toUpperCase()); nl();
  raw(0x1D, 0x21, 0x00);         // Normal size
  raw(0x1B, 0x45, 0x00);         // Bold off

  text("ordin - autoatendimento"); nl();

  const now = new Date().toLocaleString("pt-BR");
  text(now); nl();

  raw(0x1B, 0x61, 0x00); // Left
  text(`Pedido: ${order.order_ref}`); nl();
  text(`${fmtMethod(order.method)}${order.nsu ? ` - NSU ${order.nsu}` : ""}`); nl();

  raw(0x1B, 0x61, 0x01); // Center
  raw(0x1B, 0x45, 0x01);
  raw(0x1D, 0x21, 0x01); // Double height
  text(norm(fmtMoney(order.total))); nl();
  raw(0x1D, 0x21, 0x00);
  raw(0x1B, 0x45, 0x00);

  // One ticket block per ticket — partial cut after each
  // QR format: {ticket_code}|{order_ref}|{product_name}|{unit}/{total}|{HMAC}
  // ORD-159 — cada ticket físico continua sendo cortado/coletado
  // separadamente (é assim que o balcão funciona hoje, um componente do
  // combo pode ser retirado numa estação diferente da outra); o que muda é
  // só um cabeçalho impresso ANTES do primeiro ticket de cada combo
  // comprado, pra dar contexto visual de que os próximos N tickets
  // pertencem ao mesmo combo — sem alterar corte/QR/coleta de nenhum deles.
  let lastComboKey: string | null = null;
  for (const tk of order.tickets) {
    const parts = tk.qr_data.split("|");
    const productName = parts[1] ?? "";
    const { name, option } = splitNameOption(productName);

    if (tk.combo_instance_key && tk.combo_instance_key !== lastComboKey) {
      nl();
      raw(0x1B, 0x61, 0x01); // Center
      raw(0x1B, 0x45, 0x01); // Bold
      text(`=== ${norm(tk.combo_name ?? "Combo")} ===`); nl();
      raw(0x1B, 0x45, 0x00);
    }
    lastComboKey = tk.combo_instance_key ?? null;

    nl();
    raw(0x1B, 0x61, 0x01); // Center
    text("- - - - - - - - - - - - - - - - -"); nl();

    const displayName = stripComboSuffix(name, tk.combo_name);
    raw(0x1B, 0x45, 0x01); // Bold
    raw(0x1D, 0x21, 0x11); // Double
    text(norm(displayName).toUpperCase().slice(0, 18)); nl();
    raw(0x1D, 0x21, 0x00);
    raw(0x1B, 0x45, 0x00);

    // ORD-143 — opção numa linha própria, sem dupla-largura (a fonte grande
    // do nome já usa a maior parte da linha de 80mm; opção em tamanho
    // normal cabe bem mais caractere sem cortar).
    if (option) {
      text(norm(option).slice(0, 32)); nl();
    }

    raw(0x1D, 0x21, 0x01); // Double height
    text(`Unidade ${tk.unit_number} de ${tk.total_units}`); nl();
    raw(0x1D, 0x21, 0x00);

    text(`Cod: ${tk.ticket_code}`); nl(2);

    qrCode(tk.qr_data);
    nl(2);

    text("Apresente no balcao para retirada"); nl(2);

    // Partial cut — avança e corta entre tickets
    raw(0x1B, 0x64, 0x04); // Feed 4 lines
    raw(0x1D, 0x56, 0x01); // Partial cut
  }

  // Convert to base64
  const arr = new Uint8Array(bytes);
  let binary = "";
  arr.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export type PrintMethod = "escpos" | "browser" | "blocked";

interface BrowserFallbackArgs {
  buildHtml: (svgs: string[]) => string;
  svgs: string[];
}

export async function silentPrint(
  order: CompletedOrder,
  companyName: string,
  fallback: BrowserFallbackArgs,
  fulfillmentMode: "por_item" | "retirada_unica" = "por_item",
): Promise<PrintMethod> {
  const compact = fulfillmentMode === "retirada_unica" && !!order.order_qr_data;

  // --- Tentativa 1: QZ Tray (impressão silenciosa via ESC/POS) ---
  try {
    const qzModule = await import("qz-tray");
    const qz = qzModule.default;

    // Bypass de certificado — adequado para uso local em kiosk
    qz.security.setCertificatePromise((resolve) => resolve(""));
    qz.security.setSignaturePromise((_toSign, resolve) => resolve(""));

    if (!qz.websocket.isActive()) {
      await qz.websocket.connect({ retries: 1, delay: 500 });
    }

    const printers = await qz.printers.find();
    if (!printers.length) throw new Error("no printers");

    const config = qz.configs.create(printers[0], {
      size: { width: 80, units: "mm" },
      margins: { top: 2, right: 3, bottom: 2, left: 3 },
    });

    await qz.print(config, [{
      type: "raw",
      format: "base64",
      data: compact ? buildEscPosBase64Compact(order, companyName) : buildEscPosBase64(order, companyName),
      options: { language: "ESCPOS" },
    }]);

    return "escpos";
  } catch {
    // QZ Tray indisponível ou sem impressora — cai no fallback
  }

  // --- Tentativa 2: window.open() → window.print() ---
  const html = fallback.buildHtml(fallback.svgs);
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
    return "browser";
  }

  return "blocked";
}
