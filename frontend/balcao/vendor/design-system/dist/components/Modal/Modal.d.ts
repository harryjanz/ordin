import { ReactNode } from 'react';
import { ModalTemplateOptions } from './interfaces';
export interface ModalProps {
    open: boolean;
    children?: ReactNode;
    size?: 'default' | 'large';
    width?: number;
    height?: number;
    hideCloseButton?: boolean;
    template?: ModalTemplateOptions;
    onOpen?: () => void;
    onClose?: () => void;
    onCloseButtonClick?: () => void;
    onBackdropClick?: () => void;
}
export declare function Modal({ children, open, size, height, width, hideCloseButton, onOpen, onClose, onCloseButtonClick, onBackdropClick, template, }: ModalProps): import("react/jsx-runtime").JSX.Element | null;
