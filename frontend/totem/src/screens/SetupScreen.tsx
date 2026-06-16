import { useState } from "react";
import axios from "axios";
import type { Theme } from "../themes";
import type { CompanyInfo, TerminalInfo, AvailableTerminal } from "../types";

const FONT_D = "'Lexend', sans-serif";
const FONT_B = "'Inter', sans-serif";

type Step = "pin" | "terminal" | "testing";

interface Props {
  T: Theme;
  savedTerminalId: number | null;
  onDone: (company: CompanyInfo, terminal: TerminalInfo, token: string) => void;
}

function Numpad({ onPress, onDel, T }: { onPress: (v: string) => void; onDel: () => void; T: Theme }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
      {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((k, i) => (
        <button
          key={i}
          onClick={() => k === "⌫" ? onDel() : k !== "" ? onPress(String(k)) : undefined}
          style={{
            padding: "18px 0",
            fontSize: 22,
            fontWeight: 600,
            background: k === "" ? "transparent" : T.numBg,
            color: T.text,
            border: `1px solid ${k === "" ? "transparent" : T.border}`,
            borderRadius: 12,
            cursor: k === "" ? "default" : "pointer",
          }}
        >
          {k}
        </button>
      ))}
    </div>
  );
}

export default function SetupScreen({ T, savedTerminalId, onDone }: Props) {
  const [step, setStep] = useState<Step>("pin");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [shake, setShake] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const [company, setCompany] = useState<{ id: number; name: string; plan: string } | null>(null);
  const [terminals, setTerminals] = useState<AvailableTerminal[]>([]);

  const [terminalLoading, setTerminalLoading] = useState(false);
  const [terminalError, setTerminalError] = useState("");

  const [testDetail, setTestDetail] = useState("");
  const [testSuccess, setTestSuccess] = useState<boolean | null>(null);
  const [pendingLogin, setPendingLogin] = useState<{ company: CompanyInfo; terminal: TerminalInfo; token: string } | null>(null);

  // ── Etapa 1: validar PIN ────────────────────────────────────────────────────

  async function tryPin(p: string) {
    setPinLoading(true);
    setPinError("");
    try {
      const r = await axios.post("/auth/validate-pin", { pin: p });
      const { company: co, terminals: terms } = r.data;
      setCompany(co);
      setTerminals(terms);
      setStep("terminal");
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        setBlocked(true);
        setPinError("Muitas tentativas. Aguarde 15 minutos.");
        return;
      }
      setPinError("PIN inválido. Tente novamente.");
      setShake(true);
      setTimeout(() => { setPin(""); setShake(false); }, 600);
    } finally {
      setPinLoading(false);
    }
  }

  function pressPin(v: string) {
    if (pinLoading || blocked || pin.length >= 4) return;
    const next = pin + v;
    setPin(next);
    if (next.length === 4) setTimeout(() => tryPin(next), 150);
  }

  // ── Etapa 2: selecionar terminal ────────────────────────────────────────────

  async function selectTerminal(t: AvailableTerminal) {
    setTerminalLoading(true);
    setTerminalError("");
    try {
      const r = await axios.post("/auth/pin-login", { pin, terminal_id: t.id });
      const { access_token, company: co, terminal: term } = r.data;
      localStorage.setItem("ordin_terminal_id", String(t.id));
      setPendingLogin({ company: co, terminal: term, token: access_token });
      setStep("testing");
      runTest(access_token, co, term);
    } catch {
      setTerminalError("Falha ao autenticar com este terminal. Tente outro.");
      setTerminalLoading(false);
    }
  }

  // ── Etapa 3: teste de conexão ───────────────────────────────────────────────

  async function runTest(token: string, co: CompanyInfo, term: TerminalInfo) {
    setTestSuccess(null);
    setTestDetail("Acionando máquina de pagamento…");
    try {
      const r = await axios.post(
        "/payments/test-connection",
        {},
        { headers: { Authorization: `Bearer ${token}` }, timeout: 33_000 },
      );
      setTestSuccess(r.data.success);
      setTestDetail(r.data.detail);
      if (r.data.success) {
        setTimeout(() => onDone(co, term, token), 1800);
      }
    } catch {
      setTestSuccess(false);
      setTestDetail("Erro de comunicação. Verifique a conexão e tente novamente.");
    }
  }

  function retryTest() {
    if (!pendingLogin) return;
    runTest(pendingLogin.token, pendingLogin.company, pendingLogin.terminal);
  }

  function backToTerminals() {
    setStep("terminal");
    setTerminalLoading(false);
    setTestSuccess(null);
    setTestDetail("");
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const wrap: React.CSSProperties = {
    minHeight: "100vh",
    background: T.radial,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  };

  const card: React.CSSProperties = {
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: 24,
    padding: 32,
    width: 360,
    boxShadow: "0 8px 40px rgba(153,0,255,0.12)",
  };

  // Etapa 1 — PIN
  if (step === "pin") {
    return (
      <div style={wrap}>
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <svg width={56} height={56} viewBox="0 0 48 48" fill="none" style={{ display: "block", margin: "0 auto 12px" }}>
            <rect width="48" height="48" rx="13" fill="#9900ff"/>
            <circle cx="24" cy="22" r="10" stroke="white" strokeWidth="3.5" fill="none"/>
            <circle cx="24" cy="22" r="4" fill="white"/>
            <rect x="14" y="34" width="20" height="3" rx="1.5" fill="white" opacity="0.4"/>
          </svg>
          <div style={{ fontFamily: FONT_D, fontWeight: 800, fontSize: 26, color: "#9900ff", letterSpacing: "-0.5px" }}>ordin</div>
          <p style={{ fontFamily: FONT_B, color: T.muted, fontSize: 14, marginTop: 6 }}>Digite o PIN da empresa para começar</p>
        </div>
        <div style={card}>
          <div style={{
            display: "flex",
            justifyContent: "center",
            gap: 16,
            marginBottom: 24,
            animation: shake ? "shake 0.4s" : "none",
          }}>
            {[0,1,2,3].map((i) => (
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
          {pinError && (
            <p style={{ color: T.errorText, textAlign: "center", fontSize: 13, marginBottom: 12 }}>
              {pinError}
            </p>
          )}
          {pinLoading ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{
                width: 40, height: 40,
                border: `4px solid ${T.border}`,
                borderTop: `4px solid ${T.roxo}`,
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
                margin: "0 auto",
              }} />
            </div>
          ) : (
            <Numpad onPress={pressPin} onDel={() => { if (!blocked) setPin((p) => p.slice(0, -1)); }} T={T} />
          )}
        </div>
      </div>
    );
  }

  // Etapa 2 — Selecionar terminal
  if (step === "terminal") {
    return (
      <div style={wrap}>
        <div style={{ ...card, width: 420 }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🖥️</div>
            <h2 style={{ fontFamily: FONT_D, color: T.text, fontSize: 20, fontWeight: 800, margin: 0 }}>
              {company?.name}
            </h2>
            <p style={{ fontFamily: FONT_B, color: T.muted, fontSize: 13, marginTop: 6 }}>
              Selecione o terminal desta máquina
            </p>
          </div>

          {terminalError && (
            <div style={{
              color: T.errorText, background: T.errorBg, borderRadius: 8,
              padding: "8px 12px", fontSize: 13, marginBottom: 16, textAlign: "center",
            }}>
              {terminalError}
            </div>
          )}

          {terminals.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <p style={{ color: T.muted, fontSize: 14, marginBottom: 16 }}>
                Nenhum terminal disponível.<br/>
                Verifique no Admin Panel se há terminais ativos.
              </p>
              <button
                onClick={() => { setStep("pin"); setPin(""); setPinError(""); }}
                style={{
                  padding: "10px 24px", background: T.btn, color: T.btnText,
                  border: "none", borderRadius: 999, fontFamily: FONT_D, fontSize: 14, fontWeight: 700, cursor: "pointer",
                  boxShadow: T.glow,
                }}
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {terminals.map((t) => {
                const isSaved = t.id === savedTerminalId;
                return (
                  <button
                    key={t.id}
                    disabled={terminalLoading}
                    onClick={() => selectTerminal(t)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "14px 16px",
                      background: isSaved ? `${T.roxo}22` : T.numBg,
                      border: `1px solid ${isSaved ? T.roxo : T.border}`,
                      borderRadius: 12,
                      color: T.text,
                      cursor: terminalLoading ? "not-allowed" : "pointer",
                      textAlign: "left",
                      width: "100%",
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: `${T.roxo}33`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, flexShrink: 0,
                    }}>
                      🖥️
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{t.label}</div>
                      <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                        {t.terminal_code && `Cód: ${t.terminal_code}`}
                        {t.tef_number && ` · TEF: ${t.tef_number}`}
                      </div>
                    </div>
                    {isSaved && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 7px",
                        borderRadius: 4, background: `${T.roxo}33`, color: T.roxo,
                      }}>
                        ÚLTIMO
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <button
            onClick={() => { setStep("pin"); setPin(""); setPinError(""); }}
            style={{
              marginTop: 20, width: "100%", padding: "10px",
              background: "transparent", border: `1px solid ${T.borderNeutral}`,
              borderRadius: 999, fontFamily: FONT_D, color: T.muted, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            ← Voltar
          </button>
        </div>
      </div>
    );
  }

  // Etapa 3 — Teste de conexão
  return (
    <div style={wrap}>
      <div style={{ ...card, textAlign: "center" }}>
        {testSuccess === null && (
          <>
            <div style={{
              width: 48, height: 48,
              border: `4px solid ${T.border}`,
              borderTop: `4px solid ${T.roxo}`,
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 20px",
            }} />
            <h2 style={{ color: T.text, fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>
              Testando conexão
            </h2>
            <p style={{ color: T.muted, fontSize: 14, margin: 0 }}>{testDetail}</p>
          </>
        )}

        {testSuccess === true && (
          <>
            <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
            <h2 style={{ fontFamily: FONT_D, color: T.priceColor, fontSize: 20, fontWeight: 800, margin: "0 0 8px" }}>
              Máquina OK!
            </h2>
            <p style={{ fontFamily: FONT_B, color: T.muted, fontSize: 13 }}>{testDetail}</p>
            <p style={{ fontFamily: FONT_B, color: T.muted, fontSize: 12, marginTop: 8 }}>Iniciando…</p>
          </>
        )}

        {testSuccess === false && (
          <>
            <div style={{ fontSize: 52, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontFamily: FONT_D, color: T.errorText, fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>
              Falha na conexão
            </h2>
            <p style={{ fontFamily: FONT_B, color: T.muted, fontSize: 13, marginBottom: 24 }}>{testDetail}</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={retryTest}
                style={{
                  padding: "12px 20px", background: T.btn, color: T.btnText,
                  border: "none", borderRadius: 999, fontFamily: FONT_D, fontSize: 14, fontWeight: 700, cursor: "pointer",
                  boxShadow: T.glow,
                }}
              >
                Tentar novamente
              </button>
              <button
                onClick={backToTerminals}
                style={{
                  padding: "12px 20px", background: "transparent",
                  border: `1px solid ${T.borderNeutral}`, borderRadius: 999,
                  fontFamily: FONT_D, color: T.muted, fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}
              >
                Outro terminal
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
