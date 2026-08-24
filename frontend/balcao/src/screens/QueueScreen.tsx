import { useState, useEffect, useCallback } from "react";
import { Alert, Button, InputBase, Modal, Tag } from "design-system";
import api from "../api";
import { useStore } from "../store";
import { WsManager } from "../ws";
import OrderDetailScreen from "./OrderDetailScreen";
import HeaderMenu from "../components/HeaderMenu";
import ScanButton from "../components/ScanButton";
import QrScanner from "../components/QrScanner";
import { OrdinSymbol } from "../assets/OrdinSymbol";
import { beepSuccess, beepError } from "../components/AudioFeedback";
import { collectByQr } from "../lib/collect";
import { fetchOrderItems, type OrderItemSummary } from "../lib/orderItems";
import type { WsEvent } from "../types";
import styles from "./QueueScreen.module.scss";

// ORD-122 — fila carrega só as últimas 24h por padrão (operação de balcão
// não precisa do histórico inteiro); busca por referência ignora essa
// janela de propósito, pra achar pedido de qualquer data.
const QUEUE_WINDOW_MS = 24 * 60 * 60 * 1000;
function windowStartIso() {
  return new Date(Date.now() - QUEUE_WINDOW_MS).toISOString();
}

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
  connected: "ao vivo",
  connecting: "reconectando…",
  disconnected: "offline",
};

