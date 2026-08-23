---
id: ORD-116
status: Ready
fase: 6
sprint: null
responsavel: Fullstack
estimativa: 5 pontos
tipo: melhoria
---

# ORD-116 — Menu de categorias horizontal ou vertical no totem

## Descrição
Achado do usuário: quando a empresa tem muitas categorias, a faixa horizontal de categorias do totem (`CatalogScreen.tsx`, "Zona 2") não comporta bem — fica um scroll horizontal longo, difícil de escanear rapidamente num touchscreen. Proposta: deixar configurável por empresa, em Configurações → Aparência do totem, junto do tema/cor já existente, entre menu **horizontal** (atual, padrão) ou **vertical** (sidebar).

## Explorer

### Persona
- **Dono/gestor de estabelecimento com catálogo grande** (muitas categorias) — hoje sem alternativa ao menu horizontal, que degrada a experiência de navegação do cliente final.
- **Cliente final** navegando o totem — o menu vertical deve tornar a lista de categorias mais fácil de escanear quando há muitas, sem prejudicar quem tem poucas.

### História
Como dono de estabelecimento com muitas categorias, quero escolher um menu de categorias vertical (sidebar) no totem em vez do horizontal padrão, para que meus clientes consigam navegar o cardápio sem depender de scroll horizontal longo.

### Fluxo principal — Admin
1. Configurações → Aparência do totem → mesmo card de tema/cor ganha um novo controle "Menu de categorias": **Horizontal** (padrão) ou **Vertical**.
2. Preview ao vivo (`TotemPreview`, já existente) reflete a escolha, se viável dentro do escopo (a decidir no Tech Explorer — o preview hoje é uma miniatura simplificada da `WelcomeScreen`, não do `CatalogScreen`; simular o catálogo ali é escopo novo, não o objetivo desta história).
3. Salva junto do resto da aparência (mesmo botão "Salvar aparência").

### Fluxo principal — Totem
1. Cliente entra no catálogo (`CatalogScreen`).
2. Empresa configurada como "horizontal" → comportamento atual, sem nenhuma mudança.
3. Empresa configurada como "vertical" → categorias aparecem numa coluna lateral fixa, com scroll vertical próprio se a lista for grande; a grade de produtos ocupa o espaço restante ao lado.

### Critérios de aceite
- [ ] Nova opção "Menu de categorias" (Horizontal/Vertical) em Configurações → Aparência do totem, salva junto do tema/cor existente
- [ ] Padrão é "Horizontal" — nenhuma empresa existente muda de comportamento sem ação explícita do dono
- [ ] No totem, com "Vertical" selecionado: categorias em coluna lateral fixa, com scroll vertical independente da grade de produtos
- [ ] Grade de produtos se reajusta pra caber ao lado da coluna de categorias (menos colunas que no modo horizontal, pra não espremer demais os cards — a decidir exatamente quantas no Tech Explorer)
- [ ] Cabeçalho (nome da empresa + botão Início) e carrinho fixo no rodapé continuam iguais nos dois modos
- [ ] Categoria ativa continua destacada visualmente nos dois modos
- [ ] Nenhuma mudança de comportamento fora da tela de catálogo (checkout, pagamento, etc. inalterados)
- [ ] Testado com poucas categorias (2-3) e muitas (10+) nos dois modos, garantindo que nenhum dos dois quebra visualmente nos extremos

---

## QA Explorer

```gherkin
Feature: Menu de categorias horizontal ou vertical no totem

  Scenario: Padrão continua horizontal pra empresas existentes
    Dado uma empresa que nunca configurou essa opção
    Quando o totem carrega o catálogo
    Então o menu de categorias aparece horizontal, como sempre foi

  Scenario: Dono escolhe menu vertical
    Dado o dono em Configurações → Aparência do totem
    Quando ele seleciona "Vertical" e salva
    Então a escolha persiste e é aplicada no totem no próximo carregamento do catálogo

  Scenario: Totem em modo vertical com muitas categorias
    Dado uma empresa com 10+ categorias configurada como "Vertical"
    Quando o cliente abre o catálogo
    Então as categorias aparecem numa coluna lateral com scroll vertical próprio
    E a grade de produtos permanece legível ao lado, sem espremer os cards

  Scenario: Totem em modo vertical com poucas categorias
    Dado uma empresa com 2 categorias configurada como "Vertical"
    Então a coluna lateral aparece normalmente, sem espaço vazio quebrando o layout

  Scenario: Trocar de categoria funciona igual nos dois modos
    Dado o totem em qualquer um dos dois modos
    Quando o cliente toca numa categoria diferente
    Então os produtos daquela categoria carregam e a categoria escolhida fica destacada

  Scenario: Sem regressão no restante do fluxo
    Dado qualquer um dos dois modos de menu
    Quando o cliente completa um pedido do catálogo até o pagamento
    Então todo o fluxo funciona exatamente como antes — carrinho, checkout, pagamento inalterados

  Scenario: Isolamento multi-tenant
    Dado duas empresas com preferências diferentes (uma horizontal, outra vertical)
    Então cada uma vê seu próprio totem com o layout escolhido, sem vazar a preferência de uma pra outra
```

