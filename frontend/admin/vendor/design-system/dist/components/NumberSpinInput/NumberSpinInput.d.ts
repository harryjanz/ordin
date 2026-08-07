/// <reference types="react" />
import { InputBaseProps } from '../InputBase';
type CustomInputBaseProps = Omit<InputBaseProps, 'onChange' | 'value'>;
export interface CustomNumberSpinInputProps {
    minValue?: number;
    maxValue?: number;
    value: number | null | undefined;
    onChange: (value: number | undefined) => void;
    step: number;
    stepPage?: number;
    onIncrement?: () => void;
    onDecrement?: () => void;
    typeable?: boolean;
    suffix?: string;
    prefix?: string;
    decimalDigits?: number;
}
export type NumberSpinInputProps = CustomNumberSpinInputProps & CustomInputBaseProps;
export declare const NumberSpinInput: React.FC<NumberSpinInputProps>;
export {};
