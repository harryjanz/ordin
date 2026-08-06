import { useState, useEffect, FormEvent } from "react";
import api from "../api";
import { useStore } from "../store";
import type { Terminal, User, Role, PaymentConfig } from "../types";

const S = {
  page: { padding: 32, color: "var(--a-text)" } as React.CSSProperties,
  title: { fontSize: 22, fontWeight: 700, marginBottom: 24 } as React.CSSProperties,
  tabs: { display: "flex", gap: 0, marginBottom: 24, borderBottom: "1px solid rgba(153,0,255,0.2)" } as React.CSSProperties,
  tab: (active: boolean) => ({
    padding: "8px 20px",
    background: "transparent",
    border: "none",
    borderBottom: active ? "2px solid #9900ff" : "2px solid transparent",
    color: active ? "#9900ff" : "rgba(var(--a-text-rgb),0.5)",
    fontSize: 14,
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
  } as React.CSSProperties),
  item: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "var(--a-surface)",
    border: "1px solid rgba(153,0,255,0.15)",
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 8,
    fontSize: 14,
    gap: 8,
  } as React.CSSProperties,
  badge: (active: boolean) => ({
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 4,
    background: active ? "rgba(51,204,204,0.15)" : "rgba(255,77,109,0.15)",
    color: active ? "#33cccc" : "#ff4d6d",
    marginLeft: 8,
  } as React.CSSProperties),
  form: {
    background: "var(--a-surface)",
    border: "1px solid rgba(153,0,255,0.2)",
    borderRadius: 10,
    padding: "16px 20px",
    marginBottom: 20,
  } as React.CSSProperties,
  input: {
    width: "100%",
    padding: "8px 12px",
    background: "rgba(153,0,255,0.08)",
    border: "1px solid rgba(153,0,255,0.25)",
    borderRadius: 6,
    color: "var(--a-text)",
    fontSize: 14,
    marginBottom: 8,
    outline: "none",
    boxSizing: "border-box" as const,
  } as React.CSSProperties,
  inputSmall: {
    padding: "5px 10px",
    background: "rgba(153,0,255,0.08)",
    border: "1px solid rgba(153,0,255,0.25)",
    borderRadius: 6,
    color: "var(--a-text)",
    fontSize: 12,
    outline: "none",
    width: 180,
  } as React.CSSProperties,
  select: {
    width: "100%",
    padding: "8px 12px",
    background: "rgba(153,0,255,0.08)",
    border: "1px solid rgba(153,0,255,0.25)",
    borderRadius: 6,
    color: "var(--a-text)",
    fontSize: 14,
    marginBottom: 8,
    outline: "none",
  } as React.CSSProperties,
  addBtn: {
    padding: "8px 16px",
    background: "#9900ff",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 13,
    cursor: "pointer",
  } as React.CSSProperties,
  saveSmallBtn: {
    padding: "5px 12px",
    background: "#9900ff",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
    flexShrink: 0,
  } as React.CSSProperties,
  dangerBtn: {
    padding: "4px 10px",
    background: "rgba(255,77,109,0.15)",
    border: "none",
    borderRadius: 4,
    color: "#ff4d6d",
    fontSize: 12,
    cursor: "pointer",
    flexShrink: 0,
  } as React.CSSProperties,
};

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

  async function handleDelete(id: number) {
    if (!confirm("Remover esta configuração?")) return;
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
        <div style={{ color: "rgba(var(--a-text-rgb),0.4)", fontSize: 14 }}>Carregando…</div>
      ) : err ? (
        <div style={{ color: "#ff4d6d", fontSize: 14 }}>{err}</div>
      ) : configs.length === 0 ? (
        <div style={{ color: "rgba(var(--a-text-rgb),0.35)", fontSize: 14, marginBottom: 20 }}>
          Nenhuma configuração de pagamento cadastrada.
        </div>
      ) : (
        <div style={{ marginBottom: 20 }}>
          {configs.map((c) => {
            const def = PROVIDERS[c.provider] ?? { label: c.provider, fields: [] };
            const lines = credentialLines(c, def);
            return (
              <div key={c.id} style={{
                ...S.item,
                flexDirection: "column",
                alignItems: "stretch",
                border: c.active
                  ? "1px solid rgba(93,212,144,0.4)"
                  : "1px solid rgba(153,0,255,0.15)",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600 }}>{def.label}</span>
                    <span style={{
                      fontSize: 11, padding: "2px 8px", borderRadius: 4,
                      background: c.environment === "production" ? "rgba(245,158,11,0.15)" : "rgba(51,204,204,0.12)",
                      color: c.environment === "production" ? "#f59e0b" : "#33cccc",
                    }}>
                      {envLabel[c.environment] ?? c.environment}
                    </span>
                    <span style={{
                      fontSize: 11, padding: "2px 8px", borderRadius: 4,
                      background: c.active ? "rgba(93,212,144,0.15)" : "rgba(153,153,153,0.1)",
                      color: c.active ? "#5DD490" : "rgba(var(--a-text-rgb),0.35)",
                      fontWeight: c.active ? 600 : 400,
                    }}>
                      {c.active ? "● Ativa" : "○ Inativa"}
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {!c.active && (
                      <button
                        style={{ ...S.saveSmallBtn, background: "#5DD490", color: "#0a0a0f" }}
                        onClick={() => handleActivate(c.id)}
                      >
                        Ativar
                      </button>
                    )}
                    {def.fields.length > 0 && (
                      <button style={S.saveSmallBtn} onClick={() => openEdit(c.id)}>
                        Editar credenciais
                      </button>
                    )}
                    <button style={S.dangerBtn} onClick={() => handleDelete(c.id)}>Remover</button>
                  </div>
                </div>

                {lines.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "rgba(var(--a-text-rgb),0.35)", fontFamily: "monospace" }}>
                    {lines.join("  ·  ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal inline de edição */}
      {editId !== null && editDef && (
        <form onSubmit={handleEdit} style={{ ...S.form, marginBottom: 20, borderColor: "rgba(153,0,255,0.4)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
            Editar credenciais — {editDef.label}
          </div>
          {editDef.fields.map((f) => (
            <div key={f.key}>
              <div style={{ fontSize: 12, color: "rgba(var(--a-text-rgb),0.5)", marginBottom: 3 }}>{f.label}</div>
              <input
                style={S.input}
                type={f.type}
                placeholder={`Novo valor (deixe em branco para manter atual)`}
                value={editValues[f.key] ?? ""}
                onChange={(e) => setEditValues((v) => ({ ...v, [f.key]: e.target.value }))}
                autoComplete="new-password"
                autoFocus={f === editDef.fields[0]}
              />
            </div>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={S.addBtn}
              type="submit"
              disabled={editSaving || Object.values(editValues).every((v) => !v.trim())}
            >
              {editSaving ? "Salvando…" : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => setEditId(null)}
              style={{ ...S.dangerBtn, padding: "8px 14px" }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Formulário de nova config */}
      <form onSubmit={handleAdd} style={S.form}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Nova configuração</div>
        <div style={{ fontSize: 12, color: "rgba(var(--a-text-rgb),0.4)", marginBottom: 12 }}>
          A configuração começa inativa. Clique em "Ativar" para usá-la.
        </div>

        <select
          style={S.select}
          value={provider}
          onChange={(e) => { setProvider(e.target.value); setFieldValues({}); }}
        >
          {Object.entries(PROVIDERS).map(([key, def]) => (
            <option key={key} value={key}>{def.label}</option>
          ))}
        </select>

        <select
          style={S.select}
          value={environment}
          onChange={(e) => setEnvironment(e.target.value)}
        >
          <option value="sandbox">Sandbox</option>
          <option value="production">Produção</option>
        </select>

        {providerDef.fields.map((f) => (
          <div key={f.key}>
            <div style={{ fontSize: 12, color: "rgba(var(--a-text-rgb),0.5)", marginBottom: 3 }}>
              {f.label}{f.required ? "" : " (opcional)"}
            </div>
            <input
              style={S.input}
              type={f.type}
              placeholder={f.placeholder}
              value={fieldValues[f.key] ?? ""}
              onChange={(e) => setFieldValues((v) => ({ ...v, [f.key]: e.target.value }))}
              autoComplete="new-password"
            />
          </div>
        ))}

        {providerDef.note && (
          <div style={{ fontSize: 12, color: "rgba(var(--a-text-rgb),0.4)", marginBottom: 8, fontStyle: "italic" }}>
            {providerDef.note}
          </div>
        )}

        <button style={S.addBtn} type="submit" disabled={saving || !isAddValid()}>
          {saving ? "Salvando…" : "Adicionar configuração"}
        </button>
      </form>

      {msg && (
        <div style={{ marginTop: 12, fontSize: 13, color: msg.ok ? "#5DD490" : "#ff6b5b" }}>{msg.text}</div>
      )}
    </div>
  );
}

// ── CompanyScreen ─────────────────────────────────────────────────────────────

export default function CompanyScreen() {
  const companyId = useStore((s) => s.selectedCompanyId ?? s.companyId);
  const [tab, setTab] = useState<"terminals" | "users" | "payment">("terminals");

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

  async function deleteTerminal(id: number) {
    if (!companyId || !confirm("Excluir terminal?")) return;
    await api.delete(`/companies/${companyId}/terminals/${id}`);
    loadTerminals();
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

  async function deleteUser(id: number) {
    if (!companyId || !confirm("Excluir usuário?")) return;
    await api.delete(`/companies/${companyId}/users/${id}`);
    loadUsers();
  }

  if (!companyId) {
    return (
      <div style={S.page}>
        <div style={{ color: "rgba(var(--a-text-rgb),0.4)" }}>Selecione uma empresa no Dashboard.</div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.title}>Empresa</div>

      <div style={S.tabs}>
        <button style={S.tab(tab === "terminals")} onClick={() => setTab("terminals")}>Terminais</button>
        <button style={S.tab(tab === "users")} onClick={() => setTab("users")}>Usuários</button>
        <button style={S.tab(tab === "payment")} onClick={() => setTab("payment")}>Pagamento</button>
      </div>

      {/* ── Terminais ── */}
      {tab === "terminals" && (
        <>
          {errTerminals && (
            <div style={{ color: "#ff4d6d", marginBottom: 12, fontSize: 14 }}>
              {errTerminals}{" "}
              <button onClick={loadTerminals} style={{ background: "none", border: "none", color: "#9900ff", cursor: "pointer", fontSize: 13 }}>Tentar novamente</button>
            </div>
          )}
          <form style={S.form} onSubmit={addTerminal}>
            <input
              style={S.input}
              placeholder="Rótulo do terminal (ex: Caixa 2)"
              value={newTerminal}
              onChange={(e) => setNewTerminal(e.target.value)}
            />
            <button style={S.addBtn} type="submit">Adicionar terminal</button>
          </form>

          {terminals.map((t) => (
            <div key={t.id} style={{ ...S.item, flexDirection: "column", alignItems: "stretch" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>
                  <strong style={{ fontFamily: "monospace", marginRight: 8, color: "#9900ff" }}>#{t.id}</strong>
                  {t.label}
                  <span style={S.badge(t.active)}>{t.active ? "ativo" : "inativo"}</span>
                  {t.environment && (
                    <span style={{ fontSize: 11, color: "rgba(var(--a-text-rgb),0.35)", marginLeft: 8 }}>
                      {t.environment}
                    </span>
                  )}
                </span>
                <button style={S.dangerBtn} onClick={() => deleteTerminal(t.id)}>Excluir</button>
              </div>

              {/* MP Device ID */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 12, color: "rgba(var(--a-text-rgb),0.45)", flexShrink: 0 }}>MP Device ID:</span>
                <input
                  style={S.inputSmall}
                  placeholder="PAX_A910__SMARTPOS..."
                  value={mpEdits[t.id] ?? ""}
                  onChange={(e) => setMpEdits((m) => ({ ...m, [t.id]: e.target.value }))}
                />
                <button
                  style={S.saveSmallBtn}
                  onClick={() => saveMpDevice(t.id)}
                  disabled={mpSaving[t.id]}
                >
                  {mpSaving[t.id] ? "…" : "Salvar"}
                </button>
                {mpMsg[t.id] && (
                  <span style={{ fontSize: 12, color: mpMsg[t.id] === "Salvo!" ? "#5DD490" : "#ff6b5b" }}>
                    {mpMsg[t.id]}
                  </span>
                )}
              </div>
            </div>
          ))}
          {terminals.length === 0 && (
            <div style={{ color: "rgba(var(--a-text-rgb),0.35)", fontSize: 14 }}>Nenhum terminal cadastrado.</div>
          )}
        </>
      )}

      {/* ── Usuários ── */}
      {tab === "users" && (
        <>
          {errUsers && (
            <div style={{ color: "#ff4d6d", marginBottom: 12, fontSize: 14 }}>
              {errUsers}{" "}
              <button onClick={loadUsers} style={{ background: "none", border: "none", color: "#9900ff", cursor: "pointer", fontSize: 13 }}>Tentar novamente</button>
            </div>
          )}
          <form style={S.form} onSubmit={addUser}>
            <input style={S.input} placeholder="Nome completo" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
            <input style={S.input} placeholder="E-mail" type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
            <input style={S.input} placeholder="Senha" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            <select
              style={S.select}
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value as Role })}
            >
              <option value="cashier">Caixa</option>
              <option value="manager">Gerente</option>
              <option value="owner">Owner</option>
            </select>
            <button style={S.addBtn} type="submit">Criar usuário</button>
          </form>

          {users.map((u) => (
            <div key={u.id} style={S.item}>
              <span>
                {u.name}
                <span style={{ color: "rgba(var(--a-text-rgb),0.4)", marginLeft: 8, fontSize: 12 }}>{u.email}</span>
                <span style={S.badge(u.active)}>{u.role}</span>
              </span>
              <button style={S.dangerBtn} onClick={() => deleteUser(u.id)}>Excluir</button>
            </div>
          ))}
          {users.length === 0 && (
            <div style={{ color: "rgba(var(--a-text-rgb),0.35)", fontSize: 14 }}>Nenhum usuário cadastrado.</div>
          )}
        </>
      )}

      {/* ── Pagamento ── */}
      {tab === "payment" && <PaymentTab companyId={companyId} />}
    </div>
  );
}
