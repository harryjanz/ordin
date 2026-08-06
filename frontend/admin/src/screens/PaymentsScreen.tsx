import { useState, useEffect } from "react";
import api from "../api";
import type { Transaction } from "../types";

const STATUS_COLOR: Record<string, string> = {
  approved:  "#33cccc",
  refused:   "#ff4d6d",
  cancelled: "#f59e0b",
  pending:   "#888",
};

const S = {
  page: { padding: 32, color: "var(--a-text)" } as React.CSSProperties,
  title: { fontSize: 22, fontWeight: 700, marginBottom: 20 } as React.CSSProperties,
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  th: {
    textAlign: "left" as const,
    padding: "8px 12px",
    borderBottom: "1px solid rgba(153,0,255,0.15)",
    color: "rgba(var(--a-text-rgb),0.5)",
    fontWeight: 500,
  } as React.CSSProperties,
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid rgba(153,0,255,0.08)",
  } as React.CSSProperties,
  badge: (status: string) => ({
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    background: `${STATUS_COLOR[status] ?? "#888"}22`,
    color: STATUS_COLOR[status] ?? "#888",
  } as React.CSSProperties),
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

  return (
    <div style={S.page}>
      <div style={S.title}>Transações TEF</div>
      {loading ? (
        <div style={{ color: "rgba(var(--a-text-rgb),0.4)" }}>Carregando…</div>
      ) : (
        <>
          <div style={{
            background: "var(--a-surface)",
            border: "1px solid rgba(153,0,255,0.2)",
            borderRadius: 10,
            padding: "16px 20px",
            marginBottom: 24,
            display: "inline-block",
          }}>
            <div style={{ fontSize: 12, color: "rgba(var(--a-text-rgb),0.5)", marginBottom: 4 }}>
              Total aprovado ({transactions.filter((t) => t.status === "approved").length} transações)
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#33cccc" }}>
              {totalApproved.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </div>
          </div>

          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>ID</th>
                <th style={S.th}>Pedido</th>
                <th style={S.th}>Método</th>
                <th style={S.th}>Valor</th>
                <th style={S.th}>Status</th>
                <th style={S.th}>Provider</th>
                <th style={S.th}>NSU</th>
                <th style={S.th}>Data</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td style={S.td}>{t.id}</td>
                  <td style={{ ...S.td, fontFamily: "monospace" }}>{t.order_ref}</td>
                  <td style={S.td}>{t.method}</td>
                  <td style={S.td}>
                    {t.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </td>
                  <td style={S.td}>
                    <span style={S.badge(t.status)}>{t.status}</span>
                  </td>
                  <td style={S.td}>{t.provider}</td>
                  <td style={{ ...S.td, fontFamily: "monospace" }}>{t.nsu ?? "—"}</td>
                  <td style={S.td}>{new Date(t.created_at).toLocaleString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {transactions.length === 0 && (
            <div style={{ color: "rgba(var(--a-text-rgb),0.35)", fontSize: 14, marginTop: 24 }}>
              Nenhuma transação encontrada.
            </div>
          )}
        </>
      )}
    </div>
  );
}
