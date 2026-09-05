import { useState, useEffect } from "react";
import { CreditCard, XCircle, ArrowLeft } from "lucide-react";
import { PixLogo } from "../assets/PixLogo";
import api from "../api";
import type { Theme } from "../themes";
import type { CartItem, CompletedOrder } from "../types";
import { FONT } from "../scale";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const CARD_TIMEOUT_S = 90;
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
    <div className="flex gap-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-full"
          style={{ width: 14, height: 14, background: T.text, opacity: 0.35, animation: `pulse 1.4s ease-in-out ${i * 0.28}s infinite` }}
        />
      ))}
    </div>
  );
}

function CardProcessingView({ T, countdown, error, onRetry, onCancel, showMpHint }: {
  T: Theme; countdown: number; error: string; onRetry: () => void; onCancel: () => void; showMpHint: boolean;
}) {
  return (
    <div className="h-screen flex flex-col" style={{ background: T.radial, transition: "background 0.3s" }}>
      {/* Conteúdo central */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 text-center px-10">
        {error ? (
          <>
            <XCircle size={160} color={T.errorText} strokeWidth={1.2} />
            <p style={{ color: T.text, fontFamily: FONT_D, fontSize: FONT.title, fontWeight: 700 }}>
              {error}
            </p>
            <Button
              onClick={onRetry}
              className="rounded-lg uppercase tracking-wide"
              style={{ minHeight: 88, paddingLeft: 56, paddingRight: 56, background: T.btn, color: T.btnText, fontFamily: FONT_D, fontSize: FONT.subtitle, fontWeight: 800, boxShadow: T.glow }}
            >
              Tentar novamente
            </Button>
          </>
        ) : (
          <>
            <CreditCard size={180} color={T.text} strokeWidth={1.2} />
            <p style={{ color: T.text, fontFamily: FONT_D, fontSize: FONT.title, fontWeight: 600 }}>
              Insira ou aproxime o cartão
            </p>
            <DotsAnimation T={T} />
            <div style={{ width: "min(320px, 80vw)" }}>
              <p className="mb-2" style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.body, opacity: 0.5 }}>
                Aguardando terminal… {countdown}s
              </p>
              <Progress
                value={countdown}
                minValue={0}
                maxValue={CARD_TIMEOUT_S}
                aria-label="Tempo restante pra inserir o cartão"
                className="[&_[data-slot=progress-track]]:h-2"
                style={{ ["--primary" as string]: T.roxo }}
              />
            </div>
            {showMpHint && (
              <p style={{ color: T.text, fontFamily: FONT_B, fontSize: FONT.body, fontWeight: 700, opacity: 0.85 }}>
                Se a maquininha não atualizar sozinha, toque em "Atualizar" na tela dela.
              </p>
            )}
          </>
        )}
      </div>

      {/* Barra inferior com Voltar */}
      <div style={{ padding: "12px 24px 28px" }}>
        <Button
          variant="outline"
          onClick={onCancel}
          className="shrink-0 rounded-lg uppercase tracking-wide"
          style={{ minHeight: 88, paddingLeft: 28, paddingRight: 28, fontFamily: FONT_D, fontSize: FONT.subtitle, fontWeight: 700 }}
        >
          <ArrowLeft className="size-4" /> Voltar
        </Button>
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
  paymentProvider?: string;
  onSuccess: (order: CompletedOrder) => void;
  onRefused: (method: string) => void;
  onPix: (data: PixData) => void;
  onBack: () => void;
}

