import { useState, useEffect, useRef, FormEvent } from "react";
import { Button, Dropdown, InputBase, Tab, Tabs, Tag, makeToast, type DropdownOptions } from "design-system";
import api from "../api";
import { listCompanies } from "../api/companies";
import ConfirmDialog from "../components/ConfirmDialog";
import Table from "../components/Table";
import { useStore } from "../store";
import type { Terminal, User, Role, PaymentConfig, Company } from "../types";
import styles from "./CompanyScreen.module.scss";

// ── Provider catalog ─────────────────────────────────────────────────────────
// Adicionar novo provider: inserir entrada aqui. O formulário e a listagem
// são gerados automaticamente a partir desta estrutura.

type FieldKey = "api_key" | "api_secret" | `extra_config.${string}`;

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

const ENVIRONMENT_OPTIONS: DropdownOptions[] = [
  { value: "sandbox", label: "Sandbox" },
  { value: "production", label: "Produção" },
];

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
      else if (f.key.startsWith("extra_config.")) {
        val = c.extra_config?.[f.key.slice("extra_config.".length)];
      }
      return val ? `${f.label}: ${val}` : null;
    })
    .filter((v): v is string => Boolean(v));
}

// ── PaymentTab ───────────────────────────────────────────────────────────────

interface PaymentTabProps {
  companyId: number;
}

