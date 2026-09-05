import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { QRCodeSVG } from "qrcode.react";
import type { Theme } from "../themes";
import type { CompanyInfo, TerminalInfo } from "../types";
import { FONT } from "../scale";
import { OrdinSymbol } from "../assets/OrdinSymbol";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
    <div className="min-h-screen flex flex-col items-center justify-center p-8" style={{ background: T.radial }}>
      <Card className="text-center" style={{ maxWidth: 480, width: "100%", boxShadow: T.cardShadow }}>
        <CardContent style={{ padding: "40px 48px" }}>
          {/* Ícone + "ordin" em roxo fixo (não T.roxo) — telas de
              autenticação/configuração identificam o sistema, ao contrário
              da tela de boas-vindas (ORD-114). Mesmo padrão do SetupScreen. */}
          <div className="flex justify-center mb-4">
            <OrdinSymbol size={48} color="#9900ff" />
          </div>
          <div className="mb-2" style={{ fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.title, color: "#9900ff", letterSpacing: "-0.5px" }}>
            ordin
          </div>

          <div className="mb-2" style={{ fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.subtitle, color: T.text }}>
            Parear totem
          </div>
          <div className="mb-7 leading-relaxed" style={{ fontFamily: FONT_B, fontSize: FONT.body, color: T.muted }}>
            Digite o código no admin ou escaneie o QR com o celular
          </div>

          {err ? (
            <>
              <div className="mb-4" style={{ color: T.errorText, fontFamily: FONT_B, fontSize: FONT.body }}>{err}</div>
              <Button onClick={fetchChallenge} className="rounded-full" style={{ background: T.btn, color: T.btnText, padding: "12px 32px", fontFamily: FONT_D, fontWeight: 700, fontSize: FONT.bodyLg, boxShadow: T.glow }}>
                Tentar novamente
              </Button>
            </>
          ) : expired ? (
            <>
              <div className="mb-5" style={{ fontFamily: FONT_B, fontSize: FONT.body, color: T.muted }}>
                Código expirado.
              </div>
              <Button onClick={fetchChallenge} className="rounded-full" style={{ background: T.btn, color: T.btnText, padding: "12px 32px", fontFamily: FONT_D, fontWeight: 700, fontSize: FONT.bodyLg, boxShadow: T.glow }}>
                Gerar novo código
              </Button>
            </>
          ) : code ? (
            <>
              <div
                className="mb-6 rounded-2xl"
                style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: FONT.headlineLg, fontWeight: 900,
                  letterSpacing: 10, color: T.roxo,
                  background: T.roxoSubtle,
                  padding: "16px 20px", border: `1px solid ${T.border}`,
                }}
              >
                {code}
              </div>

              {qrUrl && (
                <div className="flex justify-center mb-5">
                  <div className="rounded-lg" style={{ background: "#fff", padding: 12 }}>
                    <QRCodeSVG value={qrUrl} size={140} />
                  </div>
                </div>
              )}

              <div className="mb-2" style={{ fontFamily: FONT_B, fontSize: FONT.body, color: T.muted }}>
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
            className="block mx-auto bg-transparent border-none underline"
            style={{ marginTop: 16, color: T.muted, fontFamily: FONT_B, fontSize: FONT.body, cursor: "pointer" }}
          >
            Entrar com PIN
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
