import { useStore } from "../store";

// Anexa company_id como query param em toda chamada de catálogo, só quando
// superadmin/admin têm uma empresa selecionada — owner/manager não mandam o
// parâmetro (o backend ignoraria mesmo, mas nem precisa). Extraído de
// CatalogScreen (ORD-136) — usado também nas telas dedicadas de produto e
// cardápio.
export function useCatalogParams() {
  const role = useStore((s) => s.role);
  const isPlatformAdmin = role === "superadmin" || role === "admin";
  const companyId = useStore((s) => s.selectedCompanyId);

  return function catalogParams(extra: Record<string, string | number | boolean | undefined> = {}) {
    return {
      params: {
        ...extra,
        ...(isPlatformAdmin && companyId ? { company_id: companyId } : {}),
      },
    };
  };
}
