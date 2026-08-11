import { useEffect, useState } from "react";
import api from "../api";
import { useStore } from "../store";
import styles from "./ActiveCompanyBadge.module.scss";

// Indicador fixo no canto superior direito mostrando qual empresa está
// "ativa" na sessão (selectedCompanyId) pra superadmin/admin — mesmo valor
// que Configurações/Empresa/Dispositivos/Transações/Pedidos leem e escrevem.
// Sem isso não tinha como confirmar visualmente, navegando entre telas, que
// a seleção feita numa realmente valia nas outras (achado ao vivo, ORD-082).
export default function ActiveCompanyBadge() {
  const role = useStore((s) => s.role);
  const isPlatformAdmin = role === "superadmin" || role === "admin";
  const selectedCompanyId = useStore((s) => s.selectedCompanyId);
  const setSelectedCompany = useStore((s) => s.setSelectedCompany);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!isPlatformAdmin || !selectedCompanyId) { setName(null); return; }
    api.get(`/companies/${selectedCompanyId}`).then((r) => setName(r.data.name ?? null)).catch(() => null);
  }, [isPlatformAdmin, selectedCompanyId]);

  if (!isPlatformAdmin || !selectedCompanyId || !name) return null;

  return (
    <div className={styles.badge}>
      <span className={styles.label}>Empresa ativa</span>
      <span className={styles.name}>{name}</span>
      <button
        type="button"
        className={styles.clearBtn}
        onClick={() => setSelectedCompany(null)}
        aria-label="Remover seleção de empresa"
        title="Remover seleção de empresa"
      >
        <i className="icon-x" />
      </button>
    </div>
  );
}
