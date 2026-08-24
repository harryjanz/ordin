import { useEffect, useState, useCallback } from "react";
import type { Theme } from "../themes";
import { FONT, RADIUS } from "../scale";
import { OrdinSymbol } from "../assets/OrdinSymbol";
import api from "../api";
import { useStore } from "../store";
import { WsManager } from "../ws";
import type { WsEvent, OrderSummary } from "../types";

const FONT_D = "'Lexend', sans-serif";
const FONT_B = "'Inter', sans-serif";

interface Props {
  T: Theme;
  companyId: number;
  companyName: string;
}

function label(o: OrderSummary) {
  return o.pickup_name || `#${o.order_ref.slice(-4)}`;
}

// ORD-119 — tela passiva (só leitura, sem toque), pensada pra rodar numa
// TV/tela grande visível pro salão. Fonte grande e alto contraste — vista a
// distância, não de perto como o resto do totem.
export default function PanelScreen({ T, companyId, companyName }: Props) {
  const { orders, setOrders, removeOrder, updateOrderStatus } = useStore();
  const [wsStatus, setWsStatus] = useState<"connected" | "connecting" | "disconnected">("connecting");

  const loadOrders = useCallback(() => {
    api.get("/orders", { params: { status: "paid,ready", limit: 100 } })
      .then((r) => setOrders(r.data.orders ?? []))
      .catch(() => null);
  }, [setOrders]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const handleWsEvent = useCallback((event: WsEvent) => {
    // order.paid não carrega pickup_name no payload do evento (ver
    // broadcast_order_paid, services/order/websocket.py) — recarrega via
    // REST pra não mostrar "Pedido #..." por engano quando na verdade tem
    // nome informado.
    if (event.event === "order.paid") {
      loadOrders();
    }
    if (event.event === "order.ready" && event.order_ref) {
      updateOrderStatus(event.order_ref, "ready");
    }
    if (event.event === "order.completed" && event.order_ref) {
      removeOrder(event.order_ref);
    }
  }, [loadOrders, updateOrderStatus, removeOrder]);

  useEffect(() => {
    // Reconecta e revalida via REST antes de confiar só nos eventos — evita
    // ficar com dado desatualizado depois de uma queda de conexão (rede
    // instável, restart do order-service).
    const ws = new WsManager(companyId, handleWsEvent, (s) => {
      setWsStatus(s);
      if (s === "connected") loadOrders();
    });
    ws.connect();
    return () => ws.stop();
  }, [companyId, handleWsEvent, loadOrders]);

  const preparing = orders.filter((o) => o.status === "paid");
  const ready = orders.filter((o) => o.status === "ready");

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column" }}>
      <div style={{
        background: T.header, padding: "20px 40px",
        display: "flex", alignItems: "center", gap: 16,
        borderBottom: `1px solid ${T.borderNeutral}`, boxShadow: T.cardShadow,
      }}>
        <OrdinSymbol size={32} color={T.roxo} />
        <div style={{ fontFamily: FONT_D, fontWeight: 900, fontSize: FONT.title, color: T.text }}>
          {companyName}
        </div>
        <div style={{
          marginLeft: "auto", display: "flex", alignItems: "center", gap: 8,
          fontFamily: FONT_B, fontSize: FONT.body, color: T.muted,
        }}>
          <span style={{
            width: 10, height: 10, borderRadius: "50%",
            background: wsStatus === "connected" ? T.successColor : wsStatus === "connecting" ? "#f2b705" : T.errorText,
            animation: wsStatus !== "connected" ? "pulse 1.5s ease-in-out infinite" : "none",
          }} />
          {wsStatus === "connected" ? "ao vivo" : wsStatus === "connecting" ? "conectando…" : "offline"}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <Column title="Em preparo" items={preparing} T={T} accent={T.muted} />
        <div style={{ width: 1, background: T.borderNeutral }} />
        <Column title="Pronto para retirada" items={ready} T={T} accent={T.successColor} highlight />
      </div>
    </div>
  );
}

function Column({ title, items, T, accent, highlight }: {
  title: string; items: OrderSummary[]; T: Theme; accent: string; highlight?: boolean;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "32px 28px", overflowY: "auto" }}>
      <div style={{
        fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.headline,
        color: accent, marginBottom: 28, textAlign: "center",
      }}>
        {title}
      </div>
      {items.length === 0 ? (
        <div style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          color: T.muted, fontFamily: FONT_B, fontSize: FONT.subtitle, textAlign: "center",
        }}>
          Nenhum pedido no momento
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 20 }}>
          {items.map((o) => (
            <div
              key={o.order_ref}
              style={{
                background: highlight ? T.roxoSubtle : T.surface,
                border: `2px solid ${highlight ? T.roxo : T.borderNeutral}`,
                borderRadius: RADIUS.lg,
                padding: "24px 16px",
                textAlign: "center",
                fontFamily: FONT_D,
                fontWeight: 800,
                fontSize: FONT.title,
                color: T.text,
                boxShadow: T.cardShadow,
                animation: "fadeIn 0.3s ease",
                wordBreak: "break-word",
              }}
            >
              {label(o)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
