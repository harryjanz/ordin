import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Button, CheckboxMultiselect, InputBase } from "design-system";
import api from "../api";
import SearchMultiSelect from "../components/SearchMultiSelect";
import { useCatalogParams } from "../lib/catalogParams";
import type { Category, Menu, Product } from "../types";
import styles from "./MenuFormScreen.module.scss";

// 0=segunda..6=domingo, mesmo datetime.weekday() do backend (ORD-125) —
// mesma constante de CatalogScreen.tsx.
const WEEKDAY_ABBR = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const WEEKDAY_OPTIONS = WEEKDAY_ABBR.map((label, i) => ({ value: String(i), label, disabled: false }));

interface MenuFormState {
  name: string;
  weekdays: string[];
  start_time: string;
  end_time: string;
  category_ids: string[];
  product_ids: string[];
}

const EMPTY_FORM: MenuFormState = {
  name: "", weekdays: [], start_time: "", end_time: "", category_ids: [], product_ids: [],
};

// ORD-136 — criação e edição de cardápio saem do modal (composição de
// categorias/produtos era "ruim de fazer" no espaço apertado) e ganham
// tela dedicada, com busca+dropdown (SearchMultiSelect) no lugar do
// CheckboxMultiselect sem busca. Mesmo componente serve os dois modos —
// :id ausente = criando, mesma ideia de MenuFormState único que já existia
// em CatalogScreen.
export default function MenuFormScreen() {
  const { id } = useParams<{ id: string }>();
  const editingMenuId = id ? Number(id) : null;
  const navigate = useNavigate();
  const catalogParams = useCatalogParams();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [menuForm, setMenuForm] = useState<MenuFormState>(EMPTY_FORM);
  const [menuFormError, setMenuFormError] = useState("");
  const [menuSaving, setMenuSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        // include_inactive nos dois — mesmo dado que CatalogScreen já
        // carregava pras abas Categorias/Produtos e reaproveitava na
        // composição do cardápio (comportamento existente, não mudado
        // aqui — só a apresentação virou tela dedicada com busca).
        const [categoriesRes, productsRes] = await Promise.all([
          api.get("/catalog/categories", catalogParams({ include_inactive: true })),
          api.get("/catalog/products", catalogParams({ include_inactive: true })),
        ]);
        if (cancelled) return;
        setCategories(categoriesRes.data.categories ?? categoriesRes.data);
        setProducts(productsRes.data.products ?? productsRes.data);

        if (editingMenuId !== null) {
          // Não existe GET /catalog/menus/{id} — só listagem. Reaproveita o
          // endpoint existente (ORD-136 Tech Explorer: zero mudança de
          // backend) buscando na lista completa.
          const menusRes = await api.get("/catalog/menus", catalogParams());
          const menus: Menu[] = menusRes.data.menus ?? menusRes.data;
          const m = menus.find((x) => x.id === editingMenuId);
          if (!m) { if (!cancelled) setLoadError("Cardápio não encontrado."); return; }
          if (cancelled) return;
          setMenuForm({
            name: m.name,
            weekdays: m.weekdays.map(String),
            start_time: m.start_time,
            end_time: m.end_time,
            category_ids: m.categories.map((c) => String(c.id)),
            product_ids: m.products.map((p) => String(p.id)),
          });
        } else {
          setMenuForm(EMPTY_FORM);
        }
      } catch {
        if (!cancelled) setLoadError("Erro ao carregar dados do cardápio.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingMenuId]);

  const categoryOptions = categories.map((c) => ({ value: String(c.id), label: c.name }));
  const productOptions = products.map((p) => ({ value: String(p.id), label: p.name }));

  async function saveMenu() {
    if (!menuForm.name.trim() || menuForm.weekdays.length === 0 || !menuForm.start_time || !menuForm.end_time) return;
    setMenuSaving(true);
    setMenuFormError("");
    try {
      const basePayload = {
        name: menuForm.name.trim(),
        weekdays: menuForm.weekdays.map(Number),
        start_time: menuForm.start_time,
        end_time: menuForm.end_time,
      };
      const menuId = editingMenuId ?? (
        await api.post("/catalog/menus", basePayload, catalogParams())
      ).data.id;
      if (editingMenuId !== null) {
        await api.put(`/catalog/menus/${editingMenuId}`, basePayload, catalogParams());
      }
      await api.put(`/catalog/menus/${menuId}/composition`, {
        category_ids: menuForm.category_ids.map(Number),
        product_ids: menuForm.product_ids.map(Number),
      }, catalogParams());
      navigate("/catalog?tab=menus");
    } catch {
      setMenuFormError("Erro ao salvar cardápio.");
    } finally {
      setMenuSaving(false);
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

  const canSave = !menuSaving && !!menuForm.name.trim() && menuForm.weekdays.length > 0 && !!menuForm.start_time && !!menuForm.end_time;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.h2}>{editingMenuId === null ? "Novo cardápio" : "Editar cardápio"}</h2>
        <div className={styles.headerActions}>
          <Button variant="secondary" onClick={() => navigate("/catalog?tab=menus")}>Voltar</Button>
          <Button onClick={saveMenu} disabled={!canSave} loading={menuSaving}>Salvar</Button>
        </div>
      </div>

      {menuFormError && <div className={styles.alertBox}><Alert variant="error" text={menuFormError} fullWidth /></div>}

      <div className={styles.panel}>
        <InputBase
          label="Nome do cardápio"
          placeholder="ex: Café da manhã"
          value={menuForm.name}
          onChange={(e) => setMenuForm({ ...menuForm, name: e.target.value })}
          autoFocus
        />

        <div className={styles.formRow}>
          <div className={styles.formRowField}>
            <InputBase
              label="Horário início"
              type="time"
              value={menuForm.start_time}
              onChange={(e) => setMenuForm({ ...menuForm, start_time: e.target.value })}
            />
          </div>
          <div className={styles.formRowField}>
            <InputBase
              label="Horário fim"
              type="time"
              value={menuForm.end_time}
              onChange={(e) => setMenuForm({ ...menuForm, end_time: e.target.value })}
            />
          </div>
        </div>

        <CheckboxMultiselect
          key={`${editingMenuId ?? "new"}-weekdays`}
          id="menu-weekdays"
          label="Dias da semana"
          options={WEEKDAY_OPTIONS}
          initialSelection={menuForm.weekdays}
          onSelectOption={(option, checked) => {
            setMenuForm((prev) => ({
              ...prev,
              weekdays: checked ? [...prev.weekdays, option.value] : prev.weekdays.filter((v) => v !== option.value),
            }));
          }}
        />
      </div>

      <div className={styles.panel}>
        <SearchMultiSelect
          label="Categorias inteiras"
          helperMessage="Todo produto da categoria entra no cardápio, inclusive os criados depois"
          options={categoryOptions}
          selectedIds={menuForm.category_ids}
          onChange={(ids) => setMenuForm((prev) => ({ ...prev, category_ids: ids }))}
        />
      </div>

      <div className={styles.panel}>
        <SearchMultiSelect
          label="Produtos avulsos"
          options={productOptions}
          selectedIds={menuForm.product_ids}
          onChange={(ids) => setMenuForm((prev) => ({ ...prev, product_ids: ids }))}
        />
      </div>
    </div>
  );
}
