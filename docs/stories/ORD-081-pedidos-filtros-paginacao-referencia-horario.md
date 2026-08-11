---
id: ORD-081
status: Done
fase: 6
sprint: null
responsavel: Backend + Frontend
estimativa: 8 pontos
---

# ORD-081 — Pedidos: filtros (empresa, referência, status, data e faixa de horário), paginação e mesmo padrão visual de Transações

## Descrição
Pedido direto do usuário: levar o mesmo padrão de tela que a Fase 6 estabeleceu em Transações (`/payments` — ver [[ORD-077]], [[ORD-078]], [[ORD-079]], [[ORD-080]]) para a tela de Pedidos (`/orders`), que hoje está no estado "pré-Fase-6" — sem filtro de verdade, sem paginação, tabela HTML crua. O usuário citou explicitamente a tela de Transações como referência de qualidade a seguir.

**Achado crítico não pedido, descoberto na investigação:** o filtro de status do frontend (`STATUS_OPTIONS` em `OrdersScreen.tsx:13-18`) lista `pending`/`completed`/`cancelled` — **falta `paid`**. Consultei o banco ao vivo (`docker compose exec order-service` + query direta): dos 85 pedidos existentes hoje, **54 (63%) estão com status `paid`** — a maioria dos pedidos não pode ser filtrada explicitamente hoje, só aparece em "Todos". Isso não é um problema introduzido por esta história, é uma lacuna pré-existente que só ficou visível ao investigar os valores reais de status no banco em vez de confiar na lista hardcoded do frontend.

## Persona
**Superadmin/admin** (gestão da plataforma, [[project_ordin_architecture]] — role recém-equiparados, ver commit `85be419`) ganham acesso a Pedidos de qualquer empresa, com filtro de empresa. **Owner/manager** de uma empresa específica continuam vendo só os próprios pedidos, mas ganham busca por referência, filtro de status completo (incluindo `paid`), período e faixa de horário — útil pra localizar um pedido específico que um cliente questiona, ou analisar volume por turno (ex.: horário de almoço).

## Contexto

### Achado 1 — zero filtros de verdade, tabela HTML crua
`OrdersScreen.tsx` só tem um `Dropdown` de status (`all/pending/completed/cancelled`) e nada mais — sem período, sem busca, sem empresa. A tabela é `<table>`/`<td>` cru com classes locais (`OrdersScreen.module.scss`), não usa o componente `Table` compartilhado (`components/Table.tsx`) que Transações já usa (variant `compact`, hover de linha, altura fixa, seta de expandir). O painel de tickets expansível é reimplementado do zero com `Fragment`/`<tr>` manual, em vez de usar `renderExpanded`/`expandedRowKey` que o `Table` já suporta desde o ORD-080.

### Achado 2 — hard cap de 100 sem paginação real no frontend
`api.get(\`/orders?status=${status}&limit=100\`)` — sem `skip`. O backend (`list_orders`, `services/order/main.py:325-362`) **já devolve `total`** e já aceita `skip`/`limit` — a paginação existe no backend e nunca foi ligada no frontend. Diferente de Transações antes do ORD-077 (que precisou de paginação nova nos dois lados), aqui é só destravar o que já existe no backend.

### Achado 3 — sem bypass de superadmin/admin (mesmo padrão do Achado 3 do ORD-077)
`list_orders` filtra sempre por `Order.company_id == current_user.company_id` (`main.py:333,340`), sem exceção de role — mesma lacuna que o `payment-service` tinha antes do ORD-077. Como `/orders` acabou de ganhar acesso pra `superadmin`/`admin` no commit `85be419` (matriz de RBAC desta sessão), sem esse bypass a tela abre mas **sempre mostra só os pedidos da company_id do próprio token do superadmin** (hoje `1`, Burger House) — o mesmo tipo de bug silencioso que o cancelamento de transação teve (ver commit `7959e98`, RBAC do superadmin em `cancel_payment`), só que aqui ainda não foi reportado porque ninguém testou Pedidos como superadmin com mais de uma empresa tendo pedidos ainda.

