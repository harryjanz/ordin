import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Toggle } from "design-system";
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
  { to: "/payments",      label: "Transações",   icon: "credit-card", roles: ["admin", "owner", "manager"] },
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

      {/* Toggle do design system em vez do emoji ☀️/🌙 (o icon-font não tem
          ícone de sol/lua — ver ORD-076). O texto ao lado é nosso, não o
          `label` do Toggle: o texto interno do componente usa color('dark')
          fixo (#180a33), que é literalmente o --a-bg do modo escuro do admin
          — ficaria invisível ali. */}
      <div className={`${styles.actionBtn} ${styles.themeToggle}`}>
        <Toggle
          name="admin-theme-sidebar"
          checked={adminThemeMode === "dark"}
          onChange={toggleAdminThemeMode}
          aria-label={adminThemeMode === "dark" ? "Mudar para modo claro" : "Mudar para modo escuro"}
          data-testid="theme-toggle"
        />
        <span className={styles.navLabel} style={{ opacity: open ? 1 : 0 }}>
          {adminThemeMode === "dark" ? "Modo escuro" : "Modo claro"}
        </span>
      </div>

      {/* Item de navegação, não LinkButton — variant="inverse" do LinkButton
          fixa texto/ícone branco, invisível sobre o fundo branco do sidebar
          no modo claro (ver ORD-076, achado 1). Herda a mesma cor
          theme-aware que os itens de navegação acima. */}
      <button
        type="button"
        onClick={handleLogout}
        className={`${styles.navItem} ${styles.logoutItem}`}
        style={{ marginBottom: 16 }}
      >
        <i className={`icon-log-out ${styles.navIcon}`} />
        <span className={styles.navLabel} style={{ opacity: open ? 1 : 0 }}>
          Sair
        </span>
      </button>

      <ConfirmDialog
        open={!!pendingNav}
        message="Você tem alterações não salvas. Deseja sair mesmo assim?"
        onConfirm={confirmNav}
        onCancel={() => setPendingNav(null)}
      />
    </aside>
  );
}
