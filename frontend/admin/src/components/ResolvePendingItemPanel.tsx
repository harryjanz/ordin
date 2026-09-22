import { useEffect, useRef, useState } from "react";
import { Alert, Button, Dropdown, InputBase, NumberInput, Tabs, Tab, Tag, makeToast, type DropdownOptions } from "design-system";
import api from "../api";
import { useCatalogParams } from "../lib/catalogParams";
import { parseApiError } from "../lib/apiErrors";
import { STOCK_UNIT_OPTIONS } from "../lib/stockUnits";
import type { Category, CreateProductFromItemOut, LinkItemOut, PendingItem, ResolveSearchResult, RetroactiveCandidate } from "../types";
import ConfirmDialog from "./ConfirmDialog";
import styles from "./ResolvePendingItemPanel.module.scss";

// ORD-196 (C2) — painel de resolução manual de um item pendente. Componente
// "burro": só recebe o item e um callback de sucesso, não sabe se está
// dentro de um Modal (tela "Pendências") ou inline via Table.renderExpanded
// (detalhe da nota, SupplierInvoiceScreen) — decisão do repasse de Frontend.
//
// Busca de produto/opção é sempre contra 2 endpoints remotos (GET /catalog/
// products?q=, GET /catalog/options/search?q=) — não existe combobox pronto
// no design system, e a lista completa não escala pra filtro client-side
// (achado do repasse: InputBase + debounce 500ms + Promise.all, mesmo
// padrão de SupplierInvoiceScreen).
const SEARCH_DEBOUNCE_MS = 500;

type Mode = "vincular" | "criar" | "ignorar";

export interface ResolvePendingItemPanelProps {
  item: PendingItem;
  onResolved: () => void;
}