### Achado 4 — terminal mostrado como ID cru
`<td>Terminal {o.terminal_id}</td>` — mostra `Terminal 1`, não o nome real (`Totem 1 - Entrada`). Transações já resolve isso via `listTerminals()` (`api/companies.ts`, adicionado no ORD-080) com cache por empresa. Mesmo padrão, reaproveitável direto.

### Achado 5 — só a Burger House tem pedidos no seed hoje
Confirmado ao vivo (`SELECT company_id, status, COUNT(*) FROM orders GROUP BY company_id, status`): **85 pedidos, todos `company_id=1`** (23 pending, 54 paid, 8 cancelled — nenhum `completed` ainda). Mesma razão do ORD-077: o filtro de empresa pro superadmin nunca vai ser percebido como quebrado no ambiente de dev atual, só em produção com múltiplas empresas ativas.

### Por que não apareceu antes
Pedidos nunca passou por uma revisão de PM dedicada — foi implementado no Sprint 2 (`ORD-006` em diante) e nunca revisitado, enquanto Transações passou pela Fase 6 inteira nesta semana. A lacuna do `paid` como status não filtrável é fácil de não notar porque "Todos" sempre inclui esses pedidos — só aparece ao tentar filtrar especificamente por eles.

---

## Explorer

### História
Como **superadmin/admin**, quero filtrar pedidos por empresa, referência, status, período e faixa de horário, para localizar um pedido específico ou analisar volume por turno sem depender de acesso direto ao banco. Como **owner/manager**, quero os mesmos filtros (sem o de empresa, que não se aplica), pelo mesmo motivo — e quero que a tela pareça e se comporte como a de Transações, que já é a referência de qualidade do admin.

### Fluxo principal
1. Usuário abre `/orders`
2. Vê uma barra de filtros no topo, mesmo layout de Transações: (superadmin/admin apenas) empresa, referência (busca livre), período (De/Até), faixa de horário (De/Até), status
3. Aplica um ou mais filtros — lista atualiza, mostra "N pedidos encontrados"
4. Tabela no padrão `Table` compact (mesma altura de linha, mesmo cabeçalho, hover) — clicar numa linha expande o painel com os tickets do pedido (chevron, mesmo padrão do detalhe de Transações)
5. Paginação via componente `Pagination` do design system (mesmo componente que Transações passou a usar nesta sessão)
6. "Limpar" volta ao estado padrão

### Critérios de aceite
- [x] Filtro de empresa visível só pra `superadmin`/`admin` (mesmo Dropdown + `listCompanies()` de Transações)
- [x] Busca por referência (`order_ref`) — campo de texto livre, busca parcial (não precisa digitar o código inteiro)
- [x] Filtro de status inclui **todos** os valores reais usados no banco: `pending`, `paid`, `completed`, `cancelled` (corrige a lacuna do Achado crítico)
- [x] Filtro de período (De/Até) — mesmo `DateInput` com validação Até ≥ De e Até desabilitado até De ser preenchido (mesmo comportamento ajustado em Transações nesta sessão)
- [x] Filtro de faixa de horário (De/Até) — **decidido com o usuário (2026-08-11):** filtra pela hora do dia (`TIME` de `created_at`), independente da data — caso de uso real: cliente não tem mais o número do pedido, mas lembra aproximadamente do horário que fez. **Desabilitado até a data "De" ser preenchida** (mesmo padrão de habilitação progressiva já usado em Até/De de Transações) — não faz sentido filtrar por horário sem ao menos um ponto de partida de data.
- [x] Filtro por CPF do cliente — **decidido com o usuário:** campo de busca (não é obrigatório no pedido, mas quando o cliente insere no totem, filtrar por ele ajuda a localizar). CPF também aparece no painel de detalhe expandido (ver critério abaixo).
- [x] **Sem filtro de terminal** — **decidido com o usuário:** removido do escopo. Cada empresa nomeia terminal como quiser, um filtro por esse campo ficaria bagunçado entre empresas diferentes (mesmo assim o nome do terminal continua sendo exibido, só não é filtrável — ver critério de nome do terminal abaixo).
- [x] Cards de resumo por status (pendente/pago/concluído/cancelado), mesmo padrão do `ORD-078` em Transações — **decidido com o usuário:** implementar.
- [x] Paginação real via componente `Pagination` do design system — mesmo padrão de Transações
- [x] Tabela usa o componente `Table` compartilhado (`variant="compact"`) em vez de HTML cru — cabeçalho, altura de linha e hover idênticos a Transações
- [x] Terminal mostrado pelo nome (`listTerminals`), não pelo ID cru
- [x] Painel de tickets do pedido migra pro mecanismo `renderExpanded`/`expandedRowKey` do `Table` (chevron), substituindo o botão "Tickets"/"Fechar" atual — CPF do cliente exibido ali também (mascarado parcialmente, ex.: `123.***.**9-01`, mesmo cuidado com PII que o projeto já tem em outros lugares)
- [x] Superadmin/admin sem filtro de empresa selecionado veem pedidos de **todas** as empresas (hoje só vê a própria, silenciosamente)
- [x] Owner/manager continuam restritos à própria empresa mesmo manipulando a URL/request (backend valida)
- [x] Nenhuma mudança de comportamento pra quem já usa a tela hoje sem filtro, exceto o teto de 100 virar paginado

