import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ToastContainer } from "design-system";
import { useStore } from "./store";
import styles from "./App.module.scss";
import Sidebar from "./components/Sidebar";
import ActiveCompanyBadge from "./components/ActiveCompanyBadge";
import LoginScreen from "./screens/LoginScreen";
import SetPasswordScreen from "./screens/SetPasswordScreen";
import ForgotPasswordScreen from "./screens/ForgotPasswordScreen";
import DashboardScreen from "./screens/DashboardScreen";
import CatalogScreen from "./screens/CatalogScreen";
import ProductEditScreen from "./screens/ProductEditScreen";
import MenuFormScreen from "./screens/MenuFormScreen";
import OptionGroupFormScreen from "./screens/OptionGroupFormScreen";
import ComboFormScreen from "./screens/ComboFormScreen";
import PromotionFormScreen from "./screens/PromotionFormScreen";
import OrdersScreen from "./screens/OrdersScreen";
import PaymentsScreen from "./screens/PaymentsScreen";
import CompanyScreen from "./screens/CompanyScreen";
import SettingsScreen from "./screens/SettingsScreen";
import PairScreen from "./screens/PairScreen";
import NewCompanyScreen from "./screens/NewCompanyScreen";
import CompanyContractScreen from "./screens/CompanyContractScreen";
import CompanyListScreen from "./screens/CompanyListScreen";
import PlatformUsersScreen from "./screens/PlatformUsersScreen";
import FulfillmentScreen from "./screens/FulfillmentScreen";
import CommercialScreen from "./screens/CommercialScreen";
import PriceTableFormScreen from "./screens/PriceTableFormScreen";
import FiscalAddonPlanFormScreen from "./screens/FiscalAddonPlanFormScreen";
import SupplierListScreen from "./screens/SupplierListScreen";
import SupplierFormScreen from "./screens/SupplierFormScreen";

const ROLE_ROUTES: Record<string, string[]> = {
  // "/company" liberado pra superadmin/admin — precisam acessar Usuários/
  // Terminais/Pagamento de qualquer empresa pra dar suporte, mesmo padrão
  // de seleção de empresa já usado em /settings (ORD-082). "/platform-users"
  // (ORD-093) é o CRUD separado pra usuários da própria Ordin — não confundir
  // com "/company", que é sobre a equipe de uma empresa cliente.
  superadmin: ["/dashboard", "/companies", "/companies/new", "/companies/:id/contract", "/catalog", "/catalog/products/:id/edit", "/catalog/menus/new", "/catalog/menus/:id/edit", "/catalog/option-groups/new", "/catalog/option-groups/:id/edit", "/catalog/combos/new", "/catalog/combos/:id/edit", "/catalog/promotions/new", "/catalog/promotions/:id/edit", "/suppliers", "/suppliers/new", "/suppliers/:id/edit", "/orders", "/payments", "/company", "/pair", "/settings", "/platform-users", "/fulfillment", "/commercial/price-tables", "/commercial/price-tables/new", "/commercial/price-tables/:id/edit", "/commercial/fiscal-addon-plans", "/commercial/fiscal-addon-plans/new", "/commercial/fiscal-addon-plans/:id/edit"],
  admin:      ["/dashboard", "/companies", "/companies/new", "/companies/:id/contract", "/catalog", "/catalog/products/:id/edit", "/catalog/menus/new", "/catalog/menus/:id/edit", "/catalog/option-groups/new", "/catalog/option-groups/:id/edit", "/catalog/combos/new", "/catalog/combos/:id/edit", "/catalog/promotions/new", "/catalog/promotions/:id/edit", "/suppliers", "/suppliers/new", "/suppliers/:id/edit", "/orders", "/payments", "/company", "/pair", "/settings", "/platform-users", "/fulfillment", "/commercial/price-tables", "/commercial/price-tables/new", "/commercial/price-tables/:id/edit", "/commercial/fiscal-addon-plans", "/commercial/fiscal-addon-plans/new", "/commercial/fiscal-addon-plans/:id/edit"],
  owner:      ["/dashboard", "/catalog", "/catalog/products/:id/edit", "/catalog/menus/new", "/catalog/menus/:id/edit", "/catalog/option-groups/new", "/catalog/option-groups/:id/edit", "/catalog/combos/new", "/catalog/combos/:id/edit", "/catalog/promotions/new", "/catalog/promotions/:id/edit", "/suppliers", "/suppliers/new", "/suppliers/:id/edit", "/orders", "/payments", "/company", "/pair", "/settings", "/fulfillment"],
  manager:    ["/dashboard", "/catalog", "/catalog/products/:id/edit", "/catalog/menus/new", "/catalog/menus/:id/edit", "/catalog/option-groups/new", "/catalog/option-groups/:id/edit", "/catalog/combos/new", "/catalog/combos/:id/edit", "/catalog/promotions/new", "/catalog/promotions/:id/edit", "/suppliers", "/suppliers/new", "/suppliers/:id/edit", "/orders", "/payments", "/company", "/pair", "/settings", "/fulfillment"],
  // ORD-088: cashier ganha acesso a /settings só pra seção "Minha segurança"
  // (2FA pessoal) — SettingsScreen esconde PIN/Aparência/política de MFA
  // pra quem não é owner/manager/superadmin/admin (ver canManageCompany).
  // ORD-119: cashier ganha /fulfillment também — é a primeira tela de
  // pedidos que o cashier passa a acessar no admin, faz sentido porque já é
  // quem opera a coleta hoje via balcão.
  cashier:  ["/dashboard", "/settings", "/fulfillment"],
};

