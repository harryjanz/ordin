import { Hand } from "lucide-react";
import type { Theme } from "../themes";
import { FONT } from "../scale";

const FONT_D = "'Lexend', sans-serif";

interface Props {
  T: Theme;
  companyName: string;
  onStart: () => void;
}

export default function WelcomeScreen({ T, companyName, onStart }: Props) {
  return (
    <div
      onClick={onStart}
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
      }}
    >
      {/* Marca — só a da empresa, de propósito (ORD-114): esta é a única
          tela vista pelo cliente final antes de decidir tocar pra começar,
          nenhuma identificação do fornecedor de software (Ordin) aqui. */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{
          fontFamily: FONT_D,
          fontWeight: 900,
          fontSize: FONT.headlineLg,
          color: T.text,
          letterSpacing: "-1px",
          lineHeight: 1,
          marginBottom: 8,
        }}>
          {companyName}
        </div>
        <div style={{
          fontFamily: FONT_D,
          color: T.roxo,
          fontSize: FONT.body,
          fontWeight: 700,
          letterSpacing: "4px",
          textTransform: "uppercase",
        }}>
          Autoatendimento
        </div>
      </div>

      {/* CTA — pulse */}
      <div style={{
        animation: "pulse 2.4s ease-in-out infinite",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
      }}>
        <div style={{
          width: 88,
          height: 88,
          borderRadius: "50%",
          background: T.roxoSubtle,
          border: `2px solid ${T.roxo}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "glow 2.4s ease-in-out infinite",
        }}>
          <Hand size={44} color={T.roxo} strokeWidth={1.5} />
        </div>
        <div style={{
          fontFamily: FONT_D,
          fontSize: FONT.headline,
          fontWeight: 800,
          color: T.text,
          letterSpacing: "-0.5px",
        }}>
          Toque para começar
        </div>
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: FONT.bodyLg,
          color: T.muted,
          fontWeight: 400,
        }}>
          Faça seu pedido em minutos
        </div>
      </div>
    </div>
  );
}
