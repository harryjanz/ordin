import { useState, useEffect, useRef } from "react";
import { Button, DateInput, Dropdown, Skeleton, Tag, TextArea, makeToast, type DropdownOptions, type TagProps } from "design-system";
import { listPayments, cancelPayment } from "../api/payments";
import { listCompanies, listTerminals } from "../api/companies";
import { useStore } from "../store";
import { parseApiError } from "../lib/apiErrors";
import Table, { type TableColumn } from "../components/Table";
import ConfirmDialog from "../components/ConfirmDialog";
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

const CANCEL_REASONS: DropdownOptions[] = [
  { value: "contestacao", label: "Contestação do cliente" },
  { value: "erro_operacional", label: "Erro operacional" },
  { value: "duplicidade", label: "Duplicidade" },
  { value: "outro", label: "Outro" },
];

const DANGER_BTN_STYLE = { color: "var(--error-base)" };

function canCancel(t: Transaction): boolean {
  return t.status === "approved" && t.provider !== "mercadopago";
}

// PayGo só permite cancelar no mesmo dia da venda (regra do provider,
// ver services/payment/main.py cancel_payment) — checagem local só pra
// avisar antes de tentar, o backend segue sendo a fonte da verdade (422).
function isPaygoBlocked(t: Transaction): boolean {
  if (t.provider !== "paygo") return false;
  const created = new Date(t.created_at);
  const now = new Date();
  return created.toDateString() !== now.toDateString();
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

  const [cancelling, setCancelling] = useState<Transaction | null>(null);
  const [reason, setReason] = useState("contestacao");
  const [submitting, setSubmitting] = useState(false);
  // Não-controlado de propósito: o Modal do design system gera um id novo
  // (nanoid) a cada render e usa isso pra criar o nó do portal no DOM — um
  // <textarea> controlado por state, re-renderizado a cada tecla, faz o
  // portal inteiro ser recriado e perde o foco a cada caractere digitado.
  // Lendo o valor só na hora de confirmar evita re-renderizar o Modal
  // enquanto o usuário digita. Bug é do componente Modal (vendor/design-system,
  // Modal.tsx:46 — `identifier` não é memoizado), não algo pra corrigir aqui.
  const otherReasonRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isSuperadmin) {
      listCompanies({ limit: 200 }).then((r) => setCompanies(r.companies)).catch(() => null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperadmin]);

  useEffect(() => {
    fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, dateFrom, dateTo, provider, status, skip]);

  function fetchTransactions() {
    setLoading(true);
    return listPayments({
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
  }

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

  function openCancel(t: Transaction) {
    setCancelling(t);
    setReason("contestacao");
  }

  function closeCancel() {
    if (submitting) return;
    setCancelling(null);
  }

  async function confirmCancel() {
    if (!cancelling) return;
    const reasonLabel = CANCEL_REASONS.find((r) => r.value === reason)?.label ?? reason;
    const reasonText = reason === "outro" ? (otherReasonRef.current?.value.trim() ?? "") : reasonLabel;
    if (reason === "outro" && !reasonText) {
      makeToast("error", "Descreva o motivo do cancelamento.");
      return;
    }

    setSubmitting(true);
    try {
      await cancelPayment(cancelling.id, { reason: reasonText });
      makeToast("success", "Transação cancelada");
      setCancelling(null);
      // Refaz a busca em vez de só corrigir a linha local — cancelar muda os
      // cards de resumo (Aprovado -1 / Cancelado +1), que só vêm de listPayments.
      fetchTransactions();
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const msg =
        status === 404 ? "Transação não encontrada — pode já ter sido alterada por outra sessão."
        : status === 403 ? "Você não tem permissão para cancelar transações."
        : parseApiError(err).message;
      makeToast("error", msg);
    } finally {
      setSubmitting(false);
    }
  }

  const columns: TableColumn<Transaction>[] = [
    { key: "id", header: "ID", render: (t) => t.id },
    { key: "order_ref", header: "Pedido", mono: true, render: (t) => t.order_ref },
    { key: "method", header: "Método", render: (t) => t.method },
    { key: "amount", header: "Valor", render: (t) => t.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
    {
      key: "status", header: "Status", render: (t) => (
        <Tag variant={STATUS_VARIANT[t.status] ?? "neutral"}>
          <span title={t.status === "cancelled" ? (t.cancel_reason ?? undefined) : undefined}>{t.status}</span>
        </Tag>
      ),
    },
    { key: "provider", header: "Provider", render: (t) => t.provider },
    { key: "nsu", header: "NSU", mono: true, render: (t) => t.nsu ?? "—" },
    { key: "created_at", header: "Data", render: (t) => new Date(t.created_at).toLocaleString("pt-BR") },
    {
      key: "action", header: "Ação", render: (t) =>
        canCancel(t) ? (
          <Button size="small" variant="secondary" style={DANGER_BTN_STYLE} onClick={() => openCancel(t)}>
            Cancelar
          </Button>
        ) : (
          <span className={styles.muted}>—</span>
        ),
    },
  ];

  const scopeNote = isSuperadmin
    ? (companyId ? companyOptions.find((o) => o.value === String(companyId))?.label : "Todas as empresas")
    : null;

  const sameDayBlocked = cancelling ? isPaygoBlocked(cancelling) : false;

  return (
    <div className={styles.page}>
      <div className={styles.title}>Transações TEF</div>
      {scopeNote && <div className={styles.subtitle}>{scopeNote}</div>}

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
              <div className={styles.cardLabel}>
                <span>{card.label}</span>
                {!loading && <span className={styles.cardCount}>{count}</span>}
              </div>
              {loading ? (
                <Skeleton height={22} />
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

      {loading && transactions.length === 0 && total === 0 ? (
        <div className={styles.muted}>Carregando…</div>
      ) : (
        <>
          {transactions.length > 0 ? (
            <>
              <div className={styles.count}><b>{total}</b> transaç{total === 1 ? "ão" : "ões"} encontrada{total === 1 ? "" : "s"}</div>
              <Table
                variant="compact"
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

      <ConfirmDialog
        open={!!cancelling}
        title="Cancelar transação"
        message={
          sameDayBlocked
            ? "Transação PayGo de dia anterior — cancelamento só é permitido no mesmo dia da venda. Fale com o suporte da adquirente pra estornar esta."
            : "Essa ação não pode ser desfeita pelo admin — o valor volta pro cliente de acordo com o provider."
        }
        confirmLabel="Confirmar cancelamento"
        onConfirm={confirmCancel}
        onCancel={closeCancel}
        alertVariant={sameDayBlocked ? "warning" : undefined}
        alertIcon={sameDayBlocked ? "alert-triangle" : undefined}
        confirmDisabled={submitting}
      >
        {cancelling && (
          <div className={styles.cancelForm}>
            <dl className={styles.cancelSummary}>
              <dt>Pedido</dt><dd>{cancelling.order_ref}</dd>
              <dt>Valor</dt><dd>{cancelling.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</dd>
              <dt>Provider</dt><dd>{cancelling.provider}</dd>
              <dt>Data</dt><dd>{new Date(cancelling.created_at).toLocaleString("pt-BR")}</dd>
            </dl>
            <Dropdown
              label="Motivo"
              value={CANCEL_REASONS.find((r) => r.value === reason) ?? CANCEL_REASONS[0]}
              onValueSelected={(opt) => setReason(opt.value)}
              options={CANCEL_REASONS}
            />
            {reason === "outro" && (
              <div className={styles.cancelOtherReason}>
                <TextArea
                  ref={otherReasonRef}
                  label="Descreva o motivo"
                  placeholder="Descreva o motivo…"
                />
              </div>
            )}
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