export default function QueueScreen() {
  const {
    companyId, turboMode, orders,
    setOrders, upsertOrder, removeOrder, updateOrderProgress, logout,
  } = useStore();

  const [wsStatus, setWsStatus] = useState<"connected" | "connecting" | "disconnected">("connecting");
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Scan genérico (pedido do usuário, 2026-08-24): ler o QR direto da fila,
  // sem precisar entrar no detalhe do pedido antes. QR de pedido (único)
  // baixa tudo de uma vez; QR de item baixa só aquela unidade — os dois
  // resolvem sozinhos a partir do próprio QR (ver lib/collect.ts).
  const [scanning, setScanning] = useState(false);
  const [pendingQr, setPendingQr] = useState<string | null>(null);
  const [pendingOrderItems, setPendingOrderItems] = useState<OrderItemSummary[]>([]);
  const [collecting, setCollecting] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);

  // Sem busca: só as últimas 24h. Com busca: qualquer data, filtrado por
  // referência no servidor (order_ref já é LIKE %...% no backend).
  const loadQueue = useCallback((term: string) => {
    setLoading(true);
    const params: Record<string, string | number> = { status: "paid", limit: 50 };
    if (term.trim()) params.order_ref = term.trim();
    else params.date_from = windowStartIso();
    api.get("/orders", { params })
      .then((r) => setOrders(r.data.orders ?? []))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  // Carrega fila inicial
  useEffect(() => { loadQueue(""); }, []);

  // Busca com debounce — não bate no servidor a cada tecla.
  useEffect(() => {
    const t = setTimeout(() => loadQueue(search), 350);
    return () => clearTimeout(t);
  }, [search]);

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
      loadQueue(search);
    }
    if (event.event === "ticket.collected" && event.order_ref && event.progress) {
      const [col, total] = event.progress.split("/").map(Number);
      updateOrderProgress(event.order_ref, col, total);
    }
    if (event.event === "order.completed" && event.order_ref) {
      removeOrder(event.order_ref);
    }
  }, [search]);

  // Busca a lista de itens do pedido pra exibir na confirmação de coleta
  // via QR de pedido inteiro — informação operacional (o que está sendo
  // entregue), não só a referência.
  useEffect(() => {
    if (!pendingQr?.startsWith("ORDER|")) { setPendingOrderItems([]); return; }
    const orderRef = pendingQr.split("|")[1];
    fetchOrderItems(orderRef).then(setPendingOrderItems).catch(() => setPendingOrderItems([]));
  }, [pendingQr]);

  async function handleLogout() {
    const { refreshToken } = useStore.getState();
    try { if (refreshToken) await api.post("/auth/logout", { refresh_token: refreshToken }); } catch { /* best-effort */ }
    logout();
  }

  function showFeedback(msg: string, ok: boolean) {
    setFeedback({ msg, ok });
    setTimeout(() => setFeedback(null), 3000);
  }

  async function collectGlobal(qrData: string) {
    if (collecting) return;
    setCollecting(true);
    setScanning(false);
    setPendingQr(null);

    const isOrderQr = qrData.startsWith("ORDER|");

    try {
      const { orderRef } = await collectByQr(qrData);
      beepSuccess();
      showFeedback(isOrderQr ? "Pedido coletado com sucesso!" : "Ticket coletado com sucesso!", true);

      if (isOrderQr) {
        // QR de pedido sempre baixa tudo de uma vez — some da fila direto.
        removeOrder(orderRef);
      } else {
        // QR de item — pode não ser o último do pedido, confere o progresso real.
        const updated = await api.get(`/orders/${orderRef}/tickets`);
        const list: { status: string }[] = updated.data.tickets ?? [];
        const col = list.filter((t) => t.status === "collected").length;
        if (col === list.length) removeOrder(orderRef);
        else updateOrderProgress(orderRef, col, list.length);
      }
    } catch (err: unknown) {
      beepError();
      let msg = isOrderQr ? "Erro ao coletar pedido." : "Erro ao coletar ticket.";
      if ((err as { response?: { status: number } }).response?.status === 409) {
        msg = isOrderQr ? "Pedido já foi coletado." : "Ticket já foi coletado.";
      } else if ((err as { response?: { status: number } }).response?.status === 400) {
        msg = "QR inválido ou de outro sistema.";
      }
      showFeedback(msg, false);
    } finally {
      setCollecting(false);
    }
  }

  function handleGlobalScan(data: string) {
    if (turboMode) {
      collectGlobal(data);
    } else {
      setPendingQr(data);
      setScanning(false);
    }
  }

  // A filtragem por referência já acontece no servidor (loadQueue) — aqui só
  // ordena o que já veio filtrado/dentro da janela de 24h.
  const filtered = orders
    .filter((o) => o.status === "paid")
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
          <span className={styles.wsDot} />
          {WS_LABEL[wsStatus]}
        </div>
        <HeaderMenu onLogout={handleLogout} />
      </div>

      <div className={styles.body}>
        {feedback && (
          <div className={styles.feedback}>
            <Alert variant={feedback.ok ? "success" : "error"} text={feedback.msg} fullWidth />
          </div>
        )}

        <Modal open={!!pendingQr} onBackdropClick={() => setPendingQr(null)} width={340}>
          <div className={styles.confirmModal}>
            <i className="icon-package" />
            <div className={styles.confirmTitle}>
              {pendingQr?.startsWith("ORDER|") ? "Confirmar coleta do pedido?" : "Confirmar coleta?"}
            </div>
            {pendingQr?.startsWith("ORDER|") ? (
              <ul className={styles.confirmItems}>
                {pendingOrderItems.map((it) => (
                  <li key={it.name}>{it.qty}x {it.name}</li>
                ))}
              </ul>
            ) : (
              <div className={styles.confirmCode}>{pendingQr?.split("|")[1]}</div>
            )}
            <div className={styles.confirmActions}>
              <Button variant="secondary" fullWidth onClick={() => setPendingQr(null)}>Cancelar</Button>
              <Button fullWidth onClick={() => pendingQr && collectGlobal(pendingQr)}>Confirmar</Button>
            </div>
          </div>
        </Modal>

        {scanning ? (
          <div className={styles.scannerBlock}>
            <QrScanner onScan={handleGlobalScan} active={scanning} />
            <Button variant="secondary" fullWidth onClick={() => setScanning(false)}>Fechar câmera</Button>
          </div>
        ) : (
          <div className={styles.scanBtnRow}>
            <ScanButton
              label={collecting ? "Coletando…" : "Ler QR Code"}
              disabled={collecting}
              onClick={() => setScanning(true)}
            />
          </div>
        )}

        <div className={styles.search}>
          <InputBase
            aria-label="Buscar por referência"
            placeholder="Buscar por referência…"
            icon="search"
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
