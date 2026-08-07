import { useState, useEffect } from "react";
import { Button } from "design-system";
import api from "../api";
import ConfirmDialog from "../components/ConfirmDialog";
import { useStore } from "../store";
import { THEME_REGISTRY, resolveTheme, type ThemeName, type ThemeMode } from "../themes";
import styles from "./SettingsScreen.module.scss";

const FONT_D = "'Lexend', sans-serif";
const FONT_B = "'Inter', sans-serif";

// Mini-preview da WelcomeScreen do totem (~220px altura)
// Mantido como está — é branding/preview do totem, não do admin (fora do
// escopo da reconstrução visual do admin com o design system).
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

export default function SettingsScreen() {
  const companyId = useStore((s) => s.selectedCompanyId ?? s.companyId);

  // ── PIN ───────────────────────────────────────────────────────────────────
  const [pin, setPin] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  function regenerate() {
    if (!companyId) return;
    setConfirmRegenerate(true);
  }

  async function doRegenerate() {
    setConfirmRegenerate(false);
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
  const previewTheme = resolveTheme(localTheme, localMode);

  return (
    <div className={styles.page}>
      <div className={styles.title}>Configurações</div>

      {/* ── Card PIN ─────────────────────────────────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>PIN do totem</div>
        <div className={styles.cardDesc}>
          O PIN de 4 dígitos é usado pelos clientes para acessar o cardápio no quiosque.
          Após regenerar, o PIN antigo é imediatamente invalidado.
        </div>
        <Button onClick={regenerate} disabled={!companyId} loading={pinLoading}>
          Regenerar PIN
        </Button>
        {pin && (
          <>
            <div className={styles.pinBox}>{pin}</div>
            <div className={styles.pinHint}>Anote este PIN — ele não será exibido novamente.</div>
          </>
        )}
      </div>

      {/* ── Card Aparência ───────────────────────────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>Aparência do totem</div>
        <div className={styles.cardDesc}>
          Escolha o tema visual e o modo de cor. O totem aplica a configuração automaticamente após o login com PIN.
        </div>

        {/* Grade de temas */}
        <div className={styles.themeGrid}>
          {themes.map(([key, entry]) => {
            const selected = localTheme === key;
            return (
              <div
                key={key}
                onClick={() => setLocalTheme(key)}
                className={`${styles.themeCard} ${selected ? styles.themeCardSelected : ""}`}
              >
                <div className={styles.themeCardHead}>
                  <div className={styles.themeCardLabel}>{entry.label}</div>
                  {selected && <div className={styles.themeCardCheck}>✓</div>}
                </div>
                <div className={styles.themeCardDesc}>{entry.description}</div>
                <div className={styles.themeCardDots}>
                  {entry.colors.map((c: string, i: number) => (
                    <div key={i} className={styles.themeCardDot} style={{ background: c }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modo light/dark */}
        <div className={styles.modeRow}>
          <span className={styles.modeLabel}>Modo:</span>
          {(["light", "dark"] as ThemeMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setLocalMode(m)}
              className={`${styles.modeBtn} ${localMode === m ? styles.modeBtnActive : ""}`}
            >
              {m === "light" ? "☀️ Claro" : "🌙 Escuro"}
            </button>
          ))}
        </div>

        {/* Preview ao vivo */}
        <div className={styles.previewSection}>
          <div className={styles.previewLabel}>Preview ao vivo</div>
          <TotemPreview name={localTheme} mode={localMode} />
        </div>

        {/* Salvar */}
        <div className={styles.saveRow}>
          <button
            className={styles.saveBtn}
            style={{
              background: previewTheme.btn,
              color: previewTheme.btnText,
              boxShadow: previewTheme.glow,
              opacity: saving ? 0.6 : 1,
            }}
            onClick={saveAppearance}
            disabled={saving || !companyId}
          >
            {saving ? "Salvando…" : "Salvar aparência"}
          </button>
          {saveMsg && (
            <span className={`${styles.saveMsg} ${saveMsg.ok ? styles.saveMsgOk : styles.saveMsgErr}`}>
              {saveMsg.text}
            </span>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmRegenerate}
        message="Gerar novo PIN? O PIN atual será invalidado."
        onConfirm={doRegenerate}
        onCancel={() => setConfirmRegenerate(false)}
      />
    </div>
  );
}
