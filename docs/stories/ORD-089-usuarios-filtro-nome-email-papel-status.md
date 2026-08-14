---
id: ORD-089
status: Ready
fase: 6
sprint: null
responsavel: Backend + Frontend
estimativa: 5 pontos
---

# ORD-089 — Usuários (aba /company): filtro por nome, e-mail, papel e status

## Descrição
Pedido direto do usuário, priorizado à frente do [[ORD-087]]: filtrar a listagem de usuários da própria empresa por nome, e-mail, papel e status. Mesma tela do [[ORD-086]] (já mesclada), antes do [[ORD-087]] mexer nela de novo — mantém o padrão de uma mudança de escopo por vez na mesma tela.

## Persona
**Owner/manager** — mesma persona do [[ORD-086]].

## Contexto

### Achado crítico — `list_users` não aceita nenhum filtro e trava em `active == True`
`services/company/main.py:1120-1137`: o endpoint não recebe `name`/`email`/`role`/`status` — só `skip`/`limit`. Pior: a query tem `User.active == True` **hardcoded**, sem parâmetro nenhum pra mudar isso. Combinado com o achado abaixo, isso significa que um usuário desativado é **permanentemente invisível**, sem nenhuma forma de vê-lo ou recuperá-lo.

### Achado 2 — "Excluir" é desativação, não exclusão, e o usuário some pra sempre
`services/company/main.py:1208-1226` (`DELETE /companies/{company_id}/users/{user_id}`, resumo do próprio endpoint: **"Desativar usuário"**) só seta `u.active = False` — nunca apaga a linha. Mas como o Achado crítico trava a listagem em `active == True`, o efeito prático hoje é indistinguível de uma exclusão real: uma vez desativado, o usuário não aparece em lugar nenhum da UI e não há como reverter. O botão no frontend (`CompanyScreen.tsx:617`, texto "Excluir") reforça essa leitura errada.

### Achado 3 — reativar já é grátis no backend
`PUT /companies/{company_id}/users/{user_id}` (`main.py:1176-1201`, `UserUpdate.active: Optional[bool]`) já aceita `{"active": true}` e já reverte a desativação. **Nenhum endpoint novo é necessário** para reativar — só falta o frontend chamar o que já existe.

### Achado 4 — sem busca por nome/e-mail nem filtro por papel
Confirmado por leitura direta do endpoint: zero suporte a busca textual ou filtro por `role` hoje.

---

## Explorer

### História
Como **owner/manager**, quero filtrar a lista de usuários da minha empresa por nome, e-mail, papel e status, para localizar rapidamente alguém à medida que a equipe cresce — e poder reativar um usuário desativado por engano ou que voltou à empresa, hoje impossível.

### Fluxo principal
1. Owner/manager abre `/company`, aba Usuários
2. Vê a barra de filtros (mesmo grid `auto-fit`/`minmax` das outras telas): Nome, E-mail (texto, debounced), Papel (dropdown com "Todos" + papéis existentes), Status (dropdown: **Ativos** [padrão] / Inativos / Todos)
3. Aplica um ou mais filtros — lista atualiza
4. Linha de usuário inativo mostra ação **"Reativar"** em vez de "Desativar"
5. Botão "Excluir" renomeado para **"Desativar"** (mesmo endpoint, sem mudança de comportamento)

### Fluxos alternativos / exceções
- Combinação de múltiplos filtros ao mesmo tempo (AND entre eles)
- Nenhum resultado → mensagem de vazio + "Limpar filtros" (mesmo padrão de Empresas/Pedidos)
- Reativar um usuário → some do filtro "Inativos", aparece em "Ativos"

### Critérios de aceite
- [ ] Filtro por nome (texto, busca parcial, debounced)
- [ ] Filtro por e-mail (texto, busca parcial, debounced)
- [ ] Filtro por papel (dropdown, papéis existentes + "Todos")
- [ ] Filtro por status: Ativos (padrão) / Inativos / Todos
- [ ] Usuários inativos ficam visíveis e recuperáveis pela primeira vez (via "Inativos"/"Todos")
- [ ] Botão "Reativar" para usuários inativos, usando o `PUT` já existente (`{"active": true}`) — **aprovado com o usuário (2026-08-13)**
- [ ] Botão "Excluir" renomeado para "Desativar" — **aprovado com o usuário (2026-08-13)**
- [ ] Regra "usuário não pode desativar a si mesmo" preservada (já existe)
- [ ] Regras de permissão de papel preservadas (manager não promove a owner, etc.)
- [ ] Comportamento padrão (sem nenhum filtro aplicado) idêntico ao de hoje: só usuários ativos aparecem

---

## QA Explorer

