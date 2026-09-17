import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Button, CurrencyInput, InputBase } from "design-system";
import api from "../api";
import Breadcrumb from "../components/Breadcrumb";
import { parseApiError } from "../lib/apiErrors";
import type { FiscalAddonPlan } from "../types";
// ORD-174 — mesmo stylesheet de PriceTableFormScreen (.page, .header, .h1,
// .panel, .formRowField), reaproveitado por não existir componente
// genérico compartilhado pra formulário de catálogo comercial (mesmo
// racional já registrado na PriceTableFormScreen).
import styles from "./ComboFormScreen.module.scss";

// ORD-174 — criação/edição de plano de add-on fiscal (superadmin/admin).
// Espelha PriceTableFormScreen, bem mais simples: sem faixas de transação,
// sem status draft/active/historical — só nome + 2 preços. Edição só é
// permitida sem empresa vinculada — o backend bloqueia com 409 se não for.

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.formRowField}>
      <span className={styles.formLabel}>{label}</span>
      <div style={{ fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function FiscalAddonPlanFormScreen() {
  const { id } = useParams<{ id: string }>();
  const editingId = id ? Number(id) : null;
  const navigate = useNavigate();

  const [loading, setLoading] = useState(editingId !== null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [linkedCompaniesCount, setLinkedCompaniesCount] = useState(0);

  const [name, setName] = useState("");
  const [monthlyPrice, setMonthlyPrice] = useState<number | null>(null);
  const [pricePerDocument, setPricePerDocument] = useState<number | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingId === null) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const r = await api.get<FiscalAddonPlan>(`/commercial/fiscal-addon-plans/${editingId}`);
        if (cancelled) return;
        const p = r.data;
        setName(p.name);
        setMonthlyPrice(p.monthly_price);
        setPricePerDocument(p.price_per_document);
        setReadOnly(!p.editable);
        setLinkedCompaniesCount(p.linked_companies_count);
      } catch {
        if (!cancelled) setLoadError("Erro ao carregar plano do módulo fiscal.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const canSave =
    !saving && !readOnly &&
    name.trim().length > 0 &&
    monthlyPrice !== null && monthlyPrice > 0 &&
    pricePerDocument !== null && pricePerDocument > 0;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setFormError("");
    try {
      const body = { name: name.trim(), monthly_price: monthlyPrice, price_per_document: pricePerDocument };
      if (editingId === null) {
        await api.post("/commercial/fiscal-addon-plans", body);
      } else {
        await api.put(`/commercial/fiscal-addon-plans/${editingId}`, body);
      }
      navigate("/commercial/fiscal-addon-plans");
    } catch (err) {
      setFormError(parseApiError(err).message || "Erro ao salvar plano do módulo fiscal.");
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
          { label: "Comercial", href: "/commercial/fiscal-addon-plans" },
          { label: "Planos do módulo fiscal", href: "/commercial/fiscal-addon-plans" },
          { label: editingId === null ? "Novo plano" : readOnly ? "Ver plano" : "Editar plano" },
        ]}
      />
      <div className={styles.header}>
        <h1 className={styles.h1}>
          {editingId === null ? "Novo plano do módulo fiscal" : readOnly ? "Ver plano do módulo fiscal" : "Editar plano do módulo fiscal"}
        </h1>
        <div className={styles.headerActions}>
          <Button variant="secondary" onClick={() => navigate("/commercial/fiscal-addon-plans")}>Voltar</Button>
          {!readOnly && <Button onClick={save} disabled={!canSave} loading={saving}>Salvar plano</Button>}
        </div>
      </div>

      {readOnly && (
        <div className={styles.alertBox}>
          <Alert
            variant="warning"
            text={`${linkedCompaniesCount} ${linkedCompaniesCount === 1 ? "empresa está" : "empresas estão"} usando este plano agora — não pode ser editado nem excluído.`}
            fullWidth
          />
        </div>
      )}

      {formError && <div className={styles.alertBox}><Alert variant="error" text={formError} fullWidth /></div>}

      <div className={styles.panel}>
        {readOnly ? (
          <>
            <ReadOnlyField label="Nome do plano" value={name} />
            <div className={styles.formRow}>
              <ReadOnlyField label="Preço fixo/mês" value={fmtBRL(monthlyPrice ?? 0)} />
              <ReadOnlyField label="Preço por nota emitida" value={fmtBRL(pricePerDocument ?? 0)} />
            </div>
          </>
        ) : (
          <>
            <InputBase
              label="Nome do plano"
              placeholder="ex: Fiscal Básico"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <div className={styles.formRow}>
              <div className={styles.formRowField}>
                <CurrencyInput label="Preço fixo/mês" value={monthlyPrice} onChange={(v: number) => setMonthlyPrice(v)} />
              </div>
              <div className={styles.formRowField}>
                <CurrencyInput label="Preço por nota emitida" value={pricePerDocument} onChange={(v: number) => setPricePerDocument(v)} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
