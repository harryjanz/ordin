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
  // Tema claro/escuro/sistema da interface do próprio admin (não é a
  // aparência do totem — isso fica em Company.visual_theme/visual_mode, via
  // themes.ts). "system" acompanha prefers-color-scheme do navegador (ver
  // App.tsx). Disponível pra todos os papéis; persiste no localStorage.
  adminThemeMode: "light" | "dark" | "system";
  // Menu lateral fixado expandido (comportamento espelhado do Mailtrap) —
  // sem isso, o menu só expande no hover e volta a recolher.
  sidebarPinned: boolean;
  login: (access: string, refresh: string) => void;
  logout: () => void;
  updateTokens: (access: string, refresh: string) => void;
  setSelectedCompany: (id: number | null) => void;
  setUnsavedChanges: (v: boolean) => void;
  setAdminThemeMode: (mode: "light" | "dark" | "system") => void;
  toggleSidebarPinned: () => void;
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
      // ORD-090: padrão claro para qualquer sessão nova (inclusive de
      // usuário recém-convidado) — tema é preferência de navegador
      // (localStorage), nunca foi por conta no backend.
      adminThemeMode: "light",
      sidebarPinned: false,

      login(access, refresh) {
        const p = decodeJwt(access);
        const role = (p.role as Role) ?? null;
        // ORD-096 (achado ao vivo): pra superadmin/admin, o "company" do
        // próprio JWT é a empresa interna da plataforma (ORD-093) — nunca
        // uma empresa cliente de verdade. Antes do ORD-093, isso coincidia
        // com uma empresa real (seed), então o default "selectedCompanyId
        // = companyId" parecia funcionar; depois, ele passou a pré-selecionar
        // silenciosamente uma empresa vazia/inacessível em toda tela que lê
        // selectedCompanyId (Configurações, Empresa, Pareamento…), sem
        // nenhum aviso pra selecionar uma empresa de verdade.
        const isPlatformAdmin = role === "superadmin" || role === "admin";
        set({
          accessToken: access,
          refreshToken: refresh,
          userId: typeof p.sub === "string" ? parseInt(p.sub) : null,
          companyId: (p.company as number | null) ?? null,
          role,
          selectedCompanyId: isPlatformAdmin ? null : ((p.company as number | null) ?? null),
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

      setAdminThemeMode(mode) {
        set({ adminThemeMode: mode });
      },

      toggleSidebarPinned() {
        set((s) => ({ sidebarPinned: !s.sidebarPinned }));
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
