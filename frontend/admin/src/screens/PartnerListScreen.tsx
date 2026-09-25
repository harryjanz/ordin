import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Checkbox, Tag, makeToast } from "design-system";
import api from "../api";
import ConfirmDialog from "../components/ConfirmDialog";
import Table, { type TableColumn } from "../components/Table";
import { formatCnpj, formatCpf } from "../lib/masks";
import { parseApiError } from "../lib/apiErrors";
import type { Partner } from "../types";

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

export default function PartnerListScreen() {
  const navigate = useNavigate();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<Partner | null>(null);

  async function load(withInactive: boolean) {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get("/commercial/partners", { params: { include_inactive: withInactive } });
      setPartners(r.data.partners ?? []);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(includeInactive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeInactive]);

  async function confirmToggleStatus() {
    if (!toggleTarget) return;
    const action = toggleTarget.status === "ativo" ? "deactivate" : "reactivate";
    try {
      await api.post(`/commercial/partners/${toggleTarget.id}/${action}`);
      makeToast("success", action === "deactivate" ? "Parceiro desativado" : "Parceiro reativado");
      setToggleTarget(null);
      load(includeInactive);
    } catch (err) {
      makeToast("error", parseApiError(err).message);
    }
  }

  const columns: TableColumn<Partner>[] = [
    { key: "name", header: "Nome", render: (p) => p.name },
    { key: "partner_type", header: "Tipo", render: (p) => (p.partner_type === "PF" ? "Pessoa física" : "Pessoa jurídica") },
    { key: "document", header: "Documento", mono: true, render: (p) => maskDocument(p) },
    { key: "commission_table", header: "Tabela de comissão", render: (p) => p.commission_table.name },
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Checkbox
          id="include-inactive-partners"
          label="Mostrar inativos"
          checked={includeInactive}
          onChange={setIncludeInactive}
        />
        <Button onClick={() => navigate("/commercial/partners/new")}>+ Novo parceiro</Button>
      </div>

      {error && <Alert variant="error" text={error} fullWidth />}

      {!error && (
        <Table
          variant="compact"
          columns={columns}
          rows={partners}
          rowKey={(p) => p.id}
          emptyMessage={loading ? "Carregando…" : "Nenhum parceiro cadastrado ainda."}
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
