---
id: ORD-032
status: Done
fase: 1
sprint: corrections
responsavel: Frontend
estimativa: 1 ponto
prioridade: P2
bugs: BUG-005
---

# ORD-032 — Admin: logout não revoga refresh token no servidor

## Explorer

**Como** owner ou admin,  
**quero** que ao clicar em "Sair" meu refresh token seja invalidado imediatamente no servidor,  
**para** que caso outro dispositivo tivesse acesso à sessão, ele seja deslogado também.

### Contexto e motivação

A sidebar do admin (`Sidebar.tsx`) faz logout sem enviar o `refresh_token` no body:

```typescript
// atual — body vazio, token nunca chega ao servidor
await api.post("/auth/logout");
```

O endpoint `POST /auth/logout` espera `{ refresh_token: string }` para adicionar o token à blacklist do Redis. Sem esse body, o logout é aceito (não retorna erro) mas o token permanece válido por até 7 dias. Qualquer um com o token pode continuar fazendo requests autenticados.

O balcão já faz isso corretamente (`QueueScreen.tsx` envia `{ refresh_token }`). O admin deve seguir o mesmo padrão.

### Personas afetadas
- **Owner**: sessão não é encerrada no servidor ao fazer logout
- **Admin Ordin**: idem

### Dependências
- `frontend/admin/src/components/Sidebar.tsx`
- `frontend/admin/src/store.ts` — tem `refreshToken` no estado persistido

---

## QA Explorer

```gherkin
Feature: Admin — logout revoga refresh token

  Background:
    Given o admin está logado como carlos@burgerhouse.com
    And o refresh token está armazenado no localStorage

  Scenario: Logout envia refresh token ao servidor
    When o admin clica em "Sair"
    Then a requisição POST /auth/logout contém body {"refresh_token": "<token>"}
    And a resposta é HTTP 200
    And o localStorage é limpo (accessToken e refreshToken removidos)
    And o admin é redirecionado para /login

  Scenario: Refresh token invalidado após logout
    Given o admin fez logout com sucesso
    When qualquer cliente tenta usar o refresh token antigo para renovar o access token
    Then a API responde HTTP 401 (token na blacklist Redis)

  Scenario: Logout funciona mesmo se API falhar
    Given a API de logout retorna 500
    When o admin clica em "Sair"
    Then o localStorage é limpo mesmo assim (best-effort)
    And o admin é redirecionado para /login
```

---

## Tech Explorer

### Fix — Frontend

**`frontend/admin/src/components/Sidebar.tsx`:**

```typescript
async function handleLogout() {
  const { refreshToken } = useStore.getState();
  try {
    await api.post("/auth/logout", { refresh_token: refreshToken });
  } catch { /* best-effort */ }
  logout();
}
```

### Impacto em outros serviços
- Nenhum. Mudança puramente no frontend do admin.

### Estimativa
1 ponto — 1 linha

### Riscos
- Nenhum. A mudança adiciona o token que já estava sendo enviado corretamente no balcão.

---

## Ready ✅

- [x] User story documentada
- [x] Causa raiz: body vazio em POST /auth/logout no Sidebar.tsx
- [x] Cenários Gherkin escritos (revogação + fallback)
- [x] Solução: 1 linha — adicionar `{ refresh_token: refreshToken }` ao body
- [x] Estimativa: 1 ponto
- [x] Sem bloqueadores
