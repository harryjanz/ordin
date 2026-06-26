import { useState, useEffect } from "react";
import { CreditCard, XCircle } from "lucide-react";
import { PixLogo } from "../assets/PixLogo";
import api from "../api";
import type { Theme } from "../themes";
import type { CartItem, CompletedOrder } from "../types";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const FONT_D = "'Lexend', sans-serif";
const FONT_B = "'Inter', sans-serif";

// Débito: cartão com chip SVG (diferencia visualmente do crédito)
function DebitCardIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
      <rect x="6" y="14" width="4" height="2.5" rx="0.5" />
    </svg>
  );
}

function DotsAnimation({ T }: { T: Theme }) {
  return (
    <div style={{ display: "flex", gap: 14 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          width: 14, height: 14, borderRadius: "50%",
          background: T.text, opacity: 0.35,
          animation: `pulse 1.4s ease-in-out ${i * 0.28}s infinite`,
        }} />
      ))}
    </div>
  );
}

function CardProcessingView({ T, countdown, error, onRetry, onCancel }: {
  T: Theme; countdown: number; error: string; onRetry: () => void; onCancel: () => void;
}) {
  return (
    <div style={{
      height: "100vh", background: T.radial,
      display: "flex", flexDirection: "column",
      transition: "background 0.3s",
    }}>
      {/* Conteúdo central */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 32, textAlign: "center", padding: "0 40px",
      }}>
        {error ? (
          <>
            <XCircle size={160} color={T.errorText} strokeWidth={1.2} />
            <p style={{ color: T.text, fontFamily: FONT_D, fontSize: 26, fontWeight: 700, margin: 0 }}>
              {error}
            </p>
            <button onClick={onRetry} style={{
              padding: "0 56px", height: 88,
              background: T.btn, color: T.btnText, border: "none",
              borderRadius: 12, fontFamily: FONT_D, fontSize: 22,
              fontWeight: 800, cursor: "pointer", boxShadow: T.glow,
              textTransform: "uppercase", letterSpacing: 1,
            }}>
              Tentar novamente
            </button>
          </>
        ) : (
          <>
            <CreditCard size={180} color={T.text} strokeWidth={1.2} />
            <p style={{ color: T.text, fontFamily: FONT_D, fontSize: 28, fontWeight: 600, margin: 0 }}>
              Insira ou aproxime o cartão
            </p>
            <DotsAnimation T={T} />
            <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: 13, opacity: 0.3, margin: 0 }}>
              Aguardando terminal… {countdown}s
            </p>
          </>
        )}
      </div>

      {/* Barra inferior com Voltar */}
      <div style={{ padding: "12px 24px 28px" }}>
        <button onClick={onCancel} style={{
          padding: "0 28px", height: 88, flexShrink: 0,
          background: T.surface, border: `1.5px solid ${T.border}`,
          borderRadius: 12, color: T.text, cursor: "pointer",
          fontFamily: FONT_D, fontSize: 20, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: 1,
        }}>
          ← Voltar
        </button>
      </div>
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

  useEffect(() => {
    if (!processing) return;
    if (countdown <= 0) setError("Tempo esgotado. Tente novamente.");
  }, [countdown, processing]);

  useEffect(() => {
    if (processing) return;
    setIdleCountdown(60);
    const t = setInterval(() => {
      setIdleCountdown((c) => { if (c <= 1) { clearInterval(t); onBack(); } return c - 1; });
    }, 1000);
    return () => clearInterval(t);
  }, [processing]);

  async function pay() {
    if (!method) return;
    setProcessing(true);
    setError("");
    setCountdown(90);
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);

    // Para cartão: aguarda no mínimo 10s na tela de processamento (cobre mock instantâneo)
    const minDelay = method !== "pix"
      ? new Promise<void>((r) => setTimeout(r, 5_000))
      : Promise.resolve();

    try {
      const [res] = await Promise.all([
        api.post("/payments", {
          order_ref: orderRef, method, amount: total,
          items: cart.map((i) => ({ product_id: i.id, name: i.name, qty: i.qty, unit_price: i.price })),
          cpf: cpf || null,
        }),
        minDelay,
      ]);
      clearInterval(timer);
      const { status, nsu, transaction_id, qr_code, qr_code_base64 } = res.data;
      if (status === "approved") {
        const ticketsRes = await api.get(`/orders/${orderRef}/tickets`);
        onSuccess({ order_ref: orderRef, total, method, nsu: nsu ?? null, provider: res.data.provider ?? "mock", tickets: ticketsRes.data.tickets ?? [] });
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

  function handleRetry() { setProcessing(false); setError(""); setMethod(null); setCountdown(90); }

  if (processing && method !== "pix") {
    return <CardProcessingView T={T} countdown={countdown} error={error} onRetry={handleRetry} onCancel={handleRetry} />;
  }

  const isSelected = (id: string) => method === id;

  const CELL: React.CSSProperties = {
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    gap: 16, cursor: "pointer",
    border: "none", transition: "background 0.12s", padding: 0,
  };

  return (
    <div style={{
      minHeight: "100vh", background: T.radial,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      transition: "background 0.3s", padding: "32px 0 24px",
    }}>
      <div style={{ width: "min(680px, 92vw)", display: "flex", flexDirection: "column", gap: 26 }}>

        {/* Título */}
        <div style={{ textAlign: "center" }}>
          <h2 style={{ color: T.text, fontFamily: FONT_D, fontSize: 38, fontWeight: 800, margin: "0 0 8px" }}>
            Formas de Pagamento
          </h2>
          <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: 20, margin: 0 }}>
            Selecione qual forma de pagamento deseja utilizar.
          </p>
        </div>

        {/* Grid de métodos — mesmo padrão visual do numpad do CPF */}
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>

          {/* Linha 1: Crédito | Débito */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            <button
              onClick={() => setMethod("credit")}
              style={{
                ...CELL, height: 180,
                background: isSelected("credit") ? T.btn : T.numBg,
                borderRight: `1px solid ${T.border}`,
                borderBottom: `1px solid ${T.border}`,
              }}
              onMouseEnter={(e) => { if (!isSelected("credit")) e.currentTarget.style.background = T.numHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = isSelected("credit") ? T.btn : T.numBg; }}
            >
              <CreditCard size={64} color={isSelected("credit") ? T.btnText : T.roxo} strokeWidth={1.5} />
              <span style={{ fontFamily: FONT_D, fontWeight: 700, fontSize: 20, color: isSelected("credit") ? T.btnText : T.text }}>
                Cartão de Crédito
              </span>
            </button>

            <button
              onClick={() => setMethod("debit")}
              style={{
                ...CELL, height: 180,
                background: isSelected("debit") ? T.btn : T.numBg,
                borderBottom: `1px solid ${T.border}`,
              }}
              onMouseEnter={(e) => { if (!isSelected("debit")) e.currentTarget.style.background = T.numHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = isSelected("debit") ? T.btn : T.numBg; }}
            >
              <DebitCardIcon size={64} color={isSelected("debit") ? T.btnText : T.roxo} />
              <span style={{ fontFamily: FONT_D, fontWeight: 700, fontSize: 20, color: isSelected("debit") ? T.btnText : T.text }}>
                Cartão de Débito
              </span>
            </button>
          </div>

          {/* Linha 2: PIX — largura total */}
          <button
            onClick={() => setMethod("pix")}
            style={{
              ...CELL, height: 160, width: "100%",
              background: isSelected("pix") ? T.btn : T.numBg,
            }}
            onMouseEnter={(e) => { if (!isSelected("pix")) e.currentTarget.style.background = T.numHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = isSelected("pix") ? T.btn : T.numBg; }}
          >
            <PixLogo size={64} color={isSelected("pix") ? T.btnText : T.roxo} />
            <span style={{ fontFamily: FONT_D, fontWeight: 700, fontSize: 20, color: isSelected("pix") ? T.btnText : T.text }}>
              PIX
            </span>
          </button>
        </div>

        {/* Total */}
        <div style={{
          padding: "20px 24px",
          background: T.numBg,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontFamily: FONT_B, color: T.muted, fontSize: 18 }}>Subtotal</span>
            <span style={{ fontFamily: FONT_B, color: T.muted, fontSize: 18 }}>{fmt(total)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontFamily: FONT_D, color: T.text, fontSize: 22, fontWeight: 800 }}>Total</span>
            <span style={{ fontFamily: FONT_D, color: T.priceColor, fontSize: 22, fontWeight: 800 }}>{fmt(total)}</span>
          </div>
        </div>

        {/* Botões: Voltar + Pagar */}
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={onBack} style={{
            padding: "0 28px", height: 88, flexShrink: 0,
            background: T.surface, border: `1.5px solid ${T.border}`,
            borderRadius: 12, color: T.text, cursor: "pointer",
            fontFamily: FONT_D, fontSize: 20, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: 1, whiteSpace: "nowrap",
          }}>
            ← Voltar
          </button>
          <button onClick={pay} disabled={!method} style={{
            flex: 1, height: 88,
            background: method ? T.btn : T.surface,
            color: method ? T.btnText : T.muted,
            border: method ? "none" : `1.5px solid ${T.border}`,
            borderRadius: 12, fontFamily: FONT_D, fontSize: 22,
            fontWeight: 800, cursor: method ? "pointer" : "default",
            boxShadow: method ? T.glow : "none",
            textTransform: "uppercase", letterSpacing: 1,
            transition: "all 0.15s",
          }}>
            {method ? `Pagar ${fmt(total)}` : "Selecione uma forma de pagamento"}
          </button>
        </div>

        {!processing && (
          <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: 13, textAlign: "center", opacity: 0.35, margin: 0 }}>
            Voltando ao catálogo em {idleCountdown}s…
          </p>
        )}
      </div>
    </div>
  );
}
