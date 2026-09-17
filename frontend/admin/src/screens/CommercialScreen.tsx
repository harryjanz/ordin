import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Tab, Tabs } from "design-system";
import PriceTableListScreen from "./PriceTableListScreen";
import FiscalAddonPlanListScreen from "./FiscalAddonPlanListScreen";
// ORD-174 (revisão) — mesmo stylesheet/padrão de CompanyScreen e
// CatalogScreen pra título + abas (título estático, sem "eyebrow", troca de
// aba por estado local em vez de navegação de rota) — PlatformUsersScreen
// já reaproveita o mesmo arquivo pro mesmo padrão.
import styles from "./CompanyScreen.module.scss";

// ORD-174 (revisão pós-feedback) — antes eram 2 itens separados na sidebar
// ("Tabelas de preço" e "Add-on fiscal"). Usuário achou que virou poluição
// de menu pra dois catálogos que já são a mesma área de responsabilidade
// comercial (mesma persona, mesma tela "Plano" na empresa mostra os dois
// blocos juntos). Unificados numa aba só, mesmo padrão de Empresa/Catálogo:
// título fixo "Comercial", Tab/Tabs trocando estado local (não a URL). Só o
// tab INICIAL é lido da rota (pra "Voltar"/salvar dos formulários de
// criar/editar, que continuam navegando pra /commercial/price-tables ou
// /commercial/fiscal-addon-plans, abrir na aba certa).
export default function CommercialScreen() {
  const location = useLocation();
  const initialTab = location.pathname.startsWith("/commercial/fiscal-addon-plans") ? "fiscal" : "price-tables";
  const [tab, setTab] = useState<"price-tables" | "fiscal">(initialTab);

  return (
    <div className={styles.page}>
      <div className={styles.title}>Comercial</div>

      <div className={styles.tabs}>
        <Tabs activeTab={tab} onSelectTab={(v) => setTab(v as typeof tab)}>
          <Tab value="price-tables" label="Tabela de preço" />
          <Tab value="fiscal" label="Módulo fiscal" />
        </Tabs>
      </div>

      {tab === "price-tables" ? <PriceTableListScreen /> : <FiscalAddonPlanListScreen />}
    </div>
  );
}
