import { ForwardedRef, InputHTMLAttributes } from 'react';
import '../../core/icons/icons.css';
export interface InputBaseProps extends InputHTMLAttributes<HTMLInputElement> {
    /**
     * Label text to display inside the input
     */
    label?: string;
    /**
     * The actual value to fill the input element
     */
    value?: string;
    /**
     * placeholder text to display inside the input
     */
    placeholder?: string;
    /**
     * controls whether input should be disabled
     * @default false
     */
    disabled?: boolean;
    /**
     * If provided, renders an error message with the given text below the input.
     */
    errorMessage?: string;
    /**
     * If provided, renders a helper text message with the given text below the input. Will not render if errorMessage is provided.
     */
    helperMessage?: string;
    /**
     * Renders an icon with the given token on the right of the input.  It must be the name of one icon of design-system icons collection.
     */
    icon?: string;
    /**
     * If provided value is true, will render a spinning loading icon on the input's right side. Will render instead of the current icon.
     * @default false
     */
    loading?: boolean;
    /**
     * Changes the size (spacing and fonts) of the input
     * @default "large"
     */
    variant?: 'medium' | 'large';
    /**
     * Controls whether the input should be readonly (with styles applied).
     * @default "false"
     */
    readOnly?: boolean;
    /**
     * Controls whether the input should be HTML readonly.
     */
    _isTypeable?: boolean;
    /**
     * Calls the provided function if icon prop is present when the the input icon is clicked.
     */
    onActionIconClick?: () => void;
    /**
     * <b>ATTENTION: DO NOT PASS THIS PROP MANUALLY.</b> This prop is automatically provided to the input
     * when using ref prop on CurrencyInput and NumberInput.
     */
    _numberFormatRef?: ForwardedRef<HTMLInputElement>;
}
export declare const InputBase: import("react").ForwardRefExoticComponent<InputBaseProps & import("react").RefAttributes<HTMLInputElement>>;
