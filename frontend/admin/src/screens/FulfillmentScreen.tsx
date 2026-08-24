import { useState, useEffect, useCallback } from "react";
import { Alert, Button, Tag } from "design-system";
import api from "../api";
import { useStore } from "../store";
import { listOrders } from "../api/orders";
import { WsManager } from "../ws";
import type { Order, WsEvent } from "../types";
import styles from "./FulfillmentScreen.module.scss";

function label(o: Order) {
  return o.pickup_name || `#${o.order_ref.slice(-4)}`;
}

// ORD-119 — fila de trabalho pro modelo de atendimento "retirada única"
// (ORD-118): equipe marca pedido pronto (paid→ready) e coletado
// (ready→completed, alternativa manual ao scan de QR do app de balcão).
// Mesmo stream de WebSocket que alimenta o painel público (frontend/painel).
export default function FulfillmentScreen() {
  const companyId = useStore((s) => s.selectedCompanyId ?? s.companyId);

  const [fulfillmentMode, setFulfillmentMode] = useState<string | null>(null);
  const [loadingCompany, setLoadingCompany] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [wsStatus, setWsStatus] = useState<"connected" | "connecting" | "disconnected">("connecting");
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!companyId) return;
    setLoadingCompany(true);
    api.get(`/companies/${companyId}`)
      .then((r) => setFulfillmentMode(r.data.fulfillment_mode ?? "por_item"))
      .catch(() => setFulfillmentMode(null))
      .finally(() => setLoadingCompany(false));
  }, [companyId]);

  const loadOrders = useCallback(() => {
    if (!companyId) return;
    setLoading(true);
    listOrders({ companyId, status: "paid,ready", limit: 100 })
      .then((r) => setOrders(r.items))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [companyId]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const handleWsEvent = useCallback((event: WsEvent) => {
    // Mesmo racional do painel público — order.paid não carrega pickup_name
    // no evento, recarrega via REST pra não mostrar dado incompleto.
    if (event.event === "order.paid" || event.event === "order.ready") {
      loadOrders();
    }
    if (event.event === "order.completed" && event.order_ref) {
      setOrders((prev) => prev.filter((o) => o.order_ref !== event.order_ref));
    }
  }, [loadOrders]);

  useEffect(() => {
    if (!companyId || fulfillmentMode !== "retirada_unica") return;
    const ws = new WsManager(companyId, handleWsEvent, (s) => {
      setWsStatus(s);
      if (s === "connected") loadOrders();
    });
    ws.connect();
    return () => ws.stop();
  }, [companyId, fulfillmentMode, handleWsEvent, loadOrders]);

  function showFeedback(msg: string, ok: boolean) {
    setFeedback({ msg, ok });
    setTimeout(() => setFeedback(null), 3000);
  }

  async function markReady(ref: string) {
    setBusy(ref);
    try {
      await api.post(`/orders/${ref}/ready`);
      showFeedback("Pedido marcado como pronto.", true);
      loadOrders();
    } catch {
      showFeedback("Erro ao marcar pronto.", false);
    } finally {
      setBusy(null);
    }
  }

  async function markCollected(ref: string) {
    setBusy(ref);
    try {
      await api.post(`/orders/${ref}/collect`, {});
      showFeedback("Pedido marcado como coletado.", true);
      setOrders((prev) => prev.filter((o) => o.order_ref !== ref));
    } catch {
      showFeedback("Erro ao marcar coletado.", false);
    } finally {
      setBusy(null);
    }
  }

  if (!companyId) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>Selecione uma empresa no Dashboard ou em Configurações.</div>
      </div>
    );
  }

  if (loadingCompany) {
    return <div className={styles.page}><div className={styles.empty}>Carregando…</div></div>;
  }

  if (fulfillmentMode !== "retirada_unica") {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Preparo</h1>
        <div className={styles.empty}>
          Esta empresa não usa o modelo de retirada única — não há fila de preparo/pronto
          pra operar aqui. Cada ticket é coletado individualmente pelo balcão.
        </div>
      </div>
    );
  }

  const preparing = orders.filter((o) => o.status === "paid");
  const ready = orders.filter((o) => o.status === "ready");

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Preparo</h1>
        <div className={`${styles.wsChip} ${styles[`wsChip_${wsStatus}`]}`}>
          <span className={styles.wsDot} />
          {wsStatus === "connected" ? "ao vivo" : wsStatus === "connecting" ? "conectando…" : "offline"}
        </div>
      </div>

      {feedback && (
        <div className={styles.feedback}>
          <Alert variant={feedback.ok ? "success" : "error"} text={feedback.msg} fullWidth />
        </div>
      )}

      {loading ? (
        <div className={styles.empty}>Carregando pedidos…</div>
      ) : (
        <div className={styles.columns}>
          <div className={styles.column}>
            <div className={styles.columnTitle}>Em preparo</div>
            {preparing.length === 0 ? (
              <div className={styles.emptyCol}>Nenhum pedido em preparo.</div>
            ) : preparing.map((o) => (
              <div key={o.order_ref} className={styles.card}>
                <div className={styles.cardLabel}>{label(o)}</div>
                <Tag variant="neutral">{o.order_ref}</Tag>
                <Button size="small" fullWidth disabled={busy === o.order_ref} onClick={() => markReady(o.order_ref)}>
                  Marcar pronto
                </Button>
              </div>
            ))}
          </div>
          <div className={styles.column}>
            <div className={styles.columnTitle}>Pronto para retirada</div>
            {ready.length === 0 ? (
              <div className={styles.emptyCol}>Nenhum pedido pronto.</div>
            ) : ready.map((o) => (
              <div key={o.order_ref} className={styles.card}>
                <div className={styles.cardLabel}>{label(o)}</div>
                <Tag variant="success">{o.order_ref}</Tag>
                <Button size="small" variant="secondary" fullWidth disabled={busy === o.order_ref} onClick={() => markCollected(o.order_ref)}>
                  Marcar coletado
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
