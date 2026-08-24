import { SubtitleProps } from './SubtitleProps';
export interface NPSWidgetProps {
    /**
     * Custom NPSWidget identifier.
     */
    id: string;
    /**
     * Control variable whether the component is open or not.
     */
    isOpen: boolean;
    /**
     * Title used in the main component header.
     */
    title: string;
    /**
     * Subtitles used in the component secondary header, must have the variations detractor, passive and promoter which are displayed according to the chosen score.
     */
    subtitles?: SubtitleProps;
    /**
     * Function that is called when the user submits the feedback.
     */
    onSubmit: (score: number, comment: string) => void;
    /**
     * Function that is called when the user closes the component.
     */
    onClose: () => void;
    /**
     * Type of component layout, can be vertical or horizontal.
     */
    type?: 'vertical' | 'horizontal';
    /**
     * Position of the component on the screen, when vertical variation is selected.
     */
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}