### Wireframe / Mockup
Não desenhei protótipo novo — a recomendação é clonar a estrutura visual/CSS já aprovada de `PaymentsScreen.tsx`/`.module.scss` (filter-bar em grid, cards de resumo, tabela compact, painel de detalhe), trocando os campos e status pelos específicos de Pedidos.

---

## QA Explorer

```gherkin
Feature: Filtros, paginação e busca em Pedidos

  Scenario: Superadmin/admin veem pedidos de todas as empresas por padrão
    Dado que o usuário logado é superadmin ou admin
    Quando ele abre /orders sem aplicar nenhum filtro
    Então a lista inclui pedidos de mais de uma empresa (quando existirem)

  Scenario: Superadmin/admin filtram por uma empresa específica
    Dado que o usuário logado é superadmin ou admin
    Quando ele seleciona uma empresa no filtro
    Então só pedidos dessa empresa aparecem, e o contador reflete o total correto

  Scenario: Owner/manager não veem filtro de empresa e não escapam da própria
    Dado que o usuário logado é owner ou manager
    Quando ele abre /orders ou tenta GET /orders?company_id=<outra> diretamente
    Então o campo de filtro de empresa não aparece na UI
    E o backend ignora o parâmetro pra esse role — nunca retorna dados de outra empresa

  Scenario: Busca por referência
    Dado que existe um pedido com referência "ORD-7F3A9"
    Quando o usuário digita "7F3A9" no campo de busca
    Então só esse pedido aparece na lista

  Scenario: Filtro de status inclui "paid"
    Dado que existem pedidos com status paid, pending, completed e cancelled
    Quando o usuário seleciona o status "Pago"
    Então só pedidos com status paid aparecem (hoje esse filtro nem existe)

  Scenario: Filtro de período
    Dado que existem pedidos em datas diferentes
    Quando o usuário define De e Até
    Então só pedidos dentro do intervalo aparecem
    E Até não aceita data anterior a De

  Scenario: Filtro de faixa de horário desabilitado sem data
    Dado que o usuário ainda não preencheu o campo "De" (data)
    Quando ele olha os campos de faixa de horário
    Então eles aparecem desabilitados

  Scenario: Filtro de faixa de horário
    Dado que o usuário já preencheu a data "De"
    E existem pedidos em horários diferentes do dia, em dias diferentes do período
    Quando ele define uma faixa de horário (ex.: 11:00–14:00)
    Então só pedidos criados dentro dessa faixa de horário aparecem, em qualquer dia do período filtrado
    E isso ajuda a localizar um pedido específico quando o cliente só lembra o horário aproximado

  Scenario: Filtro por CPF
    Dado que existe um pedido com CPF preenchido
    Quando o usuário digita o CPF no filtro
    Então só pedidos desse CPF aparecem

  Scenario: CPF exibido mascarado no detalhe
    Dado que um pedido tem CPF preenchido
    Quando o usuário expande a linha desse pedido
    Então o CPF aparece parcialmente mascarado no painel de detalhe

  Scenario: Cards de resumo por status
    Dado que existem pedidos com status variados
    Quando o usuário abre /orders
    Então vê um card por status (pendente/pago/concluído/cancelado) com contagem e não muda com o filtro de status aplicado na tabela (mesmo comportamento do resumo de Transações)

  Scenario: Sem filtro de terminal
    Dado que o usuário olha a barra de filtros
    Então não existe nenhum campo de filtro por terminal
    E o nome do terminal continua aparecendo no detalhe expandido

  Scenario: Paginação
    Dado que o resultado filtrado tem mais de uma página
    Quando o usuário navega pelo componente Pagination
    Então a página correspondente carrega

  Scenario: Expandir pedido mostra tickets
    Dado que um pedido tem tickets
    Quando o usuário clica na linha do pedido
    Então o painel expande mostrando os tickets (código, unidade, status, coletado por/em)
    E o terminal do pedido aparece pelo nome, não pelo ID

  Scenario: Limpar filtros
    Dado que o usuário tem filtros aplicados
    Quando clica em "Limpar"
    Então todos os campos voltam ao estado padrão e a lista recarrega
```