export default function PaymentScreen({ T, cart, total, cpf, orderRef, paymentProvider, onSuccess, onRefused, onPix, onBack }: Props) {
  const [method, setMethod] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [countdown, setCountdown] = useState(CARD_TIMEOUT_S);
  const [error, setError] = useState("");
  const [idleCountdown, setIdleCountdown] = useState(60);

  useEffect(() => {
    if (!processing) return;
    if (countdown <= 0) setError("Tempo esgotado. Tente novamente.");
  }, [countdown, processing]);

  useEffect(() => {
    if (processing) return;
    setIdleCountdown(60);
  }, [processing]);

  // onBack() troca a tela no store do App — mesma correção do SuccessScreen:
  // efeito separado reagindo a idleCountdown<=0 em vez de chamar dentro do
  // updater do setIdleCountdown (evita "Cannot update a component while
  // rendering a different component").
  useEffect(() => {
    if (processing) return;
    if (idleCountdown <= 0) { onBack(); return; }
    const t = setTimeout(() => setIdleCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [processing, idleCountdown, onBack]);

  async function pay() {
    if (!method) return;
    setProcessing(true);
    setError("");
    setCountdown(CARD_TIMEOUT_S);
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
        onSuccess({
          order_ref: orderRef, total, method, nsu: nsu ?? null, provider: res.data.provider ?? "mock",
          tickets: ticketsRes.data.tickets ?? [], order_qr_data: ticketsRes.data.order_qr_data ?? null,
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

  function handleRetry() { setProcessing(false); setError(""); setMethod(null); setCountdown(CARD_TIMEOUT_S); }

  if (processing && method !== "pix") {
    return (
      <CardProcessingView
        T={T} countdown={countdown} error={error} onRetry={handleRetry} onCancel={handleRetry}
        showMpHint={paymentProvider === "mercadopago"}
      />
    );
  }

  const isSelected = (id: string) => method === id;

  const CELL: React.CSSProperties = {
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    gap: 16, cursor: "pointer",
    border: "none", transition: "background 0.12s", padding: 0,
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center pt-8 pb-6"
      style={{ background: T.radial, transition: "background 0.3s" }}
    >
      <div className="flex flex-col gap-7" style={{ width: "min(680px, 92vw)" }}>

        {/* Título */}
        <div className="text-center">
          <h2 className="mb-2" style={{ color: T.text, fontFamily: FONT_D, fontSize: FONT.headline, fontWeight: 800 }}>
            Formas de Pagamento
          </h2>
          <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.subtitle }}>
            Selecione qual forma de pagamento deseja utilizar.
          </p>
        </div>

        {/* Grid de métodos — mesmo padrão visual do numpad do CPF */}
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${T.border}` }}>

          {/* Linha 1: Crédito | Débito */}
          <div className="grid grid-cols-2">
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
              <span style={{ fontFamily: FONT_D, fontWeight: 700, fontSize: FONT.subtitle, color: isSelected("credit") ? T.btnText : T.text }}>
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
              <span style={{ fontFamily: FONT_D, fontWeight: 700, fontSize: FONT.subtitle, color: isSelected("debit") ? T.btnText : T.text }}>
                Cartão de Débito
              </span>
            </button>
          </div>

          {/* Linha 2: PIX — largura total */}
          <button
            onClick={() => setMethod("pix")}
            className="w-full"
            style={{ ...CELL, height: 160, background: isSelected("pix") ? T.btn : T.numBg }}
            onMouseEnter={(e) => { if (!isSelected("pix")) e.currentTarget.style.background = T.numHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = isSelected("pix") ? T.btn : T.numBg; }}
          >
            <PixLogo size={64} color={isSelected("pix") ? T.btnText : T.roxo} />
            <span style={{ fontFamily: FONT_D, fontWeight: 700, fontSize: FONT.subtitle, color: isSelected("pix") ? T.btnText : T.text }}>
              PIX
            </span>
          </button>
        </div>

        {/* Total */}
        <div className="rounded-lg" style={{ padding: "20px 24px", background: T.numBg, border: `1px solid ${T.border}` }}>
          <div className="flex justify-between mb-2">
            <span style={{ fontFamily: FONT_B, color: T.muted, fontSize: FONT.subtitle }}>Subtotal</span>
            <span style={{ fontFamily: FONT_B, color: T.muted, fontSize: FONT.subtitle }}>{fmt(total)}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ fontFamily: FONT_D, color: T.text, fontSize: FONT.subtitle, fontWeight: 800 }}>Total</span>
            <span style={{ fontFamily: FONT_D, color: T.priceColor, fontSize: FONT.subtitle, fontWeight: 800 }}>{fmt(total)}</span>
          </div>
        </div>

        {/* Botões: Voltar + Pagar */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onBack}
            className="shrink-0 whitespace-nowrap rounded-lg uppercase tracking-wide"
            style={{ minHeight: 88, paddingLeft: 28, paddingRight: 28, fontFamily: FONT_D, fontSize: FONT.subtitle, fontWeight: 700 }}
          >
            <ArrowLeft className="size-4" /> Voltar
          </Button>
          <Button
            onClick={pay}
            isDisabled={!method}
            className="flex-1 rounded-lg uppercase tracking-wide"
            style={{
              minHeight: 88,
              background: method ? T.btn : T.surface,
              color: method ? T.btnText : T.muted,
              border: method ? "none" : `1.5px solid ${T.border}`,
              fontFamily: FONT_D, fontSize: FONT.subtitle, fontWeight: 800,
              boxShadow: method ? T.glow : "none",
            }}
          >
            {method ? `Pagar ${fmt(total)}` : "Selecione uma forma de pagamento"}
          </Button>
        </div>

        {!processing && (
          <p className="text-center" style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.body, opacity: 0.35 }}>
            Voltando ao catálogo em {idleCountdown}s…
          </p>
        )}
      </div>
    </div>
  );
}
