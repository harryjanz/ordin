---
id: ORD-106
status: Done
fase: 6
sprint: null
responsavel: Frontend
estimativa: 1 ponto
tipo: bugfix
---

# ORD-106 — Fix: "Limpar" filtros zerava a empresa de owner/manager/cashier

## Descrição
Bug real, achado ao vivo (2026-08-21) pelo usuário: voltando pro Dashboard logado como empresa (owner), a tela mostrava "Nenhuma empresa associada à sua conta." — mesmo com a conta corretamente vinculada a uma empresa.

**Causa raiz:** `clearFilters()` em `PaymentsScreen.tsx` (Transações) e `OrdersScreen.tsx` (Pedidos) chamava `setSelectedCompany(null)` **incondicionalmente**, ao clicar em "Limpar". Pra superadmin/admin isso é correto — essas telas têm um dropdown "Todas as empresas" que permite escolher outra na hora. Mas pra owner/manager/cashier, **não existe esse dropdown** — `selectedCompanyId` só é definido uma vez, no `login()`, a partir do `company` do JWT (`store.ts`). `updateTokens()` (usado no refresh silencioso de token) não recalcula esse valor. Resultado: uma vez zerado, o usuário fica sem empresa até fazer logout/login de novo — nenhuma tela consegue mostrar dado nenhum (Dashboard, Pedidos, Transações, Empresa, Dispositivos), porque todas dependem de `selectedCompanyId`.

Reproduzido ao vivo: confirmado via `localStorage` que a sessão do próprio usuário (`role: "owner"`, `companyId: 1`) estava com `selectedCompanyId: null` — muito provavelmente por eu mesmo ter clicado "Limpar" em Transações/Pedidos durante a verificação das ORD-104/105 minutos antes, usando a mesma conta.

## Fix
`isPlatformAdmin` (já calculado em ambas as telas) passa a condicionar a chamada:
```ts
if (isPlatformAdmin) setSelectedCompany(null);
```
Pra superadmin/admin, comportamento idêntico a antes ("Limpar" volta pra "Todas as empresas"). Pra owner/manager/cashier, `selectedCompanyId` nunca mais é tocado por esse botão — não tem UI pra eles reescolherem, então não faz sentido zerá-lo.

**Fora do escopo, verificado e não precisa de fix:** `CompanyListScreen.tsx` (`/companies`) também tem uma chamada incondicional de `setSelectedCompany(null)`, mas essa rota é exclusiva de superadmin/admin (bloqueada por `ProtectedRoute` — não está na lista de rotas permitidas de owner/manager/cashier em `App.tsx`), então nunca é alcançada por um usuário sem o dropdown. `ActiveCompanyBadge.tsx` já tinha o guard correto (`if (!isPlatformAdmin ...) return null`).

## Recuperação imediata (sessões já corrompidas)
Logout + login restaura `selectedCompanyId` a partir do JWT (`login()` recalcula do zero). Não precisa de nenhuma migração de dado — o valor é só um estado de sessão no `localStorage`.

## Downstream

- **Branch:** `fix/ord-106-limpar-filtro-empresa-nao-admin`, a partir de `main`.
- **`frontend/admin/src/screens/PaymentsScreen.tsx`:** `clearFilters()` — `setSelectedCompany(null)` só roda se `isPlatformAdmin`.
- **`frontend/admin/src/screens/OrdersScreen.tsx`:** mesmo fix.
- `tsc --noEmit`: limpo. `vitest run`: **48 passed**, sem regressão.
- **Verificado ao vivo no Chrome:** confirmei a corrupção via `localStorage.getItem('ordin-admin-auth')` (`selectedCompanyId: null` com `role: "owner"`, `companyId: 1`); logout/login restaurou (`selectedCompanyId: 1`); depois do fix, cliquei "Limpar" em `/payments` e em `/orders` logado como owner — `selectedCompanyId` permaneceu `1` nos dois casos, Dashboard continuou funcionando normalmente. Sem erros no console.
- PR ainda não aberta — implementação completa, aguardando decisão do usuário sobre commit/PR/merge.
