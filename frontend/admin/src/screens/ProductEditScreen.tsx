import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  CheckboxMultiselect,
  CurrencyInput,
  Dropdown,
  InputBase,
  NumberInput,
  TagInput,
  TextArea,
  Upload,
  UploadListFiles,
  type DropdownOptions,
  type UploadFile,
} from "design-system";
import api from "../api";
import Breadcrumb from "../components/Breadcrumb";
import { useCatalogParams } from "../lib/catalogParams";
import type { Allergen, Category, Product, ProductMenuRef } from "../types";
import styles from "./ProductEditScreen.module.scss";

const SUGGESTED_TAGS = "novo, mais vendido, picante, vegetariano";
const IMAGE_MAX_SIZE_MB = 2;
const IMAGE_TYPES = ["image/jpeg", "image/png"];

// Um produto pode estar vinculado ao mesmo cardápio direto E via categoria
// ao mesmo tempo — mescla numa linha só em vez de mostrar o mesmo cardápio
// duas vezes. Mesma função de CatalogScreen.tsx (ORD-125/126).
function formatProductMenus(refs: ProductMenuRef[]): string[] {
  const byMenu = new Map<number, { name: string; direct: boolean; viaCategories: string[] }>();
  for (const r of refs) {
    const entry = byMenu.get(r.id) ?? { name: r.name, direct: false, viaCategories: [] };
    if (r.via_category) entry.viaCategories.push(r.via_category);
    else entry.direct = true;
    byMenu.set(r.id, entry);
  }
  return Array.from(byMenu.values(), (e) => {
    const parts: string[] = [];
    if (e.direct) parts.push("direto");
    if (e.viaCategories.length) parts.push(`via ${e.viaCategories.join(", ")}`);
    return `${e.name} (${parts.join(" + ")})`;
  });
}

interface EditProdState {
  id: number;
  name: string;
  price: number;
  category_id: number;
  image_url: string | null;
  thumbnail_url: string | null;
  description: string;
  description_long: string;
  calories: number | null;
  sku: string;
  tags: string[];
  allergen_ids: string[];
}

