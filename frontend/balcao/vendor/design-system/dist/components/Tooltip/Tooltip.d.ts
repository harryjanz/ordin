/// <reference types="react" />
import { Placement } from '@floating-ui/react-dom';
interface TextTooltipProps {
    anchorRef: React.RefObject<HTMLElement>;
    visible: boolean;
    position?: Placement;
    icon?: string;
    text: string;
    children?: never;
}
interface ChildrenTooltipProps {
    anchorRef: React.RefObject<HTMLElement>;
    visible: boolean;
    position?: Placement;
    icon?: never;
    text?: never;
    children: React.ReactNode;
}
export type TooltipProps = TextTooltipProps | ChildrenTooltipProps;
export declare const Tooltip: React.FC<TooltipProps>;
export {};
