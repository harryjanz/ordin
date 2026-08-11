import { useState, useEffect, useRef } from "react";
import { Button, DateInput, Dropdown, Skeleton, Tag, type DropdownOptions, type TagProps } from "design-system";
import { listPayments } from "../api/payments";
import { listCompanies, listTerminals } from "../api/companies";
import { useStore } from "../store";
import Table, { type TableColumn } from "../components/Table";
import type { Company, PaymentStatusSummary, Terminal, Transaction } from "../types";
import styles from "./PaymentsScreen.module.scss";

const STATUS_VARIANT: Record<string, TagProps["variant"]> = {
  approved: "success",
  refused: "error",
  cancelled: "warning",
  processing: "neutral",
  expired: "error",
};

const PROVIDER_OPTIONS: DropdownOptions[] = [
  { value: "", label: "Todos" },
  { value: "mock", label: "mock" },
  { value: "paygo", label: "paygo" },
  { value: "mercadopago", label: "mercadopago" },
];

const STATUS_OPTIONS: DropdownOptions[] = [
  { value: "", label: "Todos" },
  { value: "approved", label: "Aprovado" },
  { value: "refused", label: "Recusado" },
  { value: "cancelled", label: "Cancelado" },
  { value: "processing", label: "Em processamento" },
  { value: "expired", label: "Expirado" },
];

const LIMIT = 50;

// "expired" não vira card dedicado (baixíssimo volume) — soma junto com
// "Recusado", mesmo bucket semântico ("não completou"). Clicar num card
// filtra a tabela pelo status principal do card (statuses[0]).
const STATUS_CARDS: { key: string; label: string; statuses: string[]; color: string; note?: string }[] = [
  { key: "approved", label: "Aprovado", statuses: ["approved"], color: "var(--success-base)" },
  { key: "refused", label: "Recusado", statuses: ["refused", "expired"], color: "var(--error-base)", note: "inclui expiradas" },
  { key: "cancelled", label: "Cancelado", statuses: ["cancelled"], color: "var(--warning-base)" },
  { key: "processing", label: "Em processamento", statuses: ["processing"], color: "var(--brand-primary)", note: "PIX aguardando confirmação" },
];

function sumSummary(summary: PaymentStatusSummary, statuses: string[]): { count: number; amount: number } {
  return statuses.reduce(
    (acc, s) => ({ count: acc.count + (summary[s]?.count ?? 0), amount: acc.amount + (summary[s]?.amount ?? 0) }),
    { count: 0, amount: 0 }
  );
}

