import { useState, useEffect } from "react";
import api from "../api";
import { useStore } from "../store";
import { THEME_REGISTRY, resolveTheme, type ThemeName, type ThemeMode } from "../themes";

const FONT_D = "'Lexend', sans-serif";
const FONT_B = "'Inter', sans-serif";

// Mini-preview da WelcomeScreen do totem (~220px altura)
function TotemPreview({ name, mode }: { name: string; mode: string }) {
  const T = resolveTheme(name, mode);
  return (
    <div style={{
      borderRadius: 12,
      overflow: "hidden",
      border: `1px solid rgba(var(--a-neutral-rgb),0.08)`,
      height: 220,
      background: T.radial,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      position: "relative",
    }}>
      {/* Logo */}
      <svg width={36} height={36} viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="12" fill={T.roxo} />
        <circle cx="24" cy="22" r="10" stroke="white" strokeWidth="3.5" fill="none" />
        <circle cx="24" cy="22" r="4" fill="white" />
        <rect x="14" y="34" width="20" height="3" rx="1.5" fill="white" opacity="0.4" />
      </svg>
      <div style={{ fontFamily: FONT_D, fontWeight: 900, fontSize: 18, color: T.text, letterSpacing: "-0.5px" }}>
        Sua empresa
      </div>
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: T.roxoSubtle,
          border: `2px solid ${T.roxo}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16,
        }}>
          👆
        </div>
        <div style={{ fontFamily: FONT_D, fontSize: 14, fontWeight: 700, color: T.text }}>
          Toque para começar
        </div>
        <div style={{ fontFamily: FONT_B, fontSize: 11, color: T.muted }}>
          Faça seu pedido em minutos
        </div>
      </div>
      {/* Pill de botão de exemplo */}
      <div style={{
        position: "absolute", bottom: 12, left: 12, right: 12,
        background: T.btn, color: T.btnText,
        borderRadius: 999, padding: "6px 0",
        textAlign: "center",
        fontFamily: FONT_D, fontWeight: 800, fontSize: 11,
        boxShadow: T.glow,
      }}>
        Ver cardápio →
      </div>
    </div>
  );
}

const S = {
  page:      { padding: 32, color: "var(--a-text)", maxWidth: 760 } as React.CSSProperties,
  title:     { fontSize: 22, fontWeight: 700, marginBottom: 24, fontFamily: FONT_D } as React.CSSProperties,
  card:      {
    background: "var(--a-surface)",
    border: "1px solid rgba(153,0,255,0.2)",
    borderRadius: 12,
    padding: "24px 28px",
    marginBottom: 20,
  } as React.CSSProperties,
  cardTitle: { fontSize: 15, fontWeight: 600, marginBottom: 6, fontFamily: FONT_D } as React.CSSProperties,
  cardDesc:  { fontSize: 13, color: "rgba(var(--a-text-rgb),0.5)", marginBottom: 16, fontFamily: FONT_B } as React.CSSProperties,
  btn: {
    padding: "10px 20px",
    background: "#9900ff",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    fontSize: 14,
    fontFamily: FONT_D,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 4px 20px rgba(153,0,255,0.35)",
  } as React.CSSProperties,
};

export default function SettingsScreen() {
  const companyId = useStore((s) => s.selectedCompanyId ?? s.companyId);

  // ── PIN ───────────────────────────────────────────────────────────────────
  const [pin, setPin] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);

  async function regenerate() {
    if (!companyId || !confirm("Gerar novo PIN? O PIN atual será invalidado.")) return;
    setPinLoading(true);
    try {
      const r = await api.post(`/companies/${companyId}/regenerate-pin`);
      setPin(r.data.pin ?? r.data.new_pin ?? "????");
    } finally {
      setPinLoading(false);
    }
  }

  // ── Aparência ─────────────────────────────────────────────────────────────
  const [localTheme, setLocalTheme] = useState<string>("ordin");
  const [localMode,  setLocalMode]  = useState<string>("light");
  const [saving,     setSaving]     = useState(false);
  const [saveMsg,    setSaveMsg]    = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!companyId) return;
    api.get(`/companies/${companyId}`).then((r) => {
      setLocalTheme(r.data.visual_theme ?? "ordin");
      setLocalMode(r.data.visual_mode  ?? "light");
    }).catch(() => null);
  }, [companyId]);

  async function saveAppearance() {
    if (!companyId) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await api.patch(`/companies/${companyId}/appearance`, { theme: localTheme, mode: localMode });
      setSaveMsg({ ok: true, text: "Aparência salva com sucesso!" });
    } catch {
      setSaveMsg({ ok: false, text: "Erro ao salvar. Tente novamente." });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }

  const themes = Object.entries(THEME_REGISTRY) as [ThemeName, (typeof THEME_REGISTRY)[ThemeName]][];

  return (
    <div style={S.page}>
      <div style={S.title}>Configurações</div>

      {/* ── Card PIN ─────────────────────────────────────────────────────── */}
      <div style={S.card}>
        <div style={S.cardTitle}>PIN do totem</div>
        <div style={S.cardDesc}>
          O PIN de 4 dígitos é usado pelos clientes para acessar o cardápio no quiosque.
          Após regenerar, o PIN antigo é imediatamente invalidado.
        </div>
        <button style={S.btn} onClick={regenerate} disabled={pinLoading || !companyId}>
          {pinLoading ? "Gerando…" : "Regenerar PIN"}
        </button>
        {pin && (
          <>
            <div style={{
              marginTop: 16, background: "rgba(153,0,255,0.12)",
              border: "1px solid #9900ff", borderRadius: 8,
              padding: "16px 20px", fontSize: 28, fontWeight: 700,
              letterSpacing: 8, color: "var(--a-text)", textAlign: "center",
              fontFamily: FONT_D,
            }}>
              {pin}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "#f59e0b", textAlign: "center", fontFamily: FONT_B }}>
              Anote este PIN — ele não será exibido novamente.
            </div>
          </>
        )}
      </div>

      {/* ── Card Aparência ───────────────────────────────────────────────── */}
      <div style={S.card}>
        <div style={S.cardTitle}>Aparência do totem</div>
        <div style={S.cardDesc}>
          Escolha o tema visual e o modo de cor. O totem aplica a configuração automaticamente após o login com PIN.
        </div>

        {/* Grade de temas */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
          {themes.map(([key, entry]) => {
            const selected = localTheme === key;
            return (
              <div
                key={key}
                onClick={() => setLocalTheme(key)}
                style={{
                  borderRadius: 12,
                  border: `2px solid ${selected ? "#ffffff" : "rgba(var(--a-neutral-rgb),0.08)"}`,
                  boxShadow: selected ? "0 0 0 3px rgba(var(--a-neutral-rgb),0.12)" : "none",
                  cursor: "pointer",
                  overflow: "hidden",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                  background: "#0a0a0f",
                }}
              >
                {/* Header do card */}
                <div style={{
                  padding: "14px 16px 10px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div style={{ fontFamily: FONT_D, fontWeight: 800, fontSize: 13, color: "#fff" }}>
                    {entry.label}
                  </div>
                  {selected && (
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%",
                      background: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, color: "#000",
                    }}>
                      ✓
                    </div>
                  )}
                </div>

                {/* Descrição */}
                <div style={{ padding: "0 16px 10px", fontSize: 11, color: "rgba(var(--a-neutral-rgb),0.5)", fontFamily: FONT_B, lineHeight: 1.5 }}>
                  {entry.description}
                </div>

                {/* Dots de cor */}
                <div style={{ display: "flex", gap: 6, padding: "0 16px 16px" }}>
                  {entry.colors.map((c: string, i: number) => (
                    <div key={i} style={{
                      width: 20, height: 20, borderRadius: "50%",
                      background: c, border: "2px solid rgba(var(--a-neutral-rgb),0.15)",
                    }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modo light/dark */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
          <span style={{ fontSize: 13, color: "rgba(var(--a-neutral-rgb),0.5)", fontFamily: FONT_B }}>Modo:</span>
          {(["light", "dark"] as ThemeMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setLocalMode(m)}
              style={{
                padding: "6px 18px",
                borderRadius: 999,
                fontFamily: FONT_D,
                fontWeight: 700,
                fontSize: 12,
                border: `1px solid ${localMode === m ? "#ffffff" : "rgba(var(--a-neutral-rgb),0.15)"}`,
                background: localMode === m ? "#ffffff" : "transparent",
                color: localMode === m ? "#0a0a0f" : "rgba(var(--a-neutral-rgb),0.5)",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {m === "light" ? "☀️ Claro" : "🌙 Escuro"}
            </button>
          ))}
        </div>

        {/* Preview ao vivo */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "rgba(var(--a-neutral-rgb),0.4)", fontFamily: FONT_B, marginBottom: 8 }}>
            Preview ao vivo
          </div>
          <TotemPreview name={localTheme} mode={localMode} />
        </div>

        {/* Salvar */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            style={{
              ...S.btn,
              background: resolveTheme(localTheme, localMode).btn,
              color: resolveTheme(localTheme, localMode).btnText,
              boxShadow: resolveTheme(localTheme, localMode).glow,
              opacity: saving ? 0.6 : 1,
            }}
            onClick={saveAppearance}
            disabled={saving || !companyId}
          >
            {saving ? "Salvando…" : "Salvar aparência"}
          </button>
          {saveMsg && (
            <span style={{
              fontFamily: FONT_B,
              fontSize: 13,
              color: saveMsg.ok ? "#5DD490" : "#ff6b5b",
            }}>
              {saveMsg.text}
            </span>
          )}
        </div>
      </div>

    </div>
  );
}
