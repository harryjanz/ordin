/// <reference types="react" />
import { InputBaseProps } from '..';
export interface CheckboxMultiselectOption {
    value: string;
    label: string;
    disabled: boolean;
}
export interface CheckboxMultiselectActionButton {
    label?: string;
    onClick?: (selection?: string[]) => void;
    closeOnClick?: boolean;
    size?: 'small' | 'medium' | 'large';
    disabled?: boolean;
}
interface CustomCheckboxMultiselectProps {
    id: string;
    inputValue?: string;
    options: CheckboxMultiselectOption[];
    onSelectOption?: (option: CheckboxMultiselectOption, checked: boolean) => void;
    initialSelection?: string[];
    emptyMessage?: string;
    showEmptyOptions?: boolean;
    actionButtons?: {
        inverseOrder?: boolean;
        applyButton?: CheckboxMultiselectActionButton;
        clearButton?: CheckboxMultiselectActionButton;
    };
}
type CustomInputBaseProps = Omit<InputBaseProps, 'onChange' | 'icon' | 'value' | 'type' | 'onActionIconClick'>;
export type CheckboxMultiselectProps = CustomCheckboxMultiselectProps & CustomInputBaseProps;
export declare const CheckboxMultiselect: React.FC<CheckboxMultiselectProps>;
export {};
