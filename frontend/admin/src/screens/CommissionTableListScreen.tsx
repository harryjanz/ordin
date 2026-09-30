import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Dropdown, InputBase, Tag, makeToast, type DropdownOptions } from "design-system";
import api from "../api";
import ConfirmDialog from "../components/ConfirmDialog";
import Table, { type TableColumn } from "../components/Table";
import { parseApiError } from "../lib/apiErrors";
import type { CommissionTable } from "../types";
// ORD-211 — mesmo stylesheet reaproveitado por PartnerListScreen/
// CatalogScreen (.filterBar: caixa branca com borda).
import styles from "./CompanyScreen.module.scss";

// ORD-209 — CRUD de tabela de comissão de parceiro (ORD-206) pelo admin.
// Catálogo de plataforma (role, não tenant), mesmo papel estrutural de
// PriceTable — página/título compartilhados com CommercialScreen (aba
// "Tabelas de comissão" ao lado de "Tabela de preço"/"Módulo fiscal"/
// "Parceiros"). Molde mais próximo é PartnerListScreen (toggle de
// arquivadas/inativas), não PriceTableListScreen.

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

// ORD-211 — extraída como função pura testável (mesmo racional de
// buildCompanyListQuery em api/companies.ts).
export function matchesCommissionTableSearch(table: CommissionTable, search: string): boolean {
  return table.name.toLowerCase().includes(search.toLowerCase());
}

// ORD-211 — status vira filtro de 3 estados (Ativas/Arquivadas/Todas) em vez
// do checkbox binário original. O backend só sabe responder "com ou sem
// arquivadas" (archived=true retorna as duas juntas) — "só arquivadas" é
// filtro client-side sobre essa resposta.
export type CommissionTableStatusFilter = "ativas" | "arquivadas" | "todas";

const STATUS_FILTER_OPTIONS: DropdownOptions[] = [
  { value: "ativas", label: "Ativas" },
  { value: "arquivadas", label: "Arquivadas" },
  { value: "todas", label: "Todas" },
];

