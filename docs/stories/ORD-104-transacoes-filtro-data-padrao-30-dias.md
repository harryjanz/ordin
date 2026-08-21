---
id: ORD-104
status: Done
fase: 6
sprint: null
responsavel: Frontend
estimativa: 2 pontos
---

# ORD-104 — Transações: filtro de data padrão de 30 dias

## Descrição
Pedido do usuário (2026-08-21): a tela `/payments` (Transações) hoje carrega **sem nenhum filtro de data por padrão** — `GET /payments` sem `date_from`/`date_to` devolve o histórico inteiro da empresa (ou de todas, pra superadmin/admin). Isso funciona bem com pouco volume, mas fica pesado conforme a base de transações cresce. Proposta: a tela já vem preenchida com **últimos 30 dias** por padrão, sem exigir nenhuma ação do usuário — ele continua livre pra alargar o período editando os campos De/Até.

## Persona
**Owner/manager/superadmin/admin** — qualquer papel que acessa `/payments`.

## Explorer

### Achado técnico
`PaymentsScreen.tsx` já tem `dateFrom`/`dateTo` como `useState("")` e um `fetchTransactions()` disparado num `useEffect` toda vez que qualquer filtro muda. Não precisa de mudança de backend — `GET /payments` já aceita `date_from`/`date_to` (usado pelo Dashboard desde a ORD-101/102). É só inicializar o estado com os últimos 30 dias em vez de string vazia.

### Fluxo principal
1. Owner abre `/payments` → campos "De" e "Até" já vêm preenchidos com a data de 30 dias atrás e hoje, respectivamente, e a listagem carrega só esse recorte.
2. Owner pode editar "De"/"Até" livremente pra ver um período maior (ou menor) — comportamento de edição não muda.
3. Owner clica "Limpar" → todos os outros filtros (empresa, provider, status, ambiente) voltam ao padrão, **mas a data volta pros últimos 30 dias, não fica sem filtro** — decisão confirmada com o usuário, pra "Limpar" nunca reintroduzir sem querer o carregamento pesado do histórico inteiro.

### Fluxos alternativos / exceções
- Owner apaga manualmente o campo "De" (ou "Até") pra ver o histórico completo → continua possível, é uma ação explícita dele, não o padrão da tela.

### Critérios de aceite
- [ ] Ao abrir `/payments`, "De" e "Até" já vêm preenchidos (hoje - 30 dias / hoje)
- [ ] A listagem inicial já reflete esse recorte, sem esperar interação do usuário
- [ ] "Limpar" reseta empresa/provider/status/ambiente, mas mantém a data nos últimos 30 dias
- [ ] Usuário continua conseguindo apagar/editar as datas manualmente pra ver um período diferente (maior ou menor)

---

## QA Explorer

```gherkin
Feature: Filtro de data padrão de 30 dias em Transações

  Scenario: Tela abre com últimos 30 dias
    Quando o owner abre /payments
    Então o campo "De" mostra a data de 30 dias atrás
    E o campo "Até" mostra a data de hoje
    E a listagem já reflete esse período, sem ação adicional

  Scenario: Limpar filtros mantém o período de 30 dias
    Dado o owner mudou empresa, provider e status
    Quando clica em "Limpar"
    Então empresa, provider, status e ambiente voltam ao padrão
    E "De"/"Até" continuam nos últimos 30 dias (não ficam vazios)

  Scenario: Owner ainda consegue ver um período maior
    Dado a tela abriu com os últimos 30 dias
    Quando o owner apaga o campo "De"
    Então a listagem passa a não ter limite inferior de data (comportamento já existente, preservado)
```

---

## Tech Explorer

### Serviços impactados
- `frontend/admin/` — só `PaymentsScreen.tsx` (sem mudança de backend/schema/tipo)

### Mudança
```ts
// helpers já existentes no arquivo: toIsoDate/toDate (BR -> ISO)
function defaultDateBr(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getFullYear()}`;
}

const [dateFrom, setDateFrom] = useState(() => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return defaultDateBr(d);
});
const [dateTo, setDateTo] = useState(() => defaultDateBr(new Date()));
```
`clearFilters()` passa a resetar `dateFrom`/`dateTo` pro mesmo cálculo de 30 dias (função extraída, reaproveitada nos dois lugares), em vez de `""`.

### Riscos
- Nenhum — mudança de valor inicial de estado local, sem tocar em endpoint, schema ou lógica de fetch já existente. `hasFilter` passa a ser sempre `true` no carregamento inicial (já que a data não está mais vazia) — efeito colateral esperado e aceito: o botão "Limpar" fica habilitado desde o início, e o empty-state (se não houver transação nos últimos 30 dias) mostra a mensagem "para os filtros aplicados", o que é tecnicamente correto (o filtro de 30 dias está de fato aplicado).

### Estimativa
2 pontos — mudança de valor inicial de 2 `useState` + ajuste de `clearFilters()`.

---

## Ready

**Explorer:** [x] fluxo, persona e critério de aceite documentados · **QA Explorer:** [x] cenários cobrindo abertura padrão, "Limpar" mantendo os 30 dias, e escape hatch pra período maior · **Tech Explorer:** [x] mudança pontual em `PaymentsScreen.tsx`, sem risco, sem mudança de backend · **Aprovação final:** [x] aprovado no chat pelo usuário (2026-08-21) — comportamento do "Limpar" (mantém 30 dias) confirmado explicitamente antes de abrir a história

**Status: Ready** — pode começar a implementação.

---

## Downstream

- **Branch:** `feature/ord-104-transacoes-filtro-30-dias`, a partir de `main`.
- **`frontend/admin/src/screens/PaymentsScreen.tsx`:** `dateFrom`/`dateTo` inicializados via `defaultDateFromBr()`/`defaultDateToBr()` (30 dias atrás / hoje, formato BR) em vez de `""`; `clearFilters()` volta a chamar essas mesmas funções pras datas, em vez de zerá-las. Sem mudança de backend — só valor inicial de estado local, reaproveitando o endpoint `GET /payments` que já aceita `date_from`/`date_to`.
- `tsc --noEmit`: limpo. `vitest run`: **48 passed**, sem regressão.
- **Verificado ao vivo no Chrome:** `/payments` abriu com "De" 22/07/2026 e "Até" 21/08/2026 (30 dias corridos), listagem já bounded (634 transações, não o histórico inteiro). Testado "Limpar" com filtro de Status alterado pra "Aprovado": status voltou pra "Todos", datas permaneceram nos mesmos 22/07–21/08 (não zeraram). Sem erros no console.
- PR ainda não aberta — implementação completa, aguardando decisão do usuário sobre commit/PR/merge.
