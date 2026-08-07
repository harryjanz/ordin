export interface DividerProps {
    orientation?: 'horizontal' | 'vertical';
    size?: string;
    /** This prop will only  have effect if parent container is a flex container */
    centered?: boolean;
}
export declare const Divider: ({ orientation, size, centered, }: DividerProps) => import("react/jsx-runtime").JSX.Element;
