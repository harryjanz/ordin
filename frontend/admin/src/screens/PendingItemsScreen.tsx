import { useEffect, useRef, useState } from "react";
import { Alert, Button, Checkbox, Dropdown, InputBase, Modal, Pagination, Tag, makeToast, type DropdownOptions } from "design-system";
import api from "../api";
import ConfirmDialog from "../components/ConfirmDialog";
import ResolvePendingItemPanel from "../components/ResolvePendingItemPanel";
import Table, { type TableColumn } from "../components/Table";
import { parseApiError } from "../lib/apiErrors";
import { useCatalogParams } from "../lib/catalogParams";
import { useStore } from "../store";
import type { BulkIgnoreOut, PendenteMotivo, PendingItem } from "../types";
import styles from "./SupplierInvoiceScreen.module.scss";

const LIMIT = 50;

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtQty = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });

const MOTIVO_LABEL: Record<"sem_correspondencia" | PendenteMotivo, string> = {
  sem_correspondencia: "Sem correspondência",
  guarda_chuva: "Produto guarda-chuva",
  sem_estoque_iniciado: "Sem estoque iniciado",
  conflito_concorrencia: "Conflito de concorrência",
};

const motivoOptions: DropdownOptions[] = [
  { label: "Todos os motivos", value: "" },
  ...Object.entries(MOTIVO_LABEL).map(([value, label]) => ({ value, label })),
];

