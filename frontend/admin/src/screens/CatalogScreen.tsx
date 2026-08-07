import { useState, useEffect, FormEvent, DragEvent } from "react";
import {
  Button,
  CheckboxMultiselect,
  CurrencyInput,
  Dropdown,
  InputBase,
  Modal,
  NumberInput,
  Tag,
  TagInput,
  TextArea,
  Upload,
  UploadListFiles,
  type DropdownOptions,
  type TagProps,
  type UploadFile,
} from "design-system";
import api from "../api";
import ConfirmDialog, { type ConfirmDialogProps } from "../components/ConfirmDialog";
import type { Allergen, Category, Product } from "../types";
import styles from "./CatalogScreen.module.scss";

// Conjunto sugerido pra tags (usuário aprovou "adotar os padrões sugeridos,
// mas podem surgir mais") — o TagInput do DS não tem suporte nativo a
// sugestões, então isso vira só um texto de apoio; qualquer tag livre é aceita.
const SUGGESTED_TAGS = "novo, mais vendido, picante, vegetariano";

// Variant semântica por tag conhecida — o resto cai no default (neutral).
const TAG_VARIANTS: Record<string, TagProps["variant"]> = {
  picante: "warning",
  vegetariano: "success",
  "mais vendido": "emphasys",
};

function tagVariant(tag: string): TagProps["variant"] {
  return TAG_VARIANTS[tag.toLowerCase()] ?? "neutral";
}

// Upload do DS espera o limite de tamanho em MB.
// Valor redondo em MB de propósito — o Upload do DS monta a mensagem de erro
// de tamanho como `Utilize arquivos com menos de ${maxFileSize} MB` direto
// com esse número (não dá pra customizar o texto, só o valor), então um
// valor fracionário tipo 500/1024 vira "0.48828125 MB" na tela do usuário.
const IMAGE_MAX_SIZE_MB = 2;
const IMAGE_TYPES = ["image/jpeg", "image/png"];

// Regra: qualquer par de botão que alterna "Desativar"/"Ativar" no mesmo
// lugar (categoria e produto) precisa da mesma largura fixa nos dois
// estados, senão o texto mais curto ("Ativar") encolhe o botão e empurra o
// resto da linha. 140px cobre "Desativar" (o mais longo) com folga.
// Usar `style` (não `className`) — o Button do design-system descarta
// qualquer className passado por fora (ver Button.js), só style chega no DOM.
const TOGGLE_ACTIVE_BTN_STYLE = { width: 140 };

// Exclusão definitiva (irreversível) — cor de erro só no texto pra destacar
// do resto das ações sem precisar de uma variant "danger" (o DS não tem).
const DANGER_BTN_STYLE = { color: "var(--error-base)" };

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

