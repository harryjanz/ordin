import { useState, useEffect, useCallback, useRef } from "react";
import api from "../api";
import type { Theme } from "../themes";
import type { Category, Product, CartItem, Combo, ProductOptionGroup, SelectedOption } from "../types";
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
  // ORD-141 — carrega selectedOptions/price/key já resolvidos (calculados
  // antes do upsell decidir se mostra), pro botão "Não, só X" adicionar com
  // a opção escolhida certa em vez de reabrir a seleção.
  const [upsell, setUpsell] = useState<{ combo: Combo; product: Product; selectedOptions: SelectedOption[]; price: number; key: string } | null>(null);

  // ORD-141 — modal de seleção de grupo de opção. `selections` mapeia
  // option_group.id -> ids das opções escolhidas nesse grupo.
  const [optionModal, setOptionModal] = useState<{ product: Product; selections: Record<number, number[]> } | null>(null);

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

  // ORD-141 — mesma ideia de addProductToCart, mas com a(s) opção(ões)
  // escolhida(s) já resolvida(s): nome do carrinho ganha o sufixo da opção
  // (ex. "Refrigerante — Guaraná Antarctica"), preço já vem com os
  // price_delta somados, e a key inclui os ids das opções pra não misturar
  // com outra variante do mesmo produto numa única linha.
  function addProductWithOptionsToCart(p: Product, selectedOptions: SelectedOption[], price: number, key: string) {
    const name = selectedOptions.length
      ? `${p.name} — ${selectedOptions.map((o) => o.option_label).join(", ")}`
      : p.name;
    onAdd({
      key, kind: "product", id: p.id, name, price, qty: 1,
      selectedOptions: selectedOptions.length ? selectedOptions : undefined,
    });
  }

  function addComboToCart(c: Combo) {
    onAdd({ key: `combo:${c.id}`, kind: "combo", id: c.id, name: c.name, price: c.price, qty: 1, comboItems: c.items });
  }

  // ORD-141 — grupos de opção "de verdade" pro produto: ativos e com pelo
  // menos uma opção ativa. Grupo obrigatório sem nenhuma opção selecionável
  // (todas desativadas via ORD-145) é tratado como se não estivesse
  // vinculado — decisão do Tech Explorer, pra não travar a venda inteira
  // do produto por causa de uma opção temporariamente indisponível.
  function selectableOptionGroups(p: Product): ProductOptionGroup[] {
    return (p.option_groups ?? []).filter((g) => g.active && g.options.some((o) => o.active));
  }

  // Decisão validada com o usuário: se o produto for componente de mais de
  // um combo ativo, oferece só o primeiro (ordenado por id, já vem assim do
  // backend) — comportamento simplificado, não ideal, mas previsível.
  // ORD-141 — seleção de opção resolve primeiro; a checagem de upsell abaixo
  // roda depois, com o produto (e sua opção) já definidos.
  function maybeUpsellOrAdd(p: Product, selectedOptions: SelectedOption[], price: number, key: string) {
    // ORD-157 — dois níveis em camada: o combo precisa estar com a
    // sugestão ligada (chave mestra, continua vendável pelo próprio card
    // mesmo desligada) E o item específico comprado avulso precisa ter
    // triggers_upsell=true (ex: burger indica o combo, refrigerante não).
    // ORD-141 — checa por QUALQUER linha desse produto no carrinho (não só
    // a key exata), já que produto com opção pode ter várias linhas
    // diferentes pra um mesmo product_id.
    const hasProductInCart = cart.some((i) => i.kind === "product" && i.id === p.id);
    const combo = !hasProductInCart
      ? combos.find((c) =>
          c.upsell_enabled &&
          c.items.some((i) => i.product_id === p.id && i.triggers_upsell)
        )
      : undefined;
    if (combo) setUpsell({ combo, product: p, selectedOptions, price, key });
    else addProductWithOptionsToCart(p, selectedOptions, price, key);
  }

  function handleAddProduct(p: Product) {
    const groups = selectableOptionGroups(p);
    if (groups.length > 0) {
      setOptionModal({ product: p, selections: {} });
      return;
    }
    maybeUpsellOrAdd(p, [], p.price, `product:${p.id}`);
  }

  function toggleOption(groupId: number, optionId: number, max: number) {
    setOptionModal((prev) => {
      if (!prev) return prev;
      const current = prev.selections[groupId] ?? [];
      let next: number[];
      if (current.includes(optionId)) {
        next = current.filter((id) => id !== optionId);
      } else if (max === 1) {
        next = [optionId]; // seleção única — escolher outra substitui
      } else if (current.length < max) {
        next = [...current, optionId];
      } else {
        next = current; // no limite — novo toque não faz nada (sem substituição automática)
      }
      return { ...prev, selections: { ...prev.selections, [groupId]: next } };
    });
  }

  function confirmOptionModal() {
    if (!optionModal) return;
    const { product, selections } = optionModal;
    const groups = selectableOptionGroups(product);
    const selectedOptions: SelectedOption[] = [];
    let priceExtra = 0;
    const allIds: number[] = [];
    for (const g of groups) {
      for (const optId of selections[g.id] ?? []) {
        const opt = g.options.find((o) => o.id === optId);
        if (!opt) continue;
        selectedOptions.push({ group_name: g.name, option_label: opt.label, price_delta: opt.price_delta });
        priceExtra += opt.price_delta;
        allIds.push(optId);
      }
    }
    allIds.sort((a, b) => a - b);
    const key = allIds.length ? `product:${product.id}:${allIds.join(",")}` : `product:${product.id}`;
    setOptionModal(null);
    maybeUpsellOrAdd(product, selectedOptions, product.price + priceExtra, key);
  }

  const canConfirmOptionModal = optionModal
    ? selectableOptionGroups(optionModal.product).every((g) => {
        const min = g.min_selections_override ?? g.min_selections;
        return (optionModal.selections[g.id]?.length ?? 0) >= min;
      })
    : false;

  // ORD-141 (correção pós-QA do usuário) — preço-base + soma dos deltas
  // já selecionados, recalculado a cada seleção/desmarcação. Sem isso o
  // cliente só via o acréscimo de cada opção isolado, nunca quanto o
  // produto ficava no total — feedback explícito de precisar ficar visível.
  const optionModalTotal = optionModal
    ? optionModal.product.price + selectableOptionGroups(optionModal.product).reduce(
        (sum, g) => sum + (optionModal.selections[g.id] ?? []).reduce(
          (s, optId) => s + (g.options.find((o) => o.id === optId)?.price_delta ?? 0), 0,
        ), 0,
      )
    : 0;

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
                      position: "relative",
                    }}
                  >
                    {/* ORD-153 — mesma área de imagem do card de produto
                        (altura menor, 140 vs 180, porque o combo já tem mais
                        conteúdo de texto embaixo); placeholder com o mesmo
                        emoji quando não tem imagem cadastrada. */}
                    <div style={{ position: "relative", width: "100%", height: 140, flexShrink: 0 }}>
                      {c.image_url ? (
                        <img src={c.image_url} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      ) : (
                        <div style={{
                          width: "100%",
                          height: "100%",
                          background: T.placeholderA,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: FONT.headlineLg,
                        }}>
                          🍽️
                        </div>
                      )}
                      <span style={{
                        position: "absolute", top: 14, right: 14,
                        background: T.btn, color: T.btnText,
                        fontFamily: FONT_B, fontSize: FONT.caption, fontWeight: 800,
                        borderRadius: RADIUS.pill, padding: "3px 10px", textTransform: "uppercase", letterSpacing: "0.5px",
                      }}>
                        Combo
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
                      <div style={{ fontFamily: FONT_D, color: T.text, fontWeight: 800, fontSize: FONT.body }}>
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
            // ORD-141 — produto com grupo de opção pode ter várias linhas no
            // carrinho (uma por combinação de opção escolhida), então o
            // card não usa mais o stepper +/- direto (ambíguo: qual linha
            // incrementar?). Ajuste de quantidade por variante acontece no
            // carrinho, onde cada linha já tem seu próprio +/- por key.
            const qty = selectableOptionGroups(p).length > 0 ? 0 : getQty(`product:${p.id}`);
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

      {/* Modal de seleção de grupo de opção (ORD-141) — mesma estrutura
          visual do modal de upsell (overlay + card central), reaproveitada
          por decisão do Explorer em vez de um segundo padrão de UI. Grupo
          obrigatório (min_selections efetivo >= 1) trava o botão Confirmar
          até a contagem bater; grupo opcional não trava nada. */}
      {optionModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={() => setOptionModal(null)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)" }} />
          <div style={{
            position: "relative", width: "min(640px, 100%)", maxHeight: "88vh", overflowY: "auto",
            background: T.surface, borderRadius: RADIUS.lg,
            padding: "40px 40px 32px", display: "flex", flexDirection: "column", gap: 20,
            boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
            border: `1.5px solid ${T.border}`,
          }}>
            <button
              onClick={() => setOptionModal(null)}
              style={{
                position: "absolute", top: 16, right: 16, width: 44, height: 44, borderRadius: "50%",
                background: T.numBg, border: `1px solid ${T.borderNeutral}`, color: T.text,
                fontSize: FONT.subtitle, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              ✕
            </button>
            <div>
              <div style={{ fontFamily: FONT_D, color: T.text, fontWeight: 800, fontSize: FONT.title, lineHeight: 1.3, paddingRight: 40 }}>
                {optionModal.product.name}
              </div>
              <div style={{ fontFamily: FONT_B, color: T.muted, fontSize: FONT.label, marginTop: 4 }}>
                A partir de {fmt(optionModal.product.price)}
              </div>
            </div>
            {selectableOptionGroups(optionModal.product).map((g) => {
              const min = g.min_selections_override ?? g.min_selections;
              const max = g.max_selections_override ?? g.max_selections;
              const selected = optionModal.selections[g.id] ?? [];
              return (
                <div key={g.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontFamily: FONT_D, fontWeight: 700, fontSize: FONT.bodyLg, color: T.text }}>{g.name}</span>
                    <span style={{ fontFamily: FONT_B, fontSize: FONT.label, color: T.muted }}>
                      {min >= 1 ? `Escolha ${max > min ? `de ${min} a ${max}` : min}` : `Opcional${max > 1 ? ` — até ${max}` : ""}`}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {g.options.filter((o) => o.active).map((o) => {
                      const isSelected = selected.includes(o.id);
                      const atMax = !isSelected && selected.length >= max;
                      return (
                        <button
                          key={o.id}
                          disabled={atMax}
                          onClick={() => toggleOption(g.id, o.id, max)}
                          style={{
                            display: "flex", alignItems: "center", gap: 14,
                            padding: 10, borderRadius: RADIUS.lg, cursor: atMax ? "default" : "pointer",
                            background: isSelected ? T.catActive : T.numBg,
                            color: isSelected ? T.catText : T.text,
                            border: `1.5px solid ${isSelected ? T.catActive : T.borderNeutral}`,
                            opacity: atMax ? 0.45 : 1,
                            fontFamily: FONT_B, fontWeight: 700, fontSize: FONT.body,
                            textAlign: "left",
                          }}
                        >
                          {/* ORD-141 (correção pós-QA) — opção com foto cadastrada
                              (ORD-138) precisa de layout que caiba a imagem, não só
                              o rótulo em texto puro. Placeholder com emoji quando
                              não tem imagem, mesmo padrão do card de combo (ORD-153). */}
                          <div style={{ width: 56, height: 56, flexShrink: 0, borderRadius: RADIUS.sm, overflow: "hidden" }}>
                            {o.thumbnail_url || o.image_url ? (
                              <img
                                src={o.thumbnail_url ?? o.image_url ?? undefined}
                                alt={o.label}
                                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                              />
                            ) : (
                              <div style={{
                                width: "100%", height: "100%", background: T.placeholderA,
                                display: "flex", alignItems: "center", justifyContent: "center", fontSize: FONT.subtitle,
                              }}>
                                🍽️
                              </div>
                            )}
                          </div>
                          <span style={{ flex: 1 }}>{o.label}</span>
                          {/* Preço adicional em destaque — some quando delta=0
                              (sabor padrão, incluído no preço-base) em vez de
                              mostrar "R$ 0,00", que soaria como cobrança dupla. */}
                          {o.price_delta > 0 && (
                            <span style={{
                              fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.body,
                              color: isSelected ? T.catText : T.priceColor,
                            }}>
                              +{fmt(o.price_delta)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 12, borderTop: `1px dashed ${T.borderNeutral}` }}>
              <span style={{ fontFamily: FONT_B, color: T.muted, fontSize: FONT.bodyLg, fontWeight: 600 }}>Total</span>
              <span style={{ fontFamily: FONT_D, color: T.priceColor, fontWeight: 900, fontSize: FONT.title }}>{fmt(optionModalTotal)}</span>
            </div>
            <button
              onClick={confirmOptionModal}
              disabled={!canConfirmOptionModal}
              style={{
                minHeight: 76, borderRadius: RADIUS.pill,
                background: canConfirmOptionModal ? T.btn : T.numBg,
                color: canConfirmOptionModal ? T.btnText : T.muted,
                border: canConfirmOptionModal ? "none" : `1px solid ${T.borderNeutral}`,
                fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.subtitle,
                cursor: canConfirmOptionModal ? "pointer" : "default",
                boxShadow: canConfirmOptionModal ? T.glow : "none",
                marginTop: 4,
              }}
            >
              Confirmar
            </button>
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
            {/* ORD-153 — só renderiza se tiver imagem; sem placeholder aqui
                (diferente do card na grade) porque o modal já funciona bem
                só com texto — combo sem foto não perde nada essencial. */}
            {upsell.combo.image_url && (
              <img
                src={upsell.combo.image_url}
                alt={upsell.combo.name}
                style={{ width: "100%", height: 320, objectFit: "cover", borderRadius: RADIUS.lg, display: "block" }}
              />
            )}
            <div style={{ fontFamily: FONT_D, color: T.text, fontWeight: 800, fontSize: FONT.title, lineHeight: 1.3, paddingRight: 40 }}>
              Leve o {upsell.combo.name}
              {upsell.combo.items.reduce((s, i) => s + i.price, 0) - upsell.combo.price > 0 && (
                <>
                  {" "}e{" "}
                  <span style={{ color: "#1c8a53", background: "#e4f6ec", borderRadius: RADIUS.pill, padding: "2px 12px", whiteSpace: "nowrap", display: "inline-block" }}>
                    economize {fmt(upsell.combo.items.reduce((s, i) => s + i.price, 0) - upsell.combo.price)}
                  </span>
                </>
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
                onClick={() => { addProductWithOptionsToCart(upsell.product, upsell.selectedOptions, upsell.price, upsell.key); setUpsell(null); }}
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
