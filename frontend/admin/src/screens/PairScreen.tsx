import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api";
import { useStore } from "../store";

const FONT_D = "'Lexend', sans-serif";
const FONT_B = "'Inter', sans-serif";
const FONT_M = "'Courier New', monospace";

export default function PairScreen() {
  const companyId = useStore((s) => s.selectedCompanyId ?? s.companyId);
  const [searchParams, setSearchParams] = useSearchParams();

  const [code,      setCode]      = useState(() => searchParams.get("code") ?? "");
  const [terminal,  setTerminal]  = useState("");
  const [terminals, setTerminals] = useState<{ id: number; label: string }[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [msg,       setMsg]       = useState<{ ok: boolean; text: string } | null>(null);

  // Lê ?code= da URL e limpa o parâmetro
  useEffect(() => {
    const c = searchParams.get("code");
    if (c) { setCode(c.toUpperCase()); setSearchParams({}, { replace: true }); }
  }, [searchParams]);

  // Carrega terminais da empresa
  useEffect(() => {
    if (!companyId) return;
    api.get(`/companies/${companyId}/terminals`).then((r) => {
      const list: { id: number; label: string }[] = r.data.terminals ?? [];
      setTerminals(list);
      if (list.length > 0 && !terminal) setTerminal(String(list[0].id));
    }).catch(() => null);
  }, [companyId]);

  async function approve() {
    if (!companyId || !code.trim() || !terminal) return;
    setLoading(true);
    setMsg(null);
    try {
      await api.post(`/companies/${companyId}/devices/approve`, {
        code: code.trim().toUpperCase(),
        terminal_id: Number(terminal),
      });
      setMsg({ ok: true, text: "Totem pareado com sucesso!" });
      setCode("");
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setMsg({ ok: false, text: detail ?? "Código inválido ou expirado." });
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(null), 5000);
    }
  }

  const canApprove = !!code.trim() && !!terminal && !!companyId && !loading;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0e0b1a",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      padding: "72px 20px 40px",
      boxSizing: "border-box",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 440,
        background: "#1d1434",
        border: "1px solid rgba(153,0,255,0.2)",
        borderRadius: 16,
        padding: "32px 28px",
        boxSizing: "border-box",
      }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 22 }}>⊞</span>
            <h1 style={{
              fontFamily: FONT_D,
              fontSize: 20,
              fontWeight: 700,
              color: "#DFE8ED",
              margin: 0,
            }}>
              Parear totem
            </h1>
          </div>
          <p style={{
            fontFamily: FONT_B,
            fontSize: 14,
            color: "rgba(223,232,237,0.5)",
            margin: 0,
            lineHeight: 1.6,
          }}>
            Digite o código exibido no totem ou escaneie o QR com a câmera do celular para autenticar o dispositivo.
          </p>
        </div>

        {/* Campo de código */}
        <label style={{
          display: "block",
          fontFamily: FONT_B,
          fontSize: 12,
          color: "rgba(223,232,237,0.5)",
          marginBottom: 8,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}>
          Código do totem
        </label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))}
          placeholder="ABC123"
          maxLength={6}
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          inputMode="text"
          style={{
            display: "block",
            width: "100%",
            boxSizing: "border-box",
            fontFamily: FONT_M,
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: 10,
            textTransform: "uppercase",
            textAlign: "center",
            padding: "14px 16px",
            marginBottom: 20,
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${code.length === 6 ? "rgba(153,0,255,0.6)" : "rgba(153,0,255,0.25)"}`,
            borderRadius: 12,
            color: "#DFE8ED",
            outline: "none",
            transition: "border-color 0.15s",
          }}
        />

        {/* Select de terminal */}
        <label style={{
          display: "block",
          fontFamily: FONT_B,
          fontSize: 12,
          color: "rgba(223,232,237,0.5)",
          marginBottom: 8,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}>
          Terminal
        </label>
        <select
          value={terminal}
          onChange={(e) => setTerminal(e.target.value)}
          style={{
            display: "block",
            width: "100%",
            boxSizing: "border-box",
            padding: "14px 16px",
            marginBottom: 24,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(153,0,255,0.25)",
            borderRadius: 12,
            color: "#DFE8ED",
            fontFamily: FONT_B,
            fontSize: 15,
            minHeight: 52,
            cursor: "pointer",
            appearance: "none",
            WebkitAppearance: "none",
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%239900ff' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 16px center",
          }}
        >
          {terminals.length === 0 && (
            <option value="" disabled>Nenhum terminal encontrado</option>
          )}
          {terminals.map((t) => (
            <option key={t.id} value={t.id} style={{ background: "#1d1434" }}>
              {t.label}
            </option>
          ))}
        </select>

        {/* Botão de aprovar */}
        <button
          onClick={approve}
          disabled={!canApprove}
          style={{
            display: "block",
            width: "100%",
            padding: "16px",
            background: canApprove ? "#9900ff" : "rgba(153,0,255,0.3)",
            color: canApprove ? "#fff" : "rgba(255,255,255,0.4)",
            border: "none",
            borderRadius: 12,
            fontFamily: FONT_D,
            fontWeight: 700,
            fontSize: 16,
            cursor: canApprove ? "pointer" : "not-allowed",
            boxShadow: canApprove ? "0 4px 24px rgba(153,0,255,0.4)" : "none",
            transition: "background 0.15s, box-shadow 0.15s",
          }}
        >
          {loading ? "Pareando…" : "Aprovar pareamento"}
        </button>

        {/* Feedback */}
        {msg && (
          <div style={{
            marginTop: 16,
            padding: "12px 16px",
            borderRadius: 10,
            background: msg.ok ? "rgba(93,212,144,0.1)" : "rgba(255,107,91,0.1)",
            border: `1px solid ${msg.ok ? "rgba(93,212,144,0.3)" : "rgba(255,107,91,0.3)"}`,
            fontFamily: FONT_B,
            fontSize: 14,
            color: msg.ok ? "#5DD490" : "#ff6b5b",
            textAlign: "center",
          }}>
            {msg.text}
          </div>
        )}

        {/* Dica */}
        <p style={{
          marginTop: 24,
          fontFamily: FONT_B,
          fontSize: 12,
          color: "rgba(223,232,237,0.3)",
          textAlign: "center",
          lineHeight: 1.6,
        }}>
          O código expira em 5 minutos e é de uso único.
          <br />
          Gere um novo no totem se necessário.
        </p>
      </div>
    </div>
  );
}
