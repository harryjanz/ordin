import { useState, useEffect, useCallback } from "react";
import { Button, InputBase, Tag } from "design-system";
import api from "../api";
import { useStore } from "../store";
import { WsManager } from "../ws";
import OrderDetailScreen from "./OrderDetailScreen";
import ThemeModeSwitch from "../components/ThemeModeSwitch";
import { OrdinSymbol } from "../assets/OrdinSymbol";
import type { OrderSummary, WsEvent } from "../types";
import styles from "./QueueScreen.module.scss";

const URGENCY_THRESHOLD_MS = 10 * 60 * 1000;

function isUrgent(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() > URGENCY_THRESHOLD_MS;
}

function minutesAgo(createdAt: string) {
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000);
  if (mins < 1) return "agora";
  return `${mins} min atrás`;
}

const WS_LABEL: Record<string, string> = {
  connected: "● ao vivo",
  connecting: "⟳ reconectando…",
  disconnected: "○ offline",
};

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
    if (event.event === "order.paid" && event.order_ref) {
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

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.logoRow}>
          <OrdinSymbol size={20} />
          <span className={styles.logo}>ordin</span>
        </div>
        <div className={`${styles.wsChip} ${styles[`wsChip_${wsStatus}`]}`}>
          {WS_LABEL[wsStatus]}
        </div>
        <span className={styles.turboBtnWrap}>
          <Button
            size="small"
            variant={turboMode ? "primary" : "secondary"}
            onClick={toggleTurbo}
            title="Coleta sem confirmação"
          >
            {`⚡ Turbo ${turboMode ? "ON" : "OFF"}`}
          </Button>
        </span>
        <span className={styles.userName}>{userName ?? role}</span>
        <div className={styles.themeToggle}><ThemeModeSwitch /></div>
        <span className={styles.logoutBtnWrap}>
          <Button size="small" variant="secondary" onClick={handleLogout}>Sair</Button>
        </span>
      </div>

      <div className={styles.body}>
        <div className={styles.search}>
          <InputBase
            aria-label="Buscar por referência"
            placeholder="Buscar por referência…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className={styles.empty}>Carregando pedidos…</div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            {search ? "Nenhum pedido encontrado." : "Nenhum pedido pendente. Aguardando novos pedidos…"}
          </div>
        ) : filtered.map((o) => {
          const urgent = isUrgent(o.created_at);
          return (
            <div
              key={o.order_ref}
              className={`${styles.card} ${urgent ? styles.cardUrgent : ""}`}
              onClick={() => setSelectedOrder(o.order_ref)}
            >
              <div>
                <div className={styles.ref}>{o.order_ref}</div>
                <div className={styles.meta}>
                  Terminal {o.terminal_id} · {minutesAgo(o.created_at)} ·{" "}
                  {o.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </div>
              </div>
              {o.consumption_type === "viagem" && <Tag variant="warning">PARA LEVAR</Tag>}
              {urgent && <Tag variant="error">URGENTE</Tag>}
              <div className={styles.progress}>{o.tickets_collected}/{o.tickets_total} tickets</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
