import { useState, FormEvent } from "react";
import type { Theme } from "../themes";
import { RADIUS, FONT } from "../scale";

const STORAGE_KEY = "ordin_terminal_id";

interface Props {
  T: Theme;
  onDone: () => void;
}

export default function DeviceSetupScreen({ T, onDone }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const id = parseInt(value.trim(), 10);
    if (!id || id < 1) { setError("Informe um ID de terminal válido."); return; }
    localStorage.setItem(STORAGE_KEY, String(id));
    onDone();
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: T.radial,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <div style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: RADIUS.lg,
        padding: "40px 48px",
        width: 360,
        boxShadow: "0 8px 40px rgba(153,0,255,0.12)",
        textAlign: "center",
      }}>
        <div style={{ fontSize: FONT.headlineLg, marginBottom: 16 }}>🖥️</div>
        <h2 style={{ color: T.text, fontSize: FONT.subtitle, fontWeight: 800, marginBottom: 8 }}>
          Configuração do Dispositivo
        </h2>
        <p style={{ color: T.muted, fontSize: FONT.body, marginBottom: 28 }}>
          Informe o ID do terminal configurado no Admin Panel.
          Esta tela aparece apenas na primeira vez.
        </p>
        {error && (
          <div style={{
            color: T.errorText,
            background: T.errorBg,
            borderRadius: RADIUS.sm,
            padding: "8px 12px",
            fontSize: FONT.body,
            marginBottom: 16,
          }}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <input
            type="number"
            min="1"
            placeholder="ID do terminal (ex: 1)"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            style={{
              width: "100%",
              padding: "12px 16px",
              background: T.numBg,
              border: `1px solid ${T.border}`,
              borderRadius: RADIUS.sm,
              color: T.text,
              fontSize: FONT.subtitle,
              textAlign: "center",
              outline: "none",
              marginBottom: 16,
            }}
          />
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "16px",
              background: T.btn,
              color: T.btnText,
              border: "none",
              borderRadius: RADIUS.sm,
              fontSize: FONT.bodyLg,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: T.glow,
            }}
          >
            Salvar e continuar
          </button>
        </form>
      </div>
    </div>
  );
}

export function getStoredTerminalId(): number | null {
  const v = localStorage.getItem(STORAGE_KEY);
  const id = v ? parseInt(v, 10) : NaN;
  return isNaN(id) ? null : id;
}
