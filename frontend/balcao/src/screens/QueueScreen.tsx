import { useState, useEffect, useCallback } from "react";
import api from "../api";
import { useStore } from "../store";
import { WsManager } from "../ws";
import OrderDetailScreen from "./OrderDetailScreen";
import type { OrderSummary, WsEvent } from "../types";

const URGENCY_THRESHOLD_MS = 10 * 60 * 1000;

function isUrgent(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() > URGENCY_THRESHOLD_MS;
}

function minutesAgo(createdAt: string) {
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000);
  if (mins < 1) return "agora";
  return `${mins} min atrás`;
}

export default function QueueScreen() {
  const {
    companyId, role, userName, turboMode, orders,
    setOrders, upsertOrder, removeOrder, updateOrderProgress, toggleTurbo, logout,
  } = useStore();

  const [wsStatus, setWsStatus] = useState<"connected" | "connecting" | "disconnected">("connecting");
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Carrega fila inicial
  useEffect(() => {
    api.get("/orders?status=paid&limit=50")
      .then((r) => setOrders(r.data.orders ?? []))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  // WebSocket
  useEffect(() => {
    if (!companyId) return;

    const ws = new WsManager(
      companyId,
      handleWsEvent,
      setWsStatus
    );
    ws.connect();
    return () => ws.stop();
  }, [companyId]);

  const handleWsEvent = useCallback((event: WsEvent) => {
    if (event.event === "order.created" && event.order_ref) {
      api.get(`/orders?status=paid&limit=50`)
        .then((r) => setOrders(r.data.orders ?? []))
        .catch(() => null);
    }
    if (event.event === "ticket.collected" && event.order_ref && event.progress) {
      const [col, total] = event.progress.split("/").map(Number);
      updateOrderProgress(event.order_ref, col, total);
    }
    if (event.event === "order.completed" && event.order_ref) {
      removeOrder(event.order_ref);
    }
  }, []);

  async function handleLogout() {
    const { refreshToken } = useStore.getState();
    try { if (refreshToken) await api.post("/auth/logout", { refresh_token: refreshToken }); } catch { /* best-effort */ }
    logout();
  }

  const filtered = orders
    .filter((o) => o.status === "paid")
    .filter((o) => !search || o.order_ref.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const ua = isUrgent(a.created_at) ? 1 : 0;
      const ub = isUrgent(b.created_at) ? 1 : 0;
      if (ua !== ub) return ub - ua;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

  if (selectedOrder) {
    return (
      <OrderDetailScreen
        orderRef={selectedOrder}
        turboMode={turboMode}
        onBack={() => setSelectedOrder(null)}
        onAllCollected={() => { setSelectedOrder(null); removeOrder(selectedOrder); }}
      />
    );
  }

  const S = {
    page: { minHeight: "100vh", background: "#0e0b1a", display: "flex", flexDirection: "column" as const },
    header: {
      background: "#1d1434",
      borderBottom: "1px solid rgba(153,0,255,0.2)",
      padding: "14px 20px",
      display: "flex",
      alignItems: "center",
      gap: 12,
    } as React.CSSProperties,
    logo: { fontWeight: 800, fontSize: 18, color: "#9900ff" } as React.CSSProperties,
    wsChip: (s: string) => ({
      fontSize: 11,
      fontWeight: 600,
      padding: "3px 10px",
      borderRadius: 20,
      background: s === "connected" ? "rgba(51,204,204,0.12)" : s === "connecting" ? "rgba(245,158,11,0.12)" : "rgba(255,77,109,0.12)",
      color: s === "connected" ? "#33cccc" : s === "connecting" ? "#f59e0b" : "#ff4d6d",
    } as React.CSSProperties),
    turboBtn: (on: boolean) => ({
      padding: "5px 14px",
      borderRadius: 20,
      border: `1px solid ${on ? "#9900ff" : "rgba(153,0,255,0.3)"}`,
      background: on ? "rgba(153,0,255,0.2)" : "transparent",
      color: on ? "#9900ff" : "rgba(223,232,237,0.5)",
      fontSize: 12,
      fontWeight: 700,
      cursor: "pointer",
    } as React.CSSProperties),
    logoutBtn: {
      marginLeft: "auto",
      padding: "5px 14px",
      background: "transparent",
      border: "1px solid rgba(153,0,255,0.2)",
      borderRadius: 8,
      color: "rgba(223,232,237,0.5)",
      fontSize: 12,
      cursor: "pointer",
    } as React.CSSProperties,
    body: { flex: 1, padding: "16px 20px" } as React.CSSProperties,
    search: {
      width: "100%",
      padding: "10px 14px",
      background: "#1d1434",
      border: "1px solid rgba(153,0,255,0.2)",
      borderRadius: 10,
      color: "#DFE8ED",
      fontSize: 14,
      outline: "none",
      marginBottom: 16,
    } as React.CSSProperties,
    card: (urgent: boolean) => ({
      background: "#1d1434",
      border: `1px solid ${urgent ? "rgba(255,77,109,0.4)" : "rgba(153,0,255,0.15)"}`,
      borderRadius: 12,
      padding: "14px 16px",
      marginBottom: 10,
      cursor: "pointer",
      transition: "border-color 0.15s",
      display: "flex",
      alignItems: "center",
      gap: 12,
    } as React.CSSProperties),
    ref: { fontFamily: "monospace", fontWeight: 700, fontSize: 15, color: "#DFE8ED" } as React.CSSProperties,
    meta: { fontSize: 12, color: "rgba(223,232,237,0.45)", marginTop: 3 } as React.CSSProperties,
    progress: { fontSize: 13, color: "#33cccc", fontWeight: 600, marginLeft: "auto", flexShrink: 0 } as React.CSSProperties,
    urgentBadge: {
      padding: "2px 8px",
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 700,
      background: "rgba(255,77,109,0.15)",
      color: "#ff4d6d",
      flexShrink: 0,
    } as React.CSSProperties,
  };

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.logo}>ordin</div>
        <div style={S.wsChip(wsStatus)}>
          {wsStatus === "connected" ? "● ao vivo" : wsStatus === "connecting" ? "⟳ reconectando…" : "○ offline"}
        </div>
        <button style={S.turboBtn(turboMode)} onClick={toggleTurbo} title="Coleta sem confirmação">
          ⚡ Turbo {turboMode ? "ON" : "OFF"}
        </button>
        <span style={{ fontSize: 13, color: "rgba(223,232,237,0.4)", marginLeft: 8 }}>
          {userName ?? role}
        </span>
        <button style={S.logoutBtn} onClick={handleLogout}>Sair</button>
      </div>

      <div style={S.body}>
        <input
          style={S.search}
          placeholder="Buscar por referência…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {loading ? (
          <div style={{ color: "rgba(223,232,237,0.4)", fontSize: 14, textAlign: "center", padding: 32 }}>
            Carregando pedidos…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ color: "rgba(223,232,237,0.35)", fontSize: 14, textAlign: "center", padding: 40 }}>
            {search ? "Nenhum pedido encontrado." : "Nenhum pedido pendente. Aguardando novos pedidos…"}
          </div>
        ) : filtered.map((o) => {
          const urgent = isUrgent(o.created_at);
          return (
            <div
              key={o.order_ref}
              style={S.card(urgent)}
              onClick={() => setSelectedOrder(o.order_ref)}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#9900ff")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = urgent ? "rgba(255,77,109,0.4)" : "rgba(153,0,255,0.15)")}
            >
              <div>
                <div style={S.ref}>{o.order_ref}</div>
                <div style={S.meta}>
                  Terminal {o.terminal_id} · {minutesAgo(o.created_at)} ·{" "}
                  {o.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </div>
              </div>
              {urgent && <div style={S.urgentBadge}>URGENTE</div>}
              <div style={S.progress}>{o.tickets_collected}/{o.tickets_total} tickets</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
