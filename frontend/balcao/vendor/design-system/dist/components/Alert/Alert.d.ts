/// <reference types="react" />
export interface AlertProps {
    /**
     * The text to display inside the Alert box.
     */
    text: string;
    /**
     * Will change the color scheme of the Alert (background and text color)
     */
    variant: 'error' | 'success' | 'warning' | 'info' | 'neutral';
    /**
     * Renders an icon on the left of the Alert box. It must be the name of one icon of design-system icons collection.
     */
    icon?: string;
    /**
     * The width of the Alert box in pixels. Ignored when fullWidth prop is true
     */
    width?: number;
    /**
     * Displays the alert with the full width of the container if true.
     */
    fullWidth?: boolean;
    /**
     * Display a pointing arrow on the border of the Alert box, on the provided position.
     */
    arrow?: 'top-start' | 'top' | 'top-end' | 'bottom-start' | 'bottom' | 'bottom-end';
    /**
     * If provided, when the text prop contains the wildcard `%ACTION_BUTTON%`,
     * creates a inline link button on the Alert text, with the button label having
     * the value of this prop.
     */
    actionButtonText?: string;
    /**
     * The callback function to be called when the action button is clicked.
     */
    onActionButtonClick?: () => void;
}
export declare const Alert: React.FC<AlertProps>;
