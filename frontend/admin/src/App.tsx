import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ToastContainer } from "design-system";
import { useStore } from "./store";
import styles from "./App.module.scss";
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
  superadmin: ["/dashboard", "/companies", "/companies/new", "/companies/:id/contract", "/catalog", "/orders", "/payments", "/pair", "/settings"],
  admin:      ["/dashboard", "/companies", "/companies/new", "/companies/:id/contract", "/catalog", "/orders", "/payments", "/pair", "/settings"],
  owner:      ["/dashboard", "/catalog", "/orders", "/payments", "/company", "/pair", "/settings"],
  manager:    ["/dashboard", "/catalog", "/orders", "/payments", "/company", "/pair", "/settings"],
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
  const adminThemeMode = useStore((s) => s.adminThemeMode);

  useEffect(() => {
    document.documentElement.dataset.theme = adminThemeMode;
  }, [adminThemeMode]);

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
    </>
  );
}
