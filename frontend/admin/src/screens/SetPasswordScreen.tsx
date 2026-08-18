import { useEffect, useState, FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { Alert, Button, InputBase, Tag } from "design-system";
import { OrdinSymbol } from "../assets/OrdinSymbol";
import styles from "./SetPasswordScreen.module.scss";

type Strength = "fraca" | "media" | "forte";

// ORD-090: mesma regra replicada no backend (services/company/main.py,
// _password_strength) — mudança aqui precisa de mudança lá também.
function passwordStrength(password: string): Strength {
  const hasLetter = /[A-Za-z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const strongChars = hasLetter && hasDigit && hasSpecial;
  if (password.length >= 12 && strongChars) return "forte";
  if (password.length >= 8 && strongChars) return "media";
  return "fraca";
}

const STRENGTH_LABEL: Record<Strength, string> = { fraca: "Fraca", media: "Média", forte: "Forte" };
const STRENGTH_VARIANT: Record<Strength, "error" | "warning" | "success"> = {
  fraca: "error", media: "warning", forte: "success",
};

export default function SetPasswordScreen() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  // Checa validade do link ao carregar — sem isso, um link já usado ou
  // expirado ainda mostrava o formulário normal, só falhando na submissão.
  const [inviteStatus, setInviteStatus] = useState<"checking" | "valid" | "invalid">(
    token ? "checking" : "invalid"
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    axios
      .get("/users/invite-status", { params: { token } })
      .then((r) => {
        if (!cancelled) setInviteStatus(r.data.valid ? "valid" : "invalid");
      })
      .catch(() => {
        if (!cancelled) setInviteStatus("invalid");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const strength = passwordStrength(password);
  const strengthTooLow = strength === "fraca";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (strengthTooLow) {
      setError("Senha fraca — use ao menos 8 caracteres com letra, número e caractere especial.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    try {
      await axios.post("/users/complete-registration", { token, password });
      setDone(true);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        setError("Convite inválido ou expirado. Peça um novo convite a quem te cadastrou.");
      } else if (axios.isAxiosError(err) && err.response?.status === 422) {
        setError("Senha fraca — use ao menos 8 caracteres com letra, número e caractere especial.");
      } else {
        setError("Erro ao conectar. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logoRow}>
            <OrdinSymbol size={26} />
            <span className={styles.logo}>ordin</span>
          </div>
          <div className={styles.sub}>Definir senha</div>
          <Alert variant="error" text="Link inválido — falta o token de convite." fullWidth />
        </div>
      </div>
    );
  }

  if (inviteStatus === "invalid") {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logoRow}>
            <OrdinSymbol size={26} />
            <span className={styles.logo}>ordin</span>
          </div>
          <div className={styles.sub}>Definir senha</div>
          <Alert
            variant="error"
            text="Este link já foi usado ou expirou. Peça um novo convite a quem te cadastrou."
            fullWidth
          />
        </div>
      </div>
    );
  }

  if (inviteStatus === "checking") {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logoRow}>
            <OrdinSymbol size={26} />
            <span className={styles.logo}>ordin</span>
          </div>
          <div className={styles.sub}>Verificando o link...</div>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logoRow}>
            <OrdinSymbol size={26} />
            <span className={styles.logo}>ordin</span>
          </div>
          <div className={styles.sub}>Senha definida com sucesso!</div>
          <Button fullWidth onClick={() => { window.location.href = "/login"; }}>
            Ir para o login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoRow}>
          <OrdinSymbol size={26} />
          <span className={styles.logo}>ordin</span>
        </div>
        {/* ORD-097: texto neutro — essa tela agora serve tanto pro primeiro
            acesso (convite, ORD-087) quanto pra um reset de senha; o
            token/endpoint por trás é o mesmo nos dois casos. */}
        <div className={styles.sub}>Defina sua nova senha.</div>
        {error && <div className={styles.error}><Alert variant="error" text={error} fullWidth /></div>}
        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <InputBase
              label="Nova senha"
              aria-label="Nova senha"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
            />
            {password.length > 0 && (
              <div className={styles.strength}>
                <Tag variant={STRENGTH_VARIANT[strength]}>{STRENGTH_LABEL[strength]}</Tag>
                <span className={styles.strengthHint}>
                  Mínimo Média: 8+ caracteres com letra, número e especial (12+ para Forte)
                </span>
              </div>
            )}
          </div>
          <div className={styles.field}>
            <InputBase
              label="Confirmar senha"
              aria-label="Confirmar senha"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" fullWidth loading={loading} disabled={strengthTooLow}>Definir senha</Button>
        </form>
      </div>
    </div>
  );
}
