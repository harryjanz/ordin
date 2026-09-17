import { useState, useEffect, useRef, FormEvent } from "react";
import { Alert, Button, Dropdown, InputBase, Modal, Tab, Tabs, Tag, Toggle, Upload, UploadListFiles, makeToast, type DropdownOptions, type UploadFile } from "design-system";
import api from "../api";
import { getCompanyPlan, getFiscalConfig, listCompanies, onboardFocusNfe, updateFiscalConfig } from "../api/companies";
import { TAX_REGIME_OPTIONS } from "./CompanyContractScreen";
import { parseApiError } from "../lib/apiErrors";
import ConfirmDialog from "../components/ConfirmDialog";
import Table from "../components/Table";
import { useStore } from "../store";
import type { CompanyPlan, FiscalConfig, FocusNfeErrorDetail, Terminal, User, Role, PaymentConfig, Company, MpTerminal } from "../types";
import styles from "./CompanyScreen.module.scss";

// ── Provider catalog ─────────────────────────────────────────────────────────
// Adicionar novo provider: inserir entrada aqui. O formulário e a listagem
// são gerados automaticamente a partir desta estrutura.

type FieldKey = "api_key" | "api_secret" | "webhook_secret" | `extra_config.${string}`;

interface ProviderField {
  key: FieldKey;
  label: string;
  placeholder: string;
  type: "password" | "text";
  required: boolean;
}

interface ProviderDef {
  label: string;
  fields: ProviderField[];
  note?: string; // exibido quando não há campos (ex: Mock)
}

const PROVIDERS: Record<string, ProviderDef> = {
  mercadopago: {
    label: "Mercado Pago",
    fields: [
      {
        key: "api_key",
        label: "Access Token",
        placeholder: "TEST-... ou APP_USR-...",
        type: "password",
        required: true,
      },
      {
        key: "extra_config.public_key",
        label: "Public Key",
        placeholder: "TEST-... ou APP_USR-... (opcional)",
        type: "text",
        required: false,
      },
      {
        key: "webhook_secret",
        label: "Chave secreta do webhook",
        placeholder: "Cole aqui a chave gerada ao configurar a URL abaixo no painel Mercado Pago (opcional)",
        type: "password",
        required: false,
      },
    ],
  },
  paygo: {
    label: "PayGo",
    fields: [
      {
        key: "api_key",
        label: "Chave Técnica",
        placeholder: "Chave técnica do terminal PayGo",
        type: "password",
        required: true,
      },
      {
        key: "api_secret",
        label: "Senha Técnica",
        placeholder: "Senha técnica do terminal PayGo",
        type: "password",
        required: true,
      },
    ],
  },
  mock: {
    label: "Mock (testes)",
    fields: [],
    note: "Não requer credenciais — processa pagamentos localmente para testes.",
  },
};

const PROVIDER_OPTIONS: DropdownOptions[] = Object.entries(PROVIDERS).map(([key, def]) => ({
  value: key,
  label: def.label,
}));

const PROVIDER_FILTER_OPTIONS: DropdownOptions[] = [{ value: "", label: "Todos" }, ...PROVIDER_OPTIONS];

// "Ativas"/"Inativas" concordam com "configuração" (feminino) — não
// reaproveita STATUS_FILTER_OPTIONS abaixo, que concorda com "usuário"/
// "terminal" (masculino). Default "Todas": diferente de usuário/terminal,
// uma config inativa não é "removida" — é comum ter várias por ambiente e
// só uma ativa por vez, então escondê-las por padrão esconderia a maioria.
const PAYMENT_STATUS_FILTER_OPTIONS: DropdownOptions[] = [
  { value: "all", label: "Todas" },
  { value: "active", label: "Ativas" },
  { value: "inactive", label: "Inativas" },
];

const ENVIRONMENT_OPTIONS: DropdownOptions[] = [
  { value: "sandbox", label: "Sandbox" },
  { value: "production", label: "Produção" },
];

const ENVIRONMENT_FILTER_OPTIONS: DropdownOptions[] = [{ value: "", label: "Todos" }, ...ENVIRONMENT_OPTIONS];

const ROLE_OPTIONS: DropdownOptions[] = [
  { value: "cashier", label: "Caixa" },
  { value: "manager", label: "Gerente" },
  { value: "owner", label: "Owner" },
];

const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.map((o) => [o.value, o.label]),
);

const ROLE_FILTER_OPTIONS: DropdownOptions[] = [{ value: "", label: "Todos" }, ...ROLE_OPTIONS];

type StatusFilter = "active" | "inactive" | "all";

const STATUS_FILTER_OPTIONS: DropdownOptions[] = [
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
  { value: "all", label: "Todos" },
];

// Converte { "api_key": "x", "extra_config.public_key": "y" } → payload da API
function buildConfigPayload(
  provider: string,
  environment: string,
  values: Record<string, string>,
) {
  const payload: Record<string, unknown> = { provider, environment };
  const extra: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!value.trim()) continue;
    if (key.startsWith("extra_config.")) {
      extra[key.slice("extra_config.".length)] = value.trim();
    } else {
      payload[key] = value.trim();
    }
  }
  if (Object.keys(extra).length > 0) payload.extra_config = extra;
  return payload;
}

// Monta resumo das credenciais para exibição na listagem
function credentialLines(c: PaymentConfig, def: ProviderDef): string[] {
  return def.fields
    .map((f) => {
      let val: string | undefined | null;
      if (f.key === "api_key") val = c.api_key;
      else if (f.key === "api_secret") val = c.api_secret;
      else if (f.key === "webhook_secret") val = c.webhook_secret;
      else if (f.key.startsWith("extra_config.")) {
        val = c.extra_config?.[f.key.slice("extra_config.".length)];
      }
      return val ? `${f.label}: ${val}` : null;
    })
    .filter((v): v is string => Boolean(v));
}

// ── PaymentTab ───────────────────────────────────────────────────────────────

interface PlanTabProps {
  companyId: number;
}

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ORD-177 — mesmo padrão visual de ReadOnlyField já usado em
// PriceTableFormScreen.tsx (label + valor em negrito, sem parecer campo
// desabilitado) — reproduzido aqui porque CSS modules não compartilham
// classe entre arquivos.
function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.planFormRowField}>
      <span className={styles.formLabel}>{label}</span>
      <div style={{ fontWeight: 700 }}>{value}</div>
    </div>
  );
}

