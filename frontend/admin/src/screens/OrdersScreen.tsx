import { useState, useEffect, Fragment } from "react";
import { Button, Dropdown, Tag, type DropdownOptions, type TagProps } from "design-system";
import api from "../api";
import type { Order, Ticket } from "../types";
import styles from "./OrdersScreen.module.scss";

const STATUS_VARIANT: Record<string, TagProps["variant"]> = {
  pending: "warning",
  completed: "success",
  cancelled: "error",
};

const STATUS_OPTIONS: DropdownOptions[] = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendentes" },
  { value: "completed", label: "Concluídos" },
  { value: "cancelled", label: "Cancelados" },
];

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
    <div className={styles.page}>
      <div className={styles.title}>Pedidos</div>
      <div className={styles.filters}>
        <Dropdown
          value={STATUS_OPTIONS.find((o) => o.value === status) ?? STATUS_OPTIONS[0]}
          onValueSelected={(opt) => setStatus(opt.value)}
          options={STATUS_OPTIONS}
        />
      </div>

      {loading ? (
        <div className={styles.muted}>Carregando…</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Referência</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th}>Total</th>
              <th className={styles.th}>Terminal</th>
              <th className={styles.th}>Tickets</th>
              <th className={styles.th}>Criado em</th>
              <th className={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <Fragment key={o.order_ref}>
                <tr>
                  <td className={`${styles.td} ${styles.mono}`}>{o.order_ref}</td>
                  <td className={styles.td}>
                    <Tag variant={STATUS_VARIANT[o.status] ?? "neutral"}>{o.status}</Tag>
                  </td>
                  <td className={styles.td}>
                    {o.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </td>
                  <td className={styles.td}>Terminal {o.terminal_id}</td>
                  <td className={styles.td}>{o.tickets_collected}/{o.tickets_total}</td>
                  <td className={styles.td} title={o.created_at}>
                    {new Date(o.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td className={styles.td}>
                    <Button variant="secondary" size="small" onClick={() => toggleExpand(o.order_ref)}>
                      {expanded === o.order_ref ? "Fechar" : "Tickets"}
                    </Button>
                  </td>
                </tr>
                {expanded === o.order_ref && (
                  <tr>
                    <td colSpan={7} className={styles.ticketCell}>
                      <div className={styles.ticketPanel}>
                        {(tickets[o.order_ref] ?? []).length === 0 ? (
                          <span className={styles.ticketLoading}>Carregando tickets…</span>
                        ) : (
                          <table className={styles.table}>
                            <thead>
                              <tr>
                                <th className={styles.th}>Código</th>
                                <th className={styles.th}>Unidade</th>
                                <th className={styles.th}>Status</th>
                                <th className={styles.th}>Coletado por</th>
                                <th className={styles.th}>Coletado em</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tickets[o.order_ref].map((t) => (
                                <tr key={t.ticket_code}>
                                  <td className={`${styles.td} ${styles.mono}`}>{t.ticket_code}</td>
                                  <td className={styles.td}>{t.unit_number}/{t.total_units}</td>
                                  <td className={styles.td}>
                                    <span className={`${styles.ticketStatus} ${t.status === "collected" ? styles.ticketStatusCollected : styles.ticketStatusPending}`}>
                                      {t.status}
                                    </span>
                                  </td>
                                  <td className={styles.td}>{t.collected_by ?? "—"}</td>
                                  <td className={styles.td}>
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
        <div className={styles.empty}>Nenhum pedido encontrado.</div>
      )}
    </div>
  );
}
