import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Dropdown, Tag, makeToast, type DropdownOptions } from "design-system";
import api from "../api";
import ConfirmDialog from "../components/ConfirmDialog";
import Table, { type TableColumn } from "../components/Table";
import { parseApiError } from "../lib/apiErrors";
import type { PriceTableKind, PriceTableStatus, PriceTableSummary } from "../types";
// Reaproveita o mesmo stylesheet de CompanyListScreen (.page, .pageHead,
// .eyebrow, .title) — mesmo padrão de PlatformUsersScreen reaproveitando
// CompanyScreen.module.scss pra uma tela de lista simples nova.
import styles from "./CompanyListScreen.module.scss";

// ORD-162 — CRUD de tabela de preço comercial da plataforma (superadmin/
// admin). Não confundir com CompanyContractScreen ("/companies/:id/contract"),
// que é o contrato jurídico por empresa — entidade diferente.

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

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

export default function PriceTableListScreen() {
  const navigate = useNavigate();
  const [tables, setTables] = useState<PriceTableSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);

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

  async function setKind(table: PriceTableSummary, kind: PriceTableKind) {
    try {
      await api.patch(`/commercial/price-tables/${table.id}/kind`, { kind });
      makeToast("success", kind ? `"${table.name}" marcada como ${KIND_LABEL[kind]}` : `"${table.name}" sem categoria especial`);
      load();
    } catch (err) {
      makeToast("error", parseApiError(err).message);
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

  const hasCurrentActive = tables.some((t) => t.status === "active");

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
    { key: "created_at", header: "Criada em", mono: true, render: (t) => fmtDate(t.created_at) },
    { key: "activated_at", header: "Ativada em", mono: true, render: (t) => fmtDate(t.activated_at) },
    {
      key: "action", header: "", render: (t) => (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          {t.status !== "draft" && (
            <div style={{ width: 150 }} onClick={(e) => e.stopPropagation()}>
              <Dropdown
                options={KIND_OPTIONS}
                value={KIND_OPTIONS.find((o) => o.value === (t.kind ?? "")) ?? KIND_OPTIONS[0]}
                onValueSelected={(opt) => setKind(t, (opt.value || null) as PriceTableKind)}
              />
            </div>
          )}
          {t.editable && (
            <Button size="small" variant="secondary" onClick={(e) => { e.stopPropagation(); navigate(`/commercial/price-tables/${t.id}/edit`); }}>
              Editar
            </Button>
          )}
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
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <div className={styles.eyebrow}>Comercial</div>
          <h1 className={styles.title}>Tabelas de preço</h1>
        </div>
        <Button onClick={() => navigate("/commercial/price-tables/new")}>+ Nova tabela</Button>
      </div>

      {error && <Alert variant="error" text={error} fullWidth />}

      {!error && (
        <Table
          variant="compact"
          columns={columns}
          rows={tables}
          rowKey={(t) => t.id}
          emptyMessage={loading ? "Carregando…" : "Nenhuma tabela de preço cadastrada ainda."}
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
