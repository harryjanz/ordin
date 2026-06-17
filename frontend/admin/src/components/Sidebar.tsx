import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useStore } from "../store";
import api from "../api";

const MENU = [
  { to: "/dashboard", label: "Dashboard",   icon: "□",  roles: ["admin", "owner", "manager", "cashier"] },
  { to: "/catalog",   label: "Catálogo",    icon: "▤",  roles: ["admin", "owner", "manager"] },
  { to: "/orders",    label: "Pedidos",     icon: "≡",  roles: ["admin", "owner", "manager"] },
  { to: "/payments",  label: "Transações",  icon: "◈",  roles: ["admin", "owner", "manager"] },
  { to: "/company",   label: "Empresa",     icon: "◉",  roles: ["admin", "owner"] },
  { to: "/pair",      label: "Dispositivos",icon: "⊞",  roles: ["admin", "owner", "manager"] },
  { to: "/settings",  label: "Config.",     icon: "⚙",  roles: ["admin", "owner"] },
] as const;

export default function Sidebar() {
  const { role, logout } = useStore();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  async function handleLogout() {
    const { refreshToken } = useStore.getState();
    try { await api.post("/auth/logout", { refresh_token: refreshToken }); } catch { /* best-effort */ }
    logout();
  }

  const visibleItems = MENU.filter((m) => role && (m.roles as readonly string[]).includes(role));

  return (
    <>
      {/* Hamburger button — sempre visível */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        style={{
          position: "fixed",
          top: 16,
          left: 16,
          zIndex: 200,
          width: 40,
          height: 40,
          background: open ? "#2a1f4a" : "#1d1434",
          border: "1px solid rgba(153,0,255,0.35)",
          borderRadius: 8,
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 5,
          transition: "background 0.15s",
          flexShrink: 0,
        }}
      >
        {/* Linhas do sanduíche animadas */}
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              display: "block",
              width: 18,
              height: 2,
              background: "#9900ff",
              borderRadius: 2,
              transition: "transform 0.2s, opacity 0.2s",
              transformOrigin: "center",
              transform: open
                ? i === 0 ? "translateY(7px) rotate(45deg)"
                : i === 1 ? "opacity: 0; scaleX(0)"
                : "translateY(-7px) rotate(-45deg)"
                : "none",
              opacity: open && i === 1 ? 0 : 1,
            }}
          />
        ))}
      </button>

      {/* Overlay — fecha o menu ao clicar fora (mobile) */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 150,
            background: "rgba(0,0,0,0.5)",
          }}
        />
      )}

      {/* Sidebar drawer */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 160,
          width: 220,
          height: "100vh",
          background: "#1d1434",
          borderRight: "1px solid rgba(153,0,255,0.2)",
          display: "flex",
          flexDirection: "column",
          padding: "24px 0",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 200ms ease",
          boxShadow: open ? "4px 0 32px rgba(0,0,0,0.4)" : "none",
        }}
      >
        <div style={{ padding: "0 20px 28px", fontSize: 20, fontWeight: 700, color: "#9900ff" }}>
          ordin
        </div>
        <nav style={{ flex: 1 }}>
          {visibleItems.map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 20px",
                color: isActive ? "#9900ff" : "rgba(223,232,237,0.7)",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                background: isActive ? "rgba(153,0,255,0.1)" : "transparent",
                borderLeft: isActive ? "3px solid #9900ff" : "3px solid transparent",
              })}
            >
              <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>{m.icon}</span>
              {m.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={handleLogout}
          style={{
            margin: "0 16px",
            padding: "10px 12px",
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

      {/* Spacer para empurrar o conteúdo principal quando não há sidebar fixo */}
      <div style={{ width: 0, flexShrink: 0 }} />
    </>
  );
}
