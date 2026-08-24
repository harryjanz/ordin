import { useState, useEffect } from "react";
import { Alert, Button, Modal, Tag } from "design-system";
import api from "../api";
import QrScanner from "../components/QrScanner";
import ScanButton from "../components/ScanButton";
import { beepSuccess, beepError } from "../components/AudioFeedback";
import { collectByQr, collectManual } from "../lib/collect";
import { summarizeItems } from "../lib/orderItems";
import type { Ticket } from "../types";
import styles from "./OrderDetailScreen.module.scss";

interface Props {
  orderRef: string;
  turboMode: boolean;
  onBack: () => void;
  onAllCollected: () => void;
}

export default function OrderDetailScreen({ orderRef, turboMode, onBack, onAllCollected }: Props) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [pendingTicket, setPendingTicket] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);
  const [collecting, setCollecting] = useState(false);
  // ORD-123 — baixa manual (sem QR): fallback pra quando o código está
  // danificado/ilegível. Confirmação separada da de QR porque o aviso de
  // auditoria precisa ficar claro, não é o mesmo texto do fluxo normal.
  const [manualTarget, setManualTarget] = useState<{ kind: "order" | "ticket"; ref: string } | null>(null);

  useEffect(() => { loadTickets(); }, [orderRef]);

  async function loadTickets() {
    setLoading(true);
    try {
      const r = await api.get(`/orders/${orderRef}/tickets`);
      setTickets(r.data.tickets ?? []);
    } finally {
      setLoading(false);
    }
  }

  function showFeedback(msg: string, ok: boolean) {
    setFeedback({ msg, ok });
    setTimeout(() => setFeedback(null), 3000);
  }

  async function runCollect(isOrderQr: boolean, action: () => Promise<unknown>) {
    if (collecting) return;
    setCollecting(true);
    setScanning(false);
    setPendingTicket(null);
    setManualTarget(null);

    try {
      await action();
      beepSuccess();
      showFeedback(isOrderQr ? "Pedido coletado com sucesso!" : "Ticket coletado com sucesso!", true);
      await loadTickets();

      const updated = await api.get(`/orders/${orderRef}/tickets`);
      const list: Ticket[] = updated.data.tickets ?? [];
      const allCollected = list.every((t) => t.status === "collected");
      if (allCollected) setTimeout(onAllCollected, 1500);
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

  function collectTicket(qrData: string) {
    runCollect(qrData.startsWith("ORDER|"), () => collectByQr(qrData));
  }

  function confirmManualCollect() {
    if (!manualTarget) return;
    const { kind, ref } = manualTarget;
    runCollect(kind === "order", () => collectManual(kind, ref));
  }

  function handleScan(data: string) {
    if (turboMode) {
      collectTicket(data);
    } else {
      setPendingTicket(data);
      setScanning(false);
    }
  }

  const collected = tickets.filter((t) => t.status === "collected").length;
  const pendingIsOrderQr = pendingTicket?.startsWith("ORDER|") ?? false;
  const pendingItemName = pendingTicket && !pendingIsOrderQr ? pendingTicket.split("|")[1] : null;
  const pendingOrderItems = pendingIsOrderQr ? summarizeItems(tickets) : [];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Button size="small" variant="secondary" onClick={onBack}>← Voltar</Button>
        <div className={styles.title}>Pedido {orderRef}</div>
        <div className={styles.progress}>{collected}/{tickets.length} coletados</div>
      </div>

      {feedback && (
        <div className={styles.feedback}>
          <Alert variant={feedback.ok ? "success" : "error"} text={feedback.msg} fullWidth />
        </div>
      )}

      <Modal open={!!pendingTicket} onBackdropClick={() => setPendingTicket(null)} width={340}>
        <div className={styles.confirmModal}>
          <i className={`icon-package ${styles.confirmIcon}`} />
          <div className={styles.confirmTitle}>
            {pendingIsOrderQr ? "Confirmar coleta do pedido?" : "Confirmar coleta?"}
          </div>
          {pendingIsOrderQr ? (
            <ul className={styles.confirmItems}>
              {pendingOrderItems.map((it) => (
                <li key={it.name}>{it.qty}x {it.name}</li>
              ))}
            </ul>
          ) : (
            <div className={styles.confirmCode}>{pendingItemName}</div>
          )}
          <div className={styles.confirmActions}>
            <Button variant="secondary" fullWidth onClick={() => setPendingTicket(null)}>Cancelar</Button>
            <Button fullWidth onClick={() => pendingTicket && collectTicket(pendingTicket)}>Confirmar</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!manualTarget} onBackdropClick={() => setManualTarget(null)} width={340}>
        <div className={styles.confirmModal}>
          <i className={`icon-alert-triangle ${styles.confirmIconWarning}`} />
          <div className={styles.confirmTitle}>Confirmar baixa manual?</div>
          <div className={styles.confirmCode}>
            {manualTarget?.kind === "order"
              ? `Pedido ${orderRef} inteiro`
              : (tickets.find((t) => t.ticket_code === manualTarget?.ref)?.qr_data.split("|")[1] ?? manualTarget?.ref)}
          </div>
          <div className={styles.manualWarning}>
            Isso não usa o QR Code e fica registrado para auditoria.
          </div>
          <div className={styles.confirmActions}>
            <Button variant="secondary" fullWidth onClick={() => setManualTarget(null)}>Cancelar</Button>
            <Button fullWidth onClick={confirmManualCollect}>Confirmar</Button>
          </div>
        </div>
      </Modal>

      {scanning ? (
        <div className={styles.scannerBlock}>
          <QrScanner onScan={handleScan} active={scanning} />
          <Button variant="secondary" fullWidth onClick={() => setScanning(false)}>Fechar câmera</Button>
        </div>
      ) : (
        <div className={styles.scanBtnRow}>
          <ScanButton
            label={collecting ? "Coletando…" : "Ler QR Code"}
            disabled={collecting || loading}
            onClick={() => setScanning(true)}
          />
          <Button
            variant="secondary"
            fullWidth
            disabled={collecting || loading || tickets.length === 0}
            onClick={() => setManualTarget({ kind: "order", ref: orderRef })}
          >
            Baixa manual do pedido
          </Button>
        </div>
      )}

      {loading ? (
        <div className={styles.empty}>Carregando tickets…</div>
      ) : tickets.map((t) => {
        const productName = t.qr_data.split("|")[1] ?? t.ticket_code;
        return (
          <div key={t.ticket_code} className={`${styles.ticket} ${t.status === "collected" ? styles.ticketCollected : ""}`}>
            <div className={styles.code}>
              <i className={t.status === "collected" ? "icon-check-circle" : "icon-clock"} />
              <div>
                <div className={styles.itemName}>{productName}</div>
                <div className={styles.itemMeta}>{t.ticket_code} · {t.unit_number}/{t.total_units}</div>
              </div>
            </div>
            {t.status !== "collected" && (
              <button
                type="button"
                className={styles.manualAction}
                aria-label="Baixa manual deste ticket"
                disabled={collecting}
                onClick={() => setManualTarget({ kind: "ticket", ref: t.ticket_code })}
              >
                <i className="icon-alert-triangle" />
              </button>
            )}
            <Tag variant={t.status === "collected" ? "success" : "neutral"}>
              {t.status === "collected" ? "coletado" : "pendente"}
            </Tag>
          </div>
        );
      })}
    </div>
  );
}
