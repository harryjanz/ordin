import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Dropdown, InputBase, Tag, makeToast, type DropdownOptions } from "design-system";
import api from "../api";
import ConfirmDialog from "../components/ConfirmDialog";
import Table, { type TableColumn } from "../components/Table";
import { parseApiError } from "../lib/apiErrors";
import type { PriceTableKind, PriceTableStatus, PriceTableSummary } from "../types";
// ORD-211 — mesmo stylesheet reaproveitado por PartnerListScreen/
// CommissionTableListScreen/CatalogScreen (.filterBar: caixa branca com borda).
import styles from "./CompanyScreen.module.scss";

// ORD-162 — CRUD de tabela de preço comercial da plataforma (superadmin/
// admin). Não confundir com CompanyContractScreen ("/companies/:id/contract"),
// que é o contrato jurídico por empresa — entidade diferente. ORD-174
// (revisão): página/título compartilhados com CommercialScreen (aba "Add-on
// fiscal" ao lado) — este componente renderiza só o conteúdo da aba.

const STATUS_LABEL: Record<PriceTableStatus, string> = {
  draft: "Rascunho",
  active: "Vigente",
  historical: "Histórica",
};

const STATUS_VARIANT: Record<PriceTableStatus, "neutral" | "success" | "warning"> = {
  draft: "warning",
  active: "success",
  historical: "neutral",
};

// ORD-164 — independente do status: marca a tabela como disponível pra uso
// manual em contratos específicos (renovação ou troca sem renovar), sem
// virar a vigente padrão. "" representa null (Dropdown não trabalha com
// null como value).
const KIND_LABEL: Record<"alternativa" | "promocional", string> = {
  alternativa: "Alternativa",
  promocional: "Promocional",
};

const KIND_OPTIONS: DropdownOptions[] = [
  { value: "", label: "Nenhuma" },
  { value: "alternativa", label: "Alternativa" },
  { value: "promocional", label: "Promocional" },
];

// ORD-211 — filtros de listagem (Status/Categoria), independentes do modal
// de categoria acima (que edita o dado, não filtra a lista) — "todos" é o
// estado neutro (sem filtro), diferente de KIND_OPTIONS onde "" representa
// null como valor de fato salvável.
export type PriceTableStatusFilter = "todos" | PriceTableStatus;
export type PriceTableKindFilter = "todos" | "sem_categoria" | "alternativa" | "promocional";

const STATUS_FILTER_OPTIONS: DropdownOptions[] = [
  { value: "todos", label: "Todos" },
  { value: "draft", label: "Rascunho" },
  { value: "active", label: "Vigente" },
  { value: "historical", label: "Histórica" },
];

