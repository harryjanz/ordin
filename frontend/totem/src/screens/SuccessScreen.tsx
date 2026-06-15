import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Theme } from "../themes";
import type { CompletedOrder } from "../types";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  T: Theme;
  order: CompletedOrder;
  onNew: () => void;
  themeKey: string;
}

export default function SuccessScreen({ T, order, onNew, themeKey }: Props) {
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(t); onNew(); }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, overflowY: "auto", transition: "background 0.3s" }}>
      {/* Header sucesso */}
      <div style={{
        background: T.successBg,
        padding: "40px 24px 32px",
        textAlign: "center",
        borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ fontSize: 56, marginBottom: 8 }}>✅</div>
        <h2 style={{ color: T.text, fontSize: 28, fontWeight: 800, margin: 0 }}>Pagamento aprovado!</h2>
        <p style={{ color: T.muted, marginTop: 8 }}>
          Pedido <strong style={{ color: T.teal }}>{order.order_ref}</strong> · {fmt(order.total)}
        </p>
        <p style={{ color: T.muted, fontSize: 13, opacity: 0.7, marginTop: 4 }}>
          {order.method.toUpperCase()}{order.nsu ? ` · NSU ${order.nsu}` : ""}
        </p>
      </div>

      {/* Tickets */}
      <div style={{ padding: 24 }}>
        <h3 style={{ color: T.muted, marginBottom: 16, fontSize: 16 }}>
          🎫 Seus tickets ({order.tickets.length})
        </h3>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
          gap: 14,
        }}>
          {order.tickets.map((tk) => (
            <div
              key={tk.ticket_code}
              style={{
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 16,
                padding: 20,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                animation: "fadeIn 0.4s ease",
              }}
            >
              <div style={{ background: "white", padding: 8, borderRadius: 8 }}>
                <QRCodeSVG
                  value={tk.qr_data}
                  size={100}
                  bgColor="#ffffff"
                  fgColor={themeKey === "dark" ? "#1d1434" : "#1d1434"}
                  level="M"
                />
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ color: T.text, fontWeight: 700, fontSize: 14 }}>{tk.ticket_code}</div>
                <div style={{ color: T.muted, fontSize: 11, marginTop: 2 }}>
                  Unidade {tk.unit_number} de {tk.total_units}
                </div>
              </div>
              <div style={{
                background: T.ticketBadgeBg,
                border: `1px solid ${T.ticketBadgeBorder}`,
                borderRadius: 20,
                padding: "4px 12px",
                color: T.ticketBadgeText,
                fontSize: 11,
                fontWeight: 700,
              }}>
                PRONTO PARA RETIRAR
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "24px", textAlign: "center" }}>
        <p style={{ color: T.muted, fontSize: 14, marginBottom: 16 }}>
          Apresente o QR code no balcão para retirar seu pedido
        </p>
        <button
          onClick={onNew}
          style={{
            padding: "14px 40px",
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
        <p style={{ color: T.muted, fontSize: 12, marginTop: 12, opacity: 0.5 }}>
          Reiniciando em {countdown}s…
        </p>
      </div>
    </div>
  );
}
