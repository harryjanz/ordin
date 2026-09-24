import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Dropdown, InputBase, type DropdownOptions } from "design-system";
import api from "../api";
import Breadcrumb from "../components/Breadcrumb";
import { formatCep, formatCnpj, formatCpf, formatPhone } from "../lib/masks";
import { isValidCep, isValidCnpj, normalizeCep, normalizeCnpj, UF_VALUES } from "../lib/validators";
import { parseApiError } from "../lib/apiErrors";
import { useCatalogParams } from "../lib/catalogParams";
import type { CnpjLookupResult, Supplier } from "../types";
// ORD-182 (A6) — mesmo racional já registrado na FiscalAddonPlanFormScreen/
// PriceTableFormScreen: sem componente genérico de formulário compartilhado
// pra este tipo de tela, reaproveita o mesmo stylesheet (.page, .header,
// .h1, .panel, .formRowField). ORD-202: 4 seções em painéis empilhados
// (não wizard — decisão de UX, ver docs/stories/ORD-202) reaproveitando o
// mesmo .h2 de seção já usado em ComboFormScreen (imagem do combo).
import styles from "./ComboFormScreen.module.scss";

const UF_OPTIONS: DropdownOptions[] = UF_VALUES.map((uf) => ({ value: uf, label: uf }));