export default function CommissionTableListScreen() {
  const navigate = useNavigate();
  const [tables, setTables] = useState<CommissionTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<CommissionTableStatusFilter>("ativas");
  // ORD-211 — client-side, sem debounce (mesmo racional das outras 3 telas de Comercial).
  const [search, setSearch] = useState("");

  const [setDefaultTarget, setSetDefaultTarget] = useState<CommissionTable | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<CommissionTable | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CommissionTable | null>(null);

  async function load(filter: CommissionTableStatusFilter) {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get("/commercial/commission-tables", { params: { archived: filter !== "ativas" } });
      setTables(r.data.commission_tables ?? []);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  function clearFilters() {
    setSearch("");
    setStatusFilter("ativas");
  }

  const hasCurrentDefault = tables.some((t) => t.is_default);
  const filteredTables = tables.filter((t) => {
    if (statusFilter === "ativas" && t.archived_at) return false;
    if (statusFilter === "arquivadas" && !t.archived_at) return false;
    return matchesCommissionTableSearch(t, search);
  });
  const hasActiveFilters = search.length > 0 || statusFilter !== "ativas";

  async function confirmSetDefault() {
    if (!setDefaultTarget) return;
    try {
      await api.post(`/commercial/commission-tables/${setDefaultTarget.id}/set-default`, { confirm_replace: true });
      makeToast("success", `"${setDefaultTarget.name}" agora é a tabela padrão`);
      setSetDefaultTarget(null);
      load(statusFilter);
    } catch (err) {
      makeToast("error", parseApiError(err).message);
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    try {
      await api.post(`/commercial/commission-tables/${archiveTarget.id}/archive`);
      makeToast("success", `"${archiveTarget.name}" arquivada`);
      setArchiveTarget(null);
      load(statusFilter);
    } catch (err) {
      makeToast("error", parseApiError(err).message);
      setArchiveTarget(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/commercial/commission-tables/${deleteTarget.id}`);
      makeToast("success", `"${deleteTarget.name}" excluída`);
      setDeleteTarget(null);
      load(statusFilter);
    } catch (err) {
      makeToast("error", parseApiError(err).message);
      setDeleteTarget(null);
    }
  }

  const columns: TableColumn<CommissionTable>[] = [
    {
      key: "name", header: "Nome",
      render: (t) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {t.name}
          {t.is_default && <Tag variant="emphasys">Padrão</Tag>}
        </div>
      ),
    },
    { key: "setup_fee_per_totem", header: "Setup / totem", mono: true, render: (t) => fmtBRL(t.setup_fee_per_totem) },
    { key: "recurring_percent", header: "% recorrente", mono: true, render: (t) => `${t.recurring_percent}%` },
    { key: "vigente_desde", header: "Vigente desde", mono: true, render: (t) => fmtDate(t.vigente_desde) },
    {
      key: "status", header: "Status",
      render: (t) => <Tag variant={t.archived_at ? "neutral" : "success"}>{t.archived_at ? "Arquivada" : "Ativa"}</Tag>,
    },
    {
      key: "action", header: "", render: (t) => (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          <Button size="small" variant="secondary" onClick={(e) => { e.stopPropagation(); navigate(`/commercial/commission-tables/${t.id}/edit`); }}>
            {t.archived_at ? "Ver" : "Editar"}
          </Button>
          {!t.is_default && !t.archived_at && (
            <Button size="small" variant="secondary" onClick={(e) => { e.stopPropagation(); setSetDefaultTarget(t); }}>
              Marcar como padrão
            </Button>
          )}
          {!t.is_default && !t.archived_at && (
            <Button size="small" variant="secondary" onClick={(e) => { e.stopPropagation(); setArchiveTarget(t); }}>
              Arquivar
            </Button>
          )}
          {!t.is_default && (
            <Button size="small" variant="secondary" style={{ color: "var(--error-base)" }} onClick={(e) => { e.stopPropagation(); setDeleteTarget(t); }}>
              Excluir
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      {/* ORD-211 — mesma caixa branca de filtro do Catálogo (.filterBar).
          Status como Dropdown — ganha um terceiro estado ("só arquivadas")
          que o checkbox binário original não tinha. */}
      <div className={styles.filterBar}>
        <InputBase
          label="Buscar"
          placeholder="Nome…"
          icon="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Dropdown
          label="Status"
          options={STATUS_FILTER_OPTIONS}
          value={STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter) ?? STATUS_FILTER_OPTIONS[0]}
          onValueSelected={(opt) => setStatusFilter(opt.value as CommissionTableStatusFilter)}
        />
        <Button type="button" variant="secondary" onClick={clearFilters} disabled={!hasActiveFilters}>
          Limpar filtros
        </Button>
        <Button onClick={() => navigate("/commercial/commission-tables/new")}>+ Nova tabela de comissão</Button>
      </div>

      {error && <Alert variant="error" text={error} fullWidth />}

      {!error && (
        <Table
          variant="compact"
          columns={columns}
          rows={filteredTables}
          rowKey={(t) => t.id}
          emptyMessage={loading ? "Carregando…" : search ? "Nenhuma tabela encontrada." : "Nenhuma tabela de comissão cadastrada ainda."}
        />
      )}

      <ConfirmDialog
        open={!!setDefaultTarget}
        message={
          hasCurrentDefault
            ? `Marcar "${setDefaultTarget?.name ?? ""}" como padrão? A tabela padrão atual deixa de ser — parceiros já vinculados a outras tabelas não são afetados.`
            : `Marcar "${setDefaultTarget?.name ?? ""}" como padrão?`
        }
        onConfirm={confirmSetDefault}
        onCancel={() => setSetDefaultTarget(null)}
      />

      <ConfirmDialog
        open={!!archiveTarget}
        message={`Arquivar "${archiveTarget?.name ?? ""}"? Ela some da listagem padrão e não pode mais ser escolhida por um parceiro novo. Bloqueado se ainda houver parceiro vinculado a ela.`}
        onConfirm={confirmArchive}
        onCancel={() => setArchiveTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        message={`Excluir "${deleteTarget?.name ?? ""}" definitivamente? Essa ação não pode ser desfeita. Só é permitida se a tabela nunca teve histórico de alteração e não tem parceiro vinculado.`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
