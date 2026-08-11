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
  /**
   * "compact" reproduz literalmente o protótipo aprovado de Transações
   * (fonte/padding menores, borda real em vez de quase-invisível, fundo do
   * cabeçalho, hover de linha, borda da última linha removida). Só usado em
   * PaymentsScreen — não muda o Table "default" do CompanyListScreen.
   */
  variant?: "default" | "compact";
}

export default function Table<T>({
  columns, rows, rowKey, onRowClick, rowTestId, emptyMessage, expandedRowKey, renderExpanded, variant = "default",
}: TableProps<T>) {
  const compact = variant === "compact";
  const cx = (base: string, compactClass?: string) => (compact && compactClass ? `${base} ${compactClass}` : base);

  if (rows.length === 0) {
    return (
      <div className={cx(styles.wrap, styles.wrapCompact)}>
        <div className={styles.empty} data-testid="empty-state">{emptyMessage ?? "Nenhum registro encontrado."}</div>
      </div>
    );
  }

  const chevronColumn = Boolean(renderExpanded);

  return (
    <div className={cx(styles.wrap, styles.wrapCompact)}>
      <table className={cx(styles.table, styles.tableCompact)}>
        <thead>
          <tr>
            {chevronColumn && <th className={cx(styles.th, styles.thCompact)} />}
            {columns.map((col) => (
              <th key={col.key} className={cx(styles.th, styles.thCompact)}>{col.header}</th>
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
                  className={cx(styles.row, styles.rowCompact)}
                  onClick={() => onRowClick?.(row)}
                  data-testid={rowTestId?.(row)}
                >
                  {chevronColumn && (
                    <td className={cx(styles.td, styles.tdCompact)}>
                      <span className={`${styles.chev} ${expanded ? styles.chevOpen : ""}`}>▸</span>
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className={`${cx(styles.td, styles.tdCompact)} ${col.mono ? styles.tdMono : ""}`}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
                {expanded && (
                  <tr className={styles.expandedRow}>
                    <td className={styles.expandedCell} colSpan={columns.length + (chevronColumn ? 1 : 0)}>
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
