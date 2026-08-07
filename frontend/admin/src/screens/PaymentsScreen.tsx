import { useState, useEffect } from "react";
import { Tag, type TagProps } from "design-system";
import api from "../api";
import Table, { type TableColumn } from "../components/Table";
import type { Transaction } from "../types";
import styles from "./PaymentsScreen.module.scss";

const STATUS_VARIANT: Record<string, TagProps["variant"]> = {
  approved: "success",
  refused: "error",
  cancelled: "warning",
  pending: "neutral",
};

export default function PaymentsScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/payments")
      .then((r) => setTransactions(r.data.items ?? []))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const totalApproved = transactions
    .filter((t) => t.status === "approved")
    .reduce((acc, t) => acc + t.amount, 0);

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
    </div>
  );
}