---

## Tech Explorer

### Serviços impactados
- **`services/company/`** — novo campo em `Company`, migration, `AppearanceIn`/`update_appearance`, `CompanyOut`.
- **`services/auth/`** — `CompanyInfo` precisa do mesmo campo (mesma armadilha já documentada: o schema do auth-service filtra o dict solto que o company-service manda; sem adicionar aqui, o totem nunca vê o valor mesmo que o company-service já mande. Ver `services/company/main.py` linhas ~795, ~825 e ~2930 — os 3 pontos internos de montagem de dict que hoje já expõem `visual_theme`/`visual_mode`/`consumption_mode_enabled` pro auth-service, mesmo padrão pro campo novo).
- **`frontend/admin/`** — novo controle na aba "Aparência do totem".
- **`frontend/totem/`** — `CatalogScreen.tsx` ganha o layout vertical alternativo.

### Modelo de dado (company-service)
```python
# Company
catalog_menu_layout = Column(String(10), nullable=False, default="horizontal")
```
Migration nova, mesmo padrão de `consumption_mode`/`totem_videos` (alembic, `op.add_column` com `server_default`).

### Backend — reaproveitar o endpoint de aparência já existente
- `AppearanceIn`: `theme: str`, `mode: str`, **`menu_layout: str`** (novo, opcional com default `"horizontal"` pra não quebrar chamadas antigas do frontend durante o deploy).
- `VALID_MENU_LAYOUTS = {"horizontal", "vertical"}`, validado em `update_appearance` igual a `VALID_THEMES`/`VALID_MODES`.
- `CompanyOut.catalog_menu_layout: str = "horizontal"`.
- `CompanyInfo` (auth-service): mesmo campo, mesmo default.
- Os 3 pontos internos do company-service (`/internal/validate-pin`, `/internal/verify-pin`, dict do pareamento por QR) ganham `"catalog_menu_layout": co.catalog_menu_layout` ao lado de `visual_theme`/`visual_mode`.

### Frontend admin
- `SettingsScreen.tsx`: novo estado `localMenuLayout`, carregado junto de `localTheme`/`localMode` no mesmo `useEffect` (`r.data.catalog_menu_layout ?? "horizontal"`), enviado junto no `saveAppearance()` (`{ theme, mode, menu_layout: localMenuLayout }`).
- UI: dois botões/cards simples "Horizontal" / "Vertical" (reaproveitando o estilo de seleção já usado nos cards de tema, ou um `Dropdown` do design-system — mais simples de implementar, a decidir na implementação qual fica mais consistente visualmente com o card de tema logo acima).
- `TotemPreview`: **fora de escopo** simular o layout vertical no preview em miniatura — o preview hoje é só a `WelcomeScreen` (tela ociosa), que não tem categorias. Simular o `CatalogScreen` ali seria escopo novo, não pedido.

### Frontend totem — `CatalogScreen.tsx`
- Novo prop `menuLayout: "horizontal" | "vertical"` (via `company?.catalog_menu_layout`, passado de `App.tsx`).
- **Modo horizontal:** exatamente o código atual, sem mudança.
- **Modo vertical:**
  - "Zona 2" (categorias) e "Zona 3" (grade) passam a viver dentro de um container `flex-direction: row` em vez do fluxo vertical atual.
  - Categorias: coluna lateral fixa (~220px), botões empilhados (não mais pills horizontais), `overflowY: auto` própria — mesmo padrão de escala da ORD-113 (radius/tipografia/espaçamento já formalizados em `scale.ts`).
  - Grade de produtos: `gridTemplateColumns` cai de 3 pra **2 colunas** no modo vertical (menos espaço horizontal disponível com a coluna lateral presente) — critério de aceite já cobre isso, número exato de colunas confirmado na implementação testando ao vivo pra não espremer os cards.
  - Header e carrinho fixo do rodapé não mudam — continuam full-width, por cima/baixo do container de categorias+grade.

