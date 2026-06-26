import { useState, useEffect } from "react";
import { Wallet, CreditCard, Landmark, XCircle } from "lucide-react";
import { PixLogo } from "../assets/PixLogo";
import api from "../api";
import type { Theme } from "../themes";
import type { CartItem, CompletedOrder } from "../types";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const FONT_D = "'Lexend', sans-serif";
const FONT_B = "'Inter', sans-serif";

const METHODS = [
  { id: "credit", label: "Crédito",  desc: "À vista ou parcelado" },
  { id: "debit",  label: "Débito",   desc: "Débito em conta" },
  { id: "pix",    label: "PIX",      desc: "Transferência instantânea" },
] as const;

function MethodIcon({ id, size, color }: { id: string; size: number; color: string }) {
  if (id === "credit") return <CreditCard size={size} color={color} strokeWidth={1.5} />;
  if (id === "debit")  return <Landmark   size={size} color={color} strokeWidth={1.5} />;
  return <PixLogo size={size} color={color} />;
}

// Animação de três pontos enquanto aguarda terminal físico
function DotsAnimation({ T }: { T: Theme }) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: T.roxo,
            opacity: 0.7,
            animation: `pulse 1.2s ease-in-out ${i * 0.22}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

// Tela de foco único durante processamento com terminal físico (crédito/débito)
function CardProcessingView({
  T, countdown, error, onRetry,
}: {
  T: Theme;
  countdown: number;
  error: string;
  onRetry: () => void;
}) {
  return (
    <div style={{
      minHeight: "100vh",
      background: T.radial,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 28,
      textAlign: "center",
      position: "relative",
    }}>
      {error ? (
        <>
          <XCircle size={100} color={T.errorText} strokeWidth={1.2} />
          <p style={{ color: T.text, fontFamily: FONT_D, fontSize: 22, fontWeight: 700, margin: 0 }}>
            {error}
          </p>
          <button
            onClick={onRetry}
            style={{
              padding: "0 48px",
              minHeight: 72,
              background: T.btn,
              color: T.btnText,
              border: "none",
              borderRadius: 999,
              fontFamily: FONT_D,
              fontSize: 18,
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: T.glow,
            }}
          >
            Tentar novamente
          </button>
        </>
      ) : (
        <>
          <CreditCard size={120} color={T.roxo} strokeWidth={1.2} />
          <p style={{ color: T.text, fontFamily: FONT_D, fontSize: 24, fontWeight: 700, margin: 0 }}>
            Insira ou aproxime o cartão
          </p>
          <DotsAnimation T={T} />
          <p style={{
            color: T.muted,
            fontFamily: FONT_B,
            fontSize: 13,
            opacity: 0.45,
            position: "absolute",
            bottom: 32,
          }}>
            Aguardando terminal… {countdown}s
          </p>
        </>
      )}
    </div>
  );
}

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

  // Timeout de processamento: dispara erro ao chegar a 0
  useEffect(() => {
    if (!processing) return;
    if (countdown <= 0) {
      setError("Tempo esgotado. Tente novamente.");
    }
  }, [countdown, processing]);

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
    }
  }

  function handleRetry() {
    setProcessing(false);
    setError("");
    setMethod(null);
    setCountdown(90);
  }

  // Tela de foco único para crédito/débito em processamento
  if (processing && method !== "pix") {
    return <CardProcessingView T={T} countdown={countdown} error={error} onRetry={handleRetry} />;
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
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
          <Wallet size={44} color={T.roxo} strokeWidth={1.5} />
        </div>
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
              minHeight: 120,
              minWidth: 150,
              background: method === m.id ? T.btn : T.surface,
              border: `2px solid ${method === m.id ? T.btn : T.borderNeutral}`,
              borderRadius: 18,
              color: method === m.id ? T.btnText : T.text,
              cursor: "pointer",
              textAlign: "center",
              transition: "all 0.15s",
              boxShadow: method === m.id ? T.glow : T.cardShadow,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            <MethodIcon
              id={m.id}
              size={44}
              color={method === m.id ? T.btnText : T.roxo}
            />
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

      <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: 12, opacity: 0.45 }}>
        Voltando ao catálogo em {idleCountdown}s…
      </p>
    </div>
  );
}
