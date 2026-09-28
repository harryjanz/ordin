import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Button, CurrencyInput, DateInput, InputBase, Tag, TextArea } from "design-system";
import api from "../api";
import Breadcrumb from "../components/Breadcrumb";
import { parseApiError } from "../lib/apiErrors";
import type { CommissionTable, CommissionTableHistoryEntry, Partner } from "../types";
import styles from "./ComboFormScreen.module.scss";

// ORD-209 — criação/edição de tabela de comissão de parceiro (ORD-206),
// molde de PartnerFormScreen (é quem tem o painel de histórico mais
// parecido — CommissionTableHistory é histórico de VALOR, diferente de
// PartnerHistoryEntry que é histórico de VÍNCULO).

function isoToBr(iso: string): string {
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function brToIsoDatetime(brDate: string): string | undefined {
  const m = brDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T00:00:00` : undefined;
}

// Percentual digitado por extenso (ex: "3,5" ou "3.5"), não em modo de
// máscara "estilo centavos" — NumberSpinInput com decimalDigits tem a
// mesma armadilha já documentada em PriceTableFormScreen (digitar "3,5"
// naturalmente vira "0,35"), e aqui não dá pra contornar limitando a
// porcentagem a inteiros (diferente do multiplicador do PriceTable,
// comissão real pode ter casas decimais, ex: 2,75%).
function parsePercent(text: string): number | null {
  const normalized = text.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return value >= 0 && value <= 100 ? value : null;
}

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.formRowField}>
      <span className={styles.formLabel}>{label}</span>
      <div style={{ fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const FIELD_LABEL: Record<string, string> = {
  setup_fee_per_totem: "Setup por totem",
  recurring_percent: "% recorrente",
  vigente_desde: "Vigente desde",
  is_default: "Padrão",
};

function fmtHistoryValue(field: string, value: string | null): string {
  if (value === null) return "—";
  if (field === "setup_fee_per_totem") return fmtBRL(Number(value));
  if (field === "recurring_percent") return `${value}%`;
  if (field === "vigente_desde") return isoToBr(value);
  if (field === "is_default") return value === "true" ? "sim" : "não";
  return value;
}

export default function CommissionTableFormScreen() {
  const { id } = useParams<{ id: string }>();
  const editingId = id ? Number(id) : null;
  const navigate = useNavigate();

  const [loading, setLoading] = useState(editingId !== null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [table, setTable] = useState<CommissionTable | null>(null);
  const readOnly = table?.archived_at != null;

  const [name, setName] = useState("");
  const [setupFee, setSetupFee] = useState<number | null>(null);
  const [recurringPercentText, setRecurringPercentText] = useState("");
  const [vigenteDesde, setVigenteDesde] = useState(() => new Date().toLocaleDateString("pt-BR"));
  const [note, setNote] = useState("");
  const [noteRequired, setNoteRequired] = useState(false);

  const [history, setHistory] = useState<CommissionTableHistoryEntry[]>([]);
  const [linkedPartnersCount, setLinkedPartnersCount] = useState<number | null>(null);

  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Note obrigatória (backend) sempre que já existe uma tabela padrão no
  // sistema — hint client-side pra não deixar o 422 ser a única pista
  // (achado do repasse de PM/Administrativo). Reaproveita o mesmo GET que
  // a lista já usa, sem custo extra de endpoint novo.
  useEffect(() => {
    if (editingId !== null) return;
    let cancelled = false;
    async function checkExistingDefault() {
      try {
        const r = await api.get("/commercial/commission-tables", { params: { archived: true } });
        const tables: CommissionTable[] = r.data.commission_tables ?? [];
        if (!cancelled) setNoteRequired(tables.some((t) => t.is_default));
      } catch {
        // silencioso — pior caso, o hint não aparece e o 422 do backend ainda protege
      }
    }
    checkExistingDefault();
    return () => { cancelled = true; };
  }, [editingId]);

  useEffect(() => {
    if (editingId === null) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const r = await api.get<CommissionTable>(`/commercial/commission-tables/${editingId}`);
        if (cancelled) return;
        const t = r.data;
        setTable(t);
        setName(t.name);
        setSetupFee(t.setup_fee_per_totem);
        setRecurringPercentText(String(t.recurring_percent).replace(".", ","));
        setVigenteDesde(isoToBr(t.vigente_desde));
        setNote(t.note ?? "");
        // Backend exige note em qualquer edição de tabela que não é a
        // padrão (independente de já existir outra padrão no sistema) —
        // regra distinta da de criação, checada separadamente aqui.
        setNoteRequired(!t.is_default);

        const h = await api.get<{ entries: CommissionTableHistoryEntry[] }>(`/commercial/commission-tables/${editingId}/history`);
        if (!cancelled) setHistory(h.data.entries ?? []);

        // Contagem exata de parceiros afetados (decisão do repasse de
        // Financeiro — Alert genérico não era suficiente pra edição que
        // mexe com comissão de terceiro).
        const p = await api.get<{ partners: Partner[] }>("/commercial/partners");
        if (!cancelled) {
          const count = (p.data.partners ?? []).filter((partner) => partner.commission_table.id === editingId).length;
          setLinkedPartnersCount(count);
        }
      } catch {
        if (!cancelled) setLoadError("Erro ao carregar tabela de comissão.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const vigenteDesdeIso = brToIsoDatetime(vigenteDesde);
  const recurringPercent = parsePercent(recurringPercentText);

  const canSave =
    !saving &&
    !readOnly &&
    name.trim().length > 0 &&
    setupFee !== null && setupFee >= 0 &&
    recurringPercent !== null &&
    vigenteDesdeIso !== undefined &&
    (!noteRequired || note.trim().length >= 10);

  async function save() {
    if (!canSave || vigenteDesdeIso === undefined || recurringPercent === null) return;
    setSaving(true);
    setFormError("");
    try {
      const body = {
        name: name.trim(),
        setup_fee_per_totem: setupFee,
        recurring_percent: recurringPercent,
        note: note.trim() || null,
        vigente_desde: vigenteDesdeIso,
      };
      if (editingId === null) {
        await api.post("/commercial/commission-tables", body);
      } else {
        await api.put(`/commercial/commission-tables/${editingId}`, body);
      }
      navigate("/commercial/commission-tables");
    } catch (err) {
      setFormError(parseApiError(err).message || "Erro ao salvar tabela de comissão.");
    } finally {
      setSaving(false);
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

  return (
    <div className={styles.page}>
      <Breadcrumb
        items={[
          { label: "Comercial", href: "/commercial/commission-tables" },
          { label: "Tabelas de comissão", href: "/commercial/commission-tables" },
          { label: editingId === null ? "Nova tabela" : readOnly ? "Ver tabela" : "Editar tabela" },
        ]}
      />
      <div className={styles.header}>
        <h1 className={styles.h1}>
          {editingId === null ? "Nova tabela de comissão" : readOnly ? "Ver tabela de comissão" : "Editar tabela de comissão"}
        </h1>
        <div className={styles.headerActions}>
          <Button variant="secondary" onClick={() => navigate("/commercial/commission-tables")}>Voltar</Button>
          {!readOnly && <Button onClick={save} disabled={!canSave} loading={saving}>Salvar tabela</Button>}
        </div>
      </div>

      {readOnly && (
        <div className={styles.alertBox}>
          <Alert
            variant="neutral"
            icon="info"
            text="Esta tabela está arquivada e não pode mais ser editada — nenhum parceiro está vinculado a ela."
            fullWidth
          />
        </div>
      )}

      {!readOnly && editingId !== null && linkedPartnersCount !== null && linkedPartnersCount > 0 && (
        <div className={styles.alertBox}>
          <Alert
            variant="warning"
            text={
              `Editar os valores desta tabela afeta a comissão de ${linkedPartnersCount} ` +
              `${linkedPartnersCount === 1 ? "parceiro vinculado" : "parceiros vinculados"} a ela a partir de agora. ` +
              "Os novos valores substituem os atuais para qualquer cálculo que vier a consultar esta tabela — " +
              "o histórico abaixo preserva os valores antigos para auditoria."
            }
            fullWidth
          />
        </div>
      )}

      {formError && <div className={styles.alertBox}><Alert variant="error" text={formError} fullWidth /></div>}

      <div className={styles.panel}>
        {readOnly ? (
          <>
            <ReadOnlyField label="Nome da tabela" value={name} />
            <div className={styles.formRow}>
              <ReadOnlyField label="Setup por totem" value={fmtBRL(setupFee ?? 0)} />
              <ReadOnlyField label="% recorrente" value={`${recurringPercent ?? 0}%`} />
              <ReadOnlyField label="Vigente desde" value={vigenteDesde} />
            </div>
          </>
        ) : (
          <>
            <InputBase label="Nome da tabela*" placeholder="ex: Acordo especial — Fulano" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <div className={styles.formRow}>
              <div className={styles.formRowField}>
                <CurrencyInput label="Setup por totem*" value={setupFee} onChange={(v: number) => setSetupFee(v)} />
              </div>
              <div className={styles.formRowField}>
                <InputBase
                  label="% recorrente*"
                  placeholder="ex: 3,5"
                  value={recurringPercentText}
                  onChange={(e) => setRecurringPercentText(e.target.value)}
                  errorMessage={recurringPercentText.length > 0 && recurringPercent === null ? "Use um número de 0 a 100, ex: 3,5" : undefined}
                  helperMessage="Percentual direto — ex: 3,5 = 3,5% de comissão recorrente"
                />
              </div>
              <div className={styles.formRowField}>
                <DateInput
                  label="Vigente desde*"
                  value={vigenteDesde}
                  onChange={(value) => setVigenteDesde(value)}
                  helperMessage="Só informativo — quem define a tabela usada nos cálculos é 'Marcar como padrão'."
                />
              </div>
            </div>
            <TextArea
              label={noteRequired ? "Nota (obrigatória)*" : "Nota"}
              placeholder="Ex: acordo especial com Fulano de Tal — comissão reduzida no primeiro semestre"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              helperMessage={
                noteRequired
                  ? "Já existe uma tabela padrão — registre o motivo e, sempre que possível, com qual parceiro ou negociação este valor foi acordado (mínimo 10 caracteres)."
                  : "Registre com qual parceiro ou negociação este valor foi acordado, se houver um específico."
              }
            />
          </>
        )}
      </div>

      {editingId !== null && (
        <div className={styles.panel}>
          <h2 className={styles.h2}>Histórico de alterações</h2>
          {history.length === 0 ? (
            <div className={styles.searchEmpty}>Esta tabela nunca teve valor alterado.</div>
          ) : (
            <div className={styles.comboItemsBox}>
              {history.map((entry, index) => (
                <div key={index} className={styles.comboItemRow}>
                  <div className={styles.comboItemInfo}>
                    <span>
                      {FIELD_LABEL[entry.field_changed] ?? entry.field_changed}: {fmtHistoryValue(entry.field_changed, entry.old_value)} → {fmtHistoryValue(entry.field_changed, entry.new_value)}
                    </span>
                    <Tag variant="neutral">{fmtDateTime(entry.created_at)}</Tag>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