---

## Tech Explorer

### Serviços impactados
- `services/order/` — `main.py` (`list_orders`)
- `frontend/admin/` — `OrdersScreen.tsx`, `OrdersScreen.module.scss` (maior parte vira redundante com `Table`/filter-bar compartilhados), novo `api/orders.ts` (mesmo padrão de `api/payments.ts`)

### Diagnóstico técnico (confirmado ao vivo e no código)
| Achado | Evidência |
|---|---|
| Status `paid` não é filtrável no frontend | `STATUS_OPTIONS` (`OrdersScreen.tsx:13-18`) não lista `paid`; query real no banco confirma 54/85 pedidos com esse status |
| Paginação já existe no backend, não usada no frontend | `list_orders` já devolve `total` e aceita `skip`/`limit` (`main.py:325-343`); frontend só manda `limit=100` fixo |
| Sem bypass de empresa pro superadmin/admin | `Order.company_id == current_user.company_id` sem exceção de role (`main.py:333,340`) — mesmo padrão do Achado 3 do [[ORD-077]] antes de corrigido |
| Volume real hoje | `company_id=1`: 23 pending, 54 paid, 8 cancelled, 0 completed (query direta no MySQL) — só essa empresa tem pedidos |
| Terminal cru | `<td>Terminal {o.terminal_id}</td>` (`OrdersScreen.tsx:85`) — sem resolver nome |

### Direção técnica proposta

