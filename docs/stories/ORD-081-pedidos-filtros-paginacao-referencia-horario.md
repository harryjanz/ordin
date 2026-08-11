---
id: ORD-081
status: Tech Explorer
fase: 6
sprint: null
responsavel: Backend + Frontend
estimativa: 6 pontos
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
- [ ] Filtro de empresa visível só pra `superadmin`/`admin` (mesmo Dropdown + `listCompanies()` de Transações)
- [ ] Busca por referência (`order_ref`) — campo de texto livre, busca parcial (não precisa digitar o código inteiro)
- [ ] Filtro de status inclui **todos** os valores reais usados no banco: `pending`, `paid`, `completed`, `cancelled` (corrige a lacuna do Achado crítico)
- [ ] Filtro de período (De/Até) — mesmo `DateInput` com validação Até ≥ De e Até desabilitado até De ser preenchido (mesmo comportamento ajustado em Transações nesta sessão)
- [ ] Filtro de faixa de horário (De/Até) — **decisão a confirmar com o usuário:** filtra pela hora do dia (`HOUR`/`TIME` de `created_at`), independente da data — útil pra "todo pedido feito entre 11h e 14h, em qualquer dia do período" (ex.: análise de horário de pico). Ver Tech Explorer pra alternativa (faixa de data+hora combinada).
- [ ] Paginação real via componente `Pagination` do design system — mesmo padrão de Transações
- [ ] Tabela usa o componente `Table` compartilhado (`variant="compact"`) em vez de HTML cru — cabeçalho, altura de linha e hover idênticos a Transações
- [ ] Terminal mostrado pelo nome (`listTerminals`), não pelo ID cru
- [ ] Painel de tickets do pedido migra pro mecanismo `renderExpanded`/`expandedRowKey` do `Table` (chevron), substituindo o botão "Tickets"/"Fechar" atual
- [ ] Superadmin/admin sem filtro de empresa selecionado veem pedidos de **todas** as empresas (hoje só vê a própria, silenciosamente)
- [ ] Owner/manager continuam restritos à própria empresa mesmo manipulando a URL/request (backend valida)
- [ ] Nenhuma mudança de comportamento pra quem já usa a tela hoje sem filtro, exceto o teto de 100 virar paginado

### Wireframe / Mockup
Não desenhei protótipo novo — a recomendação é literalmente clonar a estrutura visual/CSS já aprovada de `PaymentsScreen.tsx`/`.module.scss` (filter-bar em grid, cards não se aplicam aqui — não foi pedido resumo por status pra Pedidos, só os filtros), trocando os campos pelos específicos de Pedidos. PM/UX: ver seção de sugestões abaixo antes de aprovar.

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

  Scenario: Filtro de faixa de horário
    Dado que existem pedidos em horários diferentes do dia
    Quando o usuário define uma faixa de horário (ex.: 11:00–14:00)
    Então só pedidos criados dentro dessa faixa de horário aparecem, em qualquer dia do período filtrado

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
    company_id: Optional[int] = None,   # só tem efeito pra superadmin/admin
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    hour_from: Optional[str] = None,    # "HH:MM"
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
    if date_from: q = q.where(Order.created_at >= date_from)
    if date_to: q = q.where(Order.created_at <= date_to)
    if hour_from: q = q.where(func.time(Order.created_at) >= hour_from)
    if hour_to: q = q.where(func.time(Order.created_at) <= hour_to)
    # total espelhando os mesmos filtros, mesmo padrão de list_payments/list_orders atual
