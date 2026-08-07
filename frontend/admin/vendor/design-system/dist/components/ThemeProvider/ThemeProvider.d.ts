import { ReactNode } from 'react';
import Themes from '../../core/themes';
export declare const ThemeContext: import("react").Context<Themes>;
interface ThemeProviderProps {
    theme?: Themes;
    children?: ReactNode;
}
export declare const ThemeProvider: React.FC<ThemeProviderProps>;
export {};
