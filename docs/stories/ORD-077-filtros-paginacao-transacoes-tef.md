---
id: ORD-077
status: Ready
fase: 6
sprint: null
responsavel: Backend + Frontend
estimativa: 5 pontos
---

# ORD-077 — Transações TEF: filtros (empresa, período, provider, status) + paginação e correção de escopo multi-tenant pro superadmin

## Descrição
Análise de PM pedida pelo usuário sobre a tela `/payments` ("Transações TEF") do admin — hoje ela só lista as últimas transações sem nenhum filtro, e não dá pra localizar uma transação específica sem rolar a lista inteira. Esta é a primeira de 4 histórias produzidas na mesma sessão de análise ([[ORD-078]], [[ORD-079]], [[ORD-080]]) — esta é a fundação: sem filtro e paginação de verdade no backend, as outras três (resumo por status, cancelamento, detalhe) ficam limitadas a operar só sobre a página atual carregada.

**Achado crítico não pedido pelo usuário, mas descoberto na investigação:** o endpoint `GET /payments` (`services/payment/main.py:386-412`) filtra **sempre** por `Transaction.company_id == current_user.company_id` — o `company_id` vem embutido no JWT, sem nenhum desvio pra `role == "superadmin"`. Confirmei ao vivo: logando como `admin@ordin.app` (superadmin, seed `services/company/migrations/versions/20260611_0901_seed_initial.py:43-44`), o JWT carrega `company: 1` (mesma empresa do owner Burger House) e `GET /payments` retorna as mesmas 92 transações que o owner vê — **não existe hoje nenhuma forma de o superadmin ver transações de mais de uma empresa nesta tela**, mesmo sendo o único role que enxerga a lista de clientes (`Sidebar.tsx` MENU, `roles: ["superadmin"]` pra `/companies`). Isso não é regressão de nada recente — é assim desde que o endpoint foi escrito; só nunca apareceu porque no seed de dev só a Burger House (`company_id=1`) tem transações (`SELECT company_id, status, COUNT(*) FROM transactions GROUP BY company_id, status` — só retorna linhas de `company_id=1`).

## Persona
**Superadmin** (dono da plataforma, gerencia várias empresas clientes) é quem mais sente falta do filtro de empresa — hoje não tem como. **Admin/owner/manager** de uma empresa específica continuam vendo só as próprias transações (correto, não muda), mas sentem falta de filtrar por período e status pra investigar uma transação específica ou fechar caixa de um dia.

## Contexto

### Achado 1 — zero filtros, backend e frontend
`PaymentsScreen.tsx` (`frontend/admin/src/screens/PaymentsScreen.tsx:19-24`) chama `api.get("/payments")` sem nenhum query param. O backend (`list_payments`, `main.py:386-412`) não aceita nenhum — nem `status`, nem data, nem `provider`. Comparando com o padrão já estabelecido em outras telas do mesmo admin:
- `order-service` (`services/order/main.py:325-343`) já aceita `status`, `skip`, `limit` e devolve `total` — é o padrão que este projeto já usa pra listagem paginada por empresa.
- `CompanyListScreen.tsx` (só superadmin) já tem uma filter-bar completa e madura: busca por texto, filtro de status via `Dropdown`, botão "Limpar", paginação custom com "Anterior/Próxima" (`CompanyListScreen.tsx:124-154`, `192-199`) — é o padrão visual e de interação a reaproveitar aqui, não inventar um novo.

### Achado 2 — hard cap de 100 sem paginação
`list_payments` faz `.limit(100)` fixo (`main.py:394`), sem `skip` nem contagem total. Hoje a Burger House já tem **92 transações** (verificado ao vivo via `docker compose exec mysql`) — a poucas dezenas de bater o teto. Quando isso acontecer, a tela simplesmente para de mostrar transações mais antigas, sem nenhum aviso — silenciosamente.