**Backend (`list_orders`):**
```python
async def list_orders(
    status: Optional[str] = None,
    order_ref: Optional[str] = None,    # busca parcial, LIKE
    cpf: Optional[str] = None,          # busca por prefixo, normalizada (só dígitos)
    company_id: Optional[int] = None,   # só tem efeito pra superadmin/admin
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    hour_from: Optional[str] = None,    # "HH:MM" — só tem efeito com date_from setado
    hour_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    ...
):
    if current_user.role in ("superadmin", "admin"):
        q = select(Order)
        if company_id:
            q = q.where(Order.company_id == company_id)
    else:
        q = select(Order).where(Order.company_id == current_user.company_id)
    if status: q = q.where(Order.status == status)
    if order_ref: q = q.where(Order.order_ref.like(f"%{order_ref}%"))
    if cpf: q = q.where(Order.cpf == normalize_cpf(cpf))
    if date_from: q = q.where(Order.created_at >= date_from)
    if date_to: q = q.where(Order.created_at <= date_to)
    if date_from and hour_from: q = q.where(func.time(Order.created_at) >= hour_from)
    if date_from and hour_to: q = q.where(func.time(Order.created_at) <= hour_to)
    # total espelhando os mesmos filtros, mesmo padrão de list_payments/list_orders atual

    # Resumo por status (mesmo padrão do ORD-078 em list_payments) — sempre
    # sobre base_filters (empresa/período/horário/CPF/referência), ignora o
    # filtro de status de propósito, pra mostrar a distribuição completa
    # mesmo com a tabela filtrada por um status só.
```
Mesma convenção que `list_payments` já estabeleceu no ORD-077 (`superadmin`/`admin` com bypass condicional a `company_id` opcional, resto do role restrito). `order_ref` com `LIKE` — índice único hoje é exato (`unique=True`, `main.py:32`); busca parcial não usa esse índice, mas com 85 registros não é um problema de performance agora; vale um índice `FULLTEXT` ou `LIKE 'prefix%'` (que usa índice B-tree) se o volume crescer — não bloqueia a entrega. `cpf` — busca por prefixo (`LIKE 'xxx%'`), não igualdade exata: **corrigido ao vivo durante a implementação** — a primeira versão usava igualdade, e o usuário reportou que lembrar só os primeiros dígitos de um CPF ("030") não achava nada. Prefixo usa índice B-tree se um for adicionado depois (hoje sem índice, aceitável no volume atual).

**Faixa de horário — decidido com o usuário (2026-08-11):** hora do dia via `func.time(created_at)`, aplicado sobre o período já filtrado — não um timestamp único combinado. Caso de uso real: cliente perdeu o número do pedido mas lembra o horário aproximado. `hour_from`/`hour_to` só têm efeito quando `date_from` está setado — replicado no frontend como campo desabilitado (mesmo padrão de `disabled={!dateFrom}` que Até já usa em Transações).

Não existe componente de hora no design system (só `DateInput` — confirmado, busquei em `vendor/design-system/dist/components/`). Direção: `InputBase` com `type="time"` (herda `InputHTMLAttributes<HTMLInputElement>`, input nativo do browser) — reaproveita o chrome visual do DS sem precisar de componente novo.

**CPF:** campo de busca de texto livre (`InputBase`, sem máscara — aceita com ou sem pontuação, normalizado no backend via `normalize_cpf` já existente em `domain/cpf.py`). Exibido no painel de detalhe mascarado (ex.: `123.***.**9-01`) — mesmo cuidado com PII que o projeto já aplica a contatos/responsável legal no company-service (campos `_enc`).

**Frontend:** clona `PaymentsScreen.tsx` quase literalmente — mesma filter-bar em grid (agora com empresa, referência, CPF, período, faixa de horário, status — 6 campos + botão, uma linha a mais que Transações), mesmos cards de resumo (`STATUS_CARDS` equivalente: pendente/pago/concluído/cancelado), mesmo uso de `Table` `variant="compact"` com `renderExpanded` pro painel de tickets (substituindo o `Fragment`/`<tr>` manual atual), mesmo `Pagination` do design system. `api/orders.ts` novo espelhando `api/payments.ts` (`listOrders`, `buildOrderListQuery`).

### Riscos
- Reaproveitar `Table`/`Pagination`/padrão de filtro e cards já validados em Transações reduz bastante o risco de implementação — não é um componente novo, é reuso do que a Fase 6 já testou em produção.
- `order_ref` com `LIKE '%...%'` não usa índice — aceitável no volume atual, registrar como dívida se crescer (mesmo espírito da nota de índice do ORD-077).
- Migrar o painel de tickets pro `renderExpanded` do `Table` muda a marcação HTML mas não o comportamento visível — baixo risco, já é um padrão testado (Transações, ORD-080).
- CPF em texto plano no painel de detalhe (mascarado) — mesmo risco de exposição que qualquer PII em tela; mascarar cobre o caso comum, mas vale revisar se algum role deveria ver o CPF completo (ex.: pra conferência manual) — não bloqueia a entrega, fica como nota pra QA validar visualmente.

