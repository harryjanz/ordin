---
id: ORD-125
status: Done
fase: null
sprint: null
responsavel: Backend
estimativa: 5 pontos
---

# ORD-125 — Cardápios por horário: modelo de dados e CRUD (backend)

## Descrição
Primeira subtarefa de ORD-124 (`docs/stories/ORD-124-cardapios-por-horario.md`, Ready) — só o modelo de dados e os endpoints de CRUD de cardápio no `catalog-service`. **Sem nenhuma mudança de comportamento visível pro totem nesta história** — os endpoints existentes (`list_categories`/`list_products`) continuam exatamente como estão. A regra de visibilidade condicional por horário fica pra ORD-127. Isso mantém esta entrega de baixo risco: só cria tabelas e endpoints novos, aditivos, sem tocar em nada que já está em produção.

Todas as decisões de produto (exclusividade, sobreposição, granularidade de dia, herança de categoria) já estão fechadas em ORD-124 — não repetidas aqui em detalhe, só a parte técnica específica desta fatia.

## Persona
Owner/manager/admin da empresa, gerenciando o catálogo pelo admin.

---

## Explorer

### Fluxo principal
1. Usuário (via chamada de API, ainda sem UI — a UI é ORD-126) cria um cardápio com nome, dias da semana e horário início/fim.
2. Usuário monta a composição do cardápio: adiciona categorias inteiras e/ou produtos avulsos.
3. Usuário consulta a lista de cardápios da empresa, edita ou remove um existente.

### Critérios de aceite
- [ ] Tabela `menus` (company_id, name, weekdays JSON, start_time, end_time, active)
- [ ] Tabelas de vínculo `menu_categories` (menu_id, category_id) e `menu_products` (menu_id, product_id)
- [ ] `POST /catalog/menus` — cria cardápio (sem composição ainda, só os dados básicos)
- [ ] `GET /catalog/menus` — lista cardápios da empresa, com composição resolvida (nomes de categorias/produtos incluídos, não só ids)
- [ ] `PUT /catalog/menus/{id}` — edita nome/dias/horário/ativo
- [ ] `PUT /catalog/menus/{id}/composition` — substitui a composição inteira (`category_ids`, `product_ids`), mesmo padrão de replace completo já usado em `allergen_ids` na edição de produto
- [ ] `DELETE /catalog/menus/{id}` — remove cardápio (hard delete — ver Tech Explorer sobre por que não precisa do padrão de exclusão definitiva de Categoria/Produto)
- [ ] Endpoint que resolve "a quais cardápios um produto pertence" (direto + via categoria) — necessário pro QA Explorer e pra UI de ORD-126 mostrar isso no produto
- [ ] Multi-tenant: todo endpoint filtra por `company_id` do JWT, mesmo padrão de Categoria/Produto — teste explícito de isolamento entre empresas
- [ ] **Nenhuma mudança de resposta** em `GET /catalog/categories` ou `GET /catalog/products` nesta história — confirmar com teste de regressão que o comportamento atual não muda

---

## QA Explorer

