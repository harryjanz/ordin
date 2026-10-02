import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { OrdinSymbol } from "../assets/OrdinSymbol";
import { whatsappLink } from "../config";

const NAV_LINKS = [
  { to: "/", label: "Início" },
  { to: "/como-funciona", label: "Como funciona" },
  { to: "/precos", label: "Preços" },
  { to: "/faq", label: "Perguntas frequentes" },
];

export default function Layout() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <>
      <header className={`site-header ${scrolled ? "is-scrolled" : ""}`}>
        <div className="container site-header__inner">
          <Link to="/" className="site-header__brand">
            <OrdinSymbol size={26} color="var(--brand)" />
            <span>Ordin</span>
          </Link>
          <nav className="site-header__nav">
            {NAV_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.to === "/"} className={({ isActive }) => (isActive ? "is-active" : undefined)}>
                {link.label}
              </NavLink>
            ))}
          </nav>
          <Link to="/demo" className="btn btn--primary site-header__cta">
            Agendar conversa
          </Link>
          <button
            className="site-header__burger"
            aria-label="Abrir menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span />
          </button>
        </div>
        <div className={`mobile-menu container ${menuOpen ? "is-open" : ""}`}>
          {NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.to === "/"} className={({ isActive }) => (isActive ? "is-active" : undefined)}>
              {link.label}
            </NavLink>
          ))}
          <Link to="/demo" className="btn btn--primary" style={{ marginTop: 8 }}>
            Agendar conversa
          </Link>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container site-footer__inner">
          <div className="site-header__brand">
            <OrdinSymbol size={22} color="var(--brand)" />
            <span>Ordin</span>
          </div>
          <p>Totem de autoatendimento pra food service. Custo justo, sem letra miúda.</p>
          <a className="btn btn--secondary" href={whatsappLink("Oi! Quero saber mais sobre o Ordin.")} target="_blank" rel="noreferrer">
            Falar no WhatsApp
          </a>
        </div>
      </footer>
    </>
  );
}
