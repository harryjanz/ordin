import { InputBaseProps } from '../InputBase';
export interface SearchOptions {
    value: string;
    label: string;
    [x: string]: unknown;
}
interface CustomSearchInputProps {
    onValueSelected(optionSelected: SearchOptions): void;
    onChange(option: string): void;
    options?: Array<SearchOptions>;
    changeValueOnSelect?: boolean;
    emptyMessage?: string;
    showEmptyOptions?: boolean;
    autosizeOptions?: boolean;
}
type CustomInputBaseProps = Omit<InputBaseProps, 'onChange'>;
export type SearchInputProps = CustomSearchInputProps & CustomInputBaseProps;
export declare function SearchInput({ value, label, onValueSelected, onChange, disabled, options, emptyMessage, changeValueOnSelect, variant, readOnly, showEmptyOptions, autosizeOptions, ...props }: SearchInputProps): import("react/jsx-runtime").JSX.Element;
export {};
