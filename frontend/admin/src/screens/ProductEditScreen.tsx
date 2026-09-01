import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Checkbox,
  CheckboxMultiselect,
  CurrencyInput,
  Divider,
  Dropdown,
  InputBase,
  Modal,
  NumberInput,
  NumberSpinInput,
  Tag,
  TagInput,
  TextArea,
  Upload,
  UploadListFiles,
  makeToast,
  type DropdownOptions,
  type UploadFile,
} from "design-system";
import api from "../api";
import Breadcrumb from "../components/Breadcrumb";
import ConfirmDialog from "../components/ConfirmDialog";
import { parseApiError } from "../lib/apiErrors";
import { useCatalogParams } from "../lib/catalogParams";
import { MAX_SELECTIONS_MAX, MAX_SELECTIONS_MIN } from "../lib/optionGroupMapping";
import type { Allergen, Category, OptionGroup, Product, ProductMenuRef, ProductOptionGroup } from "../types";
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
  option_groups: ProductOptionGroup[];
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

  // ── Opções do produto (ORD-140) ──────────────────────────────────────────
  // Só vincula grupo já cadastrado — criação fica em Catálogo > Opções
  // (ORD-139), sem duplicar formulário aqui (decisão pós-implementação,
  // 01/09, ver docs/stories/ORD-140).
  const [allOptionGroups, setAllOptionGroups] = useState<OptionGroup[]>([]);
  const [optionGroupsLoaded, setOptionGroupsLoaded] = useState(false);
  const [optionModalOpen, setOptionModalOpen] = useState(false);
  const [existingSearch, setExistingSearch] = useState("");
  const [selectedExistingIds, setSelectedExistingIds] = useState<number[]>([]);
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState("");

  // ── Override de máximo por produto (ORD-144) ─────────────────────────────
  // Só o máximo é editável na UI — o mínimo fica API-only (não há caso de
  // uso real hoje pra customizar o mínimo por produto, ver Tech Explorer).
  const [overrideGroupId, setOverrideGroupId] = useState<number | null>(null);
  const [overrideDraft, setOverrideDraft] = useState<number | null>(null);
  const [overrideSaving, setOverrideSaving] = useState(false);

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
          option_groups: p.option_groups ?? [],
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

  function resetOptionModal() {
    setExistingSearch("");
    setSelectedExistingIds([]);
    setLinkError("");
  }

  async function openOptionModal() {
    resetOptionModal();
    setOptionModalOpen(true);
    if (!optionGroupsLoaded) {
      try {
        const r = await api.get("/catalog/option-groups", catalogParams());
        setAllOptionGroups(r.data.option_groups ?? r.data);
        setOptionGroupsLoaded(true);
      } catch {
        // silencioso — a lista simplesmente fica vazia, o usuário pode tentar de novo reabrindo o modal
      }
    }
  }

  function closeOptionModal() {
    setOptionModalOpen(false);
  }

  function toggleExistingSelection(id: number) {
    setSelectedExistingIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const linkedIds = editProd?.option_groups.map((g) => g.id) ?? [];
  const availableExistingGroups = allOptionGroups
    .filter((g) => !linkedIds.includes(g.id))
    .filter((g) => g.name.toLowerCase().includes(existingSearch.toLowerCase()));

  async function persistOptionGroupIds(ids: number[]) {
    if (!editProd) return null;
    const r = await api.put(`/catalog/products/${editProd.id}/option-groups`, { option_group_ids: ids }, catalogParams());
    setEditProd((prev) => (prev ? { ...prev, option_groups: r.data.option_groups } : prev));
    return r.data;
  }

  async function linkExisting() {
    if (selectedExistingIds.length === 0) return;
    setLinkSaving(true);
    setLinkError("");
    try {
      await persistOptionGroupIds([...linkedIds, ...selectedExistingIds]);
      setOptionModalOpen(false);
    } catch (err) {
      setLinkError(parseApiError(err).message || "Erro ao vincular grupo de opção.");
    } finally {
      setLinkSaving(false);
    }
  }

  const [unlinkConfirm, setUnlinkConfirm] = useState<ProductOptionGroup | null>(null);

  async function unlinkOptionGroup(groupId: number) {
    try {
      await persistOptionGroupIds(linkedIds.filter((id) => id !== groupId));
    } catch {
      makeToast("error", "Erro ao desvincular grupo de opção.");
    } finally {
      setUnlinkConfirm(null);
    }
  }

  function openOverrideEditor(g: ProductOptionGroup) {
    setOverrideGroupId(g.id);
    setOverrideDraft(g.max_selections_override ?? g.max_selections);
  }

  function closeOverrideEditor() {
    setOverrideGroupId(null);
  }

  async function saveOverride() {
    if (overrideGroupId === null || !editProd) return;
    setOverrideSaving(true);
    try {
      const r = await api.patch(
        `/catalog/products/${editProd.id}/option-groups/${overrideGroupId}`,
        { max_selections_override: overrideDraft },
        catalogParams(),
      );
      setEditProd((prev) => (prev ? {
        ...prev,
        option_groups: prev.option_groups.map((g) => (g.id === overrideGroupId ? { ...g, ...r.data } : g)),
      } : prev));
      setOverrideGroupId(null);
    } catch (err) {
      makeToast("error", parseApiError(err).message || "Erro ao salvar máximo do produto.");
    } finally {
      setOverrideSaving(false);
    }
  }

  async function restoreOverrideDefault() {
    if (overrideGroupId === null || !editProd) return;
    setOverrideSaving(true);
    try {
      const r = await api.patch(
        `/catalog/products/${editProd.id}/option-groups/${overrideGroupId}`,
        { min_selections_override: null, max_selections_override: null },
        catalogParams(),
      );
      setEditProd((prev) => (prev ? {
        ...prev,
        option_groups: prev.option_groups.map((g) => (g.id === overrideGroupId ? { ...g, ...r.data } : g)),
      } : prev));
      setOverrideGroupId(null);
    } catch (err) {
      makeToast("error", parseApiError(err).message || "Erro ao restaurar padrão.");
    } finally {
      setOverrideSaving(false);
    }
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

      <div className={styles.panel}>
        <div className={styles.sectionRow}>
          <div className={styles.sectionMain}>
            <h2 className={styles.h2}>Informações básicas</h2>
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
          </div>

          <div className={styles.sectionSide}>
            <h2 className={styles.h2}>Imagem</h2>
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

        <Divider />

        <h2 className={styles.h2}>Descrição</h2>
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

        <Divider />

        <h2 className={styles.h2}>Detalhes</h2>
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

      <div className={styles.panel}>
        <div className={styles.optionsHeader}>
          <h2 className={styles.h2}>Opções do produto</h2>
          <Button type="button" size="small" onClick={openOptionModal}>+ Vincular grupo de opção</Button>
        </div>

        {editProd.option_groups.length === 0 ? (
          <div className={styles.menusInfo}>Nenhum grupo de opção vinculado.</div>
        ) : (
          <div className={styles.optionGroupCards}>
            {editProd.option_groups.map((g) => {
              const effectiveMin = g.min_selections_override ?? g.min_selections;
              const effectiveMax = g.max_selections_override ?? g.max_selections;
              return (
                <div key={g.id} className={styles.optionGroupCard}>
                  <div className={styles.optionGroupCardHeader}>
                    <strong>{g.name}</strong>
                    <Tag variant={effectiveMin >= 1 ? "emphasys" : "neutral"}>{effectiveMin >= 1 ? "Obrigatório" : "Opcional"}</Tag>
                    <Tag variant="neutral">{effectiveMax === 1 ? "Única" : "Múltipla"}</Tag>
                    <Tag variant={g.max_selections_override !== null ? "emphasys" : "neutral"}>
                      Máximo neste produto: {effectiveMax}
                    </Tag>
                    <Button type="button" size="small" variant="secondary" onClick={() => openOverrideEditor(g)}>
                      Editar máximo neste produto
                    </Button>
                    <Button type="button" size="small" variant="secondary" style={{ color: "var(--error-base)", marginLeft: "auto" }} onClick={() => setUnlinkConfirm(g)}>
                      Desvincular
                    </Button>
                  </div>
                  <div className={styles.optionPills}>
                    {g.options.map((o) => (
                      <Tag key={o.id} variant="neutral">{o.label}{o.price_delta > 0 ? ` +${o.price_delta.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}</Tag>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {previewImage && (
        <div className={styles.previewOverlay} onClick={() => setPreviewImage(null)}>
          <img src={previewImage.url} alt={previewImage.alt} className={styles.previewImage} />
        </div>
      )}

      <Modal open={optionModalOpen} width={520} onClose={closeOptionModal} onBackdropClick={closeOptionModal} onCloseButtonClick={closeOptionModal}>
        <div className={styles.modalForm}>
          <div className={styles.formTitle}>Vincular grupo de opção</div>

          {linkError && <Alert variant="error" text={linkError} fullWidth />}

          <InputBase label="Buscar grupo" placeholder="Nome do grupo…" value={existingSearch} onChange={(e) => setExistingSearch(e.target.value)} />
          <div className={styles.existingGroupList}>
            {availableExistingGroups.length === 0 ? (
              <div className={styles.menusInfo}>
                {allOptionGroups.length === 0
                  ? "Nenhum grupo de opção cadastrado ainda — crie um em Catálogo > Opções."
                  : "Nenhum grupo disponível para vincular."}
              </div>
            ) : (
              availableExistingGroups.map((g) => (
                <Checkbox
                  key={g.id}
                  id={`link-group-${g.id}`}
                  label={`${g.name} (${g.options.length} opç${g.options.length === 1 ? "ão" : "ões"})`}
                  checked={selectedExistingIds.includes(g.id)}
                  onChange={() => toggleExistingSelection(g.id)}
                />
              ))
            )}
          </div>
          <div className={styles.formActions}>
            <Button type="button" onClick={linkExisting} disabled={selectedExistingIds.length === 0 || linkSaving} loading={linkSaving}>Vincular</Button>
            <Button type="button" variant="secondary" onClick={closeOptionModal}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      <Modal open={overrideGroupId !== null} width={420} onClose={closeOverrideEditor} onBackdropClick={closeOverrideEditor} onCloseButtonClick={closeOverrideEditor}>
        <div className={styles.modalForm}>
          <div className={styles.formTitle}>Máximo neste produto</div>
          <NumberSpinInput
            typeable
            step={1}
            minValue={MAX_SELECTIONS_MIN}
            maxValue={MAX_SELECTIONS_MAX}
            helperMessage="Vale só para este produto — não altera o padrão do grupo em Catálogo > Opções"
            value={overrideDraft ?? MAX_SELECTIONS_MIN}
            onChange={(value?: number) => setOverrideDraft(value ?? null)}
          />
          <div className={styles.formActions}>
            <Button type="button" onClick={saveOverride} loading={overrideSaving}>Salvar</Button>
            <Button type="button" variant="secondary" onClick={restoreOverrideDefault} loading={overrideSaving}>Restaurar padrão</Button>
            <Button type="button" variant="secondary" onClick={closeOverrideEditor}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={unlinkConfirm !== null}
        title="Desvincular grupo de opção"
        message={unlinkConfirm
          ? `Desvincular "${unlinkConfirm.name}" deste produto? As opções deixam de aparecer pra quem comprar "${editProd.name}". O grupo continua na biblioteca (Catálogo > Opções) e pode ser vinculado de novo, mas o máximo customizado aqui pra este produto será perdido.`
          : ""}
        confirmLabel="Desvincular"
        alertVariant="warning"
        alertIcon="alert-triangle"
        onConfirm={() => unlinkConfirm && unlinkOptionGroup(unlinkConfirm.id)}
        onCancel={() => setUnlinkConfirm(null)}
      />
    </div>
  );
}
