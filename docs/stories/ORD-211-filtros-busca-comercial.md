# ORD-211 — Filtros de busca nas listagens de Comercial

**Status:** Ready

## História
Como Administrativo/Financeiro da Ordin, quero buscar por nome (e documento, no caso de
Parceiros) e filtrar por status/categoria nas 4 listagens de Comercial, dentro da mesma caixa de
filtro visual já usada no Catálogo, para encontrar um item rapidamente quando o volume crescer.

> **Nota de escopo (pós-Ready):** o desenho original desta história (abaixo, na íntegra) cobria só
> busca por texto. Durante a implementação, feedback direto do usuário ampliou o escopo pra incluir
> a caixa de filtro visual (`.filterBar`, mesmo componente do Catálogo), filtros de Status/Categoria
> como `Dropdown`, e o botão "Limpar filtros" — ver seção **Revisão pós-Ready** ao final deste
> documento pra o desenho final realmente implementado.

## Contexto e motivação
Nenhuma das 4 abas de `CommercialScreen.tsx` (Tabela de preço, Módulo fiscal, Parceiros, Tabelas
de comissão) tem busca ou filtro — só o toggle binário "mostrar arquivadas/inativos" (existente em
Parceiros e Tabelas de comissão). Gap apontado pelo usuário, preventivo: o volume atual é baixo (2
tabelas de preço, 2 add-ons fiscais, 1 parceiro, 2 tabelas de comissão), mas fica difícil de achar
item quando crescer.

Achado que muda o desenho: os 4 endpoints de listagem (`list_price_tables`,
`list_fiscal_addon_plans`, `list_partners`, `list_commission_tables`) não têm paginação — sempre
retornam a lista inteira. Por isso o filtro é **100% client-side**, sem endpoint novo, diferente do
padrão server-side de `CompanyListScreen` (que pagina).

## Fluxo principal
1. Admin abre uma das 4 abas de Comercial
2. Digita no campo de busca (sempre primeiro à esquerda na barra superior)
3. A lista filtra em tempo real, sem round-trip de rede
4. Em Parceiros, a busca também considera o documento (CPF/CNPJ, com ou sem máscara)
5. Limpar a busca volta a mostrar a lista completa, respeitando o estado atual do toggle
   "mostrar arquivadas/inativos" (quando existir)

## Fluxos alternativos / exceções
- Busca sem resultado: estado vazio claro ("nenhum resultado"), não tabela quebrada.
- Busca e toggle combinam com E lógico — um não sobrescreve o outro.
- Fora de escopo: paginação/filtro server-side (nota registrada abaixo, não implementar agora).

## Dependências
- Nenhuma história bloqueante — os 4 endpoints já existem e não mudam.

## Critérios de aceite funcionais
- [ ] Campo de busca visível nas 4 telas, sempre primeiro à esquerda na barra superior
- [ ] Busca por nome filtra em tempo real, case-insensitive, nas 4 telas
- [ ] Em Parceiros, busca também considera documento — normalizado dos dois lados (usuário pode
      digitar com máscara, `Partner.document` está salvo sem máscara)
- [ ] Busca sem resultado mostra estado vazio claro
- [ ] Limpar a busca restaura a lista completa respeitando o toggle já marcado
- [ ] Busca e toggle "mostrar arquivadas/inativos" combinam (E lógico), não um sobrescreve o outro

## Wireframe / Mockup
`InputBase` com `icon="search"`, `placeholder="Buscar por nome…"` — mesmo padrão visual já usado
em `CompanyListScreen.tsx`/`SupplierListScreen.tsx`/`ComboFormScreen.tsx`. Posição fixa nas 4
telas: busca primeiro à esquerda, checkbox (quando existir) em seguida, botão "+ Novo X" sempre à
direita.

---

## Solução Técnica

### Serviços impactados
- **`frontend/admin`**: 4 telas alteradas. Nenhum backend muda — os 4 endpoints já retornam a
  lista inteira, sem paginação.

### Implementação
Cada tela ganha um `useState<string>` de busca + `.filter()` sobre o array já carregado, antes de
passar pra `Table` (só a prop `rows` muda — `columns`/`rowKey` ficam iguais nas 4):

```tsx
const [search, setSearch] = useState("");
const filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
// ...
<Table columns={columns} rows={filtered} rowKey={...} />
```

