import { ReactNode, MouseEvent } from 'react';
export interface TagProps {
    /**
     * The content of the tag. Should be a simple string node or element.
     */
    children: ReactNode;
    /**
     * Changes the color scheme (font color and background color) of the tag.
     * @default 'neutral'
     */
    variant?: 'emphasys' | 'neutral' | 'success' | 'warning' | 'error' | 'greyscale';
    /**
     * If provided value is true, displays a X icon button to remove the tag.
     * @default false
     */
    removable?: boolean;
    /**
     * Callback called on the remove button click, if removable props provided value is true.
     */
    onRemove?: (event: MouseEvent) => void;
}
export declare function Tag({ children, variant, removable, onRemove, }: TagProps): import("react/jsx-runtime").JSX.Element;
