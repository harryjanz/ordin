import { useState, useEffect, useRef } from "react";
import { Button, DateInput, Dropdown, InputBase, Pagination, Skeleton, Tag, type DropdownOptions, type TagProps } from "design-system";
import { listOrders, listOrderTickets } from "../api/orders";
import { listCompanies, listTerminals } from "../api/companies";
import { useStore } from "../store";
import Table, { type TableColumn } from "../components/Table";
import type { Company, Order, OrderStatusSummary, Terminal, Ticket } from "../types";
import styles from "./OrdersScreen.module.scss";

const STATUS_VARIANT: Record<string, TagProps["variant"]> = {
  pending: "warning",
  paid: "neutral",
  completed: "success",
  cancelled: "error",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const STATUS_OPTIONS: DropdownOptions[] = [
  { value: "", label: "Todos" },
  { value: "pending", label: "Pendente" },
  { value: "paid", label: "Pago" },
  { value: "completed", label: "Concluído" },
  { value: "cancelled", label: "Cancelado" },
];

const STATUS_CARDS: { key: string; label: string; color: string }[] = [
  { key: "pending", label: "Pendente", color: "var(--warning-base)" },
  { key: "paid", label: "Pago", color: "var(--brand-primary)" },
  { key: "completed", label: "Concluído", color: "var(--success-base)" },
  { key: "cancelled", label: "Cancelado", color: "var(--error-base)" },
];

const LIMIT = 50;

// DateInput trabalha em dd/mm/aaaa — o backend espera algo comparável a
// created_at (DATETIME). "dd/mm/aaaa" -> "aaaa-mm-dd". Mesmo helper de
// PaymentsScreen (ORD-077).
function toIsoDate(brDate: string): string | undefined {
  const m = brDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function toDate(brDate: string): Date | undefined {
  const iso = toIsoDate(brDate);
  return iso ? new Date(`${iso}T00:00:00`) : undefined;
}

// 123.456.789-01 -> 123.***.**9-01 — mostra início e fim, esconde o meio.
function maskCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.***.***-${digits.slice(9)}`;
}

export default function OrdersScreen() {
  const role = useStore((s) => s.role);
  // superadmin e admin são equivalentes (gestão da plataforma, ver
  // docs/ARQUITETURA.md §1.2) — mesmo padrão de PaymentsScreen.
  const isPlatformAdmin = role === "superadmin" || role === "admin";

  // ORD-082: valor de SESSÃO compartilhado (não useState local) — selecionar
  // uma empresa aqui, em Transações ou em Configurações vale nas outras
  // telas ao navegar, e o badge no canto superior direito mostra/permite
  // limpar.
  const companyId = useStore((s) => s.selectedCompanyId);
  const setSelectedCompany = useStore((s) => s.setSelectedCompany);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [orderRef, setOrderRef] = useState("");
  const [cpf, setCpf] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [hourFrom, setHourFrom] = useState("");
  const [hourTo, setHourTo] = useState("");
  // "Pago" como padrão ao abrir a tela — é o status mais analisado no
  // dia a dia (pedido concluído do ponto de vista financeiro, ainda não
  // necessariamente coletado). "Limpar" continua voltando pra "" (todos).
  const [status, setStatus] = useState("paid");
  const [skip, setSkip] = useState(0);

  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<OrderStatusSummary>({});
  const [loading, setLoading] = useState(true);

  const [expandedRef, setExpandedRef] = useState<string | null>(null);
  const [terminalsByCompany, setTerminalsByCompany] = useState<Record<number, Terminal[]>>({});
  const fetchingCompanies = useRef<Set<number>>(new Set());
  const [ticketsByOrder, setTicketsByOrder] = useState<Record<string, Ticket[]>>({});
  const fetchingTickets = useRef<Set<string>>(new Set());

  // Referência/CPF são texto livre — debounce pra não disparar uma
  // requisição por tecla, mesmo padrão do CompanyListScreen (única outra
  // tela com busca por texto no admin).
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();
  const isFirstRender = useRef(true);
  const requestId = useRef(0);

  useEffect(() => {
    if (isPlatformAdmin) {
      listCompanies({ limit: 200 }).then((r) => setCompanies(r.companies)).catch(() => null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatformAdmin]);

  useEffect(() => {
    if (isFirstRender.current) return;
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => { setSkip(0); fetchOrders(); }, 500);
    return () => clearTimeout(debounceTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderRef, cpf]);

  useEffect(() => {
    fetchOrders();
    isFirstRender.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, dateFrom, dateTo, hourFrom, hourTo, status, skip]);

  function fetchOrders() {
    const thisRequest = ++requestId.current;
    setLoading(true);
    return listOrders({
      companyId: companyId ?? undefined,
      orderRef: orderRef || undefined,
      cpf: cpf || undefined,
      dateFrom: toIsoDate(dateFrom),
      dateTo: toIsoDate(dateTo),
      hourFrom: hourFrom || undefined,
      hourTo: hourTo || undefined,
      status: status || undefined,
      skip,
      limit: LIMIT,
    })
      .then((r) => {
        if (thisRequest !== requestId.current) return; // resposta obsoleta, ignorar
        setOrders(r.items); setTotal(r.total); setSummary(r.summary);
      })
      .catch(() => null)
      .finally(() => { if (thisRequest === requestId.current) setLoading(false); });
  }

  // Mesmo motivo do handleDateFromChange de PaymentsScreen: o DateInput só
  // revalida minDate contra o próprio campo, não reage a um novo `minDate`
  // vindo via prop — mudar "De" pra depois de um "Até" já escolhido
  // deixaria os dois inconsistentes sem aviso.
  function handleDateFromChange(value: string, valid: boolean) {
    if (!valid && value) return;
    setDateFrom(value);
    const from = toDate(value);
    const to = toDate(dateTo);
    if (from && to && to < from) setDateTo("");
    // Faixa de horário só faz sentido com "De" preenchido (ver ORD-081) —
    // limpar a data limpa a faixa de horário junto.
    if (!value) { setHourFrom(""); setHourTo(""); }
    setSkip(0);
  }

  function clearFilters() {
    setSelectedCompany(null);
    setOrderRef("");
    setCpf("");
    setDateFrom("");
    setDateTo("");
    setHourFrom("");
    setHourTo("");
    setStatus("");
    setSkip(0);
  }

  function toggleExpand(o: Order) {
    if (expandedRef === o.order_ref) { setExpandedRef(null); return; }
    setExpandedRef(o.order_ref);
    if (!terminalsByCompany[o.company_id] && !fetchingCompanies.current.has(o.company_id)) {
      fetchingCompanies.current.add(o.company_id);
      listTerminals(o.company_id)
        .then((terminals) => setTerminalsByCompany((prev) => ({ ...prev, [o.company_id]: terminals })))
        .catch(() => null)
        .finally(() => fetchingCompanies.current.delete(o.company_id));
    }
    if (!ticketsByOrder[o.order_ref] && !fetchingTickets.current.has(o.order_ref)) {
      fetchingTickets.current.add(o.order_ref);
      listOrderTickets(o.order_ref)
        .then((tickets) => setTicketsByOrder((prev) => ({ ...prev, [o.order_ref]: tickets })))
        .catch(() => null)
        .finally(() => fetchingTickets.current.delete(o.order_ref));
    }
  }

  function terminalLabel(o: Order): string {
    const terminal = terminalsByCompany[o.company_id]?.find((term) => term.id === o.terminal_id);
    return terminal?.label ?? `Terminal ${o.terminal_id}`;
  }

  const hasFilter = Boolean(companyId || orderRef || cpf || dateFrom || dateTo || hourFrom || hourTo || status);
  const page = Math.floor(skip / LIMIT) + 1;

  const companyOptions: DropdownOptions[] = [
    { value: "", label: "Todas as empresas" },
    ...companies.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  const columns: TableColumn<Order>[] = [
    { key: "order_ref", header: "Referência", mono: true, render: (o) => o.order_ref },
    { key: "status", header: "Status", render: (o) => <Tag variant={STATUS_VARIANT[o.status] ?? "neutral"}>{STATUS_LABEL[o.status] ?? o.status}</Tag> },
    { key: "total", header: "Total", render: (o) => o.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
    { key: "terminal", header: "Terminal", render: (o) => terminalLabel(o) },
    { key: "tickets", header: "Tickets", render: (o) => `${o.tickets_collected}/${o.tickets_total}` },
    { key: "created_at", header: "Criado em", render: (o) => new Date(o.created_at).toLocaleString("pt-BR") },
  ];

  const scopeNote = isPlatformAdmin
    ? (companyId ? companyOptions.find((opt) => opt.value === String(companyId))?.label : "Todas as empresas")
    : null;

  return (
    <div className={styles.page}>
      <div className={styles.title}>Pedidos</div>
      {scopeNote && <div className={styles.subtitle}>{scopeNote}</div>}

      <div className={styles.grid}>
        {STATUS_CARDS.map((card) => {
          const item = summary[card.key];
          const active = status === card.key;
          return (
            <button
              key={card.key}
              type="button"
              className={`${styles.card} ${active ? styles.cardActive : ""}`}
              style={{ borderLeftColor: card.color }}
              onClick={() => { setStatus(active ? "" : card.key); setSkip(0); }}
            >
              <div className={styles.cardLabel}>
                <span>{card.label}</span>
                {!loading && <span className={styles.cardCount}>{item?.count ?? 0}</span>}
              </div>
              {loading ? (
                <Skeleton height={22} />
              ) : (
                <div className={styles.cardValue} style={{ color: card.color }}>
                  {(item?.total ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className={styles.filterBar}>
        {isPlatformAdmin && (
          <div className={styles.field}>
            <Dropdown
              label="Empresa"
              value={companyOptions.find((o) => o.value === String(companyId ?? "")) ?? companyOptions[0]}
              onValueSelected={(opt) => { setSelectedCompany(opt.value ? Number(opt.value) : null); setSkip(0); }}
              options={companyOptions}
            />
          </div>
        )}
        <div className={styles.field}>
          <InputBase
            label="Referência"
            placeholder="ex.: 7F3A9"
            value={orderRef}
            onChange={(e) => setOrderRef(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <InputBase
            label="CPF"
            placeholder="Só números ou com pontuação"
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
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
        <div className={styles.field}>
          <InputBase
            label="Hora de"
            type="time"
            disabled={!dateFrom}
            value={hourFrom}
            onChange={(e) => { setHourFrom(e.target.value); setSkip(0); }}
          />
        </div>
        <div className={styles.field}>
          <InputBase
            label="Hora até"
            type="time"
            disabled={!dateFrom}
            value={hourTo}
            onChange={(e) => { setHourTo(e.target.value); setSkip(0); }}
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

      {loading && orders.length === 0 && total === 0 ? (
        <div className={styles.muted}>Carregando…</div>
      ) : (
        <>
          {orders.length > 0 ? (
            <>
              <div className={styles.count}><b>{total}</b> pedido{total === 1 ? "" : "s"} encontrado{total === 1 ? "" : "s"}</div>
              <Table
                variant="compact"
                columns={columns}
                rows={orders}
                rowKey={(o) => o.order_ref}
                onRowClick={toggleExpand}
                expandedRowKey={expandedRef}
                renderExpanded={(o) => {
                  const tickets = ticketsByOrder[o.order_ref];
                  return (
                    <div className={styles.detail}>
                      <dl className={styles.detailFacts}>
                        <div className={styles.detailItem}>
                          <dt>Terminal</dt>
                          <dd>{terminalLabel(o)}</dd>
                        </div>
                        {o.cpf && (
                          <div className={styles.detailItem}>
                            <dt>CPF</dt>
                            <dd className={styles.detailMono}>{maskCpf(o.cpf)}</dd>
                          </div>
                        )}
                      </dl>
                      {!tickets ? (
                        <span className={styles.muted}>Carregando tickets…</span>
                      ) : (
                        <table className={styles.ticketTable}>
                          <thead>
                            <tr>
                              <th className={styles.ticketTh}>Código</th>
                              <th className={styles.ticketTh}>Unidade</th>
                              <th className={styles.ticketTh}>Status</th>
                              <th className={styles.ticketTh}>Coletado por</th>
                              <th className={styles.ticketTh}>Coletado em</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tickets.map((t) => (
                              <tr key={t.ticket_code}>
                                <td className={`${styles.ticketTd} ${styles.detailMono}`}>{t.ticket_code}</td>
                                <td className={styles.ticketTd}>{t.unit_number}/{t.total_units}</td>
                                <td className={styles.ticketTd}>
                                  <Tag variant={t.status === "collected" ? "success" : "neutral"}>{t.status}</Tag>
                                </td>
                                <td className={styles.ticketTd}>{t.collected_by ?? "—"}</td>
                                <td className={styles.ticketTd}>
                                  {t.collected_at ? new Date(t.collected_at).toLocaleString("pt-BR") : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                }}
              />
              <div className={styles.pager}>
                <span className={styles.pagerCount}>Mostrando {skip + 1}–{Math.min(skip + LIMIT, total)} de {total}</span>
                <Pagination
                  activePage={page}
                  itemsPerPage={LIMIT}
                  totalItemsCount={total}
                  onChange={(newPage) => setSkip((newPage - 1) * LIMIT)}
                />
              </div>
            </>
          ) : (
            <div className={styles.empty}>
              Nenhum pedido encontrado{hasFilter ? " para os filtros aplicados" : ""}.
            </div>
          )}
        </>
      )}
    </div>
  );
}
