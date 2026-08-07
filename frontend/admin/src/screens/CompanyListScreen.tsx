import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Dropdown, InputBase, Tag, type DropdownOptions } from "design-system";
import { listCompanies, type ContractStatusFilter } from "../api/companies";
import { parseApiError } from "../lib/apiErrors";
import { formatCnpj } from "../lib/masks";
import Table, { type TableColumn } from "../components/Table";
import type { Company } from "../types";
import styles from "./CompanyListScreen.module.scss";

const LIMIT = 50;

const STATUS_LABEL: Record<string, string> = { pendente: "Pendente", enviado: "Enviado", assinado: "Assinado" };

const STATUS_OPTIONS: DropdownOptions[] = [
  { value: "", label: "Todos" },
  { value: "pendente", label: "Pendente" },
  { value: "enviado", label: "Enviado" },
  { value: "assinado", label: "Assinado" },
];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function CompanyListScreen() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [document, setDocumentFilter] = useState("");
  const [contractStatus, setContractStatus] = useState<ContractStatusFilter>("");
  const [skip, setSkip] = useState(0);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();
  const isFirstRender = useRef(true);

  // Contador de requisições — evita que uma resposta antiga (ex: fetch
  // disparado com o CNPJ ainda incompleto, "11.222") chegue DEPOIS da
  // resposta mais recente e sobrescreva o resultado certo com um errado.
  const requestId = useRef(0);

  async function fetchCompanies() {
    const thisRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await listCompanies({ q, document, contractStatus, skip, limit: LIMIT });
      if (thisRequest !== requestId.current) return; // resposta obsoleta, ignorar
      setCompanies(result.companies);
      setTotal(result.total);
    } catch (err) {
      if (thisRequest !== requestId.current) return;
      setError(parseApiError(err).message);
    } finally {
      if (thisRequest === requestId.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (isFirstRender.current) return;
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => { setSkip(0); fetchCompanies(); }, 500);
    return () => clearTimeout(debounceTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, document]);

  useEffect(() => {
    fetchCompanies();
    isFirstRender.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractStatus, skip]);

  function clearFilters() {
    setQ("");
    setDocumentFilter("");
    setContractStatus("");
    setSkip(0);
  }

  const hasFilter = Boolean(q || document || contractStatus);
  const page = Math.floor(skip / LIMIT) + 1;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const columns: TableColumn<Company>[] = [
    {
      key: "name", header: "Cliente", render: (c) => (
        <>
          <div className={styles.rowName}>{c.name}</div>
          {c.legal_name && <div className={styles.rowSub}>{c.legal_name}</div>}
        </>
      ),
    },
    { key: "document", header: "CNPJ", mono: true, render: (c) => formatCnpj(c.document ?? "") },
    {
      key: "cadastral_status", header: "Situação Receita", render: (c) => (
        <Tag variant={c.cadastral_status === "ATIVA" ? "success" : "neutral"}>
          {c.cadastral_status === "ATIVA" ? "Ativa" : c.cadastral_status ?? "Não verificada"}
        </Tag>
      ),
    },
    {
      key: "contract_status", header: "Status contrato", render: (c) => (
        <Tag variant={c.contract_status === "assinado" ? "success" : "warning"}>
          {STATUS_LABEL[c.contract_status ?? "pendente"]}
        </Tag>
      ),
    },
    { key: "created_at", header: "Cadastrado em", mono: true, render: (c) => fmtDate(c.created_at) },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <div className={styles.eyebrow}>Empresas</div>
          <h1 className={styles.title}>Clientes</h1>
        </div>
        <Button onClick={() => navigate("/companies/new")}>+ Novo cliente</Button>
      </div>

      <div className={styles.filterBar}>
        <div className={styles.field}>
          <InputBase
            label="Razão social ou nome fantasia"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome…"
            icon="search"
            data-testid="input-busca-nome"
          />
        </div>
        <div className={styles.field}>
          <InputBase
            label="CNPJ"
            value={formatCnpj(document)}
            onChange={(e) => setDocumentFilter(e.target.value)}
            placeholder="XX.XXX.XXX/XXXX-XX"
            data-testid="input-filtro-cnpj"
          />
        </div>
        <div className={styles.field}>
          <Dropdown
            label="Status do contrato"
            value={STATUS_OPTIONS.find((o) => o.value === contractStatus) ?? STATUS_OPTIONS[0]}
            onValueSelected={(opt) => setContractStatus(opt.value as ContractStatusFilter)}
            options={STATUS_OPTIONS}
            data-testid="select-filtro-status"
          />
        </div>
        <Button variant="secondary" onClick={clearFilters} disabled={!hasFilter} data-testid="btn-limpar-filtros">Limpar</Button>
      </div>

      {error && <Alert variant="error" text={error} fullWidth />}

      {loading && companies.length === 0 && total === 0 && !error && (
        <div className={styles.filterCount}>Carregando…</div>
      )}

      {!error && (companies.length > 0 || total > 0) && (
        <div className={styles.filterCount} data-testid="contador-resultados">
          <strong>{total}</strong> cliente{total === 1 ? "" : "s"} encontrado{total === 1 ? "" : "s"}
          {loading && <span className={styles.updating}>· Atualizando…</span>}
        </div>
      )}

      {!loading && !error && companies.length === 0 && total === 0 && (
        <Table
          columns={columns}
          rows={[]}
          rowKey={(c) => c.id}
          emptyMessage={
            <>
              <p>Nenhum cliente encontrado{hasFilter ? " para os filtros aplicados" : ""}.</p>
              {hasFilter && <Button variant="secondary" onClick={clearFilters}>Limpar filtros</Button>}
            </>
          }
        />
      )}

      {!error && companies.length > 0 && (
        <>
          <Table
            columns={columns}
            rows={companies}
            rowKey={(c) => c.id}
            onRowClick={(c) => navigate(`/companies/${c.id}/contract`)}
            rowTestId={(c) => `row-company-${c.id}`}
          />
          <div className={styles.pager}>
            <span>Mostrando {skip + 1}–{Math.min(skip + LIMIT, total)} de {total}</span>
            <div className={styles.pagerActions}>
              <Button variant="secondary" size="small" disabled={skip === 0} onClick={() => setSkip((s) => Math.max(0, s - LIMIT))} data-testid="btn-pagina-anterior">Anterior</Button>
              <span>Página {page} de {totalPages}</span>
              <Button variant="secondary" size="small" disabled={skip + LIMIT >= total} onClick={() => setSkip((s) => s + LIMIT)} data-testid="btn-pagina-proxima">Próxima</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