// DateInput trabalha em dd/mm/aaaa — o backend espera algo comparável a
// created_at (DATETIME). "dd/mm/aaaa" -> "aaaa-mm-dd".
function toIsoDate(brDate: string): string | undefined {
  const m = brDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export default function PaymentsScreen() {
  const role = useStore((s) => s.role);
  const isSuperadmin = role === "superadmin";

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [provider, setProvider] = useState("");
  const [status, setStatus] = useState("");
  const [skip, setSkip] = useState(0);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<PaymentStatusSummary>({});
  const [loading, setLoading] = useState(true);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  // Cache de terminais por empresa (ORD-080) — expandir a primeira linha de
  // uma empresa busca a lista inteira de terminais dela de uma vez; expandir
  // outra linha da mesma empresa não repete a requisição.
  const [terminalsByCompany, setTerminalsByCompany] = useState<Record<number, Terminal[]>>({});
  const fetchingCompanies = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (isSuperadmin) {
      listCompanies({ limit: 200 }).then((r) => setCompanies(r.companies)).catch(() => null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperadmin]);

  useEffect(() => {
    setLoading(true);
    listPayments({
      companyId: companyId ?? undefined,
      dateFrom: toIsoDate(dateFrom),
      dateTo: toIsoDate(dateTo),
      provider: provider || undefined,
      status: status || undefined,
      skip,
      limit: LIMIT,
    })
      .then((r) => { setTransactions(r.items); setTotal(r.total); setSummary(r.summary); })
      .catch(() => null)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, dateFrom, dateTo, provider, status, skip]);

  function clearFilters() {
    setCompanyId(null);
    setDateFrom("");
    setDateTo("");
    setProvider("");
    setStatus("");
    setSkip(0);
  }

  function toggleExpand(t: Transaction) {
    if (expandedId === t.id) { setExpandedId(null); return; }
    setExpandedId(t.id);
    if (!terminalsByCompany[t.company_id] && !fetchingCompanies.current.has(t.company_id)) {
      fetchingCompanies.current.add(t.company_id);
      listTerminals(t.company_id)
        .then((terminals) => setTerminalsByCompany((prev) => ({ ...prev, [t.company_id]: terminals })))
        .catch(() => null)
        .finally(() => fetchingCompanies.current.delete(t.company_id));
    }
  }

  function terminalLabel(t: Transaction): string {
    const terminal = terminalsByCompany[t.company_id]?.find((term) => term.id === t.terminal_id);
    return terminal?.label ?? `Terminal ${t.terminal_id}`;
  }

  const hasFilter = Boolean(companyId || dateFrom || dateTo || provider || status);
  const page = Math.floor(skip / LIMIT) + 1;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const companyOptions: DropdownOptions[] = [
    { value: "", label: "Todas as empresas" },
    ...companies.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  const columns: TableColumn<Transaction>[] = [
    { key: "id", header: "ID", render: (t) => t.id },
    { key: "order_ref", header: "Pedido", mono: true, render: (t) => t.order_ref },
    { key: "method", header: "Método", render: (t) => t.method },
    { key: "amount", header: "Valor", render: (t) => t.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
    { key: "status", header: "Status", render: (t) => <Tag variant={STATUS_VARIANT[t.status] ?? "neutral"}>{t.status}</Tag> },
    { key: "provider", header: "Provider", render: (t) => t.provider },
    { key: "nsu", header: "NSU", mono: true, render: (t) => t.nsu ?? "—" },
    { key: "created_at", header: "Data", render: (t) => new Date(t.created_at).toLocaleString("pt-BR") },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.title}>Transações TEF</div>

      <div className={styles.filterBar}>
        {isSuperadmin && (
          <div className={styles.field}>
            <Dropdown
              label="Empresa"
              value={companyOptions.find((o) => o.value === String(companyId ?? "")) ?? companyOptions[0]}
              onValueSelected={(opt) => { setCompanyId(opt.value ? Number(opt.value) : null); setSkip(0); }}
              options={companyOptions}
            />
          </div>
        )}
        <div className={styles.field}>
          <DateInput
            label="De"
            value={dateFrom}
            onChange={(value, valid) => { if (valid || !value) { setDateFrom(value); setSkip(0); } }}
          />
        </div>
        <div className={styles.field}>
          <DateInput
            label="Até"
            value={dateTo}
            onChange={(value, valid) => { if (valid || !value) { setDateTo(value); setSkip(0); } }}
          />
        </div>
        <div className={styles.field}>
          <Dropdown
            label="Provider"
            value={PROVIDER_OPTIONS.find((o) => o.value === provider) ?? PROVIDER_OPTIONS[0]}
            onValueSelected={(opt) => { setProvider(opt.value); setSkip(0); }}
            options={PROVIDER_OPTIONS}
          />
        </div>
        <div className={styles.field}>
          <Dropdown
            label="Status"
            value={STATUS_OPTIONS.find((o) => o.value === status) ?? STATUS_OPTIONS[0]}
            onValueSelected={(opt) => { setStatus(opt.value); setSkip(0); }}
            options={STATUS_OPTIONS}
          />
        </div>
        <Button variant="secondary" onClick={clearFilters} disabled={!hasFilter}>Limpar</Button>
      </div>

      <div className={styles.grid}>
        {STATUS_CARDS.map((card) => {
          const { count, amount } = sumSummary(summary, card.statuses);
          const active = status === card.statuses[0];
          return (
            <button
              key={card.key}
              type="button"
              className={`${styles.card} ${active ? styles.cardActive : ""}`}
              style={{ borderLeftColor: card.color }}
              onClick={() => { setStatus(active ? "" : card.statuses[0]); setSkip(0); }}
            >
              <div className={styles.cardLabel}>{card.label} {loading ? "" : `(${count})`}</div>
              {loading ? (
                <Skeleton height={28} />
              ) : (
                <div className={styles.cardValue} style={{ color: card.color }}>
                  {amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </div>
              )}
              {card.note && <div className={styles.cardNote}>{card.note}</div>}
            </button>
          );
        })}
      </div>

      {loading && transactions.length === 0 && total === 0 ? (
        <div className={styles.muted}>Carregando…</div>
      ) : (
        <>
          {transactions.length > 0 ? (
            <>
              <Table
                columns={columns}
                rows={transactions}
                rowKey={(t) => t.id}
                onRowClick={toggleExpand}
                expandedRowKey={expandedId}
                renderExpanded={(t) => (
                  <dl className={styles.detail}>
                    <div className={styles.detailItem}>
                      <dt>Ambiente</dt>
                      <dd><Tag variant={t.environment === "sandbox" ? "warning" : "success"}>{t.environment === "sandbox" ? "Sandbox" : "Produção"}</Tag></dd>
                    </div>
                    <div className={styles.detailItem}>
                      <dt>Terminal</dt>
                      <dd>{terminalLabel(t)}</dd>
                    </div>
                    <div className={styles.detailItem}>
                      <dt>Referência do provider</dt>
                      <dd className={styles.detailMono}>{t.provider_transaction_id ?? "—"}</dd>
                    </div>
                    <div className={styles.detailItem}>
                      <dt>Número TEF</dt>
                      <dd className={styles.detailMono}>{t.tef_number ?? "—"}</dd>
                    </div>
                    {(t.status === "refused" || t.status === "expired") && (
                      <div className={`${styles.detailItem} ${styles.detailWide}`}>
                        <dt>Motivo da recusa</dt>
                        <dd>
                          {t.refused_reason ?? (
                            <span className={styles.detailMissing}>
                              Motivo não registrado — este dado só passou a ser salvo a partir desta atualização.
                            </span>
                          )}
                        </dd>
                      </div>
                    )}
                    {t.status === "cancelled" && (
                      <div className={`${styles.detailItem} ${styles.detailWide}`}>
                        <dt>Motivo do cancelamento</dt>
                        <dd>
                          {t.cancel_reason ?? "—"}
                          {t.cancelled_at && ` · ${new Date(t.cancelled_at).toLocaleString("pt-BR")}`}
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
              />
              <div className={styles.pager}>
                <span>Mostrando {skip + 1}–{Math.min(skip + LIMIT, total)} de {total}</span>
                <div className={styles.pagerActions}>
                  <Button variant="secondary" size="small" disabled={skip === 0} onClick={() => setSkip((s) => Math.max(0, s - LIMIT))}>Anterior</Button>
                  <span>Página {page} de {totalPages}</span>
                  <Button variant="secondary" size="small" disabled={skip + LIMIT >= total} onClick={() => setSkip((s) => s + LIMIT)}>Próxima</Button>
                </div>
              </div>
            </>
          ) : (
            <div className={styles.empty}>
              Nenhuma transação encontrada{hasFilter ? " para os filtros aplicados" : ""}.
            </div>
          )}
        </>
      )}
    </div>
  );
}
