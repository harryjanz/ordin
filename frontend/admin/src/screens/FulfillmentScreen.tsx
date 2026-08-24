import { useState, useEffect, useCallback, useRef } from "react";
import { Alert, Button, Modal, Tag } from "design-system";
import api from "../api";
import { useStore } from "../store";
import { listOrders, listOrderTickets, getPrepStats } from "../api/orders";
import { WsManager } from "../ws";
import type { Order, PrepStats, Ticket, WsEvent } from "../types";
import styles from "./FulfillmentScreen.module.scss";

// Melhorias de UX 2026-08-24 — mesmo badge visual do Dashboard
// (icon-trending-up/down + percentual), mas com semântica de cor invertida:
// aqui preparo mais RÁPIDO (queda) é a notícia boa, ao contrário de
// receita/volume no Dashboard, onde crescer é sempre bom.
function PrepTrendTag({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const increased = pct >= 0;
  const good = pct <= 0;
  return (
    <span className={`${styles.trendBadge} ${good ? styles.trendGood : styles.trendBad}`}>
      <i className={`icon-trending-${increased ? "up" : "down"}`} />
      {Math.abs(pct)}%
    </span>
  );
}

type DragSource = "preparing" | "ready";

interface DragState {
  ref: string;
  label: string;
  source: DragSource;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
}

const DRAG_THRESHOLD = 6;
// Melhorias de UX 2026-08-24 — quanto tempo um card fica visível na coluna
// "Coletado" antes de sumir sozinho (pedido direto do usuário).
const COLLECTED_VISIBLE_MS = 60_000;

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
  const [prepStats, setPrepStats] = useState<PrepStats | null>(null);

  // Melhorias de UX 2026-08-24 — arrastar card de "Em preparo" pra "Pronto
  // para retirada" marca pronto, e de "Pronto para retirada" pra "Coletado"
  // marca coletado. Pointer Events (não HTML5 Drag and Drop, que tem
  // suporte ruim a touch) — mesmo evento cobre mouse (laptop) e toque
  // (tablet).
  const [drag, setDrag] = useState<DragState | null>(null);
  const [overTarget, setOverTarget] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const readyColRef = useRef<HTMLDivElement>(null);
  const collectedColRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  const ordersRef = useRef<Order[]>([]);
  useEffect(() => { ordersRef.current = orders; }, [orders]);

  // Coluna "Coletado" — buffer local (não vem do backend) de pedidos
  // marcados como coletados nos últimos 60s, só pra dar feedback visual
  // antes de sumir sozinho da tela (pedido direto do usuário).
  const [collectedRecently, setCollectedRecently] = useState<{ order: Order; collectedAt: number }[]>([]);
  const collectTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => {
    setCollectedRecently([]);
    return () => {
      collectTimers.current.forEach(clearTimeout);
      collectTimers.current.clear();
    };
  }, [companyId]);

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

  // ORD-119 (item 3, análise de concorrentes 2026-08-24) — tempo médio de
  // preparo/gargalo das últimas 24h. Recarrega quando um pedido novo fica
  // pronto (é o único evento que muda o cálculo).
  const loadPrepStats = useCallback(() => {
    if (!companyId) return;
    getPrepStats(companyId).then(setPrepStats).catch(() => null);
  }, [companyId]);

  useEffect(() => { loadPrepStats(); }, [loadPrepStats]);

  const handleWsEvent = useCallback((event: WsEvent) => {
    // Mesmo racional do painel público — order.paid não carrega pickup_name
    // no evento, recarrega via REST pra não mostrar dado incompleto.
    if (event.event === "order.paid" || event.event === "order.ready") {
      loadOrders();
    }
    if (event.event === "order.ready") {
      loadPrepStats();
    }
    if (event.event === "order.completed" && event.order_ref) {
      const found = ordersRef.current.find((o) => o.order_ref === event.order_ref);
      if (found) collectOrderLocally(found);
    }
  }, [loadOrders, loadPrepStats]);

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

  // Adiciona o pedido na coluna "Coletado" por um tempo limitado, depois
  // some sozinho — chamado tanto pela ação local (botão/drag) quanto por
  // um evento de WS de outro operador coletando o mesmo pedido.
  function collectOrderLocally(o: Order) {
    setCollectedRecently((prev) => {
      if (prev.some((c) => c.order.order_ref === o.order_ref)) return prev;
      return [{ order: o, collectedAt: Date.now() }, ...prev];
    });
    setOrders((prev) => prev.filter((x) => x.order_ref !== o.order_ref));
    const existing = collectTimers.current.get(o.order_ref);
    if (existing) clearTimeout(existing);
    collectTimers.current.set(o.order_ref, setTimeout(() => {
      setCollectedRecently((prev) => prev.filter((c) => c.order.order_ref !== o.order_ref));
      collectTimers.current.delete(o.order_ref);
    }, COLLECTED_VISIBLE_MS));
  }

  async function markCollected(o: Order) {
    setBusy(o.order_ref);
    try {
      await api.post(`/orders/${o.order_ref}/collect`, {});
      showFeedback("Pedido marcado como coletado.", true);
      collectOrderLocally(o);
    } catch {
      showFeedback("Erro ao marcar coletado.", false);
    } finally {
      setBusy(null);
    }
  }

  function startDrag(e: React.PointerEvent<HTMLDivElement>, order: Order, source: DragSource) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (busy === order.order_ref) return;
    const targetColRef = source === "preparing" ? readyColRef : collectedColRef;
    const startX = e.clientX;
    const startY = e.clientY;
    const initial: DragState = { ref: order.order_ref, label: label(order), source, startX, startY, x: startX, y: startY, moved: false };
    dragRef.current = initial;

    function pointInTargetCol(x: number, y: number) {
      const box = targetColRef.current?.getBoundingClientRect();
      return !!box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    }

    function onMove(ev: PointerEvent) {
      const prev = dragRef.current;
      if (!prev) return;
      const moved = prev.moved || Math.hypot(ev.clientX - prev.startX, ev.clientY - prev.startY) > DRAG_THRESHOLD;
      const next: DragState = { ...prev, x: ev.clientX, y: ev.clientY, moved };
      dragRef.current = next;
      setDrag(next);
      if (moved) {
        ev.preventDefault();
        setOverTarget(pointInTargetCol(ev.clientX, ev.clientY));
      }
    }

    function cleanup() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    }

    function onUp(ev: PointerEvent) {
      cleanup();
      const final = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      setOverTarget(false);
      if (final?.moved) {
        suppressClickRef.current = true;
        if (pointInTargetCol(ev.clientX, ev.clientY)) {
          if (source === "preparing") markReady(order.order_ref);
          else markCollected(order);
        }
      }
    }

    function onCancel() {
      cleanup();
      dragRef.current = null;
      setDrag(null);
      setOverTarget(false);
    }

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  function handleCardClick(o: Order) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    openItems(o);
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

      {prepStats && prepStats.count > 0 && (
        <div className={styles.statsBar}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Tempo médio de preparo (24h)</div>
            <div className={styles.statValue}>{prepStats.avg_prep_minutes} min</div>
            <div className={styles.trendRow}>
              <PrepTrendTag pct={prepStats.change_pct} />
              {prepStats.change_pct !== null && <span className={styles.muted}>período anterior</span>}
            </div>
            <div className={styles.statSub}>{prepStats.count} pedido{prepStats.count === 1 ? "" : "s"}</div>
          </div>
          {prepStats.by_hour.length > 0 && (
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Horário de maior movimento</div>
              {(() => {
                const peak = [...prepStats.by_hour].sort((a, b) => b.count - a.count)[0];
                const prev = prepStats.peak_hour_prev;
                return (
                  <>
                    <div className={styles.statValue}>{String(peak.hour).padStart(2, "0")}h</div>
                    <div className={styles.statSub}>{peak.count} pedido{peak.count === 1 ? "" : "s"} · média {peak.avg_minutes} min</div>
                    {prev && (
                      <div className={styles.statSubFaint}>
                        período anterior: {String(prev.hour).padStart(2, "0")}h · {prev.count} pedido{prev.count === 1 ? "" : "s"}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

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
            <div className={styles.columnTitle}>
              Em preparo
              {preparing.length > 0 && <span className={styles.columnCount}>{preparing.length}</span>}
            </div>
            {preparing.length === 0 ? (
              <div className={styles.emptyCol}>Nenhum pedido em preparo.</div>
            ) : (
              <div className={styles.cardGrid}>
                {preparing.map((o) => {
                  const level = urgencyLevel(o.created_at, prepUrgencyMinutes);
                  const isDragging = drag?.ref === o.order_ref && drag.moved;
                  return (
                    <div
                      key={o.order_ref}
                      className={[
                        styles.card,
                        styles.draggable,
                        level === "red" ? styles.cardRed : level === "orange" ? styles.cardOrange : "",
                        isDragging ? styles.cardDragging : "",
                      ].filter(Boolean).join(" ")}
                      onClick={() => handleCardClick(o)}
                      onPointerDown={(e) => startDrag(e, o, "preparing")}
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
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); markReady(o.order_ref); }}
                      >
                        Marcar pronto
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div ref={readyColRef} className={`${styles.column} ${drag?.source === "preparing" && overTarget ? styles.columnDropActive : ""}`}>
            <div className={styles.columnTitle}>
              Pronto para retirada
              {ready.length > 0 && <span className={styles.columnCount}>{ready.length}</span>}
            </div>
            {drag?.source === "preparing" && (
              <div className={`${styles.dropHint} ${overTarget ? styles.dropHintActive : ""}`}>
                Solte aqui para marcar pronto
              </div>
            )}
            {ready.length === 0 ? (
              <div className={styles.emptyCol}>Nenhum pedido pronto.</div>
            ) : (
              <div className={styles.cardGrid}>
                {ready.map((o) => {
                  const isDragging = drag?.ref === o.order_ref && drag.moved;
                  return (
                    <div
                      key={o.order_ref}
                      className={`${styles.card} ${styles.draggable} ${isDragging ? styles.cardDragging : ""}`}
                      onClick={() => handleCardClick(o)}
                      onPointerDown={(e) => startDrag(e, o, "ready")}
                    >
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
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); markCollected(o); }}
                      >
                        Marcar coletado
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div ref={collectedColRef} className={`${styles.column} ${drag?.source === "ready" && overTarget ? styles.columnDropActive : ""}`}>
            <div className={styles.columnTitle}>
              Coletado
              {collectedRecently.length > 0 && <span className={styles.columnCount}>{collectedRecently.length}</span>}
            </div>
            {drag?.source === "ready" && (
              <div className={`${styles.dropHint} ${overTarget ? styles.dropHintActive : ""}`}>
                Solte aqui para marcar coletado
              </div>
            )}
            {collectedRecently.length === 0 ? (
              <div className={styles.emptyCol}>Nenhum pedido coletado recentemente.</div>
            ) : (
              <div className={styles.cardGrid}>
                {collectedRecently.map(({ order: o }) => (
                  <div key={o.order_ref} className={`${styles.card} ${styles.cardCollected}`} onClick={() => handleCardClick(o)}>
                    <div className={styles.cardLabel}>{label(o)}</div>
                    <div className={styles.cardMeta}>
                      <Tag variant="success">{o.order_ref}</Tag>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {drag?.moved && (
        <div className={styles.dragGhost} style={{ left: drag.x, top: drag.y }}>
          {drag.label}
        </div>
      )}

      <Modal
        open={!!itemsModal}
        width={560}
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
                  <li key={it.name}>
                    <span className={styles.itemQty}>{it.qty}x</span>
                    <span className={styles.itemName}>{it.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
