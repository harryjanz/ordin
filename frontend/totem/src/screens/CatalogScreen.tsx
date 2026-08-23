import { useState, useEffect, useCallback } from "react";
import api from "../api";
import type { Theme } from "../themes";
import type { Category, Product, CartItem } from "../types";
import { RADIUS, FONT } from "../scale";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const FONT_D = "'Lexend', sans-serif";
const FONT_B = "'Inter', sans-serif";

interface Props {
  T: Theme;
  companyName: string;
  // ORD-116 — "horizontal" (padrão, faixa de pills no topo) ou "vertical"
  // (sidebar), útil pra empresas com muitas categorias.
  menuLayout: "horizontal" | "vertical";
  cart: CartItem[];
  onAdd: (p: Product) => void;
  onRemove: (id: number) => void;
  onCheckout: () => void;
  onHome: () => void;
}

export default function CatalogScreen({
  T, companyName, menuLayout, cart, onAdd, onRemove, onCheckout, onHome,
}: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCat, setActiveCat] = useState<Category | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [loadingCat, setLoadingCat] = useState(true);
  const [loadingProds, setLoadingProds] = useState(false);

  const isVertical = menuLayout === "vertical";

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

  // Categorias — mesmo conteúdo nos dois modos, só o container/botão mudam
  // de faixa horizontal pra coluna lateral.
  const categoriesContent = loadingCat ? (
    <div style={{ color: T.muted, fontSize: FONT.bodyLg, fontFamily: FONT_B }}>Carregando categorias…</div>
  ) : categories.map((cat) => (
    <button
      key={cat.id}
      onClick={() => setActiveCat(cat)}
      style={isVertical ? {
        padding: "14px 20px",
        borderRadius: RADIUS.sm,
        border: `1px solid ${activeCat?.id === cat.id ? T.btn : T.borderNeutral}`,
        background: activeCat?.id === cat.id ? T.catActive : "transparent",
        color: activeCat?.id === cat.id ? T.catText : T.muted,
        fontFamily: FONT_D,
        fontWeight: 700,
        cursor: "pointer",
        transition: "all 0.15s",
        fontSize: FONT.body,
        minHeight: 48,
        textAlign: "left",
        width: "100%",
        boxShadow: activeCat?.id === cat.id ? "0 0 12px rgba(153,0,255,0.3)" : "none",
      } : {
        padding: "12px 24px",
        borderRadius: RADIUS.pill,
        border: `1px solid ${activeCat?.id === cat.id ? T.btn : T.borderNeutral}`,
        background: activeCat?.id === cat.id ? T.catActive : "transparent",
        color: activeCat?.id === cat.id ? T.catText : T.muted,
        fontFamily: FONT_D,
        fontWeight: 700,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "all 0.15s",
        fontSize: FONT.body,
        minHeight: 48,
        boxShadow: activeCat?.id === cat.id ? "0 0 12px rgba(153,0,255,0.3)" : "none",
      }}
    >
      {cat.name}
    </button>
  ));

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column" }}>

      {/* Zona 1 — Header */}
      <div style={{
        background: T.header,
        padding: "16px 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: `1px solid ${T.borderNeutral}`,
        boxShadow: T.cardShadow,
        minHeight: 72,
        flexShrink: 0,
        zIndex: 10,
      }}>
        <div style={{ fontFamily: FONT_D, fontWeight: 900, fontSize: FONT.title, color: T.roxo, letterSpacing: "-0.5px" }}>
          {companyName}
        </div>
        <button
          onClick={onHome}
          style={{
            padding: "12px 24px",
            borderRadius: RADIUS.pill,
            border: `1px solid ${T.borderNeutral}`,
            background: "transparent",
            color: T.muted,
            cursor: "pointer",
            fontSize: FONT.body,
            fontFamily: FONT_D,
            fontWeight: 700,
            minHeight: 52,
          }}
        >
          ⌂ Início
        </button>
      </div>

      {/* Zona 2 (categorias) + Zona 3 (grade) — lado a lado no modo
          vertical, empilhadas no horizontal (padrão, comportamento
          inalterado). */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: isVertical ? "row" : "column",
        overflow: "hidden",
        minHeight: 0,
      }}>
        {/* Zona 2 — Categorias */}
        <div style={isVertical ? {
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "20px 16px",
          overflowY: "auto",
          borderRight: `1px solid ${T.borderNeutral}`,
          background: T.header,
          flexShrink: 0,
          width: 240,
        } : {
          display: "flex",
          gap: 12,
          padding: "16px 28px",
          overflowX: "auto",
          borderBottom: `1px solid ${T.borderNeutral}`,
          background: T.header,
          flexShrink: 0,
          alignItems: "center",
          minHeight: 68,
        }}>
          {categoriesContent}
        </div>

        {/* Zona 3 — Grade de produtos (3 colunas no modo horizontal, 2 no
            vertical — menos espaço com a coluna de categorias ao lado) */}
        <div style={{
          flex: 1,
          padding: "24px 28px",
          paddingBottom: 136,
          display: "grid",
          gridTemplateColumns: isVertical ? "repeat(2, 1fr)" : "repeat(3, 1fr)",
          gap: 20,
          alignContent: "start",
          overflowY: "auto",
        }}>
          {loadingProds ? (
            <div style={{ color: T.muted, gridColumn: "1/-1", fontSize: FONT.bodyLg, padding: "48px 0", textAlign: "center", fontFamily: FONT_B }}>
              Carregando produtos…
            </div>
          ) : products.length === 0 ? (
            <div style={{ color: T.muted, gridColumn: "1/-1", fontSize: FONT.bodyLg, padding: "48px 0", textAlign: "center", fontFamily: FONT_B }}>
              Nenhum produto disponível.
            </div>
          ) : products.map((p, i) => {
            const qty = getQty(p.id);
            const gradient = i % 2 === 0 ? T.placeholderA : T.placeholderB;
            return (
              <div
                key={p.id}
                style={{
                  background: T.surface,
                  border: `1px solid ${T.borderNeutral}`,
                  borderRadius: RADIUS.lg,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  boxShadow: T.cardShadow,
                  transition: "transform 0.15s, box-shadow 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = T.glow; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = T.cardShadow; }}
              >
                {/* Imagem — 60% da altura do card */}
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} style={{ width: "100%", height: 180, objectFit: "cover" }} />
                ) : (
                  <div style={{
                    width: "100%",
                    height: 180,
                    background: gradient,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: FONT.headlineLg,
                  }}>
                    🍽️
                  </div>
                )}

                {/* Info do produto */}
                <div style={{ padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontFamily: FONT_D, color: T.text, fontWeight: 700, fontSize: FONT.bodyLg, lineHeight: 1.2 }}>
                    {p.name}
                  </div>
                  {p.description && (
                    <div style={{ fontFamily: FONT_B, color: T.muted, fontSize: FONT.body, lineHeight: 1.4 }}>
                      {p.description}
                    </div>
                  )}
                  <div style={{ fontFamily: FONT_D, color: T.priceColor, fontWeight: 800, fontSize: FONT.subtitle, marginTop: 4 }}>
                    {fmt(p.price)}
                  </div>
                </div>

                {/* Controle de quantidade */}
                <div style={{ padding: "12px 16px 16px" }}>
                  {qty > 0 ? (
                    /* Stepper pill */
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      background: T.numBg,
                      border: `1px solid ${T.border}`,
                      borderRadius: RADIUS.pill,
                      overflow: "hidden",
                    }}>
                      <button
                        onClick={() => onRemove(p.id)}
                        style={{
                          width: 52, height: 52,
                          background: "none", border: "none",
                          color: T.roxo, fontSize: FONT.title, fontWeight: 700,
                          cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        −
                      </button>
                      <span style={{
                        flex: 1, textAlign: "center",
                        fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.subtitle, color: T.text,
                      }}>
                        {qty}
                      </span>
                      <button
                        onClick={() => onAdd(p)}
                        style={{
                          width: 52, height: 52,
                          background: "none", border: "none",
                          color: T.roxo, fontSize: FONT.title, fontWeight: 700,
                          cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    /* Botão "+" circular */
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: FONT_B, fontSize: FONT.body, color: T.muted }}>Toque para adicionar</span>
                      <button
                        onClick={() => onAdd(p)}
                        style={{
                          width: 52, height: 52, borderRadius: "50%",
                          background: T.btn, color: T.btnText,
                          border: "none", fontSize: FONT.title, fontWeight: 700,
                          cursor: "pointer", boxShadow: T.glow,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Zona 4 — Carrinho fixo */}
      <div style={{
        position: "fixed",
        bottom: 0, left: 0, right: 0,
        padding: "16px 24px 24px",
        background: `linear-gradient(0deg, ${T.bg} 78%, transparent)`,
        zIndex: 50,
      }}>
        <button
          onClick={() => count > 0 && setCartOpen(true)}
          style={{
            width: "100%",
            minHeight: 90,
            padding: "0 28px",
            background: count > 0 ? T.btn : T.surface,
            border: `1px solid ${count > 0 ? "transparent" : T.borderNeutral}`,
            borderRadius: RADIUS.pill,
            color: count > 0 ? T.btnText : T.muted,
            fontFamily: FONT_D,
            fontWeight: 800,
            fontSize: FONT.subtitle,
            cursor: count > 0 ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            transition: "all 0.2s",
            boxShadow: count > 0 ? T.glow : T.cardShadow,
          }}
        >
          <span>🛒 {count > 0 ? `Ver pedido (${count} item${count > 1 ? "s" : ""})` : "Carrinho vazio"}</span>
          {count > 0 && (
            <span style={{
              background: "rgba(0,0,0,0.18)",
              borderRadius: RADIUS.pill,
              padding: "8px 24px",
              fontSize: FONT.subtitle,
              fontWeight: 900,
            }}>
              {fmt(total)} →
            </span>
          )}
        </button>
      </div>

      {/* Cart Drawer */}
      {cartOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100 }}>
          <div onClick={() => setCartOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} />
          <div style={{
            position: "absolute", right: 0, top: 0, bottom: 0, width: 440,
            background: T.surface,
            borderLeft: `1px solid ${T.borderNeutral}`,
            boxShadow: "-4px 0 32px rgba(0,0,0,0.15)",
            display: "flex", flexDirection: "column",
            padding: 28, gap: 16, overflowY: "auto",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontFamily: FONT_D, color: T.text, margin: 0, fontSize: FONT.subtitle, fontWeight: 800 }}>
                🛒 Meu pedido
              </h3>
              <button
                onClick={() => setCartOpen(false)}
                style={{
                  background: T.numBg, border: `1px solid ${T.borderNeutral}`,
                  color: T.text, borderRadius: RADIUS.pill, padding: "0 20px",
                  cursor: "pointer", fontSize: FONT.bodyLg, fontFamily: FONT_D, fontWeight: 700, minHeight: 44,
                }}
              >
                ✕
              </button>
            </div>

            {cart.length === 0 ? (
              <p style={{ color: T.muted, textAlign: "center", marginTop: 48, fontSize: FONT.bodyLg, fontFamily: FONT_B }}>
                Carrinho vazio
              </p>
            ) : (
              <>
                {cart.map((item) => (
                  <div key={item.id} style={{
                    display: "flex", alignItems: "center", gap: 16,
                    padding: "16px 0", borderBottom: `1px solid ${T.borderNeutral}`,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: FONT_D, color: T.text, fontWeight: 700, fontSize: FONT.bodyLg }}>{item.name}</div>
                      <div style={{ fontFamily: FONT_B, color: T.muted, fontSize: FONT.body, marginTop: 4 }}>
                        {fmt(item.price)} × {item.qty}
                      </div>
                    </div>
                    <div style={{ fontFamily: FONT_D, color: T.priceColor, fontWeight: 800, fontSize: FONT.subtitle }}>
                      {fmt(item.price * item.qty)}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => onRemove(item.id)} style={{ background: T.numBg, border: `1px solid ${T.borderNeutral}`, color: T.roxo, borderRadius: RADIUS.sm, width: 44, height: 44, cursor: "pointer", fontSize: FONT.subtitle, fontWeight: 700 }}>−</button>
                      <button onClick={() => onAdd(item)} style={{ background: T.numBg, border: `1px solid ${T.borderNeutral}`, color: T.roxo, borderRadius: RADIUS.sm, width: 44, height: 44, cursor: "pointer", fontSize: FONT.subtitle, fontWeight: 700 }}>+</button>
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: "auto" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "20px 0", borderTop: `1px solid ${T.borderNeutral}` }}>
                    <span style={{ fontFamily: FONT_B, color: T.muted, fontSize: FONT.bodyLg, fontWeight: 600 }}>Total</span>
                    <span style={{ fontFamily: FONT_D, color: T.text, fontWeight: 900, fontSize: FONT.title }}>{fmt(total)}</span>
                  </div>
                  <button
                    onClick={() => { setCartOpen(false); onCheckout(); }}
                    style={{
                      width: "100%", minHeight: 90, padding: "0 24px",
                      background: T.btn, color: T.btnText,
                      border: "none", borderRadius: RADIUS.pill,
                      fontFamily: FONT_D, fontSize: FONT.subtitle, fontWeight: 800,
                      cursor: "pointer", boxShadow: T.glow,
                    }}
                  >
                    Finalizar pedido →
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
