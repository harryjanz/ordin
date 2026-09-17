import { useState, useEffect, useRef } from "react";
import { Zap, Hourglass } from "lucide-react";
import api from "../api";
import type { Theme } from "../themes";
import type { FiscalDocumentSummary } from "../types";
import { FONT } from "../scale";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

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
  onSuccess: (fiscalDocument: FiscalDocumentSummary | null) => void;
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
        const { status, fiscal_document } = r.data;
        if (status === "approved") {
          if (doneRef.current) return;
          doneRef.current = true;
          clearInterval(t);
          // Busca tickets do pedido aprovado
          onSuccess(fiscal_document ?? null);
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
      <div className="text-center" style={{ width: "min(320px, 80vw)" }}>
        <p className="mb-2" style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.body }}>
          Aguardando pagamento…
        </p>
        <div className="flex items-center justify-center gap-2 mb-2" style={{ fontFamily: FONT_D, fontSize: FONT.title, fontWeight: 800, color: urgente ? T.errorText : T.text, letterSpacing: 2 }}>
          <Hourglass size={FONT.title} /> {mm}:{ss}
        </div>
        <Progress
          value={secondsLeft}
          minValue={0}
          maxValue={PIX_TTL}
          aria-label="Tempo restante para pagar"
          className="[&_[data-slot=progress-track]]:h-2"
          style={{ ["--primary" as string]: urgente ? T.errorText : T.roxo }}
        />
        {urgente && (
          <p className="mt-2" style={{ color: T.errorText, fontFamily: FONT_B, fontSize: FONT.body }}>
            Tempo quase esgotado!
          </p>
        )}
      </div>

      {/* Cancelar */}
      <Button
        variant="outline"
        onClick={() => setCancelConfirm(true)}
        className="rounded-full"
        style={{ paddingLeft: 28, paddingRight: 28, minHeight: 52, color: T.muted, fontFamily: FONT_D, fontSize: FONT.bodyLg, fontWeight: 600 }}
      >
        Cancelar pagamento
      </Button>

      <AlertDialog isOpen={cancelConfirm} onOpenChange={setCancelConfirm}>
        <AlertDialogHeader>
          <AlertDialogTitle style={{ color: T.text, fontFamily: FONT_D }}>
            Cancelar pagamento?
          </AlertDialogTitle>
          <AlertDialogDescription style={{ fontFamily: FONT_B }}>
            Deseja realmente cancelar esse pagamento por PIX?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel style={{ fontFamily: FONT_D, fontWeight: 700 }}>
            Não, continuar
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={cancelPayment}
            style={{ fontFamily: FONT_D, fontWeight: 700 }}
          >
            Sim, cancelar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialog>

      <p className="text-center" style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.label, opacity: 0.4 }}>
        Pedido: {orderRef}
      </p>
    </div>
  );
}
