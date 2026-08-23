import styles from "./ScanButton.module.scss";

interface Props {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

// Botão de ação primária com ícone do design system — o componente Button
// do DS só aceita string como children (sem slot pra ícone), então este é
// um botão próprio, estilizado com os mesmos tokens (--brand-primary,
// rounded('default')), reservado pra ações com ícone (ex: ativar câmera).
export default function ScanButton({ label, disabled, onClick }: Props) {
  return (
    <button type="button" className={styles.btn} disabled={disabled} onClick={onClick}>
      <i className="icon-camera" />
      {label}
    </button>
  );
}
