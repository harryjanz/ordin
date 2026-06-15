---
id: ORD-033
status: Done
fase: 1
sprint: corrections
responsavel: Frontend
estimativa: 2 pontos
prioridade: P2
bugs: BUG-006
---

# ORD-033 — Admin: sem edição de produto no catálogo

## Explorer

**Como** owner ou manager,  
**quero** poder editar nome, preço e imagem de um produto existente,  
**para** corrigir erros de digitação e ajustar preços sem precisar desativar e recriar o produto.

### Contexto e motivação

A tela de catálogo do admin (`CatalogScreen.tsx`) implementa edição de categorias (botão "Editar" com form inline), mas produtos só têm "Desativar". Para mudar o preço de um produto é preciso:

1. "Desativar" o produto atual
2. Criar um novo produto com as informações corretas

Isso perde o histórico visual e causa inconsistência em pedidos que já referenciavam o produto original. A API de catálogo já tem `PUT /catalog/products/{id}` implementado (ORD-023).

### Personas afetadas
- **Owner/Manager**: não consegue corrigir preços e nomes de produtos sem recriar

### Dependências
- `frontend/admin/src/screens/CatalogScreen.tsx`
- API: `PUT /catalog/products/{id}` — já implementado em ORD-023
- Modelo da API: `{ name, price, image_url, active }`

---

## QA Explorer

```gherkin
Feature: Admin — edição de produto no catálogo

  Background:
    Given o admin está logado e está na tela Catálogo
    And a categoria "Hambúrgueres" está selecionada
    And o produto "X-Burguer" existe com preço R$ 25,90

  Scenario: Happy path — editar nome e preço
    When o admin clica em "Editar" no produto "X-Burguer"
    Then um formulário de edição aparece com os valores atuais preenchidos
    When o admin altera o nome para "X-Burger" e o preço para "27,90"
    And clica em "Salvar"
    Then a API recebe PUT /catalog/products/{id} com {"name":"X-Burger","price":27.90}
    And a resposta é HTTP 200
    And o produto na lista atualiza com os novos valores sem recarregar a página

  Scenario: Editar URL de imagem
    When o admin edita o produto e preenche a URL da imagem
    And clica em "Salvar"
    Then a API recebe PUT /catalog/products/{id} com image_url preenchido

  Scenario: Cancelar edição sem salvar
    When o admin abre o formulário de edição
    And clica em "Cancelar"
    Then o formulário fecha sem fazer chamada à API
    And o produto continua com os valores originais

  Scenario: Preço inválido — zero ou negativo
    When o admin tenta salvar com preço "0"
    Then o botão "Salvar" permanece desabilitado (validação frontend)

  Scenario: Salvar sem alterar nada
    When o admin abre o formulário e clica diretamente em "Salvar"
    Then a API recebe PUT com os valores originais inalterados
    And a resposta é HTTP 200

  Scenario: Regressão — desativar produto ainda funciona
    When o admin clica em "Desativar" num produto
    Then a API recebe DELETE /catalog/products/{id}
    And o produto é removido da lista
```

---

## Tech Explorer

### Fix — Frontend

**`frontend/admin/src/screens/CatalogScreen.tsx`**:

Adicionar estado de edição de produto (mesmo padrão de `editCat`):

```typescript
const [editProd, setEditProd] = useState<{
  id: number; name: string; price: string; image_url: string;
} | null>(null);
```

Adicionar função de save:

```typescript
async function saveEditProd(e: FormEvent) {
  e.preventDefault();
  if (!editProd || !editProd.name.trim() || !editProd.price || parseFloat(editProd.price) <= 0) return;
  await api.put(`/catalog/products/${editProd.id}`, {
    name: editProd.name.trim(),
    price: parseFloat(editProd.price),
    image_url: editProd.image_url || null,
  });
  setEditProd(null);
  if (selectedCat) loadProducts(selectedCat);
}
```

No render de cada produto, trocar o botão "Desativar" por dois botões:

```tsx
<div style={S.actions}>
  <button
    style={S.btn("ghost")}
    onClick={() => setEditProd({
      id: p.id, name: p.name,
      price: String(p.price), image_url: p.image_url ?? ""
    })}
  >Editar</button>
  <button style={S.btn("danger")} onClick={() => deleteProduct(p.id)}>Desativar</button>
</div>
```

Adicionar form de edição de produto (acima da lista de produtos, similar ao `editCat`):

```tsx
{editProd && (
  <form style={S.form} onSubmit={saveEditProd}>
    <div style={{ fontSize: 12, color: "rgba(223,232,237,0.5)", marginBottom: 6 }}>
      Editando produto
    </div>
    <input style={S.input} placeholder="Nome" value={editProd.name}
      onChange={(e) => setEditProd({ ...editProd, name: e.target.value })} autoFocus />
    <input style={S.input} placeholder="Preço" type="number" step="0.01" min="0.01"
      value={editProd.price}
      onChange={(e) => setEditProd({ ...editProd, price: e.target.value })} />
    <input style={S.input} placeholder="URL da imagem (opcional)"
      value={editProd.image_url}
      onChange={(e) => setEditProd({ ...editProd, image_url: e.target.value })} />
    <div style={{ display: "flex", gap: 8 }}>
      <button style={S.addBtn} type="submit"
        disabled={!editProd.name.trim() || parseFloat(editProd.price) <= 0}>
        Salvar
      </button>
      <button type="button" style={S.btn("ghost")} onClick={() => setEditProd(null)}>
        Cancelar
      </button>
    </div>
  </form>
)}
```

### Endpoint utilizado
`PUT /catalog/products/{id}` — já existe. Payload: `{ name, price, image_url }`.

### Impacto em outros serviços
- Nenhum. Apenas frontend + API existente.

### Estimativa
2 pontos — ~40 linhas de JSX + estado + função

### Riscos
- Se `editProd` e `editCat` estiverem abertos ao mesmo tempo, a UX fica poluída. Fechar `editCat` ao abrir `editProd` e vice-versa (`setEditCat(null)` ao entrar em edição de produto, e `setEditProd(null)` ao entrar em edição de categoria).

---

## Ready ✅

- [x] User story documentada
- [x] Causa raiz: botão "Editar" ausente em produtos (existe em categorias)
- [x] Cenários Gherkin escritos (happy path, cancelar, validação, regressão)
- [x] Solução: estado `editProd` + form inline + `PUT /catalog/products/{id}`
- [x] Estimativa: 2 pontos
- [x] Sem bloqueadores (endpoint já existe)
