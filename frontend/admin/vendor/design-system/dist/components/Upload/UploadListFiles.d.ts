/// <reference types="react" />
import { UploadFile } from './Upload';
export interface UploadFilesListProps {
    title?: string;
    items: UploadFile[];
    removable?: boolean;
    onCallbackRemove?: (id: string) => void;
}
export declare const UploadListFiles: React.FC<UploadFilesListProps>;