**Parceiros** — busca também por documento, reaproveitando `normalizeCnpj` (não `normalizeCpf`)
como normalizador genérico: sua regex (`[./-]`, uppercase) cobre CPF (só dígitos, passa sem
alteração) e CNPJ (incluindo o formato alfanumérico novo) sem precisar saber de antemão qual tipo
o texto digitado representa — evita criar um terceiro helper só pra busca.
```tsx
const normalized = normalizeCnpj(search);
const filtered = partners.filter((p) =>
  p.name.toLowerCase().includes(search.toLowerCase()) ||
  (normalized.length > 0 && p.document.includes(normalized))
);
```

**Sem debounce** — decisão explícita: debounce existe pra evitar requisição de rede a cada tecla
(caso de `CompanyListScreen`/`SupplierInvoiceScreen`, que filtram no servidor). Aqui é
`.filter()` síncrono em memória, sem I/O — debounce só adicionaria atraso artificial.

### Migrations
Nenhuma.

### Riscos técnicos
- Nenhum risco técnico novo — mudança aditiva e isolada por tela.

### Nota para revisitar no futuro (não implementar agora)
O gargalo real com volume não é o `.filter()` (trivial mesmo com milhares de itens de texto
curto) — é o **fetch inicial sem paginação**. Revisitar pra filtro server-side com paginação
quando o `GET` de alguma dessas 4 listas começar a pesar perceptivelmente no carregamento (não há
número exato — é sobre sentir o carregamento inicial pesar, não sobre performance do filtro).

### Testes
- **Componente** (Vitest + React Testing Library, mesmo padrão de `WizardSteps.test.tsx`) — 1
  arquivo por tela, cobrindo: busca filtra por nome, busca vazia mostra estado vazio, limpar busca
  restaura a lista, busca+toggle combinam (nas 2 telas com toggle), busca por documento mascarado
  encontra parceiro salvo sem máscara.
- **Sem Playwright dedicado** — lógica de filtro não envolve rede; guardar E2E pra fluxos que
  atravessam backend de verdade.
- **1 print manual** — confirma o critério de layout (busca sempre à esquerda, botão sempre à
  direita) nas 4 telas.

### Estimativa
~3.5h (4 telas × implementação + 4 arquivos de teste de componente + 1 print manual).

---

## Repasses realizados

Esta história não precisou de repasse de Administrativo/Financeiro — feature puramente
técnica/UX, sem implicação de negócio, dinheiro ou contrato (achado de processo: nem toda história
precisa dos 5 repasses por padrão).

| Repasse | Achado principal | Aplicado |
|---|---|---|
| PM | Documentou o limite real pra revisitar filtro server-side (gargalo é o fetch, não o filtro); definiu posição fixa de layout nas 4 telas | Sim |
| QA | Normalização de documento precisa cobrir os dois lados (usuário digita com máscara, banco guarda sem); cenário de borda "limpar busca respeita toggle"; recomendou teste de componente (Vitest+RTL) em vez de Playwright | Sim |
| Frontend | Confirmou precedente de estilo (`CompanyListScreen`), decidiu sem debounce (sem I/O de rede), reaproveitou `normalizeCnpj` como normalizador genérico em vez de criar helper novo | Sim |

## Rastreabilidade ponta a ponta

| Passo do Fluxo Principal | Critério de aceite | Cenário de teste | Tela |
|---|---|---|---|
| 1. Abrir uma das 4 abas | Campo de busca visível, posição fixa | Print manual de layout | 4 telas |
| 2. Digitar no campo | Filtra em tempo real, case-insensitive | Busca por nome (componente) | 4 telas |
| 3. Buscar em Parceiros | Nome OU documento, normalizado nos dois lados | Busca por documento mascarado (componente) | `PartnerListScreen.tsx` |
| 4. Busca sem resultado | Estado vazio claro | Busca sem match (componente) | 4 telas |
| 5. Limpar a busca | Lista completa, toggle preservado | Limpar busca + toggle marcado (componente) | `PartnerListScreen.tsx` / `CommissionTableListScreen.tsx` |

Fora de escopo (paginação/filtro server-side) — decisão explícita, registrada como nota, não
omissão.

---

## Revisão pós-Ready — filterBar + Dropdown de Status/Categoria + Limpar filtros

Feedback do usuário durante a implementação (depois do "vai pra Ready e implementa") ampliou o
desenho original. Registrado aqui em vez de reabrir o upstream porque é refinamento de UI sobre a
mesma história, sem novo endpoint nem mudança de regra de negócio.

### O que mudou
1. **Caixa de filtro visual** — as 4 telas ganharam a mesma `.filterBar` (caixa branca com borda,
   grid responsivo) já usada em `CatalogScreen.tsx`/`CompanyScreen.tsx`, via
   `import styles from "./CompanyScreen.module.scss"` (nenhuma das 4 telas importava CSS module
   antes — só `style={{}}` inline).
