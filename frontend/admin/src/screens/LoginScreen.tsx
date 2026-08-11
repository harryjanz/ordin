import { useState, FormEvent } from "react";
import axios from "axios";
import { Alert, Button, InputBase, Toggle } from "design-system";
import { useStore } from "../store";
import styles from "./LoginScreen.module.scss";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const login = useStore((s) => s.login);
  const adminThemeMode = useStore((s) => s.adminThemeMode);
  const toggleAdminThemeMode = useStore((s) => s.toggleAdminThemeMode);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const r = await axios.post("/auth/login", { email, password });
      login(r.data.access_token, r.data.refresh_token);
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

  return (
    <div className={styles.page}>
      {/* Toggle do design system em vez do emoji ☀️/🌙 — mesmo bug/fix do
          Sidebar, ver ORD-076. */}
      <div className={styles.themeToggle}>
        <Toggle
          name="admin-theme-login"
          checked={adminThemeMode === "dark"}
          onChange={toggleAdminThemeMode}
          aria-label={adminThemeMode === "dark" ? "Mudar para modo claro" : "Mudar para modo escuro"}
          data-testid="theme-toggle"
        />
      </div>
      <div className={styles.card}>
        <div className={styles.logo}>ordin</div>
        <div className={styles.sub}>Painel administrativo</div>
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
      </div>
    </div>
  );
}
