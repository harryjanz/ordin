import { useEffect, useRef, useState } from "react";
import { Button } from "design-system";
import { useStore } from "../store";
import ThemeModeSwitch from "./ThemeModeSwitch";
import styles from "./HeaderMenu.module.scss";

interface Props {
  onLogout: () => void;
}

// ORD-122 — cabeçalho mobile-first: só logo/status/menu ficam sempre
// visíveis na barra (ver análise de UX na história); Turbo, tema, usuário
// e Sair — ações esporádicas, não de toque constante — vão aqui, num
// painel que abre sob demanda. Mesmo padrão de "menu overflow" (⋮) comum
// em apps mobile de operação.
export default function HeaderMenu({ onLogout }: Props) {
  const { userName, role, turboMode, toggleTurbo } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className={styles.wrap} ref={ref}>
      <button type="button" className={styles.trigger} onClick={() => setOpen((v) => !v)} aria-label="Menu">
        <i className="icon-menu" />
      </button>

      {open && (
        <div className={styles.panel}>
          <div className={styles.userRow}>{userName ?? role}</div>

          <div className={styles.row}>
            <span className={styles.rowLabel}>Coleta rápida (turbo)</span>
            <Button
              size="small"
              variant={turboMode ? "primary" : "secondary"}
              onClick={toggleTurbo}
              title="Coleta sem confirmação"
            >
              {turboMode ? "ON" : "OFF"}
            </Button>
          </div>

          <div className={styles.row}>
            <span className={styles.rowLabel}>Tema</span>
            <ThemeModeSwitch />
          </div>

          <div className={styles.divider} />

          <Button variant="secondary" fullWidth onClick={() => { setOpen(false); onLogout(); }}>
            Sair
          </Button>
        </div>
      )}
    </div>
  );
}