```gherkin
Feature: Filtro de usuários por nome, e-mail, papel e status

  Scenario: Filtro por nome (busca parcial)
    Dado que existe um usuário chamado "Ana Souza"
    Quando o owner filtra por nome "Ana"
    Então só usuários cujo nome contém "Ana" aparecem

  Scenario: Filtro por e-mail (busca parcial)
    Dado que existe um usuário com e-mail "ana@burgerhouse.com"
    Quando o owner filtra por e-mail "burgerhouse"
    Então só usuários com esse trecho no e-mail aparecem

  Scenario: Filtro por papel
    Dado que existem usuários com papéis diferentes
    Quando o owner filtra por papel "Gerente"
    Então só usuários com esse papel aparecem

  Scenario: Status padrão mostra só ativos
    Dado que existe pelo menos um usuário inativo
    Quando o owner abre a aba Usuários sem aplicar nenhum filtro
    Então só usuários ativos aparecem (comportamento idêntico ao de hoje)

  Scenario: Filtro Status = Inativos
    Dado que existe pelo menos um usuário inativo
    Quando o owner seleciona o filtro Status = "Inativos"
    Então só usuários inativos aparecem, cada um com ação "Reativar"

  Scenario: Filtro Status = Todos
    Quando o owner seleciona o filtro Status = "Todos"
    Então usuários ativos e inativos aparecem juntos

  Scenario: Reativar usuário
    Dado um usuário inativo visível no filtro "Inativos"
    Quando o owner clica em "Reativar"
    Então o usuário passa a aparecer no filtro "Ativos" (padrão)
    E some do filtro "Inativos"

  Scenario: Desativar continua com a mesma regra de auto-proteção
    Dado o owner logado, olhando sua própria linha na tabela
    Então não há ação de desativar disponível pra ele mesmo (regra já existente)

  Scenario: Combinação de filtros
    Dado usuários com papéis e status variados
    Quando o owner aplica papel "Caixa" e status "Ativos" ao mesmo tempo
    Então só usuários que satisfazem as duas condições aparecem

  Scenario: Isolamento multi-tenant
    Dado um usuário da empresa B
    Quando o owner da empresa A aplica qualquer filtro
    Então nenhum usuário da empresa B aparece, independente do filtro
```

---

## Tech Explorer

### Serviços impactados
- `services/company/` — `main.py` (`list_users`): novos query params, remoção do `active == True` hardcoded
- `frontend/admin/` — `CompanyScreen.tsx`, `CompanyScreen.module.scss`

### Endpoint

#### `GET /companies/{company_id}/users` (alterado)
**Auth:** JWT, `_require_company_admin` (igual hoje)

Novos query params:
```python
name: Optional[str] = Query(None, min_length=1)
email: Optional[str] = Query(None, min_length=1)
role: Optional[str] = Query(None, pattern="^(owner|manager|cashier)$")
status: str = Query("active", pattern="^(active|inactive|all)$")
```
`status` com **default `"active"`** — preserva o comportamento implícito de hoje pra qualquer chamador que não passe o parâmetro.

```python
filters = [User.company_id == company_id]
if status == "active":
    filters.append(User.active == True)
elif status == "inactive":
    filters.append(User.active == False)
# status == "all": sem filtro de active
if name:
    filters.append(User.name.ilike(f"%{name}%"))
if email:
    filters.append(User.email.ilike(f"%{email}%"))
if role:
    filters.append(User.role == role)
```
Sem migration — `name`, `email`, `role`, `active` já são colunas existentes.

### Frontend

- `.filterBar` novo na aba Usuários: mesmo grid `auto-fit`/`minmax(180px, 1fr)` já usado em Empresas/Pedidos/Pagamentos
- Nome/E-mail: `InputBase` com debounce + `requestId` race-guard, mesmo padrão dos campos de busca livre já usados em Pedidos/Pagamentos
- Papel: `Dropdown` reaproveitando `ROLE_OPTIONS` + opção "Todos"
- Status: `Dropdown` com opções Ativos (padrão) / Inativos / Todos
- Coluna de ação na `Table`: `u.active ? <Button variant="secondary" onClick={() => deactivateUser(u.id)}>Desativar</Button> : <Button variant="secondary" onClick={() => reactivateUser(u.id)}>Reativar</Button>`
- `reactivateUser(id)`: `api.put(`/companies/${companyId}/users/${id}`, { active: true })` — endpoint já existe, zero mudança de backend pra essa parte
- `deactivateUser` reaproveita o `deleteUser` atual (mesmo `DELETE`), só renomeado

### Riscos
- Baixo — reuso de padrões de filtro/debounce já validados em 3 outras telas, e o endpoint de reativação já existe e está em produção (usado por `update_user` pra trocar papel).
- Sem teste hoje cobrindo o ciclo desativar→reativar→listar — precisa de teste novo específico.
- Nenhum outro serviço chama `list_users` além do próprio frontend admin (confirmado por busca no código) — mudar o default de `status` pra `"active"` não quebra nada externo.

### Estimativa
5 pontos — comparável ao [[ORD-084]]: filtros num endpoint existente + duas ações de UI (Desativar/Reativar) alternadas na mesma coluna, sem migration nem serviço novo.

---

## Ready

**Explorer:** [x] fluxo, persona e critérios de aceite definidos, achado crítico de usuários desativados ficarem irrecuperáveis documentado · **QA Explorer:** [x] cenários Gherkin cobrindo os 4 filtros, combinação, reativação e isolamento multi-tenant · **Tech Explorer:** [x] endpoint com query params completos, sem migration, reuso do endpoint de reativação já existente, riscos e estimativa · **Aprovação final:** [x] aprovado no chat pelo usuário (2026-08-13) — inclusão do botão "Reativar" e renomeação "Excluir"→"Desativar" ambas aprovadas

**Status: Ready** — priorizada antes do [[ORD-087]]. Pode começar a implementação.
