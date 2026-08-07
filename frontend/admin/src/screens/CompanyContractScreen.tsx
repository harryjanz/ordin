import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Alert, Button, Dropdown, InputBase, Tag, type DropdownOptions } from "design-system";
import { getCompany, getContractDocumentUrl, getLegalRepresentative, listContacts, lookupCep, updateCompany, updateContractStatus } from "../api/companies";
import { parseApiError } from "../lib/apiErrors";
import { formatCep, formatCnpj, formatCpf } from "../lib/masks";
import { isValidCep, normalizeCep, UF_VALUES } from "../lib/validators";
import { companyToEditForm, diffFields, type CompanyEditForm } from "../lib/companyEdit";
import { useStore } from "../store";
import type { CepLookupResult, Company, Contact, LegalRepresentative } from "../types";
import styles from "./CompanyContractScreen.module.scss";

const STAGES = ["pendente", "enviado", "assinado"] as const;
const STAGE_LABEL: Record<string, string> = { pendente: "Pendente", enviado: "Enviado", assinado: "Assinado" };

const COMPANY_SIZE_OPTIONS: DropdownOptions[] = [
  { value: "MEI", label: "MEI" },
  { value: "ME", label: "ME" },
  { value: "EPP", label: "EPP" },
  { value: "DEMAIS", label: "Demais" },
];

const TAX_REGIME_OPTIONS: DropdownOptions[] = [
  { value: "simples_nacional", label: "Simples Nacional" },
  { value: "lucro_presumido", label: "Lucro Presumido" },
  { value: "lucro_real", label: "Lucro Real" },
];

