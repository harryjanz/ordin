import React, { ButtonHTMLAttributes } from 'react';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    /**
     * The content (text) to render inside the button
     */
    children: string;
    /**
     * The size of the button. Changes the horizontal padding, font-size and height.
     * @default 'large'
     */
    size?: 'large' | 'medium' | 'small';
    /**
     * Sets the button color scheme.
     * @default 'primary'
     */
    variant?: 'primary' | 'secondary' | 'inverse';
    /**
     * If this prop provided value is `true`, the button will stretch to full width of the container.
     * @default false
     */
    fullWidth?: boolean;
    /**
     * If this prop provided value is `true`, the button will stretch to full width of the container in
     * mobile devices (screen width < 768px).
     * @default false
     */
    mobileFullWidth?: boolean;
    /**
     * Controls whether the button should display a loading spinning icon instead of children prop.
     * @default false
     */
    loading?: boolean;
}
export declare const Button: React.ForwardRefExoticComponent<ButtonProps & React.RefAttributes<HTMLButtonElement>>;
