import { Fragment, type ReactNode } from "react";
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
  /** Chave da linha atualmente expandida (ver ORD-080) — compara com `rowKey(row)`. */
  expandedRowKey?: string | number | null;
  /** Conteúdo do painel expansível, renderizado numa linha extra logo abaixo. Só tem efeito junto com `expandedRowKey`. */
  renderExpanded?: (row: T) => ReactNode;
}

export default function Table<T>({
  columns, rows, rowKey, onRowClick, rowTestId, emptyMessage, expandedRowKey, renderExpanded,
}: TableProps<T>) {
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
          {rows.map((row) => {
            const key = rowKey(row);
            const expanded = renderExpanded && key === expandedRowKey;
            return (
              <Fragment key={key}>
                <tr
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
                {expanded && (
                  <tr className={styles.expandedRow}>
                    <td className={styles.expandedCell} colSpan={columns.length}>
                      {renderExpanded!(row)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
