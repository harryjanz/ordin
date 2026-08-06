import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthState, Role } from "./types";

function decodeJwt(token: string): Record<string, unknown> {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return {};
  }
}

interface Store extends AuthState {
  selectedCompanyId: number | null;
  // Sinaliza pro Sidebar que uma tela tem edição não salva (ORD-063) — o
  // app usa <BrowserRouter> puro, então useBlocker do React Router não
  // funciona aqui (só em data router); este flag é o mecanismo alternativo
  // pra confirmar antes de navegar pra fora de um formulário sujo.
  unsavedChanges: boolean;
  // Tema claro/escuro da interface do próprio admin (não é a aparência do
  // totem — isso fica em Company.visual_theme/visual_mode, via themes.ts).
  // Só o superadmin vê o controle pra trocar (App.tsx só aplica data-theme
  // quando role === "superadmin"); persiste no localStorage mesmo assim,
  // já que o valor em si é inofensivo pra outros papéis se não for aplicado.
  adminThemeMode: "light" | "dark";
  login: (access: string, refresh: string) => void;
  logout: () => void;
  updateTokens: (access: string, refresh: string) => void;
  setSelectedCompany: (id: number) => void;
  setUnsavedChanges: (v: boolean) => void;
  toggleAdminThemeMode: () => void;
}

export const useStore = create<Store>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      userId: null,
      companyId: null,
      role: null,
      selectedCompanyId: null,
      unsavedChanges: false,
      adminThemeMode: "dark",

      login(access, refresh) {
        const p = decodeJwt(access);
        set({
          accessToken: access,
          refreshToken: refresh,
          userId: typeof p.sub === "string" ? parseInt(p.sub) : null,
          companyId: (p.company as number | null) ?? null,
          role: (p.role as Role) ?? null,
          selectedCompanyId: (p.company as number | null) ?? null,
        });
      },

      logout() {
        set({
          accessToken: null,
          refreshToken: null,
          userId: null,
          companyId: null,
          role: null,
          selectedCompanyId: null,
        });
      },

      updateTokens(access, refresh) {
        const p = decodeJwt(access);
        set({
          accessToken: access,
          refreshToken: refresh,
          companyId: (p.company as number | null) ?? null,
          role: (p.role as Role) ?? null,
        });
      },

      setSelectedCompany(id) {
        set({ selectedCompanyId: id });
      },

      setUnsavedChanges(v) {
        set({ unsavedChanges: v });
      },

      toggleAdminThemeMode() {
        set((s) => ({ adminThemeMode: s.adminThemeMode === "dark" ? "light" : "dark" }));
      },
    }),
    {
      name: "ordin-admin-auth",
      // unsavedChanges é efêmero (existe só enquanto a tela de edição está
      // montada) — não deve sobreviver a um reload/fechar aba, senão um
      // reload dentro do próprio modo de edição "prende" o flag como true.
      partialize: (state) => {
        const { unsavedChanges: _unsavedChanges, ...persisted } = state;
        return persisted;
      },
    }
  )
);
