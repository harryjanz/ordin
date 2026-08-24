import React from 'react';
export interface CheckboxProps {
    id: string;
    checked: boolean;
    disabled?: boolean;
    label?: string | null;
    required?: boolean;
    title?: string;
    errorMessage?: string;
    variant?: 'large' | 'medium';
    onChange: (event: boolean) => void;
}
export declare const Checkbox: React.ForwardRefExoticComponent<CheckboxProps & React.RefAttributes<HTMLInputElement>>;
