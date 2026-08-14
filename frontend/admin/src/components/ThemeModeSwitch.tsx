import { useStore } from "../store";
import styles from "./ThemeModeSwitch.module.scss";

type Mode = "system" | "dark" | "light";

// Ícones sol/lua não existem no icon-font do design system (mesmo gap do
// ORD-076) — SVGs inline no mesmo estilo Feather/Lucide do resto do font
// (stroke, currentColor, 24x24), só pra esses dois glifos. "Sistema" reusa
// icon-monitor, que já existe no font.
function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

const OPTIONS: { mode: Mode; label: string; icon: React.ReactNode }[] = [
  { mode: "system", label: "Padrão do navegador", icon: <i className={`icon-monitor ${styles.icon}`} /> },
  { mode: "dark", label: "Modo escuro", icon: <MoonIcon /> },
  { mode: "light", label: "Modo claro", icon: <SunIcon /> },
];

export default function ThemeModeSwitch() {
  const adminThemeMode = useStore((s) => s.adminThemeMode);
  const setAdminThemeMode = useStore((s) => s.setAdminThemeMode);

  return (
    <div className={styles.track} role="radiogroup" aria-label="Tema da interface">
      {OPTIONS.map((o) => (
        <button
          key={o.mode}
          type="button"
          role="radio"
          aria-checked={adminThemeMode === o.mode}
          aria-label={o.label}
          title={o.label}
          className={`${styles.option} ${adminThemeMode === o.mode ? styles.optionActive : ""}`}
          onClick={() => setAdminThemeMode(o.mode)}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
