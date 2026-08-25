---
id: ORD-126
status: Ready
fase: null
sprint: null
responsavel: Frontend
estimativa: 5 pontos
---

# ORD-126 — Cardápios por horário: aba no admin

## Descrição
Segunda subtarefa de ORD-124 — interface de gestão de cardápios no admin, consumindo os endpoints de ORD-125. **Depende de ORD-125 já implementado.** Ainda sem efeito no totem (isso é ORD-127+ORD-128) — o dono da empresa já consegue criar e configurar cardápios completos, só não vê efeito no totem até a próxima subtarefa.

## Persona
Owner/manager/admin gerenciando o catálogo.

---

## Explorer

### Fluxo principal
1. Usuário vai em Catálogo → nova terceira aba "Cardápios" (ao lado de Categorias/Produtos, mesmo padrão de abas já implementado nesta sessão).
2. Vê a lista de cardápios existentes (nome, dias, horário, status) numa `Table`, com filterBar (nome + status) igual às outras duas abas.
3. Clica "+ Novo cardápio" → `Modal` com nome, seleção de dias da semana, horário início/fim, e a composição (categorias inteiras + produtos avulsos).
4. Salva — o cardápio existe, mas por enquanto (até ORD-127/128) não afeta o totem.
5. Na aba Produtos, ao editar um produto, vê (read-only) a quais cardápios ele pertence — usando o endpoint de resolução criado em ORD-125.

### Critérios de aceite
- [ ] Terceira aba "Cardápios" em `CatalogScreen.tsx`, mesmo padrão visual de filterBar + `Table` + `Modal` das outras duas
- [ ] Listagem mostra nome, dias da semana (formatado, ex. "Seg-Sex"), horário ("08:00-10:00"), status
- [ ] Filtro por nome e por status (Ativos/Inativos/Todos), mesmo padrão das outras abas
- [ ] Modal de criar/editar: nome, seleção de dias da semana (7 opções), horário início e fim
- [ ] Modal permite compor o cardápio com categorias inteiras (multi-select) e produtos avulsos — busca por nome no seletor de produtos (ver Tech Explorer sobre o componente)
- [ ] Editar um cardápio existente carrega a composição atual corretamente
- [ ] Desativar/reativar cardápio (mesmo padrão Ativar/Desativar de Categoria/Produto)
- [ ] Excluir cardápio, com confirmação (`ConfirmDialog`, mesmo padrão já usado)
- [ ] Na aba Produtos (edição de produto), mostra (read-only, não editável por ali) a quais cardápios o produto pertence — inclusive por herança de categoria, deixando claro qual é qual (ex.: "Café da manhã (via categoria Cafés)" vs "Almoço (direto)")

---

## QA Explorer

```gherkin
Feature: Aba Cardápios no admin

  Scenario: Criar cardápio completo
    Dado o usuário na aba Cardápios
    Quando clica "+ Novo cardápio", preenche nome/dias/horário, marca 1 categoria e 1 produto avulso, e salva
    Então o cardápio aparece na listagem com os dados corretos

  Scenario: Editar composição de um cardápio existente
    Dado um cardápio já criado com categoria A
    Quando o usuário abre "Editar", desmarca A e marca categoria B, salva
    Então reabrir o cardápio mostra só B na composição

  Scenario: Buscar produto avulso por nome no seletor
    Dado uma empresa com 80+ produtos cadastrados
    Quando o usuário digita parte do nome de um produto no seletor de composição
    Então a lista filtra pra mostrar só os produtos correspondentes, sem precisar rolar a lista inteira

  Scenario: Ver a quais cardápios um produto pertence
    Dado um produto vinculado a 2 cardápios (1 direto, 1 via categoria)
    Quando o usuário abre "Editar" nesse produto, na aba Produtos
    Então vê os 2 cardápios listados, com indicação clara de qual é direto e qual é via categoria

  Scenario: Desativar cardápio
    Dado um cardápio ativo
    Quando o usuário clica "Desativar"
    Então o status muda pra Inativo na listagem (sem efeito no totem ainda, ver ORD-127)

  Scenario: Excluir cardápio com confirmação
    Dado um cardápio existente
    Quando o usuário clica "Excluir"
    Então aparece um ConfirmDialog antes de remover de fato
    E ao confirmar, o cardápio some da listagem

  Scenario: Filtro por status
    Dado cardápios ativos e inativos
    Quando o usuário filtra por "Inativos"
    Então só os inativos aparecem
```

