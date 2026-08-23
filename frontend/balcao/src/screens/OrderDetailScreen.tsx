import { useState, useEffect } from "react";
import { Alert, Button, Modal, Tag } from "design-system";
import api from "../api";
import QrScanner from "../components/QrScanner";
import { beepSuccess, beepError } from "../components/AudioFeedback";
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

  async function collectTicket(qrData: string) {
    if (collecting) return;
    setCollecting(true);
    setScanning(false);
    setPendingTicket(null);

    // ORD-118 — QR de pedido inteiro (modelo de retirada única) começa com
    // "ORDER|" e nunca colide com o formato de ticket (que começa com o
    // ticket_code de 8 caracteres) — coleta o pedido inteiro numa
    // chamada só, em vez de ticket por ticket.
    const isOrderQr = qrData.startsWith("ORDER|");
    const isFullQr = qrData.includes("|");
    const ticketCode = isFullQr ? qrData.split("|")[0] : qrData;

    try {
      if (isOrderQr) {
        await api.post(`/orders/${orderRef}/collect`, {
          collected_by: "balcao",
          collection_device: "balcao-web",
          qr_data: qrData,
        });
      } else {
        await api.post(`/tickets/${ticketCode}/collect`, {
          collected_by: "balcao",
          collection_device: "balcao-web",
          ...(isFullQr ? { qr_data: qrData } : {}),
        });
      }
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
          <div className={styles.confirmIcon}>🎫</div>
          <div className={styles.confirmTitle}>
            {pendingIsOrderQr ? "Confirmar coleta do pedido?" : "Confirmar coleta?"}
          </div>
          <div className={styles.confirmCode}>
            {pendingTicket?.split("|")[pendingIsOrderQr ? 1 : 0]}
          </div>
          <div className={styles.confirmActions}>
            <Button variant="secondary" fullWidth onClick={() => setPendingTicket(null)}>Cancelar</Button>
            <Button fullWidth onClick={() => pendingTicket && collectTicket(pendingTicket)}>Confirmar</Button>
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
          <Button fullWidth disabled={collecting || loading} onClick={() => setScanning(true)}>
            {`📷 ${collecting ? "Coletando…" : "Ler QR Code"}`}
          </Button>
        </div>
      )}

      {loading ? (
        <div className={styles.empty}>Carregando tickets…</div>
      ) : tickets.map((t) => (
        <div key={t.ticket_code} className={`${styles.ticket} ${t.status === "collected" ? styles.ticketCollected : ""}`}>
          <div className={styles.code}>
            {t.status === "collected" ? "✅ " : "⬜ "}
            {t.ticket_code}
          </div>
          <div className={styles.units}>{t.unit_number}/{t.total_units}</div>
          <Tag variant={t.status === "collected" ? "success" : "neutral"}>
            {t.status === "collected" ? "coletado" : "pendente"}
          </Tag>
        </div>
      ))}
    </div>
  );
}
