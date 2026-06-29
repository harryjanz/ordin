import type { CompletedOrder } from "../types";

// Strip diacritics — ESC/POS ASCII safe for most printer code pages
function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const METHOD_LABEL: Record<string, string> = {
  credit: "Credito", debit: "Debito", pix: "PIX", voucher: "Voucher",
};
const fmtMethod = (m: string) => METHOD_LABEL[m] ?? m;
const fmtMoney = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ---------------------------------------------------------------------------
// ESC/POS builder
// ---------------------------------------------------------------------------
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
  for (const tk of order.tickets) {
    const parts = tk.qr_data.split("|");
    const productName = parts[1] ?? "";

    nl();
    raw(0x1B, 0x61, 0x01); // Center
    text("- - - - - - - - - - - - - - - - -"); nl();

    raw(0x1B, 0x45, 0x01); // Bold
    raw(0x1D, 0x21, 0x11); // Double
    text(norm(productName).toUpperCase().slice(0, 18)); nl();
    raw(0x1D, 0x21, 0x00);
    raw(0x1B, 0x45, 0x00);

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
): Promise<PrintMethod> {
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
      data: buildEscPosBase64(order, companyName),
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
