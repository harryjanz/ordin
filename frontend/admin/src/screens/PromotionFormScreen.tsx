import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Dropdown,
  InputBase,
  NumberSpinInput,
  Tag,
  type DropdownOptions,
} from "design-system";
import api from "../api";
import Breadcrumb from "../components/Breadcrumb";
import { parseApiError } from "../lib/apiErrors";
import { useCatalogParams } from "../lib/catalogParams";
import type { Category, Combo, Product, Promotion, PromotionItem } from "../types";
import styles from "./ComboFormScreen.module.scss";

// ORD-166 — tela dedicada de criação/edição de promoção, espelha
// ComboFormScreen (busca por nome mostrando só resultados filtrados, itens
// adicionados numa lista separada com remoção individual) e o gate de
// somente-leitura de PriceTableFormScreen (is_enabled=true não permite
// edição direta — o admin precisa inativar primeiro, mesmo padrão de
// "tabela usada não é editável", decisão confirmada pelo usuário no QA
// Explorer). Precedência do desconto efetivo por item: produto/combo >
// categoria > geral — mostrado sempre calculado ao lado de cada item da
// composição, com marcação visual quando é override (ver wireframe do
// Explorer).
type ItemType = "category" | "product" | "combo";

interface DraftItem {
  key: string; // `${item_type}-${id}` — estável mesmo antes de salvar
  item_type: ItemType;
  id: number;
  name: string;
  discount_percent_override: number | null;
  available: boolean;
}

function toDraftItem(i: PromotionItem, categories: Category[], products: Product[], combos: Combo[]): DraftItem {
  const id = i.category_id ?? i.product_id ?? i.combo_id ?? 0;
  const name =
    i.item_type === "category" ? categories.find((c) => c.id === id)?.name ?? "—"
    : i.item_type === "product" ? products.find((p) => p.id === id)?.name ?? "—"
    : combos.find((c) => c.id === id)?.name ?? "—";
  return {
    key: `${i.item_type}-${id}`, item_type: i.item_type, id, name,
    discount_percent_override: i.discount_percent_override, available: i.available,
  };
}

function splitDateTime(iso: string): { date: string; time: string } {
  // O backend devolve datetime naive (ex: "2026-09-20T18:00:00") — sem
  // conversão de timezone, mesma convenção naive-UTC do resto do projeto.
  const [date, timePart] = iso.split("T");
  return { date: date ?? "", time: (timePart ?? "00:00:00").slice(0, 5) };
}

