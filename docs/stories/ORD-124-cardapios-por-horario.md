---
id: ORD-124
status: Tech Explorer
fase: null
sprint: null
responsavel: Full-stack
estimativa: a definir (provável 13+ pontos — ver Tech Explorer)
---

# ORD-124 — Cardápios por horário (dayparting)

## Descrição
Pedido direto do usuário (2026-08-24): café da manhã das 8h às 10h, almoço das 11h30 às 15h, etc. — cardápios que só ficam disponíveis em janelas de dia da semana + horário configuráveis, compostos por categorias inteiras e/ou produtos avulsos.

Precedida por uma pesquisa de mercado dedicada (`docs/analise-concorrentes-cardapio-por-horario.md`) — Goomer, CardápioWeb, Toast POS, WhatsMenu, Clover, Datacaixa. Achado principal: nenhum concorrente pesquisado trata "cardápio" como dono exclusivo do produto (a proposta original do usuário — "entrou em cardápio, some do catálogo geral, sem poder estar em outro"). Após discussão, o usuário aprovou a versão ajustada abaixo.

## Decisões de produto (todas confirmadas com o usuário, 2026-08-24)

1. **Exclusividade:** um produto pode pertencer a **um ou mais** cardápios. Assim que entra em pelo menos um, deixa de fazer parte do catálogo "sempre ligado" — passa a aparecer só durante a **união** das janelas dos cardápios aos quais está vinculado. Produto sem nenhum cardápio associado continua se comportando como hoje (sempre visível, sujeito só a `active`).
2. **Carrinho no limite do horário:** pedido já em andamento (item no carrinho, ainda não pago) continua valendo até o cliente finalizar — não trava o checkout. Só pedidos **novos** deixam de ver o item depois que o horário fecha.
3. **Múltiplas janelas por dia** (ex.: happy hour 17h-19h e 22h-00h) — **fora do escopo desta história** (v2). Cada cardápio tem uma única janela de horário, aplicada a um conjunto de dias da semana.
4. **Cardápios sobrepostos** com o mesmo produto em horários que se cruzam — **permitido**, sem validação de bloqueio. Fica por conta de quem configurou (o produto simplesmente fica visível na união das janelas, mesmo que duas se sobreponham).
5. **Granularidade de dia:** só dia da semana fixo (seg-dom) — **sem** exceção por data específica (feriado, evento pontual) nesta história.
6. **Categoria inteira herda o horário do cardápio automaticamente** para todos os produtos dela, inclusive produtos adicionados à categoria depois (vínculo dinâmico, não uma cópia estática da lista de produtos no momento da configuração) — mesmo comportamento observado em Goomer/CardápioWeb.

---

## Explorer

### História
Como **dono/gestor de catálogo** (owner/manager/admin), quero criar cardápios nomeados com dia(s) da semana e horário de início/fim, compostos por categorias inteiras e/ou produtos avulsos, para que meu totem mostre automaticamente o cardápio certo (café da manhã, almoço, etc.) sem eu precisar ativar/desativar produtos manualmente todo dia.

### Fluxo principal (admin)
1. Usuário vai em Catálogo → nova aba **Cardápios** (terceira aba, ao lado de Categorias/Produtos).
2. Clica em "+ Novo cardápio", dá um nome ("Café da manhã"), escolhe os dias da semana e o horário de início/fim.
3. Monta a composição: marca categorias inteiras e/ou produtos avulsos que devem pertencer a esse cardápio.
4. Salva. A partir daí, os itens escolhidos deixam de aparecer no catálogo "geral" (Produtos com filtro padrão/no totem fora do horário) e só ficam visíveis quando o horário/dia bate.

