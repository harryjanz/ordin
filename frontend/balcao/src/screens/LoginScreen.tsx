import { useState, FormEvent } from "react";
import axios from "axios";
import { useStore } from "../store";

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
      } else if (axios.isAxiosError(err) && err.response?.status === 429) {
        setError("Muitas tentativas. Aguarde alguns minutos.");
      } else {
        setError("Erro ao conectar. Verifique a conexão.");
      }
    } finally {
      setLoading(false);
    }
  }

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
            color: "#ff4d6d",
            background: "rgba(255,77,109,0.1)",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 13,
            marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", color: "rgba(223,232,237,0.6)", fontSize: 12, marginBottom: 6 }}>
            E-mail
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            style={{
              width: "100%",
              padding: "10px 14px",
              background: "rgba(153,0,255,0.08)",
              border: "1px solid rgba(153,0,255,0.25)",
              borderRadius: 8,
              color: "#DFE8ED",
              fontSize: 15,
              outline: "none",
              marginBottom: 14,
            }}
          />
          <label style={{ display: "block", color: "rgba(223,232,237,0.6)", fontSize: 12, marginBottom: 6 }}>
            Senha
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              width: "100%",
              padding: "10px 14px",
              background: "rgba(153,0,255,0.08)",
              border: "1px solid rgba(153,0,255,0.25)",
              borderRadius: 8,
              color: "#DFE8ED",
              fontSize: 15,
              outline: "none",
              marginBottom: 20,
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              background: loading ? "rgba(153,0,255,0.4)" : "#9900ff",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? "default" : "pointer",
              boxShadow: "0 4px 20px rgba(153,0,255,0.35)",
            }}
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
