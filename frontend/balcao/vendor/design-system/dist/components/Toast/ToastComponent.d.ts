import React from 'react';
import { Toast } from 'react-hot-toast';
interface ToastComponentProps {
    type: ToastType;
    message: string;
    toastObject: Toast;
    actionButtonText?: string;
    onActionButtonClick?: () => void;
}
export type ToastType = 'neutral' | 'success' | 'warning' | 'error';
export declare const ToastComponent: React.FC<ToastComponentProps>;
export {};
