import { useState, FormEvent } from "react";
import axios from "axios";
import { Alert, Button, InputBase } from "design-system";
import styles from "./ForgotPasswordScreen.module.scss";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // ORD-097: sempre responde com sucesso genérico, exista ou não o
      // e-mail — a UI não distingue os dois casos de propósito, mesma
      // cautela do backend contra enumeração de contas.
      await axios.post("/users/forgot-password", { email });
      setSent(true);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        setError("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
      } else {
        setError("Erro ao conectar. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logo}>ordin</div>
          <div className={styles.sub}>Verifique seu e-mail</div>
          <p className={styles.text}>
            Se esse e-mail existir na nossa base, você vai receber um link de redefinição de senha em instantes.
          </p>
          <Button fullWidth onClick={() => { window.location.href = "/login"; }}>
            Voltar para o login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>ordin</div>
        <div className={styles.sub}>Esqueci minha senha</div>
        <p className={styles.text}>
          Informe o e-mail da sua conta — vamos enviar um link para você definir uma senha nova.
        </p>
        {error && <div className={styles.error}><Alert variant="error" text={error} fullWidth /></div>}
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
          <Button type="submit" fullWidth loading={loading}>Enviar link de redefinição</Button>
        </form>
      </div>
    </div>
  );
}