export default function CatalogScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [allergens, setAllergens] = useState<Allergen[]>([]);
  const [draggedProductId, setDraggedProductId] = useState<number | null>(null);
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [newCatName, setNewCatName] = useState("");
  const [newProd, setNewProd] = useState<{ name: string; price: number | null }>({ name: "", price: null });
  const [editCat, setEditCat] = useState<{ id: number; name: string } | null>(null);
  const [editProd, setEditProd] = useState<EditProdState | null>(null);
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [confirmState, setConfirmState] = useState<{
    message: string;
    onConfirm: () => void;
    alertVariant?: ConfirmDialogProps["alertVariant"];
    alertIcon?: string;
  } | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);

  useEffect(() => { loadCategories(); loadAllergens(); }, []);
  useEffect(() => { if (selectedCat) loadProducts(selectedCat); else setProducts([]); }, [selectedCat]);

  async function loadCategories() {
    const r = await api.get("/catalog/categories?include_inactive=true");
    setCategories(r.data.categories ?? r.data);
  }

  async function loadProducts(catId: number) {
    const r = await api.get(`/catalog/products?category_id=${catId}&include_inactive=true`);
    setProducts(r.data.products ?? r.data);
  }

  async function loadAllergens() {
    const r = await api.get("/catalog/allergens");
    setAllergens(r.data.allergens ?? r.data);
  }

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    if (!newCatName.trim()) return;
    await api.post("/catalog/categories", { name: newCatName.trim() });
    setNewCatName("");
    loadCategories();
  }

  async function saveEditCat(e: FormEvent) {
    e.preventDefault();
    if (!editCat) return;
    await api.put(`/catalog/categories/${editCat.id}`, { name: editCat.name });
    setEditCat(null);
    loadCategories();
  }

  function deleteCategory(id: number) {
    setConfirmState({
      message: "Desativar categoria? Ela some do totem, mas os produtos continuam cadastrados e reaparecem se a categoria for reativada.",
      onConfirm: async () => {
        setConfirmState(null);
        await api.delete(`/catalog/categories/${id}`);
        if (selectedCat === id) setSelectedCat(null);
        loadCategories();
      },
    });
  }

  async function activateCategory(id: number) {
    await api.put(`/catalog/categories/${id}`, { active: true });
    loadCategories();
  }

  function deleteCategoryPermanently(id: number, name: string) {
    setConfirmState({
      message: `Excluir definitivamente a categoria "${name}"? Essa ação NÃO pode ser desfeita — a categoria e todos os seus produtos deixam de existir no sistema para sempre. Vendas já realizadas com esses produtos não são afetadas.`,
      alertVariant: "warning",
      alertIcon: "alert-triangle",
      onConfirm: async () => {
        setConfirmState(null);
        await api.delete(`/catalog/categories/${id}?permanent=true`);
        if (selectedCat === id) setSelectedCat(null);
        loadCategories();
      },
    });
  }

  async function addProduct(e: FormEvent) {
    e.preventDefault();
    if (!selectedCat || !newProd.name.trim() || !newProd.price) return;
    await api.post("/catalog/products", {
      category_id: selectedCat,
      name: newProd.name.trim(),
      price: newProd.price,
    });
    setNewProd({ name: "", price: null });
    loadProducts(selectedCat);
  }

  function openEditProd(p: Product) {
    setEditCat(null);
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
    setUploadFiles([]);
  }

  function closeEditProd() {
    setEditProd(null);
    setUploadFiles([]);
  }

  async function saveEditProd(e: FormEvent) {
    e.preventDefault();
    if (!editProd || !editProd.name.trim() || editProd.price <= 0) return;
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
    });
    closeEditProd();
    if (selectedCat) loadProducts(selectedCat);
  }

  function handleProductDragStart(id: number) {
    setDraggedProductId(id);
  }

  function handleProductDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  async function handleProductDrop(e: DragEvent<HTMLDivElement>, targetId: number) {
    e.preventDefault();
    const sourceId = draggedProductId;
    setDraggedProductId(null);
    if (sourceId === null || sourceId === targetId || !selectedCat) return;
    const fromIndex = products.findIndex((p) => p.id === sourceId);
    const toIndex = products.findIndex((p) => p.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const reordered = [...products];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setProducts(reordered);
    await api.put("/catalog/products/reorder", {
      category_id: selectedCat,
      product_ids: reordered.map((p) => p.id),
    });
  }

  async function handleImageFiles(files: UploadFile[]) {
    const picked = files[0];
    if (!editProd || !picked) return;
    if (picked.status === "error-read") {
      setUploadFiles([picked]);
      return;
    }
    const productId = editProd.id;
    setUploadFiles([{ ...picked, status: "loading" }]);
    try {
      const formData = new FormData();
      formData.append("image", picked.file);
      const r = await api.post(`/catalog/products/${productId}/image`, formData);
      setEditProd((prev) => (prev && prev.id === productId
        ? { ...prev, image_url: r.data.image_url, thumbnail_url: r.data.thumbnail_url }
        : prev));
      setUploadFiles([]);
      if (selectedCat) loadProducts(selectedCat);
    } catch {
      setUploadFiles([{ ...picked, status: "error-send" }]);
    }
  }

  function removeProductImage() {
    if (!editProd) return;
    const productId = editProd.id;
    setConfirmState({
      message: "Remover a imagem deste produto?",
      onConfirm: async () => {
        setConfirmState(null);
        const r = await api.delete(`/catalog/products/${productId}/image`);
        setEditProd((prev) => (prev && prev.id === productId
          ? { ...prev, image_url: r.data.image_url, thumbnail_url: r.data.thumbnail_url }
          : prev));
        if (selectedCat) loadProducts(selectedCat);
      },
    });
  }

  function deleteProduct(id: number) {
    setConfirmState({
      message: "Desativar produto?",
      onConfirm: async () => {
        setConfirmState(null);
        await api.delete(`/catalog/products/${id}`);
        if (selectedCat) loadProducts(selectedCat);
      },
    });
  }

  function deleteProductPermanently(id: number, name: string) {
    setConfirmState({
      message: `Excluir definitivamente o produto "${name}"? Essa ação NÃO pode ser desfeita — o produto deixa de existir no sistema para sempre. Vendas já realizadas com este produto não são afetadas.`,
      alertVariant: "warning",
      alertIcon: "alert-triangle",
      onConfirm: async () => {
        setConfirmState(null);
        await api.delete(`/catalog/products/${id}?permanent=true`);
        if (selectedCat) loadProducts(selectedCat);
      },
    });
  }

  async function activateProduct(id: number) {
    await api.put(`/catalog/products/${id}`, { active: true });
    if (selectedCat) loadProducts(selectedCat);
  }

  // Só categorias ativas — o backend rejeita mover produto pra categoria inativa.
  const categoryOptions: DropdownOptions[] = categories
    .filter((c) => c.active)
    .map((c) => ({ value: String(c.id), label: c.name }));

  return (
    <div className={styles.page}>
      <div className={styles.title}>Catálogo</div>
      <div className={styles.row}>
        <div className={styles.col}>
          <div className={styles.sectionTitle}>Categorias</div>
          {!editCat && (
            <form className={`${styles.form} ${styles.formRow}`} onSubmit={addCategory}>
              <div className={styles.formRowField}>
                <InputBase
                  label="Nome da categoria"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                />
              </div>
              <Button type="submit">Adicionar</Button>
            </form>
          )}

          {editCat && (
            <form className={styles.form} onSubmit={saveEditCat}>
              <div className={styles.formLabel}>Editando categoria</div>
              <div className={styles.formRow}>
                <div className={styles.formRowField}>
                  <InputBase
                    label="Nome da categoria"
                    value={editCat.name}
                    onChange={(e) => setEditCat({ ...editCat, name: e.target.value })}
                    autoFocus
                  />
                </div>
                <div className={styles.formActions}>
                  <Button type="submit">Salvar</Button>
                  <Button type="button" variant="secondary" onClick={() => setEditCat(null)}>Cancelar</Button>
                </div>
              </div>
            </form>
          )}

          {categories.map((c) => (
            <div
              key={c.id}
              className={`${styles.item} ${selectedCat === c.id ? styles.itemSelected : styles.itemClickable}`}
              onClick={() => setSelectedCat(c.id)}
            >
              <span className={styles.itemName}>
                {c.name}
                <Tag variant={c.active ? "success" : "error"}>{c.active ? "ativo" : "inativo"}</Tag>
              </span>
              <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
                <Button size="small" variant="secondary" onClick={() => setEditCat({ id: c.id, name: c.name })}>Editar</Button>
                {c.active ? (
                  <Button size="small" variant="secondary" style={TOGGLE_ACTIVE_BTN_STYLE} onClick={() => deleteCategory(c.id)}>Desativar</Button>
                ) : (
                  <Button size="small" style={TOGGLE_ACTIVE_BTN_STYLE} onClick={() => activateCategory(c.id)}>Ativar</Button>
                )}
                <Button size="small" variant="secondary" style={DANGER_BTN_STYLE} onClick={() => deleteCategoryPermanently(c.id, c.name)}>
                  Excluir
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.col}>
          <div className={styles.sectionTitle}>
            Produtos {selectedCat ? `— ${categories.find((c) => c.id === selectedCat)?.name ?? ""}` : "(selecione uma categoria)"}
          </div>

          {selectedCat && !editProd && (
            <form className={styles.form} onSubmit={addProduct}>
              <div className={styles.formRow}>
                <div className={styles.formRowField}>
                  <InputBase
                    label="Nome do produto"
                    value={newProd.name}
                    onChange={(e) => setNewProd({ ...newProd, name: e.target.value })}
                  />
                </div>
                <div className={styles.formRowField}>
                  <CurrencyInput
                    label="Preço"
                    value={newProd.price}
                    onChange={(value: number) => setNewProd({ ...newProd, price: value })}
                  />
                </div>
              </div>
              <div className={styles.formActions}>
                <Button type="submit">Adicionar produto</Button>
              </div>
              <div className={styles.formHint}>
                A imagem pode ser adicionada depois de criar o produto, em "Editar".
              </div>
            </form>
          )}

          {editProd && (
            <form className={styles.form} onSubmit={saveEditProd}>
              <div className={styles.formLabel}>Editando produto</div>
              <div className={styles.formRow}>
                <div className={styles.formRowField}>
                  <InputBase label="Nome" value={editProd.name} autoFocus
                    onChange={(e) => setEditProd({ ...editProd, name: e.target.value })} />
                </div>
                <div className={styles.formRowField}>
                  <CurrencyInput label="Preço"
                    value={editProd.price}
                    onChange={(value: number) => setEditProd({ ...editProd, price: value })} />
                </div>
              </div>
              <Dropdown
                label="Categoria"
                value={categoryOptions.find((o) => o.value === String(editProd.category_id)) ?? null}
                onValueSelected={(opt) => setEditProd({ ...editProd, category_id: Number(opt.value) })}
                options={categoryOptions}
              />

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

              <div className={styles.imageSection}>
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
                    <UploadListFiles
                      items={uploadFiles}
                      removable={false}
                    />
                  </>
                )}
              </div>

              <div className={styles.formActions}>
                <Button type="submit" disabled={!editProd.name.trim() || editProd.price <= 0}>
                  Salvar
                </Button>
                <Button type="button" variant="secondary" onClick={closeEditProd}>Cancelar</Button>
              </div>
            </form>
          )}

          {products.map((p) => (
            <div
              key={p.id}
              className={`${styles.item} ${draggedProductId === p.id ? styles.itemDragging : ""}`}
              draggable
              onDragStart={() => handleProductDragStart(p.id)}
              onDragOver={handleProductDragOver}
              onDrop={(e) => handleProductDrop(e, p.id)}
            >
              <span className={styles.itemName}>
                <span className={styles.dragHandle} title="Arraste para reordenar">⠿</span>
                {p.thumbnail_url ? (
                  <img
                    src={p.thumbnail_url}
                    alt={p.name}
                    className={styles.rowThumb}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewImage({ url: p.image_url ?? p.thumbnail_url!, alt: p.name });
                    }}
                  />
                ) : (
                  <span className={styles.rowThumbPlaceholder} />
                )}
                {p.name}
                <span className={styles.itemPrice}>
                  {p.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
                <Tag variant={p.active ? "success" : "error"}>{p.active ? "ativo" : "inativo"}</Tag>
                {(p.tags ?? []).map((t) => (
                  <Tag key={t} variant={tagVariant(t)}>{t}</Tag>
                ))}
              </span>
              <div className={styles.actions}>
                <Button size="small" variant="secondary" onClick={() => openEditProd(p)}>Editar</Button>
                {p.active ? (
                  <Button size="small" variant="secondary" style={TOGGLE_ACTIVE_BTN_STYLE} onClick={() => deleteProduct(p.id)}>Desativar</Button>
                ) : (
                  <Button size="small" style={TOGGLE_ACTIVE_BTN_STYLE} onClick={() => activateProduct(p.id)}>Ativar</Button>
                )}
                <Button size="small" variant="secondary" style={DANGER_BTN_STYLE} onClick={() => deleteProductPermanently(p.id, p.name)}>
                  Excluir
                </Button>
              </div>
            </div>
          ))}

          {selectedCat && products.length === 0 && (
            <div className={styles.empty}>Nenhum produto nesta categoria.</div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmState}
        message={confirmState?.message ?? ""}
        alertVariant={confirmState?.alertVariant}
        alertIcon={confirmState?.alertIcon}
        onConfirm={() => confirmState?.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />

      <Modal
        open={!!previewImage}
        width={728} // 600px de imagem + 2x64px de padding do Modal (box-sizing: border-box)
        onClose={() => setPreviewImage(null)}
        onBackdropClick={() => setPreviewImage(null)}
        onCloseButtonClick={() => setPreviewImage(null)}
      >
        {previewImage && (
          <img src={previewImage.url} alt={previewImage.alt} className={styles.previewImage} />
        )}
      </Modal>
    </div>
  );
}
