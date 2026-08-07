---
id: ORD-075
status: Done
fase: 5
sprint: null
responsavel: Backend SR + Frontend
estimativa: 9 pontos
---

# ORD-075 — Campos adicionais de produto: alérgenos, calorias, SKU, tags, descrição curta/longa e ordenação manual

## Descrição
Avaliação de PM/UX comparando o catálogo do `ordin` com kiosks de mercado (McDonald's, Burger King) e com a regulamentação brasileira identificou campos ausentes no `Product` atual (nome, descrição, preço, categoria, imagem, ativo). Usuário revisou a lista completa e aprovou um subconjunto pra esta história — o resto (modificadores/complementos, variantes de tamanho + combo, disponibilidade por horário, múltiplas fotos) fica adiado, registrado em [[project_ordin_catalogo_backlog_futuro]] pra retomar depois.

**Escopo aprovado desta história:**
- **P0 (compliance):** alérgenos, calorias
- **P1:** `sort_order` com reordenação por arrastar-e-soltar na listagem do admin; tags (conjunto sugerido + extensível)
- **P2:** SKU; descrição longa (nova, `description_long`) — a `description` já existente continua sendo a curta

## Persona
**Owner/Manager** — cadastra produtos e precisa declarar alérgenos por exigência legal, organizar a ordem de exibição do cardápio no totem sem depender da ordem de criação, e usar tags/SKU pra organização interna.

**Cliente final (indireto)** — vê alérgenos e calorias no totem antes de decidir o pedido; erro ou ausência aqui é risco de segurança alimentar, não só UX.

## Contexto

### Alérgenos — achado regulatório, não é opcional

**Base legal confirmada pelo usuário (corrige a citação inicial, que apontava a RDC 26/2015 diretamente):**
- **RDC nº 727/2022** — norma vigente hoje, revisou e consolidou a antiga RDC 26/2015 (sem mudança de mérito na lista); é essa que deve ser citada como base legal no sistema, não a 26/2015
- **Lei nº 10.674/2003** — obriga declaração de presença de glúten
- **Lei nº 12.849/2013** — obriga declaração de presença de látex natural
- Lista baseada no Codex Alimentarius, adotada pela ANVISA

**Lista oficial de declaração obrigatória** (trigo, centeio, cevada, aveia e estirpes hibridizadas, crustáceos, ovos, peixes, amendoim, soja, leite de todos os mamíferos, amêndoa, avelã, castanha de caju, castanha-do-pará, macadâmia, noz-pecã, pistache, nozes, látex natural) — a contagem varia entre ~17 e 19 conforme a fonte porque a ANVISA agrupa parte disso como "oleaginosas" (amêndoa, avelã, castanha de caju, castanha-do-pará, macadâmia, noz-pecã, pistache, nozes); o dado que importa pro sistema é a lista em si, não um número fechado de categorias.

**Decisão de modelagem por causa disso (mudou minha recomendação inicial):** a ANVISA está em processo de revisão dessa norma (consulta setorial em 2025, principalmente sobre como tratar oleaginosas) — a lista pode mudar. Por isso **não vai ser um enum fixo no código nem uma constante hardcoded**: alérgenos vira uma tabela própria no banco (dado, não código), seedada com a lista confirmada acima, editável sem precisar de deploy quando a norma mudar. Detalhe de schema no Tech Explorer.

### `sort_order` com drag-and-drop — pedido explícito do usuário
Não é só um campo numérico exposto num formulário — o usuário quer **arrastar os itens na listagem do admin** e o sistema assumir aquela ordem como ordem de exibição (provavelmente também a ordem no totem, a confirmar). Implica UI de drag-and-drop na tela de catálogo (categorias e/ou produtos) e um endpoint de reordenação em lote (ou N chamadas de update sequenciais — a decidir no Tech Explorer).

### Tags — conjunto sugerido, mas extensível
Usuário aprovou "adotar os padrões sugeridos, mas podem surgir mais" — ou seja, não é um enum fechado. Conjunto inicial sugerido: novo, mais vendido, picante, vegetariano. Modelagem como lista livre de strings (não enum rígido no banco) pra não exigir migration toda vez que uma tag nova aparecer; o "padrão sugerido" vira só um conjunto de opções pré-preenchidas na UI.

### Descrição curta vs. longa
Correção de rumo do usuário: a `description` atual (500 char) já **é a curta**. Novo campo `description_long` é o detalhe completo, mostrado só ao abrir o item — não o contrário do que eu tinha proposto inicialmente.

**Achado ao revisar o código pro protótipo:** `description` existe no model/schema do backend desde sempre, mas **nunca teve campo nenhum na UI do admin** — não dá pra editar hoje por nenhuma tela. Essa história é, na prática, a primeira vez que descrição (curta e longa) ganha interface.

### SKU
Código interno de referência, opcional, pra conciliação com relatório financeiro/estoque. Único por empresa (não global) — a confirmar no Tech Explorer se precisa de constraint de unicidade no banco ou é só um campo de referência solto.

### Campos novos só na edição, não no cadastro
Decisão do usuário ao revisar o protótipo: todos os campos novos (alérgenos, calorias, SKU, tags, descrição curta/longa) aparecem **só no formulário de editar produto**. O formulário de criar produto continua mínimo (nome, preço, categoria) — mesmo padrão já usado pra imagem hoje ("a imagem pode ser adicionada depois de criar o produto, em 'Editar'"), agora estendido pra todos os detalhes novos. Objetivo: cadastro rápido primeiro, detalhamento depois.

## Explorer

### Fluxo principal
1. Owner/manager edita um produto → preenche alérgenos (multi-seleção da lista oficial), calorias, SKU, tags, descrição curta e longa
2. Na listagem de produtos, arrasta um item pra reordenar → nova ordem persiste

**Fora do escopo desta história, por decisão do usuário:** exibir alérgenos/calorias/tags/ordem no totem (app do cliente final). Esta história é só captura e persistência do dado no admin — o totem vira história separada (fast-follow), registrada em [[project_ordin_catalogo_backlog_futuro]]. Importante deixar claro pro time: cadastrar o alérgeno aqui **não cumpre** a exigência legal sozinho — só cumpre quando o totem também mostrar, na próxima história.

### Critérios de aceite
- [ ] Alérgenos: opções vêm de `GET /catalog/allergens` (lista oficial seedada, RDC 727/2022), multi-seleção no admin, persistidos em `product_allergens`
- [ ] Calorias: campo numérico opcional no admin
- [ ] `sort_order`: reordenação por drag-and-drop na listagem do admin persiste (`PUT /catalog/products/reorder`)
- [ ] Tags: multi-seleção com opções sugeridas + opção de criar tag livre, persistidas em `products.tags` (JSON)
- [ ] SKU: campo de texto opcional no admin, único por empresa
- [ ] Descrição curta (`description`, já existente) ganha campo no admin pela primeira vez; descrição longa (novo `description_long`) também
- [ ] Campos novos (alérgenos, calorias, SKU, tags, descrições) só aparecem no formulário de **editar** produto — cadastro continua mínimo (nome, preço, categoria)
- [ ] **Fora do escopo:** nenhum desses dados aparece no totem ainda — isso é a próxima história

## QA Explorer

```gherkin
Feature: Campos adicionais de produto

  Scenario: Cadastro de produto continua mínimo
    Dado que estou criando um produto novo
    Então só vejo nome, preço e categoria — nenhum campo novo aparece aqui

  Scenario: Edição salva todos os campos novos
    Dado um produto existente
    Quando preencho alérgenos, calorias, SKU, tags, descrição curta e longa e salvo
    Então o GET do produto retorna todos os valores preenchidos

  Scenario: SKU duplicado na mesma empresa é rejeitado
    Dado um produto com SKU "LAN-001" já cadastrado
    Quando tento salvar outro produto da mesma empresa com o mesmo SKU
    Então recebo erro de validação
    E SKU "LAN-001" duplicado em outra empresa é permitido (unicidade é por empresa)

  Scenario: Reordenar produtos por drag-and-drop persiste
    Dado uma categoria com 4 produtos em determinada ordem
    Quando arrasto o último produto pra primeira posição e solto
    Então a nova ordem é salva e reflete no próximo carregamento da lista

  Scenario: Produto sem sort_order definido não quebra a listagem
    Dado produtos cadastrados antes desta história (sort_order nulo)
    Quando listo os produtos
    Então aparecem numa ordem estável (fallback pra ordem de criação), sem erro

  Scenario: Tags livres além das sugeridas
    Dado que digito uma tag que não está no conjunto sugerido
    Quando confirmo
    Então a tag é salva normalmente, sem precisar existir num enum fixo
```

**Pendência resolvida:** lista oficial de alérgenos confirmada pelo usuário com base legal (RDC 727/2022 + Lei 10.674/2003 glúten + Lei 12.849/2013 látex, lista do Codex Alimentarius) — ver Contexto acima. Isso já não bloqueia mais o Ready.

**Resolvido:** exibição no totem fica fora do escopo desta história por decisão do usuário — vira história separada (fast-follow), ver Tech Explorer.

## Tech Explorer

### Modelagem de dados

**Alérgenos vira tabela própria, não coluna JSON com lista hardcoded** — mudança em relação à minha recomendação inicial, por pedido explícito do usuário: a ANVISA está em revisão dessa norma (consulta setorial 2025, principalmente sobre oleaginosas), e o objetivo é poder atualizar a lista **sem deploy** quando ela mudar.

```
allergens (nova tabela, master data)
  id            PK
  code          varchar(50) unique   -- ex: "trigo", "latex_natural"
  name          varchar(80)          -- ex: "Trigo", "Látex natural"
  category      varchar(50) null     -- ex: "oleaginosas", pra agrupar exibição
  active        boolean default true -- desativar sem apagar histórico de uso
  created_at

product_allergens (associação N:N)
  product_id    FK -> products.id
  allergen_id   FK -> allergens.id
  PK (product_id, allergen_id)
```

Migration faz **seed de dado**, não de enum de código: insere a lista confirmada (trigo, centeio, cevada, aveia e estirpes hibridizadas, crustáceos, ovos, peixes, amendoim, soja, leite de todos os mamíferos, amêndoa, avelã, castanha de caju, castanha-do-pará, macadâmia, noz-pecã, pistache, nozes — agrupados como `category="oleaginosas"` — e látex natural). Se a ANVISA revisar a lista depois, é um `INSERT`/`UPDATE` de dado (ou uma tela de gestão futura), não uma migration nova nem mudança de código.

Novo endpoint pequeno: `GET /catalog/allergens` (lista os ativos) — o admin busca as opções do `CheckboxMultiselect` daqui, não de um array fixo no frontend. Fecha o ciclo: nem backend nem frontend têm a lista hardcoded em código.

**Tags continuam JSON** (`tags: JSON` em `products`) — esse caso não tem o mesmo problema de "fonte legal que muda"; é conteúdo livre definido pela própria empresa, sem necessidade de master data.

Resto do schema, tabela `products`:

| Campo | Tipo | Observação |
|---|---|---|
| `tags` | `JSON`, nullable | array de strings livres, sem validação contra lista fechada |
| `calories` | `Integer`, nullable | kcal |
| `sku` | `String(50)`, nullable | `UNIQUE(company_id, sku)` — MySQL permite múltiplos `NULL` num índice único, então produtos sem SKU não colidem entre si |
| `description_long` | `Text`, nullable | a `description` (500 char) existente não muda de tipo nem de nome |
| `sort_order` | `Integer`, nullable | ver abaixo |

### `sort_order` — backfill e endpoint de reordenação
- Migration faz backfill: para cada categoria, produtos existentes recebem `sort_order` sequencial na ordem atual (por `id`) — evita que todo produto existente nasça com `sort_order` nulo e a listagem pareça embaralhada no primeiro deploy.
- `list_products` passa a ordenar por `sort_order ASC, id ASC` (fallback estável pra produtos novos que ainda não passaram por uma reordenação manual).
- Novo endpoint dedicado — **não** reaproveitar `PUT /catalog/products/{id}` pra isso (evitaria N requisições sequenciais, uma por item arrastado, sem atomicidade):
  ```
  PUT /catalog/products/reorder
  { "category_id": 5, "product_ids": [12, 8, 30, 4] }
  ```
  Atualiza `sort_order = índice na lista` pra cada produto, numa transação só. Valida que todos os `product_ids` pertencem à `company_id` do token e à `category_id` informada (senão 400).

### Campos novos só na edição — implicação de schema
A API (`ProductIn`/`ProductUpdate`) aceita os campos novos como opcionais em ambos — **não restringir no backend só porque a UI do admin esconde no cadastro**. A regra "só aparece na edição" é decisão de UX do formulário, não uma regra de negócio da API; travar isso no backend acoplaria a validação a uma decisão de tela específica.

### Frontend (admin)
- `CatalogScreen.tsx`, formulário de edição: `CheckboxMultiselect` (alérgenos — opções vêm de `GET /catalog/allergens`, não de array fixo no frontend), `NumberInput` (calorias), `InputBase` (SKU, descrição curta), `TextArea` com `maxLength` (descrição longa), `TagInput` (tags) — todos já existem no design-system, nenhum componente novo (ver protótipo aprovado).
- Listagem de produtos: drag-and-drop nativo (HTML5 Drag and Drop API, sem lib externa) direto nos itens já existentes — chama `PUT /catalog/products/reorder` no `drop`. Sem componente pronto no DS pra isso (único gap real, já sinalizado no protótipo).
- Badges de tag na listagem: componente `Tag` do DS, `variant` por categoria semântica (ex: `warning` pra "picante").

### Decisão — escopo do totem (resolvida)
Usuário decidiu: **fora do escopo desta história.** ORD-075 é só captura e persistência do dado no admin — sem exibição no totem. Registrado em [[project_ordin_catalogo_backlog_futuro]] como próxima história natural (fast-follow), já que o cumprimento efetivo da exigência legal de alérgenos só acontece quando o cliente final consegue ver a informação, não só quando ela está cadastrada.

### Riscos
- `sort_order` com múltiplos usuários reordenando ao mesmo tempo (duas abas abertas) pode gerar condição de corrida — aceitável pro tamanho de equipe típico deste produto (last-write-wins), não vale a complexidade de lock otimista nesta história.
- Tabela `allergens` fica sem tela de gestão nesta história (edição só via banco/seed) — aceitável agora, mas se a ANVISA revisar a norma e precisar de atualização frequente, uma tela simples de CRUD (provavelmente restrita a superadmin) vira próximo passo natural.
- JSON column (`tags`) em MySQL não é indexável nativamente pra busca — sem impacto no volume atual, mas anotar caso o catálogo cresça muito e alguém precise filtrar por tag depois.

### Estimativa
9 pontos — 2 migrations (schema + seed de `allergens`), 1 tabela de associação N:N, 2 endpoints novos (`GET /catalog/allergens`, `PUT /catalog/products/reorder`), extensão de schema em 3 endpoints existentes, 5 campos novos de UI usando componentes já existentes do DS, drag-and-drop nativo sem lib. Confirmado sem totem nesta história.

---

## Ready

**Explorer:** [x] protótipo revisado e aprovado (fluxo, campos, decisão de cadastro-mínimo/edição-completa) · **QA Explorer:** [x] cenários gherkin cobrindo cadastro mínimo, edição completa, SKU único, reordenação, fallback de `sort_order`, tags livres · **Tech Explorer:** [x] modelagem (tabela `allergens`/`product_allergens`, JSON pra tags, endpoint de reorder transacional), riscos e estimativa documentados · **Aprovação final:** aprovado no chat pelo usuário, incluindo a base legal dos alérgenos (RDC 727/2022) e a decisão de deixar o totem fora do escopo.

**Status: Ready** — pode começar a implementação.
