---
id: ORD-034
status: Done
fase: 1
sprint: corrections
responsavel: Frontend
estimativa: 2 pontos
prioridade: P2
bugs: BUG-007, BUG-008
---

# ORD-034 — Admin: React key warning em OrdersScreen e erros silenciosos

## Explorer

**Como** desenvolvedor mantendo o painel admin,  
**quero** que erros de API sejam visíveis ao usuário e que warnings de console sejam corrigidos,  
**para** que o sistema seja mais confiável, debugável e que o operador saiba quando algo falhou.

### Contexto e motivação

Dois problemas de qualidade no admin panel (:3001):

**BUG-007 — React key warning em `OrdersScreen`:**  
O `.map()` de pedidos usa `<>` fragment sem `key`. Cada pedido gera dois `<tr>` (a linha do pedido + a linha de expansão de tickets) dentro de um fragment sem key. O React lança warning no console: "Each child in a list should have a unique key prop". Em React 19+, esse warning pode evoluir para comportamento incorreto de reconciliação.

**BUG-008 — Erros silenciosos na tela Empresa:**  
Quando `GET /companies/{id}/users` ou `GET /companies/{id}/terminals` falham (503, 404, ou o 500 do BUG-001/002), as funções `loadUsers()` e `loadTerminals()` não têm try/catch — a exceção é engolida pelo runtime e a lista fica vazia sem nenhum feedback visual. O usuário não sabe se está sem permissão, se o serviço caiu, ou se simplesmente não há dados.

### Personas afetadas
- **Desenvolvedor**: warns no console dificultam debugging
- **Owner/Admin**: tela Empresa mostra lista vazia sem explicação quando a API falha

### Dependências
- `frontend/admin/src/screens/OrdersScreen.tsx`
- `frontend/admin/src/screens/CompanyScreen.tsx`

---

## QA Explorer

```gherkin
Feature: Admin — React key corrigido e erros de API visíveis

  # BUG-007
  Scenario: OrdersScreen sem React key warnings
    Given o admin está na tela Pedidos com 3+ pedidos listados
    When o DevTools do browser está aberto na aba Console
    Then NÃO existe nenhum warning "Each child in a list should have a unique key prop"

  Scenario: Expandir e colapsar pedido sem erros de reconciliação
    Given o admin expande o pedido P-ABC e vê os tickets
    When o admin expande um segundo pedido P-DEF
    Then ambos os pedidos mantêm o estado correto (P-ABC e P-DEF expandidos independentemente)

  # BUG-008
  Scenario: Tela Empresa exibe mensagem de erro quando API de usuários falha
    Given o backend de company-service está indisponível (ou retorna 500)
    When o admin navega para Empresa → aba "Usuários"
    Then a interface exibe uma mensagem de erro visível (não tela branca)
    And a mensagem indica que houve falha ao carregar os dados

  Scenario: Tela Empresa exibe mensagem de erro quando API de terminais falha
    Given o backend de company-service está indisponível (ou retorna 500)
    When o admin navega para Empresa → aba "Terminais"
    Then a interface exibe uma mensagem de erro visível

  Scenario: Tela Empresa se recupera após erro — retry manual
    Given a tela Empresa exibiu mensagem de erro
    When o backend se recupera e o admin clica em "Tentar novamente"
    Then os dados carregam corretamente

  Scenario: Regressão — listagem normal ainda funciona
    Given o backend está saudável
    When o admin navega para Empresa → Terminais e depois Usuários
    Then ambas as listas carregam normalmente sem mensagem de erro
```

---

## Tech Explorer

### Fix 1 — `OrdersScreen.tsx` — React key

Substituir `<>` por `<React.Fragment key={...}>`:

```tsx
import React from "react";

// antes — linha ~118
{orders.map((o) => (
  <>
    <tr key={o.order_ref}>

// depois
{orders.map((o) => (
  <React.Fragment key={o.order_ref}>
    <tr>
      {/* remover key do <tr> interno, já está no Fragment */}
    </tr>
    {expanded === o.order_ref && (
      <tr>
        ...
      </tr>
    )}
  </React.Fragment>
))}
```

### Fix 2 — `CompanyScreen.tsx` — try/catch com feedback de erro

Adicionar estado de erro e mensagem para cada tab:

```typescript
const [errUsers, setErrUsers] = useState<string | null>(null);
const [errTerminals, setErrTerminals] = useState<string | null>(null);

async function loadUsers() {
  if (!companyId) return;
  setErrUsers(null);
  try {
    const r = await api.get(`/companies/${companyId}/users`);
    setUsers(r.data.users ?? r.data);
  } catch {
    setErrUsers("Não foi possível carregar os usuários. Tente novamente.");
  }
}

async function loadTerminals() {
  if (!companyId) return;
  setErrTerminals(null);
  try {
    const r = await api.get(`/companies/${companyId}/terminals`);
    setTerminals(r.data.terminals ?? r.data);
  } catch {
    setErrTerminals("Não foi possível carregar os terminais. Tente novamente.");
  }
}
```

Render de erro e botão de retry:

```tsx
{tab === "terminals" && (
  <>
    {errTerminals && (
      <div style={{ color: "#ff4d6d", fontSize: 13, marginBottom: 16 }}>
        {errTerminals}
        <button
          onClick={loadTerminals}
          style={{ marginLeft: 12, ...S.addBtn }}
        >Tentar novamente</button>
      </div>
    )}
    {/* ... lista de terminais ... */}
  </>
)}

{tab === "users" && (
  <>
    {errUsers && (
      <div style={{ color: "#ff4d6d", fontSize: 13, marginBottom: 16 }}>
        {errUsers}
        <button
          onClick={loadUsers}
          style={{ marginLeft: 12, ...S.addBtn }}
        >Tentar novamente</button>
      </div>
    )}
    {/* ... lista de usuários ... */}
  </>
)}
```

### Impacto em outros serviços
- Nenhum. Mudanças puramente no frontend admin.

### Estimativa
2 pontos — OrdersScreen (~5 linhas) + CompanyScreen (~30 linhas)

### Riscos
- Nenhum.

---

## Ready ✅

- [x] User story documentada
- [x] BUG-007: `<>` sem key em OrdersScreen → `<React.Fragment key>`
- [x] BUG-008: sem try/catch em CompanyScreen → estado `errUsers`/`errTerminals` + mensagem + retry
- [x] Cenários Gherkin escritos para ambos os bugs
- [x] Estimativa: 2 pontos
- [x] Sem bloqueadores