// ORD-136 — edição de produto sai do modal (espaço comprometido, mais
// campos previstos em breve) e ganha tela dedicada. Criação continua no
// modal em CatalogScreen (poucos campos, estratégia deliberada mantida).
export default function ProductEditScreen() {
  const { id } = useParams<{ id: string }>();
  const productId = Number(id);
  const navigate = useNavigate();
  const catalogParams = useCatalogParams();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editProd, setEditProd] = useState<EditProdState | null>(null);
  const [editProdMenus, setEditProdMenus] = useState<ProductMenuRef[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allergens, setAllergens] = useState<Allergen[]>([]);
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const [productFormError, setProductFormError] = useState("");
  const [productSaving, setProductSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const [productRes, categoriesRes, allergensRes, menusRes] = await Promise.all([
          api.get(`/catalog/products/${productId}`, catalogParams()),
          api.get("/catalog/categories", catalogParams({ include_inactive: true })),
          api.get("/catalog/allergens"),
          api.get(`/catalog/products/${productId}/menus`, catalogParams()).catch(() => ({ data: { menus: [] } })),
        ]);
        if (cancelled) return;
        const p: Product = productRes.data;
        setEditProd({
          id: p.id,
          name: p.name,
          price: p.price,
          category_id: p.category_id,
          image_url: p.image_url,
          thumbnail_url: p.thumbnail_url,
          description: p.description ?? "",
          description_long: p.description_long ?? "",
          calories: p.calories,
          sku: p.sku ?? "",
          tags: p.tags ?? [],
          allergen_ids: (p.allergens ?? []).map((a) => String(a.id)),
        });
        setCategories(categoriesRes.data.categories ?? categoriesRes.data);
        setAllergens(allergensRes.data.allergens ?? allergensRes.data);
        setEditProdMenus(menusRes.data.menus ?? []);
      } catch {
        if (!cancelled) setLoadError("Produto não encontrado.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const activeCategoryOptions: DropdownOptions[] = categories
    .filter((c) => c.active)
    .map((c) => ({ value: String(c.id), label: c.name }));

  async function handleImageFiles(files: UploadFile[]) {
    const picked = files[0];
    if (!editProd || !picked) return;
    if (picked.status === "error-read") {
      setUploadFiles([picked]);
      return;
    }
    setUploadFiles([{ ...picked, status: "loading" }]);
    try {
      const formData = new FormData();
      formData.append("image", picked.file);
      const r = await api.post(`/catalog/products/${productId}/image`, formData, catalogParams());
      setEditProd((prev) => (prev ? { ...prev, image_url: r.data.image_url, thumbnail_url: r.data.thumbnail_url } : prev));
      setUploadFiles([]);
    } catch {
      setUploadFiles([{ ...picked, status: "error-send" }]);
    }
  }

  async function removeProductImage() {
    if (!editProd) return;
    const r = await api.delete(`/catalog/products/${productId}/image`, catalogParams());
    setEditProd((prev) => (prev ? { ...prev, image_url: r.data.image_url, thumbnail_url: r.data.thumbnail_url } : prev));
  }

  async function saveEditProd() {
    if (!editProd || !editProd.name.trim() || editProd.price <= 0) return;
    setProductSaving(true);
    setProductFormError("");
    try {
      await api.put(`/catalog/products/${editProd.id}`, {
        name: editProd.name.trim(),
        price: editProd.price,
        category_id: editProd.category_id,
        description: editProd.description.trim() || null,
        description_long: editProd.description_long.trim() || null,
        calories: editProd.calories,
        sku: editProd.sku.trim() || null,
        tags: editProd.tags,
        allergen_ids: editProd.allergen_ids.map(Number),
      }, catalogParams());
      navigate("/catalog?tab=products");
    } catch {
      setProductFormError("Erro ao salvar produto.");
    } finally {
      setProductSaving(false);
    }
  }

  if (loading) return <div className={styles.page}>Carregando…</div>;
  if (loadError || !editProd) {
    return (
      <div className={styles.page}>
        <Alert variant="error" text={loadError ?? "Produto não encontrado."} fullWidth />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Breadcrumb
        items={[
          { label: "Catálogo", href: "/catalog" },
          { label: "Produtos", href: "/catalog?tab=products" },
          { label: "Editando produto" },
        ]}
      />
      <div className={styles.header}>
        <h1 className={styles.h1}>Editando produto</h1>
        <div className={styles.headerActions}>
          <Button variant="secondary" onClick={() => navigate("/catalog?tab=products")}>Voltar</Button>
          <Button onClick={saveEditProd} disabled={productSaving || !editProd.name.trim() || editProd.price <= 0} loading={productSaving}>
            Salvar
          </Button>
        </div>
      </div>

      {productFormError && <div className={styles.alertBox}><Alert variant="error" text={productFormError} fullWidth /></div>}

      <div className={styles.grid}>
        <div className={styles.mainCol}>
          <div className={styles.panel}>
            <div className={styles.formRow}>
              <div className={styles.formRowField}>
                <InputBase
                  label="Nome"
                  value={editProd.name}
                  onChange={(e) => setEditProd({ ...editProd, name: e.target.value })}
                />
              </div>
              <div className={styles.formRowField}>
                <CurrencyInput
                  label="Preço"
                  value={editProd.price}
                  onChange={(value: number) => setEditProd({ ...editProd, price: value })}
                />
              </div>
            </div>

            <Dropdown
              label="Categoria"
              value={activeCategoryOptions.find((o) => o.value === String(editProd.category_id)) ?? null}
              onValueSelected={(opt) => setEditProd({ ...editProd, category_id: Number(opt.value) })}
              options={activeCategoryOptions}
            />

            {editProdMenus.length > 0 && (
              <div className={styles.menusInfo}>
                <div className={styles.formLabel}>Pertence aos cardápios</div>
                {formatProductMenus(editProdMenus).map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            )}

            <TextArea
              label="Descrição curta"
              value={editProd.description}
              onChange={(e) => setEditProd({ ...editProd, description: e.target.value })}
              maxLength={500}
              helperMessage="Aparece na grade/listagem do totem"
            />

            <TextArea
              label="Descrição longa"
              value={editProd.description_long}
              onChange={(e) => setEditProd({ ...editProd, description_long: e.target.value })}
              maxLength={2000}
              autoSize
              helperMessage="Detalhe completo, mostrado só ao abrir o item"
            />

            <div className={styles.formRow}>
              <div className={styles.formRowField}>
                <NumberInput
                  label="Calorias (kcal)"
                  value={editProd.calories ?? undefined}
                  onChange={(value: number) => setEditProd({ ...editProd, calories: value })}
                />
              </div>
              <div className={styles.formRowField}>
                <InputBase
                  label="SKU"
                  value={editProd.sku}
                  placeholder="Opcional, único por empresa"
                  onChange={(e) => setEditProd({ ...editProd, sku: e.target.value })}
                />
              </div>
            </div>

            <TagInput
              label="Tags"
              value={editProd.tags}
              onValueChange={(tags) => setEditProd({ ...editProd, tags })}
              placeholder={`Sugestões: ${SUGGESTED_TAGS}`}
            />

            <CheckboxMultiselect
              key={editProd.id}
              id={`edit-prod-${editProd.id}-allergens`}
              label="Alérgenos (RDC 727/2022)"
              options={allergens.map((a) => ({ value: String(a.id), label: a.name, disabled: false }))}
              initialSelection={editProd.allergen_ids}
              onSelectOption={(option, checked) => {
                setEditProd((prev) => {
                  if (!prev) return prev;
                  const ids = checked
                    ? [...prev.allergen_ids, option.value]
                    : prev.allergen_ids.filter((id) => id !== option.value);
                  return { ...prev, allergen_ids: ids };
                });
              }}
            />
          </div>
        </div>

        <div className={styles.sideCol}>
          <div className={styles.panel}>
            <div className={styles.formLabel}>Imagem do produto</div>
            {editProd.thumbnail_url ? (
              <div className={styles.imagePreview}>
                <img
                  src={editProd.thumbnail_url}
                  alt={editProd.name}
                  className={styles.thumbnailImg}
                  onClick={() => setPreviewImage({ url: editProd.image_url ?? editProd.thumbnail_url!, alt: editProd.name })}
                />
                <Button type="button" size="small" variant="secondary" onClick={removeProductImage}>
                  Remover imagem
                </Button>
              </div>
            ) : (
              <>
                <Upload
                  fullWidth
                  maxFileSize={IMAGE_MAX_SIZE_MB}
                  multipleFiles={false}
                  types={IMAGE_TYPES}
                  showMaxFileSize={false}
                  helperMessage="JPG ou PNG, até 2 MB"
                  errorMessage="Envie um arquivo JPG ou PNG de até 2 MB"
                  onCallbackUpload={handleImageFiles}
                />
                <UploadListFiles items={uploadFiles} removable={false} />
              </>
            )}
          </div>
        </div>
      </div>

      {previewImage && (
        <div className={styles.previewOverlay} onClick={() => setPreviewImage(null)}>
          <img src={previewImage.url} alt={previewImage.alt} className={styles.previewImage} />
        </div>
      )}
    </div>
  );
}
