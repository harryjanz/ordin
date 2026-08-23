/// <reference types="react" />
export interface UploadProps {
    maxFileSize: number;
    multipleFiles: boolean;
    types: string[];
    fullWidth?: boolean;
    width?: number;
    errorMessage?: string;
    showMaxFileSize?: boolean;
    helperMessage?: string | null;
    onCallbackUpload: (files: UploadFile[]) => void;
}
export interface UploadFile {
    id: string;
    file: File;
    status: 'error-read' | 'error-send' | 'success' | 'loading' | 'processing';
}
export declare const Upload: React.FC<UploadProps>;
