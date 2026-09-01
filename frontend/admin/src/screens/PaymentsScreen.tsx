import { useState, useEffect, useRef } from "react";
import { Button, DateInput, Dropdown, Pagination, Skeleton, Tag, TextArea, makeToast, type DropdownOptions, type TagProps } from "design-system";
import { listPayments, cancelPayment, refundPayment } from "../api/payments";
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
  refunded: "warning",
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
  { value: "refunded", label: "Reembolsado" },
];

const ENVIRONMENT_OPTIONS: DropdownOptions[] = [
  { value: "", label: "Todos" },
  { value: "sandbox", label: "Sandbox" },
  { value: "production", label: "Produção" },
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

// Mesmo formato que o DateInput usa internamente pra comparar minDate/maxDate
// (parseDate em DateInput.js) — T00:00:00 local, não UTC.
function toDate(brDate: string): Date | undefined {
  const iso = toIsoDate(brDate);
  return iso ? new Date(`${iso}T00:00:00`) : undefined;
}

function toBrDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getFullYear()}`;
}

// Padrão de 30 dias (ORD-104) — sem isso a tela carrega o histórico
// inteiro por padrão, que fica pesado conforme o volume de transações
// cresce. Usuário continua livre pra alargar editando os campos.
function defaultDateFromBr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return toBrDate(d);
}

function defaultDateToBr(): string {
  return toBrDate(new Date());
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

// ORD-147 — transação Mercado Pago já aprovada é sempre um caso de
// REEMBOLSO (cobrança já capturada), nunca de cancelamento.
function canRefund(t: Transaction): boolean {
  return t.status === "approved" && t.provider === "mercadopago";
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

// Prazo de reembolso via API — específico da integração Mercado Pago (Orders
// API pra cartão, Payments API pra PIX), confirmado na documentação oficial
// do MP. NÃO é uma regra genérica de reembolso — outro provider que vier a
// implementar reembolso (Stone/Pagar.me/Adyen) precisa da própria constante,
// com o próprio prazo. Checagem local só pra avisar antes de tentar, o
// backend segue sendo a fonte da verdade (422).
const MP_REFUND_WINDOW_DAYS: Record<string, number> = { credit: 90, debit: 90, pix: 180 };

function isMpRefundExpired(t: Transaction): boolean {
  if (t.provider !== "mercadopago") return false;
  const limitDays = MP_REFUND_WINDOW_DAYS[t.method] ?? 90;
  const elapsedMs = Date.now() - new Date(t.created_at).getTime();
  return elapsedMs > limitDays * 24 * 60 * 60 * 1000;
}

export default function PaymentsScreen() {
  const role = useStore((s) => s.role);
  // superadmin e admin são equivalentes (gestão da plataforma, ver
  // docs/ARQUITETURA.md §1.2) — os dois enxergam/filtram por qualquer empresa.
  const isPlatformAdmin = role === "superadmin" || role === "admin";

  // ORD-082: valor de SESSÃO compartilhado (não useState local) — selecionar
  // uma empresa aqui, em Pedidos ou em Configurações vale nas outras telas
  // ao navegar, e o badge no canto superior direito mostra/permite limpar.
  const companyId = useStore((s) => s.selectedCompanyId);
  const setSelectedCompany = useStore((s) => s.setSelectedCompany);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [dateFrom, setDateFrom] = useState(defaultDateFromBr);
  const [dateTo, setDateTo] = useState(defaultDateToBr);
  const [provider, setProvider] = useState("");
  const [status, setStatus] = useState("");
  const [environment, setEnvironment] = useState("");
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

  // ORD-147 — generalizado pra guardar qual ação disparar (cancelamento
  // pré-captura ou reembolso pós-captura), mesmo padrão de estado
  // bidirecional já usado no toggle ativar/desativar opção (ORD-145).
  const [actionTarget, setActionTarget] = useState<{ tx: Transaction; kind: "cancel" | "refund" } | null>(null);
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
    if (isPlatformAdmin) {
      listCompanies({ limit: 200 }).then((r) => setCompanies(r.companies)).catch(() => null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatformAdmin]);

  useEffect(() => {
    fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, dateFrom, dateTo, provider, status, environment, skip]);

  function fetchTransactions() {
    setLoading(true);
    return listPayments({
      companyId: companyId ?? undefined,
      dateFrom: toIsoDate(dateFrom),
      dateTo: toIsoDate(dateTo),
      provider: provider || undefined,
      status: status || undefined,
      environment: environment || undefined,
      skip,
      limit: LIMIT,
    })
      .then((r) => { setTransactions(r.items); setTotal(r.total); setSummary(r.summary); })
      .catch(() => null)
      .finally(() => setLoading(false));
  }

  // O DateInput só revalida minDate/maxDate contra o valor atual quando o
  // próprio campo muda (digitação/calendário) — não reage a um novo `minDate`
  // vindo via prop. Sem isso, mudar "De" pra depois de um "Até" já escolhido
  // deixaria os dois inconsistentes sem nenhum aviso.
  function handleDateFromChange(value: string, valid: boolean) {
    if (!valid && value) return;
    setDateFrom(value);
    const from = toDate(value);
    const to = toDate(dateTo);
    if (from && to && to < from) setDateTo("");
    setSkip(0);
  }

  function clearFilters() {
    // Só superadmin/admin têm um seletor de empresa nesta tela (dropdown
    // "Todas as empresas" abaixo) — pra owner/manager/cashier,
    // selectedCompanyId vem só do login e não tem como ser reescolhido na
    // UI. Zerar incondicionalmente aqui deixava esses papéis sem empresa
    // nenhuma até fazer logout/login de novo (bug real, achado ao vivo).
    if (isPlatformAdmin) setSelectedCompany(null);
    // Data volta pro padrão de 30 dias, não fica sem filtro — "Limpar"
    // nunca deve reintroduzir sem querer o carregamento do histórico
    // inteiro (ver ORD-104).
    setDateFrom(defaultDateFromBr());
    setDateTo(defaultDateToBr());
    setProvider("");
    setStatus("");
    setEnvironment("");
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

  const hasFilter = Boolean(companyId || dateFrom || dateTo || provider || status || environment);
  const page = Math.floor(skip / LIMIT) + 1;

  const companyOptions: DropdownOptions[] = [
    { value: "", label: "Todas as empresas" },
    ...companies.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  function openCancel(t: Transaction) {
    setActionTarget({ tx: t, kind: "cancel" });
    setReason("contestacao");
  }

  function openRefund(t: Transaction) {
    setActionTarget({ tx: t, kind: "refund" });
    setReason("contestacao");
  }

  function closeAction() {
    if (submitting) return;
    setActionTarget(null);
  }

  async function confirmAction() {
    if (!actionTarget) return;
    const { tx, kind } = actionTarget;
    const reasonLabel = CANCEL_REASONS.find((r) => r.value === reason)?.label ?? reason;
    const reasonText = reason === "outro" ? (otherReasonRef.current?.value.trim() ?? "") : reasonLabel;
    if (reason === "outro" && !reasonText) {
      makeToast("error", kind === "refund" ? "Descreva o motivo do estorno." : "Descreva o motivo do cancelamento.");
      return;
    }

    setSubmitting(true);
    try {
      if (kind === "refund") {
        await refundPayment(tx.id, { reason: reasonText });
        makeToast("success", "Transação estornada — o valor será devolvido ao cliente pelo Mercado Pago");
      } else {
        await cancelPayment(tx.id, { reason: reasonText });
        makeToast("success", "Transação cancelada");
      }
      setActionTarget(null);
      // Refaz a busca em vez de só corrigir a linha local — cancelar/estornar
      // muda os cards de resumo, que só vêm de listPayments.
      fetchTransactions();
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const action = kind === "refund" ? "estornar" : "cancelar";
      const msg =
        status === 404 ? "Transação não encontrada — pode já ter sido alterada por outra sessão."
        : status === 403 ? `Você não tem permissão para ${action} transações.`
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
          <span title={t.status === "cancelled" ? (t.cancel_reason ?? undefined) : t.status === "refunded" ? (t.refund_reason ?? undefined) : undefined}>{t.status}</span>
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
        ) : canRefund(t) ? (
          <Button size="small" variant="secondary" style={DANGER_BTN_STYLE} onClick={() => openRefund(t)}>
            Estornar
          </Button>
        ) : (
          <span className={styles.muted}>—</span>
        ),
    },
  ];

  const scopeNote = isPlatformAdmin
    ? (companyId ? companyOptions.find((o) => o.value === String(companyId))?.label : "Todas as empresas")
    : null;

  const sameDayBlocked = actionTarget?.kind === "cancel" ? isPaygoBlocked(actionTarget.tx) : false;
  const refundExpired = actionTarget?.kind === "refund" ? isMpRefundExpired(actionTarget.tx) : false;

  return (
    <div className={styles.page}>
      <div className={styles.title}>Transações</div>
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
        <div className={styles.field}>
          <Dropdown
            label="Ambiente"
            value={ENVIRONMENT_OPTIONS.find((o) => o.value === environment) ?? ENVIRONMENT_OPTIONS[0]}
            onValueSelected={(opt) => { setEnvironment(opt.value); setSkip(0); }}
            options={ENVIRONMENT_OPTIONS}
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
              Nenhuma transação encontrada{hasFilter ? " para os filtros aplicados" : ""}.
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!actionTarget}
        title={actionTarget?.kind === "refund" ? "Estornar transação" : "Cancelar transação"}
        message={
          sameDayBlocked
            ? "Transação PayGo de dia anterior — cancelamento só é permitido no mesmo dia da venda. Fale com o suporte da adquirente pra estornar esta."
            : refundExpired && actionTarget
            ? `Este pagamento foi aprovado há mais de ${MP_REFUND_WINDOW_DAYS[actionTarget.tx.method] ?? 90} dias — o Mercado Pago pode recusar o reembolso via API. Você pode tentar mesmo assim, ou reembolsar diretamente pelo painel do Mercado Pago.`
            : actionTarget?.kind === "refund"
            ? "A cobrança já foi capturada — ao confirmar, o valor será devolvido ao cliente pelo Mercado Pago."
            : "Essa ação não pode ser desfeita pelo admin — o valor volta pro cliente de acordo com o provider."
        }
        confirmLabel={actionTarget?.kind === "refund" ? "Confirmar estorno" : "Confirmar cancelamento"}
        onConfirm={confirmAction}
        onCancel={closeAction}
        alertVariant={sameDayBlocked || refundExpired ? "warning" : undefined}
        alertIcon={sameDayBlocked || refundExpired ? "alert-triangle" : undefined}
        confirmDisabled={submitting}
      >
        {actionTarget && (
          <div className={styles.cancelForm}>
            <dl className={styles.cancelSummary}>
              <dt>Pedido</dt><dd>{actionTarget.tx.order_ref}</dd>
              <dt>Valor</dt><dd>{actionTarget.tx.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</dd>
              <dt>Provider</dt><dd>{actionTarget.tx.provider}</dd>
              <dt>Data</dt><dd>{new Date(actionTarget.tx.created_at).toLocaleString("pt-BR")}</dd>
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
