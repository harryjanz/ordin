import { useState, FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { Alert, Button, InputBase } from "design-system";
import styles from "./SetPasswordScreen.module.scss";

const MIN_LENGTH = 8;

export default function SetPasswordScreen() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < MIN_LENGTH) {
      setError(`A senha precisa ter ao menos ${MIN_LENGTH} caracteres.`);
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
        setError(`A senha precisa ter ao menos ${MIN_LENGTH} caracteres.`);
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
          <div className={styles.logo}>ordin</div>
          <div className={styles.sub}>Definir senha</div>
          <Alert variant="error" text="Link inválido — falta o token de convite." fullWidth />
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logo}>ordin</div>
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
        <div className={styles.logo}>ordin</div>
        <div className={styles.sub}>Bem-vindo(a)! Defina sua senha para concluir o cadastro.</div>
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
          <Button type="submit" fullWidth loading={loading}>Definir senha</Button>
        </form>
      </div>
    </div>
  );
}
