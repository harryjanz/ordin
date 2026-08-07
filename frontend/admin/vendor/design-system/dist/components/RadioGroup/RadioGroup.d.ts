import { ReactNode } from 'react';
export interface RadioGroupProps {
    name: string;
    value: string;
    onChange: (value: string) => void;
    children?: ReactNode;
}
export declare const RadioGroup: React.FC<RadioGroupProps>;