### Estimativa
8 pontos — mais escopo que o ORD-077 (5): busca por referência, CPF, faixa de horário (campo sem componente pronto no DS) e resumo por status (equivalente ao ORD-078, 3 pontos, mas replicado aqui). Boa parte do trabalho é reuso direto de padrão já construído e testado (`Table` compact, `Pagination`, filter-bar, cards, `listTerminals`), o que reduz o risco de UI mesmo com mais campos.

---

## Sugestões de PM/UX — decididas com o usuário (2026-08-11)

1. **Faixa de horário** — hora do dia sobre o período filtrado, desabilitada até "De" ser preenchido. Caso de uso confirmado: cliente sem o número do pedido, sabe o horário aproximado.
2. **Cards de resumo por status** — aprovado, mesmo padrão do ORD-078.
3. **CPF** — aprovado como filtro (não só exibição); mascarado no painel de detalhe.
4. **Filtro de terminal** — recusado. Nome de terminal é livre por empresa, um filtro por esse campo ficaria bagunçado entre empresas diferentes. Nome do terminal continua sendo exibido (achado 4), só não vira filtro.

---

## Ready

**Explorer:** [x] fluxo, personas e critérios de aceite definidos, achado crítico do status `paid` documentado · **QA Explorer:** [x] cenários Gherkin cobrindo multi-tenant, busca, todos os filtros novos (incluindo CPF, resumo, habilitação condicional de horário), paginação e expansão · **Tech Explorer:** [x] diagnóstico medido ao vivo (query direta no MySQL), direção técnica com assinatura de endpoint completa, riscos e estimativa · **Aprovação final:** [x] aprovado no chat pelo usuário (2026-08-11) — faixa de horário (hora do dia sobre o período, condicionada a "De"), cards de resumo, filtro de CPF e recusa do filtro de terminal, todos decididos

**Status: Ready** — pode começar a implementação.

---

## Downstream

Fluxo simplificado de dev único, sem revisor formal nem branch protection (ver `docs/WORKFLOW.md` — Code Review "hoje, o próprio autor").

- **To Do → In Progress:** branch `feature/ord-081-pedidos-filtros` criada a partir de `main`.
- Implementação completa (backend `order-service` + frontend `OrdersScreen`/`api/orders.ts`), conforme a solução técnica do Tech Explorer.
- **49 testes passando** em `services/order/tests/` (38 pré-existentes + 11 novos, sem regressão) — cobrem os filtros novos, bypass multi-tenant de superadmin/admin, resumo por status ignorando o filtro de status.
- `tsc --noEmit` limpo.
- Verificado ao vivo via `curl` autenticado contra o gateway (não só teste automatizado): `status=paid` retornando os pedidos reais esperados, faixa de horário respeitando a trava de `date_from`, CPF com pontuação normalizado, superadmin sem filtro vendo todas as empresas.
- **3 ajustes pós-implementação, encontrados em revisão ao vivo do usuário no navegador** (não cobertos pelos critérios originais, corrigidos no mesmo ciclo):
  - Filtro de CPF implementado como igualdade exata não achava nada com busca parcial ("030") — corrigido pra `LIKE 'prefixo%'`, teste novo adicionado.
  - Campo de data (`De`/`Até`) cortando o texto no grid do filtro — `minmax` do grid aumentado de 150px pra 180px.
  - Status "Pago" passou a vir marcado por padrão ao abrir a tela (pedido do usuário — é o status mais analisado no dia a dia); "Limpar" continua voltando pra "Todos".
- **Achado relacionado corrigido no mesmo ciclo:** `PaymentsScreen`/`list_payments` (Transações) só liberavam o filtro de empresa pra `role === "superadmin"`, não `admin` — inconsistente com a decisão desta sessão de equiparar os dois roles (`docs/ARQUITETURA.md` §1.2). Corrigido junto, já que é o mesmo padrão sendo implementado aqui.
- PR aberta e mesclada em `main`.

**Status: Done**
