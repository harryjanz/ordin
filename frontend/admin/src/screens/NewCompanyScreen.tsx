import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Dropdown, InputBase, Tag, type DropdownOptions } from "design-system";
import WizardSteps, { type StepDef } from "../components/WizardSteps";
import { createCompany, createContact, lookupCep, lookupCnpj, upsertLegalRepresentative } from "../api/companies";
import { parseApiError } from "../lib/apiErrors";
import { formatCep, formatCnpj, formatCpf } from "../lib/masks";
import { isValidCep, isValidCnpj, isValidCpf, normalizeCep, normalizeCnpj, UF_VALUES } from "../lib/validators";
import type { CepLookupResult, CnpjLookupResult } from "../types";
import styles from "./NewCompanyScreen.module.scss";

const STEPS: StepDef[] = [
  { label: "Dados cadastrais", sub: "CNPJ e Receita Federal" },
  { label: "Endereço", sub: "Preenchido pela Receita" },
  { label: "Contatos", sub: "Comercial, financeiro, técnico" },
  { label: "Responsável legal", sub: "Quem assina o contrato" },
  { label: "Revisão", sub: "Confirmar e criar" },
];

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
      <div className={styles.page}>
        <div className={styles.panel}>
          <div className={styles.successBox}>
            <div className={styles.successIcon}>✅</div>
            <h2 className={styles.h2}>Cliente cadastrado com sucesso</h2>
            <p className={styles.hint}>PIN de acesso do totem: <strong className={styles.mono}>{created.pin}</strong></p>
            <div className={styles.successActions}>
              <Button onClick={() => navigate(`/companies/${created.id}/contract`)}>
                Ver detalhe e status do contrato
              </Button>
              <Button variant="secondary" onClick={() => window.location.reload()}>Cadastrar outro cliente</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.eyebrow}>Empresas / Novo cliente</div>
      <h1 className={styles.title}>Cadastro de cliente</h1>

      <div className={styles.wizard}>
        <WizardSteps steps={STEPS} current={step} maxReached={maxReached} onSelect={goToStep} />

        <div className={styles.panel}>
          {step === 0 && (
            <>
              <div className={styles.panelHead}>
                <h2 className={styles.h2}>Dados cadastrais</h2>
                <p className={styles.hint}>Informe o CNPJ — a situação cadastral é verificada na Receita Federal.</p>
              </div>
              <div className={styles.grid2}>
                <div className={styles.field}>
                  <InputBase
                    label="CNPJ*"
                    value={formatCnpj(cnpj)}
                    onChange={(e) => setCnpj(e.target.value)}
                    placeholder="XX.XXX.XXX/XXXX-XX"
                    errorMessage={fieldErrors.document}
                    loading={lookupLoading}
                    data-testid="input-cnpj"
                  />
                </div>
                <div className={styles.field}>
                  <InputBase
                    label="Nome fantasia*"
                    value={tradeName}
                    onChange={(e) => setTradeName(e.target.value)}
                    errorMessage={fieldErrors.name}
                    data-testid="input-trade-name"
                  />
                </div>
              </div>

              {lookupLoading && <div className={styles.hint} data-testid="lookup-loading">Consultando Receita Federal…</div>}
              {!lookupLoading && lookupResult?.found && lookupResult.cadastral_status === "ATIVA" && (
                <div className={styles.alertBox} data-testid="lookup-ativa">
                  <Alert variant="success" icon="check-circle" fullWidth
                    text="Situação cadastral: ATIVA. Dados preenchidos automaticamente — revise antes de prosseguir." />
                </div>
              )}
              {!lookupLoading && lookupResult?.found && lookupResult.cadastral_status !== "ATIVA" && (
                <div className={styles.alertBox} data-testid="lookup-inativa">
                  <Alert variant="error" icon="alert-circle" fullWidth
                    text={`CNPJ com situação ${lookupResult.cadastral_status} na Receita Federal — não é possível prosseguir.`} />
                </div>
              )}
              {!lookupLoading && lookupResult && !lookupResult.found && lookupResult.reason === "lookup_unavailable" && lookupResult.cadastral_status === "ATIVA" && (
                <div className={styles.alertBox} data-testid="lookup-ativa-local">
                  <Alert variant="success" icon="check-circle" fullWidth
                    text="Dígito verificador válido — situação cadastral ainda não confirmável pela Receita. CNPJ alfanumérico recente: os provedores de consulta ainda não confirmam esse formato. Preencha os dados manualmente e revise antes de prosseguir." />
                </div>
              )}
              {!lookupLoading && lookupResult && !lookupResult.found && lookupResult.reason === "lookup_unavailable" && lookupResult.cadastral_status !== "ATIVA" && (
                <div className={styles.alertBox} data-testid="lookup-indisponivel">
                  <Alert variant="warning" icon="alert-triangle" fullWidth
                    text="Consulta automática indisponível para este CNPJ — preencha os dados manualmente." />
                </div>
              )}
              {!lookupLoading && lookupResult && !lookupResult.found && lookupResult.reason === "cnpj_not_found" && (
                <div className={styles.alertBox} data-testid="lookup-nao-encontrado">
                  <Alert variant="error" icon="alert-circle" fullWidth text="CNPJ não encontrado na Receita Federal." />
                </div>
              )}

              <div className={`${styles.grid2} ${styles.mt18}`}>
                <div className={styles.field}>
                  <InputBase
                    label="Razão social*"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    errorMessage={fieldErrors.legal_name}
                    data-testid="input-legal-name"
                  />
                </div>
                <div className={styles.field}>
                  <Dropdown
                    label="Porte"
                    value={COMPANY_SIZE_OPTIONS.find((o) => o.value === companySize) ?? null}
                    onValueSelected={(opt) => setCompanySize(opt.value)}
                    options={COMPANY_SIZE_OPTIONS}
                  />
                </div>
              </div>
              <div className={`${styles.grid3} ${styles.mt14}`}>
                <div className={styles.field}>
                  <InputBase label="Inscrição estadual" value={stateRegistration} onChange={(e) => setStateRegistration(e.target.value)} placeholder="ISENTO" />
                </div>
                <div className={styles.field}>
                  <Dropdown
                    label="Regime tributário"
                    value={TAX_REGIME_OPTIONS.find((o) => o.value === taxRegime) ?? null}
                    onValueSelected={(opt) => setTaxRegime(opt.value)}
                    options={TAX_REGIME_OPTIONS}
                  />
                </div>
                <div className={styles.field}>
                  <InputBase label="CNAE principal" value={cnaeCode} onChange={(e) => setCnaeCode(e.target.value)} placeholder="0000-0/00" />
                </div>
              </div>
              <div className={styles.actions}>
                <span />
                <Button onClick={advance}>Continuar</Button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className={styles.panelHead}>
                <h2 className={styles.h2}>Endereço</h2>
                <p className={styles.hint}>Autopreenchido pela consulta de CNPJ — editável.</p>
              </div>
              <div className={styles.grid3}>
                <div className={styles.field}>
                  <InputBase
                    label="CEP"
                    value={formatCep(zipCode)}
                    onChange={(e) => setZipCode(e.target.value)}
                    errorMessage={fieldErrors.zip_code}
                    helperMessage={!fieldErrors.zip_code && !cepLookupLoading && cepLookupResult && !cepLookupResult.found ? "CEP não encontrado — preencha o endereço manualmente" : undefined}
                    loading={cepLookupLoading}
                    data-testid="input-zip-code"
                  />
                </div>
                <div className={`${styles.field} ${styles.spanFull}`}>
                  <InputBase
                    label="Logradouro*"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    errorMessage={fieldErrors.street}
                    data-testid="input-street"
                  />
                </div>
              </div>
              <div className={`${styles.grid3} ${styles.mt14}`}>
                <div className={styles.field}>
                  <InputBase
                    label="Número*"
                    value={addressNumber}
                    onChange={(e) => setAddressNumber(e.target.value)}
                    errorMessage={fieldErrors.address_number}
                    data-testid="input-address-number"
                  />
                </div>
                <div className={styles.field}>
                  <InputBase label="Complemento" value={complement} onChange={(e) => setComplement(e.target.value)} />
                </div>
                <div className={styles.field}>
                  <InputBase
                    label="Bairro*"
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    errorMessage={fieldErrors.neighborhood}
                    data-testid="input-neighborhood"
                  />
                </div>
              </div>
              <div className={`${styles.grid2} ${styles.mt14}`}>
                <div className={styles.field}>
                  <InputBase
                    label="Cidade*"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    errorMessage={fieldErrors.city}
                    data-testid="input-city"
                  />
                </div>
                <div className={styles.field}>
                  <Dropdown
                    label="UF*"
                    placeholder="Selecione"
                    value={UF_OPTIONS.find((o) => o.value === ufState) ?? null}
                    onValueSelected={(opt) => setUfState(opt.value)}
                    options={UF_OPTIONS}
                    errorMessage={fieldErrors.state}
                    data-testid="input-state"
                  />
                </div>
              </div>
              <div className={styles.actions}>
                <Button variant="secondary" onClick={() => goToStep(0)}>Voltar</Button>
                <Button onClick={advance}>Continuar</Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className={styles.panelHead}>
                <h2 className={styles.h2}>Contatos</h2>
                <p className={styles.hint}>Comercial é obrigatório — financeiro e técnico ficam a critério do cliente.</p>
              </div>
              <div className={styles.contactCard}>
                <div className={styles.contactHead}>
                  <span className={styles.contactTitle}>Contato comercial</span>
                  <span className={styles.badgeReq}>Obrigatório</span>
                </div>
                <div className={styles.grid2}>
                  <div className={styles.field}>
                    <InputBase
                      label="Nome*"
                      value={comercial.name}
                      onChange={(e) => setComercial({ ...comercial, name: e.target.value })}
                      errorMessage={fieldErrors.comercial_name}
                      data-testid="input-comercial-name"
                    />
                  </div>
                  <div className={styles.field}>
                    <InputBase label="Cargo" value={comercial.roleTitle} onChange={(e) => setComercial({ ...comercial, roleTitle: e.target.value })} />
                  </div>
                  <div className={styles.field}>
                    <InputBase
                      label="E-mail*"
                      value={comercial.email}
                      onChange={(e) => setComercial({ ...comercial, email: e.target.value })}
                      errorMessage={fieldErrors.comercial_email}
                      data-testid="input-comercial-email"
                    />
                  </div>
                  <div className={styles.field}>
                    <InputBase label="Telefone" value={comercial.phone} onChange={(e) => setComercial({ ...comercial, phone: e.target.value })} />
                  </div>
                </div>
              </div>

              {financeiro ? (
                <ContactCard title="Contato financeiro" value={financeiro} onChange={setFinanceiro} onRemove={() => setFinanceiro(null)} />
              ) : (
                <button className={styles.ghostAdd} onClick={() => setFinanceiro(emptyContact)}>+ Adicionar contato financeiro (opcional)</button>
              )}
              {tecnico ? (
                <ContactCard title="Contato técnico" value={tecnico} onChange={setTecnico} onRemove={() => setTecnico(null)} />
              ) : (
                <button className={styles.ghostAdd} onClick={() => setTecnico(emptyContact)}>+ Adicionar contato técnico (opcional)</button>
              )}

              <div className={styles.actions}>
                <Button variant="secondary" onClick={() => goToStep(1)}>Voltar</Button>
                <Button onClick={advance}>Continuar</Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className={styles.panelHead}>
                <h2 className={styles.h2}>Responsável legal</h2>
                <p className={styles.hint}>É quem assina o contrato de prestação de serviço pela empresa.</p>
              </div>
              <div className={styles.grid2}>
                <div className={`${styles.field} ${styles.spanFull}`}>
                  <InputBase
                    label="Nome completo*"
                    value={repName}
                    onChange={(e) => setRepName(e.target.value)}
                    errorMessage={fieldErrors.rep_name}
                    data-testid="input-rep-name"
                  />
                </div>
              </div>
              <div className={`${styles.grid2} ${styles.mt14}`}>
                <div className={styles.field}>
                  <InputBase
                    label="CPF*"
                    value={formatCpf(repCpf)}
                    onChange={(e) => setRepCpf(e.target.value)}
                    errorMessage={fieldErrors.rep_cpf}
                    data-testid="input-rep-cpf"
                  />
                </div>
                <div className={styles.field}>
                  <InputBase label="Cargo" value={repRole} onChange={(e) => setRepRole(e.target.value)} placeholder="Sócio-administrador" />
                </div>
              </div>
              <div className={`${styles.grid2} ${styles.mt14}`}>
                <div className={styles.field}>
                  <InputBase
                    label="E-mail*"
                    value={repEmail}
                    onChange={(e) => setRepEmail(e.target.value)}
                    errorMessage={fieldErrors.rep_email}
                    data-testid="input-rep-email"
                  />
                </div>
                <div className={styles.field}>
                  <InputBase label="Telefone" value={repPhone} onChange={(e) => setRepPhone(e.target.value)} />
                </div>
              </div>
              <div className={styles.actions}>
                <Button variant="secondary" onClick={() => goToStep(2)}>Voltar</Button>
                <Button onClick={advance}>Continuar</Button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className={styles.panelHead}>
                <h2 className={styles.h2}>Revisão</h2>
                <p className={styles.hint}>Confira os dados antes de criar o cadastro.</p>
              </div>

              <div className={styles.reviewGroup}>
                <div className={styles.reviewHead}>
                  <span className={styles.reviewTitle}>Dados cadastrais</span>
                  <Button variant="secondary" size="small" onClick={() => goToStep(0)}>Editar</Button>
                </div>
                <div className={styles.grid3}>
                  <div className={styles.kv}><div className={styles.kvLabel}>CNPJ</div><div className={styles.mono}>{formatCnpj(cnpj)}</div></div>
                  <div className={styles.kv}><div className={styles.kvLabel}>Razão social</div><div>{legalName}</div></div>
                  <div className={styles.kv}><div className={styles.kvLabel}>Situação</div><Tag variant="success">{lookupResult?.cadastral_status ?? "NAO_VERIFICADA"}</Tag></div>
                </div>
              </div>

              <div className={styles.reviewGroup}>
                <div className={styles.reviewHead}>
                  <span className={styles.reviewTitle}>Endereço</span>
                  <Button variant="secondary" size="small" onClick={() => goToStep(1)}>Editar</Button>
                </div>
                <div className={styles.grid3}>
                  <div className={styles.kv}><div className={styles.kvLabel}>Logradouro</div><div>{street}, {addressNumber}</div></div>
                  <div className={styles.kv}><div className={styles.kvLabel}>Cidade/UF</div><div>{city}/{ufState}</div></div>
                  <div className={styles.kv}><div className={styles.kvLabel}>CEP</div><div className={styles.mono}>{formatCep(zipCode)}</div></div>
                </div>
              </div>

              <div className={styles.reviewGroup}>
                <div className={styles.reviewHead}>
                  <span className={styles.reviewTitle}>Contatos</span>
                  <Button variant="secondary" size="small" onClick={() => goToStep(2)}>Editar</Button>
                </div>
                <div className={styles.grid3}>
                  <div className={styles.kv}><div className={styles.kvLabel}>Comercial</div><div>{comercial.name}</div></div>
                  <div className={styles.kv}><div className={styles.kvLabel}>Financeiro</div><div>{financeiro?.name || "Não informado"}</div></div>
                  <div className={styles.kv}><div className={styles.kvLabel}>Técnico</div><div>{tecnico?.name || "Não informado"}</div></div>
                </div>
              </div>

              <div className={styles.reviewGroup}>
                <div className={styles.reviewHead}>
                  <span className={styles.reviewTitle}>Responsável legal</span>
                  <Button variant="secondary" size="small" onClick={() => goToStep(3)}>Editar</Button>
                </div>
                <div className={styles.grid3}>
                  <div className={styles.kv}><div className={styles.kvLabel}>Nome</div><div>{repName}</div></div>
                  <div className={styles.kv}><div className={styles.kvLabel}>CPF</div><div className={styles.mono}>{formatCpf(repCpf)}</div></div>
                  <div className={styles.kv}><div className={styles.kvLabel}>Cargo</div><div>{repRole || "—"}</div></div>
                </div>
              </div>

              {submitError && <div className={styles.alertBox}><Alert variant="error" text={submitError} fullWidth /></div>}

              <div className={styles.actions}>
                <Button variant="secondary" onClick={() => goToStep(3)} disabled={submitting}>Voltar</Button>
                <Button onClick={submit} loading={submitting} data-testid="btn-criar-cadastro">Criar cadastro</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ContactCard({
  title, value, onChange, onRemove,
}: { title: string; value: ContactForm; onChange: (v: ContactForm) => void; onRemove: () => void }) {
  return (
    <div className={styles.contactCard}>
      <div className={styles.contactHead}>
        <span className={styles.contactTitle}>{title}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className={styles.badgeOptional}>Opcional</span>
          <Button variant="secondary" size="small" onClick={onRemove}>Remover</Button>
        </div>
      </div>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <InputBase label="Nome" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
        </div>
        <div className={styles.field}>
          <InputBase label="Cargo" value={value.roleTitle} onChange={(e) => onChange({ ...value, roleTitle: e.target.value })} />
        </div>
        <div className={styles.field}>
          <InputBase label="E-mail" value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} />
        </div>
        <div className={styles.field}>
          <InputBase label="Telefone" value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
