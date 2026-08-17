import { useState, FormEvent } from "react";
import axios from "axios";
import { Alert, Button, InputBase } from "design-system";
import { QRCodeSVG } from "qrcode.react";
import { useStore } from "../store";
import ThemeModeSwitch from "../components/ThemeModeSwitch";
import styles from "./LoginScreen.module.scss";

type Step = "credentials" | "setup-qr" | "backup-codes" | "code";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const login = useStore((s) => s.login);

  // ORD-088: passo de duplo fator — /auth/login pode responder com
  // mfa_required em vez dos tokens finais (usuário com TOTP ativo, ou
  // empresa com política "required" e usuário ainda sem TOTP configurado).
  const [step, setStep] = useState<Step>("credentials");
  const [mfaToken, setMfaToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaUri, setMfaUri] = useState("");
  const [mfaBackupCodes, setMfaBackupCodes] = useState<string[]>([]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const r = await axios.post("/auth/login", { email, password });
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
      } else {
        setError("Erro ao conectar. Tente novamente.");
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
      const r = await axios.post("/auth/login/mfa-verify", { mfa_token: mfaToken, code: mfaCode });
      login(r.data.access_token, r.data.refresh_token);
    } catch {
      setError("Código inválido. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.themeToggle}>
        <ThemeModeSwitch />
      </div>
      <div className={styles.card}>
        <div className={styles.logo}>ordin</div>
        <div className={styles.sub}>Painel administrativo</div>
        {error && <div className={styles.error}><Alert variant="error" text={error} fullWidth /></div>}

        {step === "credentials" && (
          <form onSubmit={handleSubmit}>
            <div className={styles.field}>
              <InputBase
                label="E-mail"
                aria-label="E-mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className={styles.field}>
              <InputBase
                label="Senha"
                aria-label="Senha"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" fullWidth loading={loading}>Entrar</Button>
          </form>
        )}

        {step === "setup-qr" && (
          <form onSubmit={handleConfirmSetup}>
            <div className={styles.mfaHint}>
              Sua empresa exige duplo fator. Escaneie o QR code com um app autenticador
              (Google Authenticator, Authy, 1Password…) e digite o código gerado para continuar.
            </div>
            <div className={styles.mfaQrRow}>
              <QRCodeSVG value={mfaUri} size={200} />
              <div className={styles.mfaSecretFallback}>
                Não consegue escanear? Digite manualmente: <code>{mfaSecret}</code>
              </div>
            </div>
            <div className={styles.field}>
              <InputBase
                label="Código de 6 dígitos"
                aria-label="Código de 6 dígitos"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                autoFocus
                required
                maxLength={6}
              />
            </div>
            <Button type="submit" fullWidth loading={loading} disabled={mfaCode.length !== 6}>
              Confirmar ativação
            </Button>
          </form>
        )}

        {step === "backup-codes" && (
          <div>
            <div className={styles.mfaHint}>
              Duplo fator ativado! Guarde estes 10 códigos de backup — cada um funciona uma única vez e serve
              para entrar caso você perca o acesso ao app autenticador. <strong>Eles não serão mostrados de novo.</strong>
            </div>
            <div className={styles.mfaBackupCodes}>
              {mfaBackupCodes.map((c) => <code key={c}>{c}</code>)}
            </div>
            <Button fullWidth onClick={() => setStep("code")}>Já salvei meus códigos — continuar</Button>
          </div>
        )}

        {step === "code" && (
          <form onSubmit={handleVerifyCode}>
            <div className={styles.mfaHint}>
              Digite o código de 6 dígitos do seu app autenticador (ou um código de backup).
            </div>
            <div className={styles.field}>
              <InputBase
                label="Código"
                aria-label="Código"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                autoFocus
                required
              />
            </div>
            <Button type="submit" fullWidth loading={loading}>Entrar</Button>
          </form>
        )}
      </div>
    </div>
  );
}
