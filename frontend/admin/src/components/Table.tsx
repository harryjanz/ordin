import { Fragment, useRef, useState, type ReactNode } from "react";
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
  /**
   * Reordenação por arrastar (pedido direto do usuário, 2026-08-24 — Catálogo,
   * substituindo uma primeira tentativa com setas ↑/↓ que ele não gostou).
   * Presença desta prop já liga a coluna de handle (⠿); ausência = tabela
   * sem reordenação, comportamento idêntico a antes (não afeta nenhum outro
   * uso de Table). Pointer Events (não HTML5 Drag and Drop, que tem suporte
   * ruim a touch) — mesmo mecanismo já usado no drag-and-drop de Preparo.
   * Chamado uma vez, no soltar, com a ordem final completa das `rowKey`.
   */
  onReorder?: (orderedKeys: (string | number)[]) => void;
}

export default function Table<T>({
  columns, rows, rowKey, onRowClick, rowTestId, emptyMessage, expandedRowKey, renderExpanded, variant = "default",
  onReorder,
}: TableProps<T>) {
  const compact = variant === "compact";
  const cx = (base: string, compactClass?: string) => (compact && compactClass ? `${base} ${compactClass}` : base);

  const [dragKey, setDragKey] = useState<string | number | null>(null);
  const [workingRows, setWorkingRows] = useState<T[] | null>(null);
  const rowRefs = useRef<Map<string | number, HTMLTableRowElement>>(new Map());
  const dragKeyRef = useRef<string | number | null>(null);
  const workingRowsRef = useRef<T[] | null>(null);

  const effectiveRows = workingRows ?? rows;

  function startRowDrag(e: React.PointerEvent, key: string | number) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragKeyRef.current = key;
    workingRowsRef.current = [...rows];
    setDragKey(key);
    setWorkingRows(workingRowsRef.current);

    function onMove(ev: PointerEvent) {
      ev.preventDefault(); // evita rolagem nativa da página durante o arraste em touch
      const current = workingRowsRef.current;
      const dk = dragKeyRef.current;
      if (!current || dk === null) return;
      // Acha o índice cujo meio vertical o ponteiro já passou — mesma
      // lógica de qualquer lista arrastável, tolerante a linhas de altura
      // variável (não assume altura fixa).
      let hoverIndex = current.length - 1;
      for (let i = 0; i < current.length; i++) {
        const el = rowRefs.current.get(rowKey(current[i]));
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (ev.clientY < rect.top + rect.height / 2) { hoverIndex = i; break; }
      }
      const fromIndex = current.findIndex((r) => rowKey(r) === dk);
      if (fromIndex === -1 || fromIndex === hoverIndex) return;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(hoverIndex, 0, moved);
      workingRowsRef.current = next;
      setWorkingRows(next);
    }

    function cleanup() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    }

    function onUp() {
      cleanup();
      const final = workingRowsRef.current;
      dragKeyRef.current = null;
      workingRowsRef.current = null;
      setDragKey(null);
      setWorkingRows(null);
      if (!final) return;
      const changed = final.some((r, i) => rowKey(r) !== rowKey(rows[i]));
      if (changed) onReorder?.(final.map(rowKey));
    }

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  if (rows.length === 0) {
    return (
      <div className={cx(styles.wrap, styles.wrapCompact)}>
        <div className={styles.empty} data-testid="empty-state">{emptyMessage ?? "Nenhum registro encontrado."}</div>
      </div>
    );
  }

  const chevronColumn = Boolean(renderExpanded);
  const dragColumn = Boolean(onReorder);

  return (
    <div className={cx(styles.wrap, styles.wrapCompact)}>
      <table className={cx(styles.table, styles.tableCompact)}>
        <thead>
          <tr>
            {dragColumn && <th className={cx(styles.th, styles.thCompact)} />}
            {chevronColumn && <th className={cx(styles.th, styles.thCompact)} />}
            {columns.map((col) => (
              <th key={col.key} className={cx(styles.th, styles.thCompact)}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {effectiveRows.map((row) => {
            const key = rowKey(row);
            const expanded = renderExpanded && key === expandedRowKey;
            return (
              <Fragment key={key}>
                <tr
                  ref={(el) => {
                    if (el) rowRefs.current.set(key, el);
                    else rowRefs.current.delete(key);
                  }}
                  className={`${cx(styles.row, styles.rowCompact)} ${dragKey === key ? styles.rowDragging : ""}`}
                  onClick={() => onRowClick?.(row)}
                  data-testid={rowTestId?.(row)}
                >
                  {dragColumn && (
                    <td className={cx(styles.td, styles.tdCompact)}>
                      <span
                        className={styles.dragHandle}
                        title="Arraste para reordenar"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => { e.stopPropagation(); startRowDrag(e, key); }}
                      >
                        ⠿
                      </span>
                    </td>
                  )}
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
                    <td className={styles.expandedCell} colSpan={columns.length + (chevronColumn ? 1 : 0) + (dragColumn ? 1 : 0)}>
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
