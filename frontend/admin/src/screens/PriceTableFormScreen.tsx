import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Checkbox, CurrencyInput, InputBase, NumberSpinInput } from "design-system";
import api from "../api";
import Breadcrumb from "../components/Breadcrumb";
import { parseApiError } from "../lib/apiErrors";
import type { PriceTable } from "../types";
import styles from "./ComboFormScreen.module.scss";

// ORD-162 — criação/edição de tabela de preço comercial (superadmin/admin).
// Espelha ComboFormScreen (H1, Breadcrumb, Voltar/Salvar, .panel) e o padrão
// de lista dinâmica editável inline (useState<Row[]> + updateRow/removeRow/
// addRow local, sem componente genérico reutilizável — não existe um hoje,
// ver OptionGroupFormScreen). Edição só é permitida com a tabela em
// "draft" — o backend bloqueia com 409 se não for; o botão Salvar some da
// tela pra status diferente de draft antes mesmo de tentar (ver `readOnly`).

interface TierRow {
  key: string;
  min_transactions: number;
  max_transactions: number | null;
  openEnded: boolean;
  price_per_transaction: number | null;
}

let rowSeq = 0;
function newTierRow(min = 0): TierRow {
  rowSeq += 1;
  return { key: `new-${rowSeq}`, min_transactions: min, max_transactions: null, openEnded: false, price_per_transaction: null };
}

