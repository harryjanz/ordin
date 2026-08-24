import { ReactElement } from 'react';
import { TabProps } from './Tab';
export interface TabsProps {
    activeTab: string;
    onSelectTab?: (value: string) => void;
    withDivider?: boolean;
    children: ReactElement<TabProps>[];
}
export declare const Tabs: ({ activeTab, onSelectTab, withDivider, children, }: TabsProps) => import("react/jsx-runtime").JSX.Element;
