import type { Theme } from "../themes";
import type { ConsumptionType } from "../types";

const FONT_D = "'Lexend', sans-serif";
const FONT_B = "'Inter', sans-serif";

interface Props {
  T: Theme;
  onSelect: (type: ConsumptionType) => void;
  onBack: () => void;
}

// Nomenclatura confirmada com pesquisa de mercado (ORD-108) — "Comer no
// local" / "Para levar" é o padrão dominante (Goomer, KCMS, e o mesmo que
// o McDonald's consagrou no Brasil desde ~2015). Não reinventar aqui é boa
// UX: menos carga cognitiva num fluxo rápido de totem.
const OPTIONS: { type: ConsumptionType; label: string; icon: string }[] = [
  { type: "local",  label: "Comer no local", icon: "🍽️" },
  { type: "viagem", label: "Para levar",     icon: "🥡" },
];

export default function ConsumptionTypeScreen({ T, onSelect, onBack }: Props) {
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
      <div style={{ width: "min(680px, 92vw)", display: "flex", flexDirection: "column", gap: 26 }}>

        <div style={{ textAlign: "center" }}>
          <h2 style={{ color: T.text, fontFamily: FONT_D, fontSize: 38, fontWeight: 800, margin: "0 0 8px" }}>
            Como você vai consumir?
          </h2>
          <p style={{ color: T.muted, fontFamily: FONT_B, fontSize: 20, margin: 0 }}>
            Escolha uma opção pra continuar
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {OPTIONS.map((o) => (
            <button
              key={o.type}
              onClick={() => onSelect(o.type)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                height: 220,
                background: T.numBg,
                border: `2px solid ${T.border}`,
                borderRadius: 16,
                cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.roxo; e.currentTarget.style.background = T.numHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.numBg; }}
            >
              <span style={{ fontSize: 56 }}>{o.icon}</span>
              <span style={{ color: T.text, fontFamily: FONT_D, fontSize: 24, fontWeight: 800 }}>
                {o.label}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={onBack}
          style={{
            padding: "0 28px",
            height: 88,
            background: T.surface,
            border: `1.5px solid ${T.border}`,
            borderRadius: 12,
            color: T.text,
            cursor: "pointer",
            fontFamily: FONT_D,
            fontSize: 22,
            textTransform: "uppercase",
            letterSpacing: 1,
            fontWeight: 700,
            alignSelf: "flex-start",
          }}
        >
          ← Voltar
        </button>

      </div>
    </div>
  );
}
