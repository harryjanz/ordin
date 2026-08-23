import { ReactNode } from 'react';
import { ButtonOptions } from './ButtonOptions';
import { TextOptions } from './TextOptions';
import { TitleOptions } from './TitleOptions';
export interface ModalTemplateOptions {
    title?: TitleOptions;
    icon?: ReactNode;
    text?: TextOptions;
    buttons?: ButtonOptions;
}
