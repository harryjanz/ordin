import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CompanyInfo, TerminalInfo, CartItem, CompletedOrder, Screen, ConsumptionType } from "./types";

interface TotemStore {
  // auth — persiste em localStorage entre recargas
  token: string | null;
  company: CompanyInfo | null;
  terminal: TerminalInfo | null;

  // carrinho / pedido
  cart: CartItem[];
  cpf: string | null;
  // ORD-108 — null até o cliente escolher (ou quando a empresa não tem a
  // opção ligada, nunca é perguntado).
  consumptionType: ConsumptionType | null;
  completedOrder: CompletedOrder | null;

  // navegação
  screen: Screen;

  // inatividade
  lastActivity: number;

  // ações
  setToken: (t: string) => void;
  setCompany: (c: CompanyInfo) => void;
  setTerminal: (t: TerminalInfo) => void;
  setScreen: (s: Screen) => void;
  addToCart: (p: CartItem) => void;
  removeFromCart: (id: number) => void;
  setCpf: (c: string | null) => void;
  setConsumptionType: (c: ConsumptionType) => void;
  setCompletedOrder: (o: CompletedOrder) => void;
  newOrder: () => void;
  goIdle: () => void;
  resetSession: () => void;
  touch: () => void;
}

// Lê o token salvo para derivar a tela inicial sem piscar o PIN
function getInitialScreen(): Screen {
  try {
    const raw = localStorage.getItem("ordin-totem-auth");
    if (!raw) return "pin";
    const saved = JSON.parse(raw) as { state?: { token?: string } };
    return saved.state?.token ? "welcome" : "pin";
  } catch {
    return "pin";
  }
}

export const useStore = create<TotemStore>()(
  persist(
    (set) => ({
      token: null,
      company: null,
      terminal: null,
      cart: [],
      cpf: null,
      consumptionType: null,
      completedOrder: null,
      screen: getInitialScreen(),
      lastActivity: Date.now(),

      setToken: (token) => set({ token }),
      setCompany: (company) => set({ company }),
      setTerminal: (terminal) => set({ terminal }),
      setScreen: (screen) => set({ screen, lastActivity: Date.now() }),
      setCpf: (cpf) => set({ cpf }),
      setConsumptionType: (consumptionType) => set({ consumptionType }),
      setCompletedOrder: (completedOrder) => set({ completedOrder }),
      touch: () => set({ lastActivity: Date.now() }),

      addToCart: (product) =>
        set((s) => {
          const existing = s.cart.find((i) => i.id === product.id);
          if (existing) {
            return { cart: s.cart.map((i) => i.id === product.id ? { ...i, qty: i.qty + 1 } : i) };
          }
          return { cart: [...s.cart, { ...product, qty: 1 }] };
        }),

      removeFromCart: (id) =>
        set((s) => {
          const item = s.cart.find((i) => i.id === id);
          if (!item) return {};
          if (item.qty === 1) return { cart: s.cart.filter((i) => i.id !== id) };
          return { cart: s.cart.map((i) => i.id === id ? { ...i, qty: i.qty - 1 } : i) };
        }),

      newOrder: () =>
        set({
          cart: [],
          cpf: null,
          consumptionType: null,
          completedOrder: null,
          screen: "catalog",
          lastActivity: Date.now(),
        }),

      goIdle: () =>
        set({
          cart: [],
          cpf: null,
          consumptionType: null,
          completedOrder: null,
          screen: "welcome",
          lastActivity: Date.now(),
        }),

      resetSession: () =>
        set({
          token: null,
          company: null,
          terminal: null,
          cart: [],
          cpf: null,
          consumptionType: null,
          completedOrder: null,
          screen: "pin",
          lastActivity: Date.now(),
        }),
    }),
    {
      name: "ordin-totem-auth",
      storage: createJSONStorage(() => localStorage),
      // Persiste apenas as credenciais de autenticação — carrinho e pedido são sempre efêmeros
      partialize: (state) => ({
        token: state.token,
        company: state.company,
        terminal: state.terminal,
      }),
    }
  )
);