```
Mesma convenção que `list_payments` já estabeleceu no ORD-077 (`superadmin`/`admin` com bypass condicional a `company_id` opcional, resto do role restrito). `order_ref` com `LIKE` — índice único hoje é exato (`unique=True`, `main.py:32`); busca parcial não usa esse índice, mas com 85 registros não é um problema de performance agora; vale um índice `FULLTEXT` ou `LIKE 'prefix%'` (que usa índice B-tree) se o volume crescer — não bloqueia a entrega.

**Faixa de horário — duas opções, precisa decisão do usuário antes de Ready:**
1. **Hora do dia, independente da data** (proposta acima, `func.time(created_at)`) — responde "pedidos feitos entre 11h–14h, em qualquer dia do período". Mais flexível pra análise de turno/pico, mas semântica menos óbvia pra quem não conhece a intenção.
2. **Faixa de data+hora combinada** (um único par De/Até com data e hora juntos, tipo `datetime-local`) — mais simples de implementar e entender (é só um range de timestamp), mas perde a capacidade de "todo dia, mesmo horário" sem repetir o filtro dia a dia.

Não existe componente de hora no design system (só `DateInput`, sem componente de hora — confirmado, busquei em `vendor/design-system/dist/components/`). Direção proposta: `InputBase` com `type="time"` (passa por `InputHTMLAttributes<HTMLInputElement>`, herda o input nativo do browser) — reaproveita o chrome visual do DS (borda, label, foco) sem precisar de componente novo.

**Frontend:** clona `PaymentsScreen.tsx` quase literalmente — mesma filter-bar em grid, mesmo uso de `Table` `variant="compact"` com `renderExpanded` pro painel de tickets (substituindo o `Fragment`/`<tr>` manual atual), mesmo `Pagination` do design system. `api/orders.ts` novo espelhando `api/payments.ts` (`listOrders`, `buildOrderListQuery`).

### Riscos
- **Faixa de horário é a decisão de escopo mais sensível da história** — as duas opções acima têm UX bem diferente; recomendo confirmar com o usuário antes de sair do Tech Explorer (ver critério de aceite marcado como decisão pendente).
- Reaproveitar `Table`/`Pagination`/padrão de filtro já validados em Transações reduz bastante o risco de implementação — não é um componente novo, é reuso do que a Fase 6 já testou em produção.
- `order_ref` com `LIKE '%...%'` não usa índice — aceitável no volume atual, registrar como dívida se crescer (mesmo espírito da nota de índice do ORD-077).
- Migrar o painel de tickets pro `renderExpanded` do `Table` muda a marcação HTML mas não o comportamento visível — baixo risco, já é um padrão testado (Transações, ORD-080).

### Estimativa
6 pontos — mais filtros que o ORD-077 (5) por causa da busca por referência e da faixa de horário (campo sem componente pronto no DS), mas boa parte do trabalho é reuso direto de padrão já construído e testado (`Table` compact, `Pagination`, filter-bar, `listTerminals`), o que reduz o risco de UI mesmo com mais campos.

---

## Sugestões de PM/UX pra revisão do usuário

Como pedido, aqui vão pontos que acho que valem discussão antes de aprovar — não implementei nenhum ainda:

1. **Faixa de horário — confirmar a semântica** (ver Tech Explorer): hora-do-dia recorrente vs. timestamp único combinado. Se a intenção é "analisar horário de pico", a primeira opção é mais poderosa; se é só "refinar mais o período", a segunda é mais simples e menos surpreendente.
2. **Resumo por status, como Transações tem (ORD-078)?** Não foi pedido, mas dado que "mesmo formato" foi explicitamente citado — um card por status (pendente/pago/concluído/cancelado) daria o mesmo tipo de visão rápida que os cards de Transações dão hoje. Sugestão de melhoria, não critério de aceite — incluo só se o usuário confirmar que quer.
3. **`cpf` do cliente existe no modelo (`Order.cpf`) e não é mostrado em lugar nenhum hoje** — nem na lista, nem no detalhe expandido. Pode ser útil no painel expandido (como Transações mostra ambiente/terminal/referência do provider), mas é dado de cliente (CPF) — vale considerar se deve aparecer mascarado/parcial por padrão, mesmo espírito de cuidado que o projeto já tem com PII em outros lugares (contatos criptografados no company-service).
4. **Terminal, ao contrário de Transações, não tem filtro dedicado** — Transações também não filtra por terminal, então não é inconsistência, mas com o nome do terminal exposto (achado 4), um filtro por terminal poderia ser natural de adicionar junto, já que os dados já estão sendo buscados.

---

## Ready

**Explorer:** [x] fluxo, personas e critérios de aceite definidos, achado crítico do status `paid` documentado · **QA Explorer:** [x] cenários Gherkin cobrindo multi-tenant, busca, todos os filtros novos, paginação e expansão · **Tech Explorer:** [x] diagnóstico medido ao vivo (query direta no MySQL), direção técnica com proposta de assinatura de endpoint, duas alternativas pra faixa de horário, riscos e estimativa · **Aprovação final:** [ ] pendente — precisa decisão do usuário sobre a semântica da faixa de horário (Tech Explorer) e sobre as 4 sugestões de PM/UX acima antes de virar Ready

**Status: Tech Explorer** — não iniciar implementação até aprovação explícita.
