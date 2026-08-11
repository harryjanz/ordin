import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { LinkButton } from "design-system";
import { useStore } from "../store";
import api from "../api";
import ConfirmDialog from "./ConfirmDialog";
import styles from "./Sidebar.module.scss";

const MENU = [
  { to: "/dashboard",     label: "Dashboard",    icon: "home",        roles: ["superadmin", "admin", "owner", "manager", "cashier"] },
  { to: "/companies",     label: "Clientes",     icon: "users",       roles: ["superadmin"] },
  { to: "/companies/new", label: "Novo cliente", icon: "user-plus",   roles: ["superadmin"] },
  { to: "/catalog",       label: "Catálogo",     icon: "package",     roles: ["admin", "owner", "manager"] },
  { to: "/orders",        label: "Pedidos",      icon: "shopping-cart", roles: ["admin", "owner", "manager"] },
  { to: "/payments",      label: "Transações",   icon: "credit-card", roles: ["superadmin", "admin", "owner", "manager"] },
  { to: "/company",       label: "Empresa",      icon: "briefcase",   roles: ["admin", "owner"] },
  { to: "/pair",          label: "Dispositivos", icon: "monitor",     roles: ["admin", "owner", "manager"] },
  { to: "/settings",      label: "Config.",      icon: "settings",    roles: ["admin", "owner"] },
] as const;

const W_OPEN = 220;
const W_CLOSED = 52;

export default function Sidebar() {
  const { role, logout, adminThemeMode, toggleAdminThemeMode } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  function handleNavClick(e: React.MouseEvent, to: string) {
    if (!useStore.getState().unsavedChanges) return;
    e.preventDefault();
    setPendingNav(to);
  }

  function confirmNav() {
    if (!pendingNav) return;
    useStore.getState().setUnsavedChanges(false);
    navigate(pendingNav);
    setPendingNav(null);
  }

  async function handleLogout() {
    const { refreshToken } = useStore.getState();
    try { await api.post("/auth/logout", { refresh_token: refreshToken }); } catch { /* best-effort */ }
    logout();
  }

  const visibleItems = MENU.filter((m) => role && (m.roles as readonly string[]).includes(role));

  return (
    <aside className={styles.sidebar} style={{ width: open ? W_OPEN : W_CLOSED, minWidth: open ? W_OPEN : W_CLOSED }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        className={styles.hamburger}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={styles.hamburgerBar}
            style={
              open
                ? i === 0 ? { transform: "translateY(6px) rotate(45deg)" }
                : i === 1 ? { opacity: 0, transform: "scaleX(0)" }
                : { transform: "translateY(-6px) rotate(-45deg)" }
                : {}
            }
          />
        ))}
      </button>

      <div className={styles.logo} style={{ opacity: open ? 1 : 0 }}>
        ordin
      </div>

      <nav className={styles.nav}>
        {visibleItems.map((m) => (
          <NavLink
            key={m.to}
            to={m.to}
            onClick={(e) => handleNavClick(e, m.to)}
            className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
          >
            <i className={`icon-${m.icon} ${styles.navIcon}`} />
            <span className={styles.navLabel} style={{ opacity: open ? 1 : 0 }}>
              {m.label}
            </span>
          </NavLink>
        ))}
      </nav>

      {/* Botão customizado (não LinkButton) porque o DS não tem ícone de
          sol/lua no icon-font. */}
      <button
        onClick={toggleAdminThemeMode}
        aria-label={adminThemeMode === "dark" ? "Mudar para modo claro" : "Mudar para modo escuro"}
        data-testid="theme-toggle"
        className={`${styles.actionBtn} ${styles.themeToggle}`}
      >
        <span className={styles.navIcon}>{adminThemeMode === "dark" ? "☀️" : "🌙"}</span>
        <span className={styles.navLabel} style={{ opacity: open ? 1 : 0 }}>
          {adminThemeMode === "dark" ? "Modo claro" : "Modo escuro"}
        </span>
      </button>

      <div className={styles.actionBtn} style={{ marginBottom: 16 }}>
        <LinkButton onClick={handleLogout} variant="inverse" icon="log-out" label={open ? "Sair" : ""} />
      </div>

      <ConfirmDialog
        open={!!pendingNav}
        message="Você tem alterações não salvas. Deseja sair mesmo assim?"
        onConfirm={confirmNav}
        onCancel={() => setPendingNav(null)}
      />
    </aside>
  );
}