// ORD-196 (C2) — fila de pendência cross-nota. Sem essa tela, um item
// pendente só é visível abrindo o detalhe da nota específica que o trouxe —
// não existe hoje nenhum contador agregado (achado do Explorer, pesquisa de
// mercado em docs/estudo-conciliacao-nf-estoque-mercado.md). Mesmo padrão de
// listagem de SupplierInvoiceScreen (filtro server-side, debounce 500ms,
// Table + Pagination).
export default function PendingItemsScreen() {
  const catalogParams = useCatalogParams();
  // Achado ao vivo (revisão de urgência, 2026-09-24): esta tela fica
  // montada persistentemente dentro das abas de EstoqueScreen — trocar ou
  // limpar a empresa selecionada (superadmin/admin) nunca disparava um
  // refetch, deixando a tela "presa" nos dados da empresa anterior. Mesmo
  // padrão de correção já usado em CatalogScreen.tsx (ORD-136): incluir
  // selectedCompanyId nas dependências do efeito de carregamento.
  const selectedCompanyId = useStore((s) => s.selectedCompanyId);

  const [items, setItems] = useState<PendingItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fornecedorFilter, setFornecedorFilter] = useState("");
  const [motivoFilter, setMotivoFilter] = useState("");
  const [skip, setSkip] = useState(0);

  const [resolveTarget, setResolveTarget] = useState<PendingItem | null>(null);

  // ORD-199 — seleção só da página atual, mesmo padrão simples de UI sem
  // estado global; reseta ao trocar página/filtro (ver useEffect abaixo).
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();
  const isFirstRender = useRef(true);
  const requestId = useRef(0);

  function fetchItems(skipOverride?: number) {
    const thisRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    return api.get<{ items: PendingItem[]; total: number }>(
      "/catalog/supplier-invoices/pending-items",
      catalogParams({
        fornecedor: fornecedorFilter || undefined,
        motivo: motivoFilter || undefined,
        skip: skipOverride ?? skip,
        limit: LIMIT,
      }),
    )
      .then((r) => {
        if (thisRequest !== requestId.current) return;
        setItems(r.data.items ?? []);
        setTotal(r.data.total ?? 0);
      })
      .catch((err) => { if (thisRequest === requestId.current) setError(parseApiError(err).message); })
      .finally(() => { if (thisRequest === requestId.current) setLoading(false); });
  }

  useEffect(() => {
    fetchItems();
    isFirstRender.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motivoFilter, skip, selectedCompanyId]);

  useEffect(() => {
    if (isFirstRender.current) return;
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => { setSkip(0); fetchItems(0); }, 500);
    return () => clearTimeout(debounceTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fornecedorFilter]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [items]);

  function handleResolved() {
    setResolveTarget(null);
    fetchItems();
  }

  function toggleSelect(id: number, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? new Set(items.map((i) => i.id)) : new Set());
  }

  async function confirmBulkIgnore() {
    try {
      const r = await api.post<BulkIgnoreOut>(
        "/catalog/supplier-invoices/items/bulk-ignore",
        { item_ids: Array.from(selectedIds) },
        catalogParams(),
      );
      makeToast("success", `${r.data.ignorados} ${r.data.ignorados === 1 ? "item ignorado" : "itens ignorados"}`);
      setBulkConfirmOpen(false);
      fetchItems();
    } catch (err) {
      makeToast("error", parseApiError(err).message || "Erro ao ignorar os itens selecionados.");
    }
  }

  const columns: TableColumn<PendingItem>[] = [
    {
      key: "select",
      header: (
        <span className={styles.selectCell}>
          <Checkbox
            id="select-all-pending"
            checked={items.length > 0 && items.every((i) => selectedIds.has(i.id))}
            onChange={toggleSelectAll}
          />
        </span>
      ),
      render: (i) => (
        <span className={styles.selectCell}>
          <Checkbox
            id={`select-pending-${i.id}`}
            checked={selectedIds.has(i.id)}
            onChange={(checked) => toggleSelect(i.id, checked)}
          />
        </span>
      ),
    },
    {
      key: "nota", header: "Nota", render: (i) => (i.numero ? `${i.numero}${i.serie ? ` / ${i.serie}` : ""}` : "—"),
    },
    { key: "fornecedor_nome", header: "Fornecedor", render: (i) => i.fornecedor_nome },
    { key: "c_prod", header: "Código", mono: true, render: (i) => i.c_prod ?? "—" },
    { key: "c_ean", header: "EAN", mono: true, render: (i) => i.c_ean ?? "—" },
    { key: "x_prod", header: "Descrição", render: (i) => i.x_prod },
    { key: "quantidade", header: "Quantidade", mono: true, render: (i) => fmtQty(i.quantidade) },
    { key: "valor_total", header: "Valor total", mono: true, render: (i) => fmtBRL(i.valor_total) },
    {
      key: "motivo", header: "Motivo", render: (i) => (
        <Tag variant={i.pendente_motivo === "conflito_concorrencia" ? "error" : "warning"}>
          {MOTIVO_LABEL[i.pendente_motivo ?? "sem_correspondencia"]}
        </Tag>
      ),
    },
    {
      key: "action", header: "", render: (i) => (
        <Button size="small" onClick={(e) => { e.stopPropagation(); setResolveTarget(i); }}>Resolver</Button>
      ),
    },
  ];

  const page = Math.floor(skip / LIMIT) + 1;

  return (
    <>
      <div className={styles.filterBar}>
        <div className={styles.field}>
          <InputBase
            label="Fornecedor"
            placeholder="Buscar por nome…"
            value={fornecedorFilter}
            onChange={(e) => setFornecedorFilter(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <Dropdown
            label="Motivo"
            value={motivoOptions.find((o) => o.value === motivoFilter) ?? motivoOptions[0]}
            onValueSelected={(opt) => { setMotivoFilter(opt.value); setSkip(0); }}
            options={motivoOptions}
          />
        </div>
      </div>

      {error && <Alert variant="error" text={error} fullWidth />}

      {!error && (
        <>
          <div className={styles.count}>
            <b>{total}</b> item{total === 1 ? "" : "ns"} pendente{total === 1 ? "" : "s"}
            {selectedIds.size > 0 && (
              <span className={styles.bulkBar}>
                {" — "}{selectedIds.size} selecionado{selectedIds.size === 1 ? "" : "s"}
                {" "}
                <Button size="small" variant="secondary" onClick={() => setBulkConfirmOpen(true)}>
                  Ignorar selecionados
                </Button>
                {" "}
                <Button size="small" variant="secondary" onClick={() => setSelectedIds(new Set())}>
                  Limpar seleção
                </Button>
              </span>
            )}
          </div>
          <Table
            variant="compact"
            columns={columns}
            rows={items}
            rowKey={(i) => i.id}
            emptyMessage={loading ? "Carregando…" : "Nenhum item pendente — tudo vinculado."}
          />
          {total > 0 && (
            <div className={styles.pager}>
              <span className={styles.pagerCount}>Mostrando {skip + 1}–{Math.min(skip + LIMIT, total)} de {total}</span>
              <Pagination
                activePage={page}
                itemsPerPage={LIMIT}
                totalItemsCount={total}
                onChange={(newPage) => setSkip((newPage - 1) * LIMIT)}
              />
            </div>
          )}
        </>
      )}

      <Modal open={resolveTarget !== null} onClose={() => setResolveTarget(null)} size="large" width={720}>
        {resolveTarget && <ResolvePendingItemPanel item={resolveTarget} onResolved={handleResolved} />}
      </Modal>

      <ConfirmDialog
        open={bulkConfirmOpen}
        title="Ignorar itens selecionados?"
        message={`Os ${selectedIds.size} itens selecionados deixam de aparecer na fila de pendências e não geram nenhuma entrada de estoque.`}
        confirmLabel="Ignorar selecionados"
        cancelLabel="Cancelar"
        onConfirm={confirmBulkIgnore}
        onCancel={() => setBulkConfirmOpen(false)}
      />
    </>
  );
}
