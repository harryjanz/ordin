import type { Theme } from "../themes";
import { RADIUS, FONT } from "../scale";

const FONT_D = "'Lexend', sans-serif";

const ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];

// Altura fixa por tecla — mesmo padrão do numpad da CpfScreen, nunca cresce
const KEY_H = 64;

interface Props {
  T: Theme;
  onKey: (char: string) => void;
  onBackspace: () => void;
  onClear: () => void;
}

// Teclado virtual próprio pro totem — kiosks touch rodam em modo trancado
// (kiosk mode) e frequentemente não abrem o teclado nativo do sistema ao
// focar um <input>, mesmo padrão de motivo pelo qual a CpfScreen já usa um
// numpad customizado em vez de input nativo. Sempre que precisar de um
// campo de texto livre no fluxo do totem (não só números), reaproveitar
// este componente — nunca confiar no teclado do SO aparecer sozinho.
export default function TextKeyboard({ T, onKey, onBackspace, onClear }: Props) {
  const keyStyle: React.CSSProperties = {
    height: KEY_H,
    fontSize: FONT.subtitle,
    fontWeight: 700,
    fontFamily: FONT_D,
    background: T.numBg,
    color: T.text,
    border: `1px solid ${T.border}`,
    borderRadius: RADIUS.sm,
    cursor: "pointer",
    transition: "background 0.1s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    flex: 1,
  };

  function keyDown(e: React.MouseEvent<HTMLButtonElement>) {
    e.currentTarget.style.background = T.numHover;
  }
  function keyUp(e: React.MouseEvent<HTMLButtonElement>) {
    e.currentTarget.style.background = T.numBg;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {ROWS.map((row, i) => (
        <div key={i} style={{ display: "flex", gap: 8 }}>
          {row.map((ch) => (
            <button
              key={ch}
              style={keyStyle}
              onClick={() => onKey(ch)}
              onMouseDown={keyDown}
              onMouseUp={keyUp}
              onMouseLeave={keyUp}
            >
              {ch}
            </button>
          ))}
        </div>
      ))}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          style={{ ...keyStyle, flex: 5 }}
          onClick={() => onKey(" ")}
          onMouseDown={keyDown}
          onMouseUp={keyUp}
          onMouseLeave={keyUp}
        >
          ESPAÇO
        </button>
        <button
          style={{ ...keyStyle, flex: 3, background: T.surface }}
          onClick={onBackspace}
          onMouseDown={keyDown}
          onMouseUp={keyUp}
          onMouseLeave={keyUp}
        >
          ⌫
        </button>
        <button
          style={{ ...keyStyle, flex: 3, background: T.surface, color: T.errorText, fontSize: FONT.body }}
          onClick={onClear}
          onMouseDown={keyDown}
          onMouseUp={keyUp}
          onMouseLeave={keyUp}
        >
          Apagar tudo
        </button>
      </div>
    </div>
  );
}
