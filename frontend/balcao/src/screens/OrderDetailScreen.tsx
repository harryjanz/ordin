import { useState, useEffect } from "react";
import api from "../api";
import QrScanner from "../components/QrScanner";
import { beepSuccess, beepError } from "../components/AudioFeedback";
import type { Ticket } from "../types";

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

    try {
      const ticketCode = qrData.split("|")[0];
      await api.post(`/tickets/${ticketCode}/collect`, {
        collected_by: "balcao",
        collection_device: "balcao-web",
        qr_data: qrData,
      });
      beepSuccess();
      showFeedback("Ticket coletado com sucesso!", true);
      await loadTickets();

      const updated = await api.get(`/orders/${orderRef}/tickets`);
      const list: Ticket[] = updated.data.tickets ?? [];
      const allCollected = list.every((t) => t.status === "collected");
      if (allCollected) setTimeout(onAllCollected, 1500);
    } catch (err: unknown) {
      beepError();
      let msg = "Erro ao coletar ticket.";
      if ((err as { response?: { status: number } }).response?.status === 409) {
        msg = "Ticket já foi coletado.";
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

  const S = {
    container: { minHeight: "100vh", background: "#0e0b1a", padding: 20 } as React.CSSProperties,
    header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 20 } as React.CSSProperties,
    backBtn: {
      padding: "6px 14px",
      background: "rgba(153,0,255,0.1)",
      border: "1px solid rgba(153,0,255,0.25)",
      borderRadius: 8,
      color: "#DFE8ED",
      cursor: "pointer",
      fontSize: 14,
    } as React.CSSProperties,
    title: { fontSize: 18, fontWeight: 700, color: "#DFE8ED" } as React.CSSProperties,
    progress: { fontSize: 13, color: "#33cccc", marginLeft: "auto", fontWeight: 600 } as React.CSSProperties,
    ticket: (status: string) => ({
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "12px 16px",
      background: "#1d1434",
      border: `1px solid ${status === "collected" ? "rgba(51,204,204,0.3)" : "rgba(153,0,255,0.15)"}`,
      borderRadius: 10,
      marginBottom: 8,
      opacity: status === "collected" ? 0.6 : 1,
    } as React.CSSProperties),
    code: {
      fontFamily: "monospace",
      fontSize: 14,
      fontWeight: 700,
      color: "#DFE8ED",
      flex: 1,
    } as React.CSSProperties,
    badge: (ok: boolean) => ({
      padding: "3px 10px",
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 600,
      background: ok ? "rgba(51,204,204,0.15)" : "rgba(153,0,255,0.12)",
      color: ok ? "#33cccc" : "rgba(223,232,237,0.5)",
    } as React.CSSProperties),
  };

  return (
    <div style={S.container}>
      <div style={S.header}>
        <button style={S.backBtn} onClick={onBack}>← Voltar</button>
        <div style={S.title}>Pedido {orderRef}</div>
        <div style={S.progress}>{collected}/{tickets.length} coletados</div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div style={{
          padding: "10px 16px",
          borderRadius: 8,
          marginBottom: 16,
          background: feedback.ok ? "rgba(51,204,204,0.12)" : "rgba(255,77,109,0.12)",
          border: `1px solid ${feedback.ok ? "rgba(51,204,204,0.3)" : "rgba(255,77,109,0.3)"}`,
          color: feedback.ok ? "#33cccc" : "#ff4d6d",
          fontSize: 14,
          fontWeight: 600,
        }}>
          {feedback.ok ? "✅" : "❌"} {feedback.msg}
        </div>
      )}

      {/* Modal confirmação (modo normal) */}
      {pendingTicket && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#1d1434",
            border: "1px solid rgba(153,0,255,0.3)",
            borderRadius: 16,
            padding: "32px 40px",
            textAlign: "center",
            maxWidth: 340,
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🎫</div>
            <div style={{ color: "#DFE8ED", fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
              Confirmar coleta?
            </div>
            <div style={{ fontFamily: "monospace", color: "#9900ff", fontSize: 13, marginBottom: 24, wordBreak: "break-all" }}>
              {pendingTicket.split("|")[0]}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setPendingTicket(null)}
                style={{ flex: 1, padding: "10px", background: "rgba(153,0,255,0.1)", border: "1px solid rgba(153,0,255,0.2)", borderRadius: 8, color: "#DFE8ED", cursor: "pointer", fontSize: 14 }}
              >
                Cancelar
              </button>
              <button
                onClick={() => collectTicket(pendingTicket)}
                style={{ flex: 1, padding: "10px", background: "#9900ff", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700, boxShadow: "0 4px 20px rgba(153,0,255,0.35)" }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scanner */}
      {scanning ? (
        <div style={{ marginBottom: 16 }}>
          <QrScanner onScan={handleScan} active={scanning} />
          <button
            onClick={() => setScanning(false)}
            style={{ width: "100%", marginTop: 8, padding: "8px", background: "transparent", border: "1px solid rgba(153,0,255,0.25)", borderRadius: 8, color: "rgba(223,232,237,0.5)", cursor: "pointer" }}
          >
            Fechar câmera
          </button>
        </div>
      ) : (
        <button
          onClick={() => setScanning(true)}
          disabled={collecting || loading}
          style={{
            width: "100%",
            padding: "14px",
            background: "#9900ff",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
            marginBottom: 16,
            boxShadow: "0 4px 20px rgba(153,0,255,0.35)",
          }}
        >
          📷 {collecting ? "Coletando…" : "Ler QR Code"}
        </button>
      )}

      {/* Lista de tickets */}
      {loading ? (
        <div style={{ color: "rgba(223,232,237,0.4)", fontSize: 14, textAlign: "center", padding: 24 }}>
          Carregando tickets…
        </div>
      ) : tickets.map((t) => (
        <div key={t.ticket_code} style={S.ticket(t.status)}>
          <div style={S.code}>
            {t.status === "collected" ? "✅ " : "⬜ "}
            {t.ticket_code}
          </div>
          <div style={{ color: "rgba(223,232,237,0.4)", fontSize: 12 }}>
            {t.unit_number}/{t.total_units}
          </div>
          <div style={S.badge(t.status === "collected")}>
            {t.status === "collected" ? "coletado" : "pendente"}
          </div>
        </div>
      ))}
    </div>
  );
}
