import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useStore } from "../store";
import api from "../api";

const MENU = [
  { to: "/dashboard",     label: "Dashboard",    icon: "⊡", roles: ["superadmin", "admin", "owner", "manager", "cashier"] },
  { to: "/companies",     label: "Clientes",     icon: "▥", roles: ["superadmin"] },
  { to: "/companies/new", label: "Novo cliente", icon: "🧾", roles: ["superadmin"] },
  { to: "/catalog",       label: "Catálogo",     icon: "▤", roles: ["admin", "owner", "manager"] },
  { to: "/orders",        label: "Pedidos",      icon: "≡", roles: ["admin", "owner", "manager"] },
  { to: "/payments",      label: "Transações",   icon: "◈", roles: ["admin", "owner", "manager"] },
  { to: "/company",       label: "Empresa",      icon: "◉", roles: ["admin", "owner"] },
  { to: "/pair",          label: "Dispositivos", icon: "⊞", roles: ["admin", "owner", "manager"] },
  { to: "/settings",      label: "Config.",      icon: "⚙", roles: ["admin", "owner"] },
] as const;

const W_OPEN   = 220;
const W_CLOSED = 52;

export default function Sidebar() {
  const { role, logout, adminThemeMode, toggleAdminThemeMode } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  function handleNavClick(e: React.MouseEvent, to: string) {
    if (!useStore.getState().unsavedChanges) return;
    e.preventDefault();
    const confirmed = window.confirm("Você tem alterações não salvas. Deseja sair mesmo assim?");
    if (confirmed) {
      useStore.getState().setUnsavedChanges(false);
      navigate(to);
    }
  }

  async function handleLogout() {
    const { refreshToken } = useStore.getState();
    try { await api.post("/auth/logout", { refresh_token: refreshToken }); } catch { /* best-effort */ }
    logout();
  }

  const visibleItems = MENU.filter((m) => role && (m.roles as readonly string[]).includes(role));

  return (
    <aside
      style={{
        width: open ? W_OPEN : W_CLOSED,
        minWidth: open ? W_OPEN : W_CLOSED,
        flexShrink: 0,
        height: "100vh",
        position: "sticky",
        top: 0,
        overflow: "hidden",
        background: "var(--a-surface)",
        borderRight: "1px solid rgba(153,0,255,0.2)",
        display: "flex",
        flexDirection: "column",
        transition: "width 220ms ease, min-width 220ms ease",
        zIndex: 10,
      }}
    >
      {/* Botão hamburger */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        style={{
          flexShrink: 0,
          alignSelf: "flex-start",
          margin: "14px 10px 12px",
          width: 32,
          height: 32,
          background: "transparent",
          border: "1px solid rgba(153,0,255,0.35)",
          borderRadius: 7,
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              display: "block",
              width: 14,
              height: 2,
              background: "#9900ff",
              borderRadius: 2,
              transition: "transform 0.22s, opacity 0.22s",
              transformOrigin: "center",
              ...(open
                ? i === 0 ? { transform: "translateY(6px) rotate(45deg)" }
                : i === 1 ? { opacity: 0, transform: "scaleX(0)" }
                : { transform: "translateY(-6px) rotate(-45deg)" }
                : {}),
            }}
          />
        ))}
      </button>

      {/* Logo — aparece ao abrir */}
      <div
        style={{
          paddingLeft: 14,
          paddingBottom: 16,
          fontSize: 18,
          fontWeight: 700,
          color: "#9900ff",
          whiteSpace: "nowrap",
          opacity: open ? 1 : 0,
          transition: "opacity 150ms ease",
          flexShrink: 0,
        }}
      >
        ordin
      </div>

      {/* Itens de navegação */}
      <nav style={{ flex: 1, overflow: "hidden" }}>
        {visibleItems.map((m) => (
          <NavLink
            key={m.to}
            to={m.to}
            onClick={(e) => handleNavClick(e, m.to)}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "11px 14px",
              color: isActive ? "#9900ff" : "rgba(var(--a-text-rgb),0.7)",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: isActive ? 600 : 400,
              background: isActive ? "rgba(153,0,255,0.1)" : "transparent",
              borderLeft: isActive ? "3px solid #9900ff" : "3px solid transparent",
              whiteSpace: "nowrap",
            })}
          >
            <span style={{ flexShrink: 0, fontSize: 17, width: 20, textAlign: "center" }}>
              {m.icon}
            </span>
            <span
              style={{
                opacity: open ? 1 : 0,
                transition: "opacity 150ms ease",
              }}
            >
              {m.label}
            </span>
          </NavLink>
        ))}
      </nav>

      {/* Claro/escuro — só pro superadmin (ver App.tsx, que só aplica
          data-theme quando role === "superadmin") */}
      {role === "superadmin" && (
        <button
          onClick={toggleAdminThemeMode}
          aria-label={adminThemeMode === "dark" ? "Mudar para modo claro" : "Mudar para modo escuro"}
          data-testid="theme-toggle"
          style={{
            flexShrink: 0,
            margin: "0 10px 8px",
            padding: "9px 10px",
            background: "transparent",
            border: "1px solid rgba(153,0,255,0.3)",
            borderRadius: 6,
            color: "rgba(var(--a-text-rgb),0.6)",
            fontSize: 13,
            cursor: "pointer",
            whiteSpace: "nowrap",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ flexShrink: 0, fontSize: 15 }}>{adminThemeMode === "dark" ? "☀️" : "🌙"}</span>
          <span style={{ opacity: open ? 1 : 0, transition: "opacity 150ms ease" }}>
            {adminThemeMode === "dark" ? "Modo claro" : "Modo escuro"}
          </span>
        </button>
      )}

      {/* Botão sair */}
      <button
        onClick={handleLogout}
        style={{
          flexShrink: 0,
          margin: "0 10px 16px",
          padding: "9px 10px",
          background: "transparent",
          border: "1px solid rgba(153,0,255,0.3)",
          borderRadius: 6,
          color: "rgba(var(--a-text-rgb),0.6)",
          fontSize: 13,
          cursor: "pointer",
          whiteSpace: "nowrap",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ flexShrink: 0, fontSize: 15 }}>⎋</span>
        <span style={{ opacity: open ? 1 : 0, transition: "opacity 150ms ease" }}>Sair</span>
      </button>
    </aside>
  );
}
