import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useStore } from "../store";
import api from "../api";
import { OrdinSymbol } from "../assets/OrdinSymbol";
import ConfirmDialog from "./ConfirmDialog";
import ThemeModeSwitch from "./ThemeModeSwitch";
import styles from "./Sidebar.module.scss";

const MENU = [
  { to: "/dashboard",     label: "Dashboard",    icon: "home",        roles: ["superadmin", "admin", "owner", "manager", "cashier"] },
  { to: "/companies",     label: "Clientes",     icon: "users",       roles: ["superadmin", "admin"] },
  { to: "/companies/new", label: "Novo cliente", icon: "user-plus",   roles: ["superadmin", "admin"] },
  { to: "/catalog",       label: "Catálogo",     icon: "package",     roles: ["superadmin", "admin", "owner", "manager"] },
  { to: "/orders",        label: "Pedidos",      icon: "shopping-cart", roles: ["superadmin", "admin", "owner", "manager"] },
  // ORD-119 — fila de preparo/pronto do modelo de retirada única; cashier
  // também tem acesso (é quem já opera coleta hoje via balcão).
  { to: "/fulfillment",   label: "Preparo",      icon: "clock",       roles: ["superadmin", "admin", "owner", "manager", "cashier"] },
  { to: "/payments",      label: "Transações",   icon: "credit-card", roles: ["superadmin", "admin", "owner", "manager"] },
  { to: "/company",       label: "Empresa",      icon: "briefcase",   roles: ["superadmin", "admin", "owner", "manager"] },
  { to: "/pair",          label: "Dispositivos", icon: "monitor",     roles: ["superadmin", "admin", "owner", "manager"] },
  { to: "/settings",      label: "Config.",      icon: "settings",    roles: ["superadmin", "admin", "owner", "manager", "cashier"] },
  // ORD-093: só pra equipe da própria Ordin — não confundir com "Clientes"
  // (empresas) nem com "Empresa" (equipe de UMA empresa cliente específica).
  { to: "/platform-users", label: "Equipe Ordin", icon: "user-check",  roles: ["superadmin", "admin"] },
] as const;

const W_OPEN = 220;
const W_CLOSED = 52;

// Ícone de fixar (thumbtack) — não existe no icon-font do design system,
// SVG inline no mesmo estilo Feather/Lucide do resto do font (stroke,
// currentColor, 24x24). Comportamento e layout espelhados do Mailtrap
// (pedido explícito do usuário): recolhido por padrão, expande no hover,
// o alfinete fixa expandido e empurra o conteúdo (ver Sidebar.module.scss).
function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
  );
}

export default function Sidebar() {
  const { role, logout, sidebarPinned, toggleSidebarPinned } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);

  const expanded = sidebarPinned || hovered;

  useEffect(() => { setHovered(false); }, [location.pathname]);

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
    <>
      {/* Reserva o espaço no layout de verdade — o <aside> abaixo é
          position:fixed (flutua por cima do conteúdo no hover, sem
          empurrar nada); só quando fixado essa reserva cresce pra 220px. */}
      <div className={styles.spacer} style={{ width: sidebarPinned ? W_OPEN : W_CLOSED }} />

      <aside
        className={styles.sidebar}
        style={{ width: expanded ? W_OPEN : W_CLOSED }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className={styles.header}>
          <div className={styles.logoRow}>
            {/* Símbolo fica sempre visível, mesmo recolhida — vira a marca
                permanente do menu; o texto "ordin" só aparece expandido. */}
            <OrdinSymbol size={22} />
            <span className={styles.logo} style={{ opacity: expanded ? 1 : 0 }}>ordin</span>
          </div>
          {expanded && (
            <button
              type="button"
              onClick={toggleSidebarPinned}
              aria-label={sidebarPinned ? "Desafixar menu" : "Fixar menu expandido"}
              className={`${styles.pinBtn} ${sidebarPinned ? styles.pinBtnActive : ""}`}
            >
              <PinIcon />
            </button>
          )}
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
              <span className={styles.navLabel} style={{ opacity: expanded ? 1 : 0 }}>
                {m.label}
              </span>
            </NavLink>
          ))}
        </nav>

        {/* Item de navegação, não LinkButton — variant="inverse" do LinkButton
            fixa texto/ícone branco, invisível sobre o fundo branco do sidebar
            no modo claro (ver ORD-076, achado 1). Herda a mesma cor
            theme-aware que os itens de navegação acima. */}
        <button
          type="button"
          onClick={handleLogout}
          className={`${styles.navItem} ${styles.logoutItem}`}
        >
          <i className={`icon-log-out ${styles.navIcon}`} />
          <span className={styles.navLabel} style={{ opacity: expanded ? 1 : 0 }}>
            Sair
          </span>
        </button>

        {expanded && (
          <div className={styles.actionBtn}>
            <ThemeModeSwitch />
          </div>
        )}

        <ConfirmDialog
          open={!!pendingNav}
          message="Você tem alterações não salvas. Deseja sair mesmo assim?"
          onConfirm={confirmNav}
          onCancel={() => setPendingNav(null)}
        />
      </aside>
    </>
  );
}
