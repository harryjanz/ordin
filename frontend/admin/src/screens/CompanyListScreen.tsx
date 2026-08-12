import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, DateInput, Dropdown, InputBase, Pagination, Skeleton, Tag, type DropdownOptions } from "design-system";
import { listCompanies, type ContractStatusFilter } from "../api/companies";
import { parseApiError } from "../lib/apiErrors";
import { formatCnpj } from "../lib/masks";
import { useStore } from "../store";
import Table, { type TableColumn } from "../components/Table";
import type { Company, CompanyStatusSummary } from "../types";
import styles from "./CompanyListScreen.module.scss";

const LIMIT = 50;

const STATUS_LABEL: Record<string, string> = { pendente: "Pendente", enviado: "Enviado", assinado: "Assinado" };

const STATUS_OPTIONS: DropdownOptions[] = [
  { value: "", label: "Todos" },
  { value: "pendente", label: "Pendente" },
  { value: "enviado", label: "Enviado" },
  { value: "assinado", label: "Assinado" },
];

// minWidth igual nos dois — texto de tamanho diferente ("Ativar na Sessão"
// vs "Desativar da Sessão") não deve mudar a largura do botão na coluna.
// Cor de erro no texto de "Desativar" é o mesmo padrão de PaymentsScreen
// (DANGER_BTN_STYLE, botão "Cancelar").
const SESSION_BTN_STYLE = { minWidth: 168 };
const DEACTIVATE_BTN_STYLE = { ...SESSION_BTN_STYLE, color: "var(--error-base)" };

// Mesmo padrão visual dos cards de resumo de Transações (ORD-078) e Pedidos
// (ORD-081) — aqui só contagem, sem valor monetário (ver ORD-084).
const STATUS_CARDS: { key: "pendente" | "enviado" | "assinado"; label: string; color: string }[] = [
  { key: "pendente", label: "Pendente", color: "var(--warning-base)" },
  { key: "enviado", label: "Enviado", color: "var(--brand-primary)" },
  { key: "assinado", label: "Assinado", color: "var(--success-base)" },
];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

// DateInput trabalha em dd/mm/aaaa — o backend espera algo comparável a
// created_at (DATETIME). "dd/mm/aaaa" -> "aaaa-mm-dd". Mesmo helper de
// PaymentsScreen/OrdersScreen (ver ORD-077/ORD-081).
function toIsoDate(brDate: string): string | undefined {
  const m = brDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// Mesmo formato que o DateInput usa internamente pra comparar minDate/maxDate.
function toDate(brDate: string): Date | undefined {
  const iso = toIsoDate(brDate);
  return iso ? new Date(`${iso}T00:00:00`) : undefined;
}

export default function CompanyListScreen() {
  const navigate = useNavigate();
  // ORD-085: mesma sessão compartilhada do ORD-082 (Configurações/Transações/
  // Pedidos/Empresa/Dispositivos/Catálogo) — ativar por aqui já reflete
  // nas outras telas e no badge "Empresa ativa" no topo.
  const selectedCompanyId = useStore((s) => s.selectedCompanyId);
  const setSelectedCompany = useStore((s) => s.setSelectedCompany);
  const [q, setQ] = useState("");
  const [document, setDocumentFilter] = useState("");
  const [contractStatus, setContractStatus] = useState<ContractStatusFilter>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [skip, setSkip] = useState(0);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<CompanyStatusSummary>({});
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
      const result = await listCompanies({
        q, document, contractStatus,
        dateFrom: toIsoDate(dateFrom), dateTo: toIsoDate(dateTo),
        skip, limit: LIMIT,
      });
      if (thisRequest !== requestId.current) return; // resposta obsoleta, ignorar
      setCompanies(result.companies);
      setTotal(result.total);
      setSummary(result.summary);
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
  }, [contractStatus, dateFrom, dateTo, skip]);

  // O DateInput só revalida minDate/maxDate contra o valor atual quando o
  // próprio campo muda — sem isso, mudar "De" pra depois de um "Até" já
  // escolhido deixaria os dois inconsistentes sem nenhum aviso. Mesmo
  // handler de PaymentsScreen/OrdersScreen.
  function handleDateFromChange(value: string, valid: boolean) {
    if (!valid && value) return;
    setDateFrom(value);
    const from = toDate(value);
    const to = toDate(dateTo);
    if (from && to && to < from) setDateTo("");
    setSkip(0);
  }

  function clearFilters() {
    setQ("");
    setDocumentFilter("");
    setContractStatus("");
    setDateFrom("");
    setDateTo("");
    setSkip(0);
  }

  const hasFilter = Boolean(q || document || contractStatus || dateFrom || dateTo);
  const page = Math.floor(skip / LIMIT) + 1;

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
    {
      key: "action", header: "Ação", render: (c) =>
        c.id === selectedCompanyId ? (
          <Button
            size="small"
            variant="secondary"
            style={DEACTIVATE_BTN_STYLE}
            onClick={(e) => { e.stopPropagation(); setSelectedCompany(null); }}
          >
            Desativar da Sessão
          </Button>
        ) : (
          <Button
            size="small"
            variant="primary"
            style={SESSION_BTN_STYLE}
            onClick={(e) => { e.stopPropagation(); setSelectedCompany(c.id); }}
          >
            Ativar na Sessão
          </Button>
        ),
    },
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

      <div className={styles.grid}>
        {STATUS_CARDS.map((card) => {
          const count = summary[card.key] ?? 0;
          const active = contractStatus === card.key;
          return (
            <button
              key={card.key}
              type="button"
              className={`${styles.card} ${active ? styles.cardActive : ""}`}
              style={{ borderLeftColor: card.color }}
              onClick={() => { setContractStatus(active ? "" : card.key); setSkip(0); }}
            >
              <div className={styles.cardLabel}>
                <span>{card.label}</span>
                {loading ? <Skeleton height={18} width={24} /> : <span className={styles.cardCount}>{count}</span>}
              </div>
            </button>
          );
        })}
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
            onValueSelected={(opt) => { setContractStatus(opt.value as ContractStatusFilter); setSkip(0); }}
            options={STATUS_OPTIONS}
            data-testid="select-filtro-status"
          />
        </div>
        <div className={styles.field}>
          <DateInput
            label="De"
            value={dateFrom}
            onChange={handleDateFromChange}
          />
        </div>
        <div className={styles.field}>
          <DateInput
            label="Até"
            value={dateTo}
            disabled={!dateFrom}
            minDate={toDate(dateFrom)}
            invalidMinDateMessage="A data final deve ser igual ou posterior à data inicial."
            onChange={(value, valid) => { if (valid || !value) { setDateTo(value); setSkip(0); } }}
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
          variant="compact"
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
            variant="compact"
            columns={columns}
            rows={companies}
            rowKey={(c) => c.id}
            onRowClick={(c) => navigate(`/companies/${c.id}/contract`)}
            rowTestId={(c) => `row-company-${c.id}`}
          />
          <div className={styles.pager}>
            <span>Mostrando {skip + 1}–{Math.min(skip + LIMIT, total)} de {total}</span>
            <Pagination
              activePage={page}
              itemsPerPage={LIMIT}
              totalItemsCount={total}
              onChange={(newPage) => setSkip((newPage - 1) * LIMIT)}
            />
          </div>
        </>
      )}
    </div>
  );
}
