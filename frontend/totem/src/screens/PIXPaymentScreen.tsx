import { useState, useEffect, useRef } from "react";
import api from "../api";
import type { Theme } from "../themes";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const FONT_D = "'Lexend', sans-serif";
const FONT_B = "'Inter', sans-serif";
const PIX_TTL = 600; // 10 minutos

interface Props {
  T: Theme;
  transactionId: number;
  qrCodeBase64: string;
  amount: number;
  orderRef: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function PIXPaymentScreen({
  T, transactionId, qrCodeBase64, amount, orderRef, onSuccess, onCancel,
}: Props) {
  const [secondsLeft, setSecondsLeft] = useState(PIX_TTL);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const doneRef = useRef(false);

  async function cancelPayment() {
    if (doneRef.current) return;
    doneRef.current = true;
    await api.delete(`/payments/${transactionId}`).catch(() => null);
    onCancel();
  }

  // Countdown
  useEffect(() => {
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          setTimedOut(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Timeout expirou → cancela e volta
  useEffect(() => {
    if (!timedOut) return;
    cancelPayment();
  }, [timedOut]);

  // Polling a cada 5s
  useEffect(() => {
    const t = setInterval(async () => {
      if (doneRef.current) { clearInterval(t); return; }
      try {
        const r = await api.get(`/payments/${transactionId}/status`);
        const { status } = r.data;
        if (status === "approved") {
          if (doneRef.current) return;
          doneRef.current = true;
          clearInterval(t);
          // Busca tickets do pedido aprovado
          onSuccess();
        } else if (status === "expired" || status === "cancelled") {
          clearInterval(t);
          if (!doneRef.current) { doneRef.current = true; onCancel(); }
        }
      } catch { /* silencioso — tenta no próximo ciclo */ }
    }, 5000);
    return () => clearInterval(t);
  }, [transactionId]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const urgente = secondsLeft <= 60;

  return (
    <div style={{
      minHeight: "100vh",
      background: T.radial,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 20,
      padding: "32px 16px",
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 6 }}>⚡</div>
        <h2 style={{ color: T.text, fontFamily: FONT_D, fontSize: 24, fontWeight: 800, margin: 0 }}>
          Pague com PIX
        </h2>
        <p style={{ color: T.priceColor, fontFamily: FONT_D, fontSize: 26, fontWeight: 800, marginTop: 4, marginBottom: 0 }}>
          {fmt(amount)}
        </p>
      </div>

      {/* QR Code */}
      <div style={{
        background: "#fff",
        borderRadius: 16,
        padding: 16,
        boxShadow: T.cardShadow,
      }}>
        {qrCodeBase64 ? (
          <img
            src={`data:image/png;base64,${qrCodeBase64}`}
            alt="QR Code PIX"
            width={260}
            height={260}
            style={{ display: "block" }}
          />
        ) : (
          <div style={{
            width: 260, height: 260,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#999", fontSize: 13,
          }}>
            QR indisponível
          </div>
        )}
      </div>

      <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: 14, margin: 0, textAlign: "center" }}>
        Aponte a câmera do seu celular para o QR Code
      </p>

      {/* Status + countdown */}
      <div style={{ textAlign: "center" }}>
        <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: 14, margin: "0 0 6px" }}>
          Aguardando pagamento…
        </p>
        <div style={{
          fontFamily: FONT_D,
          fontSize: 28,
          fontWeight: 800,
          color: urgente ? T.errorText : T.text,
          letterSpacing: 2,
        }}>
          ⏳ {mm}:{ss}
        </div>
        {urgente && (
          <p style={{ color: T.errorText, fontFamily: FONT_B, fontSize: 13, marginTop: 4 }}>
            Tempo quase esgotado!
          </p>
        )}
      </div>

      {/* Cancelar */}
      {!cancelConfirm ? (
        <button
          onClick={() => setCancelConfirm(true)}
          style={{
            padding: "0 28px",
            minHeight: 52,
            background: "transparent",
            border: `1px solid ${T.borderNeutral}`,
            borderRadius: 999,
            color: T.muted,
            fontFamily: FONT_D,
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Cancelar pagamento
        </button>
      ) : (
        <div style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 14,
          padding: "16px 24px",
          textAlign: "center",
        }}>
          <p style={{ color: T.text, fontFamily: FONT_B, fontSize: 15, marginBottom: 14 }}>
            Deseja cancelar o pagamento?
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button
              onClick={() => setCancelConfirm(false)}
              style={{
                padding: "0 24px",
                minHeight: 48,
                background: T.surface,
                border: `1px solid ${T.borderNeutral}`,
                borderRadius: 999,
                color: T.muted,
                fontFamily: FONT_D,
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Não, continuar
            </button>
            <button
              onClick={cancelPayment}
              style={{
                padding: "0 24px",
                minHeight: 48,
                background: T.errorBg ?? "rgba(255,77,109,0.12)",
                border: "none",
                borderRadius: 999,
                color: T.errorText,
                fontFamily: FONT_D,
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Sim, cancelar
            </button>
          </div>
        </div>
      )}

      <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: 11, opacity: 0.4, textAlign: "center", margin: 0 }}>
        Pedido: {orderRef}
      </p>
    </div>
  );
}
