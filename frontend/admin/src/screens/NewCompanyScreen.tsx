import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Stepper, { StepDef } from "../components/Stepper";
import Spinner from "../components/Spinner";
import { createCompany, createContact, lookupCep, lookupCnpj, upsertLegalRepresentative } from "../api/companies";
import { parseApiError } from "../lib/apiErrors";
import { formatCep, formatCnpj, formatCpf } from "../lib/masks";
import { isValidCep, isValidCnpj, isValidCpf, normalizeCep, normalizeCnpj, UF_VALUES } from "../lib/validators";
import type { CepLookupResult, CnpjLookupResult } from "../types";

const STEPS: StepDef[] = [
  { label: "Dados cadastrais", sub: "CNPJ e Receita Federal" },
  { label: "Endereço", sub: "Preenchido pela Receita" },
  { label: "Contatos", sub: "Comercial, financeiro, técnico" },
  { label: "Responsável legal", sub: "Quem assina o contrato" },
  { label: "Revisão", sub: "Confirmar e criar" },
];

const S = {
  page: { padding: 32, color: "var(--a-text)", maxWidth: 1100 } as React.CSSProperties,
  eyebrow: { fontFamily: "'Lexend', sans-serif", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9900ff", fontWeight: 600 } as React.CSSProperties,
  title: { fontFamily: "'Lexend', sans-serif", fontSize: 24, fontWeight: 600, marginTop: 6, marginBottom: 28 } as React.CSSProperties,
  wizard: { display: "grid", gridTemplateColumns: "230px 1fr", gap: 26, alignItems: "start" } as React.CSSProperties,
  panel: { background: "var(--a-surface)", border: "1px solid rgba(153,0,255,0.2)", borderRadius: 16, padding: "26px 28px 28px" } as React.CSSProperties,
  panelHead: { marginBottom: 20 } as React.CSSProperties,
  h2: { fontFamily: "'Lexend', sans-serif", fontSize: 18, fontWeight: 600 } as React.CSSProperties,
  hint: { color: "rgba(var(--a-text-rgb),0.5)", fontSize: 13, marginTop: 4 } as React.CSSProperties,
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 16px" } as React.CSSProperties,
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 16px" } as React.CSSProperties,
  field: { display: "flex", flexDirection: "column", gap: 6 } as React.CSSProperties,
  label: { fontSize: 12, fontWeight: 600, color: "rgba(var(--a-text-rgb),0.5)" } as React.CSSProperties,
  req: { color: "#ff4d6d", marginLeft: 2 } as React.CSSProperties,
  input: {
    fontSize: 14, color: "var(--a-text)", background: "var(--a-bg)", border: "1px solid rgba(var(--a-neutral-rgb),0.07)",
    borderRadius: 9, padding: "10px 12px", outline: "none",
  } as React.CSSProperties,
  inputError: { borderColor: "#ff4d6d" } as React.CSSProperties,
  inputSpinner: { position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" } as React.CSSProperties,
  fieldErr: { fontSize: 11.5, color: "#ff4d6d" } as React.CSSProperties,
  lookupOk: {
    display: "flex", alignItems: "center", gap: 10, marginTop: 16, padding: "12px 14px",
    background: "rgba(93,212,144,0.16)", border: "1px solid rgba(93,212,144,0.3)", borderRadius: 10,
  } as React.CSSProperties,
  lookupWarn: {
    display: "flex", alignItems: "center", gap: 10, marginTop: 16, padding: "12px 14px",
    background: "rgba(255,184,77,0.16)", border: "1px solid rgba(255,184,77,0.3)", borderRadius: 10,
  } as React.CSSProperties,
  lookupBad: {
    display: "flex", alignItems: "center", gap: 10, marginTop: 16, padding: "12px 14px",
    background: "rgba(255,77,109,0.10)", border: "1px solid rgba(255,77,109,0.3)", borderRadius: 10,
  } as React.CSSProperties,
  contactCard: { border: "1px solid rgba(var(--a-neutral-rgb),0.07)", borderRadius: 12, padding: "16px 18px", marginBottom: 14 } as React.CSSProperties,
  contactHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 } as React.CSSProperties,
  badgeReq: { fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "#9900ff", background: "rgba(153,0,255,0.12)", padding: "3px 8px", borderRadius: 999 } as React.CSSProperties,
  ghostAdd: {
    display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", border: "1px dashed rgba(var(--a-neutral-rgb),0.15)",
    borderRadius: 12, color: "rgba(var(--a-text-rgb),0.5)", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 10, background: "transparent",
  } as React.CSSProperties,
  actions: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, paddingTop: 18, borderTop: "1px solid rgba(var(--a-neutral-rgb),0.07)" } as React.CSSProperties,
  btnPrimary: { fontFamily: "'Lexend', sans-serif", fontSize: 13.5, fontWeight: 600, padding: "11px 22px", borderRadius: 9, border: "none", background: "#9900ff", color: "#fff", cursor: "pointer" } as React.CSSProperties,
  btnGhost: { fontFamily: "'Lexend', sans-serif", fontSize: 13.5, fontWeight: 600, padding: "11px 20px", borderRadius: 9, border: "1px solid rgba(var(--a-neutral-rgb),0.12)", background: "transparent", color: "rgba(var(--a-text-rgb),0.6)", cursor: "pointer" } as React.CSSProperties,
  reviewGroup: { borderBottom: "1px solid rgba(var(--a-neutral-rgb),0.07)", padding: "14px 0" } as React.CSSProperties,
  reviewHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 } as React.CSSProperties,
  reviewTitle: { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(var(--a-text-rgb),0.5)" } as React.CSSProperties,
  reviewEdit: { fontFamily: "'Lexend', sans-serif", fontSize: 12, fontWeight: 600, color: "#9900ff", background: "none", border: "none", cursor: "pointer" } as React.CSSProperties,
  kv: { fontSize: 13.5 } as React.CSSProperties,
  kvLabel: { fontSize: 11, color: "rgba(var(--a-text-rgb),0.5)" } as React.CSSProperties,
  successBox: { textAlign: "center", padding: "40px 20px" } as React.CSSProperties,
};

