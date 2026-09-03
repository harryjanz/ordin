import { useState, useEffect, useRef, useCallback, FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Button,
  Checkbox,
  CurrencyInput,
  Dropdown,
  InputBase,
  Modal,
  Tab,
  Tabs,
  Tag,
  makeToast,
  type DropdownOptions,
  type TagProps,
} from "design-system";
import api from "../api";
import { listCompanies } from "../api/companies";
import ConfirmDialog, { type ConfirmDialogProps } from "../components/ConfirmDialog";
import Table from "../components/Table";
import { parseApiError } from "../lib/apiErrors";
import { useStore } from "../store";
import type { Category, Combo, Company, Menu, OptionGroup, Product } from "../types";
import styles from "./CatalogScreen.module.scss";

// Variant semântica por tag conhecida — o resto cai no default (neutral).
const TAG_VARIANTS: Record<string, TagProps["variant"]> = {
  picante: "warning",
  vegetariano: "success",
  "mais vendido": "emphasys",
};

function tagVariant(tag: string): TagProps["variant"] {
  return TAG_VARIANTS[tag.toLowerCase()] ?? "neutral";
}

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

const MENU_STATUS_FILTER_OPTIONS: DropdownOptions[] = [
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
  { value: "all", label: "Todos" },
];

// 0=segunda..6=domingo, mesmo datetime.weekday() do backend (ORD-125).
const WEEKDAY_ABBR = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function formatWeekdays(weekdays: number[]): string {
  const sorted = [...weekdays].sort((a, b) => a - b);
  if (sorted.length === 7) return "Todos os dias";
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (contiguous && sorted.length > 1) return `${WEEKDAY_ABBR[sorted[0]]}-${WEEKDAY_ABBR[sorted[sorted.length - 1]]}`;
  return sorted.map((d) => WEEKDAY_ABBR[d]).join(", ");
}

