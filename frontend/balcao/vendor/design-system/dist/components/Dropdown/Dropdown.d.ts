import { InputBaseProps } from '../InputBase';
export interface DropdownOptions {
    value: string;
    label: string;
    [x: string]: unknown;
}
interface CustomDropdownProps {
    value: DropdownOptions | null;
    onValueSelected(optionSelected: DropdownOptions): void;
    options?: Array<DropdownOptions>;
    emptyMessage?: string;
    showEmptyOptions?: boolean;
    autosizeOptions?: boolean;
}
type CustomInputBaseProps = Omit<InputBaseProps, 'value' | 'onChange' | 'onActionIconClick'>;
export type DropdownProps = CustomInputBaseProps & CustomDropdownProps;
export declare function Dropdown({ label, placeholder, value, onValueSelected, options, emptyMessage, disabled, variant, showEmptyOptions, autosizeOptions, loading, readOnly, ...props }: DropdownProps): import("react/jsx-runtime").JSX.Element;
export {};
