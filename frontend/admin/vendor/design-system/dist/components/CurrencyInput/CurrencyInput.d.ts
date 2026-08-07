/// <reference types="react" />
import { NumberFormatProps } from 'react-number-format';
import { InputBaseProps } from '../InputBase';
interface CustomCurrencyInputProps {
    maxValue?: number;
    minValue?: number;
    onChange: (value: number) => void;
    value: number | null | undefined;
}
type CustomNumberFormatProps = Omit<NumberFormatProps, 'onValueChange' | 'onChange' | 'value' | 'allowNegative' | 'thousandSeparator' | 'decimalSeparator' | 'decimalScale' | 'isNumericString' | 'fixedDecimalScale'>;
type CustomInput = Omit<InputBaseProps, 'value' | 'onChange' | '_numberFormatRef' | 'defaultValue' | 'type'>;
export type CurrencyInputProps = CustomCurrencyInputProps & CustomInput & CustomNumberFormatProps;
export declare const CurrencyInput: import("react").ForwardRefExoticComponent<Omit<CurrencyInputProps, "ref"> & import("react").RefAttributes<HTMLInputElement>>;
export {};
