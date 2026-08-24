import { useState } from "react";
import type { Theme } from "../themes";
import { RADIUS, FONT } from "../scale";
import TextKeyboard from "../components/TextKeyboard";

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
    <div style={{
      minHeight: "100vh",
      background: T.radial,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      transition: "background 0.3s",
      padding: "32px 0 24px",
    }}>
      <div style={{ width: "min(820px, 94vw)", display: "flex", flexDirection: "column", gap: 28 }}>

        <div style={{ textAlign: "center" }}>
          <h2 style={{ color: T.text, fontFamily: FONT_D, fontSize: FONT.headline, fontWeight: 800, margin: "0 0 8px" }}>
            Quer receber com seu nome?
          </h2>
          <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.subtitle, margin: 0 }}>
            Opcional — vai aparecer no painel de retirada
          </p>
        </div>

        {/* Display — só leitura, entrada é sempre pelo TextKeyboard abaixo */}
        <div style={{
          padding: "24px 28px",
          border: `2px solid ${T.border}`,
          borderRadius: RADIUS.sm,
          background: T.numBg,
          color: name.length > 0 ? T.text : T.muted,
          fontFamily: FONT_D,
          fontSize: FONT.headline,
          fontWeight: 700,
          textAlign: "center",
          minHeight: 32,
          letterSpacing: 1,
        }}>
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
          style={{
            background: "transparent",
            border: "none",
            color: T.muted,
            cursor: "pointer",
            fontSize: FONT.subtitle,
            fontWeight: 600,
            fontFamily: FONT_D,
            padding: "8px 0",
            textAlign: "center",
          }}
        >
          Prefiro não informar
        </button>

        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={onBack}
            style={{
              padding: "0 28px",
              height: 88,
              background: T.surface,
              border: `1.5px solid ${T.border}`,
              borderRadius: RADIUS.sm,
              color: T.text,
              cursor: "pointer",
              fontFamily: FONT_D,
              fontSize: FONT.subtitle,
              textTransform: "uppercase",
              letterSpacing: 1,
              fontWeight: 700,
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            ← Voltar
          </button>
          <button
            onClick={() => onNext(trimmed || null)}
            style={{
              flex: 1,
              height: 88,
              background: T.btn,
              color: T.btnText,
              border: "none",
              borderRadius: RADIUS.sm,
              fontFamily: FONT_D,
              fontSize: FONT.title,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 1,
              cursor: "pointer",
              boxShadow: T.glow,
              transition: "all 0.15s",
            }}
          >
            Confirmar
          </button>
        </div>

      </div>
    </div>
  );
}