export default function CatalogScreen() {
  const navigate = useNavigate();
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
  // ORD-136 — produto/cardápio agora navegam pra tela dedicada e voltam via
  // navigate("/catalog"), o que remontava a tela sempre na aba padrão
  // "categories". ?tab= preserva de qual aba o usuário saiu.
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab = tabParam === "products" || tabParam === "menus" || tabParam === "options" || tabParam === "combos" ? tabParam : "categories";
  const [activeTab, setActiveTab] = useState<"categories" | "products" | "menus" | "options" | "combos">(initialTab);

  const [confirmState, setConfirmState] = useState<{
    message: string;
    onConfirm: () => void;
    alertVariant?: ConfirmDialogProps["alertVariant"];
    alertIcon?: string;
  } | null>(null);

  // ORD-152: sugestão (não bloqueante) de reativar combos que ficaram
  // inativos quando o produto foi desativado — separado do confirmState
  // porque aqui a confirmação tem uma lista de checkbox, não é binária.
  const [suggestCombos, setSuggestCombos] = useState<{
    combos: { id: number; name: string }[];
    selected: Set<number>;
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
  const [productFormError, setProductFormError] = useState("");
  const [productSaving, setProductSaving] = useState(false);

  function openNewProduct() {
    setNewProd({
      name: "",
      price: null,
      // Pré-seleciona a categoria do filtro atual, se houver — mesma
      // conveniência de antes (adicionar direto na categoria que se está
      // olhando), só que agora como valor inicial editável, não implícito.
      category_id: productCategoryFilter ? Number(productCategoryFilter) : null,
    });
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

  // ORD-151: se o produto for componente de combo ativo, a API recusa com
  // 409 (mensagem já nomeia os combos afetados) até vir
  // confirm_deactivate_combos=true — aí desativa produto e combo(s) juntos.
  // Mesmo padrão de setConfirmState em duas chamadas já usado em
  // deleteOptionGroup, só que aqui o alerta só aparece SE a API acusar
  // vínculo (não dá pra saber antes de tentar, sem round-trip a mais).
  async function deactivateProduct(id: number) {
    try {
      await api.delete(`/catalog/products/${id}`, catalogParams());
      loadProducts();
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const { message } = parseApiError(err);
      if (status !== 409) {
        makeToast("error", message);
        return;
      }
      setConfirmState({
        message: `${message} Desativar mesmo assim (o(s) combo(s) também ficam desativados)?`,
        alertVariant: "warning",
        alertIcon: "alert-triangle",
        onConfirm: async () => {
          setConfirmState(null);
          try {
            await api.delete(`/catalog/products/${id}`, catalogParams({ confirm_deactivate_combos: true }));
            loadProducts();
            loadCombos();
          } catch (err2) {
            makeToast("error", parseApiError(err2).message);
          }
        },
      });
    }
  }

  function deleteProductPermanently(id: number, name: string) {
    setConfirmState({
      message: `Excluir definitivamente o produto "${name}"? Essa ação NÃO pode ser desfeita — o produto deixa de existir no sistema para sempre. Vendas já realizadas com este produto não são afetadas.`,
      alertVariant: "warning",
      alertIcon: "alert-triangle",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          await api.delete(`/catalog/products/${id}`, catalogParams({ permanent: true }));
          loadProducts();
        } catch (err) {
          const status = (err as { response?: { status?: number } })?.response?.status;
          const { message } = parseApiError(err);
          if (status !== 409) {
            makeToast("error", message);
            return;
          }
          setConfirmState({
            message: `${message} Excluir definitivamente mesmo assim (o(s) combo(s) também ficam desativados)?`,
            alertVariant: "warning",
            alertIcon: "alert-triangle",
            onConfirm: async () => {
              setConfirmState(null);
              try {
                await api.delete(
                  `/catalog/products/${id}`,
                  catalogParams({ permanent: true, confirm_deactivate_combos: true }),
                );
                loadProducts();
                loadCombos();
              } catch (err2) {
                makeToast("error", parseApiError(err2).message);
              }
            },
          });
        }
      },
    });
  }

  // ORD-152: ativar o produto nunca é bloqueado — a resposta pode trazer
  // combos que ficaram inativos e que agora podem voltar a ser vendidos.
  // Sugestão opt-in: cada combo já vem marcado, o admin decide o que confirmar.
  async function activateProduct(id: number) {
    const r = await api.put(`/catalog/products/${id}`, { active: true }, catalogParams());
    loadProducts();
    const combos = r.data.inactive_combos as { id: number; name: string }[];
    if (combos?.length) {
      setSuggestCombos({ combos, selected: new Set(combos.map((c) => c.id)) });
    }
  }

  async function confirmSuggestedCombos() {
    if (!suggestCombos) return;
    const toActivate = suggestCombos.combos.filter((c) => suggestCombos.selected.has(c.id));
    setSuggestCombos(null);
    const results = await Promise.allSettled(
      toActivate.map((c) => api.patch(`/catalog/combos/${c.id}`, { active: true }, catalogParams())),
    );
    const failed = results
      .map((r, i) => ({ r, combo: toActivate[i] }))
      .filter(({ r }) => r.status === "rejected");
    const activatedCount = toActivate.length - failed.length;
    if (activatedCount > 0) {
      makeToast("success", `${activatedCount} combo(s) reativado(s).`);
    }
    for (const { r, combo } of failed) {
      const err = (r as PromiseRejectedResult).reason;
      makeToast("error", `"${combo.name}": ${parseApiError(err).message}`);
    }
    loadProducts();
    loadCombos();
  }

  function categoryName(id: number): string {
    return categories.find((c) => c.id === id)?.name ?? "—";
  }

  // ── Cardápios (ORD-126) ────────────────────────────────────────────────
  const [menus, setMenus] = useState<Menu[]>([]);
  const [errMenus, setErrMenus] = useState<string | null>(null);
  const [menuNameFilter, setMenuNameFilter] = useState("");
  const [menuStatusFilter, setMenuStatusFilter] = useState<StatusFilter>("active");
  const menuRequestId = useRef(0);

  async function loadMenus() {
    if (!hasCompanyContext) return;
    const thisRequest = ++menuRequestId.current;
    try {
      const r = await api.get("/catalog/menus", catalogParams());
      if (thisRequest !== menuRequestId.current) return; // resposta obsoleta, ignorar
      setMenus(r.data.menus ?? r.data);
      setErrMenus(null);
    } catch {
      if (thisRequest !== menuRequestId.current) return;
      setErrMenus("Erro ao carregar cardápios.");
    }
  }

  useEffect(() => {
    if (!hasCompanyContext) { setMenus([]); return; }
    loadMenus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCompanyContext, companyId]);

  const filteredMenus = menus.filter((m) => {
    if (menuStatusFilter === "active" && !m.active) return false;
    if (menuStatusFilter === "inactive" && m.active) return false;
    if (menuNameFilter && !m.name.toLowerCase().includes(menuNameFilter.toLowerCase())) return false;
    return true;
  });

  function clearMenuFilters() {
    setMenuNameFilter("");
    setMenuStatusFilter("active");
  }

  function deactivateMenu(id: number) {
    setConfirmState({
      message: "Desativar cardápio? Os produtos vinculados a ele deixam de aparecer no totem enquanto estiver desativado, mesmo dentro do horário configurado.",
      onConfirm: async () => {
        setConfirmState(null);
        await api.put(`/catalog/menus/${id}`, { active: false }, catalogParams());
        loadMenus();
      },
    });
  }

  async function activateMenu(id: number) {
    await api.put(`/catalog/menus/${id}`, { active: true }, catalogParams());
    loadMenus();
  }

  function deleteMenu(id: number, name: string) {
    setConfirmState({
      message: `Excluir o cardápio "${name}"? Os produtos e categorias vinculados a ele voltam a ficar sempre visíveis (se não estiverem em nenhum outro cardápio). Essa ação não pode ser desfeita.`,
      alertVariant: "warning",
      alertIcon: "alert-triangle",
      onConfirm: async () => {
        setConfirmState(null);
        await api.delete(`/catalog/menus/${id}`, catalogParams());
        loadMenus();
      },
    });
  }

  // ── Opções (ORD-139) ───────────────────────────────────────────────────
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([]);
  const [errOptionGroups, setErrOptionGroups] = useState<string | null>(null);
  const [optionGroupNameFilter, setOptionGroupNameFilter] = useState("");
  const optionGroupRequestId = useRef(0);

  async function loadOptionGroups() {
    if (!hasCompanyContext) return;
    const thisRequest = ++optionGroupRequestId.current;
    try {
      const r = await api.get("/catalog/option-groups", catalogParams());
      if (thisRequest !== optionGroupRequestId.current) return; // resposta obsoleta, ignorar
      setOptionGroups(r.data.option_groups ?? r.data);
      setErrOptionGroups(null);
    } catch {
      if (thisRequest !== optionGroupRequestId.current) return;
      setErrOptionGroups("Erro ao carregar grupos de opção.");
    }
  }

  useEffect(() => {
    if (!hasCompanyContext) { setOptionGroups([]); return; }
    loadOptionGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCompanyContext, companyId]);

  const filteredOptionGroups = optionGroups.filter((g) => {
    if (optionGroupNameFilter && !g.name.toLowerCase().includes(optionGroupNameFilter.toLowerCase())) return false;
    return true;
  });

  function clearOptionGroupFilters() {
    setOptionGroupNameFilter("");
  }

  function deleteOptionGroup(id: number, name: string) {
    setConfirmState({
      message: `Excluir o grupo de opção "${name}"? Essa ação não pode ser desfeita.`,
      alertVariant: "warning",
      alertIcon: "alert-triangle",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          await api.delete(`/catalog/option-groups/${id}`, catalogParams());
          loadOptionGroups();
        } catch (err) {
          // 409 = grupo vinculado a produto(s) — mensagem da API já nomeia
          // os produtos, exibida tal como veio (ver QA Explorer de ORD-139).
          makeToast("error", parseApiError(err).message);
        }
      },
    });
  }

  // ── Combos (ORD-112) ────────────────────────────────────────────────────
  const [combos, setCombos] = useState<Combo[]>([]);
  const [errCombos, setErrCombos] = useState<string | null>(null);
  const [comboNameFilter, setComboNameFilter] = useState("");
  const comboRequestId = useRef(0);

  async function loadCombos() {
    if (!hasCompanyContext) return;
    const thisRequest = ++comboRequestId.current;
    try {
      const r = await api.get("/catalog/combos", catalogParams({ include_inactive: true }));
      if (thisRequest !== comboRequestId.current) return; // resposta obsoleta, ignorar
      setCombos(r.data.combos ?? r.data);
      setErrCombos(null);
    } catch {
      if (thisRequest !== comboRequestId.current) return;
      setErrCombos("Erro ao carregar combos.");
    }
  }

  useEffect(() => {
    if (!hasCompanyContext) { setCombos([]); return; }
    loadCombos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCompanyContext, companyId]);

  const filteredCombos = combos.filter((c) => {
    if (comboNameFilter && !c.name.toLowerCase().includes(comboNameFilter.toLowerCase())) return false;
    return true;
  });

  function clearComboFilters() {
    setComboNameFilter("");
  }

  // Combo tem PUT próprio de edição (replace completo dos produtos
  // componentes), então ativar/desativar sem reabrir o formulário inteiro
  // usa um PATCH dedicado — mesmo racional do PATCH de Option (ORD-145), não
  // o padrão de Category/Product (cujo PUT simples não mexe em lista filha).
  function deactivateCombo(id: number, name: string) {
    setConfirmState({
      message: `Desativar o combo "${name}"? Ele some do totem, mas continua cadastrado e pode ser reativado a qualquer momento.`,
      onConfirm: async () => {
        setConfirmState(null);
        try {
          await api.patch(`/catalog/combos/${id}`, { active: false }, catalogParams());
          loadCombos();
        } catch (err) {
          makeToast("error", parseApiError(err).message);
        }
      },
    });
  }

  async function activateCombo(id: number) {
    try {
      await api.patch(`/catalog/combos/${id}`, { active: true }, catalogParams());
      loadCombos();
    } catch (err) {
      makeToast("error", parseApiError(err).message);
    }
  }

  function deleteComboPermanently(id: number, name: string) {
    setConfirmState({
      message: `Excluir definitivamente o combo "${name}"? Essa ação NÃO pode ser desfeita. Pedidos já feitos com esse combo não são afetados.`,
      alertVariant: "warning",
      alertIcon: "alert-triangle",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          await api.delete(`/catalog/combos/${id}`, catalogParams());
          loadCombos();
        } catch (err) {
          makeToast("error", parseApiError(err).message);
        }
      },
    });
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
          <Tab value="menus" label="Cardápios" totalizer={menus.length} />
          <Tab value="options" label="Opções" totalizer={optionGroups.length} />
          <Tab value="combos" label="Combos" totalizer={combos.length} />
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
                    <Button size="small" variant="secondary" onClick={() => navigate(`/catalog/products/${p.id}/edit`)}>Editar</Button>
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
            width={480}
            onClose={closeProductModal}
            onBackdropClick={closeProductModal}
            onCloseButtonClick={closeProductModal}
          >
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
          </Modal>
        </>
      )}

      {/* ── Cardápios ── */}
      {activeTab === "menus" && (
        <>
          {errMenus && (
            <div className={styles.errorRow}>
              <span className={styles.muted}>{errMenus}</span>
              <Button size="small" variant="secondary" onClick={loadMenus}>Tentar novamente</Button>
            </div>
          )}

          <div className={styles.filterBar}>
            <InputBase
              label="Cardápio"
              placeholder="Buscar por nome…"
              value={menuNameFilter}
              onChange={(e) => setMenuNameFilter(e.target.value)}
            />
            <Dropdown
              label="Status"
              value={MENU_STATUS_FILTER_OPTIONS.find((o) => o.value === menuStatusFilter) ?? MENU_STATUS_FILTER_OPTIONS[0]}
              onValueSelected={(opt) => setMenuStatusFilter(opt.value as StatusFilter)}
              options={MENU_STATUS_FILTER_OPTIONS}
            />
            <Button type="button" variant="secondary" onClick={clearMenuFilters}>Limpar filtros</Button>
            <Button type="button" onClick={() => navigate("/catalog/menus/new")}>+ Novo cardápio</Button>
          </div>

          <Table
            variant="compact"
            rowKey={(m: Menu) => m.id}
            emptyMessage="Nenhum cardápio encontrado."
            columns={[
              { key: "name", header: "Cardápio", render: (m: Menu) => m.name },
              { key: "days", header: "Dias", render: (m: Menu) => formatWeekdays(m.weekdays) },
              { key: "hours", header: "Horário", render: (m: Menu) => `${m.start_time}-${m.end_time}` },
              {
                key: "composition", header: "Composição", render: (m: Menu) => (
                  <span className={styles.muted}>
                    {m.categories.length} categoria{m.categories.length === 1 ? "" : "s"}, {m.products.length} produto{m.products.length === 1 ? "" : "s"}
                  </span>
                ),
              },
              {
                key: "status", header: "Status",
                render: (m: Menu) => <Tag variant={m.active ? "success" : "error"}>{m.active ? "Ativo" : "Inativo"}</Tag>,
              },
              {
                key: "action", header: "", render: (m: Menu) => (
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <Button size="small" variant="secondary" onClick={() => navigate(`/catalog/menus/${m.id}/edit`)}>Editar</Button>
                    {m.active ? (
                      <Button size="small" variant="secondary" onClick={() => deactivateMenu(m.id)}>Desativar</Button>
                    ) : (
                      <Button size="small" variant="secondary" onClick={() => activateMenu(m.id)}>Ativar</Button>
                    )}
                    <Button size="small" variant="secondary" style={DANGER_BTN_STYLE} onClick={() => deleteMenu(m.id, m.name)}>
                      Excluir
                    </Button>
                  </div>
                ),
              },
            ]}
            rows={filteredMenus}
          />
        </>
      )}

      {/* ── Opções (ORD-139) ── */}
      {activeTab === "options" && (
        <>
          {errOptionGroups && (
            <div className={styles.errorRow}>
              <span className={styles.muted}>{errOptionGroups}</span>
              <Button size="small" variant="secondary" onClick={loadOptionGroups}>Tentar novamente</Button>
            </div>
          )}

          <div className={styles.filterBar}>
            <InputBase
              label="Grupo"
              placeholder="Buscar por nome…"
              value={optionGroupNameFilter}
              onChange={(e) => setOptionGroupNameFilter(e.target.value)}
            />
            <Button type="button" variant="secondary" onClick={clearOptionGroupFilters}>Limpar filtros</Button>
            <Button type="button" onClick={() => navigate("/catalog/option-groups/new")}>+ Novo grupo</Button>
          </div>

          <Table
            variant="compact"
            rowKey={(g: OptionGroup) => g.id}
            emptyMessage="Nenhum grupo de opção encontrado."
            columns={[
              { key: "name", header: "Grupo", render: (g: OptionGroup) => g.name },
              {
                key: "required", header: "Obrigatoriedade",
                render: (g: OptionGroup) => (
                  <Tag variant={g.min_selections >= 1 ? "emphasys" : "neutral"}>
                    {g.min_selections >= 1 ? "Obrigatório" : "Opcional"}
                  </Tag>
                ),
              },
              {
                key: "selection", header: "Seleção",
                render: (g: OptionGroup) => (
                  <Tag variant="neutral">{g.max_selections === 1 ? "Única" : "Múltipla"}</Tag>
                ),
              },
              {
                key: "options", header: "Opções",
                render: (g: OptionGroup) => (
                  <span className={styles.muted}>{g.options.length} opç{g.options.length === 1 ? "ão" : "ões"}</span>
                ),
              },
              {
                key: "action", header: "", render: (g: OptionGroup) => (
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <Button size="small" variant="secondary" onClick={() => navigate(`/catalog/option-groups/${g.id}/edit`)}>Editar</Button>
                    <Button size="small" variant="secondary" style={DANGER_BTN_STYLE} onClick={() => deleteOptionGroup(g.id, g.name)}>
                      Excluir
                    </Button>
                  </div>
                ),
              },
            ]}
            rows={filteredOptionGroups}
          />
        </>
      )}

      {/* ── Combos (ORD-112) ── */}
      {activeTab === "combos" && (
        <>
          {errCombos && (
            <div className={styles.errorRow}>
              <span className={styles.muted}>{errCombos}</span>
              <Button size="small" variant="secondary" onClick={loadCombos}>Tentar novamente</Button>
            </div>
          )}

          <div className={styles.filterBar}>
            <InputBase
              label="Combo"
              placeholder="Buscar por nome…"
              value={comboNameFilter}
              onChange={(e) => setComboNameFilter(e.target.value)}
            />
            <Button type="button" variant="secondary" onClick={clearComboFilters}>Limpar filtros</Button>
            <Button type="button" onClick={() => navigate("/catalog/combos/new")}>+ Novo combo</Button>
          </div>

          <Table
            variant="compact"
            rowKey={(c: Combo) => c.id}
            emptyMessage="Nenhum combo encontrado."
            columns={[
              { key: "name", header: "Combo", render: (c: Combo) => c.name },
              {
                key: "category", header: "Categoria",
                render: (c: Combo) => (
                  <span className={styles.muted}>
                    {c.category_id ? (categories.find((cat) => cat.id === c.category_id)?.name ?? "—") : "—"}
                  </span>
                ),
              },
              {
                key: "products", header: "Produtos",
                render: (c: Combo) => (
                  <span className={styles.muted}>{c.items.map((i) => i.name).join(", ")}</span>
                ),
              },
              {
                key: "price", header: "Preço",
                render: (c: Combo) => c.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
              },
              {
                key: "savings", header: "Economia",
                render: (c: Combo) => {
                  const sum = c.items.reduce((s, i) => s + i.price, 0);
                  const savings = sum - c.price;
                  return savings.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                },
              },
              {
                key: "status", header: "Status",
                render: (c: Combo) => <Tag variant={c.active ? "success" : "error"}>{c.active ? "Ativo" : "Inativo"}</Tag>,
              },
              {
                key: "action", header: "", render: (c: Combo) => (
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <Button size="small" variant="secondary" onClick={() => navigate(`/catalog/combos/${c.id}/edit`)}>Editar</Button>
                    {c.active ? (
                      <Button size="small" variant="secondary" onClick={() => deactivateCombo(c.id, c.name)}>Desativar</Button>
                    ) : (
                      <Button size="small" variant="secondary" onClick={() => activateCombo(c.id)}>Ativar</Button>
                    )}
                    <Button size="small" variant="secondary" style={DANGER_BTN_STYLE} onClick={() => deleteComboPermanently(c.id, c.name)}>
                      Excluir
                    </Button>
                  </div>
                ),
              },
            ]}
            rows={filteredCombos}
          />
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

      <ConfirmDialog
        open={!!suggestCombos}
        message="Este produto é componente de combo(s) que ficaram inativos. Reativar junto?"
        confirmLabel="Reativar selecionados"
        cancelLabel="Agora não"
        onConfirm={confirmSuggestedCombos}
        onCancel={() => setSuggestCombos(null)}
      >
        {suggestCombos?.combos.map((c) => (
          <Checkbox
            key={c.id}
            id={`suggest-combo-${c.id}`}
            label={c.name}
            checked={suggestCombos.selected.has(c.id)}
            onChange={(checked) =>
              setSuggestCombos((prev) => {
                if (!prev) return prev;
                const selected = new Set(prev.selected);
                if (checked) selected.add(c.id); else selected.delete(c.id);
                return { ...prev, selected };
              })
            }
          />
        ))}
      </ConfirmDialog>

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
