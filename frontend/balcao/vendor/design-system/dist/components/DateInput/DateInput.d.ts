import { NumberFormatProps } from 'react-number-format';
import { InputBaseProps } from '../InputBase';
type CustomInput = Omit<InputBaseProps, 'value' | 'onChange' | 'onActionIconClick' | 'defaultValue' | 'type'>;
type CustomNumberFormatProps = Omit<NumberFormatProps, 'value' | 'onChange'>;
interface CustomDateInputProps {
    value: string;
    invalidDateMessage?: string;
    invalidMaxDateMessage?: string;
    invalidMinDateMessage?: string;
    maxDate?: Date;
    minDate?: Date;
    onChange: (value: string, valid: boolean) => void;
}
export type DateInputProps = CustomDateInputProps & CustomInput & CustomNumberFormatProps;
export declare const DateInput: ({ label, value, onChange, placeholder, helperMessage, invalidDateMessage, invalidMaxDateMessage, invalidMinDateMessage, errorMessage, maxDate, minDate, format, mask, ...props }: DateInputProps) => import("react/jsx-runtime").JSX.Element;
export {};
