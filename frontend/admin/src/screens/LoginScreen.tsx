import { useState, FormEvent } from "react";
import axios from "axios";
import { useStore } from "../store";

const S = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--a-bg)",
  } as React.CSSProperties,
  card: {
    background: "var(--a-surface)",
    border: "1px solid rgba(153,0,255,0.22)",
    borderRadius: 16,
    padding: "40px 48px",
    width: 380,
  } as React.CSSProperties,
  logo: {
    fontSize: 28,
    fontWeight: 700,
    color: "#9900ff",
    marginBottom: 4,
  } as React.CSSProperties,
  sub: {
    color: "rgba(var(--a-text-rgb),0.5)",
    fontSize: 13,
    marginBottom: 32,
  } as React.CSSProperties,
  label: {
    display: "block",
    color: "rgba(var(--a-text-rgb),0.7)",
    fontSize: 13,
    marginBottom: 6,
  } as React.CSSProperties,
  input: {
    width: "100%",
    padding: "10px 14px",
    background: "rgba(153,0,255,0.08)",
    border: "1px solid rgba(153,0,255,0.25)",
    borderRadius: 8,
    color: "var(--a-text)",
    fontSize: 15,
    outline: "none",
    marginBottom: 16,
  } as React.CSSProperties,
  btn: {
    width: "100%",
    padding: "12px",
    background: "#9900ff",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 8,
  } as React.CSSProperties,
  error: {
    color: "#ff4d6d",
    fontSize: 13,
    marginBottom: 16,
    padding: "8px 12px",
    background: "rgba(255,77,109,0.1)",
    borderRadius: 6,
  } as React.CSSProperties,
};

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const login = useStore((s) => s.login);

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
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>ordin</div>
        <div style={S.sub}>Painel administrativo</div>
        {error && <div style={S.error}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <label style={S.label} htmlFor="login-email">E-mail</label>
          <input
            id="login-email"
            style={S.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            required
          />
          <label style={S.label} htmlFor="login-password">Senha</label>
          <input
            id="login-password"
            style={S.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button style={S.btn} type="submit" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
