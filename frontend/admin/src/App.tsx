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
import OrdersScreen from "./screens/OrdersScreen";
import PaymentsScreen from "./screens/PaymentsScreen";
import CompanyScreen from "./screens/CompanyScreen";
import SettingsScreen from "./screens/SettingsScreen";
import PairScreen from "./screens/PairScreen";
import NewCompanyScreen from "./screens/NewCompanyScreen";
import CompanyContractScreen from "./screens/CompanyContractScreen";
import CompanyListScreen from "./screens/CompanyListScreen";
import PlatformUsersScreen from "./screens/PlatformUsersScreen";

const ROLE_ROUTES: Record<string, string[]> = {
  // "/company" liberado pra superadmin/admin — precisam acessar Usuários/
  // Terminais/Pagamento de qualquer empresa pra dar suporte, mesmo padrão
  // de seleção de empresa já usado em /settings (ORD-082). "/platform-users"
  // (ORD-093) é o CRUD separado pra usuários da própria Ordin — não confundir
  // com "/company", que é sobre a equipe de uma empresa cliente.
  superadmin: ["/dashboard", "/companies", "/companies/new", "/companies/:id/contract", "/catalog", "/orders", "/payments", "/company", "/pair", "/settings", "/platform-users"],
  admin:      ["/dashboard", "/companies", "/companies/new", "/companies/:id/contract", "/catalog", "/orders", "/payments", "/company", "/pair", "/settings", "/platform-users"],
  owner:      ["/dashboard", "/catalog", "/orders", "/payments", "/company", "/pair", "/settings"],
  manager:    ["/dashboard", "/catalog", "/orders", "/payments", "/company", "/pair", "/settings"],
  // ORD-088: cashier ganha acesso a /settings só pra seção "Minha segurança"
  // (2FA pessoal) — SettingsScreen esconde PIN/Aparência/política de MFA
  // pra quem não é owner/manager/superadmin/admin (ver canManageCompany).
  cashier:  ["/dashboard", "/settings"],
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
            <Route path="/orders"    element={<ProtectedRoute path="/orders"    element={<OrdersScreen />} />} />
            <Route path="/payments"  element={<ProtectedRoute path="/payments"  element={<PaymentsScreen />} />} />
            <Route path="/company"   element={<ProtectedRoute path="/company"   element={<CompanyScreen />} />} />
            <Route path="/settings"  element={<ProtectedRoute path="/settings"  element={<SettingsScreen />} />} />
            <Route path="/pair"      element={<ProtectedRoute path="/pair"      element={<PairScreen />} />} />
            <Route path="/companies" element={<ProtectedRoute path="/companies" element={<CompanyListScreen />} />} />
            <Route path="/companies/new" element={<ProtectedRoute path="/companies/new" element={<NewCompanyScreen />} />} />
            <Route path="/companies/:id/contract" element={<ProtectedRoute path="/companies/:id/contract" element={<CompanyContractScreen />} />} />
            <Route path="/platform-users" element={<ProtectedRoute path="/platform-users" element={<PlatformUsersScreen />} />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </>
  );
}