### Achado 3 — bypass de superadmin ausente (crítico, ver Descrição)
Diferente do `company-service`, que já tem o padrão estabelecido (`_require_superadmin()` e checagens como `if current_user.role == "superadmin": ... else: ... company_id == current_user.company_id`, ex. `services/company/main.py:836,901,924`), o `payment-service` **nunca implementou esse padrão** — não é uma regressão a corrigir, é uma capacidade que nunca existiu neste serviço e que esta história introduz pela primeira vez aqui (o `order-service` tem a mesma lacuna, `services/order/main.py:333`, mas está fora do escopo desta história — só citado porque é o mesmo padrão a olhar depois).

### Achado 4 (crítico, muda o escopo) — superadmin nem chega em `/payments` hoje
Ao desenhar o filtro de empresa pro superadmin, percebi que o problema é mais fundo que "sem bypass no backend": **o superadmin não tem acesso nenhum à tela `/payments` hoje**. `App.tsx:19-25` (`ROLE_ROUTES`) só dá `/payments` pra `admin`/`owner`/`manager` — a entrada de `superadmin` é `["/dashboard", "/companies", "/companies/new", "/companies/:id/contract"]`, sem `/payments`. `ProtectedRoute` (`App.tsx:27-32`) redireciona pra `/dashboard` se o role não tiver a rota liberada. O mesmo vale pro menu: `Sidebar.tsx:15`, o item "Transações" só lista `roles: ["admin", "owner", "manager"]`.

**Isso é uma decisão de arquitetura existente, não um bug isolado:** hoje o superadmin só gerencia o cadastro de empresas clientes (`/companies`) — nunca opera dentro de uma empresa (sem acesso a catálogo, pedidos, pagamentos ou configurações). Dar acesso a `/payments` pro superadmin é uma **mudança de escopo de RBAC**, não só destravar uma tela — por isso viro um critério de aceite explícito abaixo, não uma correção silenciosa dentro do "corrigir o filtro".

### Por que não apareceu antes
Como só a Burger House tem transações no ambiente de dev, e o superadmin nem consegue abrir `/payments` hoje, ninguém teve como perceber os dois problemas ao mesmo tempo — o filtro de empresa pro superadmin, tal como pedido, depende de resolver o Achado 4 primeiro.

---

## Explorer

### História
Como **superadmin**, quero filtrar as transações TEF por empresa, período, provider e status, para conseguir investigar ou fechar caixa sem precisar rolar a lista inteira ou pedir acesso direto ao banco. Como **admin/owner/manager de uma empresa**, quero os mesmos filtros de período/provider/status (sem o de empresa, que não se aplica a mim), pelo mesmo motivo.

### Fluxo principal
1. Usuário abre `/payments`
2. Vê uma barra de filtros no topo: (superadmin apenas) seletor de empresa/cliente, período (data de/até), provider, status — todos opcionais
3. Aplica um ou mais filtros — a lista atualiza e mostra "N transações encontradas"
4. Se resultado > 1 página, navega com "Anterior/Próxima" (mesmo padrão do `CompanyListScreen`)
5. Botão "Limpar filtros" volta ao estado padrão (últimos 30 dias, todas empresas visíveis pro superadmin, sem filtro de status/provider)

### Critérios de aceite
- [ ] **Decisão de escopo a confirmar com o usuário antes de implementar:** liberar `/payments` (rota + item de menu) pro `superadmin` é mudança de RBAC, não só ajuste de filtro — ver Achado 4. Assumindo aprovação, os critérios abaixo dependem disso.
- [ ] `superadmin` ganha `/payments` em `ROLE_ROUTES` (`App.tsx:20`) e no `MENU` do `Sidebar.tsx:15`
- [ ] Filtro de empresa/cliente visível **somente** para `role === "superadmin"` — outros roles não veem o campo (já são escopados pela própria empresa)
- [ ] Filtro de período (data de / até) — `DateInput` do design system, mesmo padrão de outras telas
- [ ] Filtro de provider (mock / paygo / mercadopago) via `Dropdown`
- [ ] Filtro de status (approved / refused / cancelled / expired / processing) via `Dropdown`
- [ ] Paginação real (skip/limit + total), mesmo padrão visual do `CompanyListScreen` ("Mostrando X–Y de Z" + Anterior/Próxima)
- [ ] Superadmin, sem nenhum filtro de empresa selecionado, vê transações de **todas** as empresas (hoje só vê a própria)
- [ ] Admin/owner/manager continuam vendo só a própria empresa, mesmo que manipulem a URL/request (backend valida, não só esconde no frontend)
- [ ] "Limpar filtros" reseta todos os campos e recarrega
- [ ] Nenhuma mudança de comportamento pra quem já usa a tela sem filtro (estado inicial equivalente ao atual, exceto o teto de 100 que passa a ser paginado)

