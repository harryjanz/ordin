import { useRef, useState } from "react";

/**
 * Reordenação por arrastar via Pointer Events (não HTML5 Drag and Drop, que
 * tem suporte ruim a touch) — extraído de components/Table.tsx (ORD-136,
 * drag-and-drop de categoria/produto) pra ser reaproveitado também na lista
 * de opções de um grupo (ORD-139), que não é uma tabela.
 *
 * Chama `onReorder` uma vez, no soltar, com a ordem final completa das
 * chaves — mesmo contrato que o `onReorder` do Table.
 */
export function useDragReorder<T>(
  items: T[],
  itemKey: (item: T) => string | number,
  onReorder?: (orderedKeys: (string | number)[]) => void,
) {
  const [dragKey, setDragKey] = useState<string | number | null>(null);
  const [workingItems, setWorkingItems] = useState<T[] | null>(null);
  const itemRefs = useRef<Map<string | number, HTMLElement>>(new Map());
  const dragKeyRef = useRef<string | number | null>(null);
  const workingItemsRef = useRef<T[] | null>(null);

  const effectiveItems = workingItems ?? items;

  function registerItemRef(key: string | number, el: HTMLElement | null) {
    if (el) itemRefs.current.set(key, el);
    else itemRefs.current.delete(key);
  }

  function startDrag(e: React.PointerEvent, key: string | number) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragKeyRef.current = key;
    workingItemsRef.current = [...items];
    setDragKey(key);
    setWorkingItems(workingItemsRef.current);

    function onMove(ev: PointerEvent) {
      ev.preventDefault(); // evita rolagem nativa da página durante o arraste em touch
      const current = workingItemsRef.current;
      const dk = dragKeyRef.current;
      if (!current || dk === null) return;
      // Acha o índice cujo meio vertical o ponteiro já passou — mesma
      // lógica de qualquer lista arrastável, tolerante a itens de altura
      // variável (não assume altura fixa).
      let hoverIndex = current.length - 1;
      for (let i = 0; i < current.length; i++) {
        const el = itemRefs.current.get(itemKey(current[i]));
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (ev.clientY < rect.top + rect.height / 2) { hoverIndex = i; break; }
      }
      const fromIndex = current.findIndex((it) => itemKey(it) === dk);
      if (fromIndex === -1 || fromIndex === hoverIndex) return;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(hoverIndex, 0, moved);
      workingItemsRef.current = next;
      setWorkingItems(next);
    }

    function cleanup() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    }

    function onUp() {
      cleanup();
      const final = workingItemsRef.current;
      dragKeyRef.current = null;
      workingItemsRef.current = null;
      setDragKey(null);
      setWorkingItems(null);
      if (!final) return;
      const changed = final.some((it, i) => itemKey(it) !== itemKey(items[i]));
      if (changed) onReorder?.(final.map(itemKey));
    }

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  return { effectiveItems, dragKey, registerItemRef, startDrag };
}
