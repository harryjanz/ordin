import { useEffect, useMemo, useState } from "react";
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
  RadioButton,
  RadioGroup,
  Tag,
  TextArea,
  Upload,
  makeToast,
  type DropdownOptions,
  type UploadFile,
} from "design-system";
import api from "../api";
import Breadcrumb from "../components/Breadcrumb";
import ConfirmDialog from "../components/ConfirmDialog";
import StockHistoryChart from "../components/StockHistoryChart";
import Table from "../components/Table";
import { parseApiError } from "../lib/apiErrors";
import { useCatalogParams } from "../lib/catalogParams";
import { STOCK_UNIT_OPTIONS, stockUnitLabel } from "../lib/stockUnits";
import { isValidGtin } from "../lib/validators";
import { MAX_SELECTIONS_MAX, MAX_SELECTIONS_MIN, minMaxToRadios, radiosToMinMax, type OptionGroupRadios } from "../lib/optionGroupMapping";
import type { Allergen, OptionGroup, StockHistoryPoint, StockState } from "../types";
import styles from "./OptionGroupFormScreen.module.scss";

const IMAGE_MAX_SIZE_MB = 2;
const IMAGE_TYPES = ["image/jpeg", "image/png"];

// Uma linha da lista de opções em edição. `id` é null enquanto a opção
// ainda não existe no backend — nesse estado a imagem fica em memória
// (pendingFile) e só é enviada depois que a opção ganha id (ver Tech
// Explorer de ORD-139: criação com imagem pendente). Só os dados básicos
// aparecem na lista — o cadastro completo (com espaço pra crescer no
// futuro) acontece no modal, não inline (feedback do usuário, 2026-08-31).
interface OptionRow {
  key: string;
  id: number | null;
  label: string;
  price_delta: number | null;
  image_url: string | null;
  thumbnail_url: string | null;
  pendingFile: File | null;
  pendingPreviewUrl: string | null;
  active: boolean;
  // ORD-146 — mesmo nível de detalhe que Product já tem (ORD-075).
  // allergen_ids em string, mesmo padrão de CheckboxMultiselect já usado em
  // ProductEditScreen (initialSelection/onSelectOption trabalham com string).
  description: string | null;
  sku: string | null;
  // ORD-188 — opção que representa um produto real (ex.: cada sabor de um
  // refrigerante) ganha identidade fiscal própria, mesmos campos de Product.
  ean: string | null;
  cfop: string | null;
  cest: string | null;
  // ORD-190 (G3) — mesmos campos de Product (A3/A5), configuráveis mesmo
  // antes de existir stock_item pra esta opção.
  estoque_minimo: number;
  unidade_compra: string | null;
  fator_conversao: number | null;
  allergen_ids: string[];
}

// ORD-188 — mesmo conjunto fechado já usado em ProductEditScreen (ORD-169),
// duplicado aqui de propósito: não há consumidor comum hoje que justifique
// extrair um módulo compartilhado só por isso.
const CFOP_OPTIONS: DropdownOptions[] = [
  { value: "5101", label: "5101 — Venda de produção do próprio estabelecimento" },
  { value: "5102", label: "5102 — Venda de mercadoria adquirida de terceiros" },
];


let newRowSeq = 0;

