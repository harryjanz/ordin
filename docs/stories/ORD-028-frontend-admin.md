---
id: ORD-028
status: Done
fase: 1
sprint: 4
responsavel: Frontend
estimativa: 8 pontos
---

# ORD-028 — Frontend admin panel completo conectado à API real

## Explorer

**Como** owner ou manager da empresa,  
**quero** um painel web para configurar o catálogo, gerenciar usuários e terminais e monitorar pedidos e transações,  
**para** que eu não precise de acesso direto ao banco de dados para operar o negócio.

### Contexto e motivação
O admin panel é o back-office do piloto. Sem ele, qualquer mudança de cardápio, usuário ou terminal exige SQL direto. `frontend/admin-panel-v3.tsx` é um stub (24 linhas). O super admin da plataforma também usa o painel para gerenciar múltiplas empresas.

### Personas

| Persona | Role | Pode ver |
|---|---|---|
| Super admin da plataforma | `admin` | Todas as empresas |
| Owner da empresa | `owner` | Somente sua empresa |
| Manager | `manager` | Catálogo + pedidos da sua empresa |
| Caixa | `cashier` | Somente dashboard (leitura) |

### Módulos

1. **Autenticação** — login email+senha, refresh automático, logout com revogação
2. **Dashboard** — pedidos do dia, total faturado, status dos terminais
3. **Catálogo** — CRUD de categorias e produtos (owner/manager)
4. **Empresa** — edição de dados da empresa, CRUD de terminais, CRUD de usuários (owner)
5. **Pedidos** — listagem filtrada, detalhe com tickets
6. **Transações TEF** — listagem de pagamentos com status
7. **Configurações** — regeneração de PIN da empresa

### Dependências
- ORD-023 (CRUD catálogo) — **feito**
- ORD-024 (CRUD empresa/terminal/usuário) — **feito**
- ORD-022 (refresh token) — **feito**
- ORD-027 parcial — endpoint `GET /orders` a ser criado (compartilhado com balcão)

---

## QA Explorer

```gherkin
Feature: Admin Panel — autenticação e controle de acesso

  Scenario: Login com email e senha válidos
    Given o usuário acessa o admin panel
    When informa email "carlos@burgerhouse.com" e senha "burger123"
    And clica em Entrar
    Then o sistema faz POST /auth/login
    And é redirecionado para o Dashboard da Burger House
    And o nome "Carlos" aparece no header

  Scenario: Credenciais inválidas
    When o usuário informa senha errada
    Then o sistema retorna 401
    And exibe "E-mail ou senha incorretos" sem revelar qual campo está errado

  Scenario: Controle de acesso — manager não vê gestão de empresa
    Given o usuário logado tem role "manager"
    Then o menu lateral não exibe "Empresa" nem "Terminais" nem "Usuários"

  Scenario: Controle de acesso — super admin vê todas as empresas
    Given o usuário logado é "admin@foodkiosk.com"
    Then o dashboard exibe seletor de empresa
    And ao selecionar "Pasta & Co" carrega os dados dessa empresa

  Scenario: Refresh automático
    Given o access token expirou
    When o usuário navega para outra tela
    Then o interceptor faz POST /auth/refresh automaticamente
    And a tela carrega normalmente sem pedir login novamente

  Scenario: Logout com revogação
    When o usuário clica em Sair
    Then o sistema faz POST /auth/logout
    And os tokens são removidos da memória
    And o usuário é redirecionado para a tela de login

Feature: Catálogo — CRUD de categorias e produtos

  Scenario: Criar categoria
    Given o owner está na tela de Catálogo
    When cria a categoria "Bebidas"
    Then o sistema faz POST /catalog/categories com { "name": "Bebidas" }
    And a categoria aparece na lista imediatamente

  Scenario: Criar produto com imagem
    Given a categoria "Bebidas" existe
    When o owner cria produto "Suco de Laranja" com preço 8,00 e imagem_url preenchida
    Then o sistema faz POST /catalog/products
    And o produto aparece no catálogo do totem na próxima sessão

  Scenario: Desativar produto (soft delete)
    When o owner clica em Desativar no produto "X-Burguer"
    Then o sistema faz DELETE /catalog/products/{id}
    And o produto some do catálogo mas os históricos de pedido são preservados

  Scenario: Toggle ativo/inativo de categoria
    When o owner desativa a categoria "Sobremesas"
    Then todos os produtos da categoria deixam de aparecer no totem

Feature: Pedidos e transações

  Scenario: Listagem de pedidos com filtro de status
    Given o manager acessa Pedidos
    When filtra por status "pending"
    Then o sistema faz GET /orders?status=pending
    And exibe apenas os pedidos pendentes

  Scenario: Detalhe do pedido com tickets
    When o manager clica em "ORD-ABC1"
    Then exibe os tickets do pedido com progresso de coleta (GET /orders/{ref}/tickets)
    And mostra quem coletou cada ticket e quando

  Scenario: Listagem de transações TEF
    When o manager acessa Transações
    Then o sistema faz GET /payments/transactions (ou endpoint equivalente)
    And exibe status (approved/refused/cancelled), NSU, autorização e valor

Feature: Empresa — terminais e usuários

  Scenario: Criar terminal
    Given o owner acessa Terminais
    When cria "Terminal 4" com rótulo "Caixa 4"
    Then o sistema faz POST /companies/{id}/terminals
    And o terminal aparece na lista com seu ID (que será configurado no próximo totem)

  Scenario: Criar usuário cashier
    When o owner cria usuário "joao@burgerhouse.com" com role "cashier"
    Then o sistema faz POST /companies/{id}/users
    And o usuário pode fazer login no app de balcão

  Scenario: Regenerar PIN da empresa
    When o owner clica em Regenerar PIN
    Then exibe modal de confirmação
    And após confirmar faz POST /companies/{id}/regenerate-pin
    And exibe o novo PIN para o owner anotar (o PIN só aparece uma vez)
```

