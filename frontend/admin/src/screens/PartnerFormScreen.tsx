import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Checkbox, Dropdown, InputBase, Tag, TextArea, makeToast, type DropdownOptions } from "design-system";
import api from "../api";
import Breadcrumb from "../components/Breadcrumb";
import ConfirmDialog from "../components/ConfirmDialog";
import { formatCnpj, formatCpf, formatPhone } from "../lib/masks";
import { isValidCnpj, isValidCpf, normalizeCnpj, normalizeCpf } from "../lib/validators";
import { parseApiError } from "../lib/apiErrors";
import type { CommissionTable, Partner, PartnerHistoryEntry, PartnerType } from "../types";
// ORD-207 — mesmo racional já registrado em PriceTableFormScreen/
// FiscalAddonPlanFormScreen/SupplierFormScreen: sem componente genérico de
// formulário compartilhado pra este tipo de tela, reaproveita o mesmo
// stylesheet (.page, .header, .h1, .h2, .panel, .formRowField).
import styles from "./ComboFormScreen.module.scss";

// document/partner_type/acceptance_reference são imutáveis depois de
// criados (decisão do Tech Explorer) — por isso viram ReadOnlyField em modo
// de edição, nunca um input editável.
function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.formRowField}>
      <span className={styles.formLabel}>{label}</span>
      <div style={{ fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const TYPE_OPTIONS: DropdownOptions[] = [
  { value: "PF", label: "Pessoa física (CPF)" },
  { value: "PJ", label: "Pessoa jurídica (CNPJ)" },
];

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

export default function PartnerFormScreen() {
  const { id } = useParams<{ id: string }>();
  const editingId = id ? Number(id) : null;
  const navigate = useNavigate();

  const [loading, setLoading] = useState(editingId !== null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [partner, setPartner] = useState<Partner | null>(null);

  const [name, setName] = useState("");
  const [partnerType, setPartnerType] = useState<PartnerType>("PF");
  const [document, setDocument] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [acceptanceReference, setAcceptanceReference] = useState("");
  const [commissionTableId, setCommissionTableId] = useState<number | null>(null);
  const [confirmClickwrap, setConfirmClickwrap] = useState(false);

  const [commissionTables, setCommissionTables] = useState<CommissionTable[]>([]);
  const [history, setHistory] = useState<PartnerHistoryEntry[]>([]);
  const [changeTableTarget, setChangeTableTarget] = useState<number | null>(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);

  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadCommissionTables() {
      try {
        const r = await api.get("/commercial/commission-tables");
        if (!cancelled) setCommissionTables(r.data.commission_tables ?? []);
      } catch {
        if (!cancelled) setCommissionTables([]);
      }
    }
    loadCommissionTables();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (editingId === null) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const r = await api.get<Partner>(`/commercial/partners/${editingId}`);
        if (cancelled) return;
        const p = r.data;
        setPartner(p);
        setName(p.name);
        setPartnerType(p.partner_type);
        setDocument(p.document);
        setEmail(p.email);
        setPhone(p.phone);
        setAcceptanceReference(p.acceptance_reference);
        setCommissionTableId(p.commission_table.id);

        const h = await api.get<{ entries: PartnerHistoryEntry[] }>(`/commercial/partners/${editingId}/history`);
        if (!cancelled) setHistory(h.data.entries ?? []);
      } catch {
        if (!cancelled) setLoadError("Erro ao carregar parceiro.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const documentValid = partnerType === "PF" ? isValidCpf(document) : isValidCnpj(document);

  const canSave = editingId === null
    ? !saving &&
      name.trim().length > 0 &&
      documentValid &&
      email.trim().length > 0 &&
      phone.trim().length > 0 &&
      acceptanceReference.trim().length >= 10 &&
      commissionTableId !== null &&
      confirmClickwrap
    : !saving && name.trim().length > 0 && email.trim().length > 0 && phone.trim().length > 0;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setFormError("");
    try {
      if (editingId === null) {
        const body = {
          name: name.trim(),
          partner_type: partnerType,
          document: partnerType === "PF" ? normalizeCpf(document) : normalizeCnpj(document),
          email: email.trim(),
          phone: formatPhone(phone),
          acceptance_reference: acceptanceReference.trim(),
          commission_table_id: commissionTableId,
          confirm_clickwrap: confirmClickwrap,
        };
        await api.post("/commercial/partners", body);
      } else {
        await api.put(`/commercial/partners/${editingId}`, {
          name: name.trim(), email: email.trim(), phone: formatPhone(phone),
        });
      }
      navigate("/commercial/partners");
    } catch (err) {
      setFormError(parseApiError(err).message || "Erro ao salvar parceiro.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmChangeTable() {
    if (editingId === null || changeTableTarget === null) return;
    try {
      await api.post(`/commercial/partners/${editingId}/commission-table`, { commission_table_id: changeTableTarget });
      makeToast("success", "Tabela de comissão trocada");
      setChangeTableTarget(null);
      navigate(0); // recarrega a tela pra atualizar tabela vinculada + histórico
    } catch (err) {
      makeToast("error", parseApiError(err).message);
    }
  }

  async function confirmToggleStatus() {
    if (editingId === null || !partner) return;
    const action = partner.status === "ativo" ? "deactivate" : "reactivate";
    try {
      await api.post(`/commercial/partners/${editingId}/${action}`);
      makeToast("success", action === "deactivate" ? "Parceiro desativado" : "Parceiro reativado");
      setStatusDialogOpen(false);
      navigate(0);
    } catch (err) {
      makeToast("error", parseApiError(err).message);
    }
  }

  if (loading) return <div className={styles.page}>Carregando…</div>;
  if (loadError) {
    return (
      <div className={styles.page}>
        <Alert variant="error" text={loadError} fullWidth />
      </div>
    );
  }

  const activeCommissionTables = commissionTables.filter((t) => !t.archived_at);
  const tableOptions: DropdownOptions[] = activeCommissionTables.map((t) => ({
    value: String(t.id), label: t.is_default ? `${t.name} (padrão)` : t.name,
  }));

  return (
    <div className={styles.page}>
      <Breadcrumb
        items={[
          { label: "Comercial", href: "/commercial/partners" },
          { label: "Parceiros", href: "/commercial/partners" },
          { label: editingId === null ? "Novo parceiro" : "Editar parceiro" },
        ]}
      />
      <div className={styles.header}>
        <h1 className={styles.h1}>{editingId === null ? "Novo parceiro" : "Editar parceiro"}</h1>
        <div className={styles.headerActions}>
          {editingId !== null && partner && (
            <Button
              variant="secondary"
              style={partner.status === "ativo" ? { color: "var(--error-base)" } : undefined}
              onClick={() => setStatusDialogOpen(true)}
            >
              {partner.status === "ativo" ? "Desativar" : "Reativar"}
            </Button>
          )}
          <Button variant="secondary" onClick={() => navigate("/commercial/partners")}>Voltar</Button>
          <Button onClick={save} disabled={!canSave} loading={saving}>Salvar parceiro</Button>
        </div>
      </div>

      {formError && <div className={styles.alertBox}><Alert variant="error" text={formError} fullWidth /></div>}

      <div className={styles.panel}>
        <h2 className={styles.h2}>Dados cadastrais</h2>
        <InputBase label="Nome*" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className={styles.formRow}>
          {editingId === null ? (
            <div className={styles.formRowField}>
              <Dropdown
                label="Tipo*"
                value={TYPE_OPTIONS.find((o) => o.value === partnerType) ?? null}
                onValueSelected={(opt) => { setPartnerType(opt.value as PartnerType); setDocument(""); }}
                options={TYPE_OPTIONS}
              />
            </div>
          ) : (
            <ReadOnlyField label="Tipo" value={partnerType === "PF" ? "Pessoa física" : "Pessoa jurídica"} />
          )}
          {editingId === null ? (
            <div className={styles.formRowField}>
              <InputBase
                label={partnerType === "PF" ? "CPF*" : "CNPJ*"}
                placeholder={partnerType === "PF" ? "XXX.XXX.XXX-XX" : "XX.XXX.XXX/XXXX-XX"}
                value={partnerType === "PF" ? formatCpf(document) : formatCnpj(document)}
                onChange={(e) => setDocument(e.target.value)}
                errorMessage={document.length > 0 && !documentValid ? (partnerType === "PF" ? "CPF inválido" : "CNPJ inválido") : undefined}
              />
            </div>
          ) : (
            <ReadOnlyField label={partnerType === "PF" ? "CPF" : "CNPJ"} value={partnerType === "PF" ? formatCpf(document) : formatCnpj(document)} />
          )}
        </div>
        <div className={styles.formRow}>
          <div className={styles.formRowField}>
            <InputBase label="E-mail*" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className={styles.formRowField}>
            <InputBase label="Telefone*" value={formatPhone(phone)} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
      </div>

      <div className={styles.panel}>
        <h2 className={styles.h2}>Comissão</h2>
        {editingId === null ? (
          <Dropdown
            label="Tabela de comissão*"
            value={tableOptions.find((o) => o.value === String(commissionTableId)) ?? null}
            onValueSelected={(opt) => setCommissionTableId(Number(opt.value))}
            options={tableOptions}
            helperMessage={activeCommissionTables.length === 0 ? "Nenhuma tabela de comissão ativa cadastrada ainda." : undefined}
          />
        ) : (
          <div className={styles.formRow}>
            <ReadOnlyField label="Tabela de comissão vinculada" value={partner?.commission_table.name ?? "—"} />
            <div className={styles.formRowField}>
              <Button
                size="small" variant="secondary"
                onClick={() => setChangeTableTarget(partner?.commission_table.id ?? null)}
              >
                Trocar tabela
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className={styles.panel}>
        <h2 className={styles.h2}>Aceite do contrato</h2>
        <Alert
          variant="neutral"
          icon="info"
          fullWidth
          text="Envio e aceite acontecem fora da plataforma (e-mail ou conversa comercial) — este cadastro só registra que o parceiro já concordou com os termos."
        />
        {editingId === null ? (
          <>
            <TextArea
              label="Referência do aceite*"
              placeholder="ex: e-mail de 20/09 com fulano@parceiro.com, assunto: Aceite parceria Ordin"
              value={acceptanceReference}
              onChange={(e) => setAcceptanceReference(e.target.value)}
              maxLength={500}
              helperMessage="Onde está a evidência de que o parceiro aceitou os termos (mínimo 10 caracteres)"
            />
            <Checkbox
              id="confirm-clickwrap"
              label="Confirmo que o parceiro aceitou os termos da parceria (versão v1)"
              checked={confirmClickwrap}
              onChange={setConfirmClickwrap}
            />
          </>
        ) : (
          <div className={styles.formRow}>
            <ReadOnlyField label="Referência do aceite" value={acceptanceReference} />
            <ReadOnlyField label="Termo aceito" value={`${partner?.accepted_term_version} — ${partner ? fmtDateTime(partner.accepted_at) : ""}`} />
          </div>
        )}
      </div>

      {editingId !== null && (
        <div className={styles.panel}>
          <h2 className={styles.h2}>Histórico de troca de tabela de comissão</h2>
          {history.length === 0 ? (
            <div className={styles.searchEmpty}>Este parceiro nunca trocou de tabela de comissão.</div>
          ) : (
            <div className={styles.comboItemsBox}>
              {history.map((entry, index) => (
                <div key={index} className={styles.comboItemRow}>
                  <div className={styles.comboItemInfo}>
                    <span>{entry.from_commission_table.name} → {entry.to_commission_table.name}</span>
                    <Tag variant="neutral">{fmtDateTime(entry.created_at)}</Tag>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={changeTableTarget !== null}
        title="Trocar tabela de comissão"
        message={`Trocar a tabela de comissão de "${partner?.name ?? ""}"? A troca fica registrada no histórico.`}
        confirmLabel="Confirmar"
        onConfirm={confirmChangeTable}
        onCancel={() => setChangeTableTarget(null)}
      >
        <Dropdown
          label="Nova tabela de comissão"
          options={tableOptions}
          value={tableOptions.find((o) => o.value === String(changeTableTarget)) ?? null}
          onValueSelected={(opt) => setChangeTableTarget(Number(opt.value))}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={statusDialogOpen}
        message={
          partner?.status === "ativo"
            ? `Desativar o parceiro "${partner?.name ?? ""}"? Ele some da listagem padrão, mas o vínculo e o histórico continuam preservados — pode ser reativado depois.`
            : `Reativar o parceiro "${partner?.name ?? ""}"?`
        }
        onConfirm={confirmToggleStatus}
        onCancel={() => setStatusDialogOpen(false)}
      />
    </div>
  );
}
