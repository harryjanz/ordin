import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Button, InputBase } from "design-system";
import api from "../api";
import Breadcrumb from "../components/Breadcrumb";
import { formatCnpj } from "../lib/masks";
import { isValidCnpj, normalizeCnpj } from "../lib/validators";
import { parseApiError } from "../lib/apiErrors";
import type { Supplier } from "../types";
// ORD-182 (A6) — mesmo racional já registrado na FiscalAddonPlanFormScreen/
// PriceTableFormScreen: sem componente genérico de formulário compartilhado
// pra este tipo de tela, reaproveita o mesmo stylesheet (.page, .header,
// .h1, .panel, .formRowField).
import styles from "./ComboFormScreen.module.scss";

export default function SupplierFormScreen() {
  const { id } = useParams<{ id: string }>();
  const editingId = id ? Number(id) : null;
  const navigate = useNavigate();

  const [loading, setLoading] = useState(editingId !== null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingId === null) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const r = await api.get<Supplier>(`/catalog/suppliers/${editingId}`);
        if (cancelled) return;
        const s = r.data;
        setNome(s.nome);
        setCnpj(s.cnpj);
        setTelefone(s.telefone ?? "");
        setEmail(s.email ?? "");
      } catch {
        if (!cancelled) setLoadError("Erro ao carregar fornecedor.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const canSave = !saving && nome.trim().length > 0 && isValidCnpj(cnpj);

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setFormError("");
    try {
      const body = {
        nome: nome.trim(),
        cnpj: normalizeCnpj(cnpj),
        telefone: telefone.trim() || null,
        email: email.trim() || null,
      };
      if (editingId === null) {
        await api.post("/catalog/suppliers", body);
      } else {
        await api.put(`/catalog/suppliers/${editingId}`, body);
      }
      navigate("/suppliers");
    } catch (err) {
      setFormError(parseApiError(err).message || "Erro ao salvar fornecedor.");
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
          { label: "Fornecedores", href: "/suppliers" },
          { label: editingId === null ? "Novo fornecedor" : "Editar fornecedor" },
        ]}
      />
      <div className={styles.header}>
        <h1 className={styles.h1}>{editingId === null ? "Novo fornecedor" : "Editar fornecedor"}</h1>
        <div className={styles.headerActions}>
          <Button variant="secondary" onClick={() => navigate("/suppliers")}>Voltar</Button>
          <Button onClick={save} disabled={!canSave} loading={saving}>Salvar fornecedor</Button>
        </div>
      </div>

      {formError && <div className={styles.alertBox}><Alert variant="error" text={formError} fullWidth /></div>}

      <div className={styles.panel}>
        <InputBase
          label="Nome*"
          placeholder="ex: Distribuidora ABC Ltda"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoFocus
        />
        <div className={styles.formRow}>
          <div className={styles.formRowField}>
            <InputBase
              label="CNPJ*"
              placeholder="XX.XXX.XXX/XXXX-XX"
              value={formatCnpj(cnpj)}
              onChange={(e) => setCnpj(e.target.value)}
              errorMessage={cnpj.length > 0 && !isValidCnpj(cnpj) ? "CNPJ inválido" : undefined}
            />
          </div>
        </div>
        <div className={styles.formRow}>
          <div className={styles.formRowField}>
            <InputBase
              label="Telefone"
              placeholder="(11) 99999-9999"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
            />
          </div>
          <div className={styles.formRowField}>
            <InputBase
              label="E-mail"
              placeholder="contato@fornecedor.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
