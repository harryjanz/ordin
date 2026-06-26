import { useState, useEffect, useRef } from "react";
import { CheckCircle2, Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { Theme } from "../themes";
import type { CompletedOrder } from "../types";
import { useStore } from "../store";
import { silentPrint } from "../lib/printService";
import type { PrintMethod } from "../lib/printService";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtMethod = (m: string) =>
  ({ credit: "Crédito", debit: "Débito", pix: "PIX", voucher: "Voucher" })[m] ?? m.toUpperCase();

const FONT_D = "'Lexend', sans-serif";
const FONT_B = "'Inter', sans-serif";

// Extrai o número sequencial do order_ref (ex: "ORD-20240626-007" → "7")
// Fallback para o ref completo se o formato mudar
function extractOrderNumber(ref: string): string {
  const parts = ref.split("-");
  const suffix = parts[parts.length - 1] ?? "";
  const num = parseInt(suffix, 10);
  return Number.isNaN(num) ? ref : String(num);
}

function buildPrintHtml(order: CompletedOrder, companyName: string, svgs: string[]): string {
  const now = new Date().toLocaleString("pt-BR");

  const ticketsHtml = order.tickets.map((tk, i) => {
    const parts = tk.qr_data.split("|");
    const productName = parts[1] ?? "";
    const svgEl = (svgs[i] ?? "").replace(/width="[^"]*"/, 'width="110"').replace(/height="[^"]*"/, 'height="110"');
    return `
      <div class="cut">- &nbsp; - &nbsp; - &nbsp;✂&nbsp; - &nbsp; - &nbsp; -</div>
      <div class="ticket">
        <div class="ticket-name">${productName}</div>
        <table class="ticket-body"><tbody><tr>
          <td class="ticket-qr">${svgEl}</td>
          <td class="ticket-info">
            <div class="unit">Unidade ${tk.unit_number} de ${tk.total_units}</div>
            <div class="code">Cód: ${tk.ticket_code}</div>
            <div class="ref">Pedido: ${order.order_ref}</div>
          </td>
        </tr></tbody></table>
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Tickets ${order.order_ref}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{
    font-family:'Courier New',Courier,monospace;
    font-size:12px;
    width:80mm;
    max-width:80mm;
    background:#fff;
    color:#000;
    padding:4mm 3mm;
  }
  .header{text-align:center;padding-bottom:8px;border-bottom:1px dashed #000;margin-bottom:6px;}
  .company{font-size:15px;font-weight:bold;letter-spacing:1px;margin-bottom:2px;}
  .brand{font-size:10px;color:#555;margin-bottom:6px;}
  .hrow{font-size:11px;margin:2px 0;}
  .total{font-size:14px;font-weight:bold;margin-top:4px;}
  .cut{
    text-align:center;
    border-top:1px dashed #000;
    margin:10px 0 4px;
    padding-top:5px;
    font-size:10px;
    letter-spacing:3px;
    color:#444;
  }
  .ticket{padding:2px 0 6px;}
  .ticket-name{
    font-size:15px;font-weight:bold;
    text-transform:uppercase;letter-spacing:.5px;
    margin-bottom:5px;text-align:center;
    border-bottom:1px solid #eee;padding-bottom:4px;
  }
  .ticket-body{width:100%;border-collapse:collapse;table-layout:fixed;}
  .ticket-qr{width:40%;text-align:center;vertical-align:middle;padding:2px 2px 2px 0;}
  .ticket-qr svg{width:110px;height:110px;display:block;margin:0 auto;}
  .ticket-info{width:60%;vertical-align:middle;padding:2px 0 2px 6px;}
  .unit{font-size:12px;font-weight:bold;margin-bottom:6px;color:#111;}
  .code{font-size:10px;letter-spacing:.5px;color:#444;word-break:break-all;}
  .ref{font-size:9px;color:#888;margin-top:6px;}
  .footer{text-align:center;margin-top:10px;padding-top:8px;
    border-top:1px dashed #000;font-size:10px;color:#555;line-height:1.6;}
  @media print{
    @page{size:80mm auto;margin:3mm 2mm;}
    body{width:100%;padding:0;}
  }
</style>
</head>
<body>
<div class="header">
  <div class="company">${companyName.toUpperCase()}</div>
  <div class="brand">ordin · autoatendimento</div>
  <div class="hrow">${now}</div>
  <div class="hrow">Pedido: <strong>${order.order_ref}</strong></div>
  <div class="hrow">${fmtMethod(order.method)}${order.nsu ? ` · NSU ${order.nsu}` : ""}</div>
  <div class="total">${fmt(order.total)}</div>
</div>

${ticketsHtml}

<div class="footer">
  Apresente no balcão para retirada<br/>
  Obrigado pela sua visita!
</div>

<script>
  window.onload = function(){ window.print(); }
</script>
</body>
</html>`;
}

interface Props {
  T: Theme;
  order: CompletedOrder;
  companyName: string;
  onNew: () => void;
}

export default function SuccessScreen({ T, order, companyName, onNew }: Props) {
  const newOrder = useStore((s) => s.newOrder);
  const [countdown, setCountdown] = useState(30);
  const [printMethod, setPrintMethod] = useState<PrintMethod | "pending">("pending");
  const qrContainerRef = useRef<HTMLDivElement>(null);

  const orderNumber = extractOrderNumber(order.order_ref);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const svgs = Array.from(
        qrContainerRef.current?.querySelectorAll("svg") ?? []
      ).map((el) => {
        el.setAttribute("width", "130");
        el.setAttribute("height", "130");
        return el.outerHTML;
      });

      if (order.provider === "mock") {
        // Em modo mock: abre preview HTML direto, sem tentar QZ Tray
        const html = buildPrintHtml(order, companyName, svgs);
        const w = window.open("", "_blank");
        if (w) { w.document.write(html); w.document.close(); setPrintMethod("browser"); }
        else setPrintMethod("blocked");
        return;
      }

      const result = await silentPrint(order, companyName, {
        buildHtml: (s) => buildPrintHtml(order, companyName, s),
        svgs,
      });
      setPrintMethod(result);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(t); newOrder(); }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      background: T.bg,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 0 28px",
    }}>
      {/* QRs ocultos para extração de SVG */}
      <div ref={qrContainerRef} style={{ position: "fixed", left: -9999, top: 0, opacity: 0, pointerEvents: "none" }} aria-hidden="true">
        {order.tickets.map((tk) => (
          <QRCodeSVG key={tk.ticket_code} value={tk.qr_data} size={130} bgColor="#ffffff" fgColor="#000000" level="M" />
        ))}
      </div>

      <div style={{ width: "min(680px, 92vw)", display: "flex", flexDirection: "column", alignItems: "center", gap: 20, textAlign: "center" }}>

        {/* Ícone + título */}
        <CheckCircle2 size={88} color={T.successColor} strokeWidth={1.3} />
        <h2 style={{ color: T.successColor, fontFamily: FONT_D, fontSize: 52, fontWeight: 800, margin: 0 }}>
          Pagamento aprovado!
        </h2>

        {/* Número do pedido */}
        <div style={{ lineHeight: 1 }}>
          <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: 18, margin: "0 0 6px", letterSpacing: 2, textTransform: "uppercase" }}>
            Número do pedido
          </p>
          <div style={{ fontFamily: FONT_D, fontWeight: 900, fontSize: 100, lineHeight: 1, color: T.text, letterSpacing: "-2px" }}>
            {orderNumber}
          </div>
        </div>

        {/* Valor em destaque */}
        <div style={{
          width: "100%",
          padding: "20px 28px",
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
        }}>
          <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: 16, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: 1 }}>
            Valor pago
          </p>
          <p style={{ color: T.priceColor, fontFamily: FONT_D, fontWeight: 900, fontSize: 52, margin: "0 0 12px", lineHeight: 1 }}>
            {fmt(order.total)}
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap" }}>
            <span style={{ color: T.muted, fontFamily: FONT_B, fontSize: 20, fontWeight: 600 }}>
              {fmtMethod(order.method)}
            </span>
            {order.nsu && (
              <span style={{ color: T.muted, fontFamily: FONT_D, fontSize: 20, fontWeight: 700 }}>
                NSU {order.nsu}
              </span>
            )}
            <span style={{ color: T.muted, fontFamily: FONT_B, fontSize: 16, opacity: 0.6 }}>
              {order.order_ref}
            </span>
          </div>
        </div>

        {/* Status de impressão */}
        <div style={{
          width: "100%",
          padding: "20px 28px",
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          textAlign: "center",
        }}>
          {printMethod === "pending" && (
            <>
              <div style={{
                width: 36, height: 36,
                border: `3px solid ${T.border}`,
                borderTop: `3px solid ${T.roxo}`,
                borderRadius: "50%", animation: "spin 0.8s linear infinite",
                margin: "0 auto 12px",
              }} />
              <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: 18, margin: 0 }}>Enviando para impressora…</p>
            </>
          )}

          {printMethod === "escpos" && (
            <>
              <Printer size={36} color={T.successColor} strokeWidth={1.5} style={{ marginBottom: 10 }} />
              <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: 18, margin: 0 }}>
                Ticket impresso!<br />Retire na impressora e apresente no balcão.
              </p>
            </>
          )}

          {printMethod === "browser" && (
            <>
              <Printer size={36} color={T.muted} strokeWidth={1.5} style={{ marginBottom: 10 }} />
              {order.provider === "mock" ? (
                <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: 18, margin: 0 }}>
                  Preview aberto — modo mock.<br />
                  <span style={{ fontSize: 14, opacity: 0.6 }}>Em produção, imprime diretamente na impressora.</span>
                </p>
              ) : (
                <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: 18, margin: 0 }}>
                  Tickets enviados para impressão!<br />Retire na impressora e apresente no balcão.
                </p>
              )}
            </>
          )}

          {printMethod === "blocked" && (
            <>
              <Printer size={36} color={T.muted} strokeWidth={1.5} style={{ marginBottom: 12 }} />
              <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: 18, marginBottom: 16 }}>
                A impressão foi bloqueada pelo navegador.<br />Toque para imprimir manualmente.
              </p>
              <button
                onClick={async () => {
                  const svgs = Array.from(qrContainerRef.current?.querySelectorAll("svg") ?? []).map((el) => el.outerHTML);
                  const html = buildPrintHtml(order, companyName, svgs);
                  const w = window.open("", "_blank");
                  if (w) { w.document.write(html); w.document.close(); setPrintMethod("browser"); }
                }}
                style={{
                  padding: "0 40px", height: 72, background: T.btn, color: T.btnText,
                  border: "none", borderRadius: 12, fontFamily: FONT_D,
                  fontSize: 20, fontWeight: 800, cursor: "pointer", boxShadow: T.glow,
                  textTransform: "uppercase", letterSpacing: 1,
                }}
              >
                Imprimir tickets
              </button>
            </>
          )}
        </div>

        {/* Botão novo pedido */}
        <button
          onClick={newOrder}
          style={{
            width: "100%", height: 88,
            background: T.btn, color: T.btnText,
            border: "none", borderRadius: 12,
            fontFamily: FONT_D, fontSize: 24, fontWeight: 800,
            cursor: "pointer", boxShadow: T.glow,
            textTransform: "uppercase", letterSpacing: 1,
          }}
        >
          Novo pedido
        </button>

        <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: 14, opacity: 0.4, margin: 0 }}>
          Novo pedido em {countdown}s…
        </p>

      </div>
    </div>
  );
}