---

## Tech Explorer

### Serviços impactados
- `frontend/admin/` apenas — `CatalogScreen.tsx`, `CatalogScreen.module.scss`. Reaproveita `Table`/`Modal`/`ConfirmDialog` já existentes, sem mudança nesses componentes compartilhados.

### Direção técnica
Terceira aba `activeTab === "menus"`, mesmo padrão de estado/filtro/modal já usado em Categorias e Produtos nesta mesma tela (`categoryModalOpen`/`editingCategoryId`/etc., replicar pra `menuModalOpen`/`editingMenuId`/etc.).

**Seletor de dias da semana:** 7 checkboxes simples (Dom-Sáb) ou um `CheckboxMultiselect` do design system — mesmo componente já usado pra alérgenos, cabe bem pra uma lista fixa de 7 itens.

**Horário início/fim:** o design system tem `DateInput` (já usado em PaymentsScreen/OrdersScreen pra filtro de data) — confirmar se existe um `TimeInput` equivalente ou se `DateInput` aceita um modo só-hora; se não existir, usar `InputBase` com `type="time"` (input nativo do browser) como fallback simples.

**Seletor de categorias inteiras:** `CheckboxMultiselect`, mesmo componente já usado pra alérgenos — lista pequena (~11 categorias), não precisa de busca.

**Seletor de produtos avulsos — o ponto técnico mais delicado desta história:** `CheckboxMultiselect` do design system não tem campo de busca embutido (confirmado ao ler o componente durante ORD-124). Com 80+ produtos numa empresa como a Burger House demo, uma lista sem busca é inutilizável. Opções:
1. Filtrar a lista de opções client-side com um `InputBase` de busca acima do `CheckboxMultiselect` (input de texto controla um `useState`, filtra o array de `options` passado pro componente) — mais simples, sem precisar de componente novo.
2. Construir um seletor custom (lista com checkbox + busca embutida) — mais trabalho, só vale se a opção 1 não ficar boa o suficiente na prática.

Recomendo começar pela opção 1 (filtro client-side por cima do `CheckboxMultiselect` existente) e só evoluir pra um componente custom se, ao testar ao vivo, a experiência não for boa.

**Exibição de "a quais cardápios um produto pertence"** (na edição de produto, aba Produtos): novo bloco read-only no formulário de edição, consumindo `GET /catalog/products/{id}/menus` (ORD-125). Só busca quando o modal de edição de produto abre (não precisa carregar isso na listagem inteira).

### Riscos
- Mesmo risco já documentado em ORD-124: seletor de produtos precisa de busca, confirmar viabilidade da opção 1 acima ao implementar antes de assumir que está resolvido.
- Sem risco de regressão em Categorias/Produtos — aba nova, isolada.

### Estimativa
5 pontos — CRUD de UI seguindo padrão já estabelecido (baixo risco de descoberta), mas com um componente de composição (categoria + produto com busca) que é trabalho genuinamente novo, não só repetição do padrão das outras abas.

---

## Ready

**Explorer:** [x] · **QA Explorer:** [x] · **Tech Explorer:** [x] · **Aprovação final:** [x] — decisões de produto herdadas de ORD-124; UI segue padrão já validado nesta sessão (Categorias/Produtos), sem decisão de produto nova pendente.

**Status: Ready** — depende de ORD-125 implementado antes de começar.
