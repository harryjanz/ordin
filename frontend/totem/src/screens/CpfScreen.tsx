import { useState } from "react";
import { ArrowLeft, Delete } from "lucide-react";
import type { Theme } from "../themes";
import { FONT } from "../scale";
import { Button } from "@/components/ui/button";

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
    <div
      className="min-h-screen flex flex-col items-center justify-center pt-8 pb-6"
      style={{ background: T.radial, transition: "background 0.3s" }}
    >
      <div className="flex flex-col gap-7" style={{ width: "min(680px, 92vw)" }}>

        {/* Título */}
        <div className="text-center">
          <h2 className="mb-2" style={{ color: T.text, fontFamily: FONT_D, fontSize: FONT.headline, fontWeight: 800 }}>
            Informe seu documento
          </h2>
          <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.subtitle }}>
            Digite seu CPF
          </p>
        </div>

        {/* Campo display — altura generosa, fonte grande */}
        <div
          className="flex items-center gap-4 rounded-lg"
          style={{ padding: "24px 28px", border: `2px solid ${T.border}`, background: T.numBg }}
        >
          <span className="whitespace-nowrap" style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.subtitle, fontWeight: 700 }}>
            CPF:
          </span>
          <span
            className="flex-1"
            style={{ fontFamily: FONT_D, fontSize: FONT.headline, fontWeight: 800, letterSpacing: 4, color: digits.length > 0 ? T.text : T.muted }}
          >
            {digits.length > 0 ? fmtCpf(digits) : "___.___.___-__"}
          </span>
        </div>

        {/* Numpad — altura fixa por tecla, nunca cresce */}
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
          {/* Linhas 7-8-9 / 4-5-6 / 1-2-3 */}
          <div className="grid grid-cols-3">
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
          <div className="flex">
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
              style={{ ...KEY, flex: 2 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.numHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = T.numBg; }}
            >
              <Delete size={32} />
            </button>
          </div>
        </div>

        {/* Prefiro não informar — cor do tema, sublinhado, bem visível */}
        <button
          onClick={onSkip}
          className="bg-transparent border-none text-center py-2"
          style={{ color: T.muted, cursor: "pointer", fontSize: FONT.subtitle, fontWeight: 600, fontFamily: FONT_D }}
        >
          Prefiro não informar
        </button>

        {/* Botões: Voltar + Confirmar */}
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
            onClick={() => done && onNext(digits)}
            isDisabled={!done}
            className="flex-1 rounded-lg uppercase tracking-wide"
            style={{
              minHeight: 88,
              background: done ? T.btn : T.surface,
              color: done ? T.btnText : T.muted,
              border: done ? "none" : `1.5px solid ${T.border}`,
              fontFamily: FONT_D, fontSize: FONT.title, fontWeight: 800,
              boxShadow: done ? T.glow : "none",
            }}
          >
            Confirmar
          </Button>
        </div>

      </div>
    </div>
  );
}
