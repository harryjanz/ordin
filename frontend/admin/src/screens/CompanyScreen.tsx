import { useState, useEffect, FormEvent } from "react";
import api from "../api";
import { useStore } from "../store";
import type { Terminal, User, Role } from "../types";

const S = {
  page: { padding: 32, color: "#DFE8ED" } as React.CSSProperties,
  title: { fontSize: 22, fontWeight: 700, marginBottom: 24 } as React.CSSProperties,
  tabs: { display: "flex", gap: 0, marginBottom: 24, borderBottom: "1px solid rgba(153,0,255,0.2)" } as React.CSSProperties,
  tab: (active: boolean) => ({
    padding: "8px 20px",
    background: "transparent",
    border: "none",
    borderBottom: active ? "2px solid #9900ff" : "2px solid transparent",
    color: active ? "#9900ff" : "rgba(223,232,237,0.5)",
    fontSize: 14,
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
  } as React.CSSProperties),
  item: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#1d1434",
    border: "1px solid rgba(153,0,255,0.15)",
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 8,
    fontSize: 14,
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
    background: "#1d1434",
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
    color: "#DFE8ED",
    fontSize: 14,
    marginBottom: 8,
    outline: "none",
  } as React.CSSProperties,
  select: {
    width: "100%",
    padding: "8px 12px",
    background: "rgba(153,0,255,0.08)",
    border: "1px solid rgba(153,0,255,0.25)",
    borderRadius: 6,
    color: "#DFE8ED",
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
  dangerBtn: {
    padding: "4px 10px",
    background: "rgba(255,77,109,0.15)",
    border: "none",
    borderRadius: 4,
    color: "#ff4d6d",
    fontSize: 12,
    cursor: "pointer",
  } as React.CSSProperties,
};

export default function CompanyScreen() {
  const companyId = useStore((s) => s.selectedCompanyId ?? s.companyId);
  const [tab, setTab] = useState<"terminals" | "users">("terminals");
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [newTerminal, setNewTerminal] = useState("");
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "cashier" as Role });
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!companyId) return;
    loadTerminals();
    loadUsers();
  }, [companyId]);

  async function loadTerminals() {
    if (!companyId) return;
    const r = await api.get(`/companies/${companyId}/terminals`);
    setTerminals(r.data.terminals ?? r.data);
  }

  async function loadUsers() {
    if (!companyId) return;
    const r = await api.get(`/companies/${companyId}/users`);
    setUsers(r.data.users ?? r.data);
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

  async function regeneratePin() {
    if (!companyId || !confirm("Gerar novo PIN? O PIN atual será invalidado imediatamente.")) return;
    const r = await api.post(`/companies/${companyId}/regenerate-pin`);
    const pin = r.data.pin ?? r.data.new_pin;
    setMsg(`Novo PIN: ${pin} — anote antes de fechar.`);
  }

  if (!companyId) {
    return (
      <div style={S.page}>
        <div style={{ color: "rgba(223,232,237,0.4)" }}>Selecione uma empresa no Dashboard.</div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.title}>Empresa</div>

      {msg && (
        <div style={{
          background: "rgba(153,0,255,0.12)",
          border: "1px solid #9900ff",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 20,
          fontSize: 15,
          fontWeight: 600,
          color: "#DFE8ED",
        }}>
          {msg}
          <button
            onClick={() => setMsg("")}
            style={{ marginLeft: 16, background: "none", border: "none", color: "rgba(223,232,237,0.5)", cursor: "pointer", fontSize: 13 }}
          >
            Fechar
          </button>
        </div>
      )}

      <div style={S.tabs}>
        <button style={S.tab(tab === "terminals")} onClick={() => setTab("terminals")}>Terminais</button>
        <button style={S.tab(tab === "users")} onClick={() => setTab("users")}>Usuários</button>
      </div>

      {tab === "terminals" && (
        <>
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
            <div key={t.id} style={S.item}>
              <span>
                <strong style={{ fontFamily: "monospace", marginRight: 8, color: "#9900ff" }}>#{t.id}</strong>
                {t.label}
                <span style={S.badge(t.active)}>{t.active ? "ativo" : "inativo"}</span>
              </span>
              <button style={S.dangerBtn} onClick={() => deleteTerminal(t.id)}>Excluir</button>
            </div>
          ))}
          {terminals.length === 0 && (
            <div style={{ color: "rgba(223,232,237,0.35)", fontSize: 14 }}>Nenhum terminal cadastrado.</div>
          )}
        </>
      )}

      {tab === "users" && (
        <>
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
                <span style={{ color: "rgba(223,232,237,0.4)", marginLeft: 8, fontSize: 12 }}>{u.email}</span>
                <span style={S.badge(u.active)}>{u.role}</span>
              </span>
              <button style={S.dangerBtn} onClick={() => deleteUser(u.id)}>Excluir</button>
            </div>
          ))}
          {users.length === 0 && (
            <div style={{ color: "rgba(223,232,237,0.35)", fontSize: 14 }}>Nenhum usuário cadastrado.</div>
          )}
        </>
      )}
    </div>
  );
}
