import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Alert, Button, Dropdown, InputBase, Tag, Upload, UploadListFiles, makeToast, type DropdownOptions, type UploadFile } from "design-system";
import api from "../api";
import { applyCompanyPlanTable, createContact, getCompany, getCompanyPlan, getCompanyPlanHistory, getContractDocumentUrl, getLegalRepresentative, listContacts, lookupCep, renewCompanyPlan, updateCompany, updateContractStatus, upsertLegalRepresentative } from "../api/companies";
import Table, { type TableColumn } from "../components/Table";
import { parseApiError } from "../lib/apiErrors";
import { formatCep, formatCnpj, formatCpf } from "../lib/masks";
import { isValidCep, isValidCpf, normalizeCep, UF_VALUES } from "../lib/validators";
import { companyToEditForm, diffFields, type CompanyEditForm } from "../lib/companyEdit";
import { useStore } from "../store";
import type { CepLookupResult, Company, CompanyPlan, CompanyPlanHistoryEntry, Contact, LegalRepresentative, PriceTableSummary } from "../types";
import styles from "./CompanyContractScreen.module.scss";

const STAGES = ["pendente", "enviado", "assinado"] as const;
const STAGE_LABEL: Record<string, string> = { pendente: "Pendente", enviado: "Enviado", assinado: "Assinado" };

const COMPANY_SIZE_OPTIONS: DropdownOptions[] = [
  { value: "MEI", label: "MEI" },
  { value: "ME", label: "ME" },
  { value: "EPP", label: "EPP" },
  { value: "DEMAIS", label: "Demais" },
];

// ORD-168 — exportado pra CompanyScreen.tsx reaproveitar na tradução do
// resumo somente-leitura da aba Fiscal, em vez de duplicar o mapeamento.
export const TAX_REGIME_OPTIONS: DropdownOptions[] = [
  { value: "simples_nacional", label: "Simples Nacional" },
  { value: "lucro_presumido", label: "Lucro Presumido" },
  { value: "lucro_real", label: "Lucro Real" },
  // ORD-168 — faltava MEI, recorte real da base-alvo do Ordin (pequeno food
  // service); a Focus NFe trata como regime próprio (código 4, distinto de
  // Simples Nacional) no cadastro fiscal.
  { value: "mei", label: "MEI" },
];

const UF_OPTIONS: DropdownOptions[] = UF_VALUES.map((uf) => ({ value: uf, label: uf }));

// Achado ao vivo (revisão de urgência, 2026-09-24, print do usuário):
// <input type="file"> nativo do navegador ao lado dos Button do design
// system destoava (estilo de SO, sem nada em comum visualmente) — troca
// pro componente Upload já usado em CompanyScreen.tsx (certificado A1).
const CONTRATO_ASSINADO_TYPES = ["application/pdf"];
const CONTRATO_ASSINADO_MAX_SIZE_MB = 10;

// Achado ao vivo (revisão de urgência, 2026-09-24): mesmo shape de
// ContactForm/campos já usado no passo 3/4 do wizard (NewCompanyScreen.tsx)
// — duplicado aqui de propósito (tela pequena, mesmo padrão de
// UF_OPTIONS/TAX_REGIME_OPTIONS já duplicados entre as duas telas).
interface ContactFormValue { name: string; roleTitle: string; email: string; phone: string; }
const emptyContactForm: ContactFormValue = { name: "", roleTitle: "", email: "", phone: "" };
interface LegalRepFormValue { name: string; cpf: string; roleTitle: string; email: string; phone: string; }
const emptyLegalRepForm: LegalRepFormValue = { name: "", cpf: "", roleTitle: "", email: "", phone: "" };