const UF_OPTIONS: DropdownOptions[] = UF_VALUES.map((uf) => ({ value: uf, label: uf }));

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

  // Modo de edição (ORD-063) — não reaproveita o WizardSteps do wizard
  // (ORD-060): aqui os dados já existem e já são válidos, então todas as
  // seções ficam visíveis de uma vez, sem gating por etapa.
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

  if (loading) return <div className={styles.page}>Carregando…</div>;
  if (!company) return <div className={styles.page}><Alert variant="error" text={error ?? "Empresa não encontrada"} fullWidth /></div>;

  const comercial = contacts.find((c) => c.contact_type === "comercial");
  const financeiro = contacts.find((c) => c.contact_type === "financeiro");
  const status = company.contract_status ?? "pendente";
  const currentIndex = STAGES.indexOf(status as (typeof STAGES)[number]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.h2}>{company.name}</h2>
          <div className={styles.doc}>CNPJ {formatCnpj(company.document ?? "")} · {company.legal_name}</div>
          <div className={styles.addr}>{company.street}, {company.address_number} — {company.neighborhood}, {company.city}/{company.state}</div>
        </div>
        <div className={styles.headerActions}>
          <Tag variant={company.cadastral_status === "ATIVA" ? "success" : "warning"}>
            {company.cadastral_status === "ATIVA" ? "Ativa na Receita" : company.cadastral_status ?? "Não verificada"}
          </Tag>
          <Tag variant={status === "assinado" ? "success" : "warning"}>
            {`Contrato: ${STAGE_LABEL[status].toUpperCase()}`}
          </Tag>
          {!editing && (
            <Button variant="secondary" onClick={startEditing} data-testid="btn-editar-cadastro">Editar cadastro</Button>
          )}
        </div>
      </div>

      {error && <div className={styles.alertBox}><Alert variant="error" text={error} fullWidth /></div>}

      {editing && draft && (
        <>
          <div className={styles.panel}>
            <h3 className={`${styles.h3} ${styles.h3Mb}`}>Dados cadastrais</h3>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <InputBase
                  label="CNPJ"
                  value={formatCnpj(company.document ?? "")}
                  disabled
                  title="CNPJ é imutável após o cadastro — para trocar, é preciso um novo cadastro"
                  data-testid="input-edit-cnpj"
                />
              </div>
              <div className={styles.field}>
                <InputBase
                  label="Nome fantasia*"
                  value={draft.name}
                  onChange={(e) => setDraftField("name", e.target.value)}
                  errorMessage={fieldErrors.name}
                  data-testid="input-edit-trade-name"
                />
              </div>
            </div>
            <div className={`${styles.grid2} ${styles.mt14}`}>
              <div className={styles.field}>
                <InputBase
                  label="Razão social*"
                  value={draft.legal_name}
                  onChange={(e) => setDraftField("legal_name", e.target.value)}
                  errorMessage={fieldErrors.legal_name}
                  data-testid="input-edit-legal-name"
                />
              </div>
              <div className={styles.field}>
                <Dropdown
                  label="Porte"
                  value={COMPANY_SIZE_OPTIONS.find((o) => o.value === draft.company_size) ?? null}
                  onValueSelected={(opt) => setDraftField("company_size", opt.value)}
                  options={COMPANY_SIZE_OPTIONS}
                  data-testid="select-edit-company-size"
                />
              </div>
            </div>
            <div className={`${styles.grid3} ${styles.mt14}`}>
              <div className={styles.field}>
                <InputBase label="Inscrição estadual" value={draft.state_registration} onChange={(e) => setDraftField("state_registration", e.target.value)} />
              </div>
              <div className={styles.field}>
                <Dropdown
                  label="Regime tributário"
                  value={TAX_REGIME_OPTIONS.find((o) => o.value === draft.tax_regime) ?? null}
                  onValueSelected={(opt) => setDraftField("tax_regime", opt.value)}
                  options={TAX_REGIME_OPTIONS}
                />
              </div>
              <div className={styles.field}>
                <InputBase label="CNAE principal" value={draft.cnae_code} onChange={(e) => setDraftField("cnae_code", e.target.value)} />
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={`${styles.h3} ${styles.h3Mb}`}>Endereço</h3>
            <div className={styles.grid3}>
              <div className={styles.field}>
                <InputBase
                  label="CEP"
                  value={formatCep(draft.zip_code)}
                  onChange={(e) => setDraftField("zip_code", e.target.value)}
                  errorMessage={fieldErrors.zip_code}
                  helperMessage={!fieldErrors.zip_code && !cepLookupLoading && cepLookupResult && !cepLookupResult.found ? "CEP não encontrado — preencha o endereço manualmente" : undefined}
                  loading={cepLookupLoading}
                  data-testid="input-edit-zip-code"
                />
              </div>
              <div className={`${styles.field} ${styles.spanFull}`}>
                <InputBase label="Logradouro*" value={draft.street} onChange={(e) => setDraftField("street", e.target.value)} errorMessage={fieldErrors.street} />
              </div>
            </div>
            <div className={`${styles.grid3} ${styles.mt14}`}>
              <div className={styles.field}>
                <InputBase label="Número*" value={draft.address_number} onChange={(e) => setDraftField("address_number", e.target.value)} errorMessage={fieldErrors.address_number} />
              </div>
              <div className={styles.field}>
                <InputBase label="Complemento" value={draft.complement} onChange={(e) => setDraftField("complement", e.target.value)} />
              </div>
              <div className={styles.field}>
                <InputBase label="Bairro*" value={draft.neighborhood} onChange={(e) => setDraftField("neighborhood", e.target.value)} errorMessage={fieldErrors.neighborhood} />
              </div>
            </div>
            <div className={`${styles.grid2} ${styles.mt14}`}>
              <div className={styles.field}>
                <InputBase label="Cidade*" value={draft.city} onChange={(e) => setDraftField("city", e.target.value)} errorMessage={fieldErrors.city} />
              </div>
              <div className={styles.field}>
                <Dropdown
                  label="UF*"
                  placeholder="Selecione"
                  value={UF_OPTIONS.find((o) => o.value === draft.state) ?? null}
                  onValueSelected={(opt) => setDraftField("state", opt.value)}
                  options={UF_OPTIONS}
                  errorMessage={fieldErrors.state}
                />
              </div>
            </div>
          </div>

          <div className={styles.savebar}>
            {dirtyCount > 0 ? (
              <span className={styles.dirtyNote} data-testid="dirty-count">
                <span className={styles.dirtyDot} /> {dirtyCount} campo{dirtyCount === 1 ? "" : "s"} alterado{dirtyCount === 1 ? "" : "s"}
              </span>
            ) : <span />}
            <div className={styles.savebarActions}>
              <Button variant="secondary" onClick={discardEdit} disabled={saving} data-testid="btn-descartar-edicao">Descartar</Button>
              <Button onClick={saveEdit} disabled={dirtyCount === 0} loading={saving} data-testid="btn-salvar-edicao">Salvar alterações</Button>
            </div>
          </div>
        </>
      )}

      {!editing && (
        <>
          <div className={styles.panel}>
            <h3 className={styles.h3}>Status do contrato</h3>
            <p className={styles.note}>
              Envio e assinatura acontecem <strong className={styles.emphasisTeal}>fora da plataforma</strong> — o contrato é
              enviado manualmente por e-mail e assinado via <strong className={styles.emphasisTeal}>gov.br</strong>. Esta tela
              só registra em qual etapa o processo está.
            </p>

            <div className={styles.tracker} data-testid="contract-tracker">
              {STAGES.map((s, i) => {
                const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
                return (
                  <div key={s} className={styles.stage}>
                    <div className={`${styles.circle} ${state === "current" ? styles.circleCurrent : state === "done" ? styles.circleDone : ""}`}>
                      {state === "done" ? "✓" : i + 1}
                    </div>
                    <div className={styles.stageLabel}>{STAGE_LABEL[s]}</div>
                    <div className={styles.stageTime}>
                      {s === "enviado" ? fmtDate(company.contract_sent_at) : s === "assinado" ? fmtDate(company.contract_signed_at) : fmtDate(company.created_at)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={styles.actionsRow}>
              {status === "pendente" && (
                <Button onClick={markSent} loading={updating} data-testid="btn-marcar-enviado">Marcar como enviado</Button>
              )}
              {status !== "assinado" && (
                <>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                    data-testid="input-signed-document"
                  />
                  <Button onClick={markSigned} disabled={!selectedFile} loading={updating} data-testid="btn-marcar-assinado">
                    Anexar e marcar como assinado
                  </Button>
                </>
              )}
              {status === "assinado" && (
                <>
                  <span className={styles.signedNote}>Contrato assinado — documento arquivado.</span>
                  <Button onClick={downloadSignedContract} loading={downloadingContract} data-testid="btn-baixar-contrato">
                    Baixar contrato assinado
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={`${styles.h3} ${styles.h3Mb}`}>Contatos e responsável legal</h3>
            <div className={styles.contactsGrid}>
              <div className={styles.miniCard}>
                <div className={styles.miniType}>Comercial</div>
                <div className={styles.miniName}>{comercial?.name ?? "Não informado"}</div>
                <div className={styles.miniDetail}>{comercial?.email ?? "—"}</div>
              </div>
              <div className={styles.miniCard}>
                <div className={styles.miniType}>Responsável legal</div>
                <div className={styles.miniName}>{legalRep?.name ?? "Não informado"}</div>
                <div className={`${styles.miniDetail} ${styles.miniDetailMono}`}>{legalRep ? formatCpf(legalRep.cpf) : "—"}</div>
              </div>
              <div className={styles.miniCard}>
                <div className={styles.miniType}>Financeiro</div>
                <div className={styles.miniName}>{financeiro?.name ?? "Não informado"}</div>
                <div className={styles.miniDetail}>{financeiro?.email ?? "—"}</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
