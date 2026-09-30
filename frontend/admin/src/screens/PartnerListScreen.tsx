import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Dropdown, InputBase, Tag, makeToast, type DropdownOptions } from "design-system";
import api from "../api";
import ConfirmDialog from "../components/ConfirmDialog";
import Table, { type TableColumn } from "../components/Table";
import { formatCnpj, formatCpf } from "../lib/masks";
import { normalizeCnpj } from "../lib/validators";
import { parseApiError } from "../lib/apiErrors";
import type { Partner } from "../types";
// ORD-211 — barra de filtro no mesmo molde visual de CatalogScreen
// (.filterBar: caixa branca com borda, mesmo componente reaproveitado por
// CommercialScreen pro título/abas — já é o stylesheet certo pra esta área).
import styles from "./CompanyScreen.module.scss";

// ORD-207 — cadastro de parceiro comercial (superadmin/admin). Dado de
// plataforma, mesmo padrão de controle de PriceTable/CommissionTable
// (ORD-206). Página/título compartilhados com CommercialScreen (aba
// "Parceiros" ao lado de "Tabela de preço"/"Módulo fiscal") — este
// componente renderiza só o conteúdo da aba.

const STATUS_VARIANT: Record<"ativo" | "inativo", "success" | "neutral"> = {
  ativo: "success",
  inativo: "neutral",
};

function maskDocument(partner: Partner): string {
  return partner.partner_type === "PF" ? formatCpf(partner.document) : formatCnpj(partner.document);
}

// ORD-211 — extraída como função pura testável. Busca por nome OU
// documento, normalizando os dois lados: usuário pode digitar com máscara
// ("123.456.789-09"), mas partner.document está salvo sem máscara.
// normalizeCnpj (não normalizeCpf) como normalizador genérico — sua regra
// (remove ./-, maiúsculas) cobre CPF (só dígitos, passa sem alteração) e
// CNPJ sem precisar saber de antemão qual tipo o texto digitado é.
export function matchesPartnerSearch(partner: Partner, search: string): boolean {
  const normalizedSearch = normalizeCnpj(search);
  return (
    partner.name.toLowerCase().includes(search.toLowerCase()) ||
    (normalizedSearch.length > 0 && partner.document.includes(normalizedSearch))
  );
}

// ORD-211 — status vira filtro de 3 estados (Ativos/Inativos/Todos) em vez
// do checkbox binário original ("mostrar inativos" só alternava entre
// "só ativos" e "todos" — não existia uma visão "só inativos"). O backend
// continua só sabendo responder "com ou sem inativos" (include_inactive);
// o terceiro estado ("só inativos") é filtro client-side sobre a resposta
// que já inclui todos.
export type PartnerStatusFilter = "ativos" | "inativos" | "todos";

const STATUS_FILTER_OPTIONS: DropdownOptions[] = [
  { value: "ativos", label: "Ativos" },
  { value: "inativos", label: "Inativos" },
  { value: "todos", label: "Todos" },
];

