import { useState, useEffect, useCallback } from "react";
import api from "../api";
import type { Theme } from "../themes";
import type { Category, Product, CartItem } from "../types";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  T: Theme;
  companyName: string;
  terminalLabel: string;
  cart: CartItem[];
  onAdd: (p: Product) => void;
  onRemove: (id: number) => void;
  onCheckout: () => void;
  onThemeToggle: () => void;
  themeKey: string;
}

export default function CatalogScreen({
  T, companyName, terminalLabel, cart, onAdd, onRemove, onCheckout, onThemeToggle, themeKey,
}: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCat, setActiveCat] = useState<Category | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [loadingCat, setLoadingCat] = useState(true);
  const [loadingProds, setLoadingProds] = useState(false);

  useEffect(() => {
    api.get("/catalog/categories").then((r) => {
      const cats: Category[] = r.data.categories ?? [];
      setCategories(cats);
      if (cats.length > 0) setActiveCat(cats[0]);
    }).catch(() => null).finally(() => setLoadingCat(false));
  }, []);

  useEffect(() => {
    if (!activeCat) return;
    setLoadingProds(true);
    api.get(`/catalog/products?category_id=${activeCat.id}`).then((r) => {
      setProducts(r.data.products ?? []);
    }).catch(() => null).finally(() => setLoadingProds(false));
  }, [activeCat]);

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const count = cart.reduce((s, i) => s + i.qty, 0);

  const getQty = useCallback((id: number) => cart.find((i) => i.id === id)?.qty ?? 0, [cart]);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        background: T.header,
        padding: "14px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: `1px solid ${T.border}`,
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#9900ff" }}>{companyName}</div>
          <div style={{ color: T.teal, fontSize: 12, fontWeight: 600, marginTop: 2 }}>{terminalLabel}</div>
        </div>
        <button
          onClick={onThemeToggle}
          style={{
            padding: "6px 14px",
            borderRadius: 20,
            border: "1px solid rgba(153,0,255,0.3)",
            background: "rgba(153,0,255,0.1)",
            color: T.text,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {themeKey === "dark" ? "☀️ Claro" : "🌙 Escuro"}
        </button>
      </div>

      {/* Categorias */}
      <div style={{
        display: "flex",
        gap: 8,
        padding: "14px 24px",
        overflowX: "auto",
        borderBottom: `1px solid ${T.border}`,
        background: themeKey === "dark" ? "rgba(29,20,52,0.6)" : "rgba(223,232,237,0.8)",
      }}>
        {loadingCat ? (
          <div style={{ color: T.muted, fontSize: 13, padding: "8px 0" }}>Carregando categorias…</div>
        ) : categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCat(cat)}
            style={{
              padding: "8px 18px",
              borderRadius: 20,
              border: `1px solid ${activeCat?.id === cat.id ? T.btn : T.border}`,
              background: activeCat?.id === cat.id ? T.catActive : "transparent",
              color: activeCat?.id === cat.id ? T.catText : T.muted,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.15s",
              fontSize: 14,
            }}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Produtos */}
      <div style={{
        flex: 1,
        padding: 24,
        paddingBottom: 108,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
        gap: 16,
        alignContent: "start",
        overflowY: "auto",
      }}>
        {loadingProds ? (
          <div style={{ color: T.muted, gridColumn: "1/-1" }}>Carregando produtos…</div>
        ) : products.length === 0 ? (
          <div style={{ color: T.muted, gridColumn: "1/-1" }}>Nenhum produto disponível.</div>
        ) : products.map((p) => {
          const qty = getQty(p.id);
          return (
            <div
              key={p.id}
              style={{
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 16,
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                transition: "box-shadow 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = T.glow)}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
            >
              {/* Imagem ou placeholder */}
              {p.image_url ? (
                <img src={p.image_url} alt={p.name} style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 10 }} />
              ) : (
                <div style={{
                  width: "100%",
                  height: 100,
                  background: T.numBg,
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 40,
                }}>🍽️</div>
              )}
              <div style={{ color: T.text, fontWeight: 700, fontSize: 15 }}>{p.name}</div>
              {p.description && (
                <div style={{ color: T.muted, fontSize: 12, flexGrow: 1 }}>{p.description}</div>
              )}
              <div style={{ color: T.teal, fontWeight: 800, fontSize: 18 }}>{fmt(p.price)}</div>
              {qty > 0 ? (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: T.numBg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 10,
                  padding: "4px 8px",
                }}>
                  <button
                    onClick={() => onRemove(p.id)}
                    style={{ background: "none", border: "none", color: T.text, fontSize: 22, cursor: "pointer", padding: "0 4px" }}
                  >−</button>
                  <span style={{ color: T.text, fontWeight: 700 }}>{qty}</span>
                  <button
                    onClick={() => onAdd(p)}
                    style={{ background: "none", border: "none", color: T.text, fontSize: 22, cursor: "pointer", padding: "0 4px" }}
                  >+</button>
                </div>
              ) : (
                <button
                  onClick={() => onAdd(p)}
                  style={{
                    padding: "10px",
                    background: T.btn,
                    color: T.btnText,
                    border: "none",
                    borderRadius: 10,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: 14,
                    boxShadow: T.glow,
                  }}
                >
                  Adicionar
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Rodapé fixo */}
      <div style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        padding: "12px 20px 18px",
        background: themeKey === "dark"
          ? `linear-gradient(0deg,${T.bg} 70%,transparent)`
          : `linear-gradient(0deg,${T.bg} 80%,transparent)`,
        zIndex: 50,
      }}>
        <button
          onClick={() => count > 0 && setCartOpen(true)}
          style={{
            width: "100%",
            padding: "17px 24px",
            background: count > 0 ? T.btn : "transparent",
            border: `1px solid ${count > 0 ? "transparent" : T.border}`,
            borderRadius: 16,
            color: count > 0 ? T.btnText : T.muted,
            fontWeight: 700,
            fontSize: 16,
            cursor: count > 0 ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            transition: "all 0.2s",
            boxShadow: count > 0 ? T.glow : "none",
          }}
        >
          <span>🛒 {count > 0 ? `Finalizar compra (${count} item${count > 1 ? "s" : ""})` : "Carrinho vazio"}</span>
          {count > 0 && (
            <span style={{ background: "rgba(0,0,0,0.18)", borderRadius: 10, padding: "4px 14px", fontSize: 17, fontWeight: 800 }}>
              {fmt(total)} →
            </span>
          )}
        </button>
      </div>

      {/* Cart Drawer */}
      {cartOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100 }}>
          <div onClick={() => setCartOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
          <div style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: 380,
            background: themeKey === "dark" ? T.header : T.surface,
            borderLeft: `1px solid ${T.border}`,
            display: "flex",
            flexDirection: "column",
            padding: 24,
            gap: 16,
            overflowY: "auto",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ color: T.text, margin: 0, fontSize: 20, fontWeight: 700 }}>🛒 Carrinho</h3>
              <button
                onClick={() => setCartOpen(false)}
                style={{ background: T.numBg, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}
              >✕</button>
            </div>
            {cart.length === 0 ? (
              <p style={{ color: T.muted, textAlign: "center", marginTop: 40 }}>Carrinho vazio</p>
            ) : (
              <>
                {cart.map((item) => (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: T.text, fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                      <div style={{ color: T.muted, fontSize: 12 }}>{fmt(item.price)} × {item.qty}</div>
                    </div>
                    <div style={{ color: T.teal, fontWeight: 700 }}>{fmt(item.price * item.qty)}</div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => onRemove(item.id)} style={{ background: T.numBg, border: `1px solid ${T.border}`, color: T.text, borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 16 }}>−</button>
                      <button onClick={() => onAdd(item)} style={{ background: T.numBg, border: `1px solid ${T.border}`, color: T.text, borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 16 }}>+</button>
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: "auto" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 0", borderTop: `1px solid ${T.border}` }}>
                    <span style={{ color: T.muted, fontSize: 16 }}>Total</span>
                    <span style={{ color: T.text, fontWeight: 800, fontSize: 22 }}>{fmt(total)}</span>
                  </div>
                  <button
                    onClick={() => { setCartOpen(false); onCheckout(); }}
                    style={{
                      width: "100%",
                      padding: 16,
                      background: T.btn,
                      color: T.btnText,
                      border: "none",
                      borderRadius: 14,
                      fontSize: 16,
                      fontWeight: 700,
                      cursor: "pointer",
                      boxShadow: T.glow,
                    }}
                  >
                    Ir para pagamento →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
