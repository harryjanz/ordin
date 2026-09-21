import { useEffect, useState } from "react";
import { Alert, Button, Tag, Upload, UploadListFiles, makeToast, type UploadFile } from "design-system";
import api from "../api";
import ConfirmDialog from "../components/ConfirmDialog";
import Table, { type TableColumn } from "../components/Table";
import { parseApiError } from "../lib/apiErrors";
import { useCatalogParams } from "../lib/catalogParams";
import type { SupplierInvoiceDetail, SupplierInvoiceListItem, SupplierInvoicePreview, SupplierInvoicePreviewItem } from "../types";
import styles from "./SupplierInvoiceScreen.module.scss";

const XML_TYPES = ["text/xml", "application/xml"];
const XML_MAX_SIZE_MB = 5; // XMLs de NF-e reais são pequenos (5-70 KB), 5 MB já é folga generosa

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtQty = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

const itemColumns: TableColumn<SupplierInvoicePreviewItem>[] = [
  { key: "c_prod", header: "Código", mono: true, render: (i) => i.c_prod ?? "—" },
  { key: "c_ean", header: "EAN", mono: true, render: (i) => i.c_ean ?? "—" },
  { key: "x_prod", header: "Descrição", render: (i) => i.x_prod },
  { key: "unidade", header: "Unidade", render: (i) => i.unidade ?? "—" },
  { key: "quantidade", header: "Quantidade", mono: true, render: (i) => fmtQty(i.quantidade) },
  { key: "valor_unitario", header: "Valor unit.", mono: true, render: (i) => fmtBRL(i.valor_unitario) },
  { key: "valor_total", header: "Valor total", mono: true, render: (i) => fmtBRL(i.valor_total) },
];

type View = "list" | "upload" | "detail";

