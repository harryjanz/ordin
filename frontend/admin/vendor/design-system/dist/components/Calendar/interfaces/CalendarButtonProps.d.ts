import { ReactNode } from 'react';
export interface CalendarButtonProps {
    disabled?: boolean;
    onClick: () => void;
    isDefaultDate?: boolean;
    isActive?: boolean;
    scrollToReference?: boolean;
    children?: ReactNode;
}
