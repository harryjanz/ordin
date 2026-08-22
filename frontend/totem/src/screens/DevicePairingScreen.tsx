import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { QRCodeSVG } from "qrcode.react";
import type { Theme } from "../themes";
import type { CompanyInfo, TerminalInfo } from "../types";
import { RADIUS, FONT } from "../scale";
import { OrdinSymbol } from "../assets/OrdinSymbol";

const FONT_D = "'Lexend', sans-serif";
const FONT_B = "'Inter', sans-serif";
const POLL_MS = 5000;
const TTL     = 300;

interface Props {
  T: Theme;
  onDone:   (company: CompanyInfo, terminal: TerminalInfo, token: string) => void;
  onUsePIN: () => void;
}

export default function DevicePairingScreen({ T, onDone, onUsePIN }: Props) {
  const [code,      setCode]      = useState<string | null>(null);
  const [qrUrl,     setQrUrl]     = useState<string | null>(null);
  const [expired,   setExpired]   = useState(false);
  const [countdown, setCountdown] = useState(TTL);
  const [err,       setErr]       = useState<string | null>(null);
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimers() {
    if (pollRef.current)  clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  async function fetchChallenge() {
    clearTimers();
    setExpired(false);
    setErr(null);
    setCode(null);
    setQrUrl(null);
    setCountdown(TTL);
    try {
      const r = await axios.post("/auth/device/challenge");
      setCode(r.data.code);
      setQrUrl(r.data.qr_url);
      startPolling(r.data.code);
      startCountdown();
    } catch {
      setErr("Erro ao gerar código. Tente novamente.");
    }
  }

  function startPolling(c: string) {
    pollRef.current = setInterval(async () => {
      try {
        const r = await axios.get(`/auth/device/status?code=${c}`);
        if (r.data.status === "approved") {
          clearTimers();
          onDone(r.data.company, r.data.terminal, r.data.access_token);
        } else if (r.data.status === "expired") {
          clearTimers();
          setExpired(true);
        }
      } catch { /* ignora erros de polling */ }
    }, POLL_MS);
  }

  function startCountdown() {
    timerRef.current = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) { clearTimers(); setExpired(true); return 0; }
        return n - 1;
      });
    }, 1000);
  }

  useEffect(() => { fetchChallenge(); return clearTimers; }, []);

  const mins = String(Math.floor(countdown / 60)).padStart(2, "0");
  const secs = String(countdown % 60).padStart(2, "0");

  return (
    <div style={{
      minHeight: "100vh", background: T.radial,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: 32,
    }}>
      <div style={{
        background: T.surface, borderRadius: RADIUS.lg,
        border: `1px solid ${T.border}`,
        padding: "40px 48px", maxWidth: 480, width: "100%",
        textAlign: "center", boxShadow: T.cardShadow,
      }}>
        {/* Ícone + "ordin" em roxo fixo (não T.roxo) — telas de
            autenticação/configuração identificam o sistema, ao contrário
            da tela de boas-vindas (ORD-114). Mesmo padrão do SetupScreen. */}
        <div style={{ marginBottom: 16, display: "flex", justifyContent: "center" }}>
          <OrdinSymbol size={48} color="#9900ff" />
        </div>
        <div style={{ fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.title, color: "#9900ff", letterSpacing: "-0.5px", marginBottom: 8 }}>
          ordin
        </div>

        <div style={{ fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.subtitle, color: T.text, marginBottom: 8 }}>
          Parear totem
        </div>
        <div style={{ fontFamily: FONT_B, fontSize: FONT.body, color: T.muted, marginBottom: 28, lineHeight: 1.6 }}>
          Digite o código no admin ou escaneie o QR com o celular
        </div>

        {err ? (
          <>
            <div style={{ color: T.errorText, fontFamily: FONT_B, fontSize: FONT.body, marginBottom: 16 }}>{err}</div>
            <button onClick={fetchChallenge} style={btnStyle(T)}>Tentar novamente</button>
          </>
        ) : expired ? (
          <>
            <div style={{ fontFamily: FONT_B, fontSize: FONT.body, color: T.muted, marginBottom: 20 }}>
              Código expirado.
            </div>
            <button onClick={fetchChallenge} style={btnStyle(T)}>Gerar novo código</button>
          </>
        ) : code ? (
          <>
            <div style={{
              fontFamily: "'Courier New', monospace",
              fontSize: FONT.headlineLg, fontWeight: 900,
              letterSpacing: 10, color: T.roxo,
              background: T.roxoSubtle,
              borderRadius: RADIUS.lg, padding: "16px 20px",
              marginBottom: 24, border: `1px solid ${T.border}`,
            }}>
              {code}
            </div>

            {qrUrl && (
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                <div style={{ background: "#fff", padding: 12, borderRadius: RADIUS.sm }}>
                  <QRCodeSVG value={qrUrl} size={140} />
                </div>
              </div>
            )}

            <div style={{ fontFamily: FONT_B, fontSize: FONT.body, color: T.muted, marginBottom: 8 }}>
              Expira em{" "}
              <span style={{ fontWeight: 700, color: countdown < 60 ? T.errorText : T.text }}>
                {mins}:{secs}
              </span>
            </div>
          </>
        ) : (
          <div style={{ color: T.muted, fontFamily: FONT_B, fontSize: FONT.body, padding: "20px 0" }}>
            Gerando código…
          </div>
        )}

        <button
          onClick={onUsePIN}
          style={{
            display: "block", margin: "16px auto 0",
            background: "transparent", border: "none",
            color: T.muted, fontFamily: FONT_B, fontSize: FONT.body,
            cursor: "pointer", textDecoration: "underline",
          }}
        >
          Entrar com PIN
        </button>
      </div>
    </div>
  );
}

function btnStyle(T: Theme): React.CSSProperties {
  return {
    background: T.btn, color: T.btnText, border: "none",
    borderRadius: RADIUS.pill, padding: "12px 32px",
    fontFamily: FONT_D, fontWeight: 700, fontSize: FONT.bodyLg,
    cursor: "pointer", boxShadow: T.glow,
  };
}
