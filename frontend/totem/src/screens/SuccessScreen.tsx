import { useState, useEffect, useRef } from "react";
import { CheckCircle2, Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { Theme } from "../themes";
import type { CompletedOrder } from "../types";
import { useStore } from "../store";
import api from "../api";
import { formatChaveAcesso, silentPrint, splitNameOption, stripComboSuffix } from "../lib/printService";
import type { PrintMethod } from "../lib/printService";
import { FONT } from "../scale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtMethod = (m: string) =>
  ({ credit: "Crédito", debit: "Débito", pix: "PIX", voucher: "Voucher" })[m] ?? m.toUpperCase();
const NEW_ORDER_TIMEOUT_S = 30;

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

// ORD-172 — mesmo bloco conceitual do ESC/POS (printService.ts), versão HTML
// pro fallback de navegador (mock/pop-up bloqueado). Vazio quando o módulo
// fiscal está desligado ou a emissão não foi autorizada — impresso segue
// idêntico ao de antes desta história.
function buildDanfeHtml(order: CompletedOrder, danfeQrSvg: string): string {
  const doc = order.fiscal_document;
  if (!doc || doc.status !== "autorizada" || !doc.qrcode_url) return "";
  const svgEl = danfeQrSvg.replace(/width="[^"]*"/, 'width="130"').replace(/height="[^"]*"/, 'height="130"');
  return `
    <div class="danfe">
      <div class="danfe-title">DANFE NFC-e</div>
      <div class="danfe-sub">Documento Auxiliar da Nota Fiscal de Consumidor Eletronica</div>
      ${doc.chave_nfe ? `<div class="danfe-chave">${formatChaveAcesso(doc.chave_nfe)}</div>` : ""}
      <div class="danfe-qr">${svgEl}</div>
      <div class="danfe-footer">Consulte pela Chave de Acesso no site da SEFAZ do seu estado</div>
    </div>
    <div class="cut">- &nbsp; - &nbsp; - &nbsp;✂&nbsp; - &nbsp; - &nbsp; -</div>`;
}

// Template do ticket impresso (80mm térmica) — escala própria de impressora,
// intencionalmente fora da escala de tela do ORD-113 (mídia física
// diferente, não é UI de totem vista na tela).
function buildPrintHtml(order: CompletedOrder, companyName: string, svgs: string[], danfeQrSvg: string): string {
  const now = new Date().toLocaleString("pt-BR");

  // ORD-159 — cada ticket continua sendo seu próprio bloco cortável (é
  // assim que o balcão coleta, componente por componente); só ganha um
  // cabeçalho "Combo X" antes do primeiro ticket de cada instância de
  // combo comprada, pra dar contexto visual sem repetir "(Nome do Combo)"
  // em cada linha solta.
  let lastComboKeyPrint: string | null = null;
  const ticketsHtml = order.tickets.map((tk, i) => {
    const parts = tk.qr_data.split("|");
    const productName = parts[1] ?? "";
    const { name, option } = splitNameOption(productName);
    const svgEl = (svgs[i] ?? "").replace(/width="[^"]*"/, 'width="110"').replace(/height="[^"]*"/, 'height="110"');
    const comboHeader = tk.combo_instance_key && tk.combo_instance_key !== lastComboKeyPrint
      ? `<div class="combo-header">${tk.combo_name ?? "Combo"}</div>`
      : "";
    lastComboKeyPrint = tk.combo_instance_key ?? null;
    const displayName = stripComboSuffix(name, tk.combo_name);
    return `
      <div class="cut">- &nbsp; - &nbsp; - &nbsp;✂&nbsp; - &nbsp; - &nbsp; -</div>
      ${comboHeader}
      <div class="ticket${tk.combo_instance_key ? " ticket-combo-item" : ""}">
        <div class="ticket-title">
          <div class="ticket-name">${displayName}</div>
          ${option ? `<div class="ticket-option">${option}</div>` : ""}
        </div>
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
  .combo-header{
    font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;
    margin:6px 0 2px;color:#000;
  }
  .ticket{padding:2px 0 6px;}
  .ticket-combo-item{padding-left:8px;border-left:2px solid #ccc;}
  .ticket-title{
    margin-bottom:5px;text-align:center;
    border-bottom:1px solid #eee;padding-bottom:4px;
  }
  .ticket-name{
    font-size:15px;font-weight:bold;
    text-transform:uppercase;letter-spacing:.5px;
  }
  .ticket-option{
    font-size:11px;color:#666;margin-top:2px;
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
  .danfe{text-align:center;padding-bottom:8px;}
  .danfe-title{font-size:13px;font-weight:bold;letter-spacing:.5px;}
  .danfe-sub{font-size:9px;color:#555;margin:2px 0 6px;}
  .danfe-chave{font-size:10px;letter-spacing:.5px;margin-bottom:6px;word-break:break-all;}
  .danfe-qr svg{width:130px;height:130px;display:block;margin:0 auto;}
  .danfe-footer{font-size:9px;color:#555;margin-top:6px;}
  @media print{
    @page{size:80mm auto;margin:3mm 2mm;}
    body{width:100%;padding:0;}
  }
</style>
</head>
<body>
${buildDanfeHtml(order, danfeQrSvg)}
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

// ORD-118 — modelo "retirada_unica": ticket compacto, lista de itens sem
// bloco por unidade, um único QR do pedido inteiro no fim.
function buildCompactPrintHtml(order: CompletedOrder, companyName: string, orderQrSvg: string, danfeQrSvg: string): string {
  const now = new Date().toLocaleString("pt-BR");
  // order.tickets tem 1 linha por unidade (qty=2 -> 2 tickets) — só a
  // unidade 1 de cada item representa a linha, senão duplica no impresso.
  let lastComboKeyCompact: string | null = null;
  const itemsHtml = order.tickets
    .filter((tk) => tk.unit_number === 1)
    .map((tk) => {
      const productName = (tk.qr_data.split("|")[1] ?? "");
      const { name, option } = splitNameOption(productName);
      const comboHeader = tk.combo_instance_key && tk.combo_instance_key !== lastComboKeyCompact
        ? `<div class="combo-header">${tk.combo_name ?? "Combo"}</div>`
        : "";
      lastComboKeyCompact = tk.combo_instance_key ?? null;
      const rowClass = tk.combo_instance_key ? "item-row item-row-combo" : "item-row";
      const displayName = stripComboSuffix(name, tk.combo_name);
      return `${comboHeader}<div class="${rowClass}"><span class="item-qty">${tk.total_units}x</span> ${displayName}</div>${option ? `<div class="item-option">${option}</div>` : ""}`;
    })
    .join("");
  const svgEl = orderQrSvg.replace(/width="[^"]*"/, 'width="150"').replace(/height="[^"]*"/, 'height="150"');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Pedido ${order.order_ref}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Courier New',Courier,monospace;font-size:12px;width:80mm;max-width:80mm;background:#fff;color:#000;padding:4mm 3mm;}
  .header{text-align:center;padding-bottom:8px;border-bottom:1px dashed #000;margin-bottom:8px;}
  .company{font-size:15px;font-weight:bold;letter-spacing:1px;margin-bottom:2px;}
  .brand{font-size:10px;color:#555;margin-bottom:6px;}
  .hrow{font-size:11px;margin:2px 0;}
  .items{margin:10px 0;border-bottom:1px dashed #000;padding-bottom:8px;}
  .combo-header{font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;margin:6px 0 2px;}
  .item-row{font-size:12px;margin:3px 0;}
  .item-row-combo{margin-left:12px;}
  .item-qty{font-weight:bold;}
  .item-option{font-size:10px;color:#666;margin:0 0 3px 20px;}
  .total{font-size:15px;font-weight:bold;text-align:center;margin:8px 0;}
  .qr{text-align:center;margin:10px 0;}
  .qr svg{width:150px;height:150px;}
  .footer{text-align:center;margin-top:10px;padding-top:8px;border-top:1px dashed #000;font-size:10px;color:#555;line-height:1.6;}
  .danfe{text-align:center;padding-bottom:8px;}
  .danfe-title{font-size:13px;font-weight:bold;letter-spacing:.5px;}
  .danfe-sub{font-size:9px;color:#555;margin:2px 0 6px;}
  .danfe-chave{font-size:10px;letter-spacing:.5px;margin-bottom:6px;word-break:break-all;}
  .danfe-qr svg{width:130px;height:130px;display:block;margin:0 auto;}
  .danfe-footer{font-size:9px;color:#555;margin-top:6px;}
  @media print{ @page{size:80mm auto;margin:3mm 2mm;} body{width:100%;padding:0;} }
</style>
</head>
<body>
${buildDanfeHtml(order, danfeQrSvg)}
<div class="header">
  <div class="company">${companyName.toUpperCase()}</div>
  <div class="brand">ordin · autoatendimento</div>
  <div class="hrow">${now}</div>
  <div class="hrow">Pedido: <strong>${order.order_ref}</strong></div>
  <div class="hrow">${fmtMethod(order.method)}${order.nsu ? ` · NSU ${order.nsu}` : ""}</div>
</div>
<div class="items">${itemsHtml}</div>
<div class="total">${fmt(order.total)}</div>
<div class="qr">${svgEl}</div>
<div class="footer">
  Retire seu pedido completo no balcão<br/>
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
  // ORD-118 — "por_item" (padrão) ou "retirada_unica" (ticket compacto, QR único).
  const fulfillmentMode = useStore((s) => s.company?.fulfillment_mode ?? "por_item");
  const compactPrint = fulfillmentMode === "retirada_unica" && !!order.order_qr_data;
  const [countdown, setCountdown] = useState(NEW_ORDER_TIMEOUT_S);
  const [printMethod, setPrintMethod] = useState<PrintMethod | "pending">("pending");
  // ORD-119 (item 4, análise de concorrentes 2026-08-24) — estimativa de
  // tempo de espera baseada em dado real (GET /orders/prep-stats, últimas
  // 24h), não em config — só mostra quando já existe histórico suficiente
  // (count > 0); sem "achismo" quando a empresa ainda não tem dado nenhum.
  const [prepEstimateMin, setPrepEstimateMin] = useState<number | null>(null);
  const qrContainerRef = useRef<HTMLDivElement>(null);
  const orderQrRef = useRef<HTMLDivElement>(null);
  const danfeQrRef = useRef<HTMLDivElement>(null);

  const orderNumber = extractOrderNumber(order.order_ref);

  function buildHtmlForMode(svgs: string[], orderQrSvg: string, danfeQrSvg: string): string {
    return compactPrint
      ? buildCompactPrintHtml(order, companyName, orderQrSvg, danfeQrSvg)
      : buildPrintHtml(order, companyName, svgs, danfeQrSvg);
  }

  useEffect(() => {
    const timer = setTimeout(async () => {
      const svgs = Array.from(
        qrContainerRef.current?.querySelectorAll("svg") ?? []
      ).map((el) => {
        el.setAttribute("width", "130");
        el.setAttribute("height", "130");
        return el.outerHTML;
      });
      const orderQrSvg = orderQrRef.current?.querySelector("svg")?.outerHTML ?? "";
      const danfeQrSvg = danfeQrRef.current?.querySelector("svg")?.outerHTML ?? "";

      if (order.provider === "mock") {
        // Em modo mock: abre preview HTML direto, sem tentar QZ Tray
        const html = buildHtmlForMode(svgs, orderQrSvg, danfeQrSvg);
        const w = window.open("", "_blank");
        if (w) { w.document.write(html); w.document.close(); setPrintMethod("browser"); }
        else setPrintMethod("blocked");
        return;
      }

      const result = await silentPrint(order, companyName, {
        buildHtml: (s) => buildHtmlForMode(s, orderQrSvg, danfeQrSvg),
        svgs,
      }, fulfillmentMode);
      setPrintMethod(result);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (fulfillmentMode !== "retirada_unica") return;
    api.get("/orders/prep-stats")
      .then((r) => setPrepEstimateMin(r.data.count > 0 ? r.data.avg_prep_minutes : null))
      .catch(() => setPrepEstimateMin(null));
  }, [fulfillmentMode]);

  // newOrder() atualiza o store do App (troca `screen`) — chamar direto
  // dentro do updater do setCountdown dispara "Cannot update a component
  // while rendering a different component" (React pode invocar o updater
  // na fase de render). Efeito separado reagindo a countdown<=0 evita isso.
  useEffect(() => {
    if (countdown <= 0) { newOrder(); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, newOrder]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center pt-8 pb-7" style={{ background: T.bg }}>
      {/* QRs ocultos para extração de SVG */}
      <div ref={qrContainerRef} className="fixed opacity-0 pointer-events-none" style={{ left: -9999, top: 0 }} aria-hidden="true">
        {order.tickets.map((tk) => (
          <QRCodeSVG key={tk.ticket_code} value={tk.qr_data} size={130} bgColor="#ffffff" fgColor="#000000" level="M" />
        ))}
      </div>
      {order.order_qr_data && (
        <div ref={orderQrRef} className="fixed opacity-0 pointer-events-none" style={{ left: -9999, top: 0 }} aria-hidden="true">
          <QRCodeSVG value={order.order_qr_data} size={150} bgColor="#ffffff" fgColor="#000000" level="M" />
        </div>
      )}
      {order.fiscal_document?.qrcode_url && (
        <div ref={danfeQrRef} className="fixed opacity-0 pointer-events-none" style={{ left: -9999, top: 0 }} aria-hidden="true">
          <QRCodeSVG value={order.fiscal_document.qrcode_url} size={130} bgColor="#ffffff" fgColor="#000000" level="M" />
        </div>
      )}

      <div className="flex flex-col items-center gap-5 text-center" style={{ width: "min(680px, 92vw)" }}>

        {/* Ícone + título */}
        <CheckCircle2 size={88} color={T.successColor} strokeWidth={1.3} />
        <h2 style={{ color: T.successColor, fontFamily: FONT_D, fontSize: FONT.headlineLg, fontWeight: 800 }}>
          Pagamento aprovado!
        </h2>

        {/* Número do pedido */}
        <div className="leading-none">
          <p className="mb-2 uppercase tracking-widest" style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.subtitle }}>
            Número do pedido
          </p>
          <div className="leading-none tracking-tighter" style={{ fontFamily: FONT_D, fontWeight: 900, fontSize: FONT.hero, color: T.text }}>
            {orderNumber}
          </div>
        </div>

        {/* Estimativa de tempo — só retirada_unica, só com histórico real */}
        {fulfillmentMode === "retirada_unica" && prepEstimateMin !== null && (
          <Card className="w-full text-center" style={{ background: T.roxoSubtle, border: `1px solid ${T.border}` }}>
            <CardContent>
              <p style={{ color: T.text, fontFamily: FONT_B, fontSize: FONT.body }}>
                Seu pedido deve ficar pronto em aproximadamente{" "}
                <strong style={{ color: T.roxo }}>{Math.round(prepEstimateMin)} min</strong>
                {" "}— acompanhe no painel de retirada
              </p>
            </CardContent>
          </Card>
        )}

        {/* Valor em destaque */}
        <Card className="w-full">
          <CardContent>
            <p className="mb-1 uppercase tracking-wide" style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.bodyLg }}>
              Valor pago
            </p>
            <p className="mb-3 leading-none" style={{ color: T.priceColor, fontFamily: FONT_D, fontWeight: 900, fontSize: FONT.headlineLg }}>
              {fmt(order.total)}
            </p>
            <div className="flex justify-center gap-6 flex-wrap">
              <span style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.subtitle, fontWeight: 600 }}>
                {fmtMethod(order.method)}
              </span>
              {order.nsu && (
                <span style={{ color: T.muted, fontFamily: FONT_D, fontSize: FONT.subtitle, fontWeight: 700 }}>
                  NSU {order.nsu}
                </span>
              )}
              <span style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.bodyLg, opacity: 0.6 }}>
                {order.order_ref}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Status de impressão */}
        <Card className="w-full text-center">
          <CardContent>
            {printMethod === "pending" && (
              <>
                <Spinner className="mx-auto mb-3 size-9" style={{ color: T.roxo }} />
                <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.subtitle }}>Enviando para impressora…</p>
              </>
            )}

            {printMethod === "escpos" && (
              <>
                <Printer size={36} color={T.successColor} strokeWidth={1.5} className="mx-auto mb-3" />
                <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.subtitle }}>
                  Ticket impresso!<br />Retire na impressora e apresente no balcão.
                </p>
              </>
            )}

            {printMethod === "browser" && (
              <>
                <Printer size={36} color={T.muted} strokeWidth={1.5} className="mx-auto mb-3" />
                {order.provider === "mock" ? (
                  <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.subtitle }}>
                    Preview aberto — modo mock.<br />
                    <span style={{ fontSize: FONT.body, opacity: 0.6 }}>Em produção, imprime diretamente na impressora.</span>
                  </p>
                ) : (
                  <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.subtitle }}>
                    Tickets enviados para impressão!<br />Retire na impressora e apresente no balcão.
                  </p>
                )}
              </>
            )}

            {printMethod === "blocked" && (
              <>
                <Printer size={36} color={T.muted} strokeWidth={1.5} className="mx-auto mb-3" />
                <p className="mb-4" style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.subtitle }}>
                  A impressão foi bloqueada pelo navegador.<br />Toque para imprimir manualmente.
                </p>
                <Button
                  onClick={async () => {
                    const svgs = Array.from(qrContainerRef.current?.querySelectorAll("svg") ?? []).map((el) => el.outerHTML);
                    const orderQrSvg = orderQrRef.current?.querySelector("svg")?.outerHTML ?? "";
                    const danfeQrSvg = danfeQrRef.current?.querySelector("svg")?.outerHTML ?? "";
                    const html = buildHtmlForMode(svgs, orderQrSvg, danfeQrSvg);
                    const w = window.open("", "_blank");
                    if (w) { w.document.write(html); w.document.close(); setPrintMethod("browser"); }
                  }}
                  className="rounded-lg uppercase tracking-wide"
                  style={{ paddingLeft: 40, paddingRight: 40, minHeight: 72, background: T.btn, color: T.btnText, fontFamily: FONT_D, fontSize: FONT.subtitle, fontWeight: 800, boxShadow: T.glow }}
                >
                  Imprimir tickets
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Botão novo pedido */}
        <Button
          onClick={newOrder}
          className="w-full rounded-lg uppercase tracking-wide"
          style={{ minHeight: 88, background: T.btn, color: T.btnText, fontFamily: FONT_D, fontSize: FONT.title, fontWeight: 800, boxShadow: T.glow }}
        >
          Novo pedido
        </Button>

        <div style={{ width: "min(320px, 92vw)" }}>
          <p className="mb-2" style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.body, opacity: 0.5 }}>
            Novo pedido em {countdown}s…
          </p>
          <Progress
            value={countdown}
            minValue={0}
            maxValue={NEW_ORDER_TIMEOUT_S}
            aria-label="Tempo até iniciar um novo pedido"
            className="[&_[data-slot=progress-track]]:h-1.5"
            style={{ ["--primary" as string]: T.roxo }}
          />
        </div>

      </div>
    </div>
  );
}
