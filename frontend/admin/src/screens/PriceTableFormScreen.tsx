import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Checkbox, CurrencyInput, InputBase, NumberSpinInput, Tag } from "design-system";
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
        setReadOnly(!t.editable);
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
    // Só a última faixa pode ficar "sem teto" — ao adicionar uma nova faixa
    // depois dela, a que era a última perde essa marcação automaticamente
    // (não faz mais sentido, e evita reabrir o bug de mais de uma faixa
    // aberta ao mesmo tempo). Sugere o próximo min_transactions logo depois
    // do teto resultante, pra já nascer contíguo — usuário pode ajustar.
    setTiers((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return [...prev, newTierRow(0)];
      if (!last.openEnded) {
        const suggestedMin = (last.max_transactions ?? last.min_transactions) + 1;
        return [...prev, newTierRow(suggestedMin)];
      }
      const demotedMax = last.min_transactions;
      const demoted = prev.map((t) =>
        t.key === last.key ? { ...t, openEnded: false, max_transactions: demotedMax } : t
      );
      return [...demoted, newTierRow(demotedMax + 1)];
    });
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
          <Alert variant="warning" text="Já existe empresa com plano comercial vinculado a esta tabela — não pode ser editada. Duplique-a na lista para criar uma cópia editável." fullWidth />
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
            <NumberSpinInput
              label="Multiplicador do 2º totem"
              typeable
              step={5}
              minValue={1}
              maxValue={100}
              suffix="%"
              disabled={readOnly}
              helperMessage="ex: 50% = metade do preço do 1º totem"
              // Digitado/exibido em porcentagem inteira (1-100), não em
              // fração decimal — o campo decimal (NumberSpinInput com
              // decimalDigits) tem uma armadilha real de digitação: digitar
              // "0,5" do jeito natural descarta a vírgula e vira "05" → 0,05
              // em vez de 0,5 (achado testando a tela, sem nenhum erro de
              // validação pra pegar o engano). Porcentagem inteira evita a
              // ambiguidade inteira — o valor enviado pra API continua
              // fração decimal (0-1), só a conversão é feita aqui.
              value={multiplier2 !== null ? Math.round(multiplier2 * 100) : 50}
              onChange={(v?: number) => setMultiplier2(v !== undefined ? v / 100 : null)}
            />
          </div>
          <div className={styles.formRowField}>
            <NumberSpinInput
              label="Multiplicador do 3º ao 5º totem"
              typeable
              step={5}
              minValue={1}
              maxValue={100}
              suffix="%"
              disabled={readOnly}
              helperMessage="ex: 30% = 30% do preço do 1º totem, cada"
              value={multiplier35 !== null ? Math.round(multiplier35 * 100) : 30}
              onChange={(v?: number) => setMultiplier35(v !== undefined ? v / 100 : null)}
            />
          </div>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.formLabel}>
          Faixas de taxa transacional (por volume de transações/mês)
        </div>
        {tiers.map((t, index) => {
          // "Sem teto" só existe de verdade na última faixa — em vez de um
          // checkbox em toda linha (permitindo, sem querer, mais de uma
          // faixa aberta ao mesmo tempo, achado testando a tela), só a
          // última mostra a opção. addTier() já cuida de "despromover" a
          // faixa anterior quando uma nova é adicionada depois dela.
          const isLast = index === tiers.length - 1;
          return (
            <div key={t.key} className={styles.formRow}>
              <div className={styles.formRowField}>
                <NumberSpinInput
                  label="De (transações/mês)"
                  typeable
                  step={1}
                  minValue={0}
                  disabled={readOnly}
                  value={t.min_transactions}
                  onChange={(v?: number) => updateTier(t.key, { min_transactions: v ?? 0 })}
                />
              </div>
              <div className={styles.formRowField}>
                {t.openEnded ? (
                  <div className={styles.openEndedBadge}>
                    <span className={styles.formLabel}>Até (transações/mês)</span>
                    <Tag variant="neutral">Sem teto — última faixa</Tag>
                  </div>
                ) : (
                  <NumberSpinInput
                    label="Até (transações/mês)"
                    typeable
                    step={1}
                    minValue={t.min_transactions}
                    disabled={readOnly}
                    value={t.max_transactions ?? t.min_transactions}
                    onChange={(v?: number) => updateTier(t.key, { max_transactions: v ?? null })}
                  />
                )}
                {isLast && (
                  <Checkbox
                    id={`tier-open-${t.key}`}
                    label="Esta é a última faixa (sem teto)"
                    checked={t.openEnded}
                    disabled={readOnly}
                    onChange={(checked) => updateTier(t.key, { openEnded: checked, max_transactions: checked ? null : t.min_transactions })}
                  />
                )}
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
          );
        })}
        {!readOnly && (
          <Button type="button" size="small" variant="secondary" onClick={addTier}>+ Adicionar faixa</Button>
        )}
      </div>
    </div>
  );
}
