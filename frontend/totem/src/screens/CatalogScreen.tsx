import { useState, useEffect, useCallback, useRef } from "react";
import api from "../api";
import type { Theme } from "../themes";
import type { Category, Product, CartItem, Combo } from "../types";
import { RADIUS, FONT } from "../scale";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const FONT_D = "'Lexend', sans-serif";
const FONT_B = "'Inter', sans-serif";

// ORD-128 — revalida o catálogo periodicamente pra refletir cardápios por
// horário (ORD-127) sem exigir navegação; 90s fica dentro da janela de 1-2
// min combinada com o usuário.
const POLL_INTERVAL_MS = 90_000;

interface Props {
  T: Theme;
  companyName: string;
  // ORD-116 — "horizontal" (padrão, faixa de pills no topo) ou "vertical"
  // (sidebar), útil pra empresas com muitas categorias.
  menuLayout: "horizontal" | "vertical";
  cart: CartItem[];
  onAdd: (item: CartItem) => void;
  onRemove: (key: string) => void;
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

  // ORD-150 — combos ativos da empresa. Falha na chamada não quebra o resto
  // do catálogo (mesmo padrão de erro silencioso do refreshCatalog abaixo) —
  // só a seção "Destaque" some, produtos/categorias continuam funcionando.
  const [combos, setCombos] = useState<Combo[]>([]);
  const loadCombos = useCallback(() => {
    return api.get("/catalog/combos").then((r) => { setCombos(r.data.combos ?? []); }).catch(() => null);
  }, []);

  // Modal de upsell (ORD-150) — decisão validada com o usuário: interrompe a
  // adição do produto avulso, não é um banner discreto. Só dispara na
  // primeira unidade (getQty === 0); incrementar um produto já no carrinho
  // via stepper não repete a pergunta a cada unidade.
  const [upsell, setUpsell] = useState<{ combo: Combo; product: Product } | null>(null);

  const isVertical = menuLayout === "vertical";

  // ORD-128 — usado pelo poll de fundo pra saber a categoria ativa atual sem
  // precisar recriar o callback a cada troca de aba (evitaria reiniciar o
  // interval).
  const activeCatRef = useRef<Category | null>(null);
  useEffect(() => { activeCatRef.current = activeCat; }, [activeCat]);

  const loadProducts = useCallback((categoryId: number, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoadingProds(true);
    return api.get(`/catalog/products?category_id=${categoryId}`).then((r) => {
      setProducts(r.data.products ?? []);
    }).catch(() => null).finally(() => { if (!opts?.silent) setLoadingProds(false); });
  }, []);

