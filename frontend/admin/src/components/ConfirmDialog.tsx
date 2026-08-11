import type { ReactNode } from "react";
import { Alert, Button, Modal, type AlertProps } from "design-system";

export interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Quando definido, troca o texto simples por um <Alert> — pra dar mais
   * destaque visual em confirmações de maior risco (ex: exclusão definitiva). */
  alertVariant?: AlertProps["variant"];
  /** Ícone do design-system pro Alert (ex: "alert-triangle"). Só tem efeito com alertVariant definido. */
  alertIcon?: string;
  /** Conteúdo extra entre a mensagem e os botões (ex: campo de motivo).
   * O Modal do DS sempre renderiza `children` depois do template inteiro
   * (ícone/título/texto/botões, nessa ordem — ver Modal.js `renderTemplate()`
   * seguido de `children`), então não dá pra intercalar conteúdo entre o
   * texto e os botões só com `template.buttons`. Quando `children` é usado,
   * os botões saem do `template` e passam a ser renderizados manualmente
   * depois do conteúdo — todo o resto do template.buttons de quem já usa
   * este componente sem children continua exatamente igual. */
  children?: ReactNode;
  /** Desabilita o botão de confirmar (ex: campo obrigatório do children vazio). Só tem efeito com children definido. */
  confirmDisabled?: boolean;
}

// Substitui window.confirm() nativo pelo Modal do design system — template
// de dois botões (Cancelar/Confirmar) quando onCancel é usado, que é o caso
// de toda confirmação destrutiva do admin (excluir, remover, descartar).
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
  alertVariant,
  alertIcon,
  children,
  confirmDisabled,
}: ConfirmDialogProps) {
  const textOrAlert = alertVariant
    ? { icon: <Alert text={message} variant={alertVariant} icon={alertIcon} fullWidth /> }
    : { text: { value: message, align: "center" as const } };
  const titleOpt = title ? { title: { value: title, align: "center" as const } } : {};

  if (children) {
    return (
      <Modal
        open={open}
        onClose={onCancel}
        onBackdropClick={onCancel}
        onCloseButtonClick={onCancel}
        template={{ ...textOrAlert, ...titleOpt }}
      >
        {children}
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16 }}>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button onClick={onConfirm} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      onBackdropClick={onCancel}
      onCloseButtonClick={onCancel}
      template={{
        ...textOrAlert,
        ...titleOpt,
        buttons: {
          secondary: (
            <Button variant="secondary" onClick={onCancel}>
              {cancelLabel}
            </Button>
          ),
          primary: <Button onClick={onConfirm}>{confirmLabel}</Button>,
        },
      }}
    />
  );
}
