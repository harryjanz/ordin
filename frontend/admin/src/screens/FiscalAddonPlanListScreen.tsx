import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, InputBase, makeToast } from "design-system";
import api from "../api";
import ConfirmDialog from "../components/ConfirmDialog";
import Table, { type TableColumn } from "../components/Table";
import { parseApiError } from "../lib/apiErrors";
import type { FiscalAddonPlan } from "../types";
// ORD-211 — mesmo stylesheet reaproveitado pelas outras 3 telas de Comercial
// (.filterBar: caixa branca com borda).
import styles from "./CompanyScreen.module.scss";

// ORD-174 — CRUD de planos de add-on fiscal (superadmin/admin). Custo do
// módulo fiscal é uma dimensão SEPARADA da PriceTable do totem (Focus NFe
// cobra plano fixo + valor por nota emitida) — não confundir com
// "/commercial/price-tables". Revisão pós-feedback: página/título
// compartilhados com CommercialScreen (aba "Tabela de preço" ao lado) —
// este componente renderiza só o conteúdo da aba.

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

// ORD-211 — extraída como função pura testável (mesmo racional de
// buildCompanyListQuery em api/companies.ts).
export function matchesFiscalAddonPlanSearch(plan: FiscalAddonPlan, search: string): boolean {
  return plan.name.toLowerCase().includes(search.toLowerCase());
}

export default function FiscalAddonPlanListScreen() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<FiscalAddonPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<FiscalAddonPlan | null>(null);
  // ORD-211 — client-side, sem debounce (mesmo racional de PriceTableListScreen).
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get("/commercial/fiscal-addon-plans");
      setPlans(r.data.plans ?? []);
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
      await api.delete(`/commercial/fiscal-addon-plans/${removeTarget.id}`);
      makeToast("success", "Plano excluído");
      setRemoveTarget(null);
      load();
    } catch (err) {
      makeToast("error", parseApiError(err).message);
    }
  }

  function clearFilters() {
    setSearch("");
  }

  const filteredPlans = plans.filter((p) => matchesFiscalAddonPlanSearch(p, search));
  const hasActiveFilters = search.length > 0;

  const columns: TableColumn<FiscalAddonPlan>[] = [
    { key: "name", header: "Nome", render: (p) => p.name },
    { key: "monthly_price", header: "Preço fixo/mês", mono: true, render: (p) => fmtBRL(p.monthly_price) },
    { key: "price_per_document", header: "Preço por nota", mono: true, render: (p) => fmtBRL(p.price_per_document) },
    {
      // ORD-174 — mesma visibilidade de PriceTable.linked_companies_count,
      // antes de qualquer ação de edição/exclusão.
      key: "linked_companies_count", header: "Empresas", mono: true,
      render: (p) => p.linked_companies_count,
    },
    { key: "created_at", header: "Criado em", mono: true, render: (p) => fmtDate(p.created_at) },
    {
      key: "action", header: "", render: (p) => (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          <Button size="small" variant="secondary" onClick={(e) => { e.stopPropagation(); navigate(`/commercial/fiscal-addon-plans/${p.id}/edit`); }}>
            {p.editable ? "Editar" : "Ver"}
          </Button>
          {p.editable && (
            <Button size="small" variant="secondary" style={{ color: "var(--error-base)" }} onClick={(e) => { e.stopPropagation(); setRemoveTarget(p); }}>
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
          Sem Status/Categoria aqui — FiscalAddonPlan não tem esses campos. */}
      <div className={styles.filterBar}>
        <InputBase
          label="Buscar"
          placeholder="Nome…"
          icon="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button type="button" variant="secondary" onClick={clearFilters} disabled={!hasActiveFilters}>
          Limpar filtros
        </Button>
        <Button onClick={() => navigate("/commercial/fiscal-addon-plans/new")}>+ Novo plano</Button>
      </div>

      {error && <Alert variant="error" text={error} fullWidth />}

      {!error && (
        <Table
          variant="compact"
          columns={columns}
          rows={filteredPlans}
          rowKey={(p) => p.id}
          emptyMessage={
            loading ? "Carregando…" : search ? "Nenhum plano encontrado." : "Nenhum plano do módulo fiscal cadastrado ainda."
          }
        />
      )}

      <ConfirmDialog
        open={!!removeTarget}
        message={`Excluir o plano "${removeTarget?.name ?? ""}"? Essa ação não pode ser desfeita.`}
        onConfirm={confirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </>
  );
}
