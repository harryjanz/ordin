import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Theme } from "../themes";
import type { CompletedOrder } from "../types";
import { useStore } from "../store";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtMethod = (m: string) =>
  ({ credit: "Crédito", debit: "Débito", pix: "PIX", voucher: "Voucher" })[m] ?? m.toUpperCase();

function buildPrintHtml(order: CompletedOrder, companyName: string, svgs: string[]): string {
  const now = new Date().toLocaleString("pt-BR");

  const ticketsHtml = order.tickets.map((tk, i) => {
    const parts = tk.qr_data.split("|");
    const productName = parts[1] ?? "";
    const svgEl = svgs[i] ?? "";
    return `
      <div class="cut">- &nbsp; - &nbsp; - &nbsp;✂&nbsp; - &nbsp; - &nbsp; -</div>
      <div class="ticket">
        <div class="ticket-title">${productName}</div>
        <div class="info">Unidade ${tk.unit_number} de ${tk.total_units}</div>
        <div class="code">Cód: ${tk.ticket_code}</div>
        <div class="qr-wrap">${svgEl}</div>
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
    margin:10px 0 6px;
    padding-top:5px;
    font-size:10px;
    letter-spacing:3px;
    color:#444;
  }
  .ticket{padding:2px 0 6px;}
  .ticket-title{font-size:13px;font-weight:bold;margin-bottom:3px;}
  .info{font-size:10px;color:#333;margin:1px 0;}
  .code{font-size:11px;letter-spacing:1px;margin:3px 0 2px;}
  .qr-wrap{text-align:center;margin:6px 0 2px;}
  .qr-wrap svg{width:130px;height:130px;}
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
  const [printed, setPrinted] = useState(false);
  const [printBlocked, setPrintBlocked] = useState(false);
  const qrContainerRef = useRef<HTMLDivElement>(null);

  // Abre aba de impressão após DOM renderizar os QRs
  useEffect(() => {
    const timer = setTimeout(() => {
      const svgs = Array.from(
        qrContainerRef.current?.querySelectorAll("svg") ?? []
      ).map((el) => {
        // garante tamanho explícito para impressão
        el.setAttribute("width", "130");
        el.setAttribute("height", "130");
        return el.outerHTML;
      });

      const html = buildPrintHtml(order, companyName, svgs);
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(html);
        w.document.close();
        setPrinted(true);
      } else {
        setPrintBlocked(true);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  // Countdown → novo pedido (sem PIN)
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
      textAlign: "center",
      padding: 32,
    }}>
      {/* QRs ocultos para extração de SVG */}
      <div ref={qrContainerRef} style={{ position: "fixed", left: -9999, top: 0, opacity: 0, pointerEvents: "none" }} aria-hidden="true">
        {order.tickets.map((tk) => (
          <QRCodeSVG key={tk.ticket_code} value={tk.qr_data} size={130} bgColor="#ffffff" fgColor="#000000" level="M" />
        ))}
      </div>

      <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>

      <h2 style={{ color: T.text, fontSize: 28, fontWeight: 800, margin: 0 }}>
        Pagamento aprovado!
      </h2>
      <p style={{ color: T.teal ?? "#33cccc", fontWeight: 700, fontSize: 20, marginTop: 8 }}>
        {fmt(order.total)}
      </p>
      <p style={{ color: T.muted, fontSize: 13, marginTop: 4 }}>
        {order.order_ref} · {fmtMethod(order.method)}{order.nsu ? ` · NSU ${order.nsu}` : ""}
      </p>

      <div style={{
        marginTop: 32,
        padding: "18px 28px",
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 16,
        maxWidth: 360,
      }}>
        {printBlocked ? (
          <>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🖨️</div>
            <p style={{ color: T.muted, fontSize: 14, marginBottom: 12 }}>
              A impressão foi bloqueada pelo navegador.<br/>Toque para imprimir manualmente.
            </p>
            <button
              onClick={() => {
                const svgs = Array.from(qrContainerRef.current?.querySelectorAll("svg") ?? []).map((el) => el.outerHTML);
                const html = buildPrintHtml(order, companyName, svgs);
                const w = window.open("", "_blank");
                if (w) { w.document.write(html); w.document.close(); setPrintBlocked(false); setPrinted(true); }
              }}
              style={{
                padding: "12px 28px", background: T.btn, color: T.btnText,
                border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer",
              }}
            >
              🖨️ Imprimir tickets
            </button>
          </>
        ) : printed ? (
          <>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🖨️</div>
            <p style={{ color: T.muted, fontSize: 14 }}>
              Tickets enviados para impressão!<br/>Retire na impressora e apresente no balcão.
            </p>
          </>
        ) : (
          <>
            <div style={{
              width: 32, height: 32, border: `3px solid ${T.border}`,
              borderTop: `3px solid ${T.roxo ?? "#9900ff"}`,
              borderRadius: "50%", animation: "spin 0.8s linear infinite",
              margin: "0 auto 12px",
            }} />
            <p style={{ color: T.muted, fontSize: 14 }}>Abrindo impressão…</p>
          </>
        )}
      </div>

      <button
        onClick={newOrder}
        style={{
          marginTop: 28,
          padding: "14px 48px",
          background: T.btn,
          color: T.btnText,
          border: "none",
          borderRadius: 14,
          fontSize: 16,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: T.glow,
        }}
      >
        Novo pedido
      </button>
      <p style={{ color: T.muted, fontSize: 12, marginTop: 10, opacity: 0.5 }}>
        Novo pedido em {countdown}s…
      </p>
    </div>
  );
}