export default function PartnerListScreen() {
  const navigate = useNavigate();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PartnerStatusFilter>("ativos");
  const [toggleTarget, setToggleTarget] = useState<Partner | null>(null);
  // ORD-211 — client-side, sem debounce. Busca por nome OU documento —
  // normalizeCnpj (não normalizeCpf) como normalizador genérico: sua regra
  // (remove ./- , maiúsculas) cobre CPF (só dígitos, passa sem alteração) e
  // CNPJ sem precisar saber de antemão qual tipo o texto digitado é.
  const [search, setSearch] = useState("");

  async function load(filter: PartnerStatusFilter) {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get("/commercial/partners", { params: { include_inactive: filter !== "ativos" } });
      setPartners(r.data.partners ?? []);
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
    setStatusFilter("ativos");
  }

  async function confirmToggleStatus() {
    if (!toggleTarget) return;
    const action = toggleTarget.status === "ativo" ? "deactivate" : "reactivate";
    try {
      await api.post(`/commercial/partners/${toggleTarget.id}/${action}`);
      makeToast("success", action === "deactivate" ? "Parceiro desativado" : "Parceiro reativado");
      setToggleTarget(null);
      load(statusFilter);
    } catch (err) {
      makeToast("error", parseApiError(err).message);
    }
  }

  const filteredPartners = partners.filter((p) => {
    if (statusFilter === "ativos" && p.status !== "ativo") return false;
    if (statusFilter === "inativos" && p.status !== "inativo") return false;
    return matchesPartnerSearch(p, search);
  });
  const hasActiveFilters = search.length > 0 || statusFilter !== "ativos";

  const columns: TableColumn<Partner>[] = [
    { key: "name", header: "Nome", render: (p) => p.name },
    { key: "partner_type", header: "Tipo", render: (p) => (p.partner_type === "PF" ? "Pessoa física" : "Pessoa jurídica") },
    { key: "document", header: "Documento", mono: true, render: (p) => maskDocument(p) },
    { key: "commission_table", header: "Tabela de comissão", render: (p) => p.commission_table.name },
    {
      // ORD-210 — title nativo (não o componente Tooltip do design-system,
      // que exigiria wiring de ref/estado sem nenhum uso prévio no admin
      // pra uma dica cosmética) explica o caveat sem esconder informação
      // atrás de um componente novo e não testado no projeto.
      key: "referred_companies_count",
      header: (
        <span title="Vínculo atual — não usar para cálculo de comissão. O fechamento mensal reconstrói o vínculo histórico separadamente.">
          Empresas indicadas
        </span>
      ),
      mono: true,
      render: (p) => p.referred_companies_count,
    },
    {
      key: "status", header: "Status",
      render: (p) => <Tag variant={STATUS_VARIANT[p.status]}>{p.status === "ativo" ? "Ativo" : "Inativo"}</Tag>,
    },
    {
      key: "action", header: "", render: (p) => (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          <Button size="small" variant="secondary" onClick={(e) => { e.stopPropagation(); navigate(`/commercial/partners/${p.id}/edit`); }}>
            Editar
          </Button>
          <Button
            size="small" variant="secondary"
            style={p.status === "ativo" ? { color: "var(--error-base)" } : undefined}
            onClick={(e) => { e.stopPropagation(); setToggleTarget(p); }}
          >
            {p.status === "ativo" ? "Desativar" : "Reativar"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      {/* ORD-211 — mesma caixa branca de filtro do Catálogo (.filterBar),
          Status como Dropdown — mesmo padrão do filtro de Status do
          Catálogo, ganha um terceiro estado ("só inativos") que o
          checkbox binário original não tinha. */}
      <div className={styles.filterBar}>
        <InputBase
          label="Buscar"
          placeholder="Nome ou documento…"
          icon="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Dropdown
          label="Status"
          options={STATUS_FILTER_OPTIONS}
          value={STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter) ?? STATUS_FILTER_OPTIONS[0]}
          onValueSelected={(opt) => setStatusFilter(opt.value as PartnerStatusFilter)}
        />
        <Button type="button" variant="secondary" onClick={clearFilters} disabled={!hasActiveFilters}>
          Limpar filtros
        </Button>
        <Button onClick={() => navigate("/commercial/partners/new")}>+ Novo parceiro</Button>
      </div>

      {error && <Alert variant="error" text={error} fullWidth />}

      {!error && (
        <Table
          variant="compact"
          columns={columns}
          rows={filteredPartners}
          rowKey={(p) => p.id}
          emptyMessage={loading ? "Carregando…" : search ? "Nenhum parceiro encontrado." : "Nenhum parceiro cadastrado ainda."}
        />
      )}

      <ConfirmDialog
        open={!!toggleTarget}
        message={
          toggleTarget?.status === "ativo"
            ? `Desativar o parceiro "${toggleTarget?.name ?? ""}"? Ele some da listagem padrão, mas o vínculo e o histórico continuam preservados — pode ser reativado depois.`
            : `Reativar o parceiro "${toggleTarget?.name ?? ""}"?`
        }
        onConfirm={confirmToggleStatus}
        onCancel={() => setToggleTarget(null)}
      />
    </>
  );
}
