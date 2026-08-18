import { useEffect, useRef, useState, FormEvent } from "react";
import { Button, Dropdown, InputBase, Tag, makeToast, type DropdownOptions } from "design-system";
import api from "../api";
import ConfirmDialog from "../components/ConfirmDialog";
import Table from "../components/Table";
import { useStore } from "../store";
import type { Role, User } from "../types";
// ORD-093: reaproveita o mesmo stylesheet do CompanyScreen (.form,
// .inviteUserRow, .filterBar, .editUserRow etc.) — clone estrutural da aba
// Usuários, sem duplicar classes CSS que já existem e são visualmente idênticas.
import styles from "./CompanyScreen.module.scss";

// ORD-093: CRUD separado, exclusivo pra superadmin/admin (equipe da própria
// Ordin) — nunca aparece misturado com o cadastro de usuários de empresa
// cliente (aba Usuários de /company).

const ROLE_LABELS: Record<string, string> = { superadmin: "Superadmin", admin: "Admin" };

type StatusFilter = "active" | "inactive" | "all";

const STATUS_FILTER_OPTIONS: DropdownOptions[] = [
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
  { value: "all", label: "Todos" },
];

export default function PlatformUsersScreen() {
  const role = useStore((s) => s.role);
  // Só superadmin cria/promove outro superadmin (ORD-093) — admin só
  // enxerga a própria opção no dropdown, evitando um 403 evitável na UI.
  const roleOptions: DropdownOptions[] = (
    role === "superadmin" ? ["superadmin", "admin"] : ["admin"]
  ).map((v) => ({ value: v, label: ROLE_LABELS[v] }));
  const roleFilterOptions: DropdownOptions[] = [{ value: "", label: "Todos" }, ...[
    { value: "superadmin", label: "Superadmin" },
    { value: "admin", label: "Admin" },
  ]];

  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [errUsers, setErrUsers] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({ name: "", email: "", role: roleOptions[roleOptions.length - 1].value as Role });
  const [nameFilter, setNameFilter] = useState("");
  const [emailFilter, setEmailFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [editUserId, setEditUserId] = useState<number | null>(null);
  const [editUserValues, setEditUserValues] = useState({ name: "", role: "admin" as Role });
  const [editUserSaving, setEditUserSaving] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();
  const isFirstRender = useRef(true);
  const requestId = useRef(0);
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);

  async function loadUsers() {
    const thisRequest = ++requestId.current;
    setLoadingUsers(true);
    try {
      const r = await api.get("/platform-users", {
        params: {
          name: nameFilter || undefined,
          email: emailFilter || undefined,
          status: statusFilter,
        },
      });
      if (thisRequest !== requestId.current) return;
      let list: User[] = r.data.users ?? r.data;
      if (roleFilter) list = list.filter((u) => u.role === roleFilter);
      setUsers(list);
      setErrUsers(null);
    } catch {
      if (thisRequest !== requestId.current) return;
      setErrUsers("Erro ao carregar usuários.");
    } finally {
      if (thisRequest === requestId.current) setLoadingUsers(false);
    }
  }

  useEffect(() => {
    if (isFirstRender.current) return;
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => loadUsers(), 500);
    return () => clearTimeout(debounceTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameFilter, emailFilter]);

  useEffect(() => {
    loadUsers();
    isFirstRender.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter, statusFilter]);

  async function addUser(e: FormEvent) {
    e.preventDefault();
    if (!newUser.name || !newUser.email) return;
    try {
      await api.post("/platform-users", newUser);
      setNewUser({ ...newUser, name: "", email: "" });
      loadUsers();
    } catch (e: unknown) {
      const axErr = e as { response?: { data?: { detail?: string } } };
      makeToast("error", axErr?.response?.data?.detail ?? "Erro ao convidar usuário.");
    }
  }

  async function resendInvite(id: number) {
    await api.post(`/platform-users/${id}/resend-invite`);
    makeToast("success", "Convite reenviado");
  }

  async function sendPasswordReset(id: number) {
    await api.post(`/platform-users/${id}/send-password-reset`);
    makeToast("success", "E-mail de redefinição de senha enviado");
  }

  function deactivateUser(id: number) {
    setConfirmState({
      message: "Desativar usuário?",
      onConfirm: async () => {
        setConfirmState(null);
        await api.delete(`/platform-users/${id}`);
        loadUsers();
      },
    });
  }

  async function reactivateUser(id: number) {
    await api.put(`/platform-users/${id}`, { active: true });
    loadUsers();
  }

  function resetUserMfa(id: number) {
    setConfirmState({
      message: "Desativar o duplo fator deste usuário? Ele voltará a entrar só com e-mail e senha.",
      onConfirm: async () => {
        setConfirmState(null);
        await api.post(`/platform-users/${id}/mfa/reset`);
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
    if (editUserId === null) return;
    setEditUserSaving(true);
    try {
      await api.put(`/platform-users/${editUserId}`, editUserValues);
      setEditUserId(null);
      loadUsers();
    } catch (e: unknown) {
      const axErr = e as { response?: { data?: { detail?: string } } };
      makeToast("error", axErr?.response?.data?.detail ?? "Erro ao salvar.");
    } finally {
      setEditUserSaving(false);
    }
  }

  function clearFilters() {
    setNameFilter("");
    setEmailFilter("");
    setRoleFilter("");
    setStatusFilter("active");
  }

  return (
    <div className={styles.page}>
      <div className={styles.title}>Usuários da plataforma</div>

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
            value={roleOptions.find((o) => o.value === newUser.role) ?? null}
            onValueSelected={(opt) => setNewUser({ ...newUser, role: opt.value as Role })}
            options={roleOptions}
          />
          <Button type="submit">Convidar usuário</Button>
        </div>
      </form>

      <div className={styles.filterBar}>
        <InputBase label="Nome" value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} />
        <InputBase label="E-mail" value={emailFilter} onChange={(e) => setEmailFilter(e.target.value)} />
        <Dropdown
          label="Papel"
          value={roleFilterOptions.find((o) => o.value === roleFilter) ?? roleFilterOptions[0]}
          onValueSelected={(opt) => setRoleFilter(opt.value)}
          options={roleFilterOptions}
        />
        <Dropdown
          label="Status"
          value={STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter) ?? STATUS_FILTER_OPTIONS[0]}
          onValueSelected={(opt) => setStatusFilter(opt.value as StatusFilter)}
          options={STATUS_FILTER_OPTIONS}
        />
        <Button type="button" variant="secondary" onClick={clearFilters}>Limpar filtros</Button>
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
              value={roleOptions.find((o) => o.value === editUserValues.role) ?? null}
              onValueSelected={(opt) => setEditUserValues((v) => ({ ...v, role: opt.value as Role }))}
              options={roleOptions}
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
          emptyMessage="Nenhum usuário da plataforma encontrado."
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

      <ConfirmDialog
        open={!!confirmState}
        message={confirmState?.message ?? ""}
        onConfirm={() => confirmState?.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
