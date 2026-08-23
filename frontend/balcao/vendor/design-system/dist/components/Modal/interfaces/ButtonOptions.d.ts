import { ReactElement } from 'react';
import { ButtonProps } from '../../Button';
import { LinkButtonProps } from '../../LinkButton';
export interface ButtonOptions {
    primary: ReactElement<ButtonProps> | ReactElement<LinkButtonProps>;
    secondary?: ReactElement<ButtonProps> | ReactElement<LinkButtonProps>;
}
