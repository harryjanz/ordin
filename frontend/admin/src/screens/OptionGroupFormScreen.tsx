import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  CurrencyInput,
  InputBase,
  Modal,
  NumberSpinInput,
  RadioButton,
  RadioGroup,
  Upload,
  makeToast,
  type UploadFile,
} from "design-system";
import api from "../api";
import Breadcrumb from "../components/Breadcrumb";
import Table from "../components/Table";
import { parseApiError } from "../lib/apiErrors";
import { useCatalogParams } from "../lib/catalogParams";
import { MAX_SELECTIONS_MAX, MAX_SELECTIONS_MIN, minMaxToRadios, radiosToMinMax, type OptionGroupRadios } from "../lib/optionGroupMapping";
import type { OptionGroup } from "../types";
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
}

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
  const [originalRows, setOriginalRows] = useState<{ id: number; label: string; price_delta: number; image_url: string | null }[]>([]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

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
        })));
        setOriginalRows(g.options.map((o) => ({ id: o.id, label: o.label, price_delta: o.price_delta, image_url: o.image_url })));
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

  function openNewOptionModal() {
    setEditingRowKey(null);
    setDraftLabel("");
    setDraftPrice(0);
    setDraftImageUrl(null);
    setDraftPendingFile(null);
    setDraftPendingPreviewUrl(null);
    setOptionModalOpen(true);
  }

  function openEditOptionModal(row: OptionRow) {
    setEditingRowKey(row.key);
    setDraftLabel(row.label);
    setDraftPrice(row.price_delta);
    setDraftImageUrl(row.thumbnail_url);
    setDraftPendingFile(row.pendingFile);
    setDraftPendingPreviewUrl(row.pendingPreviewUrl);
    setOptionModalOpen(true);
  }

  function closeOptionModal() {
    setOptionModalOpen(false);
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

  function saveOptionModal() {
    if (!draftLabel.trim()) return;
    if (editingRowKey === null) {
      const key = `new-${++newRowSeq}`;
      setRows((prev) => [...prev, {
        key, id: null, label: draftLabel.trim(), price_delta: draftPrice ?? 0,
        image_url: null, thumbnail_url: null, pendingFile: draftPendingFile, pendingPreviewUrl: draftPendingPreviewUrl,
      }]);
    } else {
      updateRow(editingRowKey, {
        label: draftLabel.trim(), price_delta: draftPrice ?? 0,
        pendingFile: draftPendingFile, pendingPreviewUrl: draftPendingPreviewUrl,
      });
    }
    setOptionModalOpen(false);
  }

  // Só entra em jogo na edição: se o conteúdo (não só a ordem) das opções
  // mudar, o replace completo do backend apaga a imagem de opções que não
  // mudaram de nada — aviso visual antes de salvar (ver QA Explorer).
  const contentChanged = editingGroupId !== null && (() => {
    if (rows.length !== originalRows.length) return true;
    const originalById = new Map(originalRows.map((r) => [r.id, r]));
    return rows.some((r) => {
      if (r.id === null) return true;
      const orig = originalById.get(r.id);
      if (!orig) return true;
      return orig.label !== r.label || orig.price_delta !== (r.price_delta ?? 0);
    });
  })();
  const hasImageAtRisk = contentChanged && originalRows.some((r) => r.image_url);

  const canSave = !saving && name.trim().length > 0 && rows.length > 0;
  const canSaveOption = draftLabel.trim().length > 0;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setFormError("");
    try {
      const { min_selections, max_selections } = advancedMinMax ?? radiosToMinMax(radios, rows.length, maxSelections);
      const optionsPayload = rows.map((r) => ({ label: r.label.trim(), price_delta: r.price_delta ?? 0 }));

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
          <Alert variant="warning" text="Salvar vai exigir reenviar as imagens das opções que não foram alteradas agora." fullWidth />
        )}

        <Table
          rowKey={(r: OptionRow) => r.key}
          emptyMessage="Nenhuma opção adicionada."
          onReorder={rows.length > 1 ? reorderRows : undefined}
          onRowClick={(r: OptionRow) => openEditOptionModal(r)}
          columns={[
            {
              key: "image", header: "", render: (r: OptionRow) => (
                (r.thumbnail_url ?? r.pendingPreviewUrl) ? (
                  <img src={r.thumbnail_url ?? r.pendingPreviewUrl!} alt={r.label} className={styles.rowThumb} />
                ) : (
                  <span className={styles.rowThumbPlaceholder} />
                )
              ),
            },
            { key: "label", header: "Opção", render: (r: OptionRow) => r.label },
            {
              key: "price", header: "Acréscimo",
              render: (r: OptionRow) => (r.price_delta ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
            },
            {
              key: "action", header: "", render: (r: OptionRow) => (
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
                  <Button size="small" variant="secondary" onClick={() => openEditOptionModal(r)}>Editar</Button>
                  <Button size="small" variant="secondary" style={{ color: "var(--error-base)" }} onClick={() => removeRow(r.key)}>Remover</Button>
                </div>
              ),
            },
          ]}
          rows={rows}
        />
      </div>

      <Modal
        open={optionModalOpen}
        width={520}
        onClose={closeOptionModal}
        onBackdropClick={closeOptionModal}
        onCloseButtonClick={closeOptionModal}
      >
        <div className={styles.modalForm}>
          <div className={styles.formTitle}>{editingRowKey === null ? "Nova opção" : "Editar opção"}</div>

          <InputBase label="Label" placeholder="ex: Coca-Cola" value={draftLabel} onChange={(e) => setDraftLabel(e.target.value)} autoFocus />
          <CurrencyInput label="Acréscimo de preço" value={draftPrice} onChange={(value: number) => setDraftPrice(value)} />

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
