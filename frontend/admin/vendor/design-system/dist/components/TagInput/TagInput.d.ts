import { InputHTMLAttributes } from 'react';
import '../../core/icons/icons.css';
type CustomInput = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type' | 'value'>;
export interface CustomProps {
    label: string;
    errorMessage?: string;
    helperMessage?: string;
    value: string[];
    onValueChange: (tags: string[]) => void;
}
export type TagInputProps = CustomProps & CustomInput;
export declare const TagInput: ({ label, placeholder, disabled, errorMessage, helperMessage, onValueChange, value, ...props }: TagInputProps) => import("react/jsx-runtime").JSX.Element;
export {};