### Wireframe / Mockup
Ver protótipo (Artifact) — reaproveita a estrutura visual de `CompanyListScreen.module.scss` (`.filterBar` em grid, `.field`, `.pager`), adaptada pra 4 campos de filtro em vez de 3.

---

## QA Explorer

```gherkin
Feature: Filtros e paginação nas Transações TEF

  Scenario: Superadmin vê transações de todas as empresas por padrão
    Dado que o usuário logado é superadmin
    Quando ele abre /payments sem aplicar nenhum filtro
    Então a lista inclui transações de mais de uma empresa (quando existirem)

  Scenario: Superadmin ganha acesso à tela de Transações
    Dado que o usuário logado é superadmin
    Quando ele olha o menu lateral
    Então vê o item "Transações" (hoje não aparece)
    E consegue navegar direto pra /payments sem ser redirecionado pro /dashboard

  Scenario: Superadmin filtra por uma empresa específica
    Dado que o usuário logado é superadmin
    Quando ele seleciona "Burger House" no filtro de empresa
    Então só transações dessa empresa aparecem na lista
    E o contador mostra o total correto pra essa empresa

  Scenario: Owner não vê filtro de empresa
    Dado que o usuário logado é owner de uma empresa
    Quando ele abre /payments
    Então o campo de filtro de empresa não é exibido
    E a lista mostra só transações da própria empresa (igual hoje)

  Scenario: Owner não consegue ver outra empresa manipulando a URL/request
    Dado que o usuário logado é owner da empresa 1
    Quando ele faz uma requisição a GET /payments?company_id=2 diretamente
    Então o backend ignora o parâmetro ou retorna 403 — nunca retorna dados da empresa 2

  Scenario: Filtro de período
    Dado que existem transações em datas diferentes
    Quando o usuário define "De" e "Até"
    Então só transações dentro do intervalo aparecem

  Scenario: Filtro de status e provider combinados
    Dado que existem transações com status e providers variados
    Quando o usuário seleciona status "recusado" e provider "mercadopago"
    Então só transações que batem os dois filtros aparecem

  Scenario: Paginação
    Dado que o resultado filtrado tem mais de uma página
    Quando o usuário clica em "Próxima"
    Então a próxima página de resultados carrega
    E "Anterior" fica habilitado

  Scenario: Limpar filtros
    Dado que o usuário tem filtros aplicados
    Quando clica em "Limpar filtros"
    Então todos os campos voltam ao estado padrão
    E a lista recarrega sem filtro
```

---

## Tech Explorer

### Serviços impactados
- `services/payment/` — `main.py` (`list_payments`), possivelmente `domain/schemas.py`
- `frontend/admin/` — `PaymentsScreen.tsx`, `PaymentsScreen.module.scss`, novo `api/payments.ts` (seguindo o padrão já usado por `api/companies.ts`), `App.tsx` (`ROLE_ROUTES.superadmin`), `Sidebar.tsx` (`MENU`)

### Diagnóstico técnico (confirmado ao vivo e no código)
| Achado | Evidência |
|---|---|
| Sem filtros no backend | `list_payments` (`main.py:386-412`) não aceita query params |
| Sem paginação | `.limit(100)` fixo, sem `skip`/`total` (`main.py:394`) |
| Superadmin sem bypass | JWT do superadmin (`admin@ordin.app`) carrega `company: 1` (confirmado via decode do token); `GET /payments` autenticado como superadmin retornou só as 92 transações de `company_id=1` |
| Volume real hoje | `company_id=1`: 58 approved, 11 refused, 8 cancelled, 2 expired, 13 processing (query direta no MySQL) |

### Direção técnica proposta

