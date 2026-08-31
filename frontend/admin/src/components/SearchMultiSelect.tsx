import { useState } from "react";
import { Dropdown, InputBase, Tag, type DropdownOptions } from "design-system";
import styles from "./SearchMultiSelect.module.scss";

export interface SearchMultiSelectOption {
  value: string;
  label: string;
}

interface SearchMultiSelectProps {
  label: string;
  helperMessage?: string;
  options: SearchMultiSelectOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  emptyMessage?: string;
}

// ORD-136 — busca + dropdown pra compor listas (categorias/produtos de um
// cardápio), no lugar do CheckboxMultiselect sem busca que existia antes.
// Não existe componente pronto de multi-select com busca no design system
// vendorizado (só Dropdown, single-select sem campo digitável — o campo
// interno tem _isTypeable: false —, e TagInput, texto livre). Esta peça
// replica o padrão já usado hoje pro cardápio (menuProductSearch em
// CatalogScreen.tsx): InputBase de busca controlado filtrando o array em
// JS, alimentando um Dropdown pra escolher; selecionados viram Tag
// removable numa lista abaixo.
export default function SearchMultiSelect({
  label,
  helperMessage,
  options,
  selectedIds,
  onChange,
  emptyMessage = "Nenhum resultado encontrado",
}: SearchMultiSelectProps) {
  const [search, setSearch] = useState("");

  const selectedOptions = selectedIds
    .map((id) => options.find((o) => o.value === id))
    .filter((o): o is SearchMultiSelectOption => !!o);

  // Já selecionados somem da busca — evita duplicata sem precisar de
  // lógica de "disabled" por item.
  const availableOptions: DropdownOptions[] = options
    .filter((o) => !selectedIds.includes(o.value))
    .filter((o) => !search || o.label.toLowerCase().includes(search.toLowerCase()))
    .map((o) => ({ value: o.value, label: o.label }));

  function addOption(opt: DropdownOptions) {
    if (!opt.value) return;
    onChange([...selectedIds, opt.value]);
    setSearch("");
  }

  function removeOption(id: string) {
    onChange(selectedIds.filter((v) => v !== id));
  }

  return (
    <div className={styles.wrap}>
      <InputBase
        label={`Buscar ${label.toLowerCase()}`}
        placeholder="Filtrar por nome…"
        helperMessage={helperMessage}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Dropdown
        label={label}
        placeholder="Selecionar…"
        value={null}
        onValueSelected={addOption}
        options={availableOptions}
        emptyMessage={emptyMessage}
      />
      {selectedOptions.length > 0 && (
        <div className={styles.selectedList}>
          {selectedOptions.map((o) => (
            <Tag key={o.value} removable onRemove={() => removeOption(o.value)}>
              {o.label}
            </Tag>
          ))}
        </div>
      )}
    </div>
  );
}
