import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, makeToast, Tag } from "design-system";
import api from "../api";
import ConfirmDialog from "../components/ConfirmDialog";
import Table, { type TableColumn } from "../components/Table";
import { formatCnpj } from "../lib/masks";
import { parseApiError } from "../lib/apiErrors";
import { useCatalogParams } from "../lib/catalogParams";
import { useStore } from "../store";
import type { Supplier } from "../types";

// ORD-182 (A6) — CRUD de fornecedores por empresa (superadmin/admin/owner/
// manager). ORD-194 (B1, revisão de frontend): página/título compartilhados
// com EstoqueScreen (aba "Notas de compra" ao lado) — este componente
// renderiza só o conteúdo da aba, mesmo padrão de FiscalAddonPlanListScreen
// dentro de CommercialScreen (ORD-174).

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

export default function SupplierListScreen() {
  const navigate = useNavigate();
  const catalogParams = useCatalogParams();
  // Achado ao vivo (revisão de urgência, 2026-09-24): esta tela nunca
  // mandava company_id pro backend, nem no fetch nem na exclusão — pra
  // superadmin/admin isso sempre dava 400 ("Parâmetro company_id é
  // obrigatório"), mesmo com uma empresa selecionada. Mesmo padrão já usado
  // em SupplierInvoiceScreen.tsx/PendingItemsScreen.tsx: catalogParams() nas
  // chamadas + selectedCompanyId nas dependências do efeito de carregamento.
  const selectedCompanyId = useStore((s) => s.selectedCompanyId);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Supplier | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get("/catalog/suppliers", catalogParams());
      setSuppliers(r.data.suppliers ?? []);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  async function confirmRemove() {
    if (!removeTarget) return;
    try {
      await api.delete(`/catalog/suppliers/${removeTarget.id}`, catalogParams());
      makeToast("success", "Fornecedor excluído");
      setRemoveTarget(null);
      load();
    } catch (err) {
      makeToast("error", parseApiError(err).message);
    }
  }

  const columns: TableColumn<Supplier>[] = [
    // ORD-204 — fornecedor criado automaticamente na importação de NF (só
    // nome+cnpj, sem contato) ganha Tag até alguém revisar e salvar.
    { key: "nome", header: "Nome", render: (s) => (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {s.nome}
        {s.cadastro_pendente && <Tag variant="warning">Cadastro pendente</Tag>}
      </div>
    ) },
    { key: "cnpj", header: "CNPJ", mono: true, render: (s) => formatCnpj(s.cnpj) },
    // ORD-202 — contato comercial substitui os campos legados telefone/
    // email como fonte principal; fallback pros legados só pra fornecedor
    // cadastrado antes desta história (nunca editado, sem contato ainda).
    { key: "telefone", header: "Telefone", render: (s) => s.contato?.telefone ?? s.telefone ?? "—" },
    { key: "email", header: "E-mail", render: (s) => s.contato?.email ?? s.email ?? "—" },
    { key: "created_at", header: "Criado em", mono: true, render: (s) => fmtDate(s.created_at) },
    {
      key: "action", header: "", render: (s) => (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          <Button size="small" variant="secondary" onClick={(e) => { e.stopPropagation(); navigate(`/stock/suppliers/${s.id}/edit`); }}>
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
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <Button onClick={() => navigate("/stock/suppliers/new")}>+ Novo fornecedor</Button>
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
    </>
  );
}
