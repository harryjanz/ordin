import { useState, useEffect } from "react";
import api from "../api";
import { useStore } from "../store";
import type { Company, Order, Transaction } from "../types";

const S = {
  page: { padding: 32, color: "#DFE8ED" } as React.CSSProperties,
  title: { fontSize: 22, fontWeight: 700, marginBottom: 24, color: "#DFE8ED" } as React.CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 16, marginBottom: 32 } as React.CSSProperties,
  card: {
    background: "#1d1434",
    border: "1px solid rgba(153,0,255,0.2)",
    borderRadius: 12,
    padding: "20px 24px",
  } as React.CSSProperties,
  cardLabel: { fontSize: 12, color: "rgba(223,232,237,0.5)", marginBottom: 8 } as React.CSSProperties,
  cardValue: { fontSize: 28, fontWeight: 700, color: "#9900ff" } as React.CSSProperties,
  section: { marginBottom: 32 } as React.CSSProperties,
  sectionTitle: { fontSize: 15, fontWeight: 600, color: "rgba(223,232,237,0.8)", marginBottom: 12 } as React.CSSProperties,
  select: {
    padding: "6px 12px",
    background: "#1d1434",
    border: "1px solid rgba(153,0,255,0.3)",
    borderRadius: 6,
    color: "#DFE8ED",
    fontSize: 13,
    marginBottom: 20,
  } as React.CSSProperties,
};

export default function DashboardScreen() {
  const { role, selectedCompanyId, setSelectedCompany } = useStore();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (role === "admin") {
      api.get("/companies").then((r) => setCompanies(r.data.items ?? r.data)).catch(() => null);
    }
  }, [role]);

  useEffect(() => {
    if (!selectedCompanyId) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      api.get(`/orders?status=all&limit=100`).catch(() => ({ data: { orders: [] } })),
      api.get(`/payments`).catch(() => ({ data: { items: [] } })),
    ]).then(([oRes, pRes]) => {
      setOrders(oRes.data.orders ?? []);
      setTransactions(pRes.data.items ?? []);
    }).finally(() => setLoading(false));
  }, [selectedCompanyId]);

  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const completedToday = orders.filter((o) => {
    const d = new Date(o.created_at);
    const now = new Date();
    return (
      o.status === "completed" &&
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }).length;
  const totalRevenue = transactions
    .filter((t) => t.status === "approved")
    .reduce((acc, t) => acc + t.amount, 0);

  return (
    <div style={S.page}>
      <div style={S.title}>Dashboard</div>

      {role === "admin" && companies.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Empresa</div>
          <select
            style={S.select}
            value={selectedCompanyId ?? ""}
            onChange={(e) => setSelectedCompany(Number(e.target.value))}
          >
            <option value="">Selecionar empresa…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div style={{ color: "rgba(223,232,237,0.4)" }}>Carregando…</div>
      ) : (
        <>
          <div style={S.grid}>
            <div style={S.card}>
              <div style={S.cardLabel}>Pedidos pendentes</div>
              <div style={S.cardValue}>{pendingCount}</div>
            </div>
            <div style={S.card}>
              <div style={S.cardLabel}>Concluídos hoje</div>
              <div style={S.cardValue}>{completedToday}</div>
            </div>
            <div style={S.card}>
              <div style={S.cardLabel}>Faturamento aprovado</div>
              <div style={{ ...S.cardValue, fontSize: 22 }}>
                {totalRevenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </div>
            </div>
            <div style={S.card}>
              <div style={S.cardLabel}>Total de pedidos</div>
              <div style={S.cardValue}>{orders.length}</div>
            </div>
          </div>

          {orders.length === 0 && (
            <div style={{ color: "rgba(223,232,237,0.35)", fontSize: 14 }}>
              Nenhum pedido encontrado para esta empresa.
            </div>
          )}
        </>
      )}
    </div>
  );
}
