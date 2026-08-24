import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthState, Role, OrderSummary } from "./types";

function decodeJwt(token: string): Record<string, unknown> {
  try { return JSON.parse(atob(token.split(".")[1])); } catch { return {}; }
}

// ORD-121 — "dark" é o padrão (não "light", diferente do admin) porque era
// o único modo que o balcão já tinha antes da migração pro design system —
// não muda a experiência de quem já usa o app hoje.
export type ThemeMode = "light" | "dark" | "system";

interface Store extends AuthState {
  orders: OrderSummary[];
  turboMode: boolean;
  lastActivity: number;
  themeMode: ThemeMode;

  login: (access: string, refresh: string) => void;
  logout: () => void;
  updateTokens: (access: string, refresh: string) => void;
  setOrders: (orders: OrderSummary[]) => void;
  upsertOrder: (order: OrderSummary) => void;
  removeOrder: (ref: string) => void;
  updateOrderProgress: (ref: string, collected: number, total: number) => void;
  toggleTurbo: () => void;
  touch: () => void;
  setThemeMode: (mode: ThemeMode) => void;
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      companyId: null,
      role: null,
      userName: null,
      orders: [],
      turboMode: false,
      lastActivity: Date.now(),
      themeMode: "dark",

      login(access, refresh) {
        const p = decodeJwt(access);
        set({
          accessToken: access,
          refreshToken: refresh,
          companyId: (p.company as number | null) ?? null,
          role: (p.role as Role) ?? null,
          userName: (p.name as string | null) ?? null,
          lastActivity: Date.now(),
        });
      },

      logout() {
        set({ accessToken: null, refreshToken: null, companyId: null, role: null, userName: null, orders: [] });
      },

      updateTokens(access, refresh) {
        const p = decodeJwt(access);
        set({ accessToken: access, refreshToken: refresh, companyId: (p.company as number | null) ?? null, role: (p.role as Role) ?? null });
      },

      setOrders(orders) { set({ orders }); },

      upsertOrder(order) {
        set((s) => {
          const idx = s.orders.findIndex((o) => o.order_ref === order.order_ref);
          if (idx >= 0) {
            const updated = [...s.orders];
            updated[idx] = order;
            return { orders: updated };
          }
          return { orders: [order, ...s.orders] };
        });
      },

      removeOrder(ref) {
        set((s) => ({ orders: s.orders.filter((o) => o.order_ref !== ref) }));
      },

      updateOrderProgress(ref, collected, total) {
        set((s) => ({
          orders: s.orders.map((o) =>
            o.order_ref === ref
              ? { ...o, tickets_collected: collected, tickets_total: total }
              : o
          ),
        }));
      },

      toggleTurbo() { set((s) => ({ turboMode: !s.turboMode })); },
      touch() { set({ lastActivity: Date.now() }); },
      setThemeMode(mode) { set({ themeMode: mode }); },
    }),
    {
      name: "ordin-balcao-auth",
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        companyId: s.companyId,
        role: s.role,
        userName: s.userName,
        turboMode: s.turboMode,
        themeMode: s.themeMode,
      }),
    }
  )
);
