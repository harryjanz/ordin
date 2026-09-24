import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Dropdown, Tab, Tabs, type DropdownOptions } from "design-system";
import { listCompanies } from "../api/companies";
import { useStore } from "../store";
import type { Company } from "../types";
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

// Achado ao vivo (revisão de urgência, 2026-09-24): diferente de
// CatalogScreen.tsx e SettingsScreen.tsx, esta tela nunca ganhou o seletor
// de empresa pra superadmin/admin — só dependia de a seleção já ter sido
// feita em outra tela (ex: Empresas). Sem seletor aqui, superadmin/admin
// que entra direto em Estoque não tem nenhuma forma de escolher a empresa,
// e as 3 abas caem no erro cru "company_id é obrigatório" (ou, antes da
// correção de reatividade, mostravam dado da empresa selecionada
// anteriormente). Mesmo padrão de Dropdown + estado vazio de
// CatalogScreen.tsx/SettingsScreen.tsx.
export default function EstoqueScreen() {
  const location = useLocation();
  const initialTab = location.pathname.startsWith("/stock/pending")
    ? "pending"
    : location.pathname.startsWith("/stock/invoices")
      ? "invoices"
      : "suppliers";
  const [tab, setTab] = useState<"suppliers" | "invoices" | "pending">(initialTab);

  const role = useStore((s) => s.role);
  const isPlatformAdmin = role === "superadmin" || role === "admin";
  const companyId = useStore((s) => s.selectedCompanyId);
  const setSelectedCompany = useStore((s) => s.setSelectedCompany);
  const hasCompanyContext = !isPlatformAdmin || !!companyId;

  const [companies, setCompanies] = useState<Company[]>([]);
  useEffect(() => {
    if (isPlatformAdmin) {
      listCompanies({ limit: 200 }).then((r) => setCompanies(r.companies)).catch(() => null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatformAdmin]);
  const companyOptions: DropdownOptions[] = companies.map((c) => ({ value: String(c.id), label: c.name }));

  return (
    <div className={styles.page}>
      <div className={styles.title}>Estoque</div>

      {isPlatformAdmin && (
        <div className={styles.companySelector}>
          <Dropdown
            label="Empresa"
            placeholder="Selecionar empresa…"
            value={companyOptions.find((o) => o.value === String(companyId ?? "")) ?? null}
            onValueSelected={(opt) => setSelectedCompany(opt.value ? Number(opt.value) : null)}
            options={companyOptions}
          />
        </div>
      )}

      {!hasCompanyContext ? (
        <div className={styles.empty}>Selecione uma empresa para gerenciar o estoque.</div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
