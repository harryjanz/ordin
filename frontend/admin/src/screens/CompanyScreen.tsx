import { useState, useEffect, FormEvent } from "react";
import { Button, Dropdown, InputBase, Tab, Tabs, Tag, type DropdownOptions } from "design-system";
import api from "../api";
import ConfirmDialog from "../components/ConfirmDialog";
import { useStore } from "../store";
import type { Terminal, User, Role, PaymentConfig } from "../types";
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
  const isPlatformAdmin = role === "superadmin" || role === "admin";
  const companyId = useStore((s) => s.selectedCompanyId ?? s.companyId);
  const [tab, setTab] = useState<"terminals" | "users" | "payment">("terminals");

  // ORD-082: nome da empresa selecionada, só pra mostrar de qual empresa
  // esta tela está falando (superadmin/admin gerenciam qualquer uma) — sem
  // isso não tem como confirmar visualmente que a seleção feita em outra
  // tela (ex: Configurações) realmente carregou aqui.
  const [companyName, setCompanyName] = useState<string | null>(null);
  useEffect(() => {
    if (!isPlatformAdmin || !companyId) { setCompanyName(null); return; }
    api.get(`/companies/${companyId}`).then((r) => setCompanyName(r.data.name ?? null)).catch(() => null);
  }, [isPlatformAdmin, companyId]);

  // ── Terminals ─────────────────────────────────────────────────────────────
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [newTerminal, setNewTerminal] = useState("");
  const [errTerminals, setErrTerminals] = useState<string | null>(null);
  const [mpEdits, setMpEdits] = useState<Record<number, string>>({});
  const [mpSaving, setMpSaving] = useState<Record<number, boolean>>({});
  const [mpMsg, setMpMsg] = useState<Record<number, string>>({});

  // ── Users ─────────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<User[]>([]);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "cashier" as Role });
  const [errUsers, setErrUsers] = useState<string | null>(null);

  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    if (!companyId) return;
    loadTerminals();
    loadUsers();
  }, [companyId]);

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
    try {
      const r = await api.get(`/companies/${companyId}/users`);
      setUsers(r.data.users ?? r.data);
      setErrUsers(null);
    } catch {
      setErrUsers("Erro ao carregar usuários.");
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
    if (!companyId || !newUser.name || !newUser.email || !newUser.password) return;
    await api.post(`/companies/${companyId}/users`, newUser);
    setNewUser({ name: "", email: "", password: "", role: "cashier" });
    loadUsers();
  }

  function deleteUser(id: number) {
    if (!companyId) return;
    setConfirmState({
      message: "Excluir usuário?",
      onConfirm: async () => {
        setConfirmState(null);
        await api.delete(`/companies/${companyId}/users/${id}`);
        loadUsers();
      },
    });
  }

  if (!companyId) {
    return (
      <div className={styles.page}>
        <div className={styles.muted}>Selecione uma empresa no Dashboard ou em Configurações.</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.title}>Empresa</div>
      {isPlatformAdmin && companyName && <div className={styles.subtitle}>{companyName}</div>}

      <div className={styles.tabs}>
        <Tabs activeTab={tab} onSelectTab={(v) => setTab(v as "terminals" | "users" | "payment")}>
          <Tab value="terminals" label="Terminais" />
          <Tab value="users" label="Usuários" />
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
            <InputBase placeholder="Nome completo" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
            <InputBase placeholder="E-mail" type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
            <InputBase placeholder="Senha" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            <Dropdown
              value={ROLE_OPTIONS.find((o) => o.value === newUser.role) ?? null}
              onValueSelected={(opt) => setNewUser({ ...newUser, role: opt.value as Role })}
              options={ROLE_OPTIONS}
            />
            <div className={styles.formActions}>
              <Button type="submit">Criar usuário</Button>
            </div>
          </form>

          {users.map((u) => (
            <div key={u.id} className={styles.item}>
              <span>
                {u.name}
                <span className={styles.itemEmail}>{u.email}</span>
                <Tag variant={u.active ? "success" : "error"}>{u.role}</Tag>
              </span>
              <Button size="small" variant="secondary" onClick={() => deleteUser(u.id)}>Excluir</Button>
            </div>
          ))}
          {users.length === 0 && (
            <div className={styles.muted}>Nenhum usuário cadastrado.</div>
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