function PaymentTab({ companyId }: PaymentTabProps) {
  const [configs, setConfigs] = useState<PaymentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // formulário de adição
  const [provider, setProvider] = useState("mercadopago");
  const [environment, setEnvironment] = useState("sandbox");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // modal de edição inline
  const [editId, setEditId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const providerDef = PROVIDERS[provider] ?? { label: provider, fields: [] };
  const editCfg = configs.find((c) => c.id === editId);
  const editDef = editCfg ? (PROVIDERS[editCfg.provider] ?? { label: editCfg.provider, fields: [] }) : null;

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

  function isAddValid() {
    return providerDef.fields
      .filter((f) => f.required)
      .every((f) => fieldValues[f.key]?.trim());
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(
        `/companies/${companyId}/payment-configs`,
        buildConfigPayload(provider, environment, fieldValues),
      );
      setFieldValues({});
      flash(true, "Configuração salva! Clique em Ativar para usá-la.");
      load();
    } catch (e: unknown) {
      const axErr = e as { response?: { data?: { detail?: string } } };
      flash(false, axErr?.response?.data?.detail ?? "Erro ao salvar.");
    } finally {
      setSaving(false);
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
      load();
    } catch {
      flash(false, "Erro ao ativar.");
    }
  }

  function openEdit(id: number) {
    setEditId(id);
    setEditValues({});
  }

  async function handleEdit(e: FormEvent) {
    e.preventDefault();
    if (!editId || !editCfg || !editDef) return;
    setEditSaving(true);
    try {
      await api.put(
        `/companies/${companyId}/payment-configs/${editId}`,
        buildConfigPayload(editCfg.provider, editCfg.environment, editValues),
      );
      setEditId(null);
      setEditValues({});
      flash(true, "Credenciais atualizadas!");
      load();
    } catch {
      flash(false, "Erro ao atualizar.");
    } finally {
      setEditSaving(false);
    }
  }

  const envLabel: Record<string, string> = { sandbox: "Sandbox", production: "Produção" };

  return (
    <div>
      {/* Configs existentes */}
      {loading ? (
        <div className={styles.muted}>Carregando…</div>
      ) : err ? (
        <div className={styles.muted}>{err}</div>
      ) : configs.length === 0 ? (
        <div className={styles.muted} style={{ marginBottom: 20 }}>
          Nenhuma configuração de pagamento cadastrada.
        </div>
      ) : (
        <div style={{ marginBottom: 20 }}>
          {configs.map((c) => {
            const def = PROVIDERS[c.provider] ?? { label: c.provider, fields: [] };
            const lines = credentialLines(c, def);
            return (
              <div
                key={c.id}
                className={`${styles.item} ${styles.configItem} ${c.active ? styles.configItemActive : ""}`}
              >
                <div className={styles.configHead}>
                  <div className={styles.configTags}>
                    <span className={styles.configLabel}>{def.label}</span>
                    <Tag variant={c.environment === "production" ? "warning" : "neutral"}>
                      {envLabel[c.environment] ?? c.environment}
                    </Tag>
                    <Tag variant={c.active ? "success" : "greyscale"}>
                      {c.active ? "● Ativa" : "○ Inativa"}
                    </Tag>
                  </div>

                  <div className={styles.configActions}>
                    {!c.active && (
                      <Button size="small" onClick={() => handleActivate(c.id)}>Ativar</Button>
                    )}
                    {def.fields.length > 0 && (
                      <Button size="small" variant="secondary" onClick={() => openEdit(c.id)}>
                        Editar credenciais
                      </Button>
                    )}
                    <Button size="small" variant="secondary" onClick={() => setConfirmDeleteId(c.id)}>Remover</Button>
                  </div>
                </div>

                {lines.length > 0 && (
                  <div className={styles.configLines}>{lines.join("  ·  ")}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal inline de edição */}
      {editId !== null && editDef && (
        <form onSubmit={handleEdit} className={styles.form}>
          <div className={styles.formTitle}>Editar credenciais — {editDef.label}</div>
          {editDef.fields.map((f) => (
            <InputBase
              key={f.key}
              label={f.label}
              type={f.type}
              placeholder="Novo valor (deixe em branco para manter atual)"
              value={editValues[f.key] ?? ""}
              onChange={(e) => setEditValues((v) => ({ ...v, [f.key]: e.target.value }))}
              autoComplete="new-password"
              autoFocus={f === editDef.fields[0]}
            />
          ))}
          <div className={styles.formActions}>
            <Button
              type="submit"
              loading={editSaving}
              disabled={editSaving || Object.values(editValues).every((v) => !v.trim())}
            >
              Salvar
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditId(null)}>Cancelar</Button>
          </div>
        </form>
      )}

      {/* Formulário de nova config */}
      <form onSubmit={handleAdd} className={styles.form}>
        <div className={styles.formTitle}>Nova configuração</div>
        <div className={styles.formHint}>
          A configuração começa inativa. Clique em "Ativar" para usá-la.
        </div>

        <Dropdown
          value={PROVIDER_OPTIONS.find((o) => o.value === provider) ?? null}
          onValueSelected={(opt) => { setProvider(opt.value); setFieldValues({}); }}
          options={PROVIDER_OPTIONS}
        />

        <Dropdown
          value={ENVIRONMENT_OPTIONS.find((o) => o.value === environment) ?? null}
          onValueSelected={(opt) => setEnvironment(opt.value)}
          options={ENVIRONMENT_OPTIONS}
        />

        {providerDef.fields.map((f) => (
          <InputBase
            key={f.key}
            label={`${f.label}${f.required ? "" : " (opcional)"}`}
            type={f.type}
            placeholder={f.placeholder}
            value={fieldValues[f.key] ?? ""}
            onChange={(e) => setFieldValues((v) => ({ ...v, [f.key]: e.target.value }))}
            autoComplete="new-password"
          />
        ))}

        {providerDef.note && (
          <div className={styles.configNote}>{providerDef.note}</div>
        )}

        <div className={styles.formActions}>
          <Button type="submit" loading={saving} disabled={saving || !isAddValid()}>
            Adicionar configuração
          </Button>
        </div>
      </form>

      {msg && (
        <div className={`${styles.flashMsg} ${msg.ok ? styles.flashOk : styles.flashErr}`}>{msg.text}</div>
      )}

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
  const [tab, setTab] = useState<"terminals" | "users" | "payment">("users");

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
  const [newTerminal, setNewTerminal] = useState("");
  const [errTerminals, setErrTerminals] = useState<string | null>(null);
  const [mpEdits, setMpEdits] = useState<Record<number, string>>({});
  const [mpSaving, setMpSaving] = useState<Record<number, boolean>>({});
  const [mpMsg, setMpMsg] = useState<Record<number, string>>({});

  // ── Users ─────────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "cashier" as Role });
  const [errUsers, setErrUsers] = useState<string | null>(null);
  const [userNameFilter, setUserNameFilter] = useState("");
  const [userEmailFilter, setUserEmailFilter] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState<StatusFilter>("active");
  const [editUserId, setEditUserId] = useState<number | null>(null);
  const [editUserValues, setEditUserValues] = useState({ name: "", role: "cashier" as Role });
  const [editUserSaving, setEditUserSaving] = useState(false);
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
  }, [companyId]);

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
    try {
      const r = await api.get(`/companies/${companyId}/terminals`);
      const list: Terminal[] = r.data.terminals ?? r.data;
      setTerminals(list);
      // inicializa edits com valores atuais
      const edits: Record<number, string> = {};
      list.forEach((t) => { edits[t.id] = t.mp_device_id ?? ""; });
      setMpEdits(edits);
      setErrTerminals(null);
    } catch {
      setErrTerminals("Erro ao carregar terminais.");
    }
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

  async function addTerminal(e: FormEvent) {
    e.preventDefault();
    if (!companyId || !newTerminal.trim()) return;
    await api.post(`/companies/${companyId}/terminals`, { label: newTerminal.trim() });
    setNewTerminal("");
    loadTerminals();
  }

  function deleteTerminal(id: number) {
    if (!companyId) return;
    setConfirmState({
      message: "Excluir terminal?",
      onConfirm: async () => {
        setConfirmState(null);
        await api.delete(`/companies/${companyId}/terminals/${id}`);
        loadTerminals();
      },
    });
  }

  async function saveMpDevice(terminalId: number) {
    if (!companyId) return;
    setMpSaving((s) => ({ ...s, [terminalId]: true }));
    try {
      await api.put(`/companies/${companyId}/terminals/${terminalId}`, {
        mp_device_id: mpEdits[terminalId] || null,
      });
      setMpMsg((m) => ({ ...m, [terminalId]: "Salvo!" }));
      setTimeout(() => setMpMsg((m) => ({ ...m, [terminalId]: "" })), 2000);
      loadTerminals();
    } catch {
      setMpMsg((m) => ({ ...m, [terminalId]: "Erro ao salvar." }));
    } finally {
      setMpSaving((s) => ({ ...s, [terminalId]: false }));
    }
  }

  async function addUser(e: FormEvent) {
    e.preventDefault();
    if (!companyId || !newUser.name || !newUser.email) return;
    await api.post(`/companies/${companyId}/users`, newUser);
    setNewUser({ name: "", email: "", role: "cashier" });
    loadUsers();
  }

  async function resendInvite(id: number) {
    if (!companyId) return;
    await api.post(`/companies/${companyId}/users/${id}/resend-invite`);
    makeToast("success", "Convite reenviado");
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

  function openEditUser(u: User) {
    setEditUserId(u.id);
    setEditUserValues({ name: u.name, role: u.role });
  }

  async function saveEditUser(e: FormEvent) {
    e.preventDefault();
    if (!companyId || editUserId === null) return;
    setEditUserSaving(true);
    try {
      await api.put(`/companies/${companyId}/users/${editUserId}`, editUserValues);
      setEditUserId(null);
      loadUsers();
    } finally {
      setEditUserSaving(false);
    }
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
        <Tabs activeTab={tab} onSelectTab={(v) => setTab(v as "terminals" | "users" | "payment")}>
          <Tab value="users" label="Usuários" />
          <Tab value="terminals" label="Terminais" />
          <Tab value="payment" label="Pagamento" />
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
          <form className={styles.form} onSubmit={addTerminal}>
            <InputBase
              placeholder="Rótulo do terminal (ex: Caixa 2)"
              value={newTerminal}
              onChange={(e) => setNewTerminal(e.target.value)}
            />
            <div className={styles.formActions}>
              <Button type="submit">Adicionar terminal</Button>
            </div>
          </form>

          {terminals.map((t) => (
            <div key={t.id} className={`${styles.item} ${styles.itemStack}`}>
              <div className={styles.itemHead}>
                <span>
                  <strong className={styles.itemId}>#{t.id}</strong>
                  {t.label}
                  <Tag variant={t.active ? "success" : "error"} removable={false}>
                    {t.active ? "ativo" : "inativo"}
                  </Tag>
                  {t.environment && <span className={styles.itemMeta}>{t.environment}</span>}
                </span>
                <Button size="small" variant="secondary" onClick={() => deleteTerminal(t.id)}>Excluir</Button>
              </div>

              {/* MP Device ID */}
              <div className={styles.mpRow}>
                <span className={styles.mpLabel}>MP Device ID:</span>
                <div className={styles.mpInput}>
                  <InputBase
                    placeholder="PAX_A910__SMARTPOS..."
                    value={mpEdits[t.id] ?? ""}
                    onChange={(e) => setMpEdits((m) => ({ ...m, [t.id]: e.target.value }))}
                  />
                </div>
                <Button size="small" loading={mpSaving[t.id]} onClick={() => saveMpDevice(t.id)}>
                  Salvar
                </Button>
                {mpMsg[t.id] && (
                  <span className={`${styles.mpMsg} ${mpMsg[t.id] === "Salvo!" ? styles.mpMsgOk : styles.mpMsgErr}`}>
                    {mpMsg[t.id]}
                  </span>
                )}
              </div>
            </div>
          ))}
          {terminals.length === 0 && (
            <div className={styles.muted}>Nenhum terminal cadastrado.</div>
          )}
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
          <form className={styles.form} onSubmit={addUser}>
            <div className={styles.formHint}>
              Sem senha aqui — o convidado recebe um e-mail com um link para definir a própria senha.
            </div>
            <div className={styles.inviteUserRow}>
              <InputBase label="Nome completo" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
              <InputBase label="E-mail" type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
              <Dropdown
                label="Papel"
                value={ROLE_OPTIONS.find((o) => o.value === newUser.role) ?? null}
                onValueSelected={(opt) => setNewUser({ ...newUser, role: opt.value as Role })}
                options={ROLE_OPTIONS}
              />
              <Button type="submit">Convidar usuário</Button>
            </div>
          </form>

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
          </div>

          {editUserId !== null && (
            <form onSubmit={saveEditUser} className={styles.form}>
              <div className={styles.formTitle}>Editar usuário</div>
              <div className={styles.editUserRow}>
                <InputBase
                  label="Nome completo"
                  value={editUserValues.name}
                  onChange={(e) => setEditUserValues((v) => ({ ...v, name: e.target.value }))}
                  autoFocus
                />
                <Dropdown
                  label="Papel"
                  value={ROLE_OPTIONS.find((o) => o.value === editUserValues.role) ?? null}
                  onValueSelected={(opt) => setEditUserValues((v) => ({ ...v, role: opt.value as Role }))}
                  options={ROLE_OPTIONS}
                />
                <div className={styles.formActions}>
                  <Button type="submit" loading={editUserSaving}>Salvar</Button>
                  <Button type="button" variant="secondary" onClick={() => setEditUserId(null)}>Cancelar</Button>
                </div>
              </div>
            </form>
          )}

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
                      {u.mfa_enabled && (
                        <Button size="small" variant="secondary" onClick={() => resetUserMfa(u.id)}>Desativar 2FA</Button>
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

      <ConfirmDialog
        open={!!confirmState}
        message={confirmState?.message ?? ""}
        onConfirm={() => confirmState?.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
