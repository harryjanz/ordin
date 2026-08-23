import { useState, FormEvent } from "react";
import axios from "axios";
import { QRCodeSVG } from "qrcode.react";
import { useStore } from "../store";
import { getDeviceTrustToken, setDeviceTrustToken } from "../deviceTrust";

// ORD-120 — duplo fator (ORD-088/092) nunca tinha sido portado pro app de
// balcão: /auth/login pode responder com mfa_required em vez dos tokens
// finais (usuário com TOTP ativo, ou empresa com política "required" e
// usuário ainda sem TOTP configurado). Sem esse passo, login falhava
// silenciosamente pra qualquer empresa com MFA ativo — mesma lógica já
// existente e testada em frontend/admin/src/screens/LoginScreen.tsx, só
// portada pro estilo visual do balcão (inline, sem design-system).
type Step = "credentials" | "setup-qr" | "backup-codes" | "code";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const login = useStore((s) => s.login);

  const [step, setStep] = useState<Step>("credentials");
  const [mfaToken, setMfaToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaUri, setMfaUri] = useState("");
  const [mfaBackupCodes, setMfaBackupCodes] = useState<string[]>([]);
  // Balcão normalmente roda num dispositivo fixo do estabelecimento — marca
  // por padrão, mesmo padrão do admin (ORD-092).
  const [trustDevice, setTrustDevice] = useState(true);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const deviceToken = getDeviceTrustToken();
      const r = await axios.post(
        "/auth/login", { email, password },
        deviceToken ? { headers: { "X-Device-Trust": deviceToken } } : undefined
      );
      if (r.data.mfa_required) {
        setMfaToken(r.data.mfa_token);
        if (r.data.mfa_status === "setup_required") {
          const setup = await axios.post(
            "/users/me/mfa/setup", {}, { headers: { Authorization: `Bearer ${r.data.mfa_token}` } }
          );
          setMfaSecret(setup.data.secret);
          setMfaUri(setup.data.provisioning_uri);
          setStep("setup-qr");
        } else {
          setStep("code");
        }
      } else {
        login(r.data.access_token, r.data.refresh_token);
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        setError("E-mail ou senha incorretos.");
      } else if (axios.isAxiosError(err) && err.response?.status === 429) {
        setError("Muitas tentativas. Aguarde alguns minutos.");
      } else {
        setError("Erro ao conectar. Verifique a conexão.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmSetup(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const r = await axios.post(
        "/users/me/mfa/confirm", { code: mfaCode }, { headers: { Authorization: `Bearer ${mfaToken}` } }
      );
      setMfaBackupCodes(r.data.backup_codes);
      setMfaCode("");
      setStep("backup-codes");
    } catch {
      setError("Código inválido. Confira o app autenticador e tente de novo.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const r = await axios.post("/auth/login/mfa-verify", {
        mfa_token: mfaToken, code: mfaCode, trust_device: trustDevice,
      });
      if (r.data.device_token) setDeviceTrustToken(r.data.device_token);
      login(r.data.access_token, r.data.refresh_token);
    } catch {
      setError("Código inválido. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  const fieldLabel: React.CSSProperties = { display: "block", color: "rgba(223,232,237,0.6)", fontSize: 12, marginBottom: 6 };
  const fieldInput: React.CSSProperties = {
    width: "100%", padding: "10px 14px", background: "rgba(153,0,255,0.08)",
    border: "1px solid rgba(153,0,255,0.25)", borderRadius: 8, color: "#DFE8ED",
    fontSize: 15, outline: "none", marginBottom: 14,
  };
  const primaryBtn: React.CSSProperties = {
    width: "100%", padding: "12px", background: loading ? "rgba(153,0,255,0.4)" : "#9900ff",
    color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700,
    cursor: loading ? "default" : "pointer", boxShadow: "0 4px 20px rgba(153,0,255,0.35)",
  };
  const hint: React.CSSProperties = { color: "rgba(223,232,237,0.6)", fontSize: 13, marginBottom: 16, lineHeight: 1.5 };

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(ellipse at 60% 0%,rgba(153,0,255,0.18) 0%,transparent 60%),#0e0b1a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <div style={{
        background: "#1d1434",
        border: "1px solid rgba(153,0,255,0.22)",
        borderRadius: 20,
        padding: "40px 48px",
        width: 380,
        boxShadow: "0 8px 40px rgba(153,0,255,0.12)",
      }}>
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#9900ff", letterSpacing: "-0.5px" }}>ordin</div>
          <div style={{ color: "rgba(223,232,237,0.45)", fontSize: 13, marginTop: 4 }}>App de balcão</div>
        </div>

        {error && (
          <div style={{
            color: "#ff4d6d", background: "rgba(255,77,109,0.1)", borderRadius: 8,
            padding: "8px 12px", fontSize: 13, marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {step === "credentials" && (
          <form onSubmit={handleSubmit}>
            <label style={fieldLabel}>E-mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus style={fieldInput} />
            <label style={fieldLabel}>Senha</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ ...fieldInput, marginBottom: 20 }} />
            <button type="submit" disabled={loading} style={primaryBtn}>
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>
        )}

        {step === "setup-qr" && (
          <form onSubmit={handleConfirmSetup}>
            <div style={hint}>
              Sua empresa exige duplo fator. Escaneie o QR code com um app autenticador
              (Google Authenticator, Authy, 1Password…) e digite o código gerado para continuar.
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <div style={{ background: "#fff", padding: 12, borderRadius: 8 }}>
                <QRCodeSVG value={mfaUri} size={180} />
              </div>
              <div style={{ color: "rgba(223,232,237,0.5)", fontSize: 12, textAlign: "center", wordBreak: "break-all" }}>
                Não consegue escanear? Digite manualmente: <code style={{ color: "#DFE8ED" }}>{mfaSecret}</code>
              </div>
            </div>
            <label style={fieldLabel}>Código de 6 dígitos</label>
            <input
              value={mfaCode} onChange={(e) => setMfaCode(e.target.value)}
              autoFocus required maxLength={6} style={{ ...fieldInput, marginBottom: 20 }}
            />
            <button type="submit" disabled={loading || mfaCode.length !== 6} style={primaryBtn}>
              Confirmar ativação
            </button>
          </form>
        )}

        {step === "backup-codes" && (
          <div>
            <div style={hint}>
              Duplo fator ativado! Guarde estes 10 códigos de backup — cada um funciona uma única vez e serve
              para entrar caso você perca o acesso ao app autenticador. <strong>Eles não serão mostrados de novo.</strong>
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
              background: "rgba(153,0,255,0.08)", border: "1px solid rgba(153,0,255,0.2)",
              borderRadius: 8, padding: 16, marginBottom: 20,
            }}>
              {mfaBackupCodes.map((c) => (
                <code key={c} style={{ color: "#DFE8ED", fontSize: 13, textAlign: "center" }}>{c}</code>
              ))}
            </div>
            <button onClick={() => setStep("code")} style={primaryBtn}>
              Já salvei meus códigos — continuar
            </button>
          </div>
        )}

        {step === "code" && (
          <form onSubmit={handleVerifyCode}>
            <div style={hint}>
              Digite o código de 6 dígitos do seu app autenticador (ou um código de backup).
            </div>
            <label style={fieldLabel}>Código</label>
            <input value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} autoFocus required style={fieldInput} />
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(223,232,237,0.6)", fontSize: 13, marginBottom: 20, cursor: "pointer" }}>
              <input type="checkbox" checked={trustDevice} onChange={(e) => setTrustDevice(e.target.checked)} />
              Confiar neste dispositivo por 7 dias
            </label>
            <button type="submit" disabled={loading} style={primaryBtn}>
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