// ORD-163 — plano comercial, somente leitura pro owner/manager (não
// confundir com o contrato jurídico, que é uma tela separada só de
// superadmin/admin — ver CompanyContractScreen).
// ORD-177 — antes só mostrava o nome da tabela de preço, sem os valores de
// fato cobrados (preço do totem, faixas de transação) — o cliente não tinha
// como conferir o que está pagando sem pedir pro time Ordin. Reaproveita o
// mesmo padrão de detalhamento somente-leitura já validado na ORD-167.
function PlanTab({ companyId }: PlanTabProps) {
  const [plan, setPlan] = useState<CompanyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getCompanyPlan(companyId)
      .then(setPlan)
      .catch((e) => setErr(parseApiError(e).message))
      .finally(() => setLoading(false));
  }, [companyId]);

  if (loading) return <div className={styles.muted}>Carregando…</div>;
  if (err) return <Alert variant="error" text={err} fullWidth />;
  if (!plan) return <div className={styles.muted}>Nenhum plano comercial encontrado.</div>;

  function fmtDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("pt-BR");
  }

  const pt = plan.price_table;

  return (
    <div>
      <div className={styles.planPanel} style={{ marginBottom: 20 }}>
        <div className={styles.planRow}>
          <span className={styles.planLabel}>Status</span>
          <Tag variant={plan.status === "Ativo" ? "success" : "warning"}>{plan.status}</Tag>
        </div>
        <div className={styles.planRow}>
          <span className={styles.planLabel}>Tabela de preço</span>
          <span>{pt.name}</span>
        </div>
        <div className={styles.planRow}>
          <span className={styles.planLabel}>Vencimento</span>
          <span>{fmtDate(plan.expires_at)}</span>
        </div>
        <div className={styles.planRow}>
          <span className={styles.planLabel}>Última renovação</span>
          <span>{plan.renewed_at ? fmtDate(plan.renewed_at) : "Nunca renovado"}</span>
        </div>
      </div>

      {pt.totem_price_1 !== undefined && (
        <div className={styles.planPanel}>
          <div className={styles.formTitle}>Valores da tabela vigente</div>
          <div className={styles.planFormRow}>
            <ReadOnlyField label="Preço do 1º totem" value={fmtBRL(pt.totem_price_1)} />
            <ReadOnlyField label="Multiplicador do 2º totem" value={`${Math.round((pt.totem_multiplier_2 ?? 0) * 100)}%`} />
            <ReadOnlyField label="Multiplicador do 3º ao 5º totem" value={`${Math.round((pt.totem_multiplier_3_5 ?? 0) * 100)}%`} />
          </div>

          {pt.transaction_tiers && pt.transaction_tiers.length > 0 && (
            <>
              <div className={styles.formLabel} style={{ marginTop: 8 }}>
                Faixas de taxa transacional (por volume de transações/mês)
              </div>
              {pt.transaction_tiers.map((t, i) => (
                <div key={i} className={styles.planFormRow}>
                  <ReadOnlyField label="De (transações/mês)" value={String(t.min_transactions)} />
                  <ReadOnlyField
                    label="Até (transações/mês)"
                    value={t.max_transactions === null ? "Sem teto" : String(t.max_transactions)}
                  />
                  <ReadOnlyField label="Preço por transação" value={fmtBRL(t.price_per_transaction)} />
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface FiscalTabProps {
  companyId: number;
}

// ORD-168 — mesma constante/padrão de ProductEditScreen.tsx (IMAGE_MAX_SIZE_MB/
// IMAGE_TYPES) pro componente Upload do design-system. application/x-pkcs12 é
// o MIME registrado pra .pfx/.p12 — em teste real com certificado de verdade,
// vale confirmar que o navegador reporta esse MIME (alguns SOs/navegadores
// caem em application/octet-stream pra esse tipo de arquivo; não coberto
// ainda por não termos um .pfx real pra testar, ver bloqueio já registrado
// em docs/estudo-nfce.md §7.1).
const CERTIFICADO_TYPES = ["application/x-pkcs12"];
const CERTIFICADO_MAX_SIZE_MB = 5;
// ORD-168 — tamanhos confirmados via pesquisa do usuário (Focus NFe/Olist/
// Nota Gateway): CSC alfanumérico até 36 caracteres; ID do CSC numérico,
// geralmente 6 dígitos (ex. "000001") — mesmo limite aplicado no backend
// (FiscalConfigIn, services/company/main.py).
const CSC_MAX_LENGTH = 36;
const ID_TOKEN_MAX_LENGTH = 6;

// ORD-171 — ambiente sempre começa em "homologacao" (backend), troca pra
// "producao" é explícita — nunca emite nota fiscal real por engano.
const AMBIENTE_OPTIONS: DropdownOptions[] = [
  { value: "homologacao", label: "Homologação (sem validade fiscal)" },
  { value: "producao", label: "Produção (nota fiscal real)" },
  // ORD-179 — só fabrica NFC-e fictícia se o payment-service tiver
  // FISCAL_MOCKUP_ENABLED ligado (env var de plataforma); sem isso, se
  // comporta como homologação. Uso interno do time Ordin, pra validar o
  // layout impresso sem certificado A1 real.
  { value: "mockup", label: "Mockup (teste — gera NFC-e fictícia)" },
];

// ORD-168 — não existe um componente de senha com olho pronto no
// design-system nem em uso em outra tela deste app (LoginScreen/
// SetPasswordScreen/SettingsScreen usam type="password" puro, sem toggle) —
// construído aqui em cima do InputBase, reaproveitando o mesmo mecanismo de
// icon+onActionIconClick já usado no campo de URL do webhook (PaymentTab
// acima). Ícones 'eye'/'eye-off' já existem no icon set do design-system.
function PasswordField({
  label, placeholder, inputRef, maxLength,
}: {
  label: string;
  placeholder: string;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  maxLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <InputBase
      label={label}
      type={visible ? "text" : "password"}
      placeholder={placeholder}
      ref={(el) => { inputRef.current = el; }}
      autoComplete="new-password"
      icon={visible ? "eye-off" : "eye"}
      onActionIconClick={() => setVisible((v) => !v)}
      maxLength={maxLength}
    />
  );
}

// ORD-170 — erro repassado 1:1 da Focus NFe (não é o formato genérico do
// FastAPI/Pydantic que parseApiError trata) — objeto com codigo/mensagem e,
// às vezes, uma lista erros[] com mais de um item na mesma resposta
// (confirmado ao vivo, ver Explorer da história). Cai no parseApiError
// genérico se o formato vier diferente do esperado (ex. 502 de conectividade).
function parseFocusNfeError(err: unknown): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail) && "mensagem" in detail) {
    const d = detail as FocusNfeErrorDetail;
    const extras = (d.erros ?? []).map((e) => e.mensagem).filter(Boolean);
    return extras.length ? `${d.mensagem}: ${extras.join("; ")}` : d.mensagem;
  }
  return parseApiError(err).message;
}

// ORD-168 — certificado A1 + CSC (produção/homologação). Razão social/IE/
// regime/endereço já existem em Company e são editados em
// CompanyContractScreen — mostrados aqui só como resumo somente-leitura,
// nunca duas fontes de verdade pro mesmo dado.
function FiscalTab({ companyId }: FiscalTabProps) {
  const [cfg, setCfg] = useState<FiscalConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const [certFile, setCertFile] = useState<File | null>(null);
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);

  // ── Onboarding na Focus NFe (ORD-170) ────────────────────────────────────
  const [onboarding, setOnboarding] = useState(false);
  const [onboardError, setOnboardError] = useState<string | null>(null);

  // ── Interruptor de emissão + ambiente (ORD-171) ──────────────────────────
  const [ativoSaving, setAtivoSaving] = useState(false);
  const [ambienteSaving, setAmbienteSaving] = useState(false);
  const [confirmAtivar, setConfirmAtivar] = useState(false);

  // ── Cadastro manual de tokens já existentes (ORD-178) ────────────────────
  const [manualTokenModalOpen, setManualTokenModalOpen] = useState(false);
  const [manualTokenSaving, setManualTokenSaving] = useState(false);
  const [manualTokenError, setManualTokenError] = useState("");
  const [manualTokenModalKey, setManualTokenModalKey] = useState(0);
  const tokenProducaoManualRef = useRef<HTMLInputElement | null>(null);
  const tokenHomologacaoManualRef = useRef<HTMLInputElement | null>(null);

  const certSenhaRef = useRef<HTMLInputElement | null>(null);
  const cscProducaoRef = useRef<HTMLInputElement | null>(null);
  const idTokenProducaoRef = useRef<HTMLInputElement | null>(null);
  const cscHomologacaoRef = useRef<HTMLInputElement | null>(null);
  const idTokenHomologacaoRef = useRef<HTMLInputElement | null>(null);

  function load() {
    setLoading(true);
    getFiscalConfig(companyId)
      .then(setCfg)
      .catch((e) => setErr(parseApiError(e).message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [companyId]);

  function handleCertUpload(files: UploadFile[]) {
    const picked = files[0];
    setUploadFiles(files);
    if (picked && picked.status === "success") {
      setCertFile(picked.file);
    } else {
      setCertFile(null);
    }
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // reader.result é uma data URL ("data:...;base64,XXXX") — só o
        // conteúdo depois da vírgula é o base64 puro que a Focus NFe espera
        // (docs/stories/ORD-168-*.md).
        resolve(result.slice(result.indexOf(",") + 1));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function handleSave() {
    const payload: Record<string, string> = {};
    if (certFile) {
      payload.certificado_base64 = await fileToBase64(certFile);
      payload.certificado_nome_arquivo = certFile.name;
    }
    const senha = certSenhaRef.current?.value.trim();
    if (senha) payload.certificado_senha = senha;
    const cscProducao = cscProducaoRef.current?.value.trim();
    if (cscProducao) payload.csc_producao = cscProducao;
    const idTokenProducao = idTokenProducaoRef.current?.value.trim();
    if (idTokenProducao) payload.id_token_producao = idTokenProducao;
    const cscHomologacao = cscHomologacaoRef.current?.value.trim();
    if (cscHomologacao) payload.csc_homologacao = cscHomologacao;
    const idTokenHomologacao = idTokenHomologacaoRef.current?.value.trim();
    if (idTokenHomologacao) payload.id_token_homologacao = idTokenHomologacao;

    if (Object.keys(payload).length === 0) {
      makeToast("error", "Preencha ao menos um campo para salvar.");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateFiscalConfig(companyId, payload);
      setCfg(updated);
      setCertFile(null);
      setUploadFiles([]);
      setFormKey((k) => k + 1); // limpa os campos sensíveis (senha/CSC) depois de salvar
      makeToast("success", "Dados fiscais salvos!");
    } catch (e: unknown) {
      makeToast("error", parseApiError(e).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleOnboard() {
    setOnboarding(true);
    setOnboardError(null);
    try {
      await onboardFocusNfe(companyId);
      load();
      makeToast("success", "Empresa cadastrada na Focus NFe!");
    } catch (e: unknown) {
      setOnboardError(parseFocusNfeError(e));
    } finally {
      setOnboarding(false);
    }
  }

  async function applyAtivo(value: boolean) {
    setAtivoSaving(true);
    try {
      const updated = await updateFiscalConfig(companyId, { ativo: value });
      setCfg(updated);
      makeToast("success", value ? "Emissão de NFC-e ativada." : "Emissão de NFC-e desativada.");
    } catch (e: unknown) {
      makeToast("error", parseApiError(e).message);
    } finally {
      setAtivoSaving(false);
    }
  }

  // Ligar pede confirmação (é o interruptor de emissão fiscal real) —
  // desligar é o sentido seguro, aplica direto.
  function handleToggleAtivo() {
    if (!cfg) return;
    if (cfg.ativo) applyAtivo(false);
    else setConfirmAtivar(true);
  }

  async function handleChangeAmbiente(opt: DropdownOptions) {
    setAmbienteSaving(true);
    try {
      const updated = await updateFiscalConfig(companyId, { ambiente: opt.value as "homologacao" | "producao" | "mockup" });
      setCfg(updated);
    } catch (e: unknown) {
      makeToast("error", parseApiError(e).message);
    } finally {
      setAmbienteSaving(false);
    }
  }

  function openManualTokenModal() {
    setManualTokenError("");
    setManualTokenModalKey((k) => k + 1);
    setManualTokenModalOpen(true);
  }

  async function handleSaveManualTokens() {
    const tokenProducao = tokenProducaoManualRef.current?.value.trim();
    const tokenHomologacao = tokenHomologacaoManualRef.current?.value.trim();
    if (!tokenProducao && !tokenHomologacao) {
      setManualTokenError("Informe ao menos um token (homologação ou produção).");
      return;
    }
    setManualTokenSaving(true);
    setManualTokenError("");
    try {
      const updated = await updateFiscalConfig(companyId, {
        ...(tokenProducao ? { token_producao_manual: tokenProducao } : {}),
        ...(tokenHomologacao ? { token_homologacao_manual: tokenHomologacao } : {}),
      });
      setCfg(updated);
      setManualTokenModalOpen(false);
      makeToast("success", "Tokens cadastrados!");
    } catch (e: unknown) {
      setManualTokenError(parseApiError(e).message);
    } finally {
      setManualTokenSaving(false);
    }
  }

  if (loading) return <div className={styles.muted}>Carregando…</div>;
  if (err) return <Alert variant="error" text={err} fullWidth />;
  if (!cfg) return null;

  return (
    <div>
      <div className={styles.fiscalForm}>
        <Alert
          variant="neutral"
          icon="alert-circle"
          fullWidth
          text="Esses dados — certificado digital A1, CSC e as informações fiscais já cadastradas da empresa — são usados pelo Ordin para emitir a NFC-e nas vendas do totem. Cadastrar aqui não ativa a emissão automaticamente: ligar ou desligar a emissão de verdade acontece numa etapa separada, depois da conclusão do cadastro fiscal da empresa."
        />
      </div>
      <div className={`${styles.planPanel} ${styles.fiscalForm}`} style={{ marginTop: 16, marginBottom: 20 }}>
        <div className={styles.planRow}>
          <span className={styles.planLabel}>Status</span>
          <Tag variant={cfg.completo ? "success" : "warning"}>
            {cfg.completo ? "Dados fiscais: completos" : "Dados fiscais: incompletos"}
          </Tag>
        </div>
        <div className={styles.planRow}>
          <span className={styles.planLabel}>Razão social</span>
          <span>{cfg.legal_name ?? "—"}</span>
        </div>
        <div className={styles.planRow}>
          <span className={styles.planLabel}>Inscrição Estadual</span>
          <span>{cfg.state_registration ?? "—"}</span>
        </div>
        <div className={styles.planRow}>
          <span className={styles.planLabel}>Regime tributário</span>
          <span>{TAX_REGIME_OPTIONS.find((o) => o.value === cfg.tax_regime)?.label ?? cfg.tax_regime ?? "—"}</span>
        </div>
        <div className={styles.planRow}>
          <span className={styles.planLabel}>Endereço</span>
          <span>{cfg.address_summary ?? "—"}</span>
        </div>
        <div className={styles.formHint}>
          Razão social, IE, regime e endereço são editados na aba "Contrato" da empresa.
        </div>
      </div>

      <div className={`${styles.planPanel} ${styles.fiscalForm}`} style={{ marginBottom: 20 }}>
        <div className={styles.planRow}>
          <span className={styles.planLabel}>Focus NFe</span>
          <Tag variant={cfg.focus_nfe_cadastrado ? "success" : "neutral"}>
            {cfg.focus_nfe_cadastrado
              ? `Cadastrado${cfg.focus_nfe_cadastro_manual ? " manualmente" : ""} em ${new Date(cfg.focus_nfe_cadastrado_em!).toLocaleString("pt-BR")}`
              : "Ainda não cadastrado"}
          </Tag>
        </div>
        {!cfg.completo && (
          <div className={styles.formHint}>
            Complete o certificado e o CSC (produção e homologação) acima, e a razão social/IE/
            regime/endereço na aba "Contrato", para habilitar o cadastro (automático ou manual).
          </div>
        )}
        {onboardError && <Alert variant="error" text={onboardError} fullWidth />}
        <div className={styles.formActions}>
          <Button type="button" onClick={handleOnboard} loading={onboarding} disabled={onboarding || !cfg.completo}>
            {cfg.focus_nfe_cadastrado ? "Reenviar cadastro" : "Cadastrar na Focus NFe"}
          </Button>
          {/* ORD-178 — escondido por enquanto: o cadastro automatizado já traz os
              tokens prontos na resposta; a via manual fica reservada pro caso raro
              de empresa que já existe na Focus NFe, sem botão visível por ora. */}
        </div>
      </div>

      <div className={`${styles.planPanel} ${styles.fiscalForm}`} style={{ marginBottom: 20 }}>
        <div className={styles.planRow}>
          <span className={styles.planLabel}>Emissão de NFC-e</span>
          <Toggle
            name="fiscal-ativo"
            checked={cfg.ativo}
            disabled={ativoSaving || (!cfg.ativo && !cfg.focus_nfe_cadastrado)}
            onChange={handleToggleAtivo}
          />
        </div>
        {!cfg.focus_nfe_cadastrado && (
          <div className={styles.formHint}>Cadastre a empresa na Focus NFe acima para poder ativar a emissão.</div>
        )}
        <div className={styles.planRow}>
          <span className={styles.planLabel}>Ambiente</span>
        </div>
        <Dropdown
          label=""
          value={AMBIENTE_OPTIONS.find((o) => o.value === cfg.ambiente) ?? null}
          onValueSelected={handleChangeAmbiente}
          options={AMBIENTE_OPTIONS}
          disabled={ambienteSaving}
        />
        {cfg.ambiente === "homologacao" && (
          <Alert
            variant="warning"
            icon="alert-triangle"
            fullWidth
            text="Ambiente de homologação — qualquer NFC-e emitida aqui não tem validade fiscal real. Troque para produção somente após validar a emissão."
          />
        )}
        {cfg.ambiente === "mockup" && (
          <Alert
            variant="warning"
            icon="alert-triangle"
            fullWidth
            text="Ambiente de mockup — a NFC-e é inteiramente fictícia (chave e QR fake), gerada sem contato com a Focus NFe. Uso interno do time Ordin pra testar o impresso, nunca use numa empresa cliente real."
          />
        )}
      </div>

      <div className={`${styles.form} ${styles.fiscalForm}`} key={formKey}>
        <div className={styles.formTitle}>Certificado digital (A1)</div>
        <div className={styles.formHint}>
          {cfg.certificado_cadastrado
            ? `Certificado cadastrado: ${cfg.certificado_nome_arquivo ?? "arquivo"} — envie um novo arquivo para substituir.`
            : "Nenhum certificado cadastrado ainda."}
        </div>
        <Upload
          fullWidth
          maxFileSize={CERTIFICADO_MAX_SIZE_MB}
          multipleFiles={false}
          types={CERTIFICADO_TYPES}
          helperMessage=".pfx ou .p12, até 5 MB"
          errorMessage="Envie um arquivo .pfx ou .p12 de até 5 MB"
          onCallbackUpload={handleCertUpload}
        />
        <UploadListFiles items={uploadFiles} removable={false} />
        <PasswordField
          label="Senha do certificado"
          placeholder={cfg.certificado_cadastrado ? "••••••••" : "Senha do arquivo .pfx"}
          inputRef={certSenhaRef}
        />

        <div className={styles.formTitle} style={{ marginTop: 16 }}>CSC — Código de Segurança do Contribuinte</div>
        <div className={styles.formHint}>Gerado no portal da SEFAZ do estado da empresa.</div>
        <div className={styles.fiscalRow}>
          <PasswordField
            label="CSC de produção"
            placeholder={cfg.csc_producao_cadastrado ? "••••••••" : "CSC de produção"}
            inputRef={cscProducaoRef}
            maxLength={CSC_MAX_LENGTH}
          />
          <InputBase label="ID do CSC de produção" type="text" placeholder="Ex.: 000001" ref={idTokenProducaoRef} maxLength={ID_TOKEN_MAX_LENGTH} />
        </div>
        <div className={styles.fiscalRow}>
          <PasswordField
            label="CSC de homologação"
            placeholder={cfg.csc_homologacao_cadastrado ? "••••••••" : "CSC de homologação"}
            inputRef={cscHomologacaoRef}
            maxLength={CSC_MAX_LENGTH}
          />
          <InputBase label="ID do CSC de homologação" type="text" placeholder="Ex.: 000001" ref={idTokenHomologacaoRef} maxLength={ID_TOKEN_MAX_LENGTH} />
        </div>

        <div className={styles.formActions} style={{ marginTop: 12 }}>
          <Button type="button" onClick={handleSave} loading={saving} disabled={saving}>Salvar</Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmAtivar}
        title="Ativar emissão de NFC-e"
        message={`A partir de agora, todo pagamento aprovado no totem vai tentar emitir uma nota fiscal no ambiente de ${
          cfg.ambiente === "producao" ? "produção (nota fiscal real)"
          : cfg.ambiente === "mockup" ? "mockup (NFC-e fictícia, só pra teste)"
          : "homologação (sem validade fiscal)"
        }. Falha na emissão nunca bloqueia a venda. Confirma a ativação?`}
        confirmLabel="Ativar"
        alertVariant="warning"
        alertIcon="alert-triangle"
        onConfirm={() => { setConfirmAtivar(false); applyAtivo(true); }}
        onCancel={() => setConfirmAtivar(false)}
      />

      <Modal
        open={manualTokenModalOpen}
        width={480}
        onClose={() => setManualTokenModalOpen(false)}
        onBackdropClick={() => setManualTokenModalOpen(false)}
        onCloseButtonClick={() => setManualTokenModalOpen(false)}
      >
        <div key={manualTokenModalKey} className={styles.modalForm}>
          <div className={styles.formTitle}>Já tenho os tokens</div>
          <div className={styles.formHint}>
            Use quando a empresa já tem uma conta própria na Focus NFe (ex.: criada direto no
            painel deles) — cole aqui os tokens que já existem, em vez de gerar novos.
          </div>
          {manualTokenError && <Alert variant="error" text={manualTokenError} fullWidth />}
          <PasswordField label="Token de homologação" placeholder="Opcional" inputRef={tokenHomologacaoManualRef} />
          <PasswordField label="Token de produção" placeholder="Opcional" inputRef={tokenProducaoManualRef} />
          <div className={styles.formActions}>
            <Button type="button" onClick={handleSaveManualTokens} loading={manualTokenSaving} disabled={manualTokenSaving}>
              Salvar
            </Button>
            <Button type="button" variant="secondary" onClick={() => setManualTokenModalOpen(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

interface PaymentTabProps {
  companyId: number;
}

function PaymentTab({ companyId }: PaymentTabProps) {
  const [configs, setConfigs] = useState<PaymentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // ORD-100: mesmo padrão de modal único do ORD-098/099 — editConfigId null
  // = criando. Provider/Ambiente só existem no modal na criação (edição
  // mantém o provider/ambiente já cadastrados, só troca credenciais).
  const [modalOpen, setModalOpen] = useState(false);
  const [editConfigId, setEditConfigId] = useState<number | null>(null);
  const [provider, setProvider] = useState("mercadopago");
  const [environment, setEnvironment] = useState("sandbox");
  const [modalKey, setModalKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  // Não-controlados de propósito (mesmo contorno do bug de foco do Modal
  // documentado no ORD-098) — mapa em vez de refs individuais porque o
  // conjunto de campos muda conforme o provider selecionado.
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ORD-100: filtro local — lista de configs por empresa é sempre pequena,
  // sem necessidade de ida ao backend (diferente de Terminais/Usuários).
  const [providerFilter, setProviderFilter] = useState("");
  const [environmentFilter, setEnvironmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const providerDef = PROVIDERS[provider] ?? { label: provider, fields: [] };
  const editCfg = configs.find((c) => c.id === editConfigId) ?? null;
  const editDef = editCfg ? (PROVIDERS[editCfg.provider] ?? { label: editCfg.provider, fields: [] }) : null;
  const modalDef = editConfigId === null ? providerDef : editDef;
  const filteredConfigs = configs.filter((c) => {
    if (providerFilter && c.provider !== providerFilter) return false;
    if (environmentFilter && c.environment !== environmentFilter) return false;
    if (statusFilter === "active" && !c.active) return false;
    if (statusFilter === "inactive" && c.active) return false;
    return true;
  });

  async function load() {
    try {
      const r = await api.get(`/companies/${companyId}/payment-configs`);
      setConfigs(r.data.configs ?? []);
      setErr(null);
    } catch {
      setErr("Erro ao carregar configurações.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [companyId]);

  function flash(ok: boolean, text: string) {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 3000);
  }

  function openNewConfig() {
    setEditConfigId(null);
    setProvider("mercadopago");
    setEnvironment("sandbox");
    fieldRefs.current = {};
    setFormError("");
    setModalKey((k) => k + 1);
    setModalOpen(true);
  }

  function openEditConfig(id: number) {
    setEditConfigId(id);
    fieldRefs.current = {};
    setFormError("");
    setModalKey((k) => k + 1);
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!modalDef) return;
    const values: Record<string, string> = {};
    for (const f of modalDef.fields) {
      values[f.key] = fieldRefs.current[f.key]?.value ?? "";
    }

    if (editConfigId === null) {
      const missing = modalDef.fields.filter((f) => f.required && !values[f.key]?.trim());
      if (missing.length > 0) {
        setFormError(`Preencha: ${missing.map((f) => f.label).join(", ")}.`);
        return;
      }
      setSaving(true);
      setFormError("");
      try {
        await api.post(`/companies/${companyId}/payment-configs`, buildConfigPayload(provider, environment, values));
        setModalOpen(false);
        flash(true, "Configuração salva! Clique em Ativar para usá-la.");
        load();
      } catch (e: unknown) {
        const axErr = e as { response?: { data?: { detail?: string } } };
        setFormError(axErr?.response?.data?.detail ?? "Erro ao salvar.");
      } finally {
        setSaving(false);
      }
    } else {
      if (!editCfg || Object.values(values).every((v) => !v.trim())) {
        setFormError("Preencha ao menos um campo para atualizar.");
        return;
      }
      setSaving(true);
      setFormError("");
      try {
        await api.put(`/companies/${companyId}/payment-configs/${editConfigId}`, buildConfigPayload(editCfg.provider, editCfg.environment, values));
        setModalOpen(false);
        flash(true, "Credenciais atualizadas!");
        load();
      } catch {
        setFormError("Erro ao atualizar.");
      } finally {
        setSaving(false);
      }
    }
  }

  async function handleDelete() {
    if (confirmDeleteId === null) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    await api.delete(`/companies/${companyId}/payment-configs/${id}`);
    load();
  }

  async function handleActivate(id: number) {
    try {
      await api.patch(`/companies/${companyId}/payment-configs/${id}/activate`);
      flash(true, "Configuração ativada!");
      // Ativar muda o status de duas linhas de uma vez (a ativada e a que
      // era ativa antes) — com o filtro de Status em Ativas/Inativas, isso
      // fazia a linha sumir da visão sem nenhum feedback visual da troca.
      setStatusFilter("all");
      load();
    } catch {
      flash(false, "Erro ao ativar.");
    }
  }

  function clearConfigFilters() {
    setProviderFilter("");
    setEnvironmentFilter("");
    setStatusFilter("all");
  }

  const envLabel: Record<string, string> = { sandbox: "Sandbox", production: "Produção" };

  return (
    <div>
      <div className={styles.filterBar}>
        <Dropdown
          label="Provider"
          value={PROVIDER_FILTER_OPTIONS.find((o) => o.value === providerFilter) ?? PROVIDER_FILTER_OPTIONS[0]}
          onValueSelected={(opt) => setProviderFilter(opt.value)}
          options={PROVIDER_FILTER_OPTIONS}
        />
        <Dropdown
          label="Ambiente"
          value={ENVIRONMENT_FILTER_OPTIONS.find((o) => o.value === environmentFilter) ?? ENVIRONMENT_FILTER_OPTIONS[0]}
          onValueSelected={(opt) => setEnvironmentFilter(opt.value)}
          options={ENVIRONMENT_FILTER_OPTIONS}
        />
        <Dropdown
          label="Status"
          value={PAYMENT_STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter) ?? PAYMENT_STATUS_FILTER_OPTIONS[0]}
          onValueSelected={(opt) => setStatusFilter(opt.value as "all" | "active" | "inactive")}
          options={PAYMENT_STATUS_FILTER_OPTIONS}
        />
        <Button type="button" variant="secondary" onClick={clearConfigFilters}>Limpar filtros</Button>
        <Button type="button" onClick={openNewConfig}>+ Nova configuração</Button>
      </div>

      {loading ? (
        <div className={styles.muted}>Carregando…</div>
      ) : err ? (
        <div className={styles.muted}>{err}</div>
      ) : (
        <Table
          variant="compact"
          rowKey={(c) => c.id}
          emptyMessage="Nenhuma configuração encontrada."
          columns={[
            {
              key: "provider", header: "Provider",
              render: (c) => (PROVIDERS[c.provider] ?? { label: c.provider }).label,
            },
            {
              key: "environment", header: "Ambiente",
              render: (c) => (
                <Tag variant={c.environment === "production" ? "warning" : "neutral"}>
                  {envLabel[c.environment] ?? c.environment}
                </Tag>
              ),
            },
            {
              key: "credentials", header: "Credenciais",
              render: (c) => {
                const def = PROVIDERS[c.provider] ?? { label: c.provider, fields: [] };
                const lines = credentialLines(c, def);
                return lines.length > 0
                  ? <span className={styles.configLines}>{lines.join("  ·  ")}</span>
                  : <span className={styles.muted}>—</span>;
              },
            },
            {
              key: "status", header: "Status",
              render: (c) => <Tag variant={c.active ? "success" : "greyscale"}>{c.active ? "Ativa" : "Inativa"}</Tag>,
            },
            {
              key: "action", header: "",
              render: (c) => {
                const def = PROVIDERS[c.provider] ?? { label: c.provider, fields: [] };
                return (
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    {!c.active && (
                      <Button size="small" onClick={() => handleActivate(c.id)}>Ativar</Button>
                    )}
                    {def.fields.length > 0 && (
                      <Button size="small" variant="secondary" onClick={() => openEditConfig(c.id)}>
                        Editar credenciais
                      </Button>
                    )}
                    <Button size="small" variant="secondary" onClick={() => setConfirmDeleteId(c.id)}>Remover</Button>
                  </div>
                );
              },
            },
          ]}
          rows={filteredConfigs}
        />
      )}

      {msg && (
        <div className={`${styles.flashMsg} ${msg.ok ? styles.flashOk : styles.flashErr}`}>{msg.text}</div>
      )}

      <Modal
        open={modalOpen}
        width={560}
        onClose={() => setModalOpen(false)}
        onBackdropClick={() => setModalOpen(false)}
        onCloseButtonClick={() => setModalOpen(false)}
      >
        {modalDef && (
          <form key={modalKey} onSubmit={handleSubmit} className={styles.modalForm}>
            <div className={styles.formTitle}>
              {editConfigId === null ? "Nova configuração" : `Editar credenciais — ${modalDef.label}`}
            </div>
            {editConfigId === null && (
              <div className={styles.formHint}>
                A configuração começa inativa. Clique em "Ativar" para usá-la.
              </div>
            )}
            {formError && <Alert variant="error" text={formError} fullWidth />}

            {editConfigId === null && (
              <>
                <Dropdown
                  label="Provider"
                  value={PROVIDER_OPTIONS.find((o) => o.value === provider) ?? null}
                  onValueSelected={(opt) => { setProvider(opt.value); fieldRefs.current = {}; }}
                  options={PROVIDER_OPTIONS}
                />
                <Dropdown
                  label="Ambiente"
                  value={ENVIRONMENT_OPTIONS.find((o) => o.value === environment) ?? null}
                  onValueSelected={(opt) => setEnvironment(opt.value)}
                  options={ENVIRONMENT_OPTIONS}
                />
              </>
            )}

            {(editConfigId === null ? provider : editCfg?.provider) === "mercadopago" && (
              <InputBase
                label="URL do webhook (colar no painel Mercado Pago)"
                value={`${window.location.origin}/payments/webhook/mercadopago/${companyId}`}
                readOnly
                icon="copy"
                onActionIconClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/payments/webhook/mercadopago/${companyId}`);
                  makeToast("success", "URL copiada!");
                }}
              />
            )}

            {modalDef.fields.map((f, i) => (
              <InputBase
                key={f.key}
                label={editConfigId === null ? `${f.label}${f.required ? "" : " (opcional)"}` : f.label}
                type={f.type}
                placeholder={editConfigId === null ? f.placeholder : "Novo valor (deixe em branco para manter atual)"}
                ref={(el) => { fieldRefs.current[f.key] = el; }}
                autoComplete="new-password"
                autoFocus={i === 0}
              />
            ))}

            {editConfigId === null && providerDef.note && (
              <div className={styles.configNote}>{providerDef.note}</div>
            )}

            <div className={styles.formActions}>
              <Button type="submit" loading={saving} disabled={saving}>Salvar</Button>
              <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        message="Remover esta configuração?"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}

// ── CompanyScreen ─────────────────────────────────────────────────────────────

export default function CompanyScreen() {
  const role = useStore((s) => s.role);
  // superadmin e admin são equivalentes (gestão da plataforma, ver
  // docs/ARQUITETURA.md §1.2) — mesmo padrão de PaymentsScreen/SettingsScreen.
  const isPlatformAdmin = role === "superadmin" || role === "admin";
  const ownCompanyId = useStore((s) => s.companyId);
  const selectedCompanyId = useStore((s) => s.selectedCompanyId);
  const setSelectedCompany = useStore((s) => s.setSelectedCompany);
  // ORD-082: valor de SESSÃO compartilhado (não um useState local isolado)
  // — mesmo comportamento de seleção de empresa do SettingsScreen: sem
  // sessão ativa, seleciona aqui; com sessão ativa (vinda de Config ou
  // desta própria tela), usa pra carregar os dados da empresa.
  const companyId = isPlatformAdmin ? selectedCompanyId : ownCompanyId;
  const [tab, setTab] = useState<"terminals" | "users" | "payment" | "plan" | "fiscal">("users");

  const [companies, setCompanies] = useState<Company[]>([]);
  useEffect(() => {
    if (isPlatformAdmin) {
      listCompanies({ limit: 200 }).then((r) => setCompanies(r.companies)).catch(() => null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatformAdmin]);

  const companyOptions: DropdownOptions[] = companies.map((c) => ({ value: String(c.id), label: c.name }));
  const showEmptyState = isPlatformAdmin && !companyId;

  // ── Terminals ─────────────────────────────────────────────────────────────
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [errTerminals, setErrTerminals] = useState<string | null>(null);
  const [terminalNameFilter, setTerminalNameFilter] = useState("");
  const [terminalEnvironmentFilter, setTerminalEnvironmentFilter] = useState("");
  const [terminalStatusFilter, setTerminalStatusFilter] = useState<StatusFilter>("active");
  const terminalDebounceTimer = useRef<ReturnType<typeof setTimeout>>();
  const terminalIsFirstRender = useRef(true);
  // Evita que uma resposta de filtro obsoleta chegue depois da mais recente
  // e sobrescreva o resultado certo — mesmo padrão de userRequestId acima.
  const terminalRequestId = useRef(0);
  // ORD-098: um único modal reaproveitado pra criar e editar — editingTerminalId
  // null = criando (mesmo padrão de editUserId/openEditUser pra usuários).
  const [terminalModalOpen, setTerminalModalOpen] = useState(false);
  const [editingTerminalId, setEditingTerminalId] = useState<number | null>(null);
  const [terminalDefaults, setTerminalDefaults] = useState({ label: "", mp_device_id: "" });
  const [terminalEnvironment, setTerminalEnvironment] = useState("sandbox");
  // Incrementado a cada abertura do modal — usado como `key` do form pra
  // forçar remontar os inputs não-controlados com o defaultValue certo.
  const [terminalModalKey, setTerminalModalKey] = useState(0);
  const [terminalSaving, setTerminalSaving] = useState(false);
  const [terminalFormError, setTerminalFormError] = useState("");
  // Rótulo/MP Device ID são não-controlados de propósito: o Modal do design
  // system gera um id novo a cada render do pai e usa isso pra criar o nó do
  // portal — um input controlado por state, re-renderizado a cada tecla, faz
  // o portal inteiro ser recriado e perde o foco a cada caractere digitado
  // (mesmo bug documentado em PaymentsScreen.tsx, Modal.tsx:46 do vendor).
  // Ler o valor só na hora de salvar evita re-renderizar o Modal ao digitar.
  const terminalLabelRef = useRef<HTMLInputElement>(null);
  const terminalMpDeviceRef = useRef<HTMLInputElement>(null);
  // ORD-133: MP Device ID vira select carregado do Mercado Pago — controlado
  // (diferente do label/ref acima) porque a seleção de uma opção não dispara
  // re-render a cada tecla, então não tem o problema de foco documentado
  // acima (mesmo padrão seguro já usado por terminalEnvironment/Dropdown).
  const [mpDeviceId, setMpDeviceId] = useState("");
  const [mpTerminalOptions, setMpTerminalOptions] = useState<DropdownOptions[]>([]);
  const [mpTerminalsStatus, setMpTerminalsStatus] = useState<"idle" | "loading" | "loaded" | "error" | "not_configured">("idle");
  // Escape hatch pra quando a consulta ao MP falha — volta pro InputBase de
  // texto livre de antes, com a mesma validação de formato feita no backend.
  const [mpManualMode, setMpManualMode] = useState(false);

  // ORD-148: operating_mode por device MP, pra tabela principal de
  // terminais — independente do fetchMpTerminals acima, que só roda dentro
  // do modal de criar/editar terminal. Erro aqui é silencioso de propósito
  // (a coluna de modo simplesmente não aparece): não é crítico pra tela
  // carregar o resto normalmente.
  const [mpOperatingModes, setMpOperatingModes] = useState<Record<string, string | null>>({});

  async function loadMpOperatingModes() {
    if (!companyId) return;
    try {
      const r = await api.get(`/companies/${companyId}/mp-terminals`);
      if (!r.data.configured) return;
      const modes: Record<string, string | null> = {};
      for (const t of r.data.terminals as MpTerminal[]) modes[t.id] = t.operating_mode ?? null;
      setMpOperatingModes(modes);
    } catch {
      // silencioso — ver comentário acima
    }
  }

  async function fixOperatingMode(deviceId: string) {
    try {
      await api.patch(`/companies/${companyId}/mp-terminals/operating-mode`, { device_id: deviceId });
      makeToast("success", "Modo alterado para PDV. Reinicie o terminal físico pra completar a mudança.");
      // Pode ainda mostrar o modo antigo até o reinício físico acontecer —
      // esperado, não é bug (ver Tech Explorer do ORD-148).
      loadMpOperatingModes();
    } catch (err) {
      makeToast("error", parseApiError(err).message);
    }
  }

  // ── Users ─────────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [errUsers, setErrUsers] = useState<string | null>(null);
  const [userNameFilter, setUserNameFilter] = useState("");
  const [userEmailFilter, setUserEmailFilter] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState<StatusFilter>("active");
  // ORD-099: mesmo padrão de modal único do ORD-098 — editingUserId null =
  // criando. E-mail só é usado (e só existe no modal) na criação; edição
  // manda só name/role, igual o comportamento de sempre.
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [userNameDefault, setUserNameDefault] = useState("");
  const [userRole, setUserRole] = useState<Role>("cashier");
  const [userModalKey, setUserModalKey] = useState(0);
  const [userSaving, setUserSaving] = useState(false);
  const [userFormError, setUserFormError] = useState("");
  // Não-controlados de propósito, mesmo contorno do bug de foco do Modal
  // documentado no ORD-098 (PaymentsScreen.tsx / Modal.tsx:46 do vendor).
  const userNameRef = useRef<HTMLInputElement>(null);
  const userEmailRef = useRef<HTMLInputElement>(null);
  const userDebounceTimer = useRef<ReturnType<typeof setTimeout>>();
  const userIsFirstRender = useRef(true);
  // Evita que uma resposta de filtro obsoleta (ex: busca disparada com o
  // nome ainda incompleto) chegue depois da mais recente e sobrescreva o
  // resultado certo — mesmo padrão de CompanyListScreen/OrdersScreen.
  const userRequestId = useRef(0);

  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    if (!companyId) return;
    loadTerminals();
    loadMpOperatingModes();
    terminalIsFirstRender.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, terminalEnvironmentFilter, terminalStatusFilter]);

  // Debounce só reage a digitação do usuário no campo de texto — a carga
  // inicial e a reação a ambiente/status ficam no efeito acima.
  useEffect(() => {
    if (terminalIsFirstRender.current) return;
    clearTimeout(terminalDebounceTimer.current);
    terminalDebounceTimer.current = setTimeout(() => loadTerminals(), 500);
    return () => clearTimeout(terminalDebounceTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalNameFilter]);

  // Debounce só reage a digitação do usuário nos campos de texto — a carga
  // inicial e a reação a papel/status ficam no efeito abaixo, que dispara
  // no mount e a cada mudança, sem duplicar a requisição (mesmo padrão de
  // CompanyListScreen/OrdersScreen).
  useEffect(() => {
    if (userIsFirstRender.current) return;
    clearTimeout(userDebounceTimer.current);
    userDebounceTimer.current = setTimeout(() => loadUsers(), 500);
    return () => clearTimeout(userDebounceTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userNameFilter, userEmailFilter]);

  useEffect(() => {
    if (!companyId) return;
    loadUsers();
    userIsFirstRender.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, userRoleFilter, userStatusFilter]);

  async function loadTerminals() {
    if (!companyId) return;
    const thisRequest = ++terminalRequestId.current;
    try {
      const r = await api.get(`/companies/${companyId}/terminals`, {
        params: {
          label: terminalNameFilter || undefined,
          environment: terminalEnvironmentFilter || undefined,
          status: terminalStatusFilter,
        },
      });
      if (thisRequest !== terminalRequestId.current) return; // resposta obsoleta, ignorar
      setTerminals(r.data.terminals ?? r.data);
      setErrTerminals(null);
    } catch {
      if (thisRequest !== terminalRequestId.current) return;
      setErrTerminals("Erro ao carregar terminais.");
    }
  }

  function clearTerminalFilters() {
    setTerminalNameFilter("");
    setTerminalEnvironmentFilter("");
    setTerminalStatusFilter("active");
  }

  async function loadUsers() {
    if (!companyId) return;
    const thisRequest = ++userRequestId.current;
    setLoadingUsers(true);
    try {
      const r = await api.get(`/companies/${companyId}/users`, {
        params: {
          name: userNameFilter || undefined,
          email: userEmailFilter || undefined,
          role: userRoleFilter || undefined,
          status: userStatusFilter,
        },
      });
      if (thisRequest !== userRequestId.current) return; // resposta obsoleta, ignorar
      setUsers(r.data.users ?? r.data);
      setErrUsers(null);
    } catch {
      if (thisRequest !== userRequestId.current) return;
      setErrUsers("Erro ao carregar usuários.");
    } finally {
      if (thisRequest === userRequestId.current) setLoadingUsers(false);
    }
  }

  // exclude_terminal_id: o próprio terminal sendo editado não deve ficar de
  // fora da lista só porque já usa aquele device (ver ORD-133 QA Explorer).
  async function fetchMpTerminals(excludeTerminalId: number | null) {
    if (!companyId) return;
    setMpTerminalsStatus("loading");
    try {
      const r = await api.get(`/companies/${companyId}/mp-terminals`);
      if (!r.data.configured) {
        setMpTerminalOptions([]);
        setMpTerminalsStatus("not_configured");
        return;
      }
      const options: DropdownOptions[] = (r.data.terminals as MpTerminal[])
        .filter((t) => !t.in_use_by || t.in_use_by.terminal_id === excludeTerminalId)
        .map((t) => ({ value: t.id, label: t.id }));
      setMpTerminalOptions(options);
      setMpTerminalsStatus("loaded");
    } catch {
      setMpTerminalsStatus("error");
    }
  }

  function openNewTerminal() {
    setEditingTerminalId(null);
    setTerminalDefaults({ label: "", mp_device_id: "" });
    setTerminalEnvironment("sandbox");
    setMpDeviceId("");
    setMpManualMode(false);
    setTerminalFormError("");
    setTerminalModalKey((k) => k + 1);
    setTerminalModalOpen(true);
    fetchMpTerminals(null);
  }

  function openEditTerminal(t: Terminal) {
    setEditingTerminalId(t.id);
    setTerminalDefaults({ label: t.label, mp_device_id: t.mp_device_id ?? "" });
    setTerminalEnvironment(t.environment ?? "sandbox");
    setMpDeviceId(t.mp_device_id ?? "");
    setMpManualMode(false);
    setTerminalFormError("");
    setTerminalModalKey((k) => k + 1);
    setTerminalModalOpen(true);
    fetchMpTerminals(t.id);
  }

  async function saveTerminal(e: FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    const label = terminalLabelRef.current?.value.trim() ?? "";
    const mpDeviceIdValue = (mpManualMode ? terminalMpDeviceRef.current?.value.trim() : mpDeviceId) ?? "";
    if (!label) {
      setTerminalFormError("Rótulo é obrigatório.");
      return;
    }
    setTerminalSaving(true);
    setTerminalFormError("");
    try {
      if (editingTerminalId === null) {
        await api.post(`/companies/${companyId}/terminals`, {
          label, environment: terminalEnvironment, mp_device_id: mpDeviceIdValue || undefined,
        });
      } else {
        await api.put(`/companies/${companyId}/terminals/${editingTerminalId}`, {
          label, environment: terminalEnvironment, mp_device_id: mpDeviceIdValue || null,
        });
      }
      setTerminalModalOpen(false);
      loadTerminals();
    } catch (e: unknown) {
      const axErr = e as { response?: { data?: { detail?: string } } };
      setTerminalFormError(axErr?.response?.data?.detail ?? "Erro ao salvar terminal.");
    } finally {
      setTerminalSaving(false);
    }
  }

  function deactivateTerminal(id: number) {
    if (!companyId) return;
    setConfirmState({
      message: "Desativar terminal?",
      onConfirm: async () => {
        setConfirmState(null);
        await api.delete(`/companies/${companyId}/terminals/${id}`);
        loadTerminals();
      },
    });
  }

  async function reactivateTerminal(id: number) {
    if (!companyId) return;
    await api.put(`/companies/${companyId}/terminals/${id}`, { active: true });
    loadTerminals();
  }

  function openNewUser() {
    setEditingUserId(null);
    setUserNameDefault("");
    setUserRole("cashier");
    setUserFormError("");
    setUserModalKey((k) => k + 1);
    setUserModalOpen(true);
  }

  async function saveUser(e: FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    const name = userNameRef.current?.value.trim() ?? "";
    if (!name) {
      setUserFormError("Nome completo é obrigatório.");
      return;
    }
    setUserSaving(true);
    setUserFormError("");
    try {
      if (editingUserId === null) {
        const email = userEmailRef.current?.value.trim() ?? "";
        if (!email) {
          setUserFormError("E-mail é obrigatório.");
          setUserSaving(false);
          return;
        }
        await api.post(`/companies/${companyId}/users`, { name, email, role: userRole });
      } else {
        await api.put(`/companies/${companyId}/users/${editingUserId}`, { name, role: userRole });
      }
      setUserModalOpen(false);
      loadUsers();
    } catch {
      setUserFormError("Erro ao salvar usuário.");
    } finally {
      setUserSaving(false);
    }
  }

  async function resendInvite(id: number) {
    if (!companyId) return;
    await api.post(`/companies/${companyId}/users/${id}/resend-invite`);
    makeToast("success", "Convite reenviado");
  }

  // ORD-097: funciona pra qualquer usuário ativo (não só pending_setup,
  // diferença chave em relação a "reenviar convite").
  async function sendPasswordReset(id: number) {
    if (!companyId) return;
    await api.post(`/companies/${companyId}/users/${id}/send-password-reset`);
    makeToast("success", "E-mail de redefinição de senha enviado");
  }

  function deactivateUser(id: number) {
    if (!companyId) return;
    setConfirmState({
      message: "Desativar usuário?",
      onConfirm: async () => {
        setConfirmState(null);
        await api.delete(`/companies/${companyId}/users/${id}`);
        loadUsers();
      },
    });
  }

  async function reactivateUser(id: number) {
    if (!companyId) return;
    await api.put(`/companies/${companyId}/users/${id}`, { active: true });
    loadUsers();
  }

  // ORD-088: recuperação assistida — owner/manager/superadmin/admin
  // desativa o duplo fator de um usuário que perdeu o dispositivo
  // autenticador e os códigos de backup (mesmo padrão de suporte do ORD-082).
  function resetUserMfa(id: number) {
    if (!companyId) return;
    setConfirmState({
      message: "Desativar o duplo fator deste usuário? Ele voltará a entrar só com e-mail e senha.",
      onConfirm: async () => {
        setConfirmState(null);
        await api.post(`/companies/${companyId}/users/${id}/mfa/reset`);
        makeToast("success", "Duplo fator desativado para este usuário");
        loadUsers();
      },
    });
  }

  // ORD-095: mais estreito que resetUserMfa acima — revoga só os
  // dispositivos confiáveis (ex: notebook perdido), sem apagar o 2FA
  // configurado, então o usuário não precisa reconfigurar do zero.
  function revokeUserDevices(id: number) {
    if (!companyId) return;
    setConfirmState({
      message: "Remover o dispositivo confiável deste usuário? Ele precisará confirmar o duplo fator no próximo login.",
      onConfirm: async () => {
        setConfirmState(null);
        await api.delete(`/companies/${companyId}/users/${id}/trusted-devices`);
        makeToast("success", "Dispositivo confiável removido");
        loadUsers();
      },
    });
  }

  function openEditUser(u: User) {
    setEditingUserId(u.id);
    setUserNameDefault(u.name);
    setUserRole(u.role);
    setUserFormError("");
    setUserModalKey((k) => k + 1);
    setUserModalOpen(true);
  }

  function clearUserFilters() {
    setUserNameFilter("");
    setUserEmailFilter("");
    setUserRoleFilter("");
    setUserStatusFilter("active");
  }

  // Mesmo comportamento de seleção de empresa do SettingsScreen (ORD-082):
  // sem sessão ativa, o seletor abaixo permite escolher; com sessão ativa
  // (vinda desta tela ou de Config), os dados da empresa carregam direto.
  const companySelector = isPlatformAdmin && (
    <div className={styles.companySelector}>
      <Dropdown
        label="Empresa"
        placeholder="Selecionar empresa…"
        value={companyOptions.find((o) => o.value === String(companyId ?? "")) ?? null}
        onValueSelected={(opt) => setSelectedCompany(Number(opt.value))}
        options={companyOptions}
      />
    </div>
  );

  if (!companyId) {
    return (
      <div className={styles.page}>
        <div className={styles.title}>Empresa</div>
        {companySelector}
        <div className={styles.empty}>
          {isPlatformAdmin
            ? "Selecione uma empresa para gerenciar usuários, terminais e pagamento."
            : "Nenhuma empresa associada à sua conta."}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.title}>Empresa</div>
      {companySelector}

      <div className={styles.tabs}>
        <Tabs activeTab={tab} onSelectTab={(v) => setTab(v as "terminals" | "users" | "payment" | "plan" | "fiscal")}>
          {[
            <Tab key="users" value="users" label="Usuários" />,
            <Tab key="terminals" value="terminals" label="Terminais" />,
            <Tab key="payment" value="payment" label="Pagamento" />,
            <Tab key="plan" value="plan" label="Plano" />,
            // ORD-168 — cadastro fiscal é assistido pelo time Ordin, não
            // self-service do owner (docs/stories/ORD-168-*.md): aba some
            // inteira pra owner/manager, não só o endpoint bloqueia. Um
            // único array como children (em vez de "&&" entre <Tab> soltos)
            // — Tabs tipa children como ReactElement<TabProps> | [], não
            // aceita boolean|Element misturado entre elementos individuais.
            ...(isPlatformAdmin ? [<Tab key="fiscal" value="fiscal" label="Fiscal" />] : []),
          ]}
        </Tabs>
      </div>

      {/* ── Terminais ── */}
      {tab === "terminals" && (
        <>
          {errTerminals && (
            <div className={styles.errorRow}>
              <span className={styles.muted}>{errTerminals}</span>
              <Button size="small" variant="secondary" onClick={loadTerminals}>Tentar novamente</Button>
            </div>
          )}

          <div className={styles.filterBar}>
            <InputBase
              label="Terminal"
              placeholder="Buscar por nome…"
              value={terminalNameFilter}
              onChange={(e) => setTerminalNameFilter(e.target.value)}
            />
            <Dropdown
              label="Ambiente"
              value={ENVIRONMENT_FILTER_OPTIONS.find((o) => o.value === terminalEnvironmentFilter) ?? ENVIRONMENT_FILTER_OPTIONS[0]}
              onValueSelected={(opt) => setTerminalEnvironmentFilter(opt.value)}
              options={ENVIRONMENT_FILTER_OPTIONS}
            />
            <Dropdown
              label="Status"
              value={STATUS_FILTER_OPTIONS.find((o) => o.value === terminalStatusFilter) ?? STATUS_FILTER_OPTIONS[0]}
              onValueSelected={(opt) => setTerminalStatusFilter(opt.value as StatusFilter)}
              options={STATUS_FILTER_OPTIONS}
            />
            <Button type="button" variant="secondary" onClick={clearTerminalFilters}>Limpar filtros</Button>
            <Button type="button" onClick={openNewTerminal}>+ Novo terminal</Button>
          </div>

          <Table
            variant="compact"
            rowKey={(t) => t.id}
            emptyMessage="Nenhum terminal encontrado."
            columns={[
              {
                key: "label", header: "Terminal", render: (t) => (
                  <>
                    <strong>{t.label}</strong>
                    {t.terminal_code && <span className={styles.itemMeta}>#{t.terminal_code}</span>}
                  </>
                ),
              },
              { key: "environment", header: "Ambiente", render: (t) => t.environment ?? "—" },
              {
                key: "mp_device_id", header: "MP Device ID", mono: true,
                render: (t) => t.mp_device_id || <span className={styles.muted}>—</span>,
              },
              {
                key: "mp_mode", header: "Modo PDV", render: (t) => {
                  if (!t.mp_device_id) return <span className={styles.muted}>—</span>;
                  const mode = mpOperatingModes[t.mp_device_id];
                  if (mode === "PDV") return <Tag variant="success">PDV</Tag>;
                  if (mode == null) return <span className={styles.muted}>—</span>;
                  return (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Tag variant="warning">{mode}</Tag>
                      <Button size="small" variant="secondary" onClick={() => fixOperatingMode(t.mp_device_id!)}>
                        Corrigir
                      </Button>
                    </div>
                  );
                },
              },
              {
                key: "status", header: "Status",
                render: (t) => <Tag variant={t.active ? "success" : "error"}>{t.active ? "Ativo" : "Inativo"}</Tag>,
              },
              {
                key: "action", header: "", render: (t) => (
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <Button size="small" variant="secondary" onClick={() => openEditTerminal(t)}>Editar</Button>
                    {t.active ? (
                      <Button size="small" variant="secondary" onClick={() => deactivateTerminal(t.id)}>Desativar</Button>
                    ) : (
                      <Button size="small" variant="secondary" onClick={() => reactivateTerminal(t.id)}>Reativar</Button>
                    )}
                  </div>
                ),
              },
            ]}
            rows={terminals}
          />

          <Modal
            open={terminalModalOpen}
            width={480}
            onClose={() => setTerminalModalOpen(false)}
            onBackdropClick={() => setTerminalModalOpen(false)}
            onCloseButtonClick={() => setTerminalModalOpen(false)}
          >
            <form key={terminalModalKey} onSubmit={saveTerminal} className={styles.modalForm}>
              <div className={styles.formTitle}>{editingTerminalId === null ? "Novo terminal" : "Editar terminal"}</div>
              {terminalFormError && <Alert variant="error" text={terminalFormError} fullWidth />}
              <InputBase
                label="Rótulo"
                placeholder="ex: Caixa 2"
                defaultValue={terminalDefaults.label}
                ref={terminalLabelRef}
                autoFocus
                required
              />
              <Dropdown
                label="Ambiente"
                value={ENVIRONMENT_OPTIONS.find((o) => o.value === terminalEnvironment) ?? null}
                onValueSelected={(opt) => setTerminalEnvironment(opt.value)}
                options={ENVIRONMENT_OPTIONS}
              />
              {mpManualMode ? (
                <InputBase
                  label="MP Device ID"
                  placeholder="PAX_A910__SMARTPOS..."
                  defaultValue={terminalDefaults.mp_device_id}
                  ref={terminalMpDeviceRef}
                />
              ) : mpTerminalsStatus === "not_configured" ? (
                <Alert
                  variant="warning"
                  fullWidth
                  text="Configure o Mercado Pago em Pagamentos antes de vincular um terminal Point."
                />
              ) : mpTerminalsStatus === "error" ? (
                <>
                  <Alert
                    variant="error"
                    fullWidth
                    text="Não foi possível consultar os terminais do Mercado Pago."
                  />
                  <div className={styles.formActions}>
                    <Button type="button" variant="secondary" onClick={() => fetchMpTerminals(editingTerminalId)}>
                      Tentar novamente
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => setMpManualMode(true)}>
                      Digitar manualmente
                    </Button>
                  </div>
                </>
              ) : (
                <Dropdown
                  label="MP Device ID"
                  value={mpTerminalOptions.find((o) => o.value === mpDeviceId) ?? null}
                  onValueSelected={(opt) => setMpDeviceId(opt.value)}
                  options={mpTerminalOptions}
                  loading={mpTerminalsStatus === "loading"}
                  emptyMessage="Nenhum terminal Point disponível nesta conta Mercado Pago"
                />
              )}
              <div className={styles.formActions}>
                <Button type="submit" loading={terminalSaving} disabled={terminalSaving}>Salvar</Button>
                <Button type="button" variant="secondary" onClick={() => setTerminalModalOpen(false)}>Cancelar</Button>
              </div>
            </form>
          </Modal>
        </>
      )}

      {/* ── Usuários ── */}
      {tab === "users" && (
        <>
          {errUsers && (
            <div className={styles.errorRow}>
              <span className={styles.muted}>{errUsers}</span>
              <Button size="small" variant="secondary" onClick={loadUsers}>Tentar novamente</Button>
            </div>
          )}
          <div className={styles.filterBar}>
            <InputBase label="Nome" value={userNameFilter} onChange={(e) => setUserNameFilter(e.target.value)} />
            <InputBase label="E-mail" value={userEmailFilter} onChange={(e) => setUserEmailFilter(e.target.value)} />
            <Dropdown
              label="Papel"
              value={ROLE_FILTER_OPTIONS.find((o) => o.value === userRoleFilter) ?? ROLE_FILTER_OPTIONS[0]}
              onValueSelected={(opt) => setUserRoleFilter(opt.value)}
              options={ROLE_FILTER_OPTIONS}
            />
            <Dropdown
              label="Status"
              value={STATUS_FILTER_OPTIONS.find((o) => o.value === userStatusFilter) ?? STATUS_FILTER_OPTIONS[0]}
              onValueSelected={(opt) => setUserStatusFilter(opt.value as StatusFilter)}
              options={STATUS_FILTER_OPTIONS}
            />
            <Button type="button" variant="secondary" onClick={clearUserFilters}>Limpar filtros</Button>
            <Button type="button" onClick={openNewUser}>+ Novo usuário</Button>
          </div>

          <Modal
            open={userModalOpen}
            width={480}
            onClose={() => setUserModalOpen(false)}
            onBackdropClick={() => setUserModalOpen(false)}
            onCloseButtonClick={() => setUserModalOpen(false)}
          >
            <form key={userModalKey} onSubmit={saveUser} className={styles.modalForm}>
              <div className={styles.formTitle}>{editingUserId === null ? "Novo usuário" : "Editar usuário"}</div>
              {editingUserId === null && (
                <div className={styles.formHint}>
                  Sem senha aqui — o convidado recebe um e-mail com um link para definir a própria senha.
                </div>
              )}
              {userFormError && <Alert variant="error" text={userFormError} fullWidth />}
              <InputBase
                label="Nome completo"
                defaultValue={userNameDefault}
                ref={userNameRef}
                autoFocus
                required
              />
              {editingUserId === null && (
                <InputBase
                  label="E-mail"
                  type="email"
                  ref={userEmailRef}
                  required
                />
              )}
              <Dropdown
                label="Papel"
                value={ROLE_OPTIONS.find((o) => o.value === userRole) ?? null}
                onValueSelected={(opt) => setUserRole(opt.value as Role)}
                options={ROLE_OPTIONS}
              />
              <div className={styles.formActions}>
                <Button type="submit" loading={userSaving} disabled={userSaving}>Salvar</Button>
                <Button type="button" variant="secondary" onClick={() => setUserModalOpen(false)}>Cancelar</Button>
              </div>
            </form>
          </Modal>

          {loadingUsers ? (
            <div className={styles.muted}>Carregando…</div>
          ) : (
            <Table
              variant="compact"
              rowKey={(u) => u.id}
              emptyMessage="Nenhum usuário encontrado."
              columns={[
                { key: "name", header: "Nome", render: (u) => u.name },
                { key: "email", header: "E-mail", render: (u) => u.email },
                { key: "role", header: "Papel", render: (u) => <Tag variant="neutral">{ROLE_LABELS[u.role] ?? u.role}</Tag> },
                {
                  key: "status", header: "Status", render: (u) => (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Tag variant={u.active ? "success" : "error"}>{u.active ? "Ativo" : "Inativo"}</Tag>
                      {u.pending_setup && <Tag variant="warning">Convite pendente</Tag>}
                      {u.mfa_enabled && <Tag variant="neutral">2FA ativo</Tag>}
                    </div>
                  ),
                },
                {
                  key: "action", header: "", render: (u) => (
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <Button size="small" variant="secondary" onClick={() => openEditUser(u)}>Editar</Button>
                      {u.pending_setup && (
                        <Button size="small" variant="secondary" onClick={() => resendInvite(u.id)}>Reenviar convite</Button>
                      )}
                      {u.active && !u.pending_setup && (
                        <Button size="small" variant="secondary" onClick={() => sendPasswordReset(u.id)}>Enviar redefinição de senha</Button>
                      )}
                      {u.mfa_enabled && (
                        <Button size="small" variant="secondary" onClick={() => resetUserMfa(u.id)}>Desativar 2FA</Button>
                      )}
                      {u.has_trusted_device && (
                        <Button size="small" variant="secondary" onClick={() => revokeUserDevices(u.id)}>Remover dispositivo confiável</Button>
                      )}
                      {u.active ? (
                        <Button size="small" variant="secondary" onClick={() => deactivateUser(u.id)}>Desativar</Button>
                      ) : (
                        <Button size="small" variant="secondary" onClick={() => reactivateUser(u.id)}>Reativar</Button>
                      )}
                    </div>
                  ),
                },
              ]}
              rows={users}
            />
          )}
        </>
      )}

      {/* ── Pagamento ── */}
      {tab === "payment" && <PaymentTab companyId={companyId} />}
      {tab === "plan" && <PlanTab companyId={companyId} />}
      {tab === "fiscal" && isPlatformAdmin && <FiscalTab companyId={companyId} />}

      <ConfirmDialog
        open={!!confirmState}
        message={confirmState?.message ?? ""}
        onConfirm={() => confirmState?.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
