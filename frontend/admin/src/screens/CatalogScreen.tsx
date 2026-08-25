import { useState, useEffect, useRef, useCallback, FormEvent } from "react";
import {
  Alert,
  Button,
  CheckboxMultiselect,
  CurrencyInput,
  Dropdown,
  InputBase,
  Modal,
  NumberInput,
  Tab,
  Tabs,
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
import { listCompanies } from "../api/companies";
import ConfirmDialog, { type ConfirmDialogProps } from "../components/ConfirmDialog";
import Table from "../components/Table";
import { useStore } from "../store";
import type { Allergen, Category, Company, Product } from "../types";
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

// Exclusão definitiva (irreversível) — cor de erro só no texto pra destacar
// do resto das ações sem precisar de uma variant "danger" (o DS não tem).
const DANGER_BTN_STYLE = { color: "var(--error-base)" };

type StatusFilter = "active" | "inactive" | "all";

// "Ativas/Inativas/Todas" (categoria, feminino) vs "Ativos/Inativos/Todos"
// (produto, masculino) — mesmo cuidado de concordância já usado em
// CompanyScreen (PAYMENT_STATUS_FILTER_OPTIONS vs STATUS_FILTER_OPTIONS).
const CATEGORY_STATUS_FILTER_OPTIONS: DropdownOptions[] = [
  { value: "active", label: "Ativas" },
  { value: "inactive", label: "Inativas" },
  { value: "all", label: "Todas" },
];

const PRODUCT_STATUS_FILTER_OPTIONS: DropdownOptions[] = [
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
  { value: "all", label: "Todos" },
];

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
  const role = useStore((s) => s.role);
  // superadmin e admin são equivalentes (gestão da plataforma, ver
  // docs/ARQUITETURA.md §1.2) — administram catálogo de qualquer empresa
  // cliente, mas precisam de uma empresa ativa na sessão pra fazer sentido
  // (catálogo é sempre edição de UMA empresa, não visão agregada como
  // Transações/Pedidos). Mesmo valor de sessão que Configurações/Empresa/
  // Dispositivos/Transações/Pedidos já usam — selecionar em qualquer uma
  // dessas telas já vem pré-selecionado aqui.
  const isPlatformAdmin = role === "superadmin" || role === "admin";
  const companyId = useStore((s) => s.selectedCompanyId);
  const setSelectedCompany = useStore((s) => s.setSelectedCompany);
  const hasCompanyContext = !isPlatformAdmin || !!companyId;

  const [companies, setCompanies] = useState<Company[]>([]);
  useEffect(() => {
    if (isPlatformAdmin) {
      listCompanies({ limit: 200 }).then((r) => setCompanies(r.companies)).catch(() => null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatformAdmin]);
  const companyOptions: DropdownOptions[] = companies.map((c) => ({ value: String(c.id), label: c.name }));

  // Anexa company_id como query param em toda chamada de catálogo, só
  // quando superadmin/admin têm uma empresa selecionada — owner/manager não
  // mandam o parâmetro (o backend ignoraria mesmo, mas nem precisa).
  function catalogParams(extra: Record<string, string | number | boolean | undefined> = {}) {
    return {
      params: {
        ...extra,
        ...(isPlatformAdmin && companyId ? { company_id: companyId } : {}),
      },
    };
  }

  // Cadastro em abas + padrão Empresa (2026-08-24) — filterBar + Table +
  // Modal, mesmo modelo de Usuários/Terminais/Pagamento em CompanyScreen.
  const [activeTab, setActiveTab] = useState<"categories" | "products">("categories");

  const [allergens, setAllergens] = useState<Allergen[]>([]);
  useEffect(() => { loadAllergens(); }, []);
  async function loadAllergens() {
    // Master data global, não filtrado por empresa — sem catalogParams.
    const r = await api.get("/catalog/allergens");
    setAllergens(r.data.allergens ?? r.data);
  }

  const [confirmState, setConfirmState] = useState<{
    message: string;
    onConfirm: () => void;
    alertVariant?: ConfirmDialogProps["alertVariant"];
    alertIcon?: string;
  } | null>(null);

  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);

  // ── Categorias ─────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<Category[]>([]);
  const [errCategories, setErrCategories] = useState<string | null>(null);
  const [categoryNameFilter, setCategoryNameFilter] = useState("");
  const [categoryStatusFilter, setCategoryStatusFilter] = useState<StatusFilter>("active");
  const categoryRequestId = useRef(0);

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [categoryNameDefault, setCategoryNameDefault] = useState("");
  const [categoryModalKey, setCategoryModalKey] = useState(0);
  const [categoryFormError, setCategoryFormError] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const categoryNameRef = useRef<HTMLInputElement>(null);

  async function loadCategories() {
    if (!hasCompanyContext) return;
    const thisRequest = ++categoryRequestId.current;
    try {
      const r = await api.get("/catalog/categories", catalogParams({ include_inactive: true }));
      if (thisRequest !== categoryRequestId.current) return; // resposta obsoleta, ignorar
      setCategories(r.data.categories ?? r.data);
      setErrCategories(null);
    } catch {
      if (thisRequest !== categoryRequestId.current) return;
      setErrCategories("Erro ao carregar categorias.");
    }
  }

  useEffect(() => {
    if (!hasCompanyContext) { setCategories([]); return; }
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCompanyContext, companyId]);

  const filteredCategories = categories.filter((c) => {
    if (categoryStatusFilter === "active" && !c.active) return false;
    if (categoryStatusFilter === "inactive" && c.active) return false;
    if (categoryNameFilter && !c.name.toLowerCase().includes(categoryNameFilter.toLowerCase())) return false;
    return true;
  });

  // Reordenar (pedido direto do usuário — refletir a ordem de apresentação
  // no totem) exige que o conjunto visível bata EXATAMENTE com todas as
  // categorias da empresa, mesma validação de reorderProducts — por isso só
  // fica disponível com filtro de nome vazio e status "Todas".
  const canReorderCategories = !categoryNameFilter && categoryStatusFilter === "all";

  async function reorderCategories(orderedIds: (string | number)[]) {
    const ids = orderedIds.map(Number);
    const orderMap = new Map(ids.map((id, i) => [id, i]));
    setCategories((prev) => [...prev].sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0)));
    await api.put("/catalog/categories/reorder", { category_ids: ids }, catalogParams());
  }

  function clearCategoryFilters() {
    setCategoryNameFilter("");
    setCategoryStatusFilter("active");
  }

  function openNewCategory() {
    setEditingCategoryId(null);
    setCategoryNameDefault("");
    setCategoryFormError("");
    setCategoryModalKey((k) => k + 1);
    setCategoryModalOpen(true);
  }

  function openEditCategory(c: Category) {
    setEditingCategoryId(c.id);
    setCategoryNameDefault(c.name);
    setCategoryFormError("");
    setCategoryModalKey((k) => k + 1);
    setCategoryModalOpen(true);
  }

  async function saveCategory(e: FormEvent) {
    e.preventDefault();
    const name = categoryNameRef.current?.value.trim() ?? "";
    if (!name) {
      setCategoryFormError("Nome é obrigatório.");
      return;
    }
    setCategorySaving(true);
    setCategoryFormError("");
    try {
      if (editingCategoryId === null) {
        await api.post("/catalog/categories", { name }, catalogParams());
      } else {
        await api.put(`/catalog/categories/${editingCategoryId}`, { name }, catalogParams());
      }
      setCategoryModalOpen(false);
      loadCategories();
    } catch {
      setCategoryFormError("Erro ao salvar categoria.");
    } finally {
      setCategorySaving(false);
    }
  }

  function deactivateCategory(id: number) {
    setConfirmState({
      message: "Desativar categoria? Ela some do totem, mas os produtos continuam cadastrados e reaparecem se a categoria for reativada.",
      onConfirm: async () => {
        setConfirmState(null);
        await api.delete(`/catalog/categories/${id}`, catalogParams());
        loadCategories();
      },
    });
  }

  async function activateCategory(id: number) {
    await api.put(`/catalog/categories/${id}`, { active: true }, catalogParams());
    loadCategories();
  }

  function deleteCategoryPermanently(id: number, name: string) {
    setConfirmState({
      message: `Excluir definitivamente a categoria "${name}"? Essa ação NÃO pode ser desfeita — a categoria e todos os seus produtos deixam de existir no sistema para sempre. Vendas já realizadas com esses produtos não são afetadas.`,
      alertVariant: "warning",
      alertIcon: "alert-triangle",
      onConfirm: async () => {
        setConfirmState(null);
        await api.delete(`/catalog/categories/${id}`, catalogParams({ permanent: true }));
        loadCategories();
      },
    });
  }

  // Atalho de produtividade: clicar numa categoria já filtra e leva pra
  // aba Produtos — sem isso, virar abas trocaria 1 clique por 2 (pedido
  // explícito do usuário: manter "usabilidade aguçada").
  function browseCategoryProducts(id: number) {
    setProductCategoryFilter(String(id));
    setActiveTab("products");
  }

  // ── Produtos ───────────────────────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([]);
  const [errProducts, setErrProducts] = useState<string | null>(null);
  const [productNameFilter, setProductNameFilter] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState(""); // "" = todas as categorias
  const [productStatusFilter, setProductStatusFilter] = useState<StatusFilter>("active");
  const productRequestId = useRef(0);

  // Só categorias ativas — o backend rejeita mover produto pra categoria
  // inativa (tanto na criação quanto na edição).
  const activeCategoryOptions: DropdownOptions[] = categories
    .filter((c) => c.active)
    .map((c) => ({ value: String(c.id), label: c.name }));

  // Filtro de produtos por categoria inclui inativas — precisa continuar
  // dando pra listar produtos de uma categoria desativada.
  const productCategoryFilterOptions: DropdownOptions[] = [
    { value: "", label: "Todas" },
    ...categories.map((c) => ({ value: String(c.id), label: c.active ? c.name : `${c.name} (inativa)` })),
  ];

  async function loadProducts() {
    if (!hasCompanyContext) return;
    const thisRequest = ++productRequestId.current;
    try {
      // Sem category_id — traz produtos de todas as categorias; o filtro
      // de categoria é aplicado no cliente (mesma lista serve pro
      // dropdown "Todas" e pra filtro específico, sem round-trip extra).
      const r = await api.get("/catalog/products", catalogParams({ include_inactive: true }));
      if (thisRequest !== productRequestId.current) return; // resposta obsoleta, ignorar
      setProducts(r.data.products ?? r.data);
      setErrProducts(null);
    } catch {
      if (thisRequest !== productRequestId.current) return;
      setErrProducts("Erro ao carregar produtos.");
    }
  }

  useEffect(() => {
    if (!hasCompanyContext) { setProducts([]); return; }
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCompanyContext, companyId]);

  function clearProductFilters() {
    setProductNameFilter("");
    setProductCategoryFilter("");
    setProductStatusFilter("active");
  }

  const filteredProducts = products
    .filter((p) => {
      if (productStatusFilter === "active" && !p.active) return false;
      if (productStatusFilter === "inactive" && p.active) return false;
      if (productCategoryFilter && String(p.category_id) !== productCategoryFilter) return false;
      if (productNameFilter && !p.name.toLowerCase().includes(productNameFilter.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  // Reordenar só faz sentido dentro de UMA categoria — sort_order é
  // escopado por categoria no backend (PUT /catalog/products/reorder), que
  // valida que o conjunto enviado bate EXATAMENTE com todos os produtos
  // (ativos+inativos) da categoria — por isso também exige filtro de nome
  // vazio e status "Todos", senão a lista visível seria um subconjunto e a
  // chamada falharia. Drag-and-drop (não mais setas — pedido direto do
  // usuário) via Pointer Events na própria Table (ver components/Table.tsx),
  // mesmo mecanismo do drag-and-drop de Preparo, com suporte a touch.
  const canReorderProducts = Boolean(productCategoryFilter) && !productNameFilter && productStatusFilter === "all";

  async function reorderProducts(orderedIds: (string | number)[]) {
    if (!productCategoryFilter) return;
    const ids = orderedIds.map(Number);
    const orderMap = new Map(ids.map((id, i) => [id, i]));
    setProducts((prev) => prev.map((p) => (orderMap.has(p.id) ? { ...p, sort_order: orderMap.get(p.id)! } : p)));
    await api.put("/catalog/products/reorder", {
      category_id: Number(productCategoryFilter),
      product_ids: ids,
    }, catalogParams());
  }

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [newProd, setNewProd] = useState<{ name: string; price: number | null; category_id: number | null }>({
    name: "", price: null, category_id: null,
  });
  const [editProd, setEditProd] = useState<EditProdState | null>(null); // não-nulo = editando
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [productFormError, setProductFormError] = useState("");
  const [productSaving, setProductSaving] = useState(false);

  function openNewProduct() {
    setEditProd(null);
    setNewProd({
      name: "",
      price: null,
      // Pré-seleciona a categoria do filtro atual, se houver — mesma
      // conveniência de antes (adicionar direto na categoria que se está
      // olhando), só que agora como valor inicial editável, não implícito.
      category_id: productCategoryFilter ? Number(productCategoryFilter) : null,
    });
    setUploadFiles([]);
    setProductFormError("");
    setProductModalOpen(true);
  }

  function openEditProduct(p: Product) {
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
    setProductFormError("");
    setProductModalOpen(true);
  }

  // useCallback (não função solta) de propósito: Modal.js reroda seu efeito
  // interno sempre que onClose/onBackdropClick/onCloseButtonClick mudam de
  // referência — com uma função nova a cada render (como digitar num campo
  // controlado dentro do modal dispara), o efeito reroda a cada tecla e
  // acaba devolvendo o foco pro wrapper do modal, comendo caracteres
  // digitados. Achado ao vivo 2026-08-24, testando o formulário de produto
  // (que tem campos controlados, diferente do de categoria, só com ref).
  const closeProductModal = useCallback(() => {
    setProductModalOpen(false);
    setEditProd(null);
    setUploadFiles([]);
  }, []);

  async function saveNewProduct(e: FormEvent) {
    e.preventDefault();
    if (!newProd.name.trim() || !newProd.price || !newProd.category_id) return;
    setProductSaving(true);
    setProductFormError("");
    try {
      await api.post("/catalog/products", {
        category_id: newProd.category_id,
        name: newProd.name.trim(),
        price: newProd.price,
      }, catalogParams());
      closeProductModal();
      loadProducts();
    } catch {
      setProductFormError("Erro ao criar produto.");
    } finally {
      setProductSaving(false);
    }
  }

  async function saveEditProd(e: FormEvent) {
    e.preventDefault();
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
      closeProductModal();
      loadProducts();
    } catch {
      setProductFormError("Erro ao salvar produto.");
    } finally {
      setProductSaving(false);
    }
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
      const r = await api.post(`/catalog/products/${productId}/image`, formData, catalogParams());
      setEditProd((prev) => (prev && prev.id === productId
        ? { ...prev, image_url: r.data.image_url, thumbnail_url: r.data.thumbnail_url }
        : prev));
      setUploadFiles([]);
      loadProducts();
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
        const r = await api.delete(`/catalog/products/${productId}/image`, catalogParams());
        setEditProd((prev) => (prev && prev.id === productId
          ? { ...prev, image_url: r.data.image_url, thumbnail_url: r.data.thumbnail_url }
          : prev));
        loadProducts();
      },
    });
  }

  function deactivateProduct(id: number) {
    setConfirmState({
      message: "Desativar produto?",
      onConfirm: async () => {
        setConfirmState(null);
        await api.delete(`/catalog/products/${id}`, catalogParams());
        loadProducts();
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
        await api.delete(`/catalog/products/${id}`, catalogParams({ permanent: true }));
        loadProducts();
      },
    });
  }

  async function activateProduct(id: number) {
    await api.put(`/catalog/products/${id}`, { active: true }, catalogParams());
    loadProducts();
  }

  function categoryName(id: number): string {
    return categories.find((c) => c.id === id)?.name ?? "—";
  }

  return (
    <div className={styles.page}>
      <div className={styles.title}>Catálogo</div>

      {isPlatformAdmin && (
        <div className={styles.companySelector}>
          <Dropdown
            label="Empresa"
            placeholder="Selecionar empresa…"
            value={companyOptions.find((o) => o.value === String(companyId ?? "")) ?? null}
            onValueSelected={(opt) => setSelectedCompany(opt.value ? Number(opt.value) : null)}
            options={companyOptions}
          />
        </div>
      )}

      {!hasCompanyContext ? (
        <div className={styles.empty}>Selecione uma empresa para gerenciar o catálogo.</div>
      ) : (
      <>
      <div className={styles.tabs}>
        <Tabs activeTab={activeTab} onSelectTab={(v) => setActiveTab(v as typeof activeTab)}>
          <Tab value="categories" label="Categorias" totalizer={categories.length} />
          <Tab value="products" label="Produtos" totalizer={products.length} />
        </Tabs>
      </div>

      {/* ── Categorias ── */}
      {activeTab === "categories" && (
        <>
          {errCategories && (
            <div className={styles.errorRow}>
              <span className={styles.muted}>{errCategories}</span>
              <Button size="small" variant="secondary" onClick={loadCategories}>Tentar novamente</Button>
            </div>
          )}

          <div className={styles.filterBar}>
            <InputBase
              label="Categoria"
              placeholder="Buscar por nome…"
              value={categoryNameFilter}
              onChange={(e) => setCategoryNameFilter(e.target.value)}
            />
            <Dropdown
              label="Status"
              value={CATEGORY_STATUS_FILTER_OPTIONS.find((o) => o.value === categoryStatusFilter) ?? CATEGORY_STATUS_FILTER_OPTIONS[0]}
              onValueSelected={(opt) => setCategoryStatusFilter(opt.value as StatusFilter)}
              options={CATEGORY_STATUS_FILTER_OPTIONS}
            />
            <Button type="button" variant="secondary" onClick={clearCategoryFilters}>Limpar filtros</Button>
            <Button type="button" onClick={openNewCategory}>+ Nova categoria</Button>
          </div>

          <div className={styles.reorderHint}>
            {canReorderCategories
              ? "Arraste pelo ⠿ para reordenar — a ordem aqui é a mesma exibida no totem."
              : "Reordenar só é possível com o filtro de nome vazio e status em \"Todas\"."}
          </div>

          <Table
            variant="compact"
            rowKey={(c: Category) => c.id}
            emptyMessage="Nenhuma categoria encontrada."
            onRowClick={(c: Category) => browseCategoryProducts(c.id)}
            onReorder={canReorderCategories ? reorderCategories : undefined}
            columns={[
              { key: "name", header: "Categoria", render: (c: Category) => c.name },
              {
                key: "status", header: "Status",
                render: (c: Category) => <Tag variant={c.active ? "success" : "error"}>{c.active ? "Ativa" : "Inativa"}</Tag>,
              },
              {
                key: "action", header: "", render: (c: Category) => (
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
                    <Button size="small" variant="secondary" onClick={() => openEditCategory(c)}>Editar</Button>
                    {c.active ? (
                      <Button size="small" variant="secondary" onClick={() => deactivateCategory(c.id)}>Desativar</Button>
                    ) : (
                      <Button size="small" variant="secondary" onClick={() => activateCategory(c.id)}>Ativar</Button>
                    )}
                    <Button size="small" variant="secondary" style={DANGER_BTN_STYLE} onClick={() => deleteCategoryPermanently(c.id, c.name)}>
                      Excluir
                    </Button>
                  </div>
                ),
              },
            ]}
            rows={filteredCategories}
          />

          <Modal
            open={categoryModalOpen}
            width={480}
            onClose={() => setCategoryModalOpen(false)}
            onBackdropClick={() => setCategoryModalOpen(false)}
            onCloseButtonClick={() => setCategoryModalOpen(false)}
          >
            <form key={categoryModalKey} onSubmit={saveCategory} className={styles.modalForm}>
              <div className={styles.formTitle}>{editingCategoryId === null ? "Nova categoria" : "Editar categoria"}</div>
              {categoryFormError && <Alert variant="error" text={categoryFormError} fullWidth />}
              <InputBase
                label="Nome da categoria"
                defaultValue={categoryNameDefault}
                ref={categoryNameRef}
                autoFocus
                required
              />
              <div className={styles.formActions}>
                <Button type="submit" disabled={categorySaving}>Salvar</Button>
                <Button type="button" variant="secondary" onClick={() => setCategoryModalOpen(false)}>Cancelar</Button>
              </div>
            </form>
          </Modal>
        </>
      )}

      {/* ── Produtos ── */}
      {activeTab === "products" && (
        <>
          {errProducts && (
            <div className={styles.errorRow}>
              <span className={styles.muted}>{errProducts}</span>
              <Button size="small" variant="secondary" onClick={loadProducts}>Tentar novamente</Button>
            </div>
          )}

          <div className={styles.filterBar}>
            <InputBase
              label="Produto"
              placeholder="Buscar por nome…"
              value={productNameFilter}
              onChange={(e) => setProductNameFilter(e.target.value)}
            />
            <Dropdown
              label="Categoria"
              value={productCategoryFilterOptions.find((o) => o.value === productCategoryFilter) ?? productCategoryFilterOptions[0]}
              onValueSelected={(opt) => setProductCategoryFilter(opt.value)}
              options={productCategoryFilterOptions}
            />
            <Dropdown
              label="Status"
              value={PRODUCT_STATUS_FILTER_OPTIONS.find((o) => o.value === productStatusFilter) ?? PRODUCT_STATUS_FILTER_OPTIONS[0]}
              onValueSelected={(opt) => setProductStatusFilter(opt.value as StatusFilter)}
              options={PRODUCT_STATUS_FILTER_OPTIONS}
            />
            <Button type="button" variant="secondary" onClick={clearProductFilters}>Limpar filtros</Button>
            <Button type="button" onClick={openNewProduct}>+ Novo produto</Button>
          </div>

          {productCategoryFilter && (
            <div className={styles.reorderHint}>
              {canReorderProducts
                ? "Arraste pelo ⠿ para reordenar — a ordem aqui é a mesma exibida no totem."
                : "Reordenar só é possível com o filtro de nome vazio e status em \"Todos\", dentro de uma categoria específica."}
            </div>
          )}

          <Table
            variant="compact"
            rowKey={(p: Product) => p.id}
            emptyMessage="Nenhum produto encontrado."
            onReorder={canReorderProducts ? reorderProducts : undefined}
            columns={[
              {
                key: "image", header: "", render: (p: Product) => (
                  p.thumbnail_url ? (
                    <img
                      src={p.thumbnail_url}
                      alt={p.name}
                      className={styles.rowThumb}
                      onClick={() => setPreviewImage({ url: p.image_url ?? p.thumbnail_url!, alt: p.name })}
                    />
                  ) : (
                    <span className={styles.rowThumbPlaceholder} />
                  )
                ),
              },
              {
                key: "name", header: "Produto", render: (p: Product) => (
                  <>
                    <strong>{p.name}</strong>
                    {(p.tags ?? []).map((t) => (
                      <Tag key={t} variant={tagVariant(t)}>{t}</Tag>
                    ))}
                  </>
                ),
              },
              { key: "category", header: "Categoria", render: (p: Product) => categoryName(p.category_id) },
              {
                key: "price", header: "Preço",
                render: (p: Product) => p.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
              },
              {
                key: "status", header: "Status",
                render: (p: Product) => <Tag variant={p.active ? "success" : "error"}>{p.active ? "Ativo" : "Inativo"}</Tag>,
              },
              {
                key: "action", header: "", render: (p: Product) => (
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
                    <Button size="small" variant="secondary" onClick={() => openEditProduct(p)}>Editar</Button>
                    {p.active ? (
                      <Button size="small" variant="secondary" onClick={() => deactivateProduct(p.id)}>Desativar</Button>
                    ) : (
                      <Button size="small" variant="secondary" onClick={() => activateProduct(p.id)}>Ativar</Button>
                    )}
                    <Button size="small" variant="secondary" style={DANGER_BTN_STYLE} onClick={() => deleteProductPermanently(p.id, p.name)}>
                      Excluir
                    </Button>
                  </div>
                ),
              },
            ]}
            rows={filteredProducts}
          />

          <Modal
            open={productModalOpen}
            width={editProd ? 664 : 480}
            onClose={closeProductModal}
            onBackdropClick={closeProductModal}
            onCloseButtonClick={closeProductModal}
          >
            {!editProd ? (
              <form onSubmit={saveNewProduct} className={styles.modalForm}>
                <div className={styles.formTitle}>Novo produto</div>
                {productFormError && <Alert variant="error" text={productFormError} fullWidth />}
                <InputBase
                  label="Nome do produto"
                  value={newProd.name}
                  onChange={(e) => setNewProd({ ...newProd, name: e.target.value })}
                  autoFocus
                />
                <CurrencyInput
                  label="Preço"
                  value={newProd.price}
                  onChange={(value: number) => setNewProd({ ...newProd, price: value })}
                />
                <Dropdown
                  label="Categoria"
                  value={activeCategoryOptions.find((o) => o.value === String(newProd.category_id ?? "")) ?? null}
                  onValueSelected={(opt) => setNewProd({ ...newProd, category_id: opt.value ? Number(opt.value) : null })}
                  options={activeCategoryOptions}
                />
                <div className={styles.formHint}>
                  Imagem, descrição, alérgenos e outros detalhes podem ser adicionados depois de criar o produto, em "Editar".
                </div>
                <div className={styles.formActions}>
                  <Button type="submit" disabled={productSaving || !newProd.name.trim() || !newProd.price || !newProd.category_id}>
                    Adicionar produto
                  </Button>
                  <Button type="button" variant="secondary" onClick={closeProductModal}>Cancelar</Button>
                </div>
              </form>
            ) : (
              <form onSubmit={saveEditProd} className={styles.modalForm}>
                <div className={styles.formTitle}>Editando produto</div>
                {productFormError && <Alert variant="error" text={productFormError} fullWidth />}
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
                  value={activeCategoryOptions.find((o) => o.value === String(editProd.category_id)) ?? null}
                  onValueSelected={(opt) => setEditProd({ ...editProd, category_id: Number(opt.value) })}
                  options={activeCategoryOptions}
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
                  <Button type="submit" disabled={productSaving || !editProd.name.trim() || editProd.price <= 0}>
                    Salvar
                  </Button>
                  <Button type="button" variant="secondary" onClick={closeProductModal}>Cancelar</Button>
                </div>
              </form>
            )}
          </Modal>
        </>
      )}
      </>
      )}

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