### Fluxo principal (totem, cliente final)
1. Cliente abre o totem dentro da janela de um cardápio (ex.: 8h30, dentro do cardápio "Café da manhã", 8h-10h) → vê as categorias/produtos desse cardápio somados ao que já é sempre-visível (produtos sem cardápio associado).
2. Às 10h01, o mesmo totem deixa de mostrar os itens do cardápio de café da manhã automaticamente, sem intervenção manual — próxima carga de catálogo (a definir: revalidação periódica ou por navegação de tela) já reflete a mudança.
3. Se o cardápio de almoço (11h30-15h) tiver um produto em comum com o de café da manhã (ex.: suco de laranja em ambos), esse produto fica visível em ambas as janelas, sem duplicar cadastro.

### Critérios de aceite
- [ ] Nova entidade "Cardápio" (nome, dias da semana, horário início/fim, ativo/inativo) — CRUD completo no admin
- [ ] Cardápio pode incluir categorias inteiras e/ou produtos avulsos
- [ ] Categoria incluída no cardápio propaga o horário pra todos os produtos dela, inclusive os adicionados à categoria depois de o cardápio já existir
- [ ] Produto sem nenhum cardápio associado continua sempre visível (comportamento atual, sem regressão)
- [ ] Produto com ≥1 cardápio associado só fica visível quando pelo menos um dos cardápios está na janela ativa (dia + horário)
- [ ] Totem reflete a mudança de disponibilidade sem precisar de deploy ou intervenção manual — só o relógio
- [ ] Produto em dois cardápios com horários sobrepostos funciona sem erro (união simples das janelas)
- [ ] Admin consegue ver, olhando o produto ou o cardápio, a relação entre os dois (quais produtos um cardápio tem; a quais cardápios um produto pertence)
- [ ] Pedido com item de cardápio já no carrinho continua sendo aceito no checkout mesmo se o horário fechar durante a navegação do cliente

### Wireframe / Mockup
Não desenhado — recomendo seguir o mesmo padrão visual já estabelecido nas abas Categorias/Produtos desta sessão (filterBar + Table + Modal), ver Tech Explorer.

---

## QA Explorer

```gherkin
Feature: Cardápios por horário

  Scenario: Produto sem cardápio continua sempre visível
    Dado um produto que não pertence a nenhum cardápio
    Quando o totem carrega o catálogo, em qualquer horário
    Então o produto aparece normalmente

  Scenario: Produto com cardápio só aparece na janela configurada
    Dado um produto vinculado ao cardápio "Café da manhã" (seg-sex, 8h-10h)
    Quando o totem carrega o catálogo às 8h30 de uma terça-feira
    Então o produto aparece
    Quando o totem carrega o catálogo às 10h30 da mesma terça-feira
    Então o produto não aparece

  Scenario: Categoria inteira herda o horário do cardápio
    Dado a categoria "Cafés" incluída inteira no cardápio "Café da manhã" (8h-10h)
    E um produto novo "Cappuccino" criado nessa categoria depois do cardápio já existir
    Quando o totem carrega o catálogo dentro da janela do cardápio
    Então "Cappuccino" aparece, mesmo sem ter sido adicionado manualmente ao cardápio

  Scenario: Produto em dois cardápios — união das janelas
    Dado um produto vinculado a "Café da manhã" (8h-10h) e "Almoço" (11h30-15h)
    Quando o totem carrega às 9h
    Então o produto aparece (dentro da janela do café da manhã)
    Quando o totem carrega às 10h30
    Então o produto não aparece (fora das duas janelas)
    Quando o totem carrega às 12h
    Então o produto aparece (dentro da janela do almoço)

  Scenario: Cardápios sobrepostos no mesmo produto não geram erro
    Dado um produto vinculado a dois cardápios cujas janelas se cruzam (ex.: 11h-14h e 13h-16h)
    Quando o admin salva essa configuração
    Então o sistema aceita sem bloquear
    E o produto fica visível na união (11h-16h), sem duplicar na listagem

  Scenario: Checkout não é interrompido pelo fim do horário
    Dado um cliente com um produto de cardápio já no carrinho
    Quando o horário do cardápio se encerra antes do pagamento ser concluído
    Então o checkout continua permitindo finalizar a compra normalmente

  Scenario: Admin vê a composição de um cardápio
    Dado um cardápio com 2 categorias inteiras e 3 produtos avulsos
    Quando o admin abre a edição desse cardápio
    Então vê exatamente essa composição, editável

  Scenario: Admin vê a quais cardápios um produto pertence
    Dado um produto vinculado a 2 cardápios
    Quando o admin abre a edição desse produto (ou uma visão equivalente)
    Então consegue ver a quais cardápios ele pertence, sem precisar abrir cada cardápio um por um
```

