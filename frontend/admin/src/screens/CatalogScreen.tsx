import { useState, useEffect, FormEvent } from "react";
import api from "../api";
import type { Category, Product } from "../types";

const S = {
  page: { padding: 32, color: "#DFE8ED" } as React.CSSProperties,
  title: { fontSize: 22, fontWeight: 700, marginBottom: 24 } as React.CSSProperties,
  row: { display: "flex", gap: 24 } as React.CSSProperties,
  col: { flex: 1 } as React.CSSProperties,
  sectionTitle: { fontSize: 15, fontWeight: 600, color: "rgba(223,232,237,0.8)", marginBottom: 12 } as React.CSSProperties,
  item: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#1d1434",
    border: "1px solid rgba(153,0,255,0.15)",
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 8,
    fontSize: 14,
  } as React.CSSProperties,
  badge: (active: boolean) => ({
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 4,
    background: active ? "rgba(51,204,204,0.15)" : "rgba(255,77,109,0.15)",
    color: active ? "#33cccc" : "#ff4d6d",
    marginLeft: 8,
  } as React.CSSProperties),
  actions: { display: "flex", gap: 8 } as React.CSSProperties,
  btn: (variant: "primary" | "ghost" | "danger") => ({
    padding: "4px 10px",
    border: "none",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
    background:
      variant === "primary" ? "#9900ff"
      : variant === "danger" ? "rgba(255,77,109,0.2)"
      : "rgba(153,0,255,0.1)",
    color:
      variant === "danger" ? "#ff4d6d" : "#DFE8ED",
  } as React.CSSProperties),
  form: {
    background: "#1d1434",
    border: "1px solid rgba(153,0,255,0.2)",
    borderRadius: 10,
    padding: "16px 20px",
    marginBottom: 20,
  } as React.CSSProperties,
  input: {
    width: "100%",
    padding: "8px 12px",
    background: "rgba(153,0,255,0.08)",
    border: "1px solid rgba(153,0,255,0.25)",
    borderRadius: 6,
    color: "#DFE8ED",
    fontSize: 14,
    marginBottom: 8,
    outline: "none",
  } as React.CSSProperties,
  addBtn: {
    padding: "8px 16px",
    background: "#9900ff",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 13,
    cursor: "pointer",
  } as React.CSSProperties,
};

