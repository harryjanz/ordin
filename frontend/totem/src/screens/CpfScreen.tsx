import { useState } from "react";
import { FileText } from "lucide-react";
import type { Theme } from "../themes";

const FONT_D = "'Lexend', sans-serif";
const FONT_B = "'Inter', sans-serif";

// Layout ATM: 7-8-9 no topo (igual a terminais físicos e caixas eletrônicos)
const KEYS = [7, 8, 9, 4, 5, 6, 1, 2, 3, "", 0, "⌫"] as const;

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
      gap: 24,
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <FileText size={44} color={T.roxo} strokeWidth={1.5} />
        </div>
        <h2 style={{ color: T.text, fontFamily: FONT_D, fontSize: 26, fontWeight: 800, margin: 0 }}>CPF na nota?</h2>
        <p style={{ color: T.muted, fontFamily: FONT_B, marginTop: 8, fontSize: 14 }}>Opcional — para participar de promoções</p>
      </div>

      {/* Container do numpad expandido — sem card wrapper estreito */}
      <div style={{ width: "min(480px, 92vw)" }}>
        {/* Display do CPF */}
        <div style={{
          textAlign: "center",
          padding: "16px 0",
          marginBottom: 8,
          background: T.numBg,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          letterSpacing: 3,
          fontSize: 22,
          fontWeight: 700,
          fontFamily: FONT_D,
          color: done ? T.text : T.muted,
        }}>
          {fmtCpf(digits) || "000.000.000-00"}
        </div>

        {/* Numpad — layout ATM com bordas internas, sem borda individual por tecla */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          border: `1px solid ${T.border}`,
          borderRadius: 16,
          overflow: "hidden",
          marginBottom: 16,
        }}>
          {KEYS.map((k, i) => (
            <button
              key={i}
              onClick={() => {
                if (k === "⌫") setDigits((d) => d.slice(0, -1));
                else if (k !== "") press(String(k));
              }}
              style={{
                minHeight: 84,
                fontSize: 26,
                fontWeight: 600,
                fontFamily: FONT_D,
                background: k === "" ? "transparent" : T.numBg,
                color: T.text,
                border: "none",
                borderRight: (i + 1) % 3 !== 0 ? `1px solid ${T.border}` : "none",
                borderBottom: i < 9 ? `1px solid ${T.border}` : "none",
                cursor: k === "" ? "default" : "pointer",
                transition: "background 0.12s",
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
            minHeight: 64,
            padding: "0 16px",
            background: done ? T.btn : "rgba(150,150,150,0.15)",
            color: done ? T.btnText : "rgba(200,200,200,0.4)",
            border: "none",
            borderRadius: 999,
            fontSize: 18,
            fontWeight: 800,
            fontFamily: FONT_D,
            cursor: done ? "pointer" : "default",
            marginBottom: 12,
            boxShadow: done ? T.glow : "none",
          }}
        >
          Confirmar CPF
        </button>

        {/* Ação secundária: texto puro sem borda — hierarquia clara */}
        <button
          onClick={onSkip}
          style={{
            width: "100%",
            minHeight: 48,
            background: "transparent",
            border: "none",
            color: T.muted,
            cursor: "pointer",
            fontSize: 15,
            fontWeight: 500,
            fontFamily: FONT_B,
          }}
        >
          Prefiro não informar
        </button>
      </div>
    </div>
  );
}