const KIND_FILTER_OPTIONS: DropdownOptions[] = [
  { value: "todos", label: "Todas" },
  { value: "sem_categoria", label: "Sem categoria" },
  { value: "alternativa", label: "Alternativa" },
  { value: "promocional", label: "Promocional" },
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

// ORD-211 — extraída como função pura testável (mesmo racional de
// buildCompanyListQuery em api/companies.ts), separada do componente.
export function matchesPriceTableSearch(table: PriceTableSummary, search: string): boolean {
  return table.name.toLowerCase().includes(search.toLowerCase());
}

export default function PriceTableListScreen() {
  const navigate = useNavigate();
  const [tables, setTables] = useState<PriceTableSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // ORD-211 — client-side: nenhum dos 4 endpoints de Comercial pagina hoje
  // (lista inteira sempre carregada), então filtrar em memória evita
  // endpoint novo e round-trip a cada tecla. Sem debounce — não há I/O.
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PriceTableStatusFilter>("todos");
  const [kindFilter, setKindFilter] = useState<PriceTableKindFilter>("todos");
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);
  // ORD-164 (ajuste de UX pós-feedback) — select solto na linha da tabela
  // trocado por modal com confirmação explícita, mesmo padrão já usado nas
  // outras ações desta tela (ativar/excluir via ConfirmDialog).
  const [kindTarget, setKindTarget] = useState<PriceTableSummary | null>(null);
  const [pendingKind, setPendingKind] = useState<PriceTableKind>(null);
  const [savingKind, setSavingKind] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get("/commercial/price-tables");
      setTables(r.data.price_tables ?? []);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function duplicate(id: number) {
    try {
      const r = await api.post(`/commercial/price-tables/${id}/duplicate`);
      makeToast("success", "Cópia criada em rascunho");
      navigate(`/commercial/price-tables/${r.data.id}/edit`);
    } catch (err) {
      makeToast("error", parseApiError(err).message);
    }
  }

  function activate(table: PriceTableSummary, hasCurrentActive: boolean) {
    const message = hasCurrentActive
      ? `Ativar "${table.name}" como vigente? A tabela vigente atual passa a histórica — contratos já presos a ela não são afetados.`
      : `Ativar "${table.name}" como vigente?`;
    setConfirmState({
      message,
      onConfirm: async () => {
        setConfirmState(null);
        try {
          await api.post(`/commercial/price-tables/${table.id}/activate`, { confirm_replace: true });
          makeToast("success", `"${table.name}" agora é a tabela vigente`);
          load();
        } catch (err) {
          makeToast("error", parseApiError(err).message);
        }
      },
    });
  }

  function openKindModal(table: PriceTableSummary) {
    setKindTarget(table);
    setPendingKind(table.kind);
  }

  async function confirmKind() {
    if (!kindTarget) return;
    setSavingKind(true);
    try {
      await api.patch(`/commercial/price-tables/${kindTarget.id}/kind`, { kind: pendingKind });
      makeToast(
        "success",
        pendingKind ? `"${kindTarget.name}" marcada como ${KIND_LABEL[pendingKind]}` : `"${kindTarget.name}" sem categoria especial`
      );
      setKindTarget(null);
      load();
    } catch (err) {
      makeToast("error", parseApiError(err).message);
    } finally {
      setSavingKind(false);
    }
  }

  function remove(table: PriceTableSummary) {
    setConfirmState({
      message: `Excluir o rascunho "${table.name}"? Essa ação não pode ser desfeita.`,
      onConfirm: async () => {
        setConfirmState(null);
        try {
          await api.delete(`/commercial/price-tables/${table.id}`);
          makeToast("success", "Rascunho excluído");
          load();
        } catch (err) {
          makeToast("error", parseApiError(err).message);
        }
      },
    });
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("todos");
    setKindFilter("todos");
  }

  const hasCurrentActive = tables.some((t) => t.status === "active");
  const filteredTables = tables.filter((t) => {
    if (statusFilter !== "todos" && t.status !== statusFilter) return false;
    if (kindFilter === "sem_categoria" && t.kind !== null) return false;
    if ((kindFilter === "alternativa" || kindFilter === "promocional") && t.kind !== kindFilter) return false;
    return matchesPriceTableSearch(t, search);
  });
  const hasActiveFilters = search.length > 0 || statusFilter !== "todos" || kindFilter !== "todos";

  const columns: TableColumn<PriceTableSummary>[] = [
    { key: "name", header: "Nome", render: (t) => t.name },
    {
      key: "status", header: "Status",
      render: (t) => <Tag variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</Tag>,
    },
    {
      key: "kind", header: "Categoria",
      render: (t) => t.kind ? <Tag variant="emphasys">{KIND_LABEL[t.kind]}</Tag> : "—",
    },
    {
      // ORD-165 — visibilidade antes de qualquer ação (editar, excluir,
      // trocar categoria): quantas empresas dependem desta tabela agora.
      key: "linked_companies_count", header: "Empresas", mono: true,
      render: (t) => t.linked_companies_count,
    },
    { key: "created_at", header: "Criada em", mono: true, render: (t) => fmtDate(t.created_at) },
    { key: "activated_at", header: "Ativada em", mono: true, render: (t) => fmtDate(t.activated_at) },
    {
      key: "action", header: "", render: (t) => (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          {t.status !== "draft" && (
            <Button size="small" variant="secondary" onClick={(e) => { e.stopPropagation(); openKindModal(t); }}>
              Categoria
            </Button>
          )}
          {/* ORD-167 — "Ver" quando não editável, mesma rota: a tela dedicada
              já sabe renderizar em somente-leitura quando editable=false. */}
          <Button size="small" variant="secondary" onClick={(e) => { e.stopPropagation(); navigate(`/commercial/price-tables/${t.id}/edit`); }}>
            {t.editable ? "Editar" : "Ver"}
          </Button>
          <Button size="small" variant="secondary" onClick={(e) => { e.stopPropagation(); duplicate(t.id); }}>
            Duplicar
          </Button>
          {t.status !== "active" && (
            <Button size="small" variant="secondary" onClick={(e) => { e.stopPropagation(); activate(t, hasCurrentActive); }}>
              Ativar
            </Button>
          )}
          {t.editable && (
            <Button size="small" variant="secondary" style={{ color: "var(--error-base)" }} onClick={(e) => { e.stopPropagation(); remove(t); }}>
              Excluir
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      {/* ORD-174 (revisão) — página/título ficaram por conta de CommercialScreen
          (aba compartilhada com Módulo fiscal); aqui só o botão de criar.
          ORD-211 — mesma caixa branca de filtro do Catálogo (.filterBar),
          Status/Categoria como Dropdown reaproveitando os campos já
          existentes na entidade (PriceTableStatus, kind). */}
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
          onValueSelected={(opt) => setStatusFilter(opt.value as PriceTableStatusFilter)}
        />
        <Dropdown
          label="Categoria"
          options={KIND_FILTER_OPTIONS}
          value={KIND_FILTER_OPTIONS.find((o) => o.value === kindFilter) ?? KIND_FILTER_OPTIONS[0]}
          onValueSelected={(opt) => setKindFilter(opt.value as PriceTableKindFilter)}
        />
        <Button type="button" variant="secondary" onClick={clearFilters} disabled={!hasActiveFilters}>
          Limpar filtros
        </Button>
        <Button onClick={() => navigate("/commercial/price-tables/new")}>+ Nova tabela</Button>
      </div>

      {error && <Alert variant="error" text={error} fullWidth />}

      {!error && (
        <Table
          variant="compact"
          columns={columns}
          rows={filteredTables}
          rowKey={(t) => t.id}
          emptyMessage={
            loading ? "Carregando…" : search ? "Nenhuma tabela encontrada." : "Nenhuma tabela de preço cadastrada ainda."
          }
        />
      )}

      <ConfirmDialog
        open={!!confirmState}
        message={confirmState?.message ?? ""}
        onConfirm={() => confirmState?.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />

      <ConfirmDialog
        open={!!kindTarget}
        title="Categoria da tabela"
        message={`Marcar "${kindTarget?.name ?? ""}" como alternativa ou promocional pra ficar disponível em contratos específicos, sem virar a tabela vigente padrão.`}
        confirmLabel="Confirmar"
        onConfirm={confirmKind}
        onCancel={() => setKindTarget(null)}
        confirmDisabled={savingKind}
      >
        <Dropdown
          label="Categoria"
          options={KIND_OPTIONS}
          value={KIND_OPTIONS.find((o) => o.value === (pendingKind ?? "")) ?? KIND_OPTIONS[0]}
          onValueSelected={(opt) => setPendingKind((opt.value || null) as PriceTableKind)}
        />
      </ConfirmDialog>
    </>
  );
}
