import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CompanyInfo, OrderSummary } from "./types";

interface Store {
  token: string | null;
  company: CompanyInfo | null;
  orders: OrderSummary[];

  setPaired: (token: string, company: CompanyInfo) => void;
  resetSession: () => void;
  setOrders: (orders: OrderSummary[]) => void;
  upsertOrder: (order: OrderSummary) => void;
  removeOrder: (ref: string) => void;
  updateOrderStatus: (ref: string, status: string) => void;
}

export const useStore = create<Store>()(
  persist(
    (set) => ({
      token: null,
      company: null,
      orders: [],

      setPaired: (token, company) => set({ token, company }),
      // Chamada em 401 (token expirado/inválido) — volta pra tela de
      // pareamento, mesmo comportamento do totem (api.ts).
      resetSession: () => set({ token: null, company: null, orders: [] }),

      setOrders: (orders) => set({ orders }),
      upsertOrder: (order) =>
        set((s) => {
          const idx = s.orders.findIndex((o) => o.order_ref === order.order_ref);
          if (idx >= 0) {
            const updated = [...s.orders];
            updated[idx] = order;
            return { orders: updated };
          }
          return { orders: [order, ...s.orders] };
        }),
      removeOrder: (ref) => set((s) => ({ orders: s.orders.filter((o) => o.order_ref !== ref) })),
      updateOrderStatus: (ref, status) =>
        set((s) => ({
          orders: s.orders.map((o) => (o.order_ref === ref ? { ...o, status } : o)),
        })),
    }),
    {
      name: "ordin-painel-auth",
      storage: createJSONStorage(() => localStorage),
      // Igual ao totem — só as credenciais de pareamento persistem; a lista
      // de pedidos é sempre buscada de novo (REST + WS) ao carregar.
      partialize: (state) => ({ token: state.token, company: state.company }),
    }
  )
);
