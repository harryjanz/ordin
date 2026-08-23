/// <reference types="react" />
export interface TabProps {
    value: string;
    label: string;
    children?: React.ReactNode;
    totalizer?: number | null;
    disabled?: boolean;
    /** This prop is overriden and therefore unnecessary if the Tab is rendered inside the Tabs component */
    onSelect?: (value: string) => void;
    /** This prop is overriden and therefore unnecessary if the Tab is rendered inside the Tabs component */
    active?: boolean;
}
export declare const Tab: React.FC<TabProps>;