// ORD-194 (B1) — upload de XML de NF de compra com prévia + histórico das
// notas já importadas (listagem/detalhe/exclusão). O Explorer original já
// prometia "aparece na listagem de notas importadas" no Fluxo Principal, mas
// isso nunca virou critério de aceite nem endpoint — gap fechado depois de
// teste manual do usuário, ver docs/stories/ORD-194 e docs/WORKFLOW.md
// (gate de rastreabilidade adicionado por causa deste achado).
//
// Detalhe da nota é página inteira, não Modal — achado ao vivo: com 7
// colunas a tabela de itens fica apertada demais dentro de um Modal
// (mesmo largo), a prévia de importação (que já era página inteira) nunca
// teve esse problema.
export default function SupplierInvoiceScreen() {
  const catalogParams = useCatalogParams();

  const [view, setView] = useState<View>("list");

  const [invoices, setInvoices] = useState<SupplierInvoiceListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<SupplierInvoicePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const [detailTarget, setDetailTarget] = useState<SupplierInvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<SupplierInvoiceListItem | null>(null);

  async function loadInvoices() {
    setListLoading(true);
    setListError(null);
    try {
      const r = await api.get<{ invoices: SupplierInvoiceListItem[] }>("/catalog/supplier-invoices", catalogParams());
      setInvoices(r.data.invoices ?? []);
    } catch (err) {
      setListError(parseApiError(err).message);
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function backToList() {
    setUploadFiles([]);
    setPickedFile(null);
    setPreview(null);
    setPreviewError(null);
    setConfirmError(null);
    setDetailTarget(null);
    setView("list");
  }

  function openUpload() {
    setView("upload");
  }

  async function handleFileSelected(files: UploadFile[]) {
    const picked = files[0];
    if (!picked) return;
    if (picked.status === "error-read") {
      setUploadFiles([picked]);
      return;
    }
    setUploadFiles([{ ...picked, status: "loading" }]);
    setPickedFile(picked.file);
    setPreview(null);
    setPreviewError(null);
    setConfirmError(null);
    setPreviewLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", picked.file);
      const r = await api.post<SupplierInvoicePreview>(
        "/catalog/supplier-invoices/preview", formData, catalogParams(),
      );
      setPreview(r.data);
      setUploadFiles([{ ...picked, status: "success" }]);
    } catch (err) {
      setPreviewError(parseApiError(err).message || "Erro ao ler o XML.");
      setUploadFiles([{ ...picked, status: "error-send" }]);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function confirmImport() {
    if (!pickedFile) return;
    setConfirmSaving(true);
    setConfirmError("");
    try {
      const formData = new FormData();
      formData.append("file", pickedFile);
      await api.post("/catalog/supplier-invoices", formData, catalogParams());
      makeToast("success", "Nota importada com sucesso");
      backToList();
      loadInvoices();
    } catch (err) {
      setConfirmError(parseApiError(err).message || "Erro ao confirmar a importação.");
    } finally {
      setConfirmSaving(false);
    }
  }

  async function openDetail(inv: SupplierInvoiceListItem) {
    setDetailLoading(true);
    setView("detail");
    try {
      const r = await api.get<SupplierInvoiceDetail>(`/catalog/supplier-invoices/${inv.id}`, catalogParams());
      setDetailTarget(r.data);
    } catch (err) {
      makeToast("error", parseApiError(err).message || "Erro ao carregar a nota.");
      setView("list");
    } finally {
      setDetailLoading(false);
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    try {
      await api.delete(`/catalog/supplier-invoices/${removeTarget.id}`, catalogParams());
      makeToast("success", "Nota excluída");
      setRemoveTarget(null);
      loadInvoices();
    } catch (err) {
      makeToast("error", parseApiError(err).message);
    }
  }

  const listColumns: TableColumn<SupplierInvoiceListItem>[] = [
    { key: "fornecedor_nome", header: "Fornecedor", render: (i) => i.fornecedor_nome },
    {
      key: "numero", header: "Número/série", mono: true,
      render: (i) => (i.numero ? `${i.numero}${i.serie ? ` / ${i.serie}` : ""}` : "—"),
    },
    { key: "data_emissao", header: "Emissão", mono: true, render: (i) => fmtDate(i.data_emissao) },
    { key: "valor_total", header: "Valor total", mono: true, render: (i) => fmtBRL(i.valor_total) },
    { key: "imported_at", header: "Importado em", mono: true, render: (i) => fmtDate(i.imported_at) },
    {
      key: "action", header: "", render: (i) => (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          <Button size="small" variant="secondary" onClick={(e) => { e.stopPropagation(); openDetail(i); }}>
            Ver itens
          </Button>
          <Button size="small" variant="secondary" style={{ color: "var(--error-base)" }} onClick={(e) => { e.stopPropagation(); setRemoveTarget(i); }}>
            Excluir
          </Button>
        </div>
      ),
    },
  ];

  if (view === "detail") {
    return (
      <>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <Button variant="secondary" onClick={backToList}>Voltar</Button>
        </div>

        {detailLoading && <Alert variant="info" text="Carregando…" fullWidth />}

        {detailTarget && (
          <>
            <div className={styles.previewHeader}>
              <strong>{detailTarget.fornecedor_nome}</strong>
              <span>CNPJ: {detailTarget.fornecedor_cnpj}</span>
              {detailTarget.numero && (
                <span>Nota nº {detailTarget.numero}{detailTarget.serie ? ` / série ${detailTarget.serie}` : ""}</span>
              )}
              <span>Importado em {fmtDate(detailTarget.imported_at)}</span>
            </div>

            <div className={styles.itemsScroll}>
              <Table
                variant="compact"
                columns={itemColumns}
                rows={detailTarget.itens}
                rowKey={(i) => i.n_item}
                emptyMessage="Nenhum item nesta nota."
              />
            </div>

            <div className={styles.previewTotal}>Total: {fmtBRL(detailTarget.valor_total)}</div>
          </>
        )}
      </>
    );
  }

  if (view === "upload") {
    return (
      <>
        {!preview && (
          <>
            <Upload
              fullWidth
              maxFileSize={XML_MAX_SIZE_MB}
              multipleFiles={false}
              types={XML_TYPES}
              showMaxFileSize={false}
              helperMessage="XML da NF-e de compra recebida do fornecedor"
              errorMessage="Envie um arquivo XML válido de até 5 MB"
              onCallbackUpload={handleFileSelected}
            />
            <UploadListFiles items={uploadFiles} removable={false} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <Button variant="secondary" onClick={backToList}>Voltar</Button>
            </div>
          </>
        )}

        {previewLoading && <Alert variant="info" text="Lendo o XML…" fullWidth />}
        {previewError && <Alert variant="error" text={previewError} fullWidth />}

        {preview && (
          <>
            <div className={styles.previewHeader}>
              <strong>{preview.fornecedor.nome}</strong>
              <span>
                CNPJ: {preview.fornecedor.cnpj}{" "}
                {preview.fornecedor.sera_criado ? (
                  <Tag variant="warning">Novo fornecedor — será criado</Tag>
                ) : (
                  <Tag variant="success">Fornecedor já cadastrado</Tag>
                )}
              </span>
              {preview.numero && <span>Nota nº {preview.numero}{preview.serie ? ` / série ${preview.serie}` : ""}</span>}
              {preview.already_imported && (
                <Alert variant="error" text="Esta nota já foi importada anteriormente (mesma chave de acesso)." fullWidth />
              )}
            </div>

            <div className={styles.itemsScroll}>
              <Table
                variant="compact"
                columns={itemColumns}
                rows={preview.itens}
                rowKey={(i) => i.n_item}
                emptyMessage="Nenhum item nesta nota."
              />
            </div>

            <div className={styles.previewTotal}>Total: {fmtBRL(preview.valor_total)}</div>

            {confirmError && <Alert variant="error" text={confirmError} fullWidth />}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <Button variant="secondary" onClick={backToList}>Cancelar</Button>
              <Button
                onClick={confirmImport}
                disabled={confirmSaving || preview.already_imported}
                loading={confirmSaving}
              >
                Confirmar importação
              </Button>
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <Button onClick={openUpload}>+ Importar nota</Button>
      </div>

      {listError && <Alert variant="error" text={listError} fullWidth />}

      {!listError && (
        <Table
          variant="compact"
          columns={listColumns}
          rows={invoices}
          rowKey={(i) => i.id}
          onRowClick={openDetail}
          emptyMessage={listLoading ? "Carregando…" : "Nenhuma nota importada ainda."}
        />
      )}

      <ConfirmDialog
        open={!!removeTarget}
        message={`Excluir a nota nº ${removeTarget?.numero ?? ""} de "${removeTarget?.fornecedor_nome ?? ""}"? Essa ação não pode ser desfeita.`}
        onConfirm={confirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </>
  );
}