**Backend (`list_payments`):**
```python
async def list_payments(
    status: Optional[str] = None,
    provider: Optional[str] = None,
    company_id: Optional[int] = None,
    date_from: Optional[str] = None,   # ISO date
    date_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    ...
):
    if current_user.role == "superadmin":
        q = select(Transaction)
        if company_id:
            q = q.where(Transaction.company_id == company_id)
    else:
        q = select(Transaction).where(Transaction.company_id == current_user.company_id)
        # company_id do query param é ignorado pra quem não é superadmin — nunca retorna 403
        # nem vaza a existência de outra empresa, só se comporta como se o parâmetro não existisse
    if status: q = q.where(Transaction.status == status)
    if provider: q = q.where(Transaction.provider == provider)
    if date_from: q = q.where(Transaction.created_at >= date_from)
    if date_to: q = q.where(Transaction.created_at <= date_to)
    total = ...  # count query espelhando os mesmos filtros, mesmo padrão do order-service
    q = q.order_by(Transaction.created_at.desc()).offset(skip).limit(limit)
```
Mesma convenção de nomes de parâmetro que `order-service` já usa (`status`, `skip`, `limit`, resposta com `total`) — consistência entre serviços.

**Frontend:** filter-bar clonada de `CompanyListScreen.tsx` (`InputBase`/`Dropdown`/botão "Limpar", debounce só seria necessário se houver campo de texto livre — não é o caso aqui, todos os filtros são seleção, então dá pra disparar o fetch direto no `onChange`/`onValueSelected`, mais simples que o debounce de `CompanyListScreen`). Dropdown de empresa reaproveita `listCompanies()` (`api/companies.ts`) já existente, só visível quando `role === "superadmin"` (checagem de `useStore().role`, mesmo padrão do `Sidebar.tsx` MENU).

### Riscos
- **Maior risco da história inteira: mudança de RBAC pro superadmin (Achado 4).** Hoje superadmin é deliberadamente mantido fora das telas operacionais (catálogo/pedidos/pagamentos/config) — só cadastra empresas. Dar acesso a `/payments` é uma decisão de produto, não um detalhe técnico; precisa aprovação explícita antes de virar Ready, não só aprovação do filtro em si.
- **Não reaproveitar `selectedCompanyId`/`setSelectedCompany` do `store.ts`:** esse estado já existe (usado pelo seletor de empresa do `DashboardScreen`), mas hoje é **dead state** — setado mas nunca enviado em nenhuma requisição (`DashboardScreen.tsx:17,26` não usam `selectedCompanyId` nas chamadas `api.get`). Copiar esse padrão "quebrado" seria propagar o bug pra uma tela nova. Esta história usa filtro local (`useState` na própria tela, enviado explicitamente como query param), do jeito que `CompanyListScreen` já faz — mais um motivo pra revisitar o `DashboardScreen` depois (fora de escopo aqui).
- **Índice de banco:** `Transaction.company_id` já tem `index=True` (`main.py:49`); `created_at` não tem índice — com filtro de período habilitado, vale considerar um índice composto `(company_id, created_at)` se o volume crescer. Não bloqueia a entrega, mas vale registrar.
- **Contrato de API muda:** `PaymentListOut` ganha campo `total` — non-breaking (campo novo), mas o frontend precisa ler `r.data.total`, não só `r.data.items`.

### Estimativa
5 pontos — 4 filtros novos + paginação real no backend (2 serviços de query: lista + contagem) + filter-bar completa no frontend seguindo padrão já validado do `CompanyListScreen`. Fundação pra [[ORD-078]], [[ORD-079]] e [[ORD-080]].

---

## Ready

**Explorer:** [x] fluxo, personas e critérios de aceite definidos, com achado crítico do superadmin documentado além do que foi pedido · **QA Explorer:** [x] cenários Gherkin cobrindo multi-tenant, filtros combinados, paginação e limpeza de filtro · **Tech Explorer:** [x] diagnóstico medido ao vivo (JWT decodado, query direta no MySQL), direção técnica com proposta de assinatura de endpoint, riscos e estimativa · **Aprovação final:** [x] aprovado no chat pelo usuário (2026-08-11), incluindo a mudança de RBAC do superadmin (Achado 4)

**Status: Ready** — pode começar a implementação.