export default function PriceTableFormScreen() {
  const { id } = useParams<{ id: string }>();
  const editingId = id ? Number(id) : null;
  const navigate = useNavigate();

  const [loading, setLoading] = useState(editingId !== null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  const [name, setName] = useState("");
  const [totemPrice1, setTotemPrice1] = useState<number | null>(null);
  const [multiplier2, setMultiplier2] = useState<number | null>(0.5);
  const [multiplier35, setMultiplier35] = useState<number | null>(0.3);
  const [tiers, setTiers] = useState<TierRow[]>([newTierRow()]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingId === null) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const r = await api.get<PriceTable>(`/commercial/price-tables/${editingId}`);
        if (cancelled) return;
        const t = r.data;
        setName(t.name);
        setTotemPrice1(t.totem_price_1);
        setMultiplier2(t.totem_multiplier_2);
        setMultiplier35(t.totem_multiplier_3_5);
        setTiers(
          t.transaction_tiers.length > 0
            ? t.transaction_tiers.map((tier) => {
                rowSeq += 1;
                return {
                  key: `existing-${tier.id}`,
                  min_transactions: tier.min_transactions,
                  max_transactions: tier.max_transactions,
                  openEnded: tier.max_transactions === null,
                  price_per_transaction: tier.price_per_transaction,
                };
              })
            : [newTierRow()]
        );
        setReadOnly(t.status !== "draft");
      } catch {
        if (!cancelled) setLoadError("Erro ao carregar tabela de preço.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  function updateTier(key: string, patch: Partial<TierRow>) {
    setTiers((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }

  function removeTier(key: string) {
    setTiers((prev) => prev.filter((t) => t.key !== key));
  }

  function addTier() {
    // Sugere o próximo min_transactions logo depois do teto da última faixa,
    // pra já nascer contíguo na maioria dos casos — usuário pode ajustar.
    const last = tiers[tiers.length - 1];
    const suggestedMin = last && last.max_transactions !== null ? last.max_transactions + 1 : 0;
    setTiers((prev) => [...prev, newTierRow(suggestedMin)]);
  }

  const canSave =
    !saving &&
    !readOnly &&
    name.trim().length > 0 &&
    totemPrice1 !== null && totemPrice1 > 0 &&
    multiplier2 !== null && multiplier2 > 0 &&
    multiplier35 !== null && multiplier35 > 0;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setFormError("");
    try {
      const body = {
        name: name.trim(),
        totem_price_1: totemPrice1,
        totem_multiplier_2: multiplier2,
        totem_multiplier_3_5: multiplier35,
        transaction_tiers: tiers
          .filter((t) => t.price_per_transaction !== null)
          .map((t) => ({
            min_transactions: t.min_transactions,
            max_transactions: t.openEnded ? null : t.max_transactions,
            price_per_transaction: t.price_per_transaction,
          })),
      };
      if (editingId === null) {
        await api.post("/commercial/price-tables", body);
      } else {
        await api.put(`/commercial/price-tables/${editingId}`, body);
      }
      navigate("/commercial/price-tables");
    } catch (err) {
      setFormError(parseApiError(err).message || "Erro ao salvar tabela de preço.");
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
          { label: "Comercial", href: "/commercial/price-tables" },
          { label: "Tabelas de preço", href: "/commercial/price-tables" },
          { label: editingId === null ? "Nova tabela" : "Editar tabela" },
        ]}
      />
      <div className={styles.header}>
        <h1 className={styles.h1}>{editingId === null ? "Nova tabela de preço" : "Editar tabela de preço"}</h1>
        <div className={styles.headerActions}>
          <Button variant="secondary" onClick={() => navigate("/commercial/price-tables")}>Voltar</Button>
          {!readOnly && <Button onClick={save} disabled={!canSave} loading={saving}>Salvar tabela</Button>}
        </div>
      </div>

      {readOnly && (
        <div className={styles.alertBox}>
          <Alert variant="warning" text="Esta tabela não está em rascunho — não pode ser editada. Duplique-a na lista para criar uma cópia editável." fullWidth />
        </div>
      )}

      {formError && <div className={styles.alertBox}><Alert variant="error" text={formError} fullWidth /></div>}

      <div className={styles.panel}>
        <InputBase
          label="Nome da tabela"
          placeholder="ex: Tabela 2026-Q4"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={readOnly}
          autoFocus
        />
        <div className={styles.formRow}>
          <div className={styles.formRowField}>
            <CurrencyInput label="Preço do 1º totem" value={totemPrice1} onChange={(v: number) => setTotemPrice1(v)} disabled={readOnly} />
          </div>
          <div className={styles.formRowField}>
            <div className={styles.formLabel}>Multiplicador do 2º totem</div>
            <NumberSpinInput
              typeable
              step={0.05}
              minValue={0.01}
              maxValue={1}
              disabled={readOnly}
              helperMessage="ex: 0,5 = metade do preço do 1º totem"
              value={multiplier2 ?? 0.5}
              onChange={(v?: number) => setMultiplier2(v ?? null)}
            />
          </div>
          <div className={styles.formRowField}>
            <div className={styles.formLabel}>Multiplicador do 3º ao 5º totem</div>
            <NumberSpinInput
              typeable
              step={0.05}
              minValue={0.01}
              maxValue={1}
              disabled={readOnly}
              helperMessage="ex: 0,3 = 30% do preço do 1º totem, cada"
              value={multiplier35 ?? 0.3}
              onChange={(v?: number) => setMultiplier35(v ?? null)}
            />
          </div>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.formLabel}>
          Faixas de taxa transacional (por volume de transações/mês)
        </div>
        {tiers.map((t) => (
          <div key={t.key} className={styles.formRow}>
            <div className={styles.formRowField}>
              <NumberSpinInput
                typeable
                step={1}
                minValue={0}
                disabled={readOnly}
                helperMessage="De (transações/mês)"
                value={t.min_transactions}
                onChange={(v?: number) => updateTier(t.key, { min_transactions: v ?? 0 })}
              />
            </div>
            <div className={styles.formRowField}>
              <NumberSpinInput
                typeable
                step={1}
                minValue={t.min_transactions}
                disabled={readOnly || t.openEnded}
                helperMessage="Até (transações/mês)"
                value={t.max_transactions ?? t.min_transactions}
                onChange={(v?: number) => updateTier(t.key, { max_transactions: v ?? null })}
              />
              <Checkbox
                id={`tier-open-${t.key}`}
                label="Sem teto (última faixa)"
                checked={t.openEnded}
                disabled={readOnly}
                onChange={(checked) => updateTier(t.key, { openEnded: checked, max_transactions: checked ? null : t.min_transactions })}
              />
            </div>
            <div className={styles.formRowField}>
              <CurrencyInput
                label="Preço por transação"
                value={t.price_per_transaction}
                onChange={(v: number) => updateTier(t.key, { price_per_transaction: v })}
                disabled={readOnly}
              />
            </div>
            {!readOnly && (
              <button type="button" className={styles.removeBtn} onClick={() => removeTier(t.key)} title="Remover faixa">✕</button>
            )}
          </div>
        ))}
        {!readOnly && (
          <Button type="button" size="small" variant="secondary" onClick={addTier}>+ Adicionar faixa</Button>
        )}
      </div>
    </div>
  );
}
