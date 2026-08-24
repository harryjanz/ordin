import { TextareaHTMLAttributes } from 'react';
export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    /**
     * The label text to display inside the textarea box.
     */
    label?: string;
    /**
     * If provided, renders an error message with the given text below the textarea.
     */
    errorMessage?: string;
    /**
     * If provided, renders a helper text message with the given text below the textarea. Will not render if errorMessage is provided.
     */
    helperMessage?: string;
    /**
     * Changes the size of the font of the textarea label and field
     * @default "large"
     */
    variant?: 'medium' | 'large';
    /**
     * If provided value is true, will resize the textarea as number of rows increase.
     * @default false
     */
    autoSize?: boolean;
    /**
     * Enables the capacity to resize the textarea with the mouse.
     * @default false
     */
    resizeable?: boolean;
    /**
     * Limits the number of characters on the textarea. Displays a char counter below the textarea.
     */
    maxLength?: number;
}
export declare const TextArea: import("react").ForwardRefExoticComponent<TextAreaProps & import("react").RefAttributes<HTMLTextAreaElement>>;