function ProtectedRoute({ path, element }: { path: string; element: JSX.Element }) {
  const role = useStore((s) => s.role);
  if (!role) return <Navigate to="/login" replace />;
  if (!(ROLE_ROUTES[role] ?? []).includes(path)) return <Navigate to="/dashboard" replace />;
  return element;
}

export default function App() {
  const isAuth = useStore((s) => !!s.accessToken);
  const adminThemeMode = useStore((s) => s.adminThemeMode);
  const location = useLocation();

  useEffect(() => {
    const apply = () => {
      const resolved =
        adminThemeMode === "system"
          ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
          : adminThemeMode;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    if (adminThemeMode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [adminThemeMode]);

  // ORD-087: rota pública, resolvida ANTES do gate de isAuth — o link do
  // e-mail de convite (/set-password?token=...) precisa abrir mesmo sem
  // sessão. Sem isso, !isAuth sempre caía direto no LoginScreen, ignorando
  // o path (achado crítico do Tech Explorer).
  if (location.pathname === "/set-password") {
    return (
      <>
        <ToastContainer />
        <SetPasswordScreen />
      </>
    );
  }

  // ORD-097: mesmo motivo do /set-password acima — precisa abrir sem sessão.
  if (location.pathname === "/forgot-password") {
    return (
      <>
        <ToastContainer />
        <ForgotPasswordScreen />
      </>
    );
  }

  if (!isAuth) {
    return (
      <>
        <ToastContainer />
        <LoginScreen />
      </>
    );
  }

  return (
    <>
      <ToastContainer />
      <div className={styles.shell}>
        <Sidebar />
        <main className={styles.main}>
          <ActiveCompanyBadge />
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<ProtectedRoute path="/dashboard" element={<DashboardScreen />} />} />
            <Route path="/catalog"   element={<ProtectedRoute path="/catalog"   element={<CatalogScreen />} />} />
            <Route path="/catalog/products/:id/edit" element={<ProtectedRoute path="/catalog/products/:id/edit" element={<ProductEditScreen />} />} />
            <Route path="/catalog/menus/new"         element={<ProtectedRoute path="/catalog/menus/new"         element={<MenuFormScreen />} />} />
            <Route path="/catalog/menus/:id/edit"    element={<ProtectedRoute path="/catalog/menus/:id/edit"    element={<MenuFormScreen />} />} />
            <Route path="/catalog/option-groups/new"      element={<ProtectedRoute path="/catalog/option-groups/new"      element={<OptionGroupFormScreen />} />} />
            <Route path="/catalog/option-groups/:id/edit" element={<ProtectedRoute path="/catalog/option-groups/:id/edit" element={<OptionGroupFormScreen />} />} />
            <Route path="/catalog/combos/new"      element={<ProtectedRoute path="/catalog/combos/new"      element={<ComboFormScreen />} />} />
            <Route path="/catalog/combos/:id/edit" element={<ProtectedRoute path="/catalog/combos/:id/edit" element={<ComboFormScreen />} />} />
            <Route path="/catalog/promotions/new"      element={<ProtectedRoute path="/catalog/promotions/new"      element={<PromotionFormScreen />} />} />
            <Route path="/catalog/promotions/:id/edit" element={<ProtectedRoute path="/catalog/promotions/:id/edit" element={<PromotionFormScreen />} />} />
            <Route path="/suppliers"          element={<ProtectedRoute path="/suppliers"          element={<SupplierListScreen />} />} />
            <Route path="/suppliers/new"      element={<ProtectedRoute path="/suppliers/new"      element={<SupplierFormScreen />} />} />
            <Route path="/suppliers/:id/edit" element={<ProtectedRoute path="/suppliers/:id/edit" element={<SupplierFormScreen />} />} />
            <Route path="/orders"    element={<ProtectedRoute path="/orders"    element={<OrdersScreen />} />} />
            <Route path="/fulfillment" element={<ProtectedRoute path="/fulfillment" element={<FulfillmentScreen />} />} />
            <Route path="/payments"  element={<ProtectedRoute path="/payments"  element={<PaymentsScreen />} />} />
            <Route path="/company"   element={<ProtectedRoute path="/company"   element={<CompanyScreen />} />} />
            <Route path="/settings"  element={<ProtectedRoute path="/settings"  element={<SettingsScreen />} />} />
            <Route path="/pair"      element={<ProtectedRoute path="/pair"      element={<PairScreen />} />} />
            <Route path="/companies" element={<ProtectedRoute path="/companies" element={<CompanyListScreen />} />} />
            <Route path="/companies/new" element={<ProtectedRoute path="/companies/new" element={<NewCompanyScreen />} />} />
            <Route path="/companies/:id/contract" element={<ProtectedRoute path="/companies/:id/contract" element={<CompanyContractScreen />} />} />
            <Route path="/platform-users" element={<ProtectedRoute path="/platform-users" element={<PlatformUsersScreen />} />} />
            <Route path="/commercial/price-tables" element={<ProtectedRoute path="/commercial/price-tables" element={<CommercialScreen />} />} />
            <Route path="/commercial/price-tables/new" element={<ProtectedRoute path="/commercial/price-tables/new" element={<PriceTableFormScreen />} />} />
            <Route path="/commercial/price-tables/:id/edit" element={<ProtectedRoute path="/commercial/price-tables/:id/edit" element={<PriceTableFormScreen />} />} />
            <Route path="/commercial/fiscal-addon-plans" element={<ProtectedRoute path="/commercial/fiscal-addon-plans" element={<CommercialScreen />} />} />
            <Route path="/commercial/fiscal-addon-plans/new" element={<ProtectedRoute path="/commercial/fiscal-addon-plans/new" element={<FiscalAddonPlanFormScreen />} />} />
            <Route path="/commercial/fiscal-addon-plans/:id/edit" element={<ProtectedRoute path="/commercial/fiscal-addon-plans/:id/edit" element={<FiscalAddonPlanFormScreen />} />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </>
  );
}
