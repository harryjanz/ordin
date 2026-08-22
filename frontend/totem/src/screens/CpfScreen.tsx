import { useState } from "react";
import type { Theme } from "../themes";
import { RADIUS, FONT } from "../scale";

const FONT_D = "'Lexend', sans-serif";
const FONT_B = "'Inter', sans-serif";

const NUM_KEYS = [7, 8, 9, 4, 5, 6, 1, 2, 3] as const;

// Altura fixa por tecla — nunca cresce além disso
const KEY_H = 114;

function fmtCpf(d: string) {
  return d.slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

interface Props {
  T: Theme;
  onNext: (cpf: string) => void;
  onSkip: () => void;
  onBack: () => void;
}

export default function CpfScreen({ T, onNext, onSkip, onBack }: Props) {
  const [digits, setDigits] = useState("");
  const done = digits.length === 11;

  function press(v: number) {
    setDigits((d) => d.length < 11 ? d + String(v) : d);
  }

  function del() {
    setDigits((d) => d.slice(0, -1));
  }

  const KEY: React.CSSProperties = {
    height: KEY_H,
    fontSize: FONT.headlineLg,
    fontWeight: 700,
    fontFamily: FONT_D,
    background: T.numBg,
    color: T.text,
    border: "none",
    cursor: "pointer",
    transition: "background 0.1s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  };

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

        {/* Título */}
        <div style={{ textAlign: "center" }}>
          <h2 style={{ color: T.text, fontFamily: FONT_D, fontSize: FONT.headline, fontWeight: 800, margin: "0 0 8px" }}>
            Informe seu documento
          </h2>
          <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.subtitle, margin: 0 }}>
            Digite seu CPF
          </p>
        </div>

        {/* Campo display — altura generosa, fonte grande */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "24px 28px",
          border: `2px solid ${T.border}`,
          borderRadius: RADIUS.sm,
          background: T.numBg,
        }}>
          <span style={{
            color: T.muted, fontFamily: FONT_B,
            fontSize: FONT.subtitle, fontWeight: 700, whiteSpace: "nowrap",
          }}>
            CPF:
          </span>
          <span style={{
            fontFamily: FONT_D, fontSize: FONT.headline, fontWeight: 800,
            letterSpacing: 4, flex: 1,
            color: digits.length > 0 ? T.text : T.muted,
          }}>
            {digits.length > 0 ? fmtCpf(digits) : "___.___.___-__"}
          </span>
        </div>

        {/* Numpad — altura fixa por tecla, nunca cresce */}
        <div style={{
          border: `1px solid ${T.border}`,
          borderRadius: RADIUS.sm,
          overflow: "hidden",
        }}>
          {/* Linhas 7-8-9 / 4-5-6 / 1-2-3 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
            {NUM_KEYS.map((k, i) => (
              <button
                key={k}
                onClick={() => press(k)}
                style={{
                  ...KEY,
                  borderRight: (i + 1) % 3 !== 0 ? `1px solid ${T.border}` : "none",
                  borderBottom: `1px solid ${T.border}`,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.numHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = T.numBg; }}
              >
                {k}
              </button>
            ))}
          </div>

          {/* Última linha: [0 — 1 col] [⌫ — 2 cols] */}
          <div style={{ display: "flex" }}>
            <button
              onClick={() => press(0)}
              style={{ ...KEY, flex: 1, borderRight: `1px solid ${T.border}` }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.numHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = T.numBg; }}
            >
              0
            </button>
            <button
              onClick={del}
              style={{ ...KEY, flex: 2, fontSize: FONT.headline }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.numHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = T.numBg; }}
            >
              ⌫
            </button>
          </div>
        </div>

        {/* Prefiro não informar — cor do tema, sublinhado, bem visível */}
        <button
          onClick={onSkip}
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

        {/* Botões: Voltar + Confirmar */}
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
            onClick={() => done && onNext(digits)}
            disabled={!done}
            style={{
              flex: 1,
              height: 88,
              background: done ? T.btn : T.surface,
              color: done ? T.btnText : T.muted,
              border: done ? "none" : `1.5px solid ${T.border}`,
              borderRadius: RADIUS.sm,
              fontFamily: FONT_D,
              fontSize: FONT.title,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 1,
              cursor: done ? "pointer" : "default",
              boxShadow: done ? T.glow : "none",
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