---

## Tech Explorer

### Serviços impactados
- **`services/catalog/`** — novo modelo de dados, novos endpoints, mudança na lógica de `list_categories`/`list_products` (visibilidade condicional por horário).
- **`frontend/admin/`** — nova aba "Cardápios" em `CatalogScreen.tsx`, seguindo o padrão já estabelecido nesta sessão (filterBar + `Table` + `Modal`).
- **`frontend/totem/`** — nenhuma mudança de tela necessária a princípio (consome os mesmos endpoints de sempre); precisa só garantir que o catálogo é revalidado periodicamente pra refletir a virada de horário sem precisar recarregar a página manualmente (ver Riscos).

### Modelo de dados (proposta)

```
Menu
  id, company_id, name, active
  weekdays        JSON  -- lista de dias 0-6 (mesmo padrão já usado em Product.tags)
  start_time       TIME
  end_time         TIME
  created_at

MenuCategory (menu_id, category_id)   -- vínculo dinâmico: categoria inteira
MenuProduct  (menu_id, product_id)    -- vínculo dinâmico: produto avulso
```

Sem exclusão definitiva estilo Categoria/Produto — `Menu` não é referenciado por venda nenhuma (é só configuração de disponibilidade), então soft-delete simples (`active=false`) ou hard-delete direto já bastam, sem precisar do padrão `deleted` + histórico.

### Regra de visibilidade (o núcleo técnico da história)

Um produto (ou categoria) é **"sempre visível"** (comportamento de hoje) SE E SOMENTE SE não aparece em nenhuma linha de `MenuProduct` nem pertence a uma categoria que aparece em `MenuCategory`.

Caso contrário, ele só é visível se **pelo menos um** dos cardápios aos quais está vinculado (direto via `MenuProduct`, ou indireto via `MenuCategory` da sua categoria) está **ativo agora**: `weekday_atual IN menu.weekdays AND start_time <= hora_atual <= end_time`.

Isso muda `list_categories`/`list_products` (chamadas do totem, `include_inactive=False`): precisa de um filtro adicional calculado no momento da consulta, não só o `active` booleano de hoje. Chamadas do admin (`include_inactive=True`) devem continuar mostrando **tudo**, independente de horário — o admin gerencia o catálogo a qualquer hora, não só dentro da janela ativa.

### Novos endpoints
- `GET /catalog/menus` — lista cardápios da empresa
- `POST /catalog/menus` — cria
- `PUT /catalog/menus/{id}` — edita nome/dias/horário/ativo
- `DELETE /catalog/menus/{id}` — remove
- `PUT /catalog/menus/{id}/composition` — substitui a composição inteira (`category_ids`, `product_ids`) — mesmo padrão de "replace completo" já usado em `allergen_ids` na edição de produto

### UI do admin (proposta)
Terceira aba "Cardápios" em `CatalogScreen.tsx`, mesmo padrão filterBar + `Table` + `Modal` das abas Categorias/Produtos já implementadas nesta sessão. Modal de criação/edição precisa de:
- Nome, dias da semana (provavelmente 7 checkboxes ou um multi-select), horário início/fim (dois campos de hora).
- Composição: `CheckboxMultiselect` do design system pra categorias inteiras (lista pequena, ~11 itens, já usado igual pra alérgenos) — **mas produtos avulsos** provavelmente precisam de um seletor com busca por nome (podem ser 80+ produtos numa empresa como a Burger House demo); `CheckboxMultiselect` não tem campo de busca embutido (confirmar ao implementar) — se não tiver, precisa de um componente custom (input de filtro + lista) ou aceitar uma lista longa sem busca como limitação de v1.

