import { useState } from "react";
import type { Theme } from "../themes";

const FONT_D = "'Lexend', sans-serif";
const FONT_B = "'Inter', sans-serif";

function fmtCpf(d: string) {
  return d.slice(0,11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

interface Props {
  T: Theme;
  onNext: (cpf: string) => void;
  onSkip: () => void;
}

export default function CpfScreen({ T, onNext, onSkip }: Props) {
  const [digits, setDigits] = useState("");
  const done = digits.length === 11;

  function press(v: string) {
    setDigits((d) => d.length < 11 ? d + v : d);
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: T.radial,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      transition: "background 0.3s",
    }}>
      <div style={{ marginBottom: 24, textAlign: "center" }}>
        <div style={{ fontSize: 44, marginBottom: 8 }}>🧾</div>
        <h2 style={{ color: T.text, fontFamily: FONT_D, fontSize: 26, fontWeight: 800, margin: 0 }}>CPF na nota?</h2>
        <p style={{ color: T.muted, fontFamily: FONT_B, marginTop: 8, fontSize: 14 }}>Opcional — para participar de promoções</p>
      </div>

      <div style={{
        background: T.surface,
        border: `1px solid ${T.borderNeutral}`,
        borderRadius: 24,
        padding: 32,
        width: 320,
        boxShadow: T.cardShadow,
      }}>
        <div style={{
          textAlign: "center",
          padding: "14px 0",
          marginBottom: 20,
          background: T.numBg,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          letterSpacing: 3,
          fontSize: 20,
          fontWeight: 700,
          fontFamily: FONT_D,
          color: done ? T.text : T.muted,
        }}>
          {fmtCpf(digits) || "000.000.000-00"}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
          {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((k, i) => (
            <button
              key={i}
              onClick={() => k === "⌫" ? setDigits((d) => d.slice(0, -1)) : k !== "" ? press(String(k)) : undefined}
              style={{
                padding: "18px 0",
                fontSize: 20,
                fontWeight: 600,
                fontFamily: FONT_D,
                background: k === "" ? "transparent" : T.numBg,
                color: T.text,
                border: `1px solid ${k === "" ? "transparent" : T.border}`,
                borderRadius: 12,
                cursor: k === "" ? "default" : "pointer",
              }}
              onMouseEnter={(e) => { if (k !== "") e.currentTarget.style.background = T.numHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = k === "" ? "transparent" : T.numBg; }}
            >
              {k}
            </button>
          ))}
        </div>

        <button
          onClick={() => done && onNext(digits)}
          disabled={!done}
          style={{
            width: "100%",
            minHeight: 60,
            padding: "0 16px",
            background: done ? T.btn : "rgba(150,150,150,0.15)",
            color: done ? T.btnText : "rgba(200,200,200,0.4)",
            border: "none",
            borderRadius: 999,
            fontSize: 18,
            fontWeight: 800,
            fontFamily: FONT_D,
            cursor: done ? "pointer" : "default",
            marginBottom: 10,
            boxShadow: done ? T.glow : "none",
          }}
        >
          Confirmar CPF
        </button>
        <button
          onClick={onSkip}
          style={{
            width: "100%",
            minHeight: 56,
            padding: "0 16px",
            background: "transparent",
            border: `1px solid ${T.borderNeutral}`,
            borderRadius: 999,
            color: T.muted,
            cursor: "pointer",
            fontSize: 16,
            fontWeight: 600,
            fontFamily: FONT_D,
          }}
        >
          Pular esta etapa
        </button>
      </div>
    </div>
  );
}
