import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, makeToast } from "design-system";
import api from "../api";
import ConfirmDialog from "../components/ConfirmDialog";
import Table, { type TableColumn } from "../components/Table";
import { formatCnpj } from "../lib/masks";
import { parseApiError } from "../lib/apiErrors";
import type { Supplier } from "../types";
import styles from "./SupplierListScreen.module.scss";

// ORD-182 (A6) — CRUD de fornecedores por empresa (superadmin/admin/owner/
// manager). Mesmo padrão de FiscalAddonPlanListScreen — lista/formulário
// dedicados, sem aba de tela existente pra consolidar (única tela do domínio
// "Estoque" por enquanto).

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

export default function SupplierListScreen() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Supplier | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get("/catalog/suppliers");
      setSuppliers(r.data.suppliers ?? []);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function confirmRemove() {
    if (!removeTarget) return;
    try {
      await api.delete(`/catalog/suppliers/${removeTarget.id}`);
      makeToast("success", "Fornecedor excluído");
      setRemoveTarget(null);
      load();
    } catch (err) {
      makeToast("error", parseApiError(err).message);
    }
  }

  const columns: TableColumn<Supplier>[] = [
    { key: "nome", header: "Nome", render: (s) => s.nome },
    { key: "cnpj", header: "CNPJ", mono: true, render: (s) => formatCnpj(s.cnpj) },
    { key: "telefone", header: "Telefone", render: (s) => s.telefone ?? "—" },
    { key: "email", header: "E-mail", render: (s) => s.email ?? "—" },
    { key: "created_at", header: "Criado em", mono: true, render: (s) => fmtDate(s.created_at) },
    {
      key: "action", header: "", render: (s) => (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          <Button size="small" variant="secondary" onClick={(e) => { e.stopPropagation(); navigate(`/suppliers/${s.id}/edit`); }}>
            Editar
          </Button>
          <Button size="small" variant="secondary" style={{ color: "var(--error-base)" }} onClick={(e) => { e.stopPropagation(); setRemoveTarget(s); }}>
            Excluir
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 className={styles.title}>Fornecedores</h1>
        <Button onClick={() => navigate("/suppliers/new")}>+ Novo fornecedor</Button>
      </div>

      {error && <Alert variant="error" text={error} fullWidth />}

      {!error && (
        <Table
          variant="compact"
          columns={columns}
          rows={suppliers}
          rowKey={(s) => s.id}
          emptyMessage={loading ? "Carregando…" : "Nenhum fornecedor cadastrado ainda."}
        />
      )}

      <ConfirmDialog
        open={!!removeTarget}
        message={`Excluir o fornecedor "${removeTarget?.nome ?? ""}"? Essa ação não pode ser desfeita.`}
        onConfirm={confirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
