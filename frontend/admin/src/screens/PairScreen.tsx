import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Dropdown, type DropdownOptions } from "design-system";
import api from "../api";
import { useStore } from "../store";
import styles from "./PairScreen.module.scss";

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

  const terminalOptions: DropdownOptions[] = terminals.map((t) => ({ value: String(t.id), label: t.label }));

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerRow}>
            <span className={styles.headerIcon}>⊞</span>
            <h1 className={styles.headerTitle}>Parear totem</h1>
          </div>
          <p className={styles.headerSub}>
            Digite o código exibido no totem ou escaneie o QR com a câmera do celular para autenticar o dispositivo.
          </p>
        </div>

        {/* Campo de código */}
        <label className={styles.fieldLabel}>Código do totem</label>
        <input
          className={`${styles.codeInput} ${code.length === 6 ? styles.codeInputFilled : ""}`}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))}
          placeholder="ABC123"
          maxLength={6}
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          inputMode="text"
        />

        {/* Select de terminal */}
        <label className={styles.fieldLabel}>Terminal</label>
        <div className={styles.terminalField}>
          <Dropdown
            value={terminalOptions.find((o) => o.value === terminal) ?? null}
            onValueSelected={(opt) => setTerminal(opt.value)}
            options={terminalOptions}
            placeholder={terminals.length === 0 ? "Nenhum terminal encontrado" : undefined}
          />
        </div>

        {/* Botão de aprovar */}
        <Button
          fullWidth
          onClick={approve}
          disabled={!canApprove}
          loading={loading}
        >
          Aprovar pareamento
        </Button>

        {/* Feedback */}
        {msg && (
          <div className={`${styles.feedback} ${msg.ok ? styles.feedbackOk : styles.feedbackErr}`}>
            {msg.text}
          </div>
        )}

        {/* Dica */}
        <p className={styles.hint}>
          O código expira em 5 minutos e é de uso único.
          <br />
          Gere um novo no totem se necessário.
        </p>
      </div>
    </div>
  );
}
