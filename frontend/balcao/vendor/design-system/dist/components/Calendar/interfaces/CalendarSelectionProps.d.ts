import { CalendarOptionsEnum } from '../enums';
export interface CalendarSelectionProps {
    currentDate?: Date;
    defaultDate: Date;
    minDate?: Date;
    maxDate?: Date;
    onChangeDate: (updatedDate: Date, type: CalendarOptionsEnum) => void;
    onChangeCalendarOption: (type: CalendarOptionsEnum) => void;
}