// Achado ao vivo (revisão de urgência, 2026-09-24, print do usuário): com
// endereço vazio (empresa cadastrada sem CEP/endereço, ex: Pasta & Co no
// seed local), o cabeçalho renderizava literalmente ", — , /SP" — juntando
// os separadores fixos com campos undefined/vazios. Monta cada pedaço só
// com o que existe, e cai num fallback textual se nada estiver preenchido.
function formatCompanyAddress(c: Company): string {
  const streetPart = [c.street, c.address_number].filter(Boolean).join(", ");
  const cityState = c.city && c.state ? `${c.city}/${c.state}` : c.city || c.state || "";
  const rest = [c.neighborhood, cityState].filter(Boolean).join(", ");
  const full = [streetPart, rest].filter(Boolean).join(" — ");
  return full || "Endereço não informado";
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

// ORD-165 — rótulo da ação registrada no histórico do plano.
const HISTORY_ACTION_LABEL: Record<CompanyPlanHistoryEntry["action"], string> = {
  renew: "Renovação",
  apply: "Aplicação",
};

export default function CompanyContractScreen() {
  const { id } = useParams<{ id: string }>();
  const companyId = Number(id);

  const [company, setCompany] = useState<Company | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [legalRep, setLegalRep] = useState<LegalRepresentative | null>(null);
  const [plan, setPlan] = useState<CompanyPlan | null>(null);
  const [renewingPlan, setRenewingPlan] = useState(false);
  // ORD-164 — tabelas elegíveis pra escolha manual: a vigente + qualquer
  // marcada como alternativa/promocional (mesma regra de validação do
  // backend em _validate_plan_price_table_choice).
  const [availableTables, setAvailableTables] = useState<PriceTableSummary[]>([]);
  // ORD-165 — histórico consultável de toda troca de tabela do plano.
  const [planHistory, setPlanHistory] = useState<CompanyPlanHistoryEntry[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [applyingTable, setApplyingTable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [downloadingContract, setDownloadingContract] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);

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

  // Achado ao vivo (revisão de urgência, 2026-09-24): comercial/financeiro/
  // responsável legal não fazem parte de CompanyEditForm (são entidades
  // próprias, com endpoints próprios — createContact/upsertLegalRepresentative
  // — não o PUT /companies/{id}) — por isso ficam fora do dirtyFields de
  // Company e têm seu próprio rastreamento de "sujo" abaixo.
  const [comercialDraft, setComercialDraft] = useState<ContactFormValue>(emptyContactForm);
  const [financeiroDraft, setFinanceiroDraft] = useState<ContactFormValue>(emptyContactForm);
  const [repDraft, setRepDraft] = useState<LegalRepFormValue>(emptyLegalRepForm);
  const [contactFieldErrors, setContactFieldErrors] = useState<Record<string, string>>({});

  const originalForm = company ? companyToEditForm(company) : null;
  const dirtyFields = draft && originalForm ? diffFields(originalForm, draft) : {};
  const dirtyCount = Object.keys(dirtyFields).length;

  function contactToForm(c: Contact | undefined): ContactFormValue {
    return c ? { name: c.name, roleTitle: c.role_title ?? "", email: c.email, phone: c.phone ?? "" } : emptyContactForm;
  }
  function legalRepToForm(r: LegalRepresentative | null): LegalRepFormValue {
    return r ? { name: r.name, cpf: r.cpf, roleTitle: r.role_title ?? "", email: r.email, phone: r.phone ?? "" } : emptyLegalRepForm;
  }
  function contactFormEquals(a: ContactFormValue, b: ContactFormValue): boolean {
    return a.name === b.name && a.roleTitle === b.roleTitle && a.email === b.email && a.phone === b.phone;
  }
  const originalComercial = contactToForm(contacts.find((c) => c.contact_type === "comercial"));
  const originalFinanceiro = contactToForm(contacts.find((c) => c.contact_type === "financeiro"));
  const originalRep = legalRepToForm(legalRep);
  const contactsDirty = editing && (
    !contactFormEquals(comercialDraft, originalComercial)
    || !contactFormEquals(financeiroDraft, originalFinanceiro)
    || repDraft.name !== originalRep.name || repDraft.cpf !== originalRep.cpf
    || repDraft.roleTitle !== originalRep.roleTitle || repDraft.email !== originalRep.email || repDraft.phone !== originalRep.phone
  );

  // useBlocker do React Router só funciona sob um data router — este app usa
  // <BrowserRouter> puro (main.tsx), então o bloqueio de navegação vive num
  // flag global (store.unsavedChanges) que o Sidebar consulta antes de
  // navegar. Cobre fechar aba/reload via beforeunload abaixo.
  useEffect(() => {
    useStore.getState().setUnsavedChanges(dirtyCount > 0 || contactsDirty);
    return () => useStore.getState().setUnsavedChanges(false);
  }, [dirtyCount, contactsDirty]);

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtyCount > 0 || contactsDirty) { e.preventDefault(); e.returnValue = ""; }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirtyCount, contactsDirty]);

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
    // ORD-163 — plano comercial busca separada: toda empresa deveria ter um
    // (criado junto na criação), mas não é motivo pra travar o resto da
    // tela se, por algum motivo, não existir.
    let currentPlan: CompanyPlan | null = null;
    try {
      currentPlan = await getCompanyPlan(companyId);
      setPlan(currentPlan);
    } catch {
      setPlan(null);
    }
    // ORD-164 — mesma busca da lista de tabelas, filtrada pras elegíveis
    // (vigente ou com kind definido) — não trava a tela se falhar.
    try {
      const r = await api.get("/commercial/price-tables");
      const eligible: PriceTableSummary[] = (r.data.price_tables ?? []).filter(
        (t: PriceTableSummary) => t.status === "active" || t.kind !== null
      );
      setAvailableTables(eligible);
      setSelectedTableId(currentPlan?.price_table.id ?? eligible.find((t) => t.status === "active")?.id ?? null);
    } catch {
      setAvailableTables([]);
    }
    // ORD-165 — histórico não trava o resto da tela se falhar, mesmo padrão
    // do plano e das tabelas elegíveis acima.
    try {
      setPlanHistory((await getCompanyPlanHistory(companyId)).entries);
    } catch {
      setPlanHistory([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function renewPlan() {
    // ORD-164 — escolha manual: só manda price_table_id se a seleção atual
    // for de fato uma tabela elegível (QA manual achou o bug: selectedTableId
    // nasce igual à tabela já vinculada ao plano, mesmo que ela tenha
    // deixado de ser elegível nesse meio-tempo — ex. teve o kind removido.
    // Mandar esse id "obsoleto" quebrava a renovação com 422 mesmo sem o
    // admin ter tocado no seletor. Validar contra availableTables antes de
    // enviar garante o comportamento padrão da ORD-163 (usa a vigente).
    const selectionIsEligible = availableTables.some((t) => t.id === selectedTableId);
    setRenewingPlan(true);
    try {
      setPlan(await renewCompanyPlan(companyId, selectionIsEligible ? selectedTableId ?? undefined : undefined));
      makeToast("success", "Plano comercial renovado — vencimento adiado 365 dias");
      refreshHistory();
    } catch (err) {
      makeToast("error", parseApiError(err).message);
    } finally {
      setRenewingPlan(false);
    }
  }

  async function applyTable() {
    // ORD-164 — troca só a tabela, sem adiantar o vencimento (ação
    // distinta de renovar).
    if (!selectedTableId) return;
    setApplyingTable(true);
    try {
      setPlan(await applyCompanyPlanTable(companyId, selectedTableId));
      makeToast("success", "Tabela aplicada — vencimento do contrato não foi alterado");
      refreshHistory();
    } catch (err) {
      makeToast("error", parseApiError(err).message);
    } finally {
      setApplyingTable(false);
    }
  }

  async function refreshHistory() {
    // ORD-165 — a gravação do histórico é best-effort mas síncrona dentro
    // da mesma requisição de renovar/aplicar; buscar de novo logo depois já
    // reflete o registro novo (ou a ausência dele, se a gravação falhou).
    try {
      setPlanHistory((await getCompanyPlanHistory(companyId)).entries);
    } catch {
      // silencioso — não é motivo pra atrapalhar o toast de sucesso da ação principal
    }
  }

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
      setUploadFiles([]);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setUpdating(false);
    }
  }

  function handleContractUpload(files: UploadFile[]) {
    const picked = files[0];
    setUploadFiles(files);
    setSelectedFile(picked && picked.status === "success" ? picked.file : null);
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
    setComercialDraft(contactToForm(contacts.find((c) => c.contact_type === "comercial")));
    setFinanceiroDraft(contactToForm(contacts.find((c) => c.contact_type === "financeiro")));
    setRepDraft(legalRepToForm(legalRep));
    setFieldErrors({});
    setContactFieldErrors({});
    setError(null);
    setEditing(true);
  }

  function discardEdit() {
    setDraft(null);
    setFieldErrors({});
    setContactFieldErrors({});
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

    // Mesma validação já usada no passo 3/4 do wizard (NewCompanyScreen.tsx):
    // comercial e responsável legal são obrigatórios; financeiro só valida
    // se algum campo foi preenchido (senão fica de fora do save, igual à
    // criação).
    const financeiroTocado = !!(financeiroDraft.name || financeiroDraft.roleTitle || financeiroDraft.email || financeiroDraft.phone);
    const cErrs: Record<string, string> = {};
    if (!comercialDraft.name.trim()) cErrs.comercial_name = "Nome do contato comercial é obrigatório";
    if (!comercialDraft.email.trim()) cErrs.comercial_email = "E-mail do contato comercial é obrigatório";
    if (financeiroTocado && !financeiroDraft.name.trim()) cErrs.financeiro_name = "Nome do contato financeiro é obrigatório";
    if (financeiroTocado && !financeiroDraft.email.trim()) cErrs.financeiro_email = "E-mail do contato financeiro é obrigatório";
    if (!repDraft.name.trim()) cErrs.rep_name = "Nome do responsável legal é obrigatório";
    if (!isValidCpf(repDraft.cpf)) cErrs.rep_cpf = "CPF inválido (formato ou dígito verificador)";
    if (!repDraft.email.trim()) cErrs.rep_email = "E-mail do responsável legal é obrigatório";
    if (Object.keys(cErrs).length) { setContactFieldErrors(cErrs); return; }

    setSaving(true);
    setFieldErrors({});
    setContactFieldErrors({});
    setError(null);
    try {
      let updated = company as Company;
      if (dirtyCount > 0) {
        updated = await updateCompany(companyId, dirtyFields);
      }
      if (!contactFormEquals(comercialDraft, originalComercial)) {
        await createContact(companyId, {
          contact_type: "comercial", name: comercialDraft.name, role_title: comercialDraft.roleTitle || undefined,
          email: comercialDraft.email, phone: comercialDraft.phone || undefined,
        });
      }
      if (financeiroTocado && !contactFormEquals(financeiroDraft, originalFinanceiro)) {
        await createContact(companyId, {
          contact_type: "financeiro", name: financeiroDraft.name, role_title: financeiroDraft.roleTitle || undefined,
          email: financeiroDraft.email, phone: financeiroDraft.phone || undefined,
        });
      }
      const repChanged = repDraft.name !== originalRep.name || repDraft.cpf !== originalRep.cpf
        || repDraft.roleTitle !== originalRep.roleTitle || repDraft.email !== originalRep.email || repDraft.phone !== originalRep.phone;
      if (repChanged) {
        await upsertLegalRepresentative(companyId, {
          name: repDraft.name, cpf: repDraft.cpf, role_title: repDraft.roleTitle || undefined,
          email: repDraft.email, phone: repDraft.phone || undefined,
        });
      }
      const [cs, rep] = await Promise.all([listContacts(companyId), getLegalRepresentative(companyId)]);
      setContacts(cs);
      setLegalRep(rep);
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

  // ORD-165 — colunas do histórico de troca de tabela do plano comercial.
  const planHistoryColumns: TableColumn<CompanyPlanHistoryEntry>[] = [
    { key: "created_at", header: "Quando", mono: true, render: (e) => fmtDate(e.created_at) },
    { key: "action", header: "Ação", render: (e) => HISTORY_ACTION_LABEL[e.action] },
    { key: "from", header: "Tabela anterior", render: (e) => e.from_price_table.name },
    { key: "to", header: "Tabela nova", render: (e) => e.to_price_table.name },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.h2}>{company.name}</h2>
          <div className={styles.doc}>CNPJ {formatCnpj(company.document ?? "")} · {company.legal_name}</div>
          <div className={styles.addr}>{formatCompanyAddress(company)}</div>
        </div>
        <div className={styles.headerActions}>
          <Tag variant={company.cadastral_status === "ATIVA" ? "success" : "warning"}>
            <i className={`icon icon-${company.cadastral_status === "ATIVA" ? "check-circle" : "alert-triangle"} ${styles.statusIcon}`} />
            {company.cadastral_status === "ATIVA" ? "Ativa na Receita" : company.cadastral_status ?? "Não verificada"}
          </Tag>
          <Tag variant={status === "assinado" ? "success" : "warning"}>
            <i className={`icon icon-${status === "assinado" ? "check-circle" : status === "enviado" ? "send" : "clock"} ${styles.statusIcon}`} />
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

          <div className={styles.panel}>
            <h3 className={`${styles.h3} ${styles.h3Mb}`}>Contatos e responsável legal</h3>

            <h4 className={styles.h4}>Contato comercial</h4>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <InputBase label="Nome*" value={comercialDraft.name} onChange={(e) => setComercialDraft((v) => ({ ...v, name: e.target.value }))} errorMessage={contactFieldErrors.comercial_name} />
              </div>
              <div className={styles.field}>
                <InputBase label="Cargo" value={comercialDraft.roleTitle} onChange={(e) => setComercialDraft((v) => ({ ...v, roleTitle: e.target.value }))} />
              </div>
            </div>
            <div className={`${styles.grid2} ${styles.mt14}`}>
              <div className={styles.field}>
                <InputBase label="E-mail*" value={comercialDraft.email} onChange={(e) => setComercialDraft((v) => ({ ...v, email: e.target.value }))} errorMessage={contactFieldErrors.comercial_email} />
              </div>
              <div className={styles.field}>
                <InputBase label="Telefone" value={comercialDraft.phone} onChange={(e) => setComercialDraft((v) => ({ ...v, phone: e.target.value }))} />
              </div>
            </div>

            <h4 className={`${styles.h4} ${styles.mt14}`}>Contato financeiro (opcional)</h4>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <InputBase label="Nome" value={financeiroDraft.name} onChange={(e) => setFinanceiroDraft((v) => ({ ...v, name: e.target.value }))} errorMessage={contactFieldErrors.financeiro_name} />
              </div>
              <div className={styles.field}>
                <InputBase label="Cargo" value={financeiroDraft.roleTitle} onChange={(e) => setFinanceiroDraft((v) => ({ ...v, roleTitle: e.target.value }))} />
              </div>
            </div>
            <div className={`${styles.grid2} ${styles.mt14}`}>
              <div className={styles.field}>
                <InputBase label="E-mail" value={financeiroDraft.email} onChange={(e) => setFinanceiroDraft((v) => ({ ...v, email: e.target.value }))} errorMessage={contactFieldErrors.financeiro_email} />
              </div>
              <div className={styles.field}>
                <InputBase label="Telefone" value={financeiroDraft.phone} onChange={(e) => setFinanceiroDraft((v) => ({ ...v, phone: e.target.value }))} />
              </div>
            </div>

            <h4 className={`${styles.h4} ${styles.mt14}`}>Responsável legal</h4>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <InputBase label="Nome*" value={repDraft.name} onChange={(e) => setRepDraft((v) => ({ ...v, name: e.target.value }))} errorMessage={contactFieldErrors.rep_name} />
              </div>
              <div className={styles.field}>
                <InputBase label="CPF*" value={formatCpf(repDraft.cpf)} onChange={(e) => setRepDraft((v) => ({ ...v, cpf: e.target.value }))} errorMessage={contactFieldErrors.rep_cpf} />
              </div>
            </div>
            <div className={`${styles.grid3} ${styles.mt14}`}>
              <div className={styles.field}>
                <InputBase label="Cargo" value={repDraft.roleTitle} onChange={(e) => setRepDraft((v) => ({ ...v, roleTitle: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <InputBase label="E-mail*" value={repDraft.email} onChange={(e) => setRepDraft((v) => ({ ...v, email: e.target.value }))} errorMessage={contactFieldErrors.rep_email} />
              </div>
              <div className={styles.field}>
                <InputBase label="Telefone" value={repDraft.phone} onChange={(e) => setRepDraft((v) => ({ ...v, phone: e.target.value }))} />
              </div>
            </div>
          </div>

          <div className={styles.savebar}>
            {dirtyCount > 0 || contactsDirty ? (
              <span className={styles.dirtyNote} data-testid="dirty-count">
                <span className={styles.dirtyDot} /> {dirtyCount > 0 ? `${dirtyCount} campo${dirtyCount === 1 ? "" : "s"} alterado${dirtyCount === 1 ? "" : "s"}` : "Contatos alterados"}
              </span>
            ) : <span />}
            <div className={styles.savebarActions}>
              <Button variant="secondary" onClick={discardEdit} disabled={saving} data-testid="btn-descartar-edicao">Descartar</Button>
              <Button onClick={saveEdit} disabled={dirtyCount === 0 && !contactsDirty} loading={saving} data-testid="btn-salvar-edicao">Salvar alterações</Button>
            </div>
          </div>
        </>
      )}

      {!editing && (
        <>
          <div className={styles.panel}>
            <h3 className={styles.h3}>Status do contrato</h3>
            <p className={styles.note}>
              Envio e assinatura acontecem <strong className={styles.emphasisAccent}>fora da plataforma</strong> — o contrato é
              enviado manualmente por e-mail e assinado via <strong className={styles.emphasisAccent}>gov.br</strong>. Esta tela
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

            {status !== "assinado" && (
              <div className={styles.statusContentBlock} data-testid="input-signed-document">
                <Upload
                  fullWidth
                  maxFileSize={CONTRATO_ASSINADO_MAX_SIZE_MB}
                  multipleFiles={false}
                  types={CONTRATO_ASSINADO_TYPES}
                  helperMessage="PDF, até 10 MB"
                  errorMessage="Envie um arquivo PDF de até 10 MB"
                  onCallbackUpload={handleContractUpload}
                />
                <UploadListFiles items={uploadFiles} removable={false} />
              </div>
            )}

            {status === "assinado" && (
              <div className={styles.statusContentBlock}>
                <Alert variant="success" icon="check-circle" text="Contrato assinado — documento arquivado." fullWidth />
              </div>
            )}

            <div className={status !== "assinado" ? styles.actionsRowSplit : styles.actionsRow}>
              {status === "pendente" && (
                <Button onClick={markSent} loading={updating} data-testid="btn-marcar-enviado">Marcar como enviado</Button>
              )}
              {status !== "assinado" && (
                <Button onClick={markSigned} disabled={!selectedFile} loading={updating} data-testid="btn-marcar-assinado">
                  Anexar e marcar como assinado
                </Button>
              )}
              {status === "assinado" && (
                <Button onClick={downloadSignedContract} loading={downloadingContract} data-testid="btn-baixar-contrato">
                  Baixar contrato assinado
                </Button>
              )}
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={`${styles.h3} ${styles.h3Mb}`}>Plano comercial</h3>
            {plan ? (
              <div className={styles.contactsGrid}>
                <div className={styles.miniCard}>
                  <div className={styles.miniType}>Status</div>
                  <div className={styles.miniName}>
                    <Tag variant={plan.status === "Ativo" ? "success" : "warning"}>{plan.status}</Tag>
                  </div>
                </div>
                <div className={styles.miniCard}>
                  <div className={styles.miniType}>Tabela de preço</div>
                  <div className={styles.miniName}>{plan.price_table.name}</div>
                </div>
                <div className={styles.miniCard}>
                  <div className={styles.miniType}>Vencimento</div>
                  <div className={styles.miniName}>{fmtDate(plan.expires_at)}</div>
                  <div className={styles.miniDetail}>{plan.renewed_at ? `Renovado em ${fmtDate(plan.renewed_at)}` : "Nunca renovado"}</div>
                </div>
              </div>
            ) : (
              <div className={styles.miniDetail}>Nenhum plano comercial encontrado pra esta empresa.</div>
            )}
            {plan && (
              <div className={styles.changeTable}>
                <div className={styles.changeTableHeading}>Trocar tabela de preço</div>
                <div className={styles.changeTableNote}>
                  {availableTables.length > 0
                    ? "Escolha a tabela vigente ou uma marcada como alternativa/promocional. “Renovar” também adianta o vencimento em 365 dias; “Aplicar tabela” só troca a tabela do plano, sem mexer no vencimento."
                    : "Nenhuma tabela alternativa/promocional disponível no momento — renovar usa a tabela vigente automaticamente."}
                </div>
                {/* ORD-164: "Renovar plano" não depende de availableTables —
                    já funcionava com qualquer plano antes desta história; se
                    o fetch da lista falhar, cai no padrão (usa a active). Só
                    o seletor e "Aplicar tabela" dependem da lista de fato. */}
                {availableTables.length > 0 && (
                  <div style={{ maxWidth: 320, marginBottom: 16 }}>
                    <Dropdown
                      label="Nova tabela"
                      options={availableTables.map((t) => ({
                        value: String(t.id),
                        label: t.status === "active" ? `${t.name} (vigente)` : `${t.name} (${t.kind === "promocional" ? "promocional" : "alternativa"})`,
                      }))}
                      value={(() => {
                        const t = availableTables.find((t) => t.id === selectedTableId);
                        return t
                          ? { value: String(t.id), label: t.status === "active" ? `${t.name} (vigente)` : `${t.name} (${t.kind === "promocional" ? "promocional" : "alternativa"})` }
                          : null;
                      })()}
                      onValueSelected={(opt) => setSelectedTableId(Number(opt.value))}
                    />
                  </div>
                )}
                <div className={styles.actionsRow} style={{ marginTop: 0 }}>
                  <Button size="small" variant="secondary" onClick={renewPlan} loading={renewingPlan}>
                    Renovar plano (+365 dias)
                  </Button>
                  {availableTables.length > 0 && (
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={applyTable}
                      loading={applyingTable}
                      disabled={selectedTableId === plan.price_table.id}
                    >
                      Aplicar tabela (sem alterar vencimento)
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className={styles.panel}>
            <h3 className={`${styles.h3} ${styles.h3Mb}`}>Histórico do plano</h3>
            {planHistory.length > 0 ? (
              <Table
                variant="compact"
                columns={planHistoryColumns}
                rows={planHistory}
                rowKey={(entry) => `${entry.created_at}-${entry.to_price_table.id}`}
              />
            ) : (
              <div className={styles.miniDetail}>Nenhuma troca de tabela registrada ainda.</div>
            )}
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
