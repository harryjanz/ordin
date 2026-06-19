import { useState, useEffect } from "react";
import api from "../api";
import type { Theme } from "../themes";
import type { CartItem, CompletedOrder } from "../types";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const FONT_D = "'Lexend', sans-serif";
const FONT_B = "'Inter', sans-serif";

const METHODS = [
  { id: "credit", label: "Crédito",  emoji: "💳", desc: "À vista ou parcelado" },
  { id: "debit",  label: "Débito",   emoji: "🏦", desc: "Débito em conta" },
  { id: "pix",    label: "PIX",      emoji: "⚡", desc: "Transferência instantânea" },
] as const;

interface PixData {
  transactionId: number;
  qrCode: string;
  qrCodeBase64: string;
}

interface Props {
  T: Theme;
  cart: CartItem[];
  total: number;
  cpf: string | null;
  orderRef: string;
  onSuccess: (order: CompletedOrder) => void;
  onRefused: (method: string) => void;
  onPix: (data: PixData) => void;
  onBack: () => void;
}

export default function PaymentScreen({ T, cart, total, cpf, orderRef, onSuccess, onRefused, onPix, onBack }: Props) {
  const [method, setMethod] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [countdown, setCountdown] = useState(90);
  const [error, setError] = useState("");
  const [idleCountdown, setIdleCountdown] = useState(60);

  // Volta para o catálogo se o cliente ficar 60s sem selecionar método
  useEffect(() => {
    if (processing) return;
    setIdleCountdown(60);
    const t = setInterval(() => {
      setIdleCountdown((c) => {
        if (c <= 1) { clearInterval(t); onBack(); }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [processing]);

  async function pay() {
    if (!method) return;
    setProcessing(true);
    setError("");
    setCountdown(90);

    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);

    try {
      const body = {
        order_ref: orderRef,
        method,
        amount: total,
        items: cart.map((i) => ({ product_id: i.id, name: i.name, qty: i.qty, unit_price: i.price })),
        cpf: cpf || null,
      };
      const res = await api.post("/payments", body);
      clearInterval(timer);
      const { status, nsu, transaction_id, qr_code, qr_code_base64 } = res.data;

      if (status === "approved") {
        const ticketsRes = await api.get(`/orders/${orderRef}/tickets`);
        onSuccess({
          order_ref: orderRef,
          total,
          method,
          nsu: nsu ?? null,
          tickets: ticketsRes.data.tickets ?? [],
        });
      } else if (status === "processing" && method === "pix") {
        onPix({ transactionId: transaction_id, qrCode: qr_code ?? "", qrCodeBase64: qr_code_base64 ?? "" });
      } else {
        onRefused(method ?? "");
      }
    } catch {
      clearInterval(timer);
      setError("Erro ao processar pagamento. Tente novamente.");
      setProcessing(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: T.radial,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 28,
      transition: "background 0.3s",
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 44, marginBottom: 8 }}>💰</div>
        <h2 style={{ color: T.text, fontFamily: FONT_D, fontSize: 26, fontWeight: 800, margin: 0 }}>
          Forma de pagamento
        </h2>
        <p style={{ color: T.priceColor, fontFamily: FONT_D, fontSize: 28, fontWeight: 800, marginTop: 8 }}>
          {fmt(total)}
        </p>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        {METHODS.map((m) => (
          <button
            key={m.id}
            onClick={() => !processing && setMethod(m.id)}
            style={{
              padding: "0 28px",
              minHeight: 110,
              minWidth: 150,
              background: method === m.id ? T.btn : T.surface,
              border: `2px solid ${method === m.id ? T.btn : T.borderNeutral}`,
              borderRadius: 18,
              color: method === m.id ? T.btnText : T.text,
              cursor: processing ? "default" : "pointer",
              textAlign: "center",
              transition: "all 0.15s",
              boxShadow: method === m.id ? T.glow : T.cardShadow,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 40 }}>{m.emoji}</div>
            <div style={{ fontFamily: FONT_D, fontWeight: 800, fontSize: 17 }}>{m.label}</div>
            <div style={{ fontFamily: FONT_B, color: method === m.id ? "rgba(255,255,255,0.6)" : T.muted, fontSize: 13 }}>
              {m.desc}
            </div>
          </button>
        ))}
      </div>

      {error && (
        <div style={{ color: T.errorText, background: T.errorBg, borderRadius: 8, padding: "10px 16px", fontSize: 14, fontFamily: FONT_B }}>
          {error}
        </div>
      )}

      {processing ? (
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 56, height: 56,
            border: `4px solid ${T.borderNeutral}`,
            borderTop: `4px solid ${T.roxo}`,
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 16px",
          }} />
          <p style={{ color: T.muted, fontFamily: FONT_B, marginBottom: 6 }}>Processando pagamento…</p>
          <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: 13, opacity: 0.6 }}>
            Aguarde a confirmação no terminal TEF ({countdown}s)
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 14 }}>
          <button
            onClick={onBack}
            style={{
              padding: "0 28px",
              minHeight: 64,
              background: T.surface,
              border: `1px solid ${T.borderNeutral}`,
              borderRadius: 999,
              color: T.muted,
              cursor: "pointer",
              fontFamily: FONT_D,
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            ← Voltar
          </button>
          <button
            onClick={pay}
            disabled={!method}
            style={{
              padding: "0 48px",
              minHeight: 80,
              background: method ? T.btn : "rgba(150,150,150,0.15)",
              color: method ? T.btnText : "rgba(200,200,200,0.4)",
              border: "none",
              borderRadius: 999,
              fontFamily: FONT_D,
              fontSize: 20,
              fontWeight: 800,
              cursor: method ? "pointer" : "default",
              boxShadow: method ? T.glow : "none",
            }}
          >
            Pagar {fmt(total)}
          </button>
        </div>
      )}

      {!processing && (
        <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: 12, marginTop: 16, opacity: 0.45 }}>
          Voltando ao catálogo em {idleCountdown}s…
        </p>
      )}
    </div>
  );
}
