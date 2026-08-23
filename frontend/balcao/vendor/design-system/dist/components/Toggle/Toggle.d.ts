import { InputHTMLAttributes } from 'react';
type CustomInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'disabled'>;
interface CustomToggleProps {
    /**
     * The HTML form name to provide to the toggle input.
     */
    name: string;
    /**
     * The text to display alongside the toggle input.
     */
    label?: string;
    /**
     * Controls on which side of the toggle input the label will be rendered.
     * @default 'right'
     */
    labelPosition?: 'left' | 'right';
    /**
     * Controls whether the toggle input is checked or not
     * @default false
     */
    checked: boolean;
    /**
     * Controls whether the toggle input is disabled or not.
     * @default false
     */
    disabled?: boolean;
    /**
     * Callback function executed everytime toggle input is checked / unchecked.
     */
    onChange(): void;
}
export type ToggleProps = CustomInputProps & CustomToggleProps;
export declare function Toggle({ name, label, labelPosition, checked, disabled, onChange, ...props }: ToggleProps): import("react/jsx-runtime").JSX.Element;
export {};
