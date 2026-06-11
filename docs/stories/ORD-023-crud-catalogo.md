---
id: ORD-023
status: New
fase: 1
sprint: 2
responsavel: Backend SR
---

# ORD-023 — CRUD de catálogo: categorias e produtos

## Descrição
O `catalog-service` só tem endpoints de leitura (`GET /catalog/categories`, `GET /catalog/products`, `GET /catalog/products/{id}`). Não há como criar, editar ou remover categorias e produtos sem acesso direto ao banco. É necessário implementar o CRUD completo para que o admin panel possa gerenciar o catálogo de cada empresa.

## Contexto
O modelo de dados já existe (`Category`, `Product` com `company_id`, `active`, etc.). Todos os endpoints de escrita devem exigir JWT válido com `role` admin/owner/manager e validar que `company_id` do JWT bate com o recurso sendo modificado — regra central de multi-tenancy do `docs/ARQUITETURA.md` §6.

## Endpoints necessários

**Categorias:**
- `POST /catalog/categories` — criar categoria
- `PUT /catalog/categories/{id}` — editar nome/ordem
- `DELETE /catalog/categories/{id}` — desativar (soft delete via `active=False`)

**Produtos:**
- `POST /catalog/products` — criar produto (nome, descrição, preço, category_id, image_url)
- `PUT /catalog/products/{id}` — editar produto
- `DELETE /catalog/products/{id}` — desativar produto

## Regras de negócio
- Não permitir exclusão física — sempre soft delete via `active=False`
- Validar que `category_id` pertence à mesma empresa ao criar produto
- Preço deve ser positivo (> 0)
- `company_id` sempre extraído do JWT (nunca do body) — ORD-005

## Stakeholder
Admin e owner de empresa. Sem CRUD o catálogo só pode ser gerenciado por acesso direto ao banco.