export default function SupplierFormScreen() {
  const { id } = useParams<{ id: string }>();
  const editingId = id ? Number(id) : null;
  const navigate = useNavigate();
  // Achado ao vivo (revisão de urgência, 2026-09-24): nenhuma chamada desta
  // tela mandava company_id — pra superadmin/admin, GET/POST/PUT e o
  // cnpj-lookup todos davam 400 ("Parâmetro company_id é obrigatório").
  // Mesmo padrão de catalogParams() já usado no resto do admin.
  const catalogParams = useCatalogParams();

  const [loading, setLoading] = useState(editingId !== null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Dados cadastrais
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [inscricaoEstadual, setInscricaoEstadual] = useState("");
  const [inscricaoMunicipal, setInscricaoMunicipal] = useState("");
  const [cadastralStatus, setCadastralStatus] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<CnpjLookupResult | null>(null);
  const lookupTimer = useRef<ReturnType<typeof setTimeout>>();

  // Endereço
  const [zipCode, setZipCode] = useState("");
  const [street, setStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [ufState, setUfState] = useState("");

  // Contato comercial (obrigatório)
  const [contatoNome, setContatoNome] = useState("");
  const [contatoTelefone, setContatoTelefone] = useState("");
  const [contatoEmail, setContatoEmail] = useState("");

  // Responsável legal (opcional — se qualquer campo preenchido, nome+telefone+email viram obrigatórios)
  const [repNome, setRepNome] = useState("");
  const [repCpf, setRepCpf] = useState("");
  const [repTelefone, setRepTelefone] = useState("");
  const [repEmail, setRepEmail] = useState("");

  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingId === null) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const r = await api.get<Supplier>(`/catalog/suppliers/${editingId}`, catalogParams());
        if (cancelled) return;
        const s = r.data;
        setNome(s.nome);
        setCnpj(s.cnpj);
        setRazaoSocial(s.razao_social ?? "");
        setNomeFantasia(s.nome_fantasia ?? "");
        setInscricaoEstadual(s.inscricao_estadual ?? "");
        setInscricaoMunicipal(s.inscricao_municipal ?? "");
        setCadastralStatus(s.cadastral_status);
        setZipCode(s.zip_code ?? "");
        setStreet(s.street ?? "");
        setAddressNumber(s.address_number ?? "");
        setComplement(s.complement ?? "");
        setNeighborhood(s.neighborhood ?? "");
        setCity(s.city ?? "");
        setUfState(s.state ?? "");
        if (s.contato) {
          setContatoNome(s.contato.nome);
          setContatoTelefone(s.contato.telefone);
          setContatoEmail(s.contato.email);
        } else {
          // fornecedor cadastrado antes desta história — contato ainda não existe
          setContatoTelefone(s.telefone ?? "");
          setContatoEmail(s.email ?? "");
        }
        if (s.responsavel_legal) {
          setRepNome(s.responsavel_legal.nome);
          setRepCpf(s.responsavel_legal.cpf ?? "");
          setRepTelefone(s.responsavel_legal.telefone);
          setRepEmail(s.responsavel_legal.email);
        }
      } catch {
        if (!cancelled) setLoadError("Erro ao carregar fornecedor.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  // CNPJ lookup — mesmo padrão de NewCompanyScreen.tsx (debounce 500ms),
  // exceto que aqui NUNCA bloqueia o cadastro por situação cadastral
  // diferente de ATIVA — só Alert de aviso (ver Tech Explorer, ORD-202).
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
        const r = await api.get<CnpjLookupResult>(`/catalog/suppliers/cnpj-lookup/${encodeURIComponent(normalized)}`, catalogParams());
        const result = r.data;
        setLookupResult(result);
        if (result.found) {
          if (result.legal_name) setRazaoSocial(result.legal_name);
          if (result.trade_name) setNomeFantasia(result.trade_name);
          if (result.zip_code) setZipCode(result.zip_code);
          if (result.street) setStreet(result.street);
          if (result.address_number) setAddressNumber(result.address_number);
          if (result.complement) setComplement(result.complement);
          if (result.neighborhood) setNeighborhood(result.neighborhood);
          if (result.city) setCity(result.city);
          if (result.state) setUfState(result.state);
        }
        setCadastralStatus(result.cadastral_status);
      } catch {
        setLookupResult({ found: false, reason: "lookup_unavailable", cadastral_status: "NAO_VERIFICADA" });
      } finally {
        setLookupLoading(false);
      }
    }, 500);
    return () => clearTimeout(lookupTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnpj]);

  // Responsável legal — espelha o model_validator do backend
  // (SupplierLegalRepresentativeIn): se qualquer campo foi tocado,
  // nome+telefone+email viram obrigatórios juntos. CPF sempre opcional.
  const repTocado = !!(repNome || repCpf || repTelefone || repEmail);
  const repIncompleto = repTocado && !(repNome.trim() && repTelefone.trim() && repEmail.trim());

  const canSave = !saving
    && nome.trim().length > 0
    && isValidCnpj(cnpj)
    && contatoNome.trim().length > 0 && contatoTelefone.trim().length > 0 && contatoEmail.trim().length > 0
    && !repIncompleto;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setFormError("");
    try {
      const body = {
        nome: nome.trim(),
        cnpj: normalizeCnpj(cnpj),
        razao_social: razaoSocial.trim() || null,
        nome_fantasia: nomeFantasia.trim() || null,
        inscricao_estadual: inscricaoEstadual.trim() || null,
        inscricao_municipal: inscricaoMunicipal.trim() || null,
        cadastral_status: cadastralStatus,
        zip_code: normalizeCep(zipCode) || null,
        street: street.trim() || null,
        address_number: addressNumber.trim() || null,
        complement: complement.trim() || null,
        neighborhood: neighborhood.trim() || null,
        city: city.trim() || null,
        state: ufState || null,
        contato: { nome: contatoNome.trim(), telefone: formatPhone(contatoTelefone), email: contatoEmail.trim() },
        responsavel_legal: repTocado
          ? { nome: repNome.trim(), cpf: repCpf.trim() || null, telefone: formatPhone(repTelefone), email: repEmail.trim() }
          : null,
      };
      if (editingId === null) {
        await api.post("/catalog/suppliers", body, catalogParams());
      } else {
        await api.put(`/catalog/suppliers/${editingId}`, body, catalogParams());
      }
      navigate("/stock/suppliers");
    } catch (err) {
      setFormError(parseApiError(err).message || "Erro ao salvar fornecedor.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className={styles.page}>Carregando…</div>;
  if (loadError) {
    return (
      <div className={styles.page}>
        <Alert variant="error" text={loadError} fullWidth />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Breadcrumb
        items={[
          { label: "Fornecedores", href: "/stock/suppliers" },
          { label: editingId === null ? "Novo fornecedor" : "Editar fornecedor" },
        ]}
      />
      <div className={styles.header}>
        <h1 className={styles.h1}>{editingId === null ? "Novo fornecedor" : "Editar fornecedor"}</h1>
        <div className={styles.headerActions}>
          <Button variant="secondary" onClick={() => navigate("/stock/suppliers")}>Voltar</Button>
          <Button onClick={save} disabled={!canSave} loading={saving}>Salvar fornecedor</Button>
        </div>
      </div>

      {formError && <div className={styles.alertBox}><Alert variant="error" text={formError} fullWidth /></div>}

      {/* ── Dados cadastrais ────────────────────────────────────────────── */}
      <div className={styles.panel}>
        <h2 className={styles.h2}>Dados cadastrais</h2>
        <InputBase
          label="Nome*"
          placeholder="ex: Distribuidora ABC Ltda"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoFocus
        />
        <div className={styles.formRow}>
          <div className={styles.formRowField}>
            <InputBase
              label="CNPJ*"
              placeholder="XX.XXX.XXX/XXXX-XX"
              value={formatCnpj(cnpj)}
              onChange={(e) => setCnpj(e.target.value)}
              errorMessage={cnpj.length > 0 && !isValidCnpj(cnpj) ? "CNPJ inválido" : undefined}
              loading={lookupLoading}
            />
          </div>
          <div className={styles.formRowField}>
            <InputBase label="Inscrição estadual" value={inscricaoEstadual} onChange={(e) => setInscricaoEstadual(e.target.value)} />
          </div>
          <div className={styles.formRowField}>
            <InputBase label="Inscrição municipal" value={inscricaoMunicipal} onChange={(e) => setInscricaoMunicipal(e.target.value)} />
          </div>
        </div>

        {!lookupLoading && lookupResult?.found && lookupResult.cadastral_status === "ATIVA" && (
          <Alert variant="success" icon="check-circle" fullWidth
            text="Situação cadastral: ATIVA. Dados preenchidos automaticamente — revise antes de salvar." />
        )}
        {!lookupLoading && lookupResult?.found && lookupResult.cadastral_status !== "ATIVA" && (
          <Alert variant="warning" icon="alert-triangle" fullWidth
            text={`CNPJ com situação "${lookupResult.cadastral_status}" na Receita Federal — você pode continuar o cadastro, mas confirme com o fornecedor antes.`} />
        )}
        {!lookupLoading && lookupResult && !lookupResult.found && lookupResult.reason === "lookup_unavailable" && (
          <Alert variant="warning" icon="alert-triangle" fullWidth
            text="Não foi possível consultar a Receita Federal agora — preencha os dados manualmente." />
        )}
        {!lookupLoading && lookupResult && !lookupResult.found && lookupResult.reason === "cnpj_not_found" && (
          <Alert variant="warning" icon="alert-triangle" fullWidth
            text="CNPJ não encontrado na Receita Federal — preencha os dados manualmente." />
        )}

        <div className={styles.formRow}>
          <div className={styles.formRowField}>
            <InputBase label="Razão social" value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} />
          </div>
          <div className={styles.formRowField}>
            <InputBase label="Nome fantasia" value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── Endereço ────────────────────────────────────────────────────── */}
      <div className={styles.panel}>
        <h2 className={styles.h2}>Endereço</h2>
        <div className={styles.formRow}>
          <div className={styles.formRowField}>
            <InputBase label="CEP" value={formatCep(zipCode)} onChange={(e) => setZipCode(e.target.value)}
              errorMessage={zipCode.length > 0 && !isValidCep(zipCode) ? "CEP inválido" : undefined} />
          </div>
          <div className={styles.formRowField}>
            <InputBase label="Rua" value={street} onChange={(e) => setStreet(e.target.value)} />
          </div>
          <div className={styles.formRowField}>
            <InputBase label="Número" value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)} />
          </div>
        </div>
        <div className={styles.formRow}>
          <div className={styles.formRowField}>
            <InputBase label="Complemento" value={complement} onChange={(e) => setComplement(e.target.value)} />
          </div>
          <div className={styles.formRowField}>
            <InputBase label="Bairro" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
          </div>
          <div className={styles.formRowField}>
            <InputBase label="Cidade" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className={styles.formRowField}>
            <Dropdown
              label="UF"
              value={UF_OPTIONS.find((o) => o.value === ufState) ?? null}
              onValueSelected={(opt) => setUfState(opt.value)}
              options={UF_OPTIONS}
            />
          </div>
        </div>
      </div>

      {/* ── Contato comercial (obrigatório) ────────────────────────────── */}
      <div className={styles.panel}>
        <h2 className={styles.h2}>Contato comercial</h2>
        <div className={styles.formRow}>
          <div className={styles.formRowField}>
            <InputBase label="Nome*" value={contatoNome} onChange={(e) => setContatoNome(e.target.value)} />
          </div>
          <div className={styles.formRowField}>
            <InputBase label="Telefone*" value={formatPhone(contatoTelefone)} onChange={(e) => setContatoTelefone(e.target.value)} />
          </div>
          <div className={styles.formRowField}>
            <InputBase label="E-mail*" value={contatoEmail} onChange={(e) => setContatoEmail(e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── Responsável legal (opcional) ───────────────────────────────── */}
      <div className={styles.panel}>
        <h2 className={styles.h2}>Responsável legal (opcional)</h2>
        <div className={styles.formRow}>
          <div className={styles.formRowField}>
            <InputBase label={repTocado ? "Nome*" : "Nome"} value={repNome} onChange={(e) => setRepNome(e.target.value)} />
          </div>
          <div className={styles.formRowField}>
            <InputBase label="CPF" value={formatCpf(repCpf)} onChange={(e) => setRepCpf(e.target.value)} />
          </div>
        </div>
        <div className={styles.formRow}>
          <div className={styles.formRowField}>
            <InputBase label={repTocado ? "Telefone*" : "Telefone"} value={formatPhone(repTelefone)} onChange={(e) => setRepTelefone(e.target.value)} />
          </div>
          <div className={styles.formRowField}>
            <InputBase label={repTocado ? "E-mail*" : "E-mail"} value={repEmail} onChange={(e) => setRepEmail(e.target.value)} />
          </div>
        </div>
        {repIncompleto && (
          <Alert variant="warning" text="Preenchendo o responsável legal, nome, telefone e e-mail são obrigatórios juntos (CPF continua opcional)." fullWidth />
        )}
      </div>
    </div>
  );
}
