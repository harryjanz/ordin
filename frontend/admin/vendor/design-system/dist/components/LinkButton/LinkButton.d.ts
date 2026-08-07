import React, { ButtonHTMLAttributes } from 'react';
export interface LinkButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    /**
     * Controls the font size of the link button.
     * @default 'small'
     */
    size?: 'small' | 'large';
    /**
     * Controls the color scheme of the link button.
     * @default 'primary'
     */
    variant?: 'primary' | 'inverse' | 'success' | 'warning' | 'error';
    /**
     * The text to display in the link button
     */
    label: string;
    /**
     * If provided, display an icon on the left or right of the link button label. Must be one
     * of the tokens of design-system icons.
     */
    icon?: string;
    /**
     * If icon prop is provided, controls on which side of the label it will render.
     * @default 'left'
     */
    iconPosition?: 'left' | 'right';
    /**
     * If provided value is true, displays a loading spinning icon instead of the icon prop.
     */
    loading?: boolean;
}
export declare const LinkButton: React.ForwardRefExoticComponent<LinkButtonProps & React.RefAttributes<HTMLButtonElement>>;
