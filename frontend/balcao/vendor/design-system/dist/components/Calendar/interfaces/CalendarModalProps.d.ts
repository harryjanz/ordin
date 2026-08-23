import { CalendarContainerProps } from './CalendarContainerProps';
export interface CalendarModalProps extends CalendarContainerProps {
    /**
     * Controls the state of the modal (open/closed)
     */
    isOpen: boolean;
}