interface ContactForm { name: string; roleTitle: string; email: string; phone: string; }
const emptyContact: ContactForm = { name: "", roleTitle: "", email: "", phone: "" };

export default function NewCompanyScreen() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ id: number; pin: string } | null>(null);

  // Passo 1
  const [cnpj, setCnpj] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [stateRegistration, setStateRegistration] = useState("");
  const [taxRegime, setTaxRegime] = useState("simples_nacional");
  const [companySize, setCompanySize] = useState("ME");
  const [cnaeCode, setCnaeCode] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<CnpjLookupResult | null>(null);
  const lookupTimer = useRef<ReturnType<typeof setTimeout>>();

  // Passo 2
  const [zipCode, setZipCode] = useState("");
  const [street, setStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [ufState, setUfState] = useState("");
  const [cepLookupLoading, setCepLookupLoading] = useState(false);
  const [cepLookupResult, setCepLookupResult] = useState<CepLookupResult | null>(null);
  const cepLookupTimer = useRef<ReturnType<typeof setTimeout>>();

  // Passo 3
  const [comercial, setComercial] = useState<ContactForm>(emptyContact);
  const [financeiro, setFinanceiro] = useState<ContactForm | null>(null);
  const [tecnico, setTecnico] = useState<ContactForm | null>(null);

  // Passo 4
  const [repName, setRepName] = useState("");
  const [repCpf, setRepCpf] = useState("");
  const [repRole, setRepRole] = useState("");
  const [repEmail, setRepEmail] = useState("");
  const [repPhone, setRepPhone] = useState("");

  useEffect(() => {
    const normalized = normalizeCnpj(cnpj);
    if (!isValidCnpj(normalized)) {
      setLookupResult(null);
      return;
    }
    clearTimeout(lookupTimer.current);
    lookupTimer.current = setTimeout(async () => {
      setLookupLoading(true);
      try {
        const result = await lookupCnpj(normalized);
        setLookupResult(result);
        if (result.found) {
          if (result.legal_name) setLegalName(result.legal_name);
          if (result.trade_name) setTradeName(result.trade_name);
          if (result.zip_code) setZipCode(result.zip_code);
          if (result.street) setStreet(result.street);
          if (result.address_number) setAddressNumber(result.address_number);
          if (result.complement) setComplement(result.complement);
          if (result.neighborhood) setNeighborhood(result.neighborhood);
          if (result.city) setCity(result.city);
          if (result.state) setUfState(result.state);
        }
      } catch {
        setLookupResult({ found: false, reason: "lookup_unavailable", cadastral_status: "NAO_VERIFICADA" });
      } finally {
        setLookupLoading(false);
      }
    }, 500);
    return () => clearTimeout(lookupTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnpj]);

  useEffect(() => {
    const normalized = normalizeCep(zipCode);
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
          if (result.street) setStreet(result.street);
          if (result.neighborhood) setNeighborhood(result.neighborhood);
          if (result.city) setCity(result.city);
          if (result.state) setUfState(result.state);
        }
      } catch {
        setCepLookupResult({ found: false, reason: "lookup_unavailable" });
      } finally {
        setCepLookupLoading(false);
      }
    }, 500);
    return () => clearTimeout(cepLookupTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zipCode]);

  function goToStep(i: number) {
    setSubmitError(null);
    setStep(i);
  }

  function advance() {
    setFieldErrors({});
    if (step === 0) {
      const errs: Record<string, string> = {};
      if (!isValidCnpj(cnpj)) errs.document = "CNPJ inválido (formato ou dígito verificador)";
      if (!tradeName.trim()) errs.name = "Nome fantasia é obrigatório";
      if (!legalName.trim()) errs.legal_name = "Razão social é obrigatória";
      if (lookupResult?.found && lookupResult.cadastral_status !== "ATIVA") {
        errs.document = `CNPJ com situação "${lookupResult.cadastral_status}" na Receita Federal — não é possível prosseguir`;
      }
      if (lookupResult && !lookupResult.found && lookupResult.reason === "cnpj_not_found") {
        errs.document = "CNPJ não encontrado na Receita Federal";
      }
      if (Object.keys(errs).length) { setFieldErrors(errs); return; }
    }
    if (step === 1) {
      const errs: Record<string, string> = {};
      if (zipCode && !isValidCep(zipCode)) errs.zip_code = "CEP inválido — deve conter 8 dígitos";
      if (!street.trim()) errs.street = "Logradouro é obrigatório";
      if (!addressNumber.trim()) errs.address_number = "Número é obrigatório";
      if (!neighborhood.trim()) errs.neighborhood = "Bairro é obrigatório";
      if (!city.trim()) errs.city = "Cidade é obrigatória";
      if (!ufState.trim()) errs.state = "UF é obrigatória";
      if (Object.keys(errs).length) { setFieldErrors(errs); return; }
    }
    if (step === 2) {
      const errs: Record<string, string> = {};
      if (!comercial.name.trim()) errs.comercial_name = "Nome do contato comercial é obrigatório";
      if (!comercial.email.trim()) errs.comercial_email = "E-mail do contato comercial é obrigatório";
      if (Object.keys(errs).length) { setFieldErrors(errs); return; }
    }
    if (step === 3) {
      const errs: Record<string, string> = {};
      if (!repName.trim()) errs.rep_name = "Nome do responsável legal é obrigatório";
      if (!isValidCpf(repCpf)) errs.rep_cpf = "CPF inválido (formato ou dígito verificador)";
      if (!repEmail.trim()) errs.rep_email = "E-mail do responsável legal é obrigatório";
      if (Object.keys(errs).length) { setFieldErrors(errs); return; }
    }
    const next = Math.min(step + 1, STEPS.length - 1);
    setStep(next);
    setMaxReached((m) => Math.max(m, next));
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { company, pin } = await createCompany({
        name: tradeName,
        document: cnpj,
        legal_name: legalName,
        state_registration: stateRegistration || undefined,
        tax_regime: taxRegime || undefined,
        company_size: companySize || undefined,
        cnae_code: cnaeCode || undefined,
        zip_code: zipCode || undefined,
        street: street || undefined,
        address_number: addressNumber || undefined,
        complement: complement || undefined,
        neighborhood: neighborhood || undefined,
        city: city || undefined,
        state: ufState || undefined,
      });

      await createContact(company.id, {
        contact_type: "comercial",
        name: comercial.name,
        role_title: comercial.roleTitle || undefined,
        email: comercial.email,
        phone: comercial.phone || undefined,
      });
      if (financeiro?.name) {
        await createContact(company.id, {
          contact_type: "financeiro", name: financeiro.name,
          role_title: financeiro.roleTitle || undefined, email: financeiro.email, phone: financeiro.phone || undefined,
        });
      }
      if (tecnico?.name) {
        await createContact(company.id, {
          contact_type: "tecnico", name: tecnico.name,
          role_title: tecnico.roleTitle || undefined, email: tecnico.email, phone: tecnico.phone || undefined,
        });
      }

      await upsertLegalRepresentative(company.id, {
        name: repName, cpf: repCpf, role_title: repRole || undefined, email: repEmail, phone: repPhone || undefined,
      });

      setCreated({ id: company.id, pin });
    } catch (err) {
      const parsed = parseApiError(err);
      setSubmitError(parsed.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <div style={S.page}>
        <div style={S.panel}>
          <div style={S.successBox}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <h2 style={S.h2}>Cliente cadastrado com sucesso</h2>
            <p style={S.hint}>PIN de acesso do totem: <strong style={{ fontFamily: "'Courier New', monospace", color: "var(--a-text)" }}>{created.pin}</strong></p>
            <div style={{ marginTop: 24, display: "flex", gap: 12, justifyContent: "center" }}>
              <button style={S.btnPrimary} onClick={() => navigate(`/companies/${created.id}/contract`)}>
                Ver detalhe e status do contrato
              </button>
              <button style={S.btnGhost} onClick={() => window.location.reload()}>Cadastrar outro cliente</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.eyebrow}>Empresas / Novo cliente</div>
      <h1 style={S.title}>Cadastro de cliente</h1>

      <div style={S.wizard}>
        <Stepper steps={STEPS} current={step} maxReached={maxReached} onSelect={goToStep} />

        <div style={S.panel}>
          {step === 0 && (
            <>
              <div style={S.panelHead}>
                <h2 style={S.h2}>Dados cadastrais</h2>
                <p style={S.hint}>Informe o CNPJ — a situação cadastral é verificada na Receita Federal.</p>
              </div>
              <div style={S.grid2}>
                <div style={S.field}>
                  <label style={S.label}>CNPJ<span style={S.req}>*</span></label>
                  <div style={{ position: "relative" }}>
                    <input
                      style={{ ...S.input, ...(fieldErrors.document ? S.inputError : {}), fontFamily: "'Courier New', monospace" }}
                      value={formatCnpj(cnpj)}
                      onChange={(e) => setCnpj(e.target.value)}
                      placeholder="XX.XXX.XXX/XXXX-XX"
                      data-testid="input-cnpj"
                    />
                    {lookupLoading && (
                      <span style={S.inputSpinner}>
                        <Spinner size={14} />
                      </span>
                    )}
                  </div>
                  {fieldErrors.document && <span style={S.fieldErr}>{fieldErrors.document}</span>}
                </div>
                <div style={S.field}>
                  <label style={S.label}>Nome fantasia<span style={S.req}>*</span></label>
                  <input style={{ ...S.input, ...(fieldErrors.name ? S.inputError : {}) }} value={tradeName} onChange={(e) => setTradeName(e.target.value)} data-testid="input-trade-name" />
                  {fieldErrors.name && <span style={S.fieldErr}>{fieldErrors.name}</span>}
                </div>
              </div>

              {lookupLoading && <div style={S.hint} data-testid="lookup-loading">Consultando Receita Federal…</div>}
              {!lookupLoading && lookupResult?.found && lookupResult.cadastral_status === "ATIVA" && (
                <div style={S.lookupOk} data-testid="lookup-ativa">
                  <strong style={{ fontFamily: "'Lexend', sans-serif", fontSize: 13, color: "#5DD490" }}>Situação cadastral: ATIVA</strong>
                  <span style={S.hint}>Dados preenchidos automaticamente — revise antes de prosseguir.</span>
                </div>
              )}
              {!lookupLoading && lookupResult?.found && lookupResult.cadastral_status !== "ATIVA" && (
                <div style={S.lookupBad} data-testid="lookup-inativa">
                  <span>CNPJ com situação <strong>{lookupResult.cadastral_status}</strong> na Receita Federal — não é possível prosseguir.</span>
                </div>
              )}
              {!lookupLoading && lookupResult && !lookupResult.found && lookupResult.reason === "lookup_unavailable" && lookupResult.cadastral_status === "ATIVA" && (
                <div style={S.lookupOk} data-testid="lookup-ativa-local">
                  <strong style={{ fontFamily: "'Lexend', sans-serif", fontSize: 13, color: "#5DD490" }}>
                    Dígito verificador válido — situação cadastral ainda não confirmável pela Receita
                  </strong>
                  <span style={S.hint}>
                    CNPJ alfanumérico recente: os provedores de consulta ainda não confirmam esse formato. Preencha os
                    dados manualmente e revise antes de prosseguir.
                  </span>
                </div>
              )}
              {!lookupLoading && lookupResult && !lookupResult.found && lookupResult.reason === "lookup_unavailable" && lookupResult.cadastral_status !== "ATIVA" && (
                <div style={S.lookupWarn} data-testid="lookup-indisponivel">
                  <span>Consulta automática indisponível para este CNPJ — preencha os dados manualmente.</span>
                </div>
              )}
              {!lookupLoading && lookupResult && !lookupResult.found && lookupResult.reason === "cnpj_not_found" && (
                <div style={S.lookupBad} data-testid="lookup-nao-encontrado">
                  <span>CNPJ não encontrado na Receita Federal.</span>
                </div>
              )}

              <div style={{ ...S.grid2, marginTop: 18 }}>
                <div style={S.field}>
                  <label style={S.label}>Razão social<span style={S.req}>*</span></label>
                  <input style={{ ...S.input, ...(fieldErrors.legal_name ? S.inputError : {}) }} value={legalName} onChange={(e) => setLegalName(e.target.value)} data-testid="input-legal-name" />
                  {fieldErrors.legal_name && <span style={S.fieldErr}>{fieldErrors.legal_name}</span>}
                </div>
                <div style={S.field}>
                  <label style={S.label}>Porte</label>
                  <select style={S.input} value={companySize} onChange={(e) => setCompanySize(e.target.value)}>
                    <option value="MEI">MEI</option>
                    <option value="ME">ME</option>
                    <option value="EPP">EPP</option>
                    <option value="DEMAIS">Demais</option>
                  </select>
                </div>
              </div>
              <div style={{ ...S.grid3, marginTop: 14 }}>
                <div style={S.field}>
                  <label style={S.label}>Inscrição estadual</label>
                  <input style={S.input} value={stateRegistration} onChange={(e) => setStateRegistration(e.target.value)} placeholder="ISENTO" />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Regime tributário</label>
                  <select style={S.input} value={taxRegime} onChange={(e) => setTaxRegime(e.target.value)}>
                    <option value="simples_nacional">Simples Nacional</option>
                    <option value="lucro_presumido">Lucro Presumido</option>
                    <option value="lucro_real">Lucro Real</option>
                  </select>
                </div>
                <div style={S.field}>
                  <label style={S.label}>CNAE principal</label>
                  <input style={{ ...S.input, fontFamily: "'Courier New', monospace" }} value={cnaeCode} onChange={(e) => setCnaeCode(e.target.value)} placeholder="0000-0/00" />
                </div>
              </div>
              <div style={S.actions}>
                <span />
                <button style={S.btnPrimary} onClick={advance}>Continuar</button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div style={S.panelHead}>
                <h2 style={S.h2}>Endereço</h2>
                <p style={S.hint}>Autopreenchido pela consulta de CNPJ — editável.</p>
              </div>
              <div style={S.grid3}>
                <div style={S.field}>
                  <label style={S.label}>CEP</label>
                  <div style={{ position: "relative" }}>
                    <input style={{ ...S.input, ...(fieldErrors.zip_code ? S.inputError : {}), fontFamily: "'Courier New', monospace" }} value={formatCep(zipCode)} onChange={(e) => setZipCode(e.target.value)} data-testid="input-zip-code" />
                    {cepLookupLoading && (
                      <span style={S.inputSpinner}>
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
                  <label style={S.label}>Logradouro<span style={S.req}>*</span></label>
                  <input style={{ ...S.input, ...(fieldErrors.street ? S.inputError : {}) }} value={street} onChange={(e) => setStreet(e.target.value)} data-testid="input-street" />
                  {fieldErrors.street && <span style={S.fieldErr}>{fieldErrors.street}</span>}
                </div>
              </div>
              <div style={{ ...S.grid3, marginTop: 14 }}>
                <div style={S.field}>
                  <label style={S.label}>Número<span style={S.req}>*</span></label>
                  <input style={{ ...S.input, ...(fieldErrors.address_number ? S.inputError : {}) }} value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)} data-testid="input-address-number" />
                  {fieldErrors.address_number && <span style={S.fieldErr}>{fieldErrors.address_number}</span>}
                </div>
                <div style={S.field}>
                  <label style={S.label}>Complemento</label>
                  <input style={S.input} value={complement} onChange={(e) => setComplement(e.target.value)} />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Bairro<span style={S.req}>*</span></label>
                  <input style={{ ...S.input, ...(fieldErrors.neighborhood ? S.inputError : {}) }} value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} data-testid="input-neighborhood" />
                  {fieldErrors.neighborhood && <span style={S.fieldErr}>{fieldErrors.neighborhood}</span>}
                </div>
              </div>
              <div style={{ ...S.grid2, marginTop: 14 }}>
                <div style={S.field}>
                  <label style={S.label}>Cidade<span style={S.req}>*</span></label>
                  <input style={{ ...S.input, ...(fieldErrors.city ? S.inputError : {}) }} value={city} onChange={(e) => setCity(e.target.value)} data-testid="input-city" />
                  {fieldErrors.city && <span style={S.fieldErr}>{fieldErrors.city}</span>}
                </div>
                <div style={S.field}>
                  <label style={S.label}>UF<span style={S.req}>*</span></label>
                  <select style={{ ...S.input, ...(fieldErrors.state ? S.inputError : {}) }} value={ufState} onChange={(e) => setUfState(e.target.value)} data-testid="input-state">
                    <option value="">Selecione</option>
                    {UF_VALUES.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                  {fieldErrors.state && <span style={S.fieldErr}>{fieldErrors.state}</span>}
                </div>
              </div>
              <div style={S.actions}>
                <button style={S.btnGhost} onClick={() => goToStep(0)}>Voltar</button>
                <button style={S.btnPrimary} onClick={advance}>Continuar</button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div style={S.panelHead}>
                <h2 style={S.h2}>Contatos</h2>
                <p style={S.hint}>Comercial é obrigatório — financeiro e técnico ficam a critério do cliente.</p>
              </div>
              <div style={S.contactCard}>
                <div style={S.contactHead}>
                  <span style={{ fontFamily: "'Lexend', sans-serif", fontSize: 13.5, fontWeight: 600 }}>Contato comercial</span>
                  <span style={S.badgeReq}>Obrigatório</span>
                </div>
                <div style={S.grid2}>
                  <div style={S.field}>
                    <label style={S.label}>Nome<span style={S.req}>*</span></label>
                    <input style={{ ...S.input, ...(fieldErrors.comercial_name ? S.inputError : {}) }} value={comercial.name} onChange={(e) => setComercial({ ...comercial, name: e.target.value })} data-testid="input-comercial-name" />
                    {fieldErrors.comercial_name && <span style={S.fieldErr}>{fieldErrors.comercial_name}</span>}
                  </div>
                  <div style={S.field}>
                    <label style={S.label}>Cargo</label>
                    <input style={S.input} value={comercial.roleTitle} onChange={(e) => setComercial({ ...comercial, roleTitle: e.target.value })} />
                  </div>
                  <div style={S.field}>
                    <label style={S.label}>E-mail<span style={S.req}>*</span></label>
                    <input style={{ ...S.input, ...(fieldErrors.comercial_email ? S.inputError : {}) }} value={comercial.email} onChange={(e) => setComercial({ ...comercial, email: e.target.value })} data-testid="input-comercial-email" />
                    {fieldErrors.comercial_email && <span style={S.fieldErr}>{fieldErrors.comercial_email}</span>}
                  </div>
                  <div style={S.field}>
                    <label style={S.label}>Telefone</label>
                    <input style={{ ...S.input, fontFamily: "'Courier New', monospace" }} value={comercial.phone} onChange={(e) => setComercial({ ...comercial, phone: e.target.value })} />
                  </div>
                </div>
              </div>

              {financeiro ? (
                <ContactCard title="Contato financeiro" badge="Opcional" value={financeiro} onChange={setFinanceiro} onRemove={() => setFinanceiro(null)} />
              ) : (
                <button style={S.ghostAdd} onClick={() => setFinanceiro(emptyContact)}>+ Adicionar contato financeiro (opcional)</button>
              )}
              {tecnico ? (
                <ContactCard title="Contato técnico" badge="Opcional" value={tecnico} onChange={setTecnico} onRemove={() => setTecnico(null)} />
              ) : (
                <button style={S.ghostAdd} onClick={() => setTecnico(emptyContact)}>+ Adicionar contato técnico (opcional)</button>
              )}

              <div style={S.actions}>
                <button style={S.btnGhost} onClick={() => goToStep(1)}>Voltar</button>
                <button style={S.btnPrimary} onClick={advance}>Continuar</button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div style={S.panelHead}>
                <h2 style={S.h2}>Responsável legal</h2>
                <p style={S.hint}>É quem assina o contrato de prestação de serviço pela empresa.</p>
              </div>
              <div style={S.grid2}>
                <div style={{ ...S.field, gridColumn: "span 2" }}>
                  <label style={S.label}>Nome completo<span style={S.req}>*</span></label>
                  <input style={{ ...S.input, ...(fieldErrors.rep_name ? S.inputError : {}) }} value={repName} onChange={(e) => setRepName(e.target.value)} data-testid="input-rep-name" />
                  {fieldErrors.rep_name && <span style={S.fieldErr}>{fieldErrors.rep_name}</span>}
                </div>
              </div>
              <div style={{ ...S.grid2, marginTop: 14 }}>
                <div style={S.field}>
                  <label style={S.label}>CPF<span style={S.req}>*</span></label>
                  <input style={{ ...S.input, ...(fieldErrors.rep_cpf ? S.inputError : {}), fontFamily: "'Courier New', monospace" }} value={formatCpf(repCpf)} onChange={(e) => setRepCpf(e.target.value)} data-testid="input-rep-cpf" />
                  {fieldErrors.rep_cpf && <span style={S.fieldErr}>{fieldErrors.rep_cpf}</span>}
                </div>
                <div style={S.field}>
                  <label style={S.label}>Cargo</label>
                  <input style={S.input} value={repRole} onChange={(e) => setRepRole(e.target.value)} placeholder="Sócio-administrador" />
                </div>
              </div>
              <div style={{ ...S.grid2, marginTop: 14 }}>
                <div style={S.field}>
                  <label style={S.label}>E-mail<span style={S.req}>*</span></label>
                  <input style={{ ...S.input, ...(fieldErrors.rep_email ? S.inputError : {}) }} value={repEmail} onChange={(e) => setRepEmail(e.target.value)} data-testid="input-rep-email" />
                  {fieldErrors.rep_email && <span style={S.fieldErr}>{fieldErrors.rep_email}</span>}
                </div>
                <div style={S.field}>
                  <label style={S.label}>Telefone</label>
                  <input style={{ ...S.input, fontFamily: "'Courier New', monospace" }} value={repPhone} onChange={(e) => setRepPhone(e.target.value)} />
                </div>
              </div>
              <div style={S.actions}>
                <button style={S.btnGhost} onClick={() => goToStep(2)}>Voltar</button>
                <button style={S.btnPrimary} onClick={advance}>Continuar</button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div style={S.panelHead}>
                <h2 style={S.h2}>Revisão</h2>
                <p style={S.hint}>Confira os dados antes de criar o cadastro.</p>
              </div>

              <div style={S.reviewGroup}>
                <div style={S.reviewHead}>
                  <span style={S.reviewTitle}>Dados cadastrais</span>
                  <button style={S.reviewEdit} onClick={() => goToStep(0)}>Editar</button>
                </div>
                <div style={S.grid3}>
                  <div style={S.kv}><div style={S.kvLabel}>CNPJ</div><div style={{ fontFamily: "'Courier New', monospace" }}>{formatCnpj(cnpj)}</div></div>
                  <div style={S.kv}><div style={S.kvLabel}>Razão social</div><div>{legalName}</div></div>
                  <div style={S.kv}><div style={S.kvLabel}>Situação</div><div style={{ color: "#5DD490" }}>{lookupResult?.cadastral_status ?? "NAO_VERIFICADA"}</div></div>
                </div>
              </div>

              <div style={S.reviewGroup}>
                <div style={S.reviewHead}>
                  <span style={S.reviewTitle}>Endereço</span>
                  <button style={S.reviewEdit} onClick={() => goToStep(1)}>Editar</button>
                </div>
                <div style={S.grid3}>
                  <div style={S.kv}><div style={S.kvLabel}>Logradouro</div><div>{street}, {addressNumber}</div></div>
                  <div style={S.kv}><div style={S.kvLabel}>Cidade/UF</div><div>{city}/{ufState}</div></div>
                  <div style={S.kv}><div style={S.kvLabel}>CEP</div><div style={{ fontFamily: "'Courier New', monospace" }}>{formatCep(zipCode)}</div></div>
                </div>
              </div>

              <div style={S.reviewGroup}>
                <div style={S.reviewHead}>
                  <span style={S.reviewTitle}>Contatos</span>
                  <button style={S.reviewEdit} onClick={() => goToStep(2)}>Editar</button>
                </div>
                <div style={S.grid3}>
                  <div style={S.kv}><div style={S.kvLabel}>Comercial</div><div>{comercial.name}</div></div>
                  <div style={S.kv}><div style={S.kvLabel}>Financeiro</div><div>{financeiro?.name || "Não informado"}</div></div>
                  <div style={S.kv}><div style={S.kvLabel}>Técnico</div><div>{tecnico?.name || "Não informado"}</div></div>
                </div>
              </div>

              <div style={S.reviewGroup}>
                <div style={S.reviewHead}>
                  <span style={S.reviewTitle}>Responsável legal</span>
                  <button style={S.reviewEdit} onClick={() => goToStep(3)}>Editar</button>
                </div>
                <div style={S.grid3}>
                  <div style={S.kv}><div style={S.kvLabel}>Nome</div><div>{repName}</div></div>
                  <div style={S.kv}><div style={S.kvLabel}>CPF</div><div style={{ fontFamily: "'Courier New', monospace" }}>{formatCpf(repCpf)}</div></div>
                  <div style={S.kv}><div style={S.kvLabel}>Cargo</div><div>{repRole || "—"}</div></div>
                </div>
              </div>

              {submitError && <div style={{ ...S.lookupBad, marginTop: 16 }}>{submitError}</div>}

              <div style={S.actions}>
                <button style={S.btnGhost} onClick={() => goToStep(3)} disabled={submitting}>Voltar</button>
                <button style={S.btnPrimary} onClick={submit} disabled={submitting} data-testid="btn-criar-cadastro">
                  {submitting ? "Criando…" : "Criar cadastro"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ContactCard({
  title, badge, value, onChange, onRemove,
}: { title: string; badge: string; value: ContactForm; onChange: (v: ContactForm) => void; onRemove: () => void }) {
  return (
    <div style={S.contactCard}>
      <div style={S.contactHead}>
        <span style={{ fontFamily: "'Lexend', sans-serif", fontSize: 13.5, fontWeight: 600 }}>{title}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ ...S.badgeReq, color: "rgba(var(--a-text-rgb),0.5)", background: "rgba(var(--a-neutral-rgb),0.07)" }}>{badge}</span>
          <button style={{ ...S.reviewEdit, color: "#ff4d6d" }} onClick={onRemove}>Remover</button>
        </div>
      </div>
      <div style={S.grid2}>
        <div style={S.field}>
          <label style={S.label}>Nome</label>
          <input style={S.input} value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
        </div>
        <div style={S.field}>
          <label style={S.label}>Cargo</label>
          <input style={S.input} value={value.roleTitle} onChange={(e) => onChange({ ...value, roleTitle: e.target.value })} />
        </div>
        <div style={S.field}>
          <label style={S.label}>E-mail</label>
          <input style={S.input} value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} />
        </div>
        <div style={S.field}>
          <label style={S.label}>Telefone</label>
          <input style={{ ...S.input, fontFamily: "'Courier New', monospace" }} value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
