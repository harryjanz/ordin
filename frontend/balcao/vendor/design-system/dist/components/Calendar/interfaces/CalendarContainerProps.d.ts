export interface CalendarContainerProps {
    /**
     * Custom calendar identifier.
     */
    id?: string;
    /**
     * Custom calendar identifier for tests.
     */
    dataTestId?: string;
    /**
     * Value that will be rendered and changed by the user.
     */
    date?: Date;
    /**
     * Minimum date allowed to choose, disable dates before it.
     */
    minDate?: Date;
    /**
     * Maximum date allowed to choose, disable dates after it.
     */
    maxDate?: Date;
    /**
     * Calls the provided function returning the selected date.
     */
    onChange: (date: Date) => void;
    /**
     * Calls the given function performing the close action.
     */
    onClose: () => void;
}
