import { NavLink } from "react-router-dom";
import { useStore } from "../store";
import api from "../api";

const MENU = [
  { to: "/dashboard", label: "Dashboard", roles: ["admin", "owner", "manager", "cashier"] },
  { to: "/catalog",   label: "Catálogo",   roles: ["admin", "owner", "manager"] },
  { to: "/orders",    label: "Pedidos",    roles: ["admin", "owner", "manager"] },
  { to: "/payments",  label: "Transações", roles: ["admin", "owner", "manager"] },
  { to: "/company",   label: "Empresa",    roles: ["admin", "owner"] },
  { to: "/settings",  label: "Config.",    roles: ["admin", "owner"] },
] as const;

export default function Sidebar() {
  const { role, logout } = useStore();

  async function handleLogout() {
    try { await api.post("/auth/logout"); } catch { /* best-effort */ }
    logout();
  }

  return (
    <aside style={{
      width: 200,
      minHeight: "100vh",
      background: "#1d1434",
      borderRight: "1px solid rgba(153,0,255,0.2)",
      display: "flex",
      flexDirection: "column",
      padding: "24px 0",
    }}>
      <div style={{ padding: "0 20px 24px", fontSize: 20, fontWeight: 700, color: "#9900ff" }}>
        ordin
      </div>
      <nav style={{ flex: 1 }}>
        {MENU.filter((m) => role && (m.roles as readonly string[]).includes(role)).map((m) => (
          <NavLink
            key={m.to}
            to={m.to}
            style={({ isActive }) => ({
              display: "block",
              padding: "10px 20px",
              color: isActive ? "#9900ff" : "rgba(223,232,237,0.7)",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: isActive ? 600 : 400,
              background: isActive ? "rgba(153,0,255,0.1)" : "transparent",
              borderLeft: isActive ? "3px solid #9900ff" : "3px solid transparent",
            })}
          >
            {m.label}
          </NavLink>
        ))}
      </nav>
      <button
        onClick={handleLogout}
        style={{
          margin: "0 16px",
          padding: "8px 12px",
          background: "transparent",
          border: "1px solid rgba(153,0,255,0.3)",
          borderRadius: 6,
          color: "rgba(223,232,237,0.6)",
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        Sair
      </button>
    </aside>
  );
}
