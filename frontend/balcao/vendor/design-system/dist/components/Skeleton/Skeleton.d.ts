import React, { ReactNode } from 'react';
import { SkeletonProps as SkeletonContainerProps, SkeletonTheme } from 'react-loading-skeleton';
export interface SkeletonThemeProps {
    children: ReactNode;
    color?: string;
    highlightColor?: string;
}
export declare function SkeletonThemeProvider({ children, color, highlightColor, ...props }: SkeletonThemeProps): React.CElement<import("react-loading-skeleton").SkeletonThemeProps, SkeletonTheme>;
type CustomSkeletonProps = Omit<SkeletonContainerProps, 'className'>;
export interface SkeletonProps extends CustomSkeletonProps {
    rounded?: 'xs' | 's' | 'm' | 'l' | 'xl' | 'none';
}
export declare function Skeleton({ width, height, rounded, ...props }: SkeletonProps): import("react/jsx-runtime").JSX.Element;
export {};
