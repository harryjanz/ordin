import React, { ReactNode } from 'react';
import { InputBaseProps } from '../InputBase';
interface ExclusiveCustomDropdownProps {
    inputValue?: string;
    inputLabel?: string;
    children: ReactNode;
    closeActionToChildren?: boolean;
}
type CustomInputBaseProps = Omit<InputBaseProps, 'onChange' | 'icon' | 'value' | 'label' | 'type' | 'onActionIconClick'>;
export type CustomDropdownProps = ExclusiveCustomDropdownProps & CustomInputBaseProps;
export declare const CustomDropdown: React.FC<CustomDropdownProps>;
export {};
