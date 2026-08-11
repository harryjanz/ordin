import { useState, useEffect, useRef } from "react";
import { Button, Dropdown, Tag, TextArea, makeToast, type DropdownOptions, type TagProps } from "design-system";
import api from "../api";
import { parseApiError } from "../lib/apiErrors";
import Table, { type TableColumn } from "../components/Table";
import ConfirmDialog from "../components/ConfirmDialog";
import type { Transaction } from "../types";
import styles from "./PaymentsScreen.module.scss";

const STATUS_VARIANT: Record<string, TagProps["variant"]> = {
  approved: "success",
  refused: "error",
  cancelled: "warning",
  pending: "neutral",
};

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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

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
    api.get("/payments")
      .then((r) => setTransactions(r.data.items ?? []))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const totalApproved = transactions
    .filter((t) => t.status === "approved")
    .reduce((acc, t) => acc + t.amount, 0);

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
      await api.post(`/payments/${cancelling.id}/cancel`, { reason: reasonText });
      setTransactions((prev) =>
        prev.map((t) => (t.id === cancelling.id ? { ...t, status: "cancelled", cancel_reason: reasonText } : t))
      );
      makeToast("success", "Transação cancelada");
      setCancelling(null);
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
          <span title={t.status === "cancelled" ? t.cancel_reason : undefined}>{t.status}</span>
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

  const sameDayBlocked = cancelling ? isPaygoBlocked(cancelling) : false;

  return (
    <div className={styles.page}>
      <div className={styles.title}>Transações TEF</div>
      {loading ? (
        <div className={styles.muted}>Carregando…</div>
      ) : (
        <>
          <div className={styles.summary}>
            <div className={styles.summaryLabel}>
              Total aprovado ({transactions.filter((t) => t.status === "approved").length} transações)
            </div>
            <div className={styles.summaryValue}>
              {totalApproved.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </div>
          </div>

          {transactions.length > 0 ? (
            <Table columns={columns} rows={transactions} rowKey={(t) => t.id} />
          ) : (
            <div className={styles.empty}>Nenhuma transação encontrada.</div>
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
