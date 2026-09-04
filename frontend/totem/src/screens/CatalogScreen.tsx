import { useState, useEffect, useCallback, useRef } from "react";
import { Home, ShoppingCart, Plus, Minus, X, UtensilsCrossed, PartyPopper, Tag } from "lucide-react";
import api from "../api";
import type { Theme } from "../themes";
import type { Category, Product, CartItem, Combo, ComboItemRef, ProductOptionGroup, SelectedOption } from "../types";
import { RADIUS, FONT } from "../scale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { Sheet, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";

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

  // ORD-159 — mesma ideia do optionModal, mas por combo: `selections` tem
  // uma camada a mais (product_id do componente -> option_group.id -> ids
  // escolhidos), já que um combo pode ter N componentes com grupo.
  const [comboOptionModal, setComboOptionModal] = useState<{ combo: Combo; selections: Record<number, Record<number, number[]>> } | null>(null);

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

  function addComboToCart(c: Combo, comboItems?: ComboItemRef[], key?: string) {
    onAdd({ key: key ?? `combo:${c.id}`, kind: "combo", id: c.id, name: c.name, price: c.price, qty: 1, comboItems: comboItems ?? c.items });
  }

  // ORD-141 — grupos de opção "de verdade" pro produto: ativos e com pelo
  // menos uma opção ativa. Grupo obrigatório sem nenhuma opção selecionável
  // (todas desativadas via ORD-145) é tratado como se não estivesse
  // vinculado — decisão do Tech Explorer, pra não travar a venda inteira
  // do produto por causa de uma opção temporariamente indisponível.
  // ORD-159 — generalizada pra aceitar qualquer coisa com option_groups
  // (Product ou ComboItemRef), já que o mesmo filtro vale pro componente
  // de um combo.
  function selectableOptionGroups(p: { option_groups?: ProductOptionGroup[] }): ProductOptionGroup[] {
    return (p.option_groups ?? []).filter((g) => g.active && g.options.some((o) => o.active));
  }

  // ORD-159 — decide se o combo precisa do modal de seleção por componente
  // (algum item tem grupo selecionável) ou entra direto no carrinho, igual
  // hoje. Chamado tanto pelo card do catálogo quanto pelo "Sim, quero o
  // combo" do upsell — um só ponto de entrada, sem duplicar a checagem.
  function tryAddCombo(c: Combo) {
    const needsSelection = c.items.some((i) => selectableOptionGroups(i).length > 0);
    if (needsSelection) {
      setComboOptionModal({ combo: c, selections: {} });
      return;
    }
    addComboToCart(c);
  }

  function toggleComboOption(productId: number, groupId: number, optionId: number, max: number) {
    setComboOptionModal((prev) => {
      if (!prev) return prev;
      const productSelections = prev.selections[productId] ?? {};
      const current = productSelections[groupId] ?? [];
      let next: number[];
      if (current.includes(optionId)) {
        next = current.filter((id) => id !== optionId);
      } else if (current.length < max) {
        next = [...current, optionId];
      } else {
        // Mesma troca-automática-no-limite do ORD-141 (pós-QA) — reaproveitada
        // aqui pra não reescrever a regra.
        next = [...current.slice(1), optionId];
      }
      return {
        ...prev,
        selections: { ...prev.selections, [productId]: { ...productSelections, [groupId]: next } },
      };
    });
  }

  function confirmComboOptionModal() {
    if (!comboOptionModal) return;
    const { combo, selections } = comboOptionModal;
    const allIds: number[] = [];
    const comboItems: ComboItemRef[] = combo.items.map((item) => {
      const groups = selectableOptionGroups(item);
      if (groups.length === 0) return item;
      const productSelections = selections[item.product_id] ?? {};
      const selectedOptions: SelectedOption[] = [];
      for (const g of groups) {
        for (const optId of productSelections[g.id] ?? []) {
          const opt = g.options.find((o) => o.id === optId);
          if (!opt) continue;
          selectedOptions.push({ group_name: g.name, option_label: opt.label, price_delta: opt.price_delta });
          allIds.push(optId);
        }
      }
      return selectedOptions.length ? { ...item, selectedOptions } : item;
    });
    allIds.sort((a, b) => a - b);
    const key = allIds.length ? `combo:${combo.id}:${allIds.join(",")}` : `combo:${combo.id}`;
    setComboOptionModal(null);
    addComboToCart(combo, comboItems, key);
  }

  const canConfirmComboOptionModal = comboOptionModal
    ? comboOptionModal.combo.items.every((item) =>
        selectableOptionGroups(item).every((g) => {
          const min = g.min_selections_override ?? g.min_selections;
          return (comboOptionModal.selections[item.product_id]?.[g.id]?.length ?? 0) >= min;
        }),
      )
    : false;

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
      } else if (current.length < max) {
        next = [...current, optionId];
      } else {
        // ORD-141 (correção pós-QA) — no limite (inclusive seleção única,
        // max=1), tocar numa opção nova troca a mais antiga automaticamente
        // em vez de exigir desmarcar antes. Sem isso o cliente que já
        // escolheu "Guaraná" e quer trocar pra "Coca-Cola" precisava de 2
        // toques (desmarcar, depois marcar) em vez de 1 — feedback direto
        // do usuário testando manualmente.
        next = [...current.slice(1), optionId];
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
  // de faixa horizontal pra coluna lateral. EXPERIMENTO — shadcn Toggle
  // (react-aria-components ToggleButton por baixo) no lugar do <button>
  // manual; isSelected em vez de comparar id na mão em cada render.
  const categoriesContent = loadingCat ? (
    isVertical
      ? Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="w-full shrink-0" style={{ height: 48, borderRadius: RADIUS.sm }} />
        ))
      : Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="shrink-0" style={{ height: 48, width: 120, borderRadius: RADIUS.pill }} />
        ))
  ) : categories.map((cat) => (
    <Toggle
      key={cat.id}
      isSelected={activeCat?.id === cat.id}
      onChange={() => setActiveCat(cat)}
      className={
        isVertical
          ? "w-full justify-start text-left"
          : "shrink-0"
      }
      style={{
        minHeight: 48,
        borderRadius: isVertical ? RADIUS.sm : RADIUS.pill,
        fontFamily: FONT_D,
        fontWeight: 700,
        fontSize: FONT.body,
        paddingLeft: isVertical ? 20 : 24,
        paddingRight: isVertical ? 20 : 24,
        background: activeCat?.id === cat.id ? T.catActive : "transparent",
        color: activeCat?.id === cat.id ? T.catText : T.muted,
        border: `1px solid ${activeCat?.id === cat.id ? T.btn : T.borderNeutral}`,
        boxShadow: activeCat?.id === cat.id ? T.glow : "none",
      }}
    >
      {cat.name}
    </Toggle>
  ));

  return (
    <div className="min-h-screen flex flex-col bg-background">

      {/* Zona 1 — Header */}
      <div
        className="bg-header px-7 py-4 flex items-center justify-between border-b shrink-0 z-10"
        style={{ boxShadow: T.cardShadow, minHeight: 72 }}
      >
        <div className="text-brand tracking-tight" style={{ fontFamily: FONT_D, fontWeight: 900, fontSize: FONT.title }}>
          {companyName}
        </div>
        <Button variant="outline" onClick={onHome} className="rounded-full" style={{ minHeight: 52, fontFamily: FONT_D, fontWeight: 700, fontSize: FONT.body, paddingLeft: 24, paddingRight: 24 }}>
          <Home className="size-4" /> Início
        </Button>
      </div>

      {/* Zona 2 (categorias) + Zona 3 (grade) — lado a lado no modo
          vertical, empilhadas no horizontal (padrão, comportamento
          inalterado). */}
      <div className={`flex-1 flex overflow-hidden min-h-0 ${isVertical ? "flex-row" : "flex-col"}`}>
        {/* Zona 2 — Categorias */}
        <div
          className={`bg-header shrink-0 ${isVertical ? "flex flex-col gap-2 py-5 px-3 overflow-y-auto border-r w-[190px]" : "flex gap-3 px-7 py-4 overflow-x-auto border-b items-center"}`}
          style={!isVertical ? { minHeight: 68 } : undefined}
        >
          {categoriesContent}
        </div>

        {/* Zona 3 — Grade de produtos, sempre 3 colunas (vertical ou
            horizontal) — telas de totem são grandes (21-27"), 2 colunas no
            modo vertical desperdiçava espaço mesmo com a coluna de
            categorias ao lado. */}
        <div className="flex-1 px-7 pt-6 grid grid-cols-3 gap-5 content-start overflow-y-auto" style={{ paddingBottom: 136 }}>
          {/* ORD-150 — decisão revisada (2026-09-02): combo só aparece na
              categoria em que foi alocado (category_id, ORD-112), não numa
              seção "Destaque" global. Card visualmente diferenciado do
              produto avulso: fundo em gradiente + selo "COMBO" + preço com
              economia visível sem abrir nada. */}
          {activeCat && combosForActiveCat.length > 0 && (
            <>
              <div className="col-span-3 uppercase tracking-wide text-muted-foreground" style={{ fontFamily: FONT_D, fontWeight: 700, fontSize: FONT.label }}>
                Destaque
              </div>
              {combosForActiveCat.map((c) => {
                // ORD-159 — mesma ideia do produto com grupo de opção
                // (`qty` forçado a 0 no card avulso): combo com componente
                // de opção pode gerar várias linhas (uma por combinação
                // escolhida), então o stepper direto no card fica ambíguo —
                // sempre mostra "Adicionar combo", que abre o modal.
                const comboNeedsSelection = c.items.some((i) => selectableOptionGroups(i).length > 0);
                const comboQty = comboNeedsSelection ? 0 : getQty(`combo:${c.id}`);
                const sumAvulso = c.items.reduce((s, i) => s + i.price, 0);
                const savings = sumAvulso - c.price;
                return (
                  <Card
                    key={`combo-${c.id}`}
                    className="p-0 gap-0 relative"
                    style={{
                      background: `linear-gradient(155deg, ${T.catActive}, ${T.surface})`,
                      border: `1.5px solid ${T.btn}`,
                      boxShadow: T.cardShadow,
                    }}
                  >
                    {/* ORD-153 — mesma área de imagem do card de produto
                        (altura menor, 140 vs 180). */}
                    <div className="relative w-full shrink-0" style={{ height: 140 }}>
                      {c.image_url ? (
                        <img src={c.image_url} alt={c.name} className="w-full h-full object-cover block" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{ background: T.placeholderA }}>
                          <UtensilsCrossed className="size-10 text-white/70" />
                        </div>
                      )}
                      <Badge className="absolute top-3.5 right-3.5 uppercase tracking-wide" style={{ background: T.btn, color: T.btnText, fontFamily: FONT_B }}>
                        Combo
                      </Badge>
                    </div>
                    <CardContent className="flex flex-col gap-2 p-4">
                      <div className="text-foreground" style={{ fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.body }}>
                        {c.name}
                      </div>
                      <div className="text-muted-foreground leading-snug" style={{ fontFamily: FONT_B, fontSize: FONT.label }}>
                        {c.items.map((i) => i.name).join(" + ")}
                      </div>
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-price" style={{ fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.bodyLg }}>{fmt(c.price)}</span>
                        <span className="text-muted-foreground line-through" style={{ fontFamily: FONT_B, fontSize: FONT.label }}>{fmt(sumAvulso)}</span>
                        {savings > 0 && (
                          <Badge variant="secondary" className="text-[#1c8a53] bg-[#e4f6ec]">
                            economize {fmt(savings)}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1">
                        {comboQty > 0 ? (
                          <div className="flex items-center rounded-full overflow-hidden border" style={{ background: T.numBg }}>
                            <Button variant="ghost" onClick={() => onRemove(`combo:${c.id}`)} className="rounded-none" style={{ width: 52, height: 52, color: T.roxo }}>
                              <Minus className="size-5" />
                            </Button>
                            <span className="flex-1 text-center" style={{ fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.subtitle, color: T.text }}>{comboQty}</span>
                            <Button variant="ghost" onClick={() => addComboToCart(c)} className="rounded-none" style={{ width: 52, height: 52, color: T.roxo }}>
                              <Plus className="size-5" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            onClick={() => tryAddCombo(c)}
                            className="w-full rounded-full"
                            style={{ minHeight: 52, background: T.btn, color: T.btnText, fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.body, boxShadow: T.glow }}
                          >
                            Adicionar combo
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </>
          )}

          {loadingProds ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-3">
                <Skeleton style={{ height: 180, borderRadius: RADIUS.lg }} />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton style={{ height: 52, borderRadius: RADIUS.pill }} />
              </div>
            ))
          ) : products.length === 0 ? (
            <Empty className="col-span-3">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UtensilsCrossed />
                </EmptyMedia>
                <EmptyTitle>Nenhum produto disponível</EmptyTitle>
                <EmptyDescription>Essa categoria não tem itens no cardápio agora.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : products.map((p, i) => {
            // ORD-141 — produto com grupo de opção pode ter várias linhas no
            // carrinho (uma por combinação de opção escolhida), então o
            // card não usa mais o stepper +/- direto (ambíguo: qual linha
            // incrementar?). Ajuste de quantidade por variante acontece no
            // carrinho, onde cada linha já tem seu próprio +/- por key.
            const qty = selectableOptionGroups(p).length > 0 ? 0 : getQty(`product:${p.id}`);
            const gradient = i % 2 === 0 ? T.placeholderA : T.placeholderB;
            return (
              <Card
                key={p.id}
                className="p-0 gap-0 transition-transform hover:-translate-y-0.5"
                style={{ border: `1px solid ${T.borderNeutral}`, boxShadow: T.cardShadow }}
              >
                {/* Imagem — 60% da altura do card. Tags (no máx. 2) viram
                    badges sobrepostos no rodapé da imagem. */}
                <div className="relative w-full shrink-0" style={{ height: 180 }}>
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover block" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: gradient }}>
                      <UtensilsCrossed className="size-12 text-white/70" />
                    </div>
                  )}
                  {p.tags && p.tags.length > 0 && (
                    <div className="absolute left-0 right-0 bottom-0 flex flex-wrap gap-1 px-2.5 pt-5 pb-2" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.6), rgba(0,0,0,0))" }}>
                      {p.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} className="uppercase tracking-wide text-white" style={{ background: T.roxo, fontFamily: FONT_B }}>
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Info do produto — flex:1 empurra o bloco de quantidade
                    (abaixo) sempre pro rodapé do card. */}
                <CardContent className="flex-1 flex flex-col gap-1 pt-4 px-4">
                  <div className="text-foreground leading-tight" style={{ fontFamily: FONT_D, fontWeight: 700, fontSize: FONT.body }}>
                    {p.name}
                  </div>
                  {p.description && (
                    <div className="text-muted-foreground leading-snug" style={{ fontFamily: FONT_B, fontSize: FONT.label }}>
                      {p.description}
                    </div>
                  )}
                  <div className="text-price mt-1" style={{ fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.bodyLg }}>
                    {fmt(p.price)}
                  </div>
                </CardContent>

                {/* Controle de quantidade */}
                <div className="px-4 pt-3 pb-4">
                  {qty > 0 ? (
                    <div className="flex items-center rounded-full overflow-hidden border" style={{ background: T.numBg }}>
                      <Button variant="ghost" onClick={() => onRemove(`product:${p.id}`)} className="rounded-none" style={{ width: 52, height: 52, color: T.roxo }}>
                        <Minus className="size-5" />
                      </Button>
                      <span className="flex-1 text-center" style={{ fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.subtitle, color: T.text }}>
                        {qty}
                      </span>
                      <Button variant="ghost" onClick={() => addProductToCart(p)} className="rounded-none" style={{ width: 52, height: 52, color: T.roxo }}>
                        <Plus className="size-5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground" style={{ fontFamily: FONT_B, fontSize: FONT.label }}>Toque para adicionar</span>
                      <Button
                        onClick={() => handleAddProduct(p)}
                        className="rounded-full shrink-0"
                        style={{ width: 52, height: 52, background: T.btn, color: T.btnText, boxShadow: T.glow }}
                      >
                        <Plus className="size-5" />
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Zona 4 — Carrinho fixo */}
      <div className="fixed bottom-0 left-0 right-0 px-6 pb-6 pt-4 z-50" style={{ background: `linear-gradient(0deg, ${T.bg} 78%, transparent)` }}>
        <Button
          onClick={() => count > 0 && setCartOpen(true)}
          className="w-full rounded-full justify-between"
          style={{
            minHeight: 90, padding: "0 28px",
            background: count > 0 ? T.btn : T.surface,
            border: `1px solid ${count > 0 ? "transparent" : T.borderNeutral}`,
            color: count > 0 ? T.btnText : T.muted,
            fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.subtitle,
            boxShadow: count > 0 ? T.glow : T.cardShadow,
          }}
        >
          <span className="flex items-center gap-2"><ShoppingCart className="size-5" /> {count > 0 ? `Ver pedido (${count} item${count > 1 ? "s" : ""})` : "Carrinho vazio"}</span>
          {count > 0 && (
            <span className="rounded-full" style={{ background: "rgba(0,0,0,0.18)", padding: "8px 24px", fontSize: FONT.subtitle, fontWeight: 900 }}>
              {fmt(total)} →
            </span>
          )}
        </Button>
      </div>

      {/* Cart Drawer — EXPERIMENTO: Sheet do shadcn (Modal/ModalOverlay do
          React Aria por baixo) no lugar do overlay+div feito à mão. Foco
          preso, ESC fecha, scroll do body bloqueado — de graça. */}
      <Sheet isOpen={cartOpen} onOpenChange={setCartOpen} side="right" className="w-[440px] sm:max-w-[440px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2" style={{ fontFamily: FONT_D, color: T.text, fontSize: FONT.subtitle, fontWeight: 800 }}>
            <ShoppingCart className="size-5" /> Meu pedido
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 flex flex-col gap-4 px-4 pb-4 overflow-y-auto">
          {cart.length === 0 ? (
            <p className="text-center text-muted-foreground mt-12" style={{ fontSize: FONT.bodyLg, fontFamily: FONT_B }}>
              Carrinho vazio
            </p>
          ) : (
            <>
              {cart.map((item) => (
                <div key={item.key} className="flex items-center gap-4 py-4 border-b">
                  <div className="flex-1">
                    <div className="flex items-center gap-2" style={{ fontFamily: FONT_D, color: T.text, fontWeight: 700, fontSize: FONT.bodyLg }}>
                      {item.name}
                      {item.kind === "combo" && (
                        <Badge className="uppercase tracking-wide text-white" style={{ background: T.roxo, fontFamily: FONT_B }}>
                          Combo
                        </Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground mt-1" style={{ fontFamily: FONT_B, fontSize: FONT.body }}>
                      {fmt(item.price)} × {item.qty}
                    </div>
                  </div>
                  <div className="text-price" style={{ fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.subtitle }}>
                    {fmt(item.price * item.qty)}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={() => onRemove(item.key)} style={{ width: 44, height: 44, color: T.roxo }}>
                      <Minus className="size-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => onAdd({ ...item, qty: 1 })} style={{ width: 44, height: 44, color: T.roxo }}>
                      <Plus className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="mt-auto">
                <div className="flex justify-between py-5 border-t">
                  <span className="text-muted-foreground" style={{ fontFamily: FONT_B, fontSize: FONT.bodyLg, fontWeight: 600 }}>Total</span>
                  <span style={{ fontFamily: FONT_D, color: T.text, fontWeight: 900, fontSize: FONT.title }}>{fmt(total)}</span>
                </div>
                <Button
                  onClick={() => { setCartOpen(false); onCheckout(); }}
                  className="w-full rounded-full"
                  style={{ minHeight: 90, background: T.btn, color: T.btnText, fontFamily: FONT_D, fontSize: FONT.subtitle, fontWeight: 800, boxShadow: T.glow }}
                >
                  Finalizar pedido →
                </Button>
              </div>
            </>
          )}
        </div>
      </Sheet>

      {/* Modal de seleção de grupo de opção (ORD-141) — EXPERIMENTO: Dialog
          do shadcn (React Aria por baixo) no lugar do overlay feito à mão.
          Grupo obrigatório (min_selections efetivo >= 1) trava o botão
          Confirmar até a contagem bater; grupo opcional não trava nada. */}
      <Dialog
        isOpen={!!optionModal}
        onOpenChange={(open) => !open && setOptionModal(null)}
        className="sm:max-w-[760px] max-h-[88vh] overflow-y-auto flex flex-col gap-5 p-10"
      >
        {optionModal && (
          <>
            <div>
              <DialogTitle className="leading-tight pr-10" style={{ fontFamily: FONT_D, color: T.text, fontWeight: 800, fontSize: FONT.title }}>
                {optionModal.product.name}
              </DialogTitle>
              <div className="text-muted-foreground mt-1" style={{ fontFamily: FONT_B, fontSize: FONT.label }}>
                A partir de {fmt(optionModal.product.price)}
              </div>
            </div>
            {selectableOptionGroups(optionModal.product).map((g) => {
              const min = g.min_selections_override ?? g.min_selections;
              const max = g.max_selections_override ?? g.max_selections;
              const selected = optionModal.selections[g.id] ?? [];
              return (
                <div key={g.id} className="flex flex-col gap-2.5">
                  <div className="flex justify-between items-baseline">
                    <span style={{ fontFamily: FONT_D, fontWeight: 700, fontSize: FONT.bodyLg, color: T.text }}>{g.name}</span>
                    <span className="text-muted-foreground" style={{ fontFamily: FONT_B, fontSize: FONT.label }}>
                      {min >= 1 ? `Escolha ${max > min ? `de ${min} a ${max}` : min}` : `Opcional${max > 1 ? ` — até ${max}` : ""}`}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {g.options.filter((o) => o.active).map((o) => {
                      const isSelected = selected.includes(o.id);
                      return (
                        <Toggle
                          key={o.id}
                          isSelected={isSelected}
                          onChange={() => toggleOption(g.id, o.id, max)}
                          className="w-full justify-start h-auto"
                          style={{
                            padding: 12, borderRadius: RADIUS.lg,
                            background: isSelected ? T.catActive : T.numBg,
                            color: isSelected ? T.catText : T.text,
                            border: `1.5px solid ${isSelected ? T.catActive : T.borderNeutral}`,
                            fontFamily: FONT_B, fontWeight: 700, fontSize: FONT.subtitle,
                          }}
                        >
                          <div className="shrink-0 rounded-lg overflow-hidden" style={{ width: 88, height: 88, borderRadius: RADIUS.lg }}>
                            {o.thumbnail_url || o.image_url ? (
                              <img
                                src={o.thumbnail_url ?? o.image_url ?? undefined}
                                alt={o.label}
                                className="w-full h-full object-cover block"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center" style={{ background: T.placeholderA }}>
                                <UtensilsCrossed className="size-7 text-white/70" />
                              </div>
                            )}
                          </div>
                          <span className="flex-1 text-left">{o.label}</span>
                          {o.price_delta > 0 && (
                            <span style={{ fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.subtitle, color: isSelected ? T.catText : T.priceColor }}>
                              +{fmt(o.price_delta)}
                            </span>
                          )}
                        </Toggle>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div className="flex justify-between items-baseline pt-3 border-t border-dashed">
              <span className="text-muted-foreground" style={{ fontFamily: FONT_B, fontSize: FONT.bodyLg, fontWeight: 600 }}>Total</span>
              <span className="text-price" style={{ fontFamily: FONT_D, fontWeight: 900, fontSize: FONT.title }}>{fmt(optionModalTotal)}</span>
            </div>
            <Button
              onClick={confirmOptionModal}
              isDisabled={!canConfirmOptionModal}
              className="rounded-full mt-1"
              style={{
                minHeight: 76,
                background: canConfirmOptionModal ? T.btn : T.numBg,
                color: canConfirmOptionModal ? T.btnText : T.muted,
                border: canConfirmOptionModal ? "none" : `1px solid ${T.borderNeutral}`,
                fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.subtitle,
                boxShadow: canConfirmOptionModal ? T.glow : "none",
              }}
            >
              Confirmar
            </Button>
          </>
        )}
      </Dialog>

      {/* Modal de seleção de opção por componente de combo (ORD-159) —
          mesma estrutura do modal de produto avulso acima, organizada em
          uma seção por componente do combo que tiver grupo selecionável. */}
      <Dialog
        isOpen={!!comboOptionModal}
        onOpenChange={(open) => !open && setComboOptionModal(null)}
        className="sm:max-w-[760px] max-h-[88vh] overflow-y-auto flex flex-col gap-7 p-10"
      >
        {comboOptionModal && (
          <>
            <div>
              <DialogTitle className="leading-tight pr-10" style={{ fontFamily: FONT_D, color: T.text, fontWeight: 800, fontSize: FONT.title }}>
                {comboOptionModal.combo.name}
              </DialogTitle>
              <div className="text-muted-foreground mt-1" style={{ fontFamily: FONT_B, fontSize: FONT.label }}>
                {fmt(comboOptionModal.combo.price)}
              </div>
            </div>
            {comboOptionModal.combo.items.filter((item) => selectableOptionGroups(item).length > 0).map((item) => (
              <div key={item.product_id} className="flex flex-col gap-5">
                <div className="border-b pb-2.5" style={{ fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.bodyLg, color: T.text }}>
                  {item.name}
                </div>
                {selectableOptionGroups(item).map((g) => {
                  const min = g.min_selections_override ?? g.min_selections;
                  const max = g.max_selections_override ?? g.max_selections;
                  const selected = comboOptionModal.selections[item.product_id]?.[g.id] ?? [];
                  return (
                    <div key={g.id} className="flex flex-col gap-2.5">
                      {/* ORD-159 (ajuste pós-teste manual) — sem o nome do
                          grupo aqui: o cabeçalho do componente já identifica
                          o que está sendo escolhido. */}
                      <div className="flex justify-end">
                        <span className="text-muted-foreground" style={{ fontFamily: FONT_B, fontSize: FONT.label }}>
                          {min >= 1 ? `Escolha ${max > min ? `de ${min} a ${max}` : min}` : `Opcional${max > 1 ? ` — até ${max}` : ""}`}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {g.options.filter((o) => o.active).map((o) => {
                          const isSelected = selected.includes(o.id);
                          return (
                            <Toggle
                              key={o.id}
                              isSelected={isSelected}
                              onChange={() => toggleComboOption(item.product_id, g.id, o.id, max)}
                              className="w-full justify-start h-auto"
                              style={{
                                padding: 12, borderRadius: RADIUS.lg,
                                background: isSelected ? T.catActive : T.numBg,
                                color: isSelected ? T.catText : T.text,
                                border: `1.5px solid ${isSelected ? T.catActive : T.borderNeutral}`,
                                fontFamily: FONT_B, fontWeight: 700, fontSize: FONT.subtitle,
                              }}
                            >
                              <div className="shrink-0 overflow-hidden" style={{ width: 88, height: 88, borderRadius: RADIUS.lg }}>
                                {o.thumbnail_url || o.image_url ? (
                                  <img
                                    src={o.thumbnail_url ?? o.image_url ?? undefined}
                                    alt={o.label}
                                    className="w-full h-full object-cover block"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center" style={{ background: T.placeholderA }}>
                                    <UtensilsCrossed className="size-7 text-white/70" />
                                  </div>
                                )}
                              </div>
                              <span className="flex-1 text-left">{o.label}</span>
                            </Toggle>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            <Button
              onClick={confirmComboOptionModal}
              isDisabled={!canConfirmComboOptionModal}
              className="rounded-full mt-1"
              style={{
                minHeight: 76,
                background: canConfirmComboOptionModal ? T.btn : T.numBg,
                color: canConfirmComboOptionModal ? T.btnText : T.muted,
                border: canConfirmComboOptionModal ? "none" : `1px solid ${T.borderNeutral}`,
                fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.subtitle,
                boxShadow: canConfirmComboOptionModal ? T.glow : "none",
              }}
            >
              Confirmar
            </Button>
          </>
        )}
      </Dialog>

      {/* Modal de upsell (ORD-150) — interrompe a adição do produto avulso,
          decisão validada com o usuário: não é um banner discreto. */}
      <Dialog
        isOpen={!!upsell}
        onOpenChange={(open) => !open && setUpsell(null)}
        className="sm:max-w-[640px] max-h-[88vh] overflow-y-auto flex flex-col gap-5 p-10"
      >
        {upsell && (
          <>
            <Badge className="self-start uppercase tracking-wide gap-1.5" style={{ color: T.catText, background: T.catActive, fontFamily: FONT_B, fontSize: FONT.body }}>
              <PartyPopper className="size-4" /> Combo disponível
            </Badge>
            {/* ORD-153 — só renderiza se tiver imagem. */}
            {upsell.combo.image_url && (
              <img
                src={upsell.combo.image_url}
                alt={upsell.combo.name}
                className="w-full object-cover block rounded-lg"
                style={{ height: 320, borderRadius: RADIUS.lg }}
              />
            )}
            <DialogTitle className="leading-tight pr-10" style={{ fontFamily: FONT_D, color: T.text, fontWeight: 800, fontSize: FONT.title }}>
              Leve o {upsell.combo.name}
              {upsell.combo.items.reduce((s, i) => s + i.price, 0) - upsell.combo.price > 0 && (
                <>
                  {" "}e{" "}
                  <span className="rounded-full whitespace-nowrap inline-block" style={{ color: "#1c8a53", background: "#e4f6ec", padding: "2px 12px" }}>
                    economize {fmt(upsell.combo.items.reduce((s, i) => s + i.price, 0) - upsell.combo.price)}
                  </span>
                </>
              )}
            </DialogTitle>
            <div className="flex flex-col gap-2.5 rounded-lg" style={{ background: T.numBg, padding: "18px 22px", borderRadius: RADIUS.lg }}>
              {upsell.combo.items.map((i) => (
                <div key={i.product_id} className="flex justify-between text-muted-foreground" style={{ fontFamily: FONT_B, fontSize: FONT.bodyLg }}>
                  <span>{i.name}</span>
                  <span>incluso</span>
                </div>
              ))}
              <div className="flex justify-between pt-2.5 border-t border-dashed" style={{ fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.subtitle, color: T.text }}>
                <span>{upsell.combo.name}</span>
                <span>{fmt(upsell.combo.price)}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2.5 mt-1">
              <Button
                onClick={() => { tryAddCombo(upsell.combo); setUpsell(null); }}
                className="rounded-full"
                style={{ minHeight: 76, background: T.btn, color: T.btnText, fontFamily: FONT_D, fontWeight: 800, fontSize: FONT.subtitle, boxShadow: T.glow }}
              >
                Sim, quero o combo
              </Button>
              <Button
                variant="outline"
                onClick={() => { addProductWithOptionsToCart(upsell.product, upsell.selectedOptions, upsell.price, upsell.key); setUpsell(null); }}
                className="rounded-full"
                style={{ minHeight: 68, background: T.numBg, color: T.text, fontFamily: FONT_D, fontWeight: 700, fontSize: FONT.body }}
              >
                Não, só {upsell.product.name}
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
