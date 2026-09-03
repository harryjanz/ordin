import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  CurrencyInput,
  Dropdown,
  InputBase,
  Tag,
  Upload,
  UploadListFiles,
  type DropdownOptions,
  type UploadFile,
} from "design-system";
import api from "../api";
import Breadcrumb from "../components/Breadcrumb";
import { parseApiError } from "../lib/apiErrors";
import { useCatalogParams } from "../lib/catalogParams";
import type { Category, Combo, ComboItem, Product } from "../types";
import styles from "./ComboFormScreen.module.scss";

// ORD-153 — mesmo limite/formato já validado em ProductEditScreen.
const IMAGE_MAX_SIZE_MB = 2;
const IMAGE_TYPES = ["image/jpeg", "image/png"];

// ORD-112 — tela dedicada de criação/edição de combo, espelha
// OptionGroupFormScreen (H1, Breadcrumb, Voltar/Salvar). Diferente do padrão
// de vínculo N:N por checkbox multiseleção já usado em ProductEditScreen
// (lista integral pra marcar) — decisão validada com o usuário em
// 2026-09-01: busca por nome/categoria mostrando só resultados filtrados,
// nunca a lista inteira do catálogo, e os produtos já adicionados ficam
// numa lista separada, com remoção individual.
export default function ComboFormScreen() {
  const { id } = useParams<{ id: string }>();
  const editingComboId = id ? Number(id) : null;
  const navigate = useNavigate();
  const catalogParams = useCatalogParams();

  const [loading, setLoading] = useState(editingComboId !== null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<number | null>(null);
  const [comboCategoryId, setComboCategoryId] = useState<string>("");
  const [comboItems, setComboItems] = useState<ComboItem[]>([]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // ORD-153 — imagem do combo. Só disponível depois do combo já existir
  // (mesma restrição implícita de ProductEditScreen, que também só faz
  // upload num registro já criado) — em "novo combo" mostra um aviso pra
  // salvar antes, em vez de tentar mandar pra um id que ainda não existe.
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchName, setSearchName] = useState("");
  const [searchCategoryId, setSearchCategoryId] = useState("");

  useEffect(() => {
    api.get("/catalog/categories", catalogParams()).then((r) => {
      setCategories(r.data.categories ?? r.data);
    }).catch(() => {});
    api.get("/catalog/products", catalogParams()).then((r) => {
      setProducts(r.data.products ?? r.data);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (editingComboId === null) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        // Não existe GET /catalog/combos/{id} — só listagem, mesmo padrão
        // já usado em OptionGroupFormScreen pra grupo de opção.
        const r = await api.get("/catalog/combos", catalogParams({ include_inactive: true }));
        const combos: Combo[] = r.data.combos ?? r.data;
        const c = combos.find((x) => x.id === editingComboId);
        if (!c) { if (!cancelled) setLoadError("Combo não encontrado."); return; }
        if (cancelled) return;
        setName(c.name);
        setDescription(c.description ?? "");
        setPrice(c.price);
        setComboCategoryId(c.category_id !== null ? String(c.category_id) : "");
        setComboItems(c.items);
        setImageUrl(c.image_url);
        setThumbnailUrl(c.thumbnail_url);
      } catch {
        if (!cancelled) setLoadError("Erro ao carregar combo.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingComboId]);

  const categoryOptions: DropdownOptions[] = [
    { value: "", label: "Todas categorias" },
    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  // Categoria do PRÓPRIO combo (ex.: "Combos", "Destaque") — diferente do
  // filtro de categoria usado só pra restringir a busca de produtos
  // componentes acima. Opcional: combo sem categoria continua válido.
  const comboCategoryOptions: DropdownOptions[] = [
    { value: "", label: "Sem categoria" },
    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  const hasSearch = searchName.trim().length > 0 || searchCategoryId.length > 0;
  const searchResults = hasSearch
    ? products.filter((p) => {
        if (comboItems.some((ci) => ci.product_id === p.id)) return false;
        if (searchName.trim() && !p.name.toLowerCase().includes(searchName.trim().toLowerCase())) return false;
        if (searchCategoryId && p.category_id !== Number(searchCategoryId)) return false;
        return true;
      })
    : [];

  function addToCombo(p: Product) {
    setComboItems((prev) => [...prev, { product_id: p.id, name: p.name, price: p.price }]);
  }

  function removeFromCombo(productId: number) {
    setComboItems((prev) => prev.filter((i) => i.product_id !== productId));
  }

  async function handleImageFiles(files: UploadFile[]) {
    const picked = files[0];
    if (editingComboId === null || !picked) return;
    if (picked.status === "error-read") {
      setUploadFiles([picked]);
      return;
    }
    setUploadFiles([{ ...picked, status: "loading" }]);
    try {
      const formData = new FormData();
      formData.append("image", picked.file);
      const r = await api.post(`/catalog/combos/${editingComboId}/image`, formData, catalogParams());
      setImageUrl(r.data.image_url);
      setThumbnailUrl(r.data.thumbnail_url);
      setUploadFiles([]);
    } catch {
      setUploadFiles([{ ...picked, status: "error-send" }]);
    }
  }

  async function removeComboImage() {
    if (editingComboId === null) return;
    const r = await api.delete(`/catalog/combos/${editingComboId}/image`, catalogParams());
    setImageUrl(r.data.image_url);
    setThumbnailUrl(r.data.thumbnail_url);
  }

  const sumAvulso = comboItems.reduce((s, i) => s + i.price, 0);
  const savings = sumAvulso - (price ?? 0);
  const savingsPct = sumAvulso > 0 ? Math.round((savings / sumAvulso) * 100) : 0;
  const hasRealSavings = comboItems.length > 0 && price !== null && price > 0 && savings > 0;

  const canSave = !saving && name.trim().length > 0 && comboItems.length >= 2 && hasRealSavings;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setFormError("");
    try {
      const body = {
        category_id: comboCategoryId ? Number(comboCategoryId) : null,
        name: name.trim(),
        description: description.trim() || null,
        price,
        product_ids: comboItems.map((i) => i.product_id),
      };
      if (editingComboId === null) {
        await api.post("/catalog/combos", body, catalogParams());
      } else {
        await api.put(`/catalog/combos/${editingComboId}`, body, catalogParams());
      }
      navigate("/catalog?tab=combos");
    } catch (err) {
      setFormError(parseApiError(err).message || "Erro ao salvar combo.");
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
          { label: "Catálogo", href: "/catalog" },
          { label: "Combos", href: "/catalog?tab=combos" },
          { label: editingComboId === null ? "Novo combo" : "Editar combo" },
        ]}
      />
      <div className={styles.header}>
        <h1 className={styles.h1}>{editingComboId === null ? "Novo combo" : "Editar combo"}</h1>
        <div className={styles.headerActions}>
          <Button variant="secondary" onClick={() => navigate("/catalog?tab=combos")}>Voltar</Button>
          <Button onClick={save} disabled={!canSave} loading={saving}>Salvar combo</Button>
        </div>
      </div>

      {formError && <div className={styles.alertBox}><Alert variant="error" text={formError} fullWidth /></div>}

      <div className={styles.panel}>
        <div className={styles.formRow}>
          <div className={styles.formRowField}>
            <InputBase label="Nome do combo" placeholder="ex: Combo Clássico" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className={styles.formRowField}>
            <CurrencyInput label="Preço do combo" value={price} onChange={(value: number) => setPrice(value)} />
          </div>
          <div className={styles.formRowField}>
            <Dropdown
              label="Categoria"
              value={comboCategoryOptions.find((o) => o.value === comboCategoryId) ?? comboCategoryOptions[0]}
              onValueSelected={(opt) => setComboCategoryId(opt.value)}
              options={comboCategoryOptions}
            />
          </div>
        </div>
        <InputBase
          label="Descrição (opcional)"
          placeholder="ex: Cheeseburger Clássico, Batata Frita e Refrigerante Lata por um preço só"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className={styles.panel}>
        <h2 className={styles.h2}>Imagem</h2>
        {editingComboId === null ? (
          <div className={styles.searchEmpty}>Salve o combo primeiro para poder adicionar uma imagem.</div>
        ) : thumbnailUrl ? (
          <div className={styles.imagePreview}>
            <img
              src={thumbnailUrl}
              alt={name}
              className={styles.thumbnailImg}
              onClick={() => setPreviewImage({ url: imageUrl ?? thumbnailUrl, alt: name })}
            />
            <Button type="button" size="small" variant="secondary" onClick={removeComboImage}>
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

      <div className={styles.panel}>
        <div className={styles.formLabel}>Buscar produto pra adicionar</div>
        <div className={styles.searchRow}>
          <div className={styles.searchRowField}>
            <InputBase placeholder="Buscar por nome…" value={searchName} onChange={(e) => setSearchName(e.target.value)} />
          </div>
          <Dropdown
            label=""
            value={categoryOptions.find((o) => o.value === searchCategoryId) ?? categoryOptions[0]}
            onValueSelected={(opt) => setSearchCategoryId(opt.value)}
            options={categoryOptions}
          />
        </div>
        <div className={styles.searchResults}>
          {!hasSearch && (
            <div className={styles.searchEmpty}>Digite um nome ou escolha uma categoria pra buscar produtos do catálogo.</div>
          )}
          {hasSearch && searchResults.length === 0 && (
            <div className={styles.searchEmpty}>Nenhum produto encontrado (ou já está no combo).</div>
          )}
          {searchResults.map((p) => (
            <div key={p.id} className={styles.searchResultRow}>
              <div className={styles.searchResultInfo}>
                <span>{p.name}</span>
                <Tag variant="neutral">{categories.find((c) => c.id === p.category_id)?.name ?? "—"}</Tag>
                <span className={styles.muted}>{p.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
              </div>
              <Button size="small" variant="secondary" onClick={() => addToCombo(p)}>+ Adicionar</Button>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.formLabel}>
          {comboItems.length} produto{comboItems.length === 1 ? "" : "s"} no combo
        </div>
        <div className={styles.comboItemsBox}>
          {comboItems.length === 0 && (
            <div className={styles.searchEmpty}>Nenhum produto adicionado ainda — busque acima (mínimo 2).</div>
          )}
          {comboItems.map((i) => (
            <div key={i.product_id} className={styles.comboItemRow}>
              <div className={styles.searchResultInfo}>
                <span>{i.name}</span>
                <span className={styles.muted}>{i.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
              </div>
              <button type="button" className={styles.removeBtn} onClick={() => removeFromCombo(i.product_id)} title="Remover do combo">✕</button>
            </div>
          ))}
        </div>

        <div className={hasRealSavings ? styles.summaryBox : `${styles.summaryBox} ${styles.summaryBoxWarn}`}>
          <div className={styles.summaryRow}><span>Soma dos itens avulsos</span><span>{sumAvulso.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span></div>
          <div className={styles.summaryRow}><span>Preço do combo</span><span>{(price ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span></div>
          <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
            <span>Economia pro cliente</span>
            <span>
              {hasRealSavings
                ? `${savings.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (${savingsPct}%)`
                : `${savings.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (sem economia)`}
            </span>
          </div>
          <div className={styles.summaryNote}>
            {hasRealSavings
              ? "Calculado automaticamente a partir dos produtos selecionados."
              : "Preço do combo precisa ser menor que a soma dos itens avulsos — ajuste antes de salvar."}
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