2. **Filtros de Status/Categoria ampliados** (pedido explícito do usuário: "amplie oportunidades de
   filtros como status, categoria, ativos e inativos"), usando campos que já existiam nas
   entidades:
   - **Parceiros**: Status vira `Dropdown` de 3 estados (Ativos/Inativos/Todos) — antes só um
     checkbox binário "mostrar inativos" (sem estado "só inativos").
   - **Tabelas de comissão**: Status vira `Dropdown` de 3 estados (Ativas/Arquivadas/Todas) —
     mesma lacuna do checkbox binário original.
   - **Tabela de preço**: ganhou 2 `Dropdown` novos que não existiam — Status (Todos/Rascunho/
     Vigente/Histórica, usando o `PriceTableStatus` já existente) e Categoria (Todas/Sem categoria/
     Alternativa/Promocional, usando o campo `kind` já existente, mesmo dado que já aparecia como
     coluna "Categoria" na tabela).
   - **Módulo fiscal**: só ganhou a `.filterBar` — `FiscalAddonPlan` não tem campo de status nem
     categoria, não há o que filtrar além do nome.
3. **Botão "Limpar filtros"** — pedido à parte ("faltou o botão limpar filtros também"), ao lado do
   botão "+ Novo X", habilitado só quando existe algum filtro ativo (`hasActiveFilters`), resetando
   busca + todos os dropdowns pro estado neutro.

### Decisão revertida em tempo real: Tabs → Dropdown
A primeira instrução do usuário foi explícita: status "não como chackbox e select". Implementei
como `Tabs` (segmented control), componente do design-system nunca usado antes como filtro inline
de listagem (só como navegação de seção, ex.: as próprias abas de `CommercialScreen.tsx`).
Verificado ao vivo, funcionando, em `PartnerListScreen.tsx`.

O usuário então contestou a própria instrução anterior: "sério qeu vc colocou estilo aba para ativo
e inativos, qual o problema de colocar um campo select?". Como isso contradizia diretamente o que
foi pedido antes, resolvi com `AskUserQuestion` em vez de adivinhar — resposta confirmada:
**Dropdown/select, não Tabs**. As 4 telas foram implementadas (ou revertidas, no caso de
`PartnerListScreen.tsx`) para `Dropdown`, consistente com o padrão já usado em `CatalogScreen.tsx`
pros mesmos tipos de filtro.

### Semântica de 3 estados sobre endpoints binários
Nenhum dos 2 endpoints com toggle (`list_partners`/`include_inactive`,
`list_commission_tables`/`archived`) tem um modo nativo "só inativos"/"só arquivadas" — os dois só
sabem responder "com ou sem" o registro inativo/arquivado junto dos ativos. O terceiro estado do
Dropdown ("Inativos"/"Arquivadas" isoladamente) é resolvido com filtro client-side adicional sobre
a resposta que já inclui todos os registros (`params: { include_inactive: filter !== "ativos" }` /
`{ archived: filter !== "ativas" }`, seguido de `.filter()` no array retornado).

### Critérios de aceite adicionados
- [x] As 4 telas têm a mesma caixa de filtro visual (`.filterBar`) do Catálogo
- [x] Parceiros e Tabelas de comissão têm filtro de Status com 3 estados via Dropdown (incluindo
      "só inativos"/"só arquivadas", que o checkbox binário original não permitia)
- [x] Tabela de preço tem filtro de Status (4 estados) e Categoria (4 estados) via Dropdown
- [x] Botão "Limpar filtros" presente nas 4 telas, desabilitado quando não há filtro ativo, reseta
      busca + todos os dropdowns

### Testes
Sem mudança na estratégia — os testes de componente (Vitest) continuam cobrindo só as funções
puras de busca por texto (`matchesXSearch`), que não mudaram. A lógica de filtro por
status/categoria é comparação de campo simples (`t.status === filter`), inline no componente, sem
justificar extração pra função pura testável separada (diferente da normalização de documento em
Parceiros, que tinha lógica real o suficiente pra valer a pena). Verificação de Status/Categoria
feita via browser ao vivo nas 4 telas (evidência abaixo).

### Evidências
`docs/stories/ORD-211/evidencias/manual/` — 1 print por tela (`parceiros-filtros.jpg`,
`tabela-preco-filtros.jpg`, `modulo-fiscal-filtros.jpg`, `tabelas-comissao-filtros.jpg`),
substituindo o print único genérico previsto no desenho original.
