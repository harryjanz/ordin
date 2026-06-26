import { useState } from "react";
import axios from "axios";
import type { Theme } from "../themes";
import type { CompanyInfo, TerminalInfo } from "../types";

// Layout ATM: 7-8-9 no topo (igual a terminais físicos e caixas eletrônicos)
const KEYS = [7, 8, 9, 4, 5, 6, 1, 2, 3, "", 0, "⌫"] as const;

interface Props {
  T: Theme;
  terminalId: number;
  onSuccess: (company: CompanyInfo, terminal: TerminalInfo, token: string) => void;
}

function Numpad({ onPress, onDel, T }: { onPress: (v: string) => void; onDel: () => void; T: Theme }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      border: `1px solid ${T.border}`,
      borderRadius: 16,
      overflow: "hidden",
    }}>
      {KEYS.map((k, i) => (
        <button
          key={i}
          onClick={() => k === "⌫" ? onDel() : k !== "" ? onPress(String(k)) : undefined}
          style={{
            minHeight: 84,
            fontSize: 26,
            fontWeight: 600,
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
  );
}

export default function PinScreen({ T, terminalId, onSuccess }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState(false);

  async function tryLogin(p: string) {
    setLoading(true);
    setError("");
    try {
      await axios.post("/auth/validate-pin", { pin: p });
      const loginRes = await axios.post("/auth/pin-login", { pin: p, terminal_id: terminalId });
      const { access_token, company, terminal } = loginRes.data;
      onSuccess(company, terminal, access_token);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 429) {
          setBlocked(true);
          setError("Muitas tentativas. Aguarde 15 minutos.");
          return;
        }
      }
      setError("PIN inválido. Tente novamente.");
      setShake(true);
      setTimeout(() => { setPin(""); setShake(false); }, 600);
    } finally {
      setLoading(false);
    }
  }

  function press(v: string) {
    if (loading || blocked || pin.length >= 4) return;
    const next = pin + v;
    setPin(next);
    if (next.length === 4) setTimeout(() => tryLogin(next), 150);
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
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <svg width={56} height={56} viewBox="0 0 48 48" fill="none" style={{ display: "block", margin: "0 auto 12px" }}>
          <rect width="48" height="48" rx="13" fill="#9900ff"/>
          <circle cx="24" cy="22" r="10" stroke="white" strokeWidth="3.5" fill="none"/>
          <circle cx="24" cy="22" r="4" fill="white"/>
          <rect x="14" y="34" width="20" height="3" rx="1.5" fill="white" opacity="0.4"/>
        </svg>
        <div style={{ fontWeight: 800, fontSize: 26, color: "#9900ff", letterSpacing: "-0.5px" }}>ordin</div>
        <p style={{ color: T.muted, fontSize: 14, marginTop: 6 }}>Digite o PIN da empresa para começar</p>
      </div>

      <div style={{ width: "min(400px, 92vw)" }}>
        {/* Indicadores de dígitos */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          gap: 16,
          marginBottom: 24,
          animation: shake ? "shake 0.4s" : "none",
        }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: pin.length > i ? T.roxo : T.border,
              transition: "background 0.15s",
              boxShadow: pin.length > i ? `0 0 10px ${T.roxo}` : "none",
            }} />
          ))}
        </div>

        {error && (
          <p style={{ color: T.errorText, textAlign: "center", fontSize: 13, marginBottom: 12 }}>
            {error}
          </p>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{
              width: 40,
              height: 40,
              border: `4px solid ${T.border}`,
              borderTop: `4px solid ${T.roxo}`,
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto",
            }} />
          </div>
        ) : (
          <Numpad
            onPress={press}
            onDel={() => { if (!blocked) setPin((p) => p.slice(0, -1)); }}
            T={T}
          />
        )}
      </div>
    </div>
  );
}
