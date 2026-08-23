/// <reference types="react" />
import { ToastPosition } from 'react-hot-toast';
export interface ToastContainerProps {
    position?: ToastPosition;
    duration?: number;
}
export declare const ToastContainer: React.FC<ToastContainerProps>;
