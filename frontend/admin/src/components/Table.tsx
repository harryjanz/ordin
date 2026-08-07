import type { ReactNode } from "react";
import styles from "./Table.module.scss";

// Não existe componente de tabela no design system (só primitivos de
// formulário/feedback) — grid genérico construído com os tokens/mixins dele.
export interface TableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  mono?: boolean;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  rowTestId?: (row: T) => string;
  emptyMessage?: ReactNode;
}

export default function Table<T>({ columns, rows, rowKey, onRowClick, rowTestId, emptyMessage }: TableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className={styles.wrap}>
        <div className={styles.empty} data-testid="empty-state">{emptyMessage ?? "Nenhum registro encontrado."}</div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={styles.th}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={styles.row}
              onClick={() => onRowClick?.(row)}
              data-testid={rowTestId?.(row)}
            >
              {columns.map((col) => (
                <td key={col.key} className={`${styles.td} ${col.mono ? styles.tdMono : ""}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
