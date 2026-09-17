import { useLocation, useNavigate } from "react-router-dom";
import { Tab, Tabs } from "design-system";
import PriceTableListScreen from "./PriceTableListScreen";
import FiscalAddonPlanListScreen from "./FiscalAddonPlanListScreen";
import styles from "./CompanyListScreen.module.scss";

// ORD-174 (revisão pós-feedback) — antes eram 2 itens separados na sidebar
// ("Tabelas de preço" e "Add-on fiscal"). Usuário achou que virou poluição
// de menu pra dois catálogos que já são a mesma área de responsabilidade
// comercial (mesma persona, mesma tela "Plano" na empresa mostra os dois
// blocos juntos). Unificados numa aba só, mesmo padrão já usado em
// CompanyScreen (Tab/Tabs pra sub-áreas dentro de uma tela). Rota decide
// qual conteúdo mostrar — mesmas URLs de antes continuam funcionando como
// deep link, os formulários de criar/editar não precisaram mudar nada.
export default function CommercialScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const tab = location.pathname.startsWith("/commercial/fiscal-addon-plans") ? "fiscal" : "price-tables";

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <div className={styles.eyebrow}>Comercial</div>
          <h1 className={styles.title}>{tab === "fiscal" ? "Add-on fiscal" : "Tabelas de preço"}</h1>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <Tabs
          activeTab={tab}
          onSelectTab={(v) => navigate(v === "fiscal" ? "/commercial/fiscal-addon-plans" : "/commercial/price-tables")}
        >
          {[
            <Tab key="price-tables" value="price-tables" label="Tabela de preço" />,
            <Tab key="fiscal" value="fiscal" label="Add-on fiscal" />,
          ]}
        </Tabs>
      </div>

      {tab === "price-tables" ? <PriceTableListScreen /> : <FiscalAddonPlanListScreen />}
    </div>
  );
}
