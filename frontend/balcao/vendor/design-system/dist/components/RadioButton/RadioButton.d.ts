import { InputHTMLAttributes } from 'react';
interface CustomRadioButtonProps {
    value: string;
    label: string;
}
type CustomInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'name' | 'onChange' | 'value' | 'checked' | 'className' | 'readOnly'>;
export type RadioButtonProps = CustomRadioButtonProps & CustomInputProps;
export declare const RadioButton: import("react").ForwardRefExoticComponent<CustomRadioButtonProps & CustomInputProps & import("react").RefAttributes<HTMLInputElement>>;
export default RadioButton;
