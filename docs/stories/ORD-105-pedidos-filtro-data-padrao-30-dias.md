---
id: ORD-105
status: Done
fase: 6
sprint: null
responsavel: Frontend
estimativa: 2 pontos
---

# ORD-105 — Pedidos: filtro de data padrão de 30 dias

## Descrição
Mesmo comportamento da ORD-104 (Transações), agora pra `/orders` (Pedidos). `OrdersScreen.tsx` tem o mesmo padrão de `dateFrom`/`dateTo` vazios por padrão — `GET /orders` sem `date_from`/`date_to` devolve o histórico inteiro. A tela passa a abrir já filtrada pros últimos 30 dias.

## Persona
**Owner/manager/superadmin/admin** — qualquer papel que acessa `/orders`.

## Explorer

### Achado técnico
Mesma estrutura de `PaymentsScreen.tsx`: `dateFrom`/`dateTo` como `useState("")`, `toIsoDate`/`toDate` locais (comentário no próprio arquivo já diz "Mesmo helper de PaymentsScreen"), `fetchOrders()` disparado por `useEffect` a cada mudança de filtro, `clearFilters()` centralizando o reset. Sem mudança de backend.

**Diferença notável a preservar:** `status` já tem um default não-vazio hoje (`"paid"`, "é o status mais analisado no dia a dia") e `clearFilters()` **intencionalmente** volta `status` pra `""` (todos) — comentário existente no código confirma isso é proposital. Essa história mexe só em `dateFrom`/`dateTo`; o comportamento de `status` (default `"paid"`, `Limpar` reseta pra "todos") não muda.

### Fluxo principal
1. Owner abre `/orders` → "De"/"Até" já vêm com os últimos 30 dias; `status` continua com o default "Pago" que já existia.
2. Owner clica "Limpar" → `status` volta pra "todos" (comportamento já existente, preservado), `dateFrom`/`dateTo` voltam pros últimos 30 dias (novo, mesma regra da ORD-104) — não ficam vazios.
3. Owner segue livre pra editar/apagar as datas manualmente.

### Critérios de aceite
- [ ] Ao abrir `/orders`, "De" e "Até" já vêm preenchidos (hoje - 30 dias / hoje)
- [ ] "Limpar" mantém a data nos últimos 30 dias (não zera), mas continua resetando `status` pra "todos" como já fazia
- [ ] Usuário continua conseguindo editar/apagar as datas manualmente

---

## QA Explorer

```gherkin
Feature: Filtro de data padrão de 30 dias em Pedidos

  Scenario: Tela abre com últimos 30 dias
    Quando o owner abre /orders
    Então "De" mostra a data de 30 dias atrás e "Até" mostra hoje
    E a listagem já reflete esse período

  Scenario: Limpar mantém a data mas reseta status
    Dado o owner mudou o status pra "Concluído"
    Quando clica em "Limpar"
    Então status volta pra "Todos" (comportamento já existente)
    E "De"/"Até" continuam nos últimos 30 dias (não ficam vazios)
```

---

## Tech Explorer

### Serviços impactados
- `frontend/admin/` — só `OrdersScreen.tsx`

### Mudança
Mesmo padrão da ORD-104: `defaultDateFromBr()`/`defaultDateToBr()` (extraídas/duplicadas localmente, já que `OrdersScreen.tsx` e `PaymentsScreen.tsx` não compartilham módulo de helpers de data hoje) usadas como inicializador de `dateFrom`/`dateTo` e dentro de `clearFilters()`.

### Riscos
Nenhum — mesma mudança de baixo risco já validada na ORD-104, agora replicada. `handleDateFromChange` já trata `!value` limpando a faixa de horário (`hourFrom`/`hourTo`) — não afetado, já que a mudança é só no valor inicial/reset, não na lógica de edição.

### Estimativa
2 pontos.

---

## Ready

**Explorer:** [x] · **QA Explorer:** [x] · **Tech Explorer:** [x] — mesma mudança da ORD-104, já validada, replicada num segundo arquivo · **Aprovação final:** [x] aprovado no chat pelo usuário (2026-08-21), pedido explícito de replicar o comportamento da ORD-104

**Status: Ready** — pode começar a implementação.

---

## Downstream

- **Branch:** `feature/ord-105-pedidos-filtro-30-dias`, a partir de `main`.
- **`frontend/admin/src/screens/OrdersScreen.tsx`:** `dateFrom`/`dateTo` inicializados via `defaultDateFromBr()`/`defaultDateToBr()` (mesmas funções da ORD-104, duplicadas localmente já que as duas telas não compartilham módulo de helper de data); `clearFilters()` volta a chamar essas funções pras datas, preservando o reset de `status` pra `""` (comportamento já existente, documentado no próprio código).
- `tsc --noEmit`: limpo. `vitest run`: **48 passed**, sem regressão.
- **Verificado ao vivo no Chrome:** `/orders` abriu com "De" 22/07/2026, "Até" 21/08/2026, `status` no default "Pago" (2 pedidos). Cliquei "Limpar": `status` voltou pra "Todos" (7 pedidos), datas permaneceram 22/07–21/08 (não zeraram). Sem erros no console.
- PR ainda não aberta — implementação completa, aguardando decisão do usuário sobre commit/PR/merge.
