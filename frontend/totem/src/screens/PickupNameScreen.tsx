import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { Theme } from "../themes";
import { FONT } from "../scale";
import TextKeyboard from "../components/TextKeyboard";
import { Button } from "@/components/ui/button";

const FONT_D = "'Lexend', sans-serif";
const FONT_B = "'Inter', sans-serif";
const MAX_LEN = 20;

interface Props {
  T: Theme;
  onNext: (name: string | null) => void;
  onBack: () => void;
}

// ORD-119 — só aparece quando fulfillment_mode="retirada_unica" (App.tsx
// decide se mostra essa tela). Nome opcional pra identificar o pedido no
// painel de retirada em vez de só o número. Achado ao vivo: totem roda em
// kiosk mode, não abre teclado nativo do SO ao focar <input> — usa
// TextKeyboard (teclado virtual próprio, maiúsculas, apagar
// última/apagar tudo), mesmo motivo pelo qual CpfScreen já usa numpad
// customizado em vez de input nativo.
export default function PickupNameScreen({ T, onNext, onBack }: Props) {
  const [name, setName] = useState("");
  const trimmed = name.trim();

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center pt-8 pb-6"
      style={{ background: T.radial, transition: "background 0.3s" }}
    >
      <div className="flex flex-col gap-7" style={{ width: "min(820px, 94vw)" }}>

        <div className="text-center">
          <h2 className="mb-2" style={{ color: T.text, fontFamily: FONT_D, fontSize: FONT.headline, fontWeight: 800 }}>
            Quer receber com seu nome?
          </h2>
          <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.subtitle }}>
            Opcional — vai aparecer no painel de retirada
          </p>
        </div>

        {/* Display — só leitura, entrada é sempre pelo TextKeyboard abaixo */}
        <div
          className="text-center rounded-lg"
          style={{
            padding: "24px 28px", border: `2px solid ${T.border}`, background: T.numBg,
            color: name.length > 0 ? T.text : T.muted,
            fontFamily: FONT_D, fontSize: FONT.headline, fontWeight: 700,
            minHeight: 32, letterSpacing: 1,
          }}
        >
          {name.length > 0 ? name : "SEU NOME"}
        </div>

        <TextKeyboard
          T={T}
          onKey={(ch) => setName((n) => (n.length < MAX_LEN ? (n + ch).toUpperCase() : n))}
          onBackspace={() => setName((n) => n.slice(0, -1))}
          onClear={() => setName("")}
        />

        <button
          onClick={() => onNext(null)}
          className="bg-transparent border-none text-center py-2"
          style={{ color: T.muted, cursor: "pointer", fontSize: FONT.subtitle, fontWeight: 600, fontFamily: FONT_D }}
        >
          Prefiro não informar
        </button>

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
            onClick={() => onNext(trimmed || null)}
            className="flex-1 rounded-lg uppercase tracking-wide"
            style={{ minHeight: 88, background: T.btn, color: T.btnText, fontFamily: FONT_D, fontSize: FONT.title, fontWeight: 800, boxShadow: T.glow }}
          >
            Confirmar
          </Button>
        </div>

      </div>
    </div>
  );
}
