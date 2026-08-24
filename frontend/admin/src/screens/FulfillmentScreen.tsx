import { useState, useEffect, useCallback } from "react";
import { Alert, Button, Modal, Tag } from "design-system";
import api from "../api";
import { useStore } from "../store";
import { listOrders, listOrderTickets } from "../api/orders";
import { WsManager } from "../ws";
import type { Order, Ticket, WsEvent } from "../types";
import styles from "./FulfillmentScreen.module.scss";

function label(o: Order) {
  return o.pickup_name || `#${o.order_ref.slice(-4)}`;
}

type UrgencyLevel = "none" | "orange" | "red";

// ORD-119 — limiar configurável por empresa (company.prep_urgency_minutes,
// default 10 min, mesmo default já usado antes como valor fixo). Laranja na
// metade do tempo, vermelho ao passar — mesmo critério do painel público
// (frontend/painel/PanelScreen.tsx), pra não ter dois sinais diferentes pra
// mesma demora.
function urgencyLevel(createdAt: string, prepUrgencyMinutes: number): UrgencyLevel {
  const elapsedMin = (Date.now() - new Date(createdAt).getTime()) / 60_000;
  if (elapsedMin >= prepUrgencyMinutes) return "red";
  if (elapsedMin >= prepUrgencyMinutes / 2) return "orange";
  return "none";
}

function minutesAgo(createdAt: string) {
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000);
  if (mins < 1) return "agora";
  return `${mins} min`;
}

interface ItemSummary { name: string; qty: number; }

function summarizeItems(tickets: Ticket[]): ItemSummary[] {
  // Mesmo padrão de lib/orderItems.ts do app de balcão: 1 ticket por
  // unidade, filtra unit_number===1 pra não contar em dobro, nome do
  // produto vem do próprio qr_data.
  const byName = new Map<string, number>();
  for (const t of tickets) {
    if (t.unit_number !== 1) continue;
    const name = t.qr_data.split("|")[1] ?? "Item";
    byName.set(name, (byName.get(name) ?? 0) + t.total_units);
  }
  return Array.from(byName, ([name, qty]) => ({ name, qty }));
}

// ORD-119 — fila de trabalho pro modelo de atendimento "retirada única"
// (ORD-118): equipe marca pedido pronto (paid→ready) e coletado
// (ready→completed, alternativa manual ao scan de QR do app de balcão).
// Mesmo stream de WebSocket que alimenta o painel público (frontend/painel).
export default function FulfillmentScreen() {
  const companyId = useStore((s) => s.selectedCompanyId ?? s.companyId);

  const [fulfillmentMode, setFulfillmentMode] = useState<string | null>(null);
  const [prepUrgencyMinutes, setPrepUrgencyMinutes] = useState(10);
  const [loadingCompany, setLoadingCompany] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [wsStatus, setWsStatus] = useState<"connected" | "connecting" | "disconnected">("connecting");
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);
  const [itemsModal, setItemsModal] = useState<{ order: Order; items: ItemSummary[] } | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);

  // Força re-render periódico só pro "X min" e "URGENTE" avançarem sozinhos
  // na tela — sem isso, só mudam quando algum evento de WS ou ação do
  // usuário disparasse um novo render, podendo ficar minutos desatualizados
  // numa fila parada.
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!companyId) return;
    setLoadingCompany(true);
    api.get(`/companies/${companyId}`)
      .then((r) => {
        setFulfillmentMode(r.data.fulfillment_mode ?? "por_item");
        setPrepUrgencyMinutes(r.data.prep_urgency_minutes ?? 10);
      })
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

  async function openItems(order: Order) {
    setLoadingItems(true);
    setItemsModal({ order, items: [] });
    try {
      const tickets = await listOrderTickets(order.order_ref);
      setItemsModal({ order, items: summarizeItems(tickets) });
    } catch {
      setItemsModal(null);
      showFeedback("Erro ao carregar itens do pedido.", false);
    } finally {
      setLoadingItems(false);
    }
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

  // Mesma ordem do painel público (frontend/painel/PanelScreen.tsx) — mais
  // antigo primeiro, pra equipe atender por ordem de espera real.
  const byOldestFirst = (a: Order, b: Order) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  const preparing = orders.filter((o) => o.status === "paid").sort(byOldestFirst);
  const ready = orders.filter((o) => o.status === "ready").sort(byOldestFirst);

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
            ) : preparing.map((o) => {
              const level = urgencyLevel(o.created_at, prepUrgencyMinutes);
              return (
                <div
                  key={o.order_ref}
                  className={`${styles.card} ${level === "red" ? styles.cardRed : level === "orange" ? styles.cardOrange : ""}`}
                  onClick={() => openItems(o)}
                >
                  <div className={styles.cardLabel}>{label(o)}</div>
                  <div className={styles.cardMeta}>
                    <Tag variant="neutral">{o.order_ref}</Tag>
                    <span className={level === "red" ? styles.timeRed : level === "orange" ? styles.timeOrange : styles.time}>
                      {minutesAgo(o.created_at)}
                    </span>
                    {level === "red" && <Tag variant="error">URGENTE</Tag>}
                  </div>
                  <Button
                    size="small"
                    fullWidth
                    disabled={busy === o.order_ref}
                    onClick={(e) => { e.stopPropagation(); markReady(o.order_ref); }}
                  >
                    Marcar pronto
                  </Button>
                </div>
              );
            })}
          </div>
          <div className={styles.column}>
            <div className={styles.columnTitle}>Pronto para retirada</div>
            {ready.length === 0 ? (
              <div className={styles.emptyCol}>Nenhum pedido pronto.</div>
            ) : ready.map((o) => (
              <div key={o.order_ref} className={styles.card} onClick={() => openItems(o)}>
                <div className={styles.cardLabel}>{label(o)}</div>
                <div className={styles.cardMeta}>
                  <Tag variant="success">{o.order_ref}</Tag>
                  <span className={styles.time}>{minutesAgo(o.created_at)}</span>
                </div>
                <Button
                  size="small"
                  variant="secondary"
                  fullWidth
                  disabled={busy === o.order_ref}
                  onClick={(e) => { e.stopPropagation(); markCollected(o.order_ref); }}
                >
                  Marcar coletado
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal
        open={!!itemsModal}
        width={420}
        onClose={() => setItemsModal(null)}
        onBackdropClick={() => setItemsModal(null)}
        onCloseButtonClick={() => setItemsModal(null)}
      >
        {itemsModal && (
          <div className={styles.itemsModal}>
            <div className={styles.itemsModalTitle}>{label(itemsModal.order)}</div>
            <div className={styles.itemsModalRef}>{itemsModal.order.order_ref}</div>
            {loadingItems ? (
              <div className={styles.emptyCol}>Carregando itens…</div>
            ) : itemsModal.items.length === 0 ? (
              <div className={styles.emptyCol}>Nenhum item encontrado.</div>
            ) : (
              <ul className={styles.itemsList}>
                {itemsModal.items.map((it) => (
                  <li key={it.name}>{it.qty}x {it.name}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