---

## Tech Explorer

### Decisão de estrutura

```
frontend/
  admin/
    index.html
    vite.config.ts
    tsconfig.json
    package.json
    src/
      main.tsx
      App.tsx               # roteamento: /login | /dashboard | /catalog | /orders | ...
      api.ts                # axios instance + interceptors (refresh)
      store.ts              # Zustand: auth, company context
      router.tsx            # React Router v6 (único caso com roteamento multi-página)
      screens/
        LoginScreen.tsx
        DashboardScreen.tsx
        CatalogScreen.tsx   # categorias + produtos, CRUD inline
        OrdersScreen.tsx    # listagem + detalhe
        CompanyScreen.tsx   # terminais + usuários
        SettingsScreen.tsx  # PIN, dados cadastrais
      components/
        Sidebar.tsx
        Table.tsx
        Modal.tsx
        FormField.tsx
      types.ts
```

Deps: `vite`, `react`, `react-dom`, `react-router-dom`, `typescript`, `axios`, `zustand`  
Sem biblioteca de UI externa — CSS-in-JS inline. Layout responsivo (desktop e tablet).

### Contratos de API

| Módulo | Método | Endpoint | Auth |
|---|---|---|---|
| Login | POST | `/auth/login` | nenhuma |
| Refresh | POST | `/auth/refresh` | nenhuma (refresh_token no body) |
| Logout | POST | `/auth/logout` | Bearer JWT |
| Dashboard — pedidos | GET | `/orders?status=all&limit=100` | Bearer JWT |
| Dashboard — transações | GET | `/payments/transactions` | Bearer JWT |
| Catálogo — categorias | GET/POST/PUT/DELETE | `/catalog/categories[/{id}]` | Bearer JWT |
| Catálogo — produtos | GET/POST/PUT/DELETE | `/catalog/products[/{id}]` | Bearer JWT |
| Terminais | GET/POST/PUT/DELETE | `/companies/{id}/terminals[/{tid}]` | Bearer JWT |
| Usuários | GET/POST/PUT/DELETE | `/companies/{id}/users[/{uid}]` | Bearer JWT |
| Pedidos | GET | `/orders?status=X&limit=50` | Bearer JWT |
| Pedido detalhe | GET | `/orders/{ref}/tickets` | Bearer JWT |
| Regenerar PIN | POST | `/companies/{id}/regenerate-pin` | Bearer JWT |

### Gaps a verificar

- **`GET /payments/transactions`**: verificar se endpoint de listagem de transações existe no payment-service. Se não, documentar como gap (fora do escopo desta história — dashboard mostra apenas contagem).
- **`GET /orders` com filtros adicionais**: mesma adição planejada para ORD-027 — usar o mesmo endpoint.

### Controle de acesso no frontend

| Seção | admin | owner | manager | cashier |
|---|---|---|---|---|
| Dashboard | ✅ (todas empresas) | ✅ | ✅ | ✅ (read) |
| Catálogo CRUD | ✅ | ✅ | ✅ | ❌ |
| Empresa/Terminais/Usuários | ✅ | ✅ | ❌ | ❌ |
| Pedidos | ✅ | ✅ | ✅ | ❌ |
| Transações | ✅ | ✅ | ✅ | ❌ |
| Configurações (PIN) | ✅ | ✅ | ❌ | ❌ |

Role extraída do JWT decodificado (`atob(token.split('.')[1])`). Seções não autorizadas são ocultadas do menu — sem rotas acessíveis por URL direto para roles inferiores (redirect para dashboard).

### Gestão de refresh token

Mesma estratégia de ORD-027: interceptor axios no response, refresh automático ao receber 401, logout forçado se refresh falhar.

Diferença: admin usa `localStorage` para persistir tokens entre sessões (UX desktop — recarregar a página não deve deslogar). Totem e balcão usam apenas memória.

### Credenciais demo (seed ORD-020)

```
admin@foodkiosk.com / admin123  → role: admin (super admin)
carlos@burgerhouse.com / burger123 → role: owner (Burger House)
maria@pastaeco.com / pasta123 → role: owner (Pasta & Co)
```

### Riscos técnicos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| `GET /payments/transactions` inexistente | Média | Checar payment-service antes de implementar; se ausente, exibir "em breve" |
| Super admin precisa de context switch entre empresas | Média | Adicionar seletor de empresa no store; all endpoints passam company_id via JWT |
| React Router conflito com Nginx em produção | Baixa | `nginx.conf` já tem `try_files $uri /index.html` |

### Estimativa
8 pontos — mais módulos e telas que totem/balcão; o roteamento multi-página e CRUD inline adicionam complexidade.
