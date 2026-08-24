/// <reference types="react" />
export interface PaginationProps {
    activePage: number;
    totalItemsCount: number;
    itemsPerPage: number;
    onChange: (selectedIndex: number) => void;
}
export declare const Pagination: React.FC<PaginationProps>;
