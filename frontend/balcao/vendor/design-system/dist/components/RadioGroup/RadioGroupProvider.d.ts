import { ReactNode } from 'react';
interface RadioGroupProviderProps {
    name: string;
    value: string;
    children?: ReactNode;
}
export declare const RadioGroupContext: import("react").Context<{
    name: string;
    value: string;
}>;
export declare const RadioGroupProvider: React.FC<RadioGroupProviderProps>;
export {};