export default function ResolvePendingItemPanel({ item, onResolved }: ResolvePendingItemPanelProps) {
  const catalogParams = useCatalogParams();
  const [mode, setMode] = useState<Mode>("vincular");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retroactiveCandidates, setRetroactiveCandidates] = useState<RetroactiveCandidate[] | null>(null);
  const [sourceItemId, setSourceItemId] = useState<number | null>(null);
  const [retroactiveAction, setRetroactiveAction] = useState<"link" | "ignore">("link");

  // ── Vincular a existente ──────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ResolveSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ResolveSearchResult | null>(null);
  const [quantidade, setQuantidade] = useState<number | null>(item.quantidade);
  // Achado testando ao vivo: item.unidade vem da NOTA ("UN", maiúsculo,
  // texto livre do XML) — o backend só aceita o conjunto fechado de
  // STOCK_UNITS ("un" minúsculo etc.), rejeitava com "unidade inválida".
  // Normaliza case-insensitive contra as opções válidas; sem match, começa
  // vazio e força o usuário a escolher no Dropdown (evita digitação livre).
  const [unidade, setUnidade] = useState<string | null>(
    STOCK_UNIT_OPTIONS.find((o) => o.value.toLowerCase() === item.unidade?.toLowerCase())?.value ?? null,
  );
  const [quantidadePorUnidade, setQuantidadePorUnidade] = useState<number | null>(null);
  // Achado testando ao vivo (guaraná vinculado a uma opção sem estoque
  // ainda): `pendente_motivo === "sem_estoque_iniciado"` descreve por que o
  // casamento AUTOMÁTICO do item original falhou — não diz nada sobre se o
  // DESTINO escolhido manualmente aqui já tem estoque. São coisas
  // independentes: uma opção nova, nunca usada antes, pode receber um
  // vínculo manual de um item que ficou pendente por outro motivo qualquer
  // (ex: "sem correspondência"), e ainda assim ser a primeira movimentação
  // dela. Só dá pra saber checando o destino de verdade.
  const [destinationNeedsUnidade, setDestinationNeedsUnidade] = useState(false);
  const [checkingDestination, setCheckingDestination] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!selected) {
      setDestinationNeedsUnidade(false);
      return;
    }
    setCheckingDestination(true);
    const path = selected.type === "product"
      ? `/catalog/products/${selected.id}/stock`
      : `/catalog/options/${selected.id}/stock`;
    api.get(path, catalogParams())
      .then((r) => setDestinationNeedsUnidade(!r.data.has_stock_item))
      .catch(() => setDestinationNeedsUnidade(false))
      .finally(() => setCheckingDestination(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    clearTimeout(debounceTimer.current);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    debounceTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const [productsRes, optionsRes] = await Promise.all([
          api.get("/catalog/products", catalogParams({ q: query })),
          api.get("/catalog/options/search", catalogParams({ q: query })),
        ]);
        const products: ResolveSearchResult[] = (productsRes.data.products ?? []).map((p: { id: number; name: string; sku: string | null; ean: string | null }) => ({
          type: "product" as const, id: p.id, label: p.name, sku: p.sku, ean: p.ean,
        }));
        const options: ResolveSearchResult[] = (optionsRes.data ?? []).map((o: { id: number; label: string; sku: string | null; ean: string | null }) => ({
          type: "option" as const, id: o.id, label: o.label, sku: o.sku, ean: o.ean,
        }));
        setSearchResults([...products, ...options]);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // ── Criar produto novo ────────────────────────────────────────────────
  const [novoNome, setNovoNome] = useState(item.x_prod);
  const [novoPreco, setNovoPreco] = useState<number | null>(null);
  const [novoCategoriaId, setNovoCategoriaId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    if (mode !== "criar" || categories.length > 0) return;
    api.get("/catalog/categories", catalogParams()).then((r) => setCategories(r.data.categories ?? r.data)).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const categoryOptions: DropdownOptions[] = categories.map((c) => ({ label: c.name, value: String(c.id) }));

  async function confirmVincular() {
    if (!selected || quantidadeFinal == null) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        [selected.type === "product" ? "product_id" : "option_id"]: selected.id,
        quantidade: quantidadeFinal,
        unidade: showUnidade ? (unidade || undefined) : undefined,
        quantidade_por_unidade: item.c_ean ? quantidadePorUnidade : undefined,
      };
      const r = await api.post<LinkItemOut>(
        `/catalog/supplier-invoices/items/${item.id}/link`, body, catalogParams(),
      );
      afterResolve(item.id, r.data.retroactive_candidates);
    } catch (err) {
      setError(parseApiError(err).message || "Erro ao vincular o item.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmCriarProduto() {
    if (!novoNome.trim() || novoPreco == null || quantidadeFinal == null) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: novoNome, price: novoPreco,
        category_id: novoCategoriaId ? Number(novoCategoriaId) : undefined,
        quantidade: quantidadeFinal, unidade: showUnidade ? (unidade || undefined) : undefined,
        quantidade_por_unidade: item.c_ean ? quantidadePorUnidade : undefined,
      };
      const r = await api.post<CreateProductFromItemOut>(
        `/catalog/supplier-invoices/items/${item.id}/create-product`, body, catalogParams(),
      );
      afterResolve(item.id, r.data.retroactive_candidates);
    } catch (err) {
      setError(parseApiError(err).message || "Erro ao criar o produto.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmIgnorar() {
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<LinkItemOut>(`/catalog/supplier-invoices/items/${item.id}/ignore`, {}, catalogParams());
      afterResolve(item.id, r.data.retroactive_candidates);
    } catch (err) {
      setError(parseApiError(err).message || "Erro ao ignorar o item.");
    } finally {
      setSaving(false);
    }
  }

  function afterResolve(resolvedItemId: number, candidates: RetroactiveCandidate[]) {
    setRetroactiveAction(mode === "ignorar" ? "ignore" : "link");
    if (candidates.length > 0) {
      setSourceItemId(resolvedItemId);
      setRetroactiveCandidates(candidates);
    } else {
      makeToast("success", "Item resolvido");
      onResolved();
    }
  }

  async function applyRetroactive(apply: boolean) {
    if (apply && sourceItemId != null && retroactiveCandidates) {
      try {
        await api.post(
          "/catalog/supplier-invoices/items/retroactive/apply",
          { source_item_id: sourceItemId, item_ids: retroactiveCandidates.map((c) => c.id), action: retroactiveAction },
          catalogParams(),
        );
        makeToast("success", "Item resolvido — aplicado também aos itens semelhantes");
      } catch (err) {
        makeToast("error", parseApiError(err).message || "Erro ao aplicar aos itens semelhantes.");
      }
    } else {
      makeToast("success", "Item resolvido");
    }
    setRetroactiveCandidates(null);
    onResolved();
  }

  // "Criar produto novo" é sempre primeira movimentação (produto acabou de
  // nascer) — sempre precisa de unidade. "Vincular a existente" depende do
  // destino escolhido (ver useEffect acima), não do item pendente original.
  const showUnidade = mode === "criar" || destinationNeedsUnidade;
  const showQuantidadePorUnidade = Boolean(item.c_ean);
  // Achado testando ao vivo (fardo de 5 x 12 lançou 5, não 60): "Quantidade"
  // é o que veio na NOTA (embalagens recebidas — ex: 5 fardos), nunca o que
  // deve entrar no estoque quando há conversão. O valor de fato lançado
  // precisa ser sempre esse produto, calculado aqui — nunca o campo bruto
  // enviado direto pro backend.
  const quantidadeFinal = showQuantidadePorUnidade && quantidadePorUnidade != null && quantidade != null
    ? quantidade * quantidadePorUnidade
    : quantidade;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <strong>{item.x_prod}</strong>
        <div className={styles.headerMeta}>
          {item.c_prod && <span>Código: {item.c_prod}</span>}
          {item.c_ean && <span>EAN: {item.c_ean}</span>}
          <span>Quantidade na nota: {item.quantidade} {item.unidade ?? ""}</span>
          <span>{item.fornecedor_nome} — nota {item.numero ?? "—"}{item.serie ? ` / ${item.serie}` : ""}</span>
        </div>
      </div>

      <Tabs activeTab={mode} onSelectTab={(v) => setMode(v as Mode)}>
        <Tab value="vincular" label="Vincular a existente" />
        <Tab value="criar" label="Criar produto novo" />
        <Tab value="ignorar" label="Ignorar" />
      </Tabs>

      {error && <Alert variant="error" text={error} fullWidth />}

      {mode === "vincular" && (
        <div className={styles.section}>
          <InputBase
            label="Buscar produto ou opção"
            placeholder="Nome, SKU ou EAN…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
          />
          {searching && <div className={styles.hint}>Buscando…</div>}
          {!searching && query && searchResults.length === 0 && <div className={styles.hint}>Nenhum resultado.</div>}
          {searchResults.length > 0 && !selected && (
            <ul className={styles.resultList}>
              {searchResults.map((r) => (
                <li key={`${r.type}-${r.id}`} className={styles.resultItem} onClick={() => setSelected(r)}>
                  <Tag variant={r.type === "product" ? "neutral" : "emphasys"}>{r.type === "product" ? "Produto" : "Opção"}</Tag>
                  <span>{r.label}</span>
                </li>
              ))}
            </ul>
          )}
          {selected && (
            <div className={styles.selected}>
              <Tag variant="success">Selecionado</Tag>
              <span>{selected.label}</span>
              <Button size="small" variant="secondary" onClick={() => setSelected(null)}>Trocar</Button>
            </div>
          )}
          <NumberInput
            label={showQuantidadePorUnidade ? "Quantidade recebida (conforme a nota)" : "Quantidade"}
            value={quantidade}
            onChange={(v: number) => setQuantidade(v)}
          />
          {showQuantidadePorUnidade && (
            <NumberInput
              label="Quantidade por unidade (ex: latas por fardo)"
              value={quantidadePorUnidade}
              onChange={(v: number) => setQuantidadePorUnidade(v)}
            />
          )}
          {showQuantidadePorUnidade && quantidadePorUnidade != null && (
            <div className={styles.hint}>
              Total a lançar no estoque: <strong>{quantidadeFinal}</strong>
              {" "}({quantidade} × {quantidadePorUnidade})
            </div>
          )}
          {checkingDestination && <div className={styles.hint}>Verificando estoque do destino…</div>}
          {showUnidade && !checkingDestination && (
            <Dropdown
              label="Unidade de estoque — primeira movimentação deste item"
              value={STOCK_UNIT_OPTIONS.find((o) => o.value === unidade) ?? null}
              onValueSelected={(opt) => setUnidade(opt.value)}
              options={STOCK_UNIT_OPTIONS}
            />
          )}
          <Button
            onClick={confirmVincular}
            disabled={saving || checkingDestination || !selected || quantidadeFinal == null || (showQuantidadePorUnidade && quantidadePorUnidade == null) || (showUnidade && !unidade)}
            loading={saving}
          >
            Vincular
          </Button>
        </div>
      )}

      {mode === "criar" && (
        <div className={styles.section}>
          <InputBase label="Nome do produto" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
          <NumberInput label="Preço" value={novoPreco} onChange={(v: number) => setNovoPreco(v)} />
          <Dropdown
            label="Categoria (opcional)"
            value={categoryOptions.find((o) => o.value === novoCategoriaId) ?? null}
            onValueSelected={(opt) => setNovoCategoriaId(opt.value)}
            options={categoryOptions}
          />
          <NumberInput
            label={showQuantidadePorUnidade ? "Quantidade recebida (conforme a nota)" : "Quantidade"}
            value={quantidade}
            onChange={(v: number) => setQuantidade(v)}
          />
          {showQuantidadePorUnidade && (
            <NumberInput
              label="Quantidade por unidade (ex: latas por fardo)"
              value={quantidadePorUnidade}
              onChange={(v: number) => setQuantidadePorUnidade(v)}
            />
          )}
          {showQuantidadePorUnidade && quantidadePorUnidade != null && (
            <div className={styles.hint}>
              Total a lançar no estoque: <strong>{quantidadeFinal}</strong>
              {" "}({quantidade} × {quantidadePorUnidade})
            </div>
          )}
          {showUnidade && (
            <Dropdown
              label="Unidade de estoque — primeira movimentação deste item"
              value={STOCK_UNIT_OPTIONS.find((o) => o.value === unidade) ?? null}
              onValueSelected={(opt) => setUnidade(opt.value)}
              options={STOCK_UNIT_OPTIONS}
            />
          )}
          <Button
            onClick={confirmCriarProduto}
            disabled={saving || !novoNome.trim() || novoPreco == null || quantidadeFinal == null || (showQuantidadePorUnidade && quantidadePorUnidade == null) || (showUnidade && !unidade)}
            loading={saving}
          >
            Criar produto e vincular
          </Button>
        </div>
      )}

      {mode === "ignorar" && (
        <div className={styles.section}>
          <p>O item deixa de aparecer na fila de pendências e não gera nenhuma entrada de estoque.</p>
          <Button variant="secondary" onClick={confirmIgnorar} disabled={saving} loading={saving}>
            Marcar como "não controla estoque"
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={retroactiveCandidates !== null}
        title="Aplicar a itens semelhantes?"
        message={`Encontramos ${retroactiveCandidates?.length ?? 0} outro(s) item(ns) pendente(s) de nota(s) anteriores com o mesmo código. Quer aplicar a mesma resolução a eles também?`}
        confirmLabel={`Aplicar a estes ${retroactiveCandidates?.length ?? 0} itens`}
        cancelLabel="Só este item"
        onConfirm={() => applyRetroactive(true)}
        onCancel={() => applyRetroactive(false)}
      >
        {retroactiveCandidates && (
          <ul className={styles.candidateList}>
            {retroactiveCandidates.map((c) => (
              <li key={c.id}>
                Nota {c.numero ?? "—"}{c.serie ? ` / série ${c.serie}` : ""} — {c.fornecedor_nome} — qtd. {c.quantidade}
              </li>
            ))}
          </ul>
        )}
      </ConfirmDialog>
    </div>
  );
}