// ORD-139 — tela dedicada de criação/edição de grupo de opção, espelha
// MenuFormScreen (H1, Breadcrumb, Voltar/Salvar). Consome os endpoints já
// prontos de ORD-138.
export default function OptionGroupFormScreen() {
  const { id } = useParams<{ id: string }>();
  const editingGroupId = id ? Number(id) : null;
  const navigate = useNavigate();
  const catalogParams = useCatalogParams();

  const [loading, setLoading] = useState(editingGroupId !== null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [radios, setRadios] = useState<OptionGroupRadios>({ requiredness: "required", selectionType: "single" });
  // Só usado quando radios.selectionType === "multiple" — máximo de opções
  // que podem ser escolhidas juntas (ex.: pizza G, até 3 sabores). null =
  // ainda não customizado pelo usuário, cai no default (todas as opções).
  const [maxSelections, setMaxSelections] = useState<number | null>(null);
  const [advancedMinMax, setAdvancedMinMax] = useState<{ min_selections: number; max_selections: number } | null>(null);
  const [rows, setRows] = useState<OptionRow[]>([]);
  const [originalRows, setOriginalRows] = useState<{
    id: number; label: string; price_delta: number; image_url: string | null;
    description: string | null; sku: string | null;
    ean: string | null; cfop: string | null; cest: string | null;
    estoque_minimo: number; unidade_compra: string | null; fator_conversao: number | null;
    allergen_ids: string[];
  }[]>([]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [allergens, setAllergens] = useState<Allergen[]>([]);

  useEffect(() => {
    api.get("/catalog/allergens", catalogParams()).then((r) => {
      setAllergens(r.data.allergens ?? r.data);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Achado do usuário (2026-09-18): checar unicidade só no Salvar do grupo é
  // tarde demais pra UX — a modal de opção precisa avisar na hora. Pré-carrega
  // uma vez (sem round-trip por tecla) os sku/ean já ativos na empresa fora
  // deste grupo (o grupo em si já é coberto pela checagem local contra
  // `rows`, logo abaixo) — GET /catalog/codes/active-in-use.
  const [activeCodesElsewhere, setActiveCodesElsewhere] = useState<{ skus: string[]; eans: string[] }>({ skus: [], eans: [] });

  useEffect(() => {
    api.get(
      "/catalog/codes/active-in-use",
      catalogParams(editingGroupId !== null ? { exclude_option_group_id: editingGroupId } : {}),
    ).then((r) => {
      setActiveCodesElsewhere({ skus: r.data.skus ?? [], eans: r.data.eans ?? [] });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingGroupId]);
  const activeEanSetElsewhere = useMemo(() => new Set(activeCodesElsewhere.eans), [activeCodesElsewhere]);
  const activeSkuSetElsewhere = useMemo(() => new Set(activeCodesElsewhere.skus), [activeCodesElsewhere]);

  useEffect(() => {
    if (editingGroupId === null) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        // Não existe GET /catalog/option-groups/{id} — só listagem, mesmo
        // padrão já usado em MenuFormScreen pra cardápio (ORD-136).
        const r = await api.get("/catalog/option-groups", catalogParams());
        const groups: OptionGroup[] = r.data.option_groups ?? r.data;
        const g = groups.find((x) => x.id === editingGroupId);
        if (!g) { if (!cancelled) setLoadError("Grupo de opção não encontrado."); return; }
        if (cancelled) return;
        setName(g.name);
        const mapped = minMaxToRadios(g.min_selections, g.max_selections);
        if (mapped) {
          setRadios(mapped);
          setAdvancedMinMax(null);
          setMaxSelections(mapped.selectionType === "multiple" ? g.max_selections : null);
        } else {
          setAdvancedMinMax({ min_selections: g.min_selections, max_selections: g.max_selections });
        }
        setRows(g.options.map((o) => ({
          key: `existing-${o.id}`, id: o.id, label: o.label, price_delta: o.price_delta,
          image_url: o.image_url, thumbnail_url: o.thumbnail_url, pendingFile: null, pendingPreviewUrl: null,
          active: o.active, description: o.description, sku: o.sku,
          ean: o.ean, cfop: o.cfop, cest: o.cest,
          estoque_minimo: o.estoque_minimo, unidade_compra: o.unidade_compra, fator_conversao: o.fator_conversao,
          allergen_ids: o.allergens.map((a) => String(a.id)),
        })));
        setOriginalRows(g.options.map((o) => ({
          id: o.id, label: o.label, price_delta: o.price_delta, image_url: o.image_url,
          description: o.description, sku: o.sku,
          ean: o.ean, cfop: o.cfop, cest: o.cest,
          estoque_minimo: o.estoque_minimo, unidade_compra: o.unidade_compra, fator_conversao: o.fator_conversao,
          allergen_ids: o.allergens.map((a) => String(a.id)),
        })));
      } catch {
        if (!cancelled) setLoadError("Erro ao carregar grupo de opção.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingGroupId]);

  // Revoga as URLs locais de preview ao desmontar — evita vazar memória
  // quando o usuário troca a imagem de uma opção nova várias vezes.
  useEffect(() => () => {
    rows.forEach((r) => { if (r.pendingPreviewUrl) URL.revokeObjectURL(r.pendingPreviewUrl); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateRow(key: string, patch: Partial<OptionRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function reorderRows(orderedKeys: (string | number)[]) {
    setRows((prev) => {
      const byKey = new Map(prev.map((r) => [r.key, r]));
      return orderedKeys.map((k) => byKey.get(String(k))!);
    });
  }

  function removeRow(key: string) {
    setRows((prev) => {
      const row = prev.find((r) => r.key === key);
      if (row?.pendingPreviewUrl) URL.revokeObjectURL(row.pendingPreviewUrl);
      return prev.filter((r) => r.key !== key);
    });
  }

  // ── Ativar/desativar opção (ORD-145) ─────────────────────────────────────
  // Opção já existente (tem id): PATCH cirúrgico na hora, sem esperar o
  // Salvar do grupo — mesmo padrão de imagem de opção e do override do
  // ORD-144. Opção nova (ainda não salva): só estado local, vai junto no
  // POST/PUT quando o grupo for salvo.
  // Correção pós-implementação (ORD-145): ativar também passou a pedir
  // confirmação, não só desativar — mesmo estado cobre os dois sentidos.
  const [toggleConfirm, setToggleConfirm] = useState<{ row: OptionRow; active: boolean } | null>(null);

  async function setRowActive(row: OptionRow, active: boolean) {
    if (row.id === null) {
      updateRow(row.key, { active });
      return;
    }
    try {
      const r = await api.patch(`/catalog/options/${row.id}`, { active }, catalogParams());
      updateRow(row.key, { active: r.data.active });
    } catch {
      makeToast("error", "Erro ao atualizar status da opção.");
    }
  }

  async function confirmToggle() {
    if (toggleConfirm) await setRowActive(toggleConfirm.row, toggleConfirm.active);
    setToggleConfirm(null);
  }

  // ── Modal de opção (adicionar/editar) ───────────────────────────────────
  // Cadastro completo de UMA opção fica no modal — a lista principal mostra
  // só o essencial (rótulo/preço/miniatura). Dá espaço de sobra pro upload
  // de imagem e pra campos futuros da opção, sem espremer tudo numa linha.
  const [optionModalOpen, setOptionModalOpen] = useState(false);
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null); // null = nova opção
  const [draftLabel, setDraftLabel] = useState("");
  const [draftPrice, setDraftPrice] = useState<number | null>(0);
  const [draftImageUrl, setDraftImageUrl] = useState<string | null>(null);
  const [draftPendingFile, setDraftPendingFile] = useState<File | null>(null);
  const [draftPendingPreviewUrl, setDraftPendingPreviewUrl] = useState<string | null>(null);
  const [draftUploading, setDraftUploading] = useState(false);
  const [draftDescription, setDraftDescription] = useState("");
  const [draftSku, setDraftSku] = useState("");
  const [draftEan, setDraftEan] = useState("");
  const [draftCfop, setDraftCfop] = useState<string | null>(null);
  const [draftCest, setDraftCest] = useState("");
  const [draftAllergenIds, setDraftAllergenIds] = useState<string[]>([]);
  // ORD-190 (G3) — mesmos campos de Product (A3/A5).
  const [draftEstoqueMinimo, setDraftEstoqueMinimo] = useState<number | null>(0);
  const [draftUnidadeCompra, setDraftUnidadeCompra] = useState("");
  const [draftFatorConversao, setDraftFatorConversao] = useState<number | null>(null);

  // ── Estoque (ORD-181, G2) — só existe pra opção já salva (tem id) ────────
  const [stock, setStock] = useState<StockState | null>(null);
  const [stockHistory, setStockHistory] = useState<StockHistoryPoint[]>([]);
  const [stockMovModalOpen, setStockMovModalOpen] = useState(false);
  const [movTipo, setMovTipo] = useState<"entrada" | "ajuste">("entrada");
  const [movUnidade, setMovUnidade] = useState<string | null>(null);
  const [movQuantidade, setMovQuantidade] = useState<number | null>(null);
  const [movMotivo, setMovMotivo] = useState("");
  const [movEmUnidadeCompra, setMovEmUnidadeCompra] = useState(false);
  const [movSaving, setMovSaving] = useState(false);
  const [movError, setMovError] = useState("");

  function openNewOptionModal() {
    setEditingRowKey(null);
    setDraftLabel("");
    setDraftPrice(0);
    setDraftImageUrl(null);
    setDraftPendingFile(null);
    setDraftPendingPreviewUrl(null);
    setDraftDescription("");
    setDraftSku("");
    setDraftEan("");
    setDraftCfop(null);
    setDraftCest("");
    setDraftAllergenIds([]);
    setDraftEstoqueMinimo(0);
    setDraftUnidadeCompra("");
    setDraftFatorConversao(null);
    setStock(null);  // opção nova ainda não tem id — sem estoque possível
    setStockHistory([]);
    setStockMovModalOpen(false);
    setOptionModalOpen(true);
  }

  async function openEditOptionModal(row: OptionRow) {
    setEditingRowKey(row.key);
    setDraftLabel(row.label);
    setDraftPrice(row.price_delta);
    setDraftImageUrl(row.thumbnail_url);
    setDraftPendingFile(row.pendingFile);
    setDraftPendingPreviewUrl(row.pendingPreviewUrl);
    setDraftDescription(row.description ?? "");
    setDraftSku(row.sku ?? "");
    setDraftEan(row.ean ?? "");
    setDraftCfop(row.cfop);
    setDraftCest(row.cest ?? "");
    setDraftAllergenIds(row.allergen_ids);
    setDraftEstoqueMinimo(row.estoque_minimo);
    setDraftUnidadeCompra(row.unidade_compra ?? "");
    setDraftFatorConversao(row.fator_conversao);
    setStock(null);
    setStockHistory([]);
    setStockMovModalOpen(false);
    setOptionModalOpen(true);
    if (row.id !== null) {
      try {
        const r = await api.get(`/catalog/options/${row.id}/stock`, catalogParams());
        setStock(r.data);
        const h = await api.get(`/catalog/options/${row.id}/stock/history`, catalogParams());
        setStockHistory(h.data.points ?? []);
      } catch {
        // silencioso — seção de estoque simplesmente não aparece, usuário pode reabrir o modal
      }
    }
  }

  function closeOptionModal() {
    setOptionModalOpen(false);
  }

  function openStockMovModal() {
    setMovTipo("entrada");
    setMovUnidade(stock?.unidade ?? null);
    setMovQuantidade(null);
    setMovMotivo("");
    setMovEmUnidadeCompra(false);
    setMovError("");
    setStockMovModalOpen(true);
  }

  function closeStockMovModal() {
    setStockMovModalOpen(false);
  }

  const canSaveStockMov =
    movQuantidade !== null &&
    (movTipo === "entrada" ? movQuantidade > 0 : movQuantidade !== 0) &&
    (stock?.has_stock_item || movUnidade !== null) &&
    (movTipo !== "ajuste" || movMotivo.trim().length > 0);

  async function saveStockMovement() {
    const optionId = rows.find((r) => r.key === editingRowKey)?.id;
    if (optionId == null || !canSaveStockMov) return;
    setMovSaving(true);
    setMovError("");
    try {
      await api.post(`/catalog/options/${optionId}/stock/movements`, {
        tipo: movTipo,
        quantidade: movQuantidade,
        unidade: stock?.has_stock_item ? undefined : movUnidade,
        motivo: movMotivo.trim() || null,
        em_unidade_compra: movEmUnidadeCompra,
      }, catalogParams());
      const r = await api.get(`/catalog/options/${optionId}/stock`, catalogParams());
      setStock(r.data);
      const h = await api.get(`/catalog/options/${optionId}/stock/history`, catalogParams());
      setStockHistory(h.data.points ?? []);
      setStockMovModalOpen(false);
    } catch (err) {
      setMovError(parseApiError(err).message || "Erro ao registrar movimentação.");
    } finally {
      setMovSaving(false);
    }
  }

  // Opção já existente (tem id): upload/remoção de imagem acontece na hora,
  // via os endpoints próprios de imagem — não precisa esperar o Salvar da
  // tela, igual à imagem de produto em ProductEditScreen. Atualiza a linha
  // e o rascunho do modal juntos, pra ficarem em sincronia.
  async function handleModalExistingImage(files: UploadFile[]) {
    const picked = files[0];
    if (!picked || editingRowKey === null) return;
    if (picked.status === "error-read") return;
    const row = rows.find((r) => r.key === editingRowKey);
    if (!row || row.id === null) return;
    setDraftUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", picked.file);
      const r = await api.post(`/catalog/options/${row.id}/image`, formData, catalogParams());
      updateRow(row.key, { image_url: r.data.image_url, thumbnail_url: r.data.thumbnail_url });
      setDraftImageUrl(r.data.thumbnail_url);
    } catch {
      makeToast("error", "Envie um arquivo JPG ou PNG de até 2 MB.");
    } finally {
      setDraftUploading(false);
    }
  }

  async function removeModalExistingImage() {
    if (editingRowKey === null) return;
    const row = rows.find((r) => r.key === editingRowKey);
    if (!row || row.id === null) return;
    try {
      const r = await api.delete(`/catalog/options/${row.id}/image`, catalogParams());
      updateRow(row.key, { image_url: r.data.image_url, thumbnail_url: r.data.thumbnail_url });
      setDraftImageUrl(r.data.thumbnail_url);
    } catch {
      makeToast("error", "Erro ao remover imagem.");
    }
  }

  // Opção nova (sem id ainda): a imagem fica só em memória até o Salvar da
  // tela inteira.
  function handleModalPendingImage(files: UploadFile[]) {
    const picked = files[0];
    if (!picked || picked.status === "error-read") return;
    if (draftPendingPreviewUrl) URL.revokeObjectURL(draftPendingPreviewUrl);
    setDraftPendingFile(picked.file);
    setDraftPendingPreviewUrl(URL.createObjectURL(picked.file));
  }

  function removeModalPendingImage() {
    if (draftPendingPreviewUrl) URL.revokeObjectURL(draftPendingPreviewUrl);
    setDraftPendingFile(null);
    setDraftPendingPreviewUrl(null);
  }

  // Achado do usuário testando em browser: nada impedia digitar o mesmo EAN
  // em duas opções do mesmo grupo — só o "Salvar" do grupo inteiro (chamada
  // ao backend) pegava isso, tarde demais e sem destaque nenhum no campo em
  // si. Checagem local aqui replica o alcance real do backend (unicidade
  // por EMPRESA, não só por grupo — mesmo padrão do sku, ver
  // _set_option_group_options): compara com as outras linhas do grupo (já
  // carregadas em `rows`, sem round-trip) e com `activeCodesElsewhere`
  // (produtos + opções de outros grupos, pré-carregado uma vez ao abrir a
  // tela — achado do usuário, 2026-09-18: só validar no Salvar é tarde
  // demais).
  const draftEanConflict = draftEan.trim() !== "" && (
    rows.some((r) => r.key !== editingRowKey && (r.ean ?? "").trim() === draftEan.trim())
    || activeEanSetElsewhere.has(draftEan.trim())
  );
  const draftSkuConflict = draftSku.trim() !== "" && (
    rows.some((r) => r.key !== editingRowKey && (r.sku ?? "").trim() === draftSku.trim())
    || activeSkuSetElsewhere.has(draftSku.trim())
  );
  // ORD-190 (G3) — mesma regra conjunta de Product (A3/A5): os dois campos
  // de conversão vêm juntos ou nenhum, sem herança do produto pai.
  const draftConversaoValid = (draftUnidadeCompra.trim() === "") === (draftFatorConversao === null);
  const draftEstoqueMinimoValid = draftEstoqueMinimo === null || draftEstoqueMinimo >= 0;
  const draftFatorConversaoValid = draftFatorConversao === null || draftFatorConversao > 0;

  function saveOptionModal() {
    if (!draftLabel.trim()) return;
    if (draftEan.trim() !== "" && (!isValidGtin(draftEan) || draftEanConflict)) return;
    if (draftSkuConflict) return;
    if (!draftConversaoValid || !draftEstoqueMinimoValid || !draftFatorConversaoValid) return;
    if (editingRowKey === null) {
      const key = `new-${++newRowSeq}`;
      setRows((prev) => [...prev, {
        key, id: null, label: draftLabel.trim(), price_delta: draftPrice ?? 0,
        image_url: null, thumbnail_url: null, pendingFile: draftPendingFile, pendingPreviewUrl: draftPendingPreviewUrl,
        active: true, description: draftDescription.trim() || null, sku: draftSku.trim() || null,
        ean: draftEan.trim() || null, cfop: draftCfop, cest: draftCest.trim() || null,
        estoque_minimo: draftEstoqueMinimo ?? 0,
        unidade_compra: draftUnidadeCompra.trim() || null, fator_conversao: draftFatorConversao,
        allergen_ids: draftAllergenIds,
      }]);
    } else {
      updateRow(editingRowKey, {
        label: draftLabel.trim(), price_delta: draftPrice ?? 0,
        pendingFile: draftPendingFile, pendingPreviewUrl: draftPendingPreviewUrl,
        description: draftDescription.trim() || null, sku: draftSku.trim() || null,
        ean: draftEan.trim() || null, cfop: draftCfop, cest: draftCest.trim() || null,
        estoque_minimo: draftEstoqueMinimo ?? 0,
        unidade_compra: draftUnidadeCompra.trim() || null, fator_conversao: draftFatorConversao,
        allergen_ids: draftAllergenIds,
      });
    }
    setOptionModalOpen(false);
  }

  // Só entra em jogo na edição: se o conteúdo (não só a ordem) das opções
  // mudar, o grupo precisa ir pelo endpoint de replace (.../options), não
  // pelo de reorder puro — ver save() abaixo.
  const contentChanged = editingGroupId !== null && (() => {
    if (rows.length !== originalRows.length) return true;
    const originalById = new Map(originalRows.map((r) => [r.id, r]));
    return rows.some((r) => {
      if (r.id === null) return true;
      const orig = originalById.get(r.id);
      if (!orig) return true;
      if (orig.label !== r.label || orig.price_delta !== (r.price_delta ?? 0)) return true;
      if ((orig.description ?? "") !== (r.description ?? "")) return true;
      if ((orig.sku ?? "") !== (r.sku ?? "")) return true;
      if ((orig.ean ?? "") !== (r.ean ?? "")) return true;
      if ((orig.cfop ?? "") !== (r.cfop ?? "")) return true;
      if ((orig.cest ?? "") !== (r.cest ?? "")) return true;
      if (orig.estoque_minimo !== r.estoque_minimo) return true;
      if ((orig.unidade_compra ?? "") !== (r.unidade_compra ?? "")) return true;
      if ((orig.fator_conversao ?? null) !== (r.fator_conversao ?? null)) return true;
      const origAllergens = [...orig.allergen_ids].sort().join(",");
      const rowAllergens = [...r.allergen_ids].sort().join(",");
      return origAllergens !== rowAllergens;
    });
  })();
  // Correção de bug: o backend agora atualiza opção existente no lugar
  // (preserva imagem) em vez de apagar+recriar tudo — imagem só é perdida
  // de verdade quando a opção que a tinha é removida da lista. O aviso
  // reflete só esse caso, não "qualquer edição" como antes.
  const hasImageAtRisk = editingGroupId !== null && originalRows.some(
    (orig) => orig.image_url && !rows.some((r) => r.id === orig.id)
  );

  const canSave = !saving && name.trim().length > 0 && rows.length > 0;
  const canSaveOption = draftLabel.trim().length > 0
    && (draftEan.trim() === "" || (isValidGtin(draftEan) && !draftEanConflict))
    && !draftSkuConflict
    && draftConversaoValid && draftEstoqueMinimoValid && draftFatorConversaoValid;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setFormError("");
    try {
      const { min_selections, max_selections } = advancedMinMax ?? radiosToMinMax(radios, rows.length, maxSelections);
      const optionsPayload = rows.map((r) => ({
        // correção de bug: manda o id da opção existente pra _set_option_group_options
        // atualizar no lugar (preserva imagem) em vez de apagar e recriar — null = opção nova.
        id: r.id,
        label: r.label.trim(), price_delta: r.price_delta ?? 0, active: r.active,
        description: r.description, sku: r.sku,
        ean: r.ean, cfop: r.cfop, cest: r.cest,
        estoque_minimo: r.estoque_minimo, unidade_compra: r.unidade_compra, fator_conversao: r.fator_conversao,
        allergen_ids: r.allergen_ids.map(Number),
      }));

      let groupId = editingGroupId;
      let savedOptions: { id: number }[] | null = null;

      if (groupId === null) {
        const r = await api.post("/catalog/option-groups", { name: name.trim(), min_selections, max_selections, options: optionsPayload }, catalogParams());
        groupId = r.data.id;
        savedOptions = r.data.options;
      } else {
        await api.put(`/catalog/option-groups/${groupId}`, { name: name.trim(), min_selections, max_selections }, catalogParams());
        if (contentChanged) {
          const r = await api.put(`/catalog/option-groups/${groupId}/options`, { options: optionsPayload }, catalogParams());
          savedOptions = r.data.options;
        } else {
          const originalOrder = originalRows.map((r) => r.id);
          const currentOrder = rows.map((r) => r.id!);
          const orderChanged = currentOrder.some((rid, i) => rid !== originalOrder[i]);
          if (orderChanged) {
            await api.put(`/catalog/option-groups/${groupId}/options/reorder`, { option_ids: currentOrder }, catalogParams());
          }
        }
      }

      // Envia as imagens pendentes (opções novas, ou recriadas pelo replace
      // completo) agora que todas já têm id definitivo.
      if (savedOptions) {
        const uploads = rows.map(async (row, i) => {
          if (!row.pendingFile) return;
          const newId = savedOptions![i].id;
          try {
            const formData = new FormData();
            formData.append("image", row.pendingFile);
            await api.post(`/catalog/options/${newId}/image`, formData, catalogParams());
          } catch {
            makeToast("error", `Grupo salvo, mas a imagem da opção "${row.label}" não foi enviada. Edite o grupo para tentar novamente.`);
          }
        });
        await Promise.all(uploads);
      }

      navigate("/catalog?tab=options");
    } catch (err) {
      setFormError(parseApiError(err).message || "Erro ao salvar grupo de opção.");
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

  const modalPreviewUrl = draftImageUrl ?? draftPendingPreviewUrl;

  return (
    <div className={styles.page}>
      <Breadcrumb
        items={[
          { label: "Catálogo", href: "/catalog" },
          { label: "Opções", href: "/catalog?tab=options" },
          { label: editingGroupId === null ? "Novo grupo" : "Editar grupo" },
        ]}
      />
      <div className={styles.header}>
        <h1 className={styles.h1}>{editingGroupId === null ? "Novo grupo" : "Editar grupo"}</h1>
        <div className={styles.headerActions}>
          <Button variant="secondary" onClick={() => navigate("/catalog?tab=options")}>Voltar</Button>
          <Button onClick={save} disabled={!canSave} loading={saving}>Salvar</Button>
        </div>
      </div>

      {formError && <div className={styles.alertBox}><Alert variant="error" text={formError} fullWidth /></div>}

      <div className={styles.panel}>
        <InputBase label="Nome do grupo" placeholder="ex: Sabores de refrigerante" value={name} onChange={(e) => setName(e.target.value)} autoFocus />

        {advancedMinMax ? (
          <div className={styles.formHint}>
            Este grupo usa uma configuração de seleção (mín. {advancedMinMax.min_selections}, máx. {advancedMinMax.max_selections}) que não é representável pelos campos abaixo — provavelmente criada via API. Edite nome e opções normalmente; a regra de seleção permanece inalterada.
          </div>
        ) : (
          <div className={styles.formRow}>
            <div className={styles.formRowField}>
              <div className={styles.formLabel}>Obrigatoriedade</div>
              <RadioGroup name="requiredness" value={radios.requiredness} onChange={(v) => setRadios((prev) => ({ ...prev, requiredness: v as OptionGroupRadios["requiredness"] }))}>
                <RadioButton id="requiredness-required" value="required" label="Obrigatório" />
                <RadioButton id="requiredness-optional" value="optional" label="Opcional" />
              </RadioGroup>
            </div>
            <div className={styles.formRowField}>
              <div className={styles.formLabel}>Seleção</div>
              <RadioGroup name="selectionType" value={radios.selectionType} onChange={(v) => setRadios((prev) => ({ ...prev, selectionType: v as OptionGroupRadios["selectionType"] }))}>
                <RadioButton id="selectionType-single" value="single" label="Única" />
                <RadioButton id="selectionType-multiple" value="multiple" label="Múltipla" />
              </RadioGroup>
            </div>

            {radios.selectionType === "multiple" && (
              <div className={styles.formRowField}>
                <div className={styles.formLabel}>Máximo de opções selecionáveis</div>
                <NumberSpinInput
                  typeable
                  step={1}
                  minValue={MAX_SELECTIONS_MIN}
                  maxValue={MAX_SELECTIONS_MAX}
                  helperMessage="ex.: pizza G, até 3 sabores — pode ajustar antes de terminar de cadastrar as opções"
                  value={maxSelections ?? Math.max(rows.length, MAX_SELECTIONS_MIN)}
                  onChange={(value?: number) => setMaxSelections(value ?? null)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className={styles.panel}>
        <div className={styles.optionsHeader}>
          <div className={styles.formLabel}>Opções</div>
          <Button type="button" size="small" onClick={openNewOptionModal}>+ Adicionar opção</Button>
        </div>

        {hasImageAtRisk && (
          <Alert variant="warning" text="Salvar vai remover permanentemente a imagem de opção(ões) excluída(s) da lista." fullWidth />
        )}

        <div className={styles.tableScroll}>
        <Table
          rowKey={(r: OptionRow) => r.key}
          emptyMessage="Nenhuma opção adicionada."
          onReorder={rows.length > 1 ? reorderRows : undefined}
          onRowClick={(r: OptionRow) => openEditOptionModal(r)}
          columns={[
            {
              key: "label", header: "Opção", render: (r: OptionRow) => (
                <div className={styles.optionLabelCell}>
                  {(r.thumbnail_url ?? r.pendingPreviewUrl) ? (
                    <img src={r.thumbnail_url ?? r.pendingPreviewUrl!} alt={r.label} className={styles.rowThumb} />
                  ) : (
                    <span className={styles.rowThumbPlaceholder} />
                  )}
                  <span className={styles.optionLabel}>{r.label}</span>
                </div>
              ),
            },
            {
              key: "price", header: "Acréscimo",
              render: (r: OptionRow) => (r.price_delta ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
            },
            {
              key: "status", header: "Status",
              render: (r: OptionRow) => <Tag variant={r.active ? "success" : "error"}>{r.active ? "Ativo" : "Inativo"}</Tag>,
            },
            {
              key: "action", header: "", render: (r: OptionRow) => (
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
                  <Button size="small" variant="secondary" onClick={() => openEditOptionModal(r)}>Editar</Button>
                  {r.active ? (
                    <Button size="small" variant="secondary" onClick={() => setToggleConfirm({ row: r, active: false })}>Desativar</Button>
                  ) : (
                    <Button size="small" variant="secondary" onClick={() => setToggleConfirm({ row: r, active: true })}>Ativar</Button>
                  )}
                  <Button size="small" variant="secondary" style={{ color: "var(--error-base)" }} onClick={() => removeRow(r.key)}>Remover</Button>
                </div>
              ),
            },
          ]}
          rows={rows}
        />
        </div>
      </div>

      <ConfirmDialog
        open={toggleConfirm !== null}
        title={toggleConfirm?.active ? "Ativar opção" : "Desativar opção"}
        message={
          toggleConfirm
            ? (toggleConfirm.active
              ? `Ativar "${toggleConfirm.row.label}"? Ela volta a aparecer como selecionável no produto.`
              : `Desativar "${toggleConfirm.row.label}"? Ela para de aparecer como selecionável, mas continua cadastrada e pode ser reativada a qualquer momento.`)
            : ""
        }
        confirmLabel={toggleConfirm?.active ? "Ativar" : "Desativar"}
        onConfirm={confirmToggle}
        onCancel={() => setToggleConfirm(null)}
      />

      <Modal
        open={optionModalOpen}
        width={960}
        onClose={closeOptionModal}
        onBackdropClick={closeOptionModal}
        onCloseButtonClick={closeOptionModal}
      >
        <div className={styles.modalForm}>
          <div className={styles.formTitle}>{editingRowKey === null ? "Nova opção" : "Editar opção"}</div>

          <div className={styles.modalSectionRow}>
            <div className={styles.modalSectionMain}>
              <div className={styles.formRow}>
                <div className={styles.formRowField}>
                  <InputBase label="Label" placeholder="ex: Coca-Cola" value={draftLabel} onChange={(e) => setDraftLabel(e.target.value)} autoFocus />
                </div>
                <div className={styles.formRowField}>
                  <CurrencyInput label="Acréscimo de preço" value={draftPrice} onChange={(value: number) => setDraftPrice(value)} />
                </div>
              </div>

              <TextArea
                label="Descrição"
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                maxLength={500}
                helperMessage="Opcional — ajuda a diferenciar opções com nome pouco óbvio"
              />
              {/* ORD-188 — opção que representa um produto real (ex.: cada sabor de
                  um refrigerante) ganha identidade fiscal própria, mesma posição
                  relativa que Product já usa (logo após SKU). Ajuste de layout
                  (feedback do usuário testando em browser): SKU/CEST divididos
                  50/50 na mesma linha; EAN e CFOP em linhas próprias, largura
                  cheia — os dois eram os campos mais apertados no layout
                  anterior (2 campos numa linha só dentro da coluna principal). */}
              <div className={styles.formRow}>
                <div className={styles.formRowField}>
                  <InputBase
                    label="SKU"
                    value={draftSku}
                    placeholder="Opcional, único por empresa"
                    errorMessage={draftSkuConflict ? "SKU já em uso por outro produto ou opção ativo" : undefined}
                    onChange={(e) => setDraftSku(e.target.value)}
                  />
                </div>
                <div className={styles.formRowField}>
                  <InputBase
                    label="CEST"
                    value={draftCest}
                    placeholder="Opcional"
                    onChange={(e) => setDraftCest(e.target.value)}
                  />
                </div>
              </div>
              <InputBase
                label="EAN / código de barras"
                value={draftEan}
                placeholder="Opcional"
                errorMessage={
                  draftEan.trim() && !isValidGtin(draftEan)
                    ? "código de barras inválido"
                    : draftEanConflict
                    ? "código de barras já em uso por outro produto ou opção ativo"
                    : undefined
                }
                onChange={(e) => setDraftEan(e.target.value)}
              />
              <Dropdown
                label="CFOP"
                value={CFOP_OPTIONS.find((o) => o.value === draftCfop) ?? null}
                onValueSelected={(opt) => setDraftCfop(opt.value)}
                options={CFOP_OPTIONS}
              />

              {/* ORD-181 (G2) — só existe pra opção já salva (precisa de id).
                  Mesma posição relativa que ProductEditScreen usa: logo após
                  a classificação fiscal. Formulário de movimentação é INLINE
                  aqui dentro (não um segundo Modal empilhado) — feedback do
                  usuário: um modal de estoque por cima do modal de opção
                  renderizava atrás dele (briga de z-index) e incomodava
                  independente do bug em si. */}
              {editingRowKey !== null && (
                <>
                  <Divider />
                  <div className={styles.optionsHeader}>
                    <div className={styles.formLabel}>Estoque</div>
                    {!stockMovModalOpen && (
                      <Button type="button" size="small" variant="secondary" onClick={openStockMovModal}>
                        {stock?.has_stock_item ? "Registrar movimentação" : "Registrar entrada"}
                      </Button>
                    )}
                  </div>

                  {/* ORD-190 (G3) — mesmos campos de Product (A3/A5), configuráveis
                      mesmo antes de existir stock_item pra esta opção; nunca
                      herdados do produto pai (cada dono configura os próprios). */}
                  <div className={styles.formRow}>
                    <div className={styles.formRowField}>
                      <NumberInput
                        label="Estoque mínimo"
                        value={draftEstoqueMinimo ?? undefined}
                        onChange={(value: number) => setDraftEstoqueMinimo(value)}
                        decimalScale={3}
                        errorMessage={!draftEstoqueMinimoValid ? "não pode ser negativo" : undefined}
                      />
                    </div>
                    <div className={styles.formRowField}>
                      <InputBase
                        label="Unidade de compra"
                        placeholder="ex.: caixa, fardo — opcional"
                        value={draftUnidadeCompra}
                        errorMessage={!draftConversaoValid ? "preencha os dois campos de conversão, ou nenhum" : undefined}
                        onChange={(e) => setDraftUnidadeCompra(e.target.value)}
                      />
                    </div>
                    <div className={styles.formRowField}>
                      <NumberInput
                        label="Fator de conversão"
                        placeholder="ex.: 12 (1 caixa = 12 un)"
                        value={draftFatorConversao ?? undefined}
                        onChange={(value: number) => setDraftFatorConversao(value)}
                        decimalScale={3}
                        errorMessage={!draftFatorConversaoValid ? "deve ser positivo" : undefined}
                      />
                    </div>
                  </div>

                  {stockMovModalOpen ? (
                    <div className={styles.modalForm}>
                      <div className={styles.formRow}>
                        <div className={styles.formRowField}>
                          <Dropdown
                            label="Tipo"
                            value={[{ value: "entrada", label: "Entrada" }, { value: "ajuste", label: "Ajuste" }].find((o) => o.value === movTipo) ?? null}
                            onValueSelected={(opt) => setMovTipo(opt.value as "entrada" | "ajuste")}
                            options={[{ value: "entrada", label: "Entrada" }, { value: "ajuste", label: "Ajuste" }]}
                          />
                        </div>
                        {!stock?.has_stock_item && (
                          <div className={styles.formRowField}>
                            <Dropdown
                              label="Unidade"
                              value={STOCK_UNIT_OPTIONS.find((o) => o.value === movUnidade) ?? null}
                              onValueSelected={(opt) => setMovUnidade(opt.value)}
                              options={STOCK_UNIT_OPTIONS}
                            />
                          </div>
                        )}
                      </div>
                      <NumberInput
                        label={movEmUnidadeCompra && stock?.unidade_compra ? `Quantidade (em ${stock.unidade_compra})` : "Quantidade"}
                        value={movQuantidade ?? undefined}
                        onChange={(value: number) => setMovQuantidade(value)}
                        decimalScale={3}
                        allowNegative={movTipo === "ajuste"}
                      />
                      {/* ORD-190 (G3) — só aparece se a opção JÁ SALVA (stock,
                          não o rascunho da modal) tem conversão configurada;
                          registrar na unidade de compra converte pela
                          fator_conversao antes de aplicar ao saldo. */}
                      {stock?.unidade_compra && (
                        <Checkbox
                          id="opt-mov-em-unidade-compra"
                          label={`Registrar em ${stock.unidade_compra} (converte automaticamente)`}
                          checked={movEmUnidadeCompra}
                          onChange={(checked) => setMovEmUnidadeCompra(checked)}
                        />
                      )}
                      <InputBase
                        label="Motivo"
                        placeholder={movTipo === "ajuste" ? "Obrigatório" : "Opcional"}
                        value={movMotivo}
                        onChange={(e) => setMovMotivo(e.target.value)}
                      />
                      {movError && <Alert variant="error" text={movError} fullWidth />}
                      <div className={styles.formActions}>
                        <Button type="button" onClick={saveStockMovement} disabled={!canSaveStockMov || movSaving}>
                          {movSaving ? "Salvando…" : "Salvar"}
                        </Button>
                        <Button type="button" variant="secondary" onClick={closeStockMovModal}>Cancelar</Button>
                      </div>
                    </div>
                  ) : !stock?.has_stock_item ? (
                    <div className={styles.formHint}>Sem controle de estoque ainda.</div>
                  ) : (
                    <>
                      <p className={styles.formHint}>
                        <strong>{stock.quantidade_atual} {stockUnitLabel(stock.unidade)}</strong> em estoque
                        {stock.abaixo_do_minimo && (
                          <> <Tag variant="error">Abaixo do mínimo ({stock.estoque_minimo} {stockUnitLabel(stock.unidade)})</Tag></>
                        )}
                      </p>
                      <div className={styles.tableScroll}>
                        <Table
                          columns={[
                            { key: "criado_em", header: "Data", render: (m) => new Date(m.criado_em).toLocaleString("pt-BR") },
                            { key: "tipo", header: "Tipo", render: (m) => ({ entrada: "Entrada", ajuste: "Ajuste", saida: "Saída (venda)" })[m.tipo] },
                            {
                              key: "quantidade", header: "Quantidade",
                              render: (m) => {
                                const base = `${m.quantidade > 0 ? "+" : ""}${m.quantidade} ${stockUnitLabel(stock.unidade)}`;
                                // ORD-190 (G3) — registrada na unidade de compra: mostra o valor
                                // bruto digitado junto do já convertido, não só o convertido.
                                return m.quantidade_original !== null
                                  ? `${base} (${m.quantidade_original > 0 ? "+" : ""}${m.quantidade_original} ${m.unidade_original})`
                                  : base;
                              },
                            },
                            { key: "motivo", header: "Motivo", render: (m) => m.motivo ?? "—" },
                            { key: "criado_por", header: "Registrado por", render: (m) => (m.criado_por != null ? `Usuário #${m.criado_por}` : "Sistema (venda)") },
                          ]}
                          rows={stock.movements}
                          rowKey={(m) => m.id}
                          emptyMessage="Nenhuma movimentação ainda."
                        />
                      </div>
                      {stock.total_movements > stock.movements.length && (
                        <p className={styles.formHint}>
                          Mostrando as {stock.movements.length} movimentações mais recentes de {stock.total_movements} no total.
                        </p>
                      )}
                      {/* ORD-191 (A9) — abaixo da tabela de histórico: a tabela é a
                          fonte de detalhe por evento, o gráfico é a leitura de tendência. */}
                      <StockHistoryChart points={stockHistory} unidade={stock.unidade} />
                    </>
                  )}
                </>
              )}
            </div>

            <div className={styles.modalSectionSide}>
              <div className={styles.imageSection}>
                <div className={styles.formLabel}>Imagem</div>
                {modalPreviewUrl ? (
                  <div className={styles.imagePreview}>
                    <img src={modalPreviewUrl} alt={draftLabel || "Opção"} className={styles.thumbnailImg} />
                    <Button
                      type="button"
                      size="small"
                      variant="secondary"
                      loading={draftUploading}
                      onClick={() => {
                        const row = editingRowKey ? rows.find((r) => r.key === editingRowKey) : null;
                        if (row?.id !== null && row?.id !== undefined) removeModalExistingImage();
                        else removeModalPendingImage();
                      }}
                    >
                      Remover imagem
                    </Button>
                  </div>
                ) : (
                  <Upload
                    fullWidth
                    maxFileSize={IMAGE_MAX_SIZE_MB}
                    multipleFiles={false}
                    types={IMAGE_TYPES}
                    showMaxFileSize={false}
                    helperMessage="JPG ou PNG, até 2 MB"
                    errorMessage="Envie um arquivo JPG ou PNG de até 2 MB"
                    onCallbackUpload={(files) => {
                      const row = editingRowKey ? rows.find((r) => r.key === editingRowKey) : null;
                      if (row?.id !== null && row?.id !== undefined) handleModalExistingImage(files);
                      else handleModalPendingImage(files);
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          <Divider />

          <CheckboxMultiselect
            key={editingRowKey ?? "new"}
            id={`option-modal-${editingRowKey ?? "new"}-allergens`}
            label="Alérgenos (RDC 727/2022)"
            options={allergens.map((a) => ({ value: String(a.id), label: a.name, disabled: false }))}
            initialSelection={draftAllergenIds}
            onSelectOption={(option, checked) => {
              setDraftAllergenIds((prev) => (checked ? [...prev, option.value] : prev.filter((id) => id !== option.value)));
            }}
          />

          <div className={styles.formActions}>
            <Button type="button" onClick={saveOptionModal} disabled={!canSaveOption}>
              {editingRowKey === null ? "Adicionar" : "Salvar"}
            </Button>
            <Button type="button" variant="secondary" onClick={closeOptionModal}>Cancelar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
