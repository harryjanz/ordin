import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Tab, Tabs } from "design-system";
import SupplierListScreen from "./SupplierListScreen";
import SupplierInvoiceScreen from "./SupplierInvoiceScreen";
import PendingItemsScreen from "./PendingItemsScreen";
// ORD-194 (B1) — mesmo padrão de CommercialScreen.tsx (ORD-174): consolida
// telas do domínio "Estoque" sob um item de sidebar só, com abas trocando
// por estado local (não navegação de rota). Gatilho já registrado desde A6
// (ORD-182) — "Fornecedores" sozinha não justificava abas; "Notas de
// compra" (B1) é a segunda tela que justifica a consolidação. "Pendências"
// (C2, ORD-196) é a terceira.
import styles from "./CompanyScreen.module.scss";

export default function EstoqueScreen() {
  const location = useLocation();
  const initialTab = location.pathname.startsWith("/stock/pending")
    ? "pending"
    : location.pathname.startsWith("/stock/invoices")
      ? "invoices"
      : "suppliers";
  const [tab, setTab] = useState<"suppliers" | "invoices" | "pending">(initialTab);

  return (
    <div className={styles.page}>
      <div className={styles.title}>Estoque</div>

      <div className={styles.tabs}>
        <Tabs activeTab={tab} onSelectTab={(v) => setTab(v as typeof tab)}>
          <Tab value="suppliers" label="Fornecedores" />
          <Tab value="invoices" label="Notas de compra" />
          <Tab value="pending" label="Pendências" />
        </Tabs>
      </div>

      {tab === "suppliers" && <SupplierListScreen />}
      {tab === "invoices" && <SupplierInvoiceScreen />}
      {tab === "pending" && <PendingItemsScreen />}
    </div>
  );
}
