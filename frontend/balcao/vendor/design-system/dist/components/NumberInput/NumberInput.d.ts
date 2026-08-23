/// <reference types="react" />
import { NumberFormatProps } from 'react-number-format';
import { InputBaseProps } from '../InputBase';
interface CustomNumberInputProps {
    value?: number;
    maxValue?: number;
    minValue?: number;
    onChange: (value: number) => void;
}
type CustomInput = Omit<InputBaseProps, 'value' | 'onChange' | '_numberFormatRef' | 'defaultValue' | 'type'>;
type CustomNumberFormatProps = Omit<NumberFormatProps, 'onChange'>;
export type NumberInputProps = CustomNumberInputProps & CustomInput & CustomNumberFormatProps;
export declare const NumberInput: import("react").ForwardRefExoticComponent<Omit<NumberInputProps, "ref"> & import("react").RefAttributes<HTMLInputElement>>;
export {};
