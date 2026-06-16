import type { Theme, ThemeKey } from "../themes";

const FONT_D = "'Lexend', sans-serif";

interface Props {
  T: Theme;
  themeKey: ThemeKey;
  companyName: string;
  onStart: () => void;
  onThemeToggle: () => void;
}

export default function WelcomeScreen({ T, themeKey, companyName, onStart, onThemeToggle }: Props) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.radial,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        userSelect: "none",
        WebkitUserSelect: "none",
        position: "relative",
      }}
    >
      {/* Toggle de tema — canto superior direito */}
      <button
        onClick={(e) => { e.stopPropagation(); onThemeToggle(); }}
        style={{
          position: "absolute",
          top: 20,
          right: 24,
          padding: "8px 16px",
          borderRadius: 999,
          border: `1px solid ${T.border}`,
          background: T.surface,
          color: T.muted,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          fontFamily: FONT_D,
        }}
      >
        {themeKey === "dark" ? "☀️ Claro" : "🌙 Escuro"}
      </button>

      {/* Marca */}
      <div style={{ textAlign: "center", marginBottom: 72 }} onClick={onStart}>
        <svg
          width={80}
          height={80}
          viewBox="0 0 48 48"
          fill="none"
          style={{ display: "block", margin: "0 auto 20px" }}
        >
          <rect width="48" height="48" rx="14" fill="#9900ff" />
          <circle cx="24" cy="22" r="10" stroke="white" strokeWidth="3.5" fill="none" />
          <circle cx="24" cy="22" r="4" fill="white" />
          <rect x="14" y="34" width="20" height="3" rx="1.5" fill="white" opacity="0.4" />
        </svg>
        <div style={{
          fontFamily: FONT_D,
          fontWeight: 900,
          fontSize: 52,
          color: T.text,
          letterSpacing: "-1px",
          lineHeight: 1,
          marginBottom: 10,
        }}>
          {companyName}
        </div>
        <div style={{
          fontFamily: FONT_D,
          color: T.roxo,
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: "4px",
          textTransform: "uppercase",
        }}>
          Autoatendimento
        </div>
      </div>

      {/* CTA — pulse */}
      <div
        onClick={onStart}
        style={{
          animation: "pulse 2.4s ease-in-out infinite",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div style={{
          width: 88,
          height: 88,
          borderRadius: "50%",
          background: T.roxoSubtle,
          border: `2px solid ${T.roxo}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 40,
          animation: "glow 2.4s ease-in-out infinite",
        }}>
          👆
        </div>
        <div style={{
          fontFamily: FONT_D,
          fontSize: 42,
          fontWeight: 800,
          color: T.text,
          letterSpacing: "-0.5px",
        }}>
          Toque para começar
        </div>
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 16,
          color: T.muted,
          fontWeight: 400,
        }}>
          Faça seu pedido em minutos
        </div>
      </div>
    </div>
  );
}