export default function CatalogScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [newCatName, setNewCatName] = useState("");
  const [newProd, setNewProd] = useState({ name: "", price: "", image_url: "" });
  const [editCat, setEditCat] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => { loadCategories(); }, []);
  useEffect(() => { if (selectedCat) loadProducts(selectedCat); else setProducts([]); }, [selectedCat]);

  async function loadCategories() {
    const r = await api.get("/catalog/categories");
    setCategories(r.data.categories ?? r.data);
  }

  async function loadProducts(catId: number) {
    const r = await api.get(`/catalog/products?category_id=${catId}`);
    setProducts(r.data.products ?? r.data);
  }

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    if (!newCatName.trim()) return;
    await api.post("/catalog/categories", { name: newCatName.trim() });
    setNewCatName("");
    loadCategories();
  }

  async function saveEditCat(e: FormEvent) {
    e.preventDefault();
    if (!editCat) return;
    await api.put(`/catalog/categories/${editCat.id}`, { name: editCat.name });
    setEditCat(null);
    loadCategories();
  }

  async function deleteCategory(id: number) {
    if (!confirm("Excluir categoria? Os produtos serão desativados.")) return;
    await api.delete(`/catalog/categories/${id}`);
    if (selectedCat === id) setSelectedCat(null);
    loadCategories();
  }

  async function addProduct(e: FormEvent) {
    e.preventDefault();
    if (!selectedCat || !newProd.name.trim() || !newProd.price) return;
    await api.post("/catalog/products", {
      category_id: selectedCat,
      name: newProd.name.trim(),
      price: parseFloat(newProd.price),
      image_url: newProd.image_url || null,
    });
    setNewProd({ name: "", price: "", image_url: "" });
    loadProducts(selectedCat);
  }

  async function deleteProduct(id: number) {
    if (!confirm("Desativar produto?")) return;
    await api.delete(`/catalog/products/${id}`);
    if (selectedCat) loadProducts(selectedCat);
  }

  return (
    <div style={S.page}>
      <div style={S.title}>Catálogo</div>
      <div style={S.row}>
        <div style={S.col}>
          <div style={S.sectionTitle}>Categorias</div>
          <form style={S.form} onSubmit={addCategory}>
            <input
              style={S.input}
              placeholder="Nome da categoria"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
            />
            <button style={S.addBtn} type="submit">Adicionar</button>
          </form>

          {editCat && (
            <form style={S.form} onSubmit={saveEditCat}>
              <div style={{ fontSize: 12, color: "rgba(223,232,237,0.5)", marginBottom: 6 }}>Editando categoria</div>
              <input
                style={S.input}
                value={editCat.name}
                onChange={(e) => setEditCat({ ...editCat, name: e.target.value })}
                autoFocus
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button style={S.addBtn} type="submit">Salvar</button>
                <button type="button" style={S.btn("ghost")} onClick={() => setEditCat(null)}>Cancelar</button>
              </div>
            </form>
          )}

          {categories.map((c) => (
            <div
              key={c.id}
              style={{
                ...S.item,
                border: selectedCat === c.id ? "1px solid #9900ff" : "1px solid rgba(153,0,255,0.15)",
                cursor: "pointer",
              }}
              onClick={() => setSelectedCat(c.id)}
            >
              <span>
                {c.name}
                <span style={S.badge(c.active)}>{c.active ? "ativo" : "inativo"}</span>
              </span>
              <div style={S.actions} onClick={(e) => e.stopPropagation()}>
                <button style={S.btn("ghost")} onClick={() => setEditCat({ id: c.id, name: c.name })}>Editar</button>
                <button style={S.btn("danger")} onClick={() => deleteCategory(c.id)}>Excluir</button>
              </div>
            </div>
          ))}
        </div>

        <div style={S.col}>
          <div style={S.sectionTitle}>
            Produtos {selectedCat ? `— ${categories.find((c) => c.id === selectedCat)?.name ?? ""}` : "(selecione uma categoria)"}
          </div>

          {selectedCat && (
            <form style={S.form} onSubmit={addProduct}>
              <input
                style={S.input}
                placeholder="Nome do produto"
                value={newProd.name}
                onChange={(e) => setNewProd({ ...newProd, name: e.target.value })}
              />
              <input
                style={S.input}
                placeholder="Preço (ex: 25.90)"
                type="number"
                step="0.01"
                value={newProd.price}
                onChange={(e) => setNewProd({ ...newProd, price: e.target.value })}
              />
              <input
                style={S.input}
                placeholder="URL da imagem (opcional)"
                value={newProd.image_url}
                onChange={(e) => setNewProd({ ...newProd, image_url: e.target.value })}
              />
              <button style={S.addBtn} type="submit">Adicionar produto</button>
            </form>
          )}

          {products.map((p) => (
            <div key={p.id} style={S.item}>
              <span>
                {p.name}
                <span style={{ color: "#33cccc", marginLeft: 8, fontSize: 13 }}>
                  {p.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
                <span style={S.badge(p.active)}>{p.active ? "ativo" : "inativo"}</span>
              </span>
              <button style={S.btn("danger")} onClick={() => deleteProduct(p.id)}>Desativar</button>
            </div>
          ))}

          {selectedCat && products.length === 0 && (
            <div style={{ color: "rgba(223,232,237,0.35)", fontSize: 14 }}>Nenhum produto nesta categoria.</div>
          )}
        </div>
      </div>
    </div>
  );
}
