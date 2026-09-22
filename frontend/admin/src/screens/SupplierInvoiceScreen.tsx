import { useEffect, useRef, useState } from "react";
import { Alert, Button, DateInput, InputBase, Pagination, Tag, Upload, UploadListFiles, makeToast, type UploadFile } from "design-system";
import api from "../api";
import { listUsers } from "../api/companies";
import ConfirmDialog from "../components/ConfirmDialog";
import Table, { type TableColumn } from "../components/Table";
import { parseApiError } from "../lib/apiErrors";
import { useCatalogParams } from "../lib/catalogParams";
import { useStore } from "../store";
import type { SupplierInvoiceDetail, SupplierInvoiceListItem, SupplierInvoicePreview, SupplierInvoicePreviewItem, User } from "../types";
import styles from "./SupplierInvoiceScreen.module.scss";

const XML_TYPES = ["text/xml", "application/xml"];
const XML_MAX_SIZE_MB = 5; // XMLs de NF-e reais são pequenos (5-70 KB), 5 MB já é folga generosa
const LIMIT = 50;

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtQty = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

// Mesmo padrão de OrdersScreen/PaymentsScreen — "DD/MM/AAAA" (DateInput) <-> "AAAA-MM-DD" (backend).
function toIsoDate(brDate: string): string | undefined {
  const m = brDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function toDate(brDate: string): Date | undefined {
  const iso = toIsoDate(brDate);
  return iso ? new Date(`${iso}T00:00:00`) : undefined;
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

type View = "list" | "upload" | "detail";

// ORD-194 (B1) — upload de XML de NF de compra com prévia + histórico das
// notas já importadas (listagem/detalhe/exclusão, paginação e filtros).
//
// Listagem paginada + filtrada no servidor desde o início (achado do
// usuário: sem isso a tela fica impraticável com volume real) — mesmo
// padrão de OrdersScreen/PaymentsScreen (skip/limit, debounce 500ms nos
// campos de texto livre, Pagination do design-system).
//
// Detalhe da nota é página inteira, não Modal — achado ao vivo: com 7
// colunas a tabela de itens fica apertada demais dentro de um Modal
// (mesmo largo), a prévia de importação (que já era página inteira) nunca
// teve esse problema.
export default function SupplierInvoiceScreen() {
  const catalogParams = useCatalogParams();

  const [view, setView] = useState<View>("list");

  const [invoices, setInvoices] = useState<SupplierInvoiceListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [fornecedorFilter, setFornecedorFilter] = useState("");
  const [numeroFilter, setNumeroFilter] = useState("");
  const [serieFilter, setSerieFilter] = useState("");
  const [dataEmissaoFrom, setDataEmissaoFrom] = useState("");
  const [dataEmissaoTo, setDataEmissaoTo] = useState("");
  const [dataImportacaoFrom, setDataImportacaoFrom] = useState("");
  const [dataImportacaoTo, setDataImportacaoTo] = useState("");
  const [skip, setSkip] = useState(0);

  // Texto livre (fornecedor/número/série) precisa de debounce pra não
  // disparar uma requisição por tecla — mesmo padrão de OrdersScreen/
  // CompanyListScreen. Datas e paginação disparam na hora (são cliques, não
  // digitação contínua).
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();
  const isFirstRender = useRef(true);
  const requestId = useRef(0);

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

  // Resolve imported_by (id de usuário) pro nome real — mesmo padrão de
  // collected_by em OrdersScreen (listUsers da empresa em contexto,
  // fallback "Usuário #N" se não achar, ex: usuário removido depois).
  const companyId = useStore((s) => s.selectedCompanyId);
  const [users, setUsers] = useState<User[]>([]);
  useEffect(() => {
    if (!companyId) return;
    listUsers(companyId).then(setUsers).catch(() => null);
  }, [companyId]);

  function importedByLabel(userId: number): string {
    const user = users.find((u) => u.id === userId);
    return user?.name ?? `Usuário #${userId}`;
  }

  function fetchInvoices(skipOverride?: number) {
    const thisRequest = ++requestId.current;
    setListLoading(true);
    setListError(null);
    const params = {
      fornecedor: fornecedorFilter || undefined,
      numero: numeroFilter || undefined,
      serie: serieFilter || undefined,
      data_emissao_from: toIsoDate(dataEmissaoFrom),
      data_emissao_to: toIsoDate(dataEmissaoTo),
      data_importacao_from: toIsoDate(dataImportacaoFrom),
      data_importacao_to: toIsoDate(dataImportacaoTo),
      // setSkip() não atualiza o valor sincronamente — quem acabou de mudar
      // de página (ex: confirmImport voltando pra página 1) precisa passar
      // o valor novo explícito, senão este fetch usa o skip antigo da
      // closure antes do useEffect corrigir num segundo render.
      skip: skipOverride ?? skip,
      limit: LIMIT,
    };
    return api.get<{ invoices: SupplierInvoiceListItem[]; total: number }>(
      "/catalog/supplier-invoices", catalogParams(params),
    )
      .then((r) => {
        if (thisRequest !== requestId.current) return; // resposta obsoleta, ignorar
        setInvoices(r.data.invoices ?? []);
        setTotal(r.data.total ?? 0);
      })
      .catch((err) => { if (thisRequest === requestId.current) setListError(parseApiError(err).message); })
      .finally(() => { if (thisRequest === requestId.current) setListLoading(false); });
  }

  useEffect(() => {
    fetchInvoices();
    isFirstRender.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataEmissaoFrom, dataEmissaoTo, dataImportacaoFrom, dataImportacaoTo, skip]);

  useEffect(() => {
    if (isFirstRender.current) return;
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => { setSkip(0); fetchInvoices(); }, 500);
    return () => clearTimeout(debounceTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fornecedorFilter, numeroFilter, serieFilter]);

  const hasFilter = Boolean(
    fornecedorFilter || numeroFilter || serieFilter
    || dataEmissaoFrom || dataEmissaoTo || dataImportacaoFrom || dataImportacaoTo,
  );

  function clearFilters() {
    setFornecedorFilter("");
    setNumeroFilter("");
    setSerieFilter("");
    setDataEmissaoFrom("");
    setDataEmissaoTo("");
    setDataImportacaoFrom("");
    setDataImportacaoTo("");
    setSkip(0);
  }

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
      setSkip(0);
      fetchInvoices(0);
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
      fetchInvoices();
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
              <span>Importado em {fmtDate(detailTarget.imported_at)} por {importedByLabel(detailTarget.imported_by)}</span>
            </div>

            <div className={styles.previewTotal}>Total: {fmtBRL(detailTarget.valor_total)}</div>

            <Table
              variant="compact"
              columns={itemColumns}
              rows={detailTarget.itens}
              rowKey={(i) => i.n_item}
              emptyMessage="Nenhum item nesta nota."
            />

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

            <div className={styles.previewTotal}>Total: {fmtBRL(preview.valor_total)}</div>

            <Table
              variant="compact"
              columns={itemColumns}
              rows={preview.itens}
              rowKey={(i) => i.n_item}
              emptyMessage="Nenhum item nesta nota."
            />

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

  const page = Math.floor(skip / LIMIT) + 1;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <Button onClick={openUpload}>+ Importar nota</Button>
      </div>

      <div className={styles.filterBar}>
        <div className={styles.field}>
          <InputBase
            label="Fornecedor"
            placeholder="Buscar por nome…"
            value={fornecedorFilter}
            onChange={(e) => setFornecedorFilter(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <InputBase
            label="Número"
            placeholder="Ex: 47686"
            value={numeroFilter}
            onChange={(e) => setNumeroFilter(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <InputBase
            label="Série"
            placeholder="Ex: 1"
            value={serieFilter}
            onChange={(e) => setSerieFilter(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <DateInput
            label="Emissão de"
            value={dataEmissaoFrom}
            onChange={(value, valid) => {
              if (!valid && value) return;
              setDataEmissaoFrom(value);
              const from = toDate(value);
              const to = toDate(dataEmissaoTo);
              if (from && to && to < from) setDataEmissaoTo("");
            }}
          />
        </div>
        <div className={styles.field}>
          <DateInput
            label="Emissão até"
            value={dataEmissaoTo}
            disabled={!dataEmissaoFrom}
            minDate={toDate(dataEmissaoFrom)}
            invalidMinDateMessage="A data final deve ser igual ou posterior à data inicial."
            onChange={(value, valid) => { if (valid || !value) setDataEmissaoTo(value); }}
          />
        </div>
        <div className={styles.field}>
          <DateInput
            label="Importação de"
            value={dataImportacaoFrom}
            onChange={(value, valid) => {
              if (!valid && value) return;
              setDataImportacaoFrom(value);
              const from = toDate(value);
              const to = toDate(dataImportacaoTo);
              if (from && to && to < from) setDataImportacaoTo("");
            }}
          />
        </div>
        <div className={styles.field}>
          <DateInput
            label="Importação até"
            value={dataImportacaoTo}
            disabled={!dataImportacaoFrom}
            minDate={toDate(dataImportacaoFrom)}
            invalidMinDateMessage="A data final deve ser igual ou posterior à data inicial."
            onChange={(value, valid) => { if (valid || !value) setDataImportacaoTo(value); }}
          />
        </div>
        <Button variant="secondary" onClick={clearFilters} disabled={!hasFilter}>Limpar</Button>
      </div>

      {listError && <Alert variant="error" text={listError} fullWidth />}

      {!listError && (
        <>
          <div className={styles.count}>
            <b>{total}</b> nota{total === 1 ? "" : "s"} encontrada{total === 1 ? "" : "s"}
          </div>
          <Table
            variant="compact"
            columns={listColumns}
            rows={invoices}
            rowKey={(i) => i.id}
            onRowClick={openDetail}
            emptyMessage={listLoading ? "Carregando…" : `Nenhuma nota importada${hasFilter ? " para os filtros aplicados" : " ainda"}.`}
          />
          {total > 0 && (
            <div className={styles.pager}>
              <span className={styles.pagerCount}>Mostrando {skip + 1}–{Math.min(skip + LIMIT, total)} de {total}</span>
              <Pagination
                activePage={page}
                itemsPerPage={LIMIT}
                totalItemsCount={total}
                onChange={(newPage) => setSkip((newPage - 1) * LIMIT)}
              />
            </div>
          )}
        </>
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
