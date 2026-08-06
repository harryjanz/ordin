import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useStore } from "./store";
import Sidebar from "./components/Sidebar";
import LoginScreen from "./screens/LoginScreen";
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

const ROLE_ROUTES: Record<string, string[]> = {
  superadmin: ["/dashboard", "/companies", "/companies/new", "/companies/:id/contract"],
  admin:    ["/dashboard", "/catalog", "/orders", "/payments", "/company", "/settings", "/pair"],
  owner:    ["/dashboard", "/catalog", "/orders", "/payments", "/company", "/settings", "/pair"],
  manager:  ["/dashboard", "/catalog", "/orders", "/payments", "/pair"],
  cashier:  ["/dashboard"],
};

function ProtectedRoute({ path, element }: { path: string; element: JSX.Element }) {
  const role = useStore((s) => s.role);
  if (!role) return <Navigate to="/login" replace />;
  if (!(ROLE_ROUTES[role] ?? []).includes(path)) return <Navigate to="/dashboard" replace />;
  return element;
}

export default function App() {
  const isAuth = useStore((s) => !!s.accessToken);
  const role = useStore((s) => s.role);
  const adminThemeMode = useStore((s) => s.adminThemeMode);

  // Claro/escuro é opt-in só pro superadmin (ver Sidebar.tsx) — outros
  // papéis sempre veem o escuro histórico, mesmo que o valor persistido
  // no localStorage do navegador tenha ficado como "light" de uma sessão
  // anterior de superadmin no mesmo browser.
  useEffect(() => {
    document.documentElement.dataset.theme = role === "superadmin" ? adminThemeMode : "dark";
  }, [role, adminThemeMode]);

  if (!isAuth) return <LoginScreen />;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--a-bg)" }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: "auto" }}>
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
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}
