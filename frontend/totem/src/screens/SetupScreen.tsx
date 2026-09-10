import { useState } from "react";
import axios from "axios";
import { Monitor, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";
import type { Theme } from "../themes";
import type { CompanyInfo, TerminalInfo, AvailableTerminal } from "../types";
import { FONT } from "../scale";
import { OrdinSymbol } from "../assets/OrdinSymbol";
import DevicePairingScreen from "./DevicePairingScreen";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

const FONT_D = "'Lexend', sans-serif";
const FONT_B = "'Inter', sans-serif";

type Step = "pairing" | "pin" | "terminal" | "testing";

interface Props {
  T: Theme;
  savedTerminalId: number | null;
  onDone: (company: CompanyInfo, terminal: TerminalInfo, token: string) => void;
}

function Numpad({ onPress, onDel, T }: { onPress: (v: string) => void; onDel: () => void; T: Theme }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((k, i) => (
        <button
          key={i}
          onClick={() => k === "⌫" ? onDel() : k !== "" ? onPress(String(k)) : undefined}
          className="rounded-lg"
          style={{
            padding: "24px 0",
            fontSize: FONT.subtitle,
            fontWeight: 600,
            background: k === "" ? "transparent" : T.numBg,
            color: T.text,
            border: `1px solid ${k === "" ? "transparent" : T.border}`,
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
  const [step, setStep] = useState<Step>("pairing");
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

  // 6 dígitos — mesmo tamanho que company-service gera em create_company e
  // regenerate_pin (secrets.randbelow(900000) + 100000), já coberto por
  // teste (len(pin) == 6). Esta tela ficou travada em 4 dígitos por engano
  // (ORD-109, achado ao vivo) — qualquer PIN regenerado ficava impossível
  // de usar aqui, só os PINs de 4 dígitos gravados direto no seed antigo
  // (pré-regenerate-pin) funcionavam.
  function pressPin(v: string) {
    if (pinLoading || blocked || pin.length >= 6) return;
    const next = pin + v;
    setPin(next);
    if (next.length === 6) setTimeout(() => tryPin(next), 150);
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

  // Etapa 0 — Pareamento por código/QR
  if (step === "pairing") {
    return (
      <DevicePairingScreen
        T={T}
        onDone={onDone}
        onUsePIN={() => setStep("pin")}
      />
    );
  }

  // Etapa 1 — PIN (fallback)
  if (step === "pin") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: T.radial }}>
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-4">
            <OrdinSymbol size={56} color="#9900ff" />
          </div>
          <div style={{ fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.title, color: "#9900ff", letterSpacing: "-0.5px" }}>ordin</div>
          <p className="mt-2" style={{ fontFamily: FONT_B, color: T.muted, fontSize: FONT.body }}>Digite o PIN da empresa para começar</p>
        </div>
        <Card style={{ width: 360, boxShadow: "0 8px 40px rgba(153,0,255,0.12)" }}>
          <CardContent>
            <div className="flex justify-center gap-4 mb-6" style={{ animation: shake ? "shake 0.4s" : "none" }}>
              {[0,1,2,3,4,5].map((i) => (
                <div
                  key={i}
                  className="rounded-full"
                  style={{
                    width: 16, height: 16,
                    background: pin.length > i ? T.roxo : T.border,
                    transition: "background 0.15s",
                    boxShadow: pin.length > i ? `0 0 10px ${T.roxo}` : "none",
                  }}
                />
              ))}
            </div>
            {pinError && (
              <p className="text-center mb-4" style={{ color: T.errorText, fontSize: FONT.body }}>
                {pinError}
              </p>
            )}
            {pinLoading ? (
              <div className="text-center" style={{ padding: "24px 0" }}>
                <Spinner className="mx-auto size-10" style={{ color: T.roxo }} />
              </div>
            ) : (
              <Numpad onPress={pressPin} onDel={() => { if (!blocked) setPin((p) => p.slice(0, -1)); }} T={T} />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Etapa 2 — Selecionar terminal
  if (step === "terminal") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: T.radial }}>
        <Card style={{ width: 420, boxShadow: "0 8px 40px rgba(153,0,255,0.12)" }}>
          <CardContent>
            <div className="text-center mb-6">
              <Monitor className="mx-auto mb-2" size={FONT.headline} color={T.roxo} />
              <h2 style={{ fontFamily: FONT_D, color: T.text, fontSize: FONT.subtitle, fontWeight: 800 }}>
                {company?.name}
              </h2>
              <p className="mt-2" style={{ fontFamily: FONT_B, color: T.muted, fontSize: FONT.body }}>
                Selecione o terminal desta máquina
              </p>
            </div>

            {terminalError && (
              <div
                className="text-center rounded-lg mb-4"
                style={{ color: T.errorText, background: T.errorBg, padding: "8px 16px", fontSize: FONT.body }}
              >
                {terminalError}
              </div>
            )}

            {terminals.length === 0 ? (
              <div className="text-center" style={{ padding: "24px 0" }}>
                <p className="mb-4" style={{ color: T.muted, fontSize: FONT.body }}>
                  Nenhum terminal disponível.<br/>
                  Verifique no Admin Panel se há terminais ativos.
                </p>
                <Button
                  onClick={() => { setStep("pin"); setPin(""); setPinError(""); }}
                  className="rounded-full"
                  style={{ padding: "16px 24px", background: T.btn, color: T.btnText, fontFamily: FONT_D, fontSize: FONT.body, fontWeight: 700, boxShadow: T.glow }}
                >
                  Tentar novamente
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {terminals.map((t) => {
                  const isSaved = t.id === savedTerminalId;
                  return (
                    <button
                      key={t.id}
                      disabled={terminalLoading}
                      onClick={() => selectTerminal(t)}
                      className="flex items-center gap-4 rounded-lg w-full text-left"
                      style={{
                        padding: 16,
                        background: isSaved ? `${T.roxo}22` : T.numBg,
                        border: `1px solid ${isSaved ? T.roxo : T.border}`,
                        color: T.text,
                        cursor: terminalLoading ? "not-allowed" : "pointer",
                      }}
                    >
                      <div
                        className="rounded-lg flex items-center justify-center shrink-0"
                        style={{ width: 36, height: 36, background: `${T.roxo}33` }}
                      >
                        <Monitor size={18} color={T.roxo} />
                      </div>
                      <div className="flex-1">
                        <div style={{ fontWeight: 700, fontSize: FONT.bodyLg }}>{t.label}</div>
                        <div className="mt-1" style={{ fontSize: FONT.label, color: T.muted }}>
                          {t.terminal_code && `Cód: ${t.terminal_code}`}
                          {t.tef_number && ` · TEF: ${t.tef_number}`}
                        </div>
                      </div>
                      {isSaved && (
                        <Badge style={{ background: `${T.roxo}33`, color: T.roxo }}>
                          ÚLTIMO
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <Button
              variant="outline"
              onClick={() => { setStep("pin"); setPin(""); setPinError(""); }}
              className="mt-6 w-full rounded-full"
              style={{ padding: 16, fontFamily: FONT_D, color: T.muted, fontSize: FONT.body, fontWeight: 600 }}
            >
              <ArrowLeft className="size-4" /> Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Etapa 3 — Teste de conexão
  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: T.radial }}>
      <Card className="text-center" style={{ boxShadow: "0 8px 40px rgba(153,0,255,0.12)" }}>
        <CardContent>
          {testSuccess === null && (
            <>
              <Spinner className="mx-auto mb-4 size-12" style={{ color: T.roxo }} />
              <h2 className="mb-2" style={{ color: T.text, fontSize: FONT.subtitle, fontWeight: 700 }}>
                Testando conexão
              </h2>
              <p style={{ color: T.muted, fontSize: FONT.body }}>{testDetail}</p>
            </>
          )}

          {testSuccess === true && (
            <>
              <CheckCircle2 className="mx-auto mb-4" size={FONT.headlineLg} color={T.priceColor} />
              <h2 className="mb-2" style={{ fontFamily: FONT_D, color: T.priceColor, fontSize: FONT.subtitle, fontWeight: 800 }}>
                Máquina OK!
              </h2>
              <p style={{ fontFamily: FONT_B, color: T.muted, fontSize: FONT.body }}>{testDetail}</p>
              <p className="mt-2" style={{ fontFamily: FONT_B, color: T.muted, fontSize: FONT.label }}>Iniciando…</p>
            </>
          )}

          {testSuccess === false && (
            <>
              <AlertTriangle className="mx-auto mb-4" size={FONT.headlineLg} color={T.errorText} />
              <h2 className="mb-2" style={{ fontFamily: FONT_D, color: T.errorText, fontSize: FONT.subtitle, fontWeight: 700 }}>
                Falha na conexão
              </h2>
              <p className="mb-6" style={{ fontFamily: FONT_B, color: T.muted, fontSize: FONT.body }}>{testDetail}</p>
              <div className="flex gap-2 justify-center">
                <Button
                  onClick={retryTest}
                  className="rounded-full"
                  style={{ padding: "12px 24px", background: T.btn, color: T.btnText, fontFamily: FONT_D, fontSize: FONT.body, fontWeight: 700, boxShadow: T.glow }}
                >
                  Tentar novamente
                </Button>
                <Button
                  variant="outline"
                  onClick={backToTerminals}
                  className="rounded-full"
                  style={{ padding: "12px 24px", fontFamily: FONT_D, color: T.muted, fontSize: FONT.body, fontWeight: 600 }}
                >
                  Outro terminal
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
