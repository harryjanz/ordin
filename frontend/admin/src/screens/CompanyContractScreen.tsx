import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import Spinner from "../components/Spinner";
import { getCompany, getContractDocumentUrl, getLegalRepresentative, listContacts, lookupCep, updateCompany, updateContractStatus } from "../api/companies";
import { parseApiError } from "../lib/apiErrors";
import { formatCep, formatCnpj, formatCpf } from "../lib/masks";
import { isValidCep, normalizeCep, UF_VALUES } from "../lib/validators";
import { companyToEditForm, diffFields, type CompanyEditForm } from "../lib/companyEdit";
import { useStore } from "../store";
import type { CepLookupResult, Company, Contact, LegalRepresentative } from "../types";

const STAGES = ["pendente", "enviado", "assinado"] as const;
const STAGE_LABEL: Record<string, string> = { pendente: "Pendente", enviado: "Enviado", assinado: "Assinado" };

const S = {
  page: { padding: 32, color: "var(--a-text)", maxWidth: 900 } as React.CSSProperties,
  header: {
    background: "var(--a-surface)", border: "1px solid rgba(153,0,255,0.2)", borderRadius: 16, padding: "24px 28px",
    display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap", marginBottom: 20,
  } as React.CSSProperties,
  h2: { fontFamily: "'Lexend', sans-serif", fontSize: 20, fontWeight: 600 } as React.CSSProperties,
  doc: { fontFamily: "'Courier New', monospace", color: "rgba(var(--a-text-rgb),0.5)", fontSize: 13, marginTop: 4 } as React.CSSProperties,
  addr: { color: "rgba(var(--a-text-rgb),0.5)", fontSize: 13, marginTop: 6 } as React.CSSProperties,
  chip: (kind: "success" | "warn") => ({
    display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'Lexend', sans-serif", fontSize: 11, fontWeight: 700,
    letterSpacing: "0.03em", textTransform: "uppercase", padding: "4px 10px", borderRadius: 999,
    background: kind === "success" ? "rgba(93,212,144,0.16)" : "rgba(255,184,77,0.16)",
    color: kind === "success" ? "#5DD490" : "#ffb84d",
  } as React.CSSProperties),
  panel: { background: "var(--a-surface)", border: "1px solid rgba(153,0,255,0.2)", borderRadius: 16, padding: "26px 28px", marginBottom: 20 } as React.CSSProperties,
  h3: { fontFamily: "'Lexend', sans-serif", fontSize: 15, fontWeight: 600, marginBottom: 4 } as React.CSSProperties,
  note: { fontSize: 12.5, color: "rgba(var(--a-text-rgb),0.5)", marginBottom: 22, maxWidth: "62ch" } as React.CSSProperties,
  tracker: { display: "flex", alignItems: "flex-start" } as React.CSSProperties,
  tstage: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", position: "relative" } as React.CSSProperties,
  circle: (state: "done" | "current" | "upcoming") => ({
    width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center",
    fontFamily: "'Lexend', sans-serif", fontWeight: 700, fontSize: 13,
    background: state === "done" ? "rgba(93,212,144,0.16)" : state === "current" ? "#9900ff" : "rgba(var(--a-neutral-rgb),0.07)",
    color: state === "done" ? "#5DD490" : state === "current" ? "#fff" : "rgba(var(--a-text-rgb),0.5)",
    zIndex: 1,
  } as React.CSSProperties),
  tlabel: { fontFamily: "'Lexend', sans-serif", fontSize: 12.5, fontWeight: 700, marginTop: 10 } as React.CSSProperties,
  ttime: { fontFamily: "'Courier New', monospace", fontSize: 11, color: "rgba(var(--a-text-rgb),0.5)", marginTop: 3 } as React.CSSProperties,
  actionsRow: { display: "flex", gap: 12, marginTop: 26, flexWrap: "wrap" } as React.CSSProperties,
  btnPrimary: { fontFamily: "'Lexend', sans-serif", fontSize: 13.5, fontWeight: 600, padding: "11px 20px", borderRadius: 9, border: "none", background: "#9900ff", color: "#fff", cursor: "pointer" } as React.CSSProperties,
  btnPrimaryDisabled: { opacity: 0.4, cursor: "not-allowed" } as React.CSSProperties,
  fileInput: { fontSize: 13, color: "rgba(var(--a-text-rgb),0.7)" } as React.CSSProperties,
  contactsGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 } as React.CSSProperties,
  miniCard: { border: "1px solid rgba(var(--a-neutral-rgb),0.07)", borderRadius: 12, padding: "14px 16px" } as React.CSSProperties,
  miniType: { fontFamily: "'Lexend', sans-serif", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9900ff", marginBottom: 6 } as React.CSSProperties,
  miniName: { fontWeight: 600, fontSize: 13.5 } as React.CSSProperties,
  miniDetail: { fontSize: 12, color: "rgba(var(--a-text-rgb),0.5)", marginTop: 2 } as React.CSSProperties,
  errBox: { padding: "12px 14px", background: "rgba(255,77,109,0.10)", border: "1px solid rgba(255,77,109,0.3)", borderRadius: 10, marginBottom: 16, fontSize: 13 } as React.CSSProperties,
  btnGhost: { fontFamily: "'Lexend', sans-serif", fontSize: 13.5, fontWeight: 600, padding: "11px 20px", borderRadius: 9, border: "1px solid rgba(var(--a-neutral-rgb),0.12)", background: "transparent", color: "rgba(var(--a-text-rgb),0.7)", cursor: "pointer" } as React.CSSProperties,
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 16px" } as React.CSSProperties,
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 16px" } as React.CSSProperties,
  field: { display: "flex", flexDirection: "column", gap: 6 } as React.CSSProperties,
  fieldLabel: { fontSize: 12, fontWeight: 600, color: "rgba(var(--a-text-rgb),0.5)" } as React.CSSProperties,
  input: {
    fontSize: 14, color: "var(--a-text)", background: "var(--a-bg)", border: "1px solid rgba(var(--a-neutral-rgb),0.07)",
    borderRadius: 9, padding: "10px 12px", outline: "none",
  } as React.CSSProperties,
  inputDisabled: { opacity: 0.5, cursor: "not-allowed" } as React.CSSProperties,
  inputError: { borderColor: "#ff4d6d" } as React.CSSProperties,
  fieldErr: { fontSize: 11.5, color: "#ff4d6d" } as React.CSSProperties,
  savebar: {
    position: "sticky", bottom: 0, display: "flex", justifyContent: "space-between", alignItems: "center",
    background: "rgba(29,20,52,0.95)", borderTop: "1px solid rgba(153,0,255,0.2)", padding: "16px 4px", marginTop: -4,
  } as React.CSSProperties,
  dirtyNote: { fontSize: 12.5, color: "#ffb84d", display: "flex", alignItems: "center", gap: 6 } as React.CSSProperties,
  dirtyDot: { width: 6, height: 6, borderRadius: "50%", background: "#ffb84d" } as React.CSSProperties,
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

export default function CompanyContractScreen() {
  const { id } = useParams<{ id: string }>();
  const companyId = Number(id);

  const [company, setCompany] = useState<Company | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [legalRep, setLegalRep] = useState<LegalRepresentative | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [downloadingContract, setDownloadingContract] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Modo de edição (ORD-063) — não reaproveita o Stepper do wizard (ORD-060):
  // aqui os dados já existem e já são válidos, então todas as seções ficam
  // visíveis de uma vez, sem gating por etapa (ver decisão de UX na história).
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CompanyEditForm | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [cepLookupLoading, setCepLookupLoading] = useState(false);
  const [cepLookupResult, setCepLookupResult] = useState<CepLookupResult | null>(null);
  const cepLookupTimer = useRef<ReturnType<typeof setTimeout>>();

  const originalForm = company ? companyToEditForm(company) : null;
  const dirtyFields = draft && originalForm ? diffFields(originalForm, draft) : {};
  const dirtyCount = Object.keys(dirtyFields).length;

  // useBlocker do React Router só funciona sob um data router — este app usa
  // <BrowserRouter> puro (main.tsx), então o bloqueio de navegação vive num
  // flag global (store.unsavedChanges) que o Sidebar consulta antes de
  // navegar. Cobre fechar aba/reload via beforeunload abaixo.
  useEffect(() => {
    useStore.getState().setUnsavedChanges(dirtyCount > 0);
    return () => useStore.getState().setUnsavedChanges(false);
  }, [dirtyCount]);

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtyCount > 0) { e.preventDefault(); e.returnValue = ""; }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirtyCount]);

  useEffect(() => {
    if (!editing || !draft) return;
    const normalized = normalizeCep(draft.zip_code);
    if (!isValidCep(normalized)) {
      setCepLookupResult(null);
      return;
    }
    clearTimeout(cepLookupTimer.current);
    cepLookupTimer.current = setTimeout(async () => {
      setCepLookupLoading(true);
      try {
        const result = await lookupCep(normalized);
        setCepLookupResult(result);
        if (result.found) {
          if (result.street) setDraftField("street", result.street);
          if (result.neighborhood) setDraftField("neighborhood", result.neighborhood);
          if (result.city) setDraftField("city", result.city);
          if (result.state) setDraftField("state", result.state);
        }
      } catch {
        setCepLookupResult({ found: false, reason: "lookup_unavailable" });
      } finally {
        setCepLookupLoading(false);
      }
    }, 500);
    return () => clearTimeout(cepLookupTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, draft?.zip_code]);

  async function load() {
    setLoading(true);
    try {
      const [co, cs, rep] = await Promise.all([
        getCompany(companyId),
        listContacts(companyId),
        getLegalRepresentative(companyId),
      ]);
      setCompany(co);
      setContacts(cs);
      setLegalRep(rep);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function markSent() {
    setUpdating(true);
    setError(null);
    try {
      const updated = await updateContractStatus(companyId, "enviado");
      setCompany(updated);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setUpdating(false);
    }
  }

  async function markSigned() {
    if (!selectedFile) return;
    setUpdating(true);
    setError(null);
    try {
      const updated = await updateContractStatus(companyId, "assinado", selectedFile);
      setCompany(updated);
      setSelectedFile(null);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setUpdating(false);
    }
  }

  async function downloadSignedContract() {
    setDownloadingContract(true);
    setError(null);
    try {
      const url = await getContractDocumentUrl(companyId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setDownloadingContract(false);
    }
  }

  function startEditing() {
    if (!company) return;
    setDraft(companyToEditForm(company));
    setFieldErrors({});
    setError(null);
    setEditing(true);
  }

  function discardEdit() {
    setDraft(null);
    setFieldErrors({});
    setEditing(false);
  }

  function setDraftField(field: keyof CompanyEditForm, value: string) {
    setDraft((d) => (d ? { ...d, [field]: value } : d));
  }

  async function saveEdit() {
    if (!draft) return;
    const errs: Record<string, string> = {};
    if (draft.zip_code && !isValidCep(draft.zip_code)) errs.zip_code = "CEP inválido — deve conter 8 dígitos";
    if (!draft.street.trim()) errs.street = "Logradouro é obrigatório";
    if (!draft.address_number.trim()) errs.address_number = "Número é obrigatório";
    if (!draft.neighborhood.trim()) errs.neighborhood = "Bairro é obrigatório";
    if (!draft.city.trim()) errs.city = "Cidade é obrigatória";
    if (!draft.state.trim()) errs.state = "UF é obrigatória";
    if (!draft.name.trim()) errs.name = "Nome fantasia é obrigatório";
    if (!draft.legal_name.trim()) errs.legal_name = "Razão social é obrigatória";
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }

    setSaving(true);
    setFieldErrors({});
    setError(null);
    try {
      const updated = await updateCompany(companyId, dirtyFields);
      setCompany(updated);
      setDraft(null);
      setEditing(false);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.message);
      setFieldErrors(parsed.fieldErrors);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={S.page}>Carregando…</div>;
  if (!company) return <div style={S.page}><div style={S.errBox}>{error ?? "Empresa não encontrada"}</div></div>;

  const comercial = contacts.find((c) => c.contact_type === "comercial");
  const financeiro = contacts.find((c) => c.contact_type === "financeiro");
  const status = company.contract_status ?? "pendente";
  const currentIndex = STAGES.indexOf(status as (typeof STAGES)[number]);

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <h2 style={S.h2}>{company.name}</h2>
          <div style={S.doc}>CNPJ {formatCnpj(company.document ?? "")} · {company.legal_name}</div>
          <div style={S.addr}>{company.street}, {company.address_number} — {company.neighborhood}, {company.city}/{company.state}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={S.chip(company.cadastral_status === "ATIVA" ? "success" : "warn")}>
            {company.cadastral_status === "ATIVA" ? "Ativa na Receita" : company.cadastral_status ?? "Não verificada"}
          </span>
          <span style={S.chip(status === "assinado" ? "success" : "warn")}>Contrato: {STAGE_LABEL[status]}</span>
          {!editing && (
            <button style={S.btnGhost} onClick={startEditing} data-testid="btn-editar-cadastro">Editar cadastro</button>
          )}
        </div>
      </div>

      {error && <div style={S.errBox}>{error}</div>}

      {editing && draft && (
        <>
          <div style={S.panel}>
            <h3 style={{ ...S.h3, marginBottom: 16 }}>Dados cadastrais</h3>
            <div style={S.grid2}>
              <div style={S.field}>
                <label style={S.fieldLabel}>CNPJ</label>
                <input
                  style={{ ...S.input, ...S.inputDisabled, fontFamily: "'Courier New', monospace" }}
                  value={formatCnpj(company.document ?? "")}
                  disabled
                  title="CNPJ é imutável após o cadastro — para trocar, é preciso um novo cadastro"
                  data-testid="input-edit-cnpj"
                />
              </div>
              <div style={S.field}>
                <label style={S.fieldLabel}>Nome fantasia<span style={{ color: "#ff4d6d" }}>*</span></label>
                <input
                  style={{ ...S.input, ...(fieldErrors.name ? S.inputError : {}) }}
                  value={draft.name}
                  onChange={(e) => setDraftField("name", e.target.value)}
                  data-testid="input-edit-trade-name"
                />
                {fieldErrors.name && <span style={S.fieldErr}>{fieldErrors.name}</span>}
              </div>
            </div>
            <div style={{ ...S.grid2, marginTop: 14 }}>
              <div style={S.field}>
                <label style={S.fieldLabel}>Razão social<span style={{ color: "#ff4d6d" }}>*</span></label>
                <input
                  style={{ ...S.input, ...(fieldErrors.legal_name ? S.inputError : {}) }}
                  value={draft.legal_name}
                  onChange={(e) => setDraftField("legal_name", e.target.value)}
                  data-testid="input-edit-legal-name"
                />
                {fieldErrors.legal_name && <span style={S.fieldErr}>{fieldErrors.legal_name}</span>}
              </div>
              <div style={S.field}>
                <label style={S.fieldLabel}>Porte</label>
                <select style={S.input} value={draft.company_size} onChange={(e) => setDraftField("company_size", e.target.value)} data-testid="select-edit-company-size">
                  <option value="MEI">MEI</option>
                  <option value="ME">ME</option>
                  <option value="EPP">EPP</option>
                  <option value="DEMAIS">Demais</option>
                </select>
              </div>
            </div>
            <div style={{ ...S.grid3, marginTop: 14 }}>
              <div style={S.field}>
                <label style={S.fieldLabel}>Inscrição estadual</label>
                <input style={S.input} value={draft.state_registration} onChange={(e) => setDraftField("state_registration", e.target.value)} />
              </div>
              <div style={S.field}>
                <label style={S.fieldLabel}>Regime tributário</label>
                <select style={S.input} value={draft.tax_regime} onChange={(e) => setDraftField("tax_regime", e.target.value)}>
                  <option value="simples_nacional">Simples Nacional</option>
                  <option value="lucro_presumido">Lucro Presumido</option>
                  <option value="lucro_real">Lucro Real</option>
                </select>
              </div>
              <div style={S.field}>
                <label style={S.fieldLabel}>CNAE principal</label>
                <input style={{ ...S.input, fontFamily: "'Courier New', monospace" }} value={draft.cnae_code} onChange={(e) => setDraftField("cnae_code", e.target.value)} />
              </div>
            </div>
          </div>

          <div style={S.panel}>
            <h3 style={{ ...S.h3, marginBottom: 16 }}>Endereço</h3>
            <div style={S.grid3}>
              <div style={S.field}>
                <label style={S.fieldLabel}>CEP</label>
                <div style={{ position: "relative" }}>
                  <input
                    style={{ ...S.input, ...(fieldErrors.zip_code ? S.inputError : {}), fontFamily: "'Courier New', monospace" }}
                    value={formatCep(draft.zip_code)}
                    onChange={(e) => setDraftField("zip_code", e.target.value)}
                    data-testid="input-edit-zip-code"
                  />
                  {cepLookupLoading && (
                    <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}>
                      <Spinner size={14} />
                    </span>
                  )}
                </div>
                {fieldErrors.zip_code && <span style={S.fieldErr}>{fieldErrors.zip_code}</span>}
                {!fieldErrors.zip_code && !cepLookupLoading && cepLookupResult && !cepLookupResult.found && (
                  <span style={{ fontSize: 11.5, color: "#FFB84D" }}>CEP não encontrado — preencha o endereço manualmente</span>
                )}
              </div>
              <div style={{ ...S.field, gridColumn: "span 2" }}>
                <label style={S.fieldLabel}>Logradouro<span style={{ color: "#ff4d6d" }}>*</span></label>
                <input style={{ ...S.input, ...(fieldErrors.street ? S.inputError : {}) }} value={draft.street} onChange={(e) => setDraftField("street", e.target.value)} />
                {fieldErrors.street && <span style={S.fieldErr}>{fieldErrors.street}</span>}
              </div>
            </div>
            <div style={{ ...S.grid3, marginTop: 14 }}>
              <div style={S.field}>
                <label style={S.fieldLabel}>Número<span style={{ color: "#ff4d6d" }}>*</span></label>
                <input style={{ ...S.input, ...(fieldErrors.address_number ? S.inputError : {}) }} value={draft.address_number} onChange={(e) => setDraftField("address_number", e.target.value)} />
                {fieldErrors.address_number && <span style={S.fieldErr}>{fieldErrors.address_number}</span>}
              </div>
              <div style={S.field}>
                <label style={S.fieldLabel}>Complemento</label>
                <input style={S.input} value={draft.complement} onChange={(e) => setDraftField("complement", e.target.value)} />
              </div>
              <div style={S.field}>
                <label style={S.fieldLabel}>Bairro<span style={{ color: "#ff4d6d" }}>*</span></label>
                <input style={{ ...S.input, ...(fieldErrors.neighborhood ? S.inputError : {}) }} value={draft.neighborhood} onChange={(e) => setDraftField("neighborhood", e.target.value)} />
                {fieldErrors.neighborhood && <span style={S.fieldErr}>{fieldErrors.neighborhood}</span>}
              </div>
            </div>
            <div style={{ ...S.grid2, marginTop: 14 }}>
              <div style={S.field}>
                <label style={S.fieldLabel}>Cidade<span style={{ color: "#ff4d6d" }}>*</span></label>
                <input style={{ ...S.input, ...(fieldErrors.city ? S.inputError : {}) }} value={draft.city} onChange={(e) => setDraftField("city", e.target.value)} />
                {fieldErrors.city && <span style={S.fieldErr}>{fieldErrors.city}</span>}
              </div>
              <div style={S.field}>
                <label style={S.fieldLabel}>UF<span style={{ color: "#ff4d6d" }}>*</span></label>
                <select style={{ ...S.input, ...(fieldErrors.state ? S.inputError : {}) }} value={draft.state} onChange={(e) => setDraftField("state", e.target.value)}>
                  <option value="">Selecione</option>
                  {UF_VALUES.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                </select>
                {fieldErrors.state && <span style={S.fieldErr}>{fieldErrors.state}</span>}
              </div>
            </div>
          </div>

          <div style={S.savebar}>
            {dirtyCount > 0 ? (
              <span style={S.dirtyNote} data-testid="dirty-count">
                <span style={S.dirtyDot} /> {dirtyCount} campo{dirtyCount === 1 ? "" : "s"} alterado{dirtyCount === 1 ? "" : "s"}
              </span>
            ) : <span />}
            <div style={{ display: "flex", gap: 12 }}>
              <button style={S.btnGhost} onClick={discardEdit} disabled={saving} data-testid="btn-descartar-edicao">Descartar</button>
              <button
                style={{ ...S.btnPrimary, ...(dirtyCount === 0 ? S.btnPrimaryDisabled : {}) }}
                onClick={saveEdit}
                disabled={dirtyCount === 0 || saving}
                data-testid="btn-salvar-edicao"
              >
                {saving ? "Salvando…" : "Salvar alterações"}
              </button>
            </div>
          </div>
        </>
      )}

      {!editing && (
      <>
      <div style={S.panel}>
        <h3 style={S.h3}>Status do contrato</h3>
        <p style={S.note}>
          Envio e assinatura acontecem <strong style={{ color: "#33cccc" }}>fora da plataforma</strong> — o contrato é
          enviado manualmente por e-mail e assinado via <strong style={{ color: "#33cccc" }}>gov.br</strong>. Esta tela
          só registra em qual etapa o processo está.
        </p>

        <div style={S.tracker} data-testid="contract-tracker">
          {STAGES.map((s, i) => {
            const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
            return (
              <div key={s} style={S.tstage}>
                <div style={S.circle(state)}>{state === "done" ? "✓" : i + 1}</div>
                <div style={S.tlabel}>{STAGE_LABEL[s]}</div>
                <div style={S.ttime}>
                  {s === "enviado" ? fmtDate(company.contract_sent_at) : s === "assinado" ? fmtDate(company.contract_signed_at) : fmtDate(company.created_at)}
                </div>
              </div>
            );
          })}
        </div>

        <div style={S.actionsRow}>
          {status === "pendente" && (
            <button style={S.btnPrimary} onClick={markSent} disabled={updating} data-testid="btn-marcar-enviado">
              {updating ? "Salvando…" : "Marcar como enviado"}
            </button>
          )}
          {status !== "assinado" && (
            <>
              <input
                type="file"
                accept="application/pdf"
                style={S.fileInput}
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                data-testid="input-signed-document"
              />
              <button
                style={{ ...S.btnPrimary, ...(!selectedFile ? S.btnPrimaryDisabled : {}) }}
                onClick={markSigned}
                disabled={!selectedFile || updating}
                data-testid="btn-marcar-assinado"
              >
                {updating ? "Salvando…" : "Anexar e marcar como assinado"}
              </button>
            </>
          )}
          {status === "assinado" && (
            <>
              <span style={{ color: "#5DD490", fontSize: 13 }}>Contrato assinado — documento arquivado.</span>
              <button
                style={S.btnPrimary}
                onClick={downloadSignedContract}
                disabled={downloadingContract}
                data-testid="btn-baixar-contrato"
              >
                {downloadingContract ? "Gerando link…" : "Baixar contrato assinado"}
              </button>
            </>
          )}
        </div>
      </div>

      <div style={S.panel}>
        <h3 style={{ ...S.h3, marginBottom: 16 }}>Contatos e responsável legal</h3>
        <div style={S.contactsGrid}>
          <div style={S.miniCard}>
            <div style={S.miniType}>Comercial</div>
            <div style={S.miniName}>{comercial?.name ?? "Não informado"}</div>
            <div style={S.miniDetail}>{comercial?.email ?? "—"}</div>
          </div>
          <div style={S.miniCard}>
            <div style={S.miniType}>Responsável legal</div>
            <div style={S.miniName}>{legalRep?.name ?? "Não informado"}</div>
            <div style={{ ...S.miniDetail, fontFamily: "'Courier New', monospace" }}>{legalRep ? formatCpf(legalRep.cpf) : "—"}</div>
          </div>
          <div style={S.miniCard}>
            <div style={S.miniType}>Financeiro</div>
            <div style={S.miniName}>{financeiro?.name ?? "Não informado"}</div>
            <div style={S.miniDetail}>{financeiro?.email ?? "—"}</div>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