  // Busca categorias e, se a categoria ativa some da lista (saiu da janela
  // do cardápio — ORD-127), troca pra outra sem resetar carrinho/carrinho
  // aberto/etc. (esse estado vive no App.tsx, não é tocado aqui). Se a
  // categoria ativa continua a mesma, revalida os produtos dela também —
  // um produto específico pode ter saído/entrado de janela mesmo com a
  // categoria inteira continuando visível.
  const refreshCatalog = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoadingCat(true);
    return api.get("/catalog/categories").then((r) => {
      const cats: Category[] = r.data.categories ?? [];
      setCategories(cats);
      const current = activeCatRef.current;
      const stillVisible = current ? cats.find((c) => c.id === current.id) ?? null : null;
      const nextCat = stillVisible ?? cats[0] ?? null;
      if (nextCat?.id !== current?.id) {
        setActiveCat(nextCat);
      } else if (nextCat) {
        return loadProducts(nextCat.id, opts);
      } else {
        setProducts([]);
      }
    }).catch(() => null).finally(() => { if (!opts?.silent) setLoadingCat(false); });
  }, [loadProducts]);

  useEffect(() => {
    refreshCatalog();
    loadCombos();
  }, [refreshCatalog, loadCombos]);

  useEffect(() => {
    const iv = setInterval(() => { refreshCatalog({ silent: true }); loadCombos(); }, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [refreshCatalog, loadCombos]);

  useEffect(() => {
    if (!activeCat) { setProducts([]); return; }
    loadProducts(activeCat.id);
  }, [activeCat, loadProducts]);

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const count = cart.reduce((s, i) => s + i.qty, 0);
  const getQty = useCallback((key: string) => cart.find((i) => i.key === key)?.qty ?? 0, [cart]);

  // ORD-150 — combo só aparece na categoria em que foi alocado (decisão
  // revisada em 2026-09-02). O upsell (handleAddProduct abaixo) continua
  // checando TODOS os combos ativos, não só os da categoria atual — a oferta
  // de upsell é sobre o produto escolhido, não sobre onde o combo aparece
  // listado.
  const combosForActiveCat = activeCat ? combos.filter((c) => c.category_id === activeCat.id) : [];

  function addProductToCart(p: Product) {
    onAdd({ key: `product:${p.id}`, kind: "product", id: p.id, name: p.name, price: p.price, qty: 1 });
  }

  function addComboToCart(c: Combo) {
    onAdd({ key: `combo:${c.id}`, kind: "combo", id: c.id, name: c.name, price: c.price, qty: 1, comboItems: c.items });
  }

  // Decisão validada com o usuário: se o produto for componente de mais de
  // um combo ativo, oferece só o primeiro (ordenado por id, já vem assim do
  // backend) — comportamento simplificado, não ideal, mas previsível.
  function handleAddProduct(p: Product) {
    const combo = getQty(`product:${p.id}`) === 0
      ? combos.find((c) => c.items.some((i) => i.product_id === p.id))
      : undefined;
    if (combo) setUpsell({ combo, product: p });
    else addProductToCart(p);
  }

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
          padding: "20px 12px",
          overflowY: "auto",
          borderRight: `1px solid ${T.borderNeutral}`,
          background: T.header,
          flexShrink: 0,
          width: 190,
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

        {/* Zona 3 — Grade de produtos, sempre 3 colunas (vertical ou
            horizontal) — telas de totem são grandes (21-27"), 2 colunas no
            modo vertical desperdiçava espaço mesmo com a coluna de
            categorias ao lado. */}
        <div style={{
          flex: 1,
          padding: "24px 28px",
          paddingBottom: 136,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 20,
          alignContent: "start",
          overflowY: "auto",
        }}>
          {/* ORD-150 — decisão revisada (2026-09-02): combo só aparece na
              categoria em que foi alocado (category_id, ORD-112), não numa
              seção "Destaque" global. Isso já respeita o contexto de
              cardápio de graça: activeCat só existe entre as categorias que
              o backend já filtrou por janela de horário (ORD-127); categoria
              fora da janela nunca vira activeCat, e o combo alocado nela
              simplesmente não aparece. Combo sem category_id não aparece em
              nenhuma categoria. Card visualmente diferenciado do produto
              avulso: fundo em gradiente + selo "COMBO" + preço com economia
              visível sem abrir nada. */}
          {activeCat && combosForActiveCat.length > 0 && (
            <>
              <div style={{ gridColumn: "1/-1", fontFamily: FONT_D, fontWeight: 700, fontSize: FONT.label, color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Destaque
              </div>
              {combosForActiveCat.map((c) => {
                const comboQty = getQty(`combo:${c.id}`);
                const sumAvulso = c.items.reduce((s, i) => s + i.price, 0);
                const savings = sumAvulso - c.price;
                return (
                  <div
                    key={`combo-${c.id}`}
                    style={{
                      background: `linear-gradient(155deg, ${T.catActive}, ${T.surface})`,
                      border: `1.5px solid ${T.btn}`,
                      borderRadius: RADIUS.lg,
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                      boxShadow: T.cardShadow,
                      padding: 16,
                      gap: 8,
                      position: "relative",
                    }}
                  >
                    <span style={{
                      position: "absolute", top: 14, right: 14,
                      background: T.btn, color: T.btnText,
                      fontFamily: FONT_B, fontSize: FONT.caption, fontWeight: 800,
                      borderRadius: RADIUS.pill, padding: "3px 10px", textTransform: "uppercase", letterSpacing: "0.5px",
                    }}>
                      Combo
                    </span>
                    <div style={{ fontFamily: FONT_D, color: T.text, fontWeight: 800, fontSize: FONT.body, paddingRight: 60 }}>
                      {c.name}
                    </div>
                    <div style={{ fontFamily: FONT_B, color: T.muted, fontSize: FONT.label, lineHeight: 1.4 }}>
                      {c.items.map((i) => i.name).join(" + ")}
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: FONT_D, color: T.priceColor, fontWeight: 800, fontSize: FONT.bodyLg }}>{fmt(c.price)}</span>
                      <span style={{ fontFamily: FONT_B, color: T.muted, fontSize: FONT.label, textDecoration: "line-through" }}>{fmt(sumAvulso)}</span>
                      {savings > 0 && (
                        <span style={{ fontFamily: FONT_B, color: "#1c8a53", background: "#e4f6ec", fontSize: FONT.caption, fontWeight: 700, borderRadius: RADIUS.pill, padding: "2px 10px" }}>
                          economize {fmt(savings)}
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      {comboQty > 0 ? (
                        <div style={{ display: "flex", alignItems: "center", background: T.numBg, border: `1px solid ${T.border}`, borderRadius: RADIUS.pill, overflow: "hidden" }}>
                          <button onClick={() => onRemove(`combo:${c.id}`)} style={{ width: 52, height: 52, background: "none", border: "none", color: T.roxo, fontSize: FONT.title, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                          <span style={{ flex: 1, textAlign: "center", fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.subtitle, color: T.text }}>{comboQty}</span>
                          <button onClick={() => addComboToCart(c)} style={{ width: 52, height: 52, background: "none", border: "none", color: T.roxo, fontSize: FONT.title, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addComboToCart(c)}
                          style={{
                            width: "100%", minHeight: 52, borderRadius: RADIUS.pill,
                            background: T.btn, color: T.btnText, border: "none",
                            fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.body,
                            cursor: "pointer", boxShadow: T.glow,
                          }}
                        >
                          Adicionar combo
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {loadingProds ? (
            <div style={{ color: T.muted, gridColumn: "1/-1", fontSize: FONT.bodyLg, padding: "48px 0", textAlign: "center", fontFamily: FONT_B }}>
              Carregando produtos…
            </div>
          ) : products.length === 0 ? (
            <div style={{ color: T.muted, gridColumn: "1/-1", fontSize: FONT.bodyLg, padding: "48px 0", textAlign: "center", fontFamily: FONT_B }}>
              Nenhum produto disponível.
            </div>
          ) : products.map((p, i) => {
            const qty = getQty(`product:${p.id}`);
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
                {/* Imagem — 60% da altura do card. Tags (no máx. 2) viram
                    badges sobrepostos no rodapé da imagem, com gradiente
                    escuro embaixo pra garantir contraste em foto clara —
                    economiza a linha extra que ocupavam no bloco de texto. */}
                <div style={{ position: "relative", width: "100%", height: 180, flexShrink: 0 }}>
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : (
                    <div style={{
                      width: "100%",
                      height: "100%",
                      background: gradient,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: FONT.headlineLg,
                    }}>
                      🍽️
                    </div>
                  )}
                  {p.tags && p.tags.length > 0 && (
                    <div style={{
                      position: "absolute", left: 0, right: 0, bottom: 0,
                      display: "flex", flexWrap: "wrap", gap: 4,
                      padding: "20px 10px 8px",
                      background: "linear-gradient(to top, rgba(0,0,0,0.6), rgba(0,0,0,0))",
                    }}>
                      {p.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          style={{
                            fontFamily: FONT_B,
                            fontSize: FONT.caption,
                            fontWeight: 700,
                            color: "#fff",
                            background: T.roxo,
                            borderRadius: RADIUS.pill,
                            padding: "2px 8px",
                            textTransform: "uppercase",
                            letterSpacing: "0.3px",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Info do produto — flex:1 empurra o bloco de quantidade
                    (abaixo) sempre pro rodapé do card, alinhado entre os
                    cards da mesma linha mesmo quando a descrição varia de
                    tamanho. */}
                <div style={{ flex: 1, padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontFamily: FONT_D, color: T.text, fontWeight: 700, fontSize: FONT.body, lineHeight: 1.2 }}>
                    {p.name}
                  </div>
                  {p.description && (
                    <div style={{ fontFamily: FONT_B, color: T.muted, fontSize: FONT.label, lineHeight: 1.4 }}>
                      {p.description}
                    </div>
                  )}
                  <div style={{ fontFamily: FONT_D, color: T.priceColor, fontWeight: 800, fontSize: FONT.bodyLg, marginTop: 4 }}>
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
                        onClick={() => onRemove(`product:${p.id}`)}
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
                        onClick={() => addProductToCart(p)}
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
                      <span style={{ fontFamily: FONT_B, fontSize: FONT.label, color: T.muted }}>Toque para adicionar</span>
                      <button
                        onClick={() => handleAddProduct(p)}
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
                  <div key={item.key} style={{
                    display: "flex", alignItems: "center", gap: 16,
                    padding: "16px 0", borderBottom: `1px solid ${T.borderNeutral}`,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: FONT_D, color: T.text, fontWeight: 700, fontSize: FONT.bodyLg, display: "flex", alignItems: "center", gap: 8 }}>
                        {item.name}
                        {item.kind === "combo" && (
                          <span style={{
                            fontFamily: FONT_B, fontSize: FONT.caption, fontWeight: 700, color: "#fff",
                            background: T.roxo, borderRadius: RADIUS.pill, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.3px",
                          }}>
                            Combo
                          </span>
                        )}
                      </div>
                      <div style={{ fontFamily: FONT_B, color: T.muted, fontSize: FONT.body, marginTop: 4 }}>
                        {fmt(item.price)} × {item.qty}
                      </div>
                    </div>
                    <div style={{ fontFamily: FONT_D, color: T.priceColor, fontWeight: 800, fontSize: FONT.subtitle }}>
                      {fmt(item.price * item.qty)}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => onRemove(item.key)} style={{ background: T.numBg, border: `1px solid ${T.borderNeutral}`, color: T.roxo, borderRadius: RADIUS.sm, width: 44, height: 44, cursor: "pointer", fontSize: FONT.subtitle, fontWeight: 700 }}>−</button>
                      <button onClick={() => onAdd({ ...item, qty: 1 })} style={{ background: T.numBg, border: `1px solid ${T.borderNeutral}`, color: T.roxo, borderRadius: RADIUS.sm, width: 44, height: 44, cursor: "pointer", fontSize: FONT.subtitle, fontWeight: 700 }}>+</button>
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

      {/* Modal de upsell (ORD-150) — interrompe a adição do produto avulso,
          decisão validada com o usuário: não é um banner discreto.
          Correção pós-QA (2026-09-02): centralizado na tela (não mais um
          bottom sheet, que ficava pouco visível), maior, com badge corrigido
          — usava `color: T.btn` sobre `background: T.catActive`, par que só
          funciona por acaso em alguns temas; catActive/catText já são o par
          contraste-garantido usado em todo o resto do arquivo (ex.: pill de
          categoria ativa) e é o que devia ter sido usado aqui desde o início. */}
      {upsell && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={() => setUpsell(null)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)" }} />
          <div style={{
            position: "relative", width: "min(640px, 100%)", maxHeight: "88vh", overflowY: "auto",
            background: T.surface, borderRadius: RADIUS.lg,
            padding: "40px 40px 32px", display: "flex", flexDirection: "column", gap: 20,
            boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
            border: `1.5px solid ${T.border}`,
          }}>
            <button
              onClick={() => setUpsell(null)}
              style={{
                position: "absolute", top: 16, right: 16, width: 44, height: 44, borderRadius: "50%",
                background: T.numBg, border: `1px solid ${T.borderNeutral}`, color: T.text,
                fontSize: FONT.subtitle, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              ✕
            </button>
            <span style={{
              alignSelf: "flex-start", fontFamily: FONT_B, fontSize: FONT.body, fontWeight: 800,
              color: T.catText, background: T.catActive, borderRadius: RADIUS.pill, padding: "6px 18px",
              textTransform: "uppercase", letterSpacing: "0.5px",
            }}>
              🎉 Combo disponível
            </span>
            <div style={{ fontFamily: FONT_D, color: T.text, fontWeight: 800, fontSize: FONT.headlineLg, lineHeight: 1.2, paddingRight: 40 }}>
              Leve o {upsell.combo.name}
              {upsell.combo.items.reduce((s, i) => s + i.price, 0) - upsell.combo.price > 0 && (
                <> e economize {fmt(upsell.combo.items.reduce((s, i) => s + i.price, 0) - upsell.combo.price)}</>
              )}
            </div>
            <div style={{ background: T.numBg, borderRadius: RADIUS.lg, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
              {upsell.combo.items.map((i) => (
                <div key={i.product_id} style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT_B, fontSize: FONT.bodyLg, color: T.muted }}>
                  <span>{i.name}</span>
                  <span>incluso</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.subtitle, color: T.text, paddingTop: 10, borderTop: `1px dashed ${T.borderNeutral}` }}>
                <span>{upsell.combo.name}</span>
                <span>{fmt(upsell.combo.price)}</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
              <button
                onClick={() => { addComboToCart(upsell.combo); setUpsell(null); }}
                style={{
                  minHeight: 76, borderRadius: RADIUS.pill, background: T.btn, color: T.btnText,
                  border: "none", fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.subtitle, cursor: "pointer", boxShadow: T.glow,
                }}
              >
                Sim, quero o combo
              </button>
              <button
                onClick={() => { addProductToCart(upsell.product); setUpsell(null); }}
                style={{
                  minHeight: 68, borderRadius: RADIUS.pill, background: T.numBg, color: T.text,
                  border: `1px solid ${T.borderNeutral}`, fontFamily: FONT_D, fontWeight: 700, fontSize: FONT.body, cursor: "pointer",
                }}
              >
                Não, só {upsell.product.name}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
