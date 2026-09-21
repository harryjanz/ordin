import { useState } from "react";
import { Alert, Button, Tag, Upload, UploadListFiles, makeToast, type UploadFile } from "design-system";
import api from "../api";
import Table, { type TableColumn } from "../components/Table";
import { parseApiError } from "../lib/apiErrors";
import { useCatalogParams } from "../lib/catalogParams";
import type { SupplierInvoicePreview, SupplierInvoicePreviewItem } from "../types";
import styles from "./SupplierInvoiceScreen.module.scss";

const XML_TYPES = ["text/xml", "application/xml"];
const XML_MAX_SIZE_MB = 5; // XMLs de NF-e reais são pequenos (5-70 KB), 5 MB já é folga generosa

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtQty = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });

// ORD-194 (B1) — upload de XML de NF de compra com prévia. Fluxo em dois
// passos sem estado no servidor (ver Explorer da história): o arquivo
// escolhido fica em memória aqui (pickedFile), "Confirmar importação" reenvia
// esse mesmo File pro segundo endpoint — a Empresa nunca escolhe o arquivo
// duas vezes, isso é só um detalhe de implementação.
export default function SupplierInvoiceScreen() {
  const catalogParams = useCatalogParams();

  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<SupplierInvoicePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  function resetAll() {
    setUploadFiles([]);
    setPickedFile(null);
    setPreview(null);
    setPreviewError(null);
    setConfirmError(null);
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
      resetAll();
    } catch (err) {
      setConfirmError(parseApiError(err).message || "Erro ao confirmar a importação.");
    } finally {
      setConfirmSaving(false);
    }
  }

  const itemColumns: TableColumn<SupplierInvoicePreviewItem>[] = [
    { key: "c_prod", header: "Código", mono: true, render: (i) => i.c_prod ?? "—" },
    { key: "c_ean", header: "EAN", mono: true, render: (i) => i.c_ean ?? "—" },
    { key: "x_prod", header: "Descrição", render: (i) => i.x_prod },
    { key: "unidade", header: "Unidade", render: (i) => i.unidade ?? "—" },
    { key: "quantidade", header: "Quantidade", mono: true, render: (i) => fmtQty(i.quantidade) },
    { key: "valor_unitario", header: "Valor unit.", mono: true, render: (i) => fmtBRL(i.valor_unitario) },
    { key: "valor_total", header: "Valor total", mono: true, render: (i) => fmtBRL(i.valor_total) },
  ];

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
            <Button variant="secondary" onClick={resetAll}>Cancelar</Button>
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
