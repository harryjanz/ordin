import { ReactNode } from 'react';
interface ModalPortalProps {
    children: ReactNode;
    className: string;
    identifier: string;
}
export declare function ModalPortal({ children, className, identifier, }: ModalPortalProps): import("react").ReactPortal;
export {};
