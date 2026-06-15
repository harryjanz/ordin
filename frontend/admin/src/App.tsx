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

const ROLE_ROUTES: Record<string, string[]> = {
  admin:    ["/dashboard", "/catalog", "/orders", "/payments", "/company", "/settings"],
  owner:    ["/dashboard", "/catalog", "/orders", "/payments", "/company", "/settings"],
  manager:  ["/dashboard", "/catalog", "/orders", "/payments"],
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

  if (!isAuth) return <LoginScreen />;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0e0b1a" }}>
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
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}