### Riscos
- **Baixo/médio.** Reaproveita o endpoint de aparência já existente (sem endpoint novo) e o padrão já usado 2x nesta sessão (`visual_theme`/`consumption_mode_enabled`) pra propagar um campo novo de empresa até o totem — inclusive a armadilha do `CompanyInfo` do auth-service já é conhecida e documentada, baixo risco de esquecer.
- Maior risco é puramente visual/CSS: garantir que o layout vertical não quebre em categorias com nomes longos, ou em telas com poucas categorias (espaço vazio esquisito na sidebar). Mitigado pelos critérios de aceite testando os dois extremos (poucas/muitas categorias).
- Sem migration em auth-service (não tem banco próprio pra essa info, só repassa o schema).

### Estimativa
5 pontos — campo novo propagado por 2 serviços (padrão já repetido, rápido), UI nova simples no admin, e o item de maior esforço real: reestruturar o CSS do `CatalogScreen.tsx` pro layout vertical, testado nos extremos.

---

## Ready

**Explorer:** [x] persona, história, fluxos admin/totem e critérios de aceite definidos, problema real relatado pelo usuário (muitas categorias no menu horizontal) · **QA Explorer:** [x] cenários cobrindo padrão/opt-in, os dois extremos de quantidade de categoria, não-regressão de fluxo e isolamento multi-tenant · **Tech Explorer:** [x] reaproveita o endpoint de aparência já existente, mesma armadilha de propagação (`CompanyInfo` do auth-service) já conhecida e mapeada, mudança de maior risco isolada no CSS do `CatalogScreen` · **Aprovação final:** [x] pedido direto do usuário (2026-08-23), escopo confirmado (config em Aparência do totem + ajuste do menu lateral no totem).

**Status: Ready** — pode começar a implementação.

---

## Downstream

- **Branch:** `feature/ord-116-menu-categorias-vertical-totem`, a partir de `main`.
- **`services/company/`**: `Company.catalog_menu_layout` (novo, default `"horizontal"`) + migration `20260823_1000_catalog_menu_layout.py`; `AppearanceIn.menu_layout` (default `"horizontal"`, pra não quebrar chamadas antigas durante o deploy); `VALID_MENU_LAYOUTS`; `update_appearance` valida e grava; `CompanyOut.catalog_menu_layout`; os 3 pontos internos de montagem de dict (`/internal/validate-pin`, `/internal/verify-pin`, pareamento por QR) ganharam o campo novo — mesma armadilha de propagação já mapeada e documentada em memória, sem susto desta vez.
- **`services/auth/`**: `CompanyInfo.catalog_menu_layout` — sem isso o totem nunca veria o valor mesmo com o company-service já mandando.
- **`frontend/admin/`**: `SettingsScreen.tsx` — `localMenuLayout`, carregado/salvo junto do tema/cor existente; novo `Toggle` "Menu de categorias" no mesmo padrão visual do toggle de modo claro/escuro, logo abaixo dele. `types.ts` ganhou `Company.catalog_menu_layout`.
- **`frontend/totem/`**: `types.ts` (`CompanyInfo.catalog_menu_layout`), `App.tsx` (nova prop `menuLayout` pro `CatalogScreen`), `CatalogScreen.tsx` — categorias e grade de produtos passam a viver num container `flex` que vira `row` no modo vertical; categorias em coluna lateral fixa (240px) com `overflowY: auto` própria; grade cai de 3 pra 2 colunas no modo vertical. Modo horizontal preservado exatamente como estava (mesmo código, sem diferença visual).
- `tsc --noEmit`: limpo (admin e totem). Sintaxe Python verificada via `ast.parse`. Migration rodou limpo no rebuild (`20260822_1800 -> 20260823_1000`).
- **Verificado ao vivo, ponta a ponta:** criei 10 categorias de teste na Burger House via API (11 categorias no total, cenário de "muitas categorias"), ativei o modo vertical via `PATCH /companies/{id}/appearance`, confirmei a propagação completa (`company-service` → `auth-service` → resposta de login do totem) e o totem renderizando a sidebar corretamente — 11 categorias na coluna lateral com scroll, grade 2 colunas, categoria ativa destacada, troca de categoria funcionando. Testei também o modo horizontal (padrão) depois de reverter — sem nenhuma regressão visual, idêntico a antes da história. UI do admin confirmada mostrando o novo toggle "Menu de categorias" e persistindo o valor corretamente após reload. Categorias de teste excluídas e empresa revertida pro estado original (`horizontal`) ao final.

- PR ainda não aberta — aguardando decisão do usuário sobre commit/PR/merge.