### Riscos
- **Revalidação de horário no totem** — decidido (2026-08-24): **polling periódico em background** (a cada 1-2 min), independente de navegação do cliente. Mantém a tela sempre atualizada mesmo num totem parado numa única tela por muito tempo, ao custo de tráfego contínuo (aceitável — mesma escala de chamadas que o totem já faz hoje pro catálogo geral).
- **Sobreposição sem validação (decisão 4 acima)** pode confundir o dono da empresa se ele não perceber que configurou dois cardápios cruzados — mitigação simples: mostrar visualmente, na listagem de cardápios, quando duas janelas se cruzam (aviso não-bloqueante), mas isso é um nice-to-have, não um critério de aceite obrigatório.
- **Categoria dinâmica** (produto novo herda automaticamente) é a decisão certa segundo a pesquisa, mas significa que criar um produto novo numa categoria já vinculada a um cardápio o torna imediatamente restrito por horário, sem nenhum aviso na tela de criação do produto — vale um texto de ajuda ("esta categoria está vinculada ao cardápio X, este produto vai herdar o horário dela") na aba Produtos quando aplicável.
- Escopo tocando 3 partes do sistema (catalog-service, admin, totem) — candidato natural a ser dividido em sub-entregas sequenciais (ex.: modelo + CRUD no admin primeiro, integração de visibilidade no totem depois), mesmo documentado como uma história só.

### Estimativa
Não cravada — claramente maior que as mudanças recentes de Catálogo (tabs, sort_order, drag-and-drop), que giraram em 3-5 pontos cada. Envolve 2 tabelas novas + relação dinâmica, mudança de regra de visibilidade em endpoints já usados pelo totem em produção, e uma UI de composição nova (picker de categoria+produto). Estimativa preliminar: **13+ pontos**, possivelmente melhor dividida em 2 histórias (backend + admin CRUD; depois integração de visibilidade + revalidação no totem) na hora de sequenciar o trabalho.

---

## Ready

**Explorer:** [x] fluxo, critérios de aceite e decisões de produto definidos, com pesquisa de mercado como base (`docs/analise-concorrentes-cardapio-por-horario.md`) · **QA Explorer:** [x] cenários Gherkin cobrindo visibilidade, herança de categoria, sobreposição, e não-interrupção de checkout · **Tech Explorer:** [x] modelo de dados, regra de visibilidade, endpoints, riscos e estratégia de revalidação no totem (polling periódico) definidos · **Aprovação final:** [x] aprovado no chat pelo usuário (2026-08-24) — decisões de produto (exclusividade, checkout, sobreposição, granularidade de dia) e estratégia técnica de revalidação confirmadas.

**Status: Ready** — dividida em 4 subtarefas sequenciais (usuário pediu quebra em subtarefas, 2026-08-24), cada uma com seu próprio Explorer/QA Explorer/Tech Explorer completo, herdando as decisões de produto fechadas aqui:

1. `ORD-125` — modelo de dados + CRUD de cardápios (backend, sem efeito no totem)
2. `ORD-126` — aba Cardápios no admin (depende de ORD-125)
3. `ORD-127` — regra de visibilidade condicional por horário (backend, toca endpoints em produção — depende de ORD-125)
4. `ORD-128` — revalidação periódica no totem (depende de ORD-127 pra ter algo visível de ponta a ponta)

Este documento (ORD-124) permanece como a referência de decisões de produto e pesquisa de mercado — a implementação acontece nas 4 subtarefas acima, não diretamente aqui.
