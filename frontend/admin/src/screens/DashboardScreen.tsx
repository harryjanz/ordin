import { useState, useEffect } from "react";
import { Dropdown, Skeleton, type DropdownOptions } from "design-system";
import api from "../api";
import { useStore } from "../store";
import type { Company, Order, Transaction } from "../types";
import styles from "./DashboardScreen.module.scss";

export default function DashboardScreen() {
  const { role, selectedCompanyId, setSelectedCompany } = useStore();
  // superadmin e admin são equivalentes (gestão da plataforma, ver
  // docs/ARQUITETURA.md §1.2) — este check era "admin" sozinho, um role sem
  // nenhum usuário real no seed (achado do ORD-082), então o seletor de
  // empresa abaixo nunca aparecia pra ninguém de verdade.
  const isPlatformAdmin = role === "superadmin" || role === "admin";
  const [companies, setCompanies] = useState<Company[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isPlatformAdmin) {
      api.get("/companies").then((r) => setCompanies(r.data.companies ?? [])).catch(() => null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatformAdmin]);

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
  const paidToday = orders.filter((o) => {
    const d = new Date(o.created_at);
    const now = new Date();
    return (
      (o.status === "paid" || o.status === "completed") &&
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }).length;
  const totalRevenue = transactions
    .filter((t) => t.status === "approved")
    .reduce((acc, t) => acc + t.amount, 0);

  const companyOptions: DropdownOptions[] = companies.map((c) => ({ value: String(c.id), label: c.name }));
  const selectedOption = companyOptions.find((o) => o.value === String(selectedCompanyId ?? "")) ?? null;

  return (
    <div className={styles.page}>
      <div className={styles.title}>Dashboard</div>

      {isPlatformAdmin && companies.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Empresa</div>
          <Dropdown
            placeholder="Selecionar empresa…"
            value={selectedOption}
            onValueSelected={(opt) => setSelectedCompany(Number(opt.value))}
            options={companyOptions}
          />
        </div>
      )}

      {loading ? (
        <div className={styles.grid}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={styles.card}><Skeleton height={48} /></div>
          ))}
        </div>
      ) : (
        <>
          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardLabel}>Pedidos pendentes</div>
              <div className={styles.cardValue}>{pendingCount}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>Pagos hoje</div>
              <div className={styles.cardValue}>{paidToday}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>Faturamento aprovado</div>
              <div className={styles.cardValueSmall}>
                {totalRevenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>Total de pedidos</div>
              <div className={styles.cardValue}>{orders.length}</div>
            </div>
          </div>

          {orders.length === 0 && (
            <div className={styles.empty}>
              Nenhum pedido encontrado para esta empresa.
            </div>
          )}
        </>
      )}
    </div>
  );
}
