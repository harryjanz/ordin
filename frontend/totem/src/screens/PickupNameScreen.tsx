import { useState } from "react";
import type { Theme } from "../themes";
import { RADIUS, FONT } from "../scale";

const FONT_D = "'Lexend', sans-serif";
const FONT_B = "'Inter', sans-serif";

interface Props {
  T: Theme;
  onNext: (name: string | null) => void;
  onBack: () => void;
}

// ORD-119 — só aparece quando fulfillment_mode="retirada_unica" (App.tsx
// decide se mostra essa tela). Nome opcional pra identificar o pedido no
// painel de retirada em vez de só o número. Input nativo (não numpad como
// CpfScreen) — kiosks touch mostram teclado do sistema automaticamente ao
// focar um <input>, sem precisar de teclado virtual próprio.
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
      <div style={{ width: "min(680px, 92vw)", display: "flex", flexDirection: "column", gap: 28 }}>

        <div style={{ textAlign: "center" }}>
          <h2 style={{ color: T.text, fontFamily: FONT_D, fontSize: FONT.headline, fontWeight: 800, margin: "0 0 8px" }}>
            Quer receber com seu nome?
          </h2>
          <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.subtitle, margin: 0 }}>
            Opcional — vai aparecer no painel de retirada
          </p>
        </div>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 40))}
          placeholder="Seu nome"
          autoFocus
          style={{
            padding: "24px 28px",
            border: `2px solid ${T.border}`,
            borderRadius: RADIUS.sm,
            background: T.numBg,
            color: T.text,
            fontFamily: FONT_D,
            fontSize: FONT.headline,
            fontWeight: 700,
            textAlign: "center",
            outline: "none",
          }}
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
