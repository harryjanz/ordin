import { useState, useEffect, Fragment } from "react";
import api from "../api";
import type { Order, Ticket } from "../types";

const STATUS_COLOR: Record<string, string> = {
  pending:   "#f59e0b",
  completed: "#33cccc",
  cancelled: "#ff4d6d",
};

const S = {
  page: { padding: 32, color: "var(--a-text)" } as React.CSSProperties,
  title: { fontSize: 22, fontWeight: 700, marginBottom: 20 } as React.CSSProperties,
  filters: { display: "flex", gap: 12, marginBottom: 20 } as React.CSSProperties,
  select: {
    padding: "6px 12px",
    background: "var(--a-surface)",
    border: "1px solid rgba(153,0,255,0.3)",
    borderRadius: 6,
    color: "var(--a-text)",
    fontSize: 13,
  } as React.CSSProperties,
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
  statusBadge: (status: string) => ({
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    background: `${STATUS_COLOR[status] ?? "#888"}22`,
    color: STATUS_COLOR[status] ?? "#888",
  } as React.CSSProperties),
  expandBtn: {
    padding: "3px 10px",
    background: "rgba(153,0,255,0.1)",
    border: "none",
    borderRadius: 4,
    color: "var(--a-text)",
    fontSize: 12,
    cursor: "pointer",
  } as React.CSSProperties,
  ticketPanel: {
    background: "rgba(153,0,255,0.05)",
    border: "1px solid rgba(153,0,255,0.12)",
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
    marginBottom: 8,
  } as React.CSSProperties,
};

export default function OrdersScreen() {
  const [status, setStatus] = useState("all");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Record<string, Ticket[]>>({});

  useEffect(() => { load(); }, [status]);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get(`/orders?status=${status}&limit=100`);
      setOrders(r.data.orders ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function toggleExpand(ref: string) {
    if (expanded === ref) { setExpanded(null); return; }
    setExpanded(ref);
    if (!tickets[ref]) {
      const r = await api.get(`/orders/${ref}/tickets`);
      setTickets((prev) => ({ ...prev, [ref]: r.data.tickets ?? [] }));
    }
  }

  return (
    <div style={S.page}>
      <div style={S.title}>Pedidos</div>
      <div style={S.filters}>
        <select style={S.select} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Todos</option>
          <option value="pending">Pendentes</option>
          <option value="completed">Concluídos</option>
          <option value="cancelled">Cancelados</option>
        </select>
      </div>

      {loading ? (
        <div style={{ color: "rgba(var(--a-text-rgb),0.4)" }}>Carregando…</div>
      ) : (
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Referência</th>
              <th style={S.th}>Status</th>
              <th style={S.th}>Total</th>
              <th style={S.th}>Terminal</th>
              <th style={S.th}>Tickets</th>
              <th style={S.th}>Criado em</th>
              <th style={S.th}></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <Fragment key={o.order_ref}>
                <tr>
                  <td style={{ ...S.td, fontFamily: "monospace" }}>{o.order_ref}</td>
                  <td style={S.td}>
                    <span style={S.statusBadge(o.status)}>{o.status}</span>
                  </td>
                  <td style={S.td}>
                    {o.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </td>
                  <td style={S.td}>Terminal {o.terminal_id}</td>
                  <td style={S.td}>{o.tickets_collected}/{o.tickets_total}</td>
                  <td style={S.td} title={o.created_at}>
                    {new Date(o.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td style={S.td}>
                    <button style={S.expandBtn} onClick={() => toggleExpand(o.order_ref)}>
                      {expanded === o.order_ref ? "Fechar" : "Tickets"}
                    </button>
                  </td>
                </tr>
                {expanded === o.order_ref && (
                  <tr>
                    <td colSpan={7} style={{ padding: "0 12px 8px" }}>
                      <div style={S.ticketPanel}>
                        {(tickets[o.order_ref] ?? []).length === 0 ? (
                          <span style={{ color: "rgba(var(--a-text-rgb),0.4)", fontSize: 13 }}>Carregando tickets…</span>
                        ) : (
                          <table style={{ ...S.table, fontSize: 12 }}>
                            <thead>
                              <tr>
                                <th style={S.th}>Código</th>
                                <th style={S.th}>Unidade</th>
                                <th style={S.th}>Status</th>
                                <th style={S.th}>Coletado por</th>
                                <th style={S.th}>Coletado em</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tickets[o.order_ref].map((t) => (
                                <tr key={t.ticket_code}>
                                  <td style={{ ...S.td, fontFamily: "monospace" }}>{t.ticket_code}</td>
                                  <td style={S.td}>{t.unit_number}/{t.total_units}</td>
                                  <td style={S.td}>
                                    <span style={{
                                      color: t.status === "collected" ? "#33cccc" : "#f59e0b",
                                      fontWeight: 600,
                                    }}>
                                      {t.status}
                                    </span>
                                  </td>
                                  <td style={S.td}>{t.collected_by ?? "—"}</td>
                                  <td style={S.td}>
                                    {t.collected_at ? new Date(t.collected_at).toLocaleString("pt-BR") : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
      {!loading && orders.length === 0 && (
        <div style={{ color: "rgba(var(--a-text-rgb),0.35)", fontSize: 14, marginTop: 24 }}>
          Nenhum pedido encontrado.
        </div>
      )}
    </div>
  );
}
