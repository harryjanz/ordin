import { useNavigate } from "react-router-dom";
import styles from "./Breadcrumb.module.scss";

export interface BreadcrumbItem {
  label: string;
  href?: string; // ausente = item atual, não clicável
}

export default function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  const navigate = useNavigate();
  return (
    <nav className={styles.breadcrumb} aria-label="breadcrumb">
      {items.map((item, i) => (
        <span key={i} className={styles.segment}>
          {item.href ? (
            <button type="button" className={styles.link} onClick={() => navigate(item.href!)}>
              {item.label}
            </button>
          ) : (
            <span className={styles.current}>{item.label}</span>
          )}
          {i < items.length - 1 && <span className={styles.separator}>›</span>}
        </span>
      ))}
    </nav>
  );
}
