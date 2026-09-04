import { useState, useEffect, useRef } from "react";
import { Zap, Hourglass } from "lucide-react";
import api from "../api";
import type { Theme } from "../themes";
import { FONT } from "../scale";
import { Button } from "@/components/ui/button";

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
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-5 px-4 py-8"
      style={{ background: T.radial }}
    >
      <div className="text-center">
        <Zap className="mx-auto mb-2" size={FONT.headline} color={T.roxo} fill={T.roxo} />
        <h2 style={{ color: T.text, fontFamily: FONT_D, fontSize: FONT.title, fontWeight: 800 }}>
          Pague com PIX
        </h2>
        <p className="mt-1" style={{ color: T.priceColor, fontFamily: FONT_D, fontSize: FONT.title, fontWeight: 800 }}>
          {fmt(amount)}
        </p>
      </div>

      {/* QR Code */}
      <div className="rounded-2xl p-4" style={{ background: "#fff", boxShadow: T.cardShadow }}>
        {qrCodeBase64 ? (
          <img
            src={`data:image/png;base64,${qrCodeBase64}`}
            alt="QR Code PIX"
            width={260}
            height={260}
            className="block"
          />
        ) : (
          <div className="flex items-center justify-center" style={{ width: 260, height: 260, color: "#999", fontSize: FONT.body }}>
            QR indisponível
          </div>
        )}
      </div>

      <p className="text-center" style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.body }}>
        Aponte a câmera do seu celular para o QR Code
      </p>

      {/* Status + countdown */}
      <div className="text-center">
        <p className="mb-2" style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.body }}>
          Aguardando pagamento…
        </p>
        <div className="flex items-center justify-center gap-2" style={{ fontFamily: FONT_D, fontSize: FONT.title, fontWeight: 800, color: urgente ? T.errorText : T.text, letterSpacing: 2 }}>
          <Hourglass size={FONT.title} /> {mm}:{ss}
        </div>
        {urgente && (
          <p className="mt-1" style={{ color: T.errorText, fontFamily: FONT_B, fontSize: FONT.body }}>
            Tempo quase esgotado!
          </p>
        )}
      </div>

      {/* Cancelar */}
      {!cancelConfirm ? (
        <Button
          variant="outline"
          onClick={() => setCancelConfirm(true)}
          className="rounded-full"
          style={{ paddingLeft: 28, paddingRight: 28, minHeight: 52, color: T.muted, fontFamily: FONT_D, fontSize: FONT.bodyLg, fontWeight: 600 }}
        >
          Cancelar pagamento
        </Button>
      ) : (
        <div className="rounded-2xl text-center" style={{ background: T.surface, border: `1px solid ${T.border}`, padding: "16px 24px" }}>
          <p className="mb-4" style={{ color: T.text, fontFamily: FONT_B, fontSize: FONT.bodyLg }}>
            Deseja cancelar o pagamento?
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              variant="outline"
              onClick={() => setCancelConfirm(false)}
              className="rounded-full"
              style={{ paddingLeft: 24, paddingRight: 24, minHeight: 48, color: T.muted, fontFamily: FONT_D, fontWeight: 700, fontSize: FONT.body }}
            >
              Não, continuar
            </Button>
            <Button
              variant="destructive"
              onClick={cancelPayment}
              className="rounded-full"
              style={{ paddingLeft: 24, paddingRight: 24, minHeight: 48, fontFamily: FONT_D, fontWeight: 700, fontSize: FONT.body }}
            >
              Sim, cancelar
            </Button>
          </div>
        </div>
      )}

      <p className="text-center" style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.label, opacity: 0.4 }}>
        Pedido: {orderRef}
      </p>
    </div>
  );
}