```gherkin
Feature: CRUD de cardápios (backend)

  Scenario: Criar cardápio básico
    Dado uma empresa autenticada
    Quando faz POST /catalog/menus com nome, dias da semana e horário
    Então o cardápio é criado e retornado com id

  Scenario: Definir composição por categoria inteira
    Dado um cardápio existente e uma categoria da empresa
    Quando faz PUT /catalog/menus/{id}/composition incluindo essa categoria
    Então GET /catalog/menus/{id} mostra a categoria na composição

  Scenario: Definir composição por produto avulso
    Dado um cardápio existente e um produto da empresa
    Quando faz PUT /catalog/menus/{id}/composition incluindo esse produto
    Então GET /catalog/menus/{id} mostra o produto na composição

  Scenario: Substituir composição por completo
    Dado um cardápio com categoria A e produto B na composição
    Quando faz PUT /catalog/menus/{id}/composition só com categoria C
    Então a composição final é só categoria C — A e B saem

  Scenario: Isolamento multi-tenant
    Dado um cardápio da empresa 1
    Quando a empresa 2 tenta acessar/editar/remover esse cardápio
    Então recebe 404 (não 403 — não revela existência, mesmo padrão de Categoria/Produto)

  Scenario: Categoria ou produto de outra empresa não pode entrar na composição
    Dado um cardápio da empresa 1
    Quando o payload de composição inclui um category_id/product_id da empresa 2
    Então a API rejeita com 400

  Scenario: Remover cardápio
    Dado um cardápio existente, com ou sem composição
    Quando faz DELETE /catalog/menus/{id}
    Então o cardápio deixa de aparecer em GET /catalog/menus
    E os vínculos de composição são removidos junto (sem lixo órfão nas tabelas de junção)

  Scenario: Sem regressão no catálogo geral
    Dado um produto vinculado a um cardápio
    Quando faz GET /catalog/products (endpoint usado pelo totem hoje)
    Então o produto continua aparecendo normalmente — a regra de visibilidade condicional só entra em ORD-127

  Scenario: Consultar a quais cardápios um produto pertence
    Dado um produto vinculado a 2 cardápios (1 direto, 1 via categoria)
    Quando consulta o endpoint de resolução de cardápios do produto
    Então retorna os 2 cardápios
```

---

## Tech Explorer

### Serviços impactados
- `services/catalog/` apenas. Zero mudança em `services/order/`, `services/company/`, frontend.

### Modelo de dados
```python
class Menu(Base):
    __tablename__ = "menus"
    id         = Column(Integer, primary_key=True)
    company_id = Column(Integer, nullable=False, index=True)
    name       = Column(String(80), nullable=False)
    weekdays   = Column(JSON, nullable=False)  # [0..6], mesmo padrão de Product.tags
    start_time = Column(Time, nullable=False)
    end_time   = Column(Time, nullable=False)
    active     = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class MenuCategory(Base):
    __tablename__ = "menu_categories"
    menu_id     = Column(Integer, ForeignKey("menus.id"), primary_key=True)
    category_id = Column(Integer, ForeignKey("categories.id"), primary_key=True)

class MenuProduct(Base):
    __tablename__ = "menu_products"
    menu_id    = Column(Integer, ForeignKey("menus.id"), primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id"), primary_key=True)
```

Migration nova em `services/catalog/migrations/versions/`, `down_revision` apontando pra HEAD atual (`20260824_2200_categoria_sort_order`, ver ORD anterior desta mesma sessão).

### Por que sem exclusão definitiva estilo Categoria/Produto
`Menu` não é referenciado por nenhuma venda/ticket histórico — é só configuração de disponibilidade, não uma entidade vendável. Hard delete é seguro; não precisa do padrão `deleted=True` + retenção histórica que Categoria/Produto usam.

### Endpoint de resolução "cardápios de um produto"
```
GET /catalog/products/{id}/menus
```
Resolve direto (`MenuProduct`) UNION indireto (categoria do produto está em `MenuCategory`). Usado pela UI de ORD-126 (mostrar no produto a quais cardápios pertence) e pela regra de visibilidade de ORD-127 (mesma lógica, reaproveitada).

### Riscos
- Nenhum de produção — endpoints e tabelas inteiramente novos, aditivos. Único cuidado é garantir que a criação/edição de categoria ou produto (endpoints já existentes) não precisa mudar nada nesta história — só passam a poder ser referenciados pelas tabelas de junção novas.

### Estimativa
5 pontos — 2 tabelas + 1 migration + 5-6 endpoints seguindo padrões já estabelecidos (replace completo de composição, isolamento multi-tenant, resolução de relação), sem lógica de negócio nova complexa.

---

## Ready

**Explorer:** [x] · **QA Explorer:** [x] · **Tech Explorer:** [x] · **Aprovação final:** [x] — decisões de produto herdadas de ORD-124 (já aprovado 2026-08-24); esta fatia é puramente técnica/aditiva, sem decisão de produto nova pendente.

**Status: Ready** — pode começar a implementação.
