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
  login: (access: string, refresh: string) => void;
  logout: () => void;
  updateTokens: (access: string, refresh: string) => void;
  setSelectedCompany: (id: number) => void;
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
    }),
    { name: "ordin-admin-auth" }
  )
);