export default function PromotionFormScreen() {
  const { id } = useParams<{ id: string }>();
  const editingId = id ? Number(id) : null;
  const navigate = useNavigate();
  const catalogParams = useCatalogParams();

  const [loading, setLoading] = useState(editingId !== null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<Promotion["status"]>("rascunho");
  const [conflicts, setConflicts] = useState<Promotion["conflicts"]>([]);
  const readOnly = status === "ativa"; // is_enabled=true — ver docstring acima

  const [name, setName] = useState("");
  const [startsDate, setStartsDate] = useState("");
  const [startsTime, setStartsTime] = useState("");
  const [endsDate, setEndsDate] = useState("");
  const [endsTime, setEndsTime] = useState("");
  const [generalDiscount, setGeneralDiscount] = useState<number | null>(10);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [searchType, setSearchType] = useState<ItemType>("category");
  const [searchName, setSearchName] = useState("");

  useEffect(() => {
    api.get("/catalog/categories", catalogParams({ include_inactive: true })).then((r) => {
      setCategories(r.data.categories ?? r.data);
    }).catch(() => {});
    api.get("/catalog/products", catalogParams({ include_inactive: true })).then((r) => {
      setProducts(r.data.products ?? r.data);
    }).catch(() => {});
    api.get("/catalog/combos", catalogParams({ include_inactive: true })).then((r) => {
      setCombos(r.data.combos ?? r.data);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (editingId === null || categories.length + products.length + combos.length === 0) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const r = await api.get<Promotion>(`/catalog/promotions/${editingId}`, catalogParams());
        if (cancelled) return;
        const p = r.data;
        setName(p.name);
        const s = splitDateTime(p.starts_at);
        const e = splitDateTime(p.ends_at);
        setStartsDate(s.date); setStartsTime(s.time);
        setEndsDate(e.date); setEndsTime(e.time);
        setGeneralDiscount(p.general_discount_percent);
        setItems(p.items.map((i) => toDraftItem(i, categories, products, combos)));
        setStatus(p.status);
        setConflicts(p.conflicts);
      } catch {
        if (!cancelled) setLoadError("Erro ao carregar promoção.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, categories.length, products.length, combos.length]);

  const searchTypeOptions: DropdownOptions[] = [
    { value: "category", label: "Categoria" },
    { value: "product", label: "Produto" },
    { value: "combo", label: "Combo" },
  ];

  const searchPool = searchType === "category" ? categories : searchType === "product" ? products : combos;
  const searchResults = searchName.trim().length > 0
    ? searchPool.filter((x) => {
        if (items.some((i) => i.item_type === searchType && i.id === x.id)) return false;
        return x.name.toLowerCase().includes(searchName.trim().toLowerCase());
      })
    : [];

  function addItem(itemType: ItemType, entity: { id: number; name: string }) {
    setItems((prev) => [
      ...prev,
      { key: `${itemType}-${entity.id}`, item_type: itemType, id: entity.id, name: entity.name, discount_percent_override: null, available: true },
    ]);
    setSearchName("");
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  function setItemOverride(key: string, value: number | null) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, discount_percent_override: value } : i)));
  }

  const canSave =
    !saving && !readOnly &&
    name.trim().length > 0 &&
    !!startsDate && !!startsTime && !!endsDate && !!endsTime &&
    generalDiscount !== null && generalDiscount >= 0 && generalDiscount <= 100 &&
    items.length > 0;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setFormError("");
    try {
      const body = {
        name: name.trim(),
        starts_at: `${startsDate}T${startsTime}:00`,
        ends_at: `${endsDate}T${endsTime}:00`,
        general_discount_percent: generalDiscount,
        items: items.map((i) => ({
          item_type: i.item_type,
          category_id: i.item_type === "category" ? i.id : null,
          product_id: i.item_type === "product" ? i.id : null,
          combo_id: i.item_type === "combo" ? i.id : null,
          discount_percent_override: i.discount_percent_override,
        })),
      };
      if (editingId === null) {
        await api.post("/catalog/promotions", body, catalogParams());
      } else {
        await api.put(`/catalog/promotions/${editingId}`, body, catalogParams());
      }
      navigate("/catalog?tab=promotions");
    } catch (err) {
      setFormError(parseApiError(err).message || "Erro ao salvar promoção.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(nextEnabled: boolean) {
    if (editingId === null) return;
    setTogglingEnabled(true);
    setFormError("");
    try {
      const r = await api.patch<Promotion>(`/catalog/promotions/${editingId}`, { is_enabled: nextEnabled }, catalogParams());
      setStatus(r.data.status);
      setConflicts(r.data.conflicts);
    } catch (err) {
      setFormError(parseApiError(err).message || "Erro ao alterar a promoção.");
    } finally {
      setTogglingEnabled(false);
    }
  }

  const statusTagVariant = useMemo(() => {
    switch (status) {
      case "ativa": return "success" as const;
      case "conflito": return "error" as const;
      case "expirada": return "neutral" as const;
      default: return "warning" as const;
    }
  }, [status]);

  const statusLabel: Record<Promotion["status"], string> = {
    rascunho: "Rascunho", ativa: "Ativa", expirada: "Expirada", conflito: "Conflito",
  };

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
          { label: "Catálogo", href: "/catalog" },
          { label: "Promoções", href: "/catalog?tab=promotions" },
          { label: editingId === null ? "Nova promoção" : "Editar promoção" },
        ]}
      />
      <div className={styles.header}>
        <h1 className={styles.h1}>
          {editingId === null ? "Nova promoção" : "Editar promoção"}
          {editingId !== null && <Tag variant={statusTagVariant}>{statusLabel[status]}</Tag>}
        </h1>
        <div className={styles.headerActions}>
          <Button variant="secondary" onClick={() => navigate("/catalog?tab=promotions")}>Voltar</Button>
          {editingId !== null && (
            readOnly ? (
              <Button variant="secondary" onClick={() => toggleEnabled(false)} loading={togglingEnabled}>Inativar</Button>
            ) : (
              <Button variant="secondary" onClick={() => toggleEnabled(true)} loading={togglingEnabled}>Ativar</Button>
            )
          )}
          {!readOnly && <Button onClick={save} disabled={!canSave} loading={saving}>Salvar promoção</Button>}
        </div>
      </div>

      {readOnly && (
        <div className={styles.alertBox}>
          <Alert variant="warning" text="Promoção ativa não pode ser editada direto — inative primeiro (botão acima), edite, e ative de novo." fullWidth />
        </div>
      )}

      {conflicts.length > 0 && (
        <div className={styles.alertBox}>
          <Alert
            variant="error"
            fullWidth
            text={
              "Ativação bloqueada por conflito: " +
              conflicts.map((c) => `"${c.promotion_name}" (${c.product_ids.length + c.combo_ids.length} item(ns) em comum)`).join("; ")
            }
          />
        </div>
      )}

      {formError && <div className={styles.alertBox}><Alert variant="error" text={formError} fullWidth /></div>}

      <div className={styles.panel}>
        <InputBase label="Nome da promoção" placeholder="ex: Happy Hour Bebidas" value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} autoFocus />
        <div className={styles.formRow}>
          <div className={styles.formRowField}>
            <InputBase label="Início — data" type="date" value={startsDate} onChange={(e) => setStartsDate(e.target.value)} disabled={readOnly} />
          </div>
          <div className={styles.formRowField}>
            <InputBase label="Início — hora" type="time" value={startsTime} onChange={(e) => setStartsTime(e.target.value)} disabled={readOnly} />
          </div>
          <div className={styles.formRowField}>
            <InputBase label="Fim — data" type="date" value={endsDate} onChange={(e) => setEndsDate(e.target.value)} disabled={readOnly} />
          </div>
          <div className={styles.formRowField}>
            <InputBase label="Fim — hora" type="time" value={endsTime} onChange={(e) => setEndsTime(e.target.value)} disabled={readOnly} />
          </div>
        </div>
        <div className={styles.formRowField} style={{ maxWidth: 220 }}>
          <NumberSpinInput
            label="Desconto geral"
            typeable
            step={5}
            minValue={0}
            maxValue={100}
            suffix="%"
            disabled={readOnly}
            helperMessage="Aplicado a todos os itens abaixo, salvo override individual"
            value={generalDiscount ?? 0}
            onChange={(v?: number) => setGeneralDiscount(v ?? null)}
          />
        </div>
      </div>

      {!readOnly && (
        <div className={styles.panel}>
          <div className={styles.formLabel}>Buscar categoria, produto ou combo pra adicionar</div>
          {/* ORD-166 (ajuste pós-teste manual) — .searchRow do ComboFormScreen
              é "1fr 200px" (pensado pro filtro de categoria estreito do
              combo); aqui os dois campos precisam de 50/50 — override local
              via style, sem mexer na classe compartilhada. */}
          <div className={styles.searchRow} style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className={styles.searchRowField}>
              <Dropdown
                label=""
                value={searchTypeOptions.find((o) => o.value === searchType) ?? searchTypeOptions[0]}
                onValueSelected={(opt) => { setSearchType(opt.value as ItemType); setSearchName(""); }}
                options={searchTypeOptions}
              />
            </div>
            <div className={styles.searchRowField}>
              <InputBase placeholder="Buscar por nome…" value={searchName} onChange={(e) => setSearchName(e.target.value)} />
            </div>
          </div>
          <div className={styles.searchResults}>
            {searchName.trim().length === 0 && (
              <div className={styles.searchEmpty}>Digite um nome pra buscar {searchType === "category" ? "categorias" : searchType === "product" ? "produtos" : "combos"} do catálogo.</div>
            )}
            {searchName.trim().length > 0 && searchResults.length === 0 && (
              <div className={styles.searchEmpty}>Nenhum resultado (ou já está na composição).</div>
            )}
            {searchResults.map((x) => (
              <div key={x.id} className={styles.searchResultRow}>
                <div className={styles.searchResultInfo}>
                  <span>{x.name}</span>
                </div>
                <Button size="small" variant="secondary" onClick={() => addItem(searchType, x)}>+ Adicionar</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.panel}>
        <div className={styles.formLabel}>
          {items.length} {items.length === 1 ? "item" : "itens"} na composição
        </div>
        <div className={styles.comboItemsBox}>
          {items.length === 0 && (
            <div className={styles.searchEmpty}>Nenhum item adicionado ainda — busque acima.</div>
          )}
          {items.map((i) => {
            const itemTypeLabel = i.item_type === "category" ? "Categoria" : i.item_type === "product" ? "Produto" : "Combo";
            const effective = i.discount_percent_override ?? generalDiscount ?? 0;
            return (
              <div key={i.key} className={styles.comboItemRow}>
                <div className={styles.comboItemInfo}>
                  <Tag variant="neutral">{itemTypeLabel}</Tag>
                  <span>{i.name}</span>
                  {!i.available && <Tag variant="neutral">Indisponível</Tag>}
                  {i.discount_percent_override !== null ? (
                    <Tag variant="warning">{effective}% (override)</Tag>
                  ) : (
                    <span className={styles.muted}>{effective}% (geral)</span>
                  )}
                </div>
                <div className={styles.comboItemActions}>
                  {!readOnly && (
                    <>
                      <div style={{ width: 120 }}>
                        <NumberSpinInput
                          typeable
                          step={5}
                          minValue={0}
                          maxValue={100}
                          suffix="%"
                          value={i.discount_percent_override ?? undefined}
                          onChange={(v?: number) => setItemOverride(i.key, v ?? null)}
                        />
                      </div>
                      <button type="button" className={styles.removeBtn} onClick={() => removeItem(i.key)} title="Remover da composição">✕</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
