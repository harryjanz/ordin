---
id: ORD-098
status: Done
fase: 6
sprint: null
responsavel: Backend + Frontend
estimativa: 5 pontos
---

# ORD-098 — Terminais (aba /company): mesmo padrão de listagem, cadastro em modal, ativar/inativar

## Descrição
Pedido direto do usuário: a aba Terminais de `/company` ainda usa o layout mais antigo da tela (bloco empilhado por terminal, campo de MP Device ID sempre visível com botão "Salvar" próprio) em vez do padrão já adotado nas outras abas/telas (Usuários, Empresas, Pedidos): `Table` com colunas e ações, formulário de cadastro compacto, e suporte a ativar/inativar.

## Persona
**Owner/manager** — mesma persona das outras abas de `/company`.

## Contexto

### Achado crítico — mesmo problema do [[ORD-089]], desta vez em Terminais
`services/company/main.py:1186-1195` (`list_terminals`): a query trava em `Terminal.company_id == company_id, Terminal.active == True`, sem parâmetro `status`. `DELETE /companies/{company_id}/terminals/{terminal_id}` (resumo do próprio endpoint: **"Desativar terminal"**, `main.py:1288`) só faz `t.active = False` — nunca apaga a linha. Ou seja: **terminal desativado desaparece pra sempre da UI**, exatamente o mesmo problema já corrigido pra usuários no ORD-089. O botão hoje (`CompanyScreen.tsx:726`, texto "Excluir") reforça a leitura errada de exclusão permanente.

### Achado 2 — reativar precisa de campo novo no backend (diferente do ORD-089)
Ao contrário de `UserUpdate` (que já tem `active: Optional[bool]`), `TerminalUpdate` (`main.py:472-478`) **não tem** campo `active`. Reativar terminal exige adicionar esse campo e tratá-lo em `update_terminal` — não é reuso 100% grátis como foi pra usuários.

### Achado 3 — campos hoje geridos nesta tela
Confirmado por leitura do form atual e do backend: só `label` (na criação) e `mp_device_id` (edição inline por linha) são expostos na UI hoje. `terminal_code` é gerado automaticamente pelo backend. `tef_number`, `tef_serial` e `paygo_terminal_id` não aparecem em nenhum lugar do admin (nem aqui, nem em `PairScreen.tsx`) — ficam fora do escopo desta história, não fazem parte do que será movido pro modal.

---

## Explorer

### História
Como **owner/manager**, quero que a aba Terminais siga o mesmo padrão visual das outras abas (Usuários) — listagem em tabela com ações, cadastro/edição em modal — e poder inativar/reativar um terminal (hoje "Excluir" o esconde para sempre, sem forma de recuperar), para gerenciar os terminais da minha empresa com o mesmo nível de controle que já tenho sobre usuários.

### Fluxo principal
1. Owner/manager abre `/company`, aba Terminais
2. Vê um botão "Novo terminal" (linha compacta, sem formulário exposto) + filtro de Status (Ativos [padrão] / Inativos / Todos, mesmo padrão do ORD-089)
3. Clica em "Novo terminal" → abre `Modal` com: Rótulo (obrigatório), Ambiente (dropdown sandbox/produção), MP Device ID (opcional) → Salvar ou Cancelar
4. Listagem em `Table`: colunas Terminal (rótulo + `#codigo`), Ambiente, MP Device ID, Status (Tag ativo/inativo), Ações
5. Ação "Editar" abre o mesmo `Modal` pré-preenchido (inclui editar o MP Device ID, que hoje só dava pra editar num campo solto por linha)
6. Ação alterna "Desativar"/"Reativar" conforme status (mesmo texto e comportamento do ORD-089)

### Fluxos alternativos / exceções
- Nenhum terminal cadastrado → empty state (mesmo padrão das outras listagens)
- Filtro "Inativos"/"Todos" com nenhum resultado → empty state + "Limpar filtros"
- Reativar um terminal → some do filtro "Inativos", aparece em "Ativos"

### Critérios de aceite
- [ ] Cadastro de terminal (label, ambiente, MP Device ID) em `Modal` com Salvar/Cancelar
- [ ] Edição de terminal no mesmo `Modal` (mesmos 3 campos), reaproveitado para criar e editar
- [ ] Listagem em `Table`, mesmo componente/estilo das outras abas, uma linha por terminal
- [ ] Filtro de Status: Ativos (padrão) / Inativos / Todos
- [ ] Terminal inativo fica visível e recuperável (via "Inativos"/"Todos") — hoje é invisível pra sempre
- [ ] Ação "Reativar" para terminais inativos (endpoint novo: `TerminalUpdate.active`)
- [ ] Ação "Excluir" renomeada para "Desativar" (mesmo endpoint, sem mudança de comportamento)
- [ ] Comportamento padrão (sem filtro aplicado) idêntico ao de hoje: só terminais ativos aparecem
- [ ] `tef_number`, `tef_serial`, `paygo_terminal_id`, `terminal_code` seguem fora do escopo (não entram no modal)

---

## QA Explorer

```gherkin
Feature: Terminais — listagem em tabela, cadastro em modal, ativar/inativar

  Scenario: Criar terminal via modal
    Dado o owner na aba Terminais
    Quando clica em "Novo terminal", preenche Rótulo "Caixa 3" e clica em Salvar
    Então o modal fecha e "Caixa 3" aparece na listagem com status "ativo"

  Scenario: Cancelar criação não salva nada
    Dado o modal de novo terminal aberto com campos preenchidos
    Quando o owner clica em Cancelar
    Então o modal fecha e nenhum terminal novo é criado

  Scenario: Editar MP Device ID via modal
    Dado um terminal existente sem MP Device ID
    Quando o owner clica em "Editar", preenche o MP Device ID e salva
    Então a listagem mostra o novo MP Device ID na coluna correspondente

  Scenario: Status padrão mostra só ativos
    Dado que existe pelo menos um terminal inativo
    Quando o owner abre a aba Terminais sem aplicar filtro
    Então só terminais ativos aparecem (comportamento idêntico ao de hoje)

  Scenario: Filtro Status = Inativos
    Dado que existe pelo menos um terminal inativo
    Quando o owner seleciona Status = "Inativos"
    Então só terminais inativos aparecem, cada um com ação "Reativar"

  Scenario: Reativar terminal
    Dado um terminal inativo visível no filtro "Inativos"
    Quando o owner clica em "Reativar"
    Então o terminal passa a aparecer no filtro "Ativos" (padrão) e some de "Inativos"

  Scenario: Desativar terminal
    Dado um terminal ativo
    Quando o owner clica em "Desativar"
    Então o terminal some da listagem padrão e passa a aparecer em "Inativos"

  Scenario: Isolamento multi-tenant
    Dado um terminal da empresa B
    Quando o owner da empresa A aplica qualquer filtro de status
    Então nenhum terminal da empresa B aparece
```

---

## Tech Explorer

### Serviços impactados
- `services/company/` — `main.py` (`TerminalUpdate`, `list_terminals`, `update_terminal`)
- `frontend/admin/` — `CompanyScreen.tsx`, `CompanyScreen.module.scss`

### Endpoints

#### `GET /companies/{company_id}/terminals` (alterado)
Novo query param, mesmo padrão do ORD-089:
```python
status: str = Query("active", pattern="^(active|inactive|all)$")
```
```python
filters = [Terminal.company_id == company_id]
if status == "active":
    filters.append(Terminal.active == True)
elif status == "inactive":
    filters.append(Terminal.active == False)
# status == "all": sem filtro de active
```
Default `"active"` preserva o comportamento implícito de hoje para qualquer chamador que não passe o parâmetro.

#### `PUT /companies/{company_id}/terminals/{terminal_id}` (alterado)
`TerminalUpdate` ganha:
```python
active: Optional[bool] = None
```
```python
if body.active is not None:
    t.active = body.active
```
Sem migration — `active` já existe na tabela (`Terminal.active`, default `True`).

### Frontend

- Botão "Novo terminal" abre `Modal` (`design-system`, mesmo componente usado em `CatalogScreen.tsx`) com `InputBase` (Rótulo), `Dropdown` (Ambiente), `InputBase` (MP Device ID) + `Button` Salvar/Cancelar
- Mesmo `Modal` reaproveitado para editar (estado `editTerminalId`, mesmo padrão de `editUserId`/`openEditUser` já usado na aba Usuários)
- Listagem: `Table` (`components/Table.tsx`, mesmo componente da aba Usuários) — colunas Terminal, Ambiente, MP Device ID, Status, Ações
- Filtro de Status: `Dropdown` com `STATUS_FILTER_OPTIONS` (já existe no arquivo, reaproveitado — hoje só usado em Usuários)
- `reactivateTerminal(id)`: `api.put(`/companies/${companyId}/terminals/${id}`, { active: true })`
- `deactivateTerminal` reaproveita o `deleteTerminal` atual (mesmo `DELETE`), texto do `ConfirmDialog` ajustado pra "Desativar terminal?"
- Remove o bloco antigo (`.item`/`.itemStack`/`.mpRow` específico de terminais) e o form inline de criação de terminal

### Riscos
- Baixo — reuso total de padrões já validados no ORD-089 (filtro de status, ativar/desativar) e no `Modal` já usado em `CatalogScreen.tsx`.
- Única mudança de schema é um campo opcional novo em `TerminalUpdate` (sem migration, sem impacto em outros serviços — `Terminal.active` já é consumido por `payment-service` via `/internal/terminals/{id}` e por `/pair`, ambos já filtram por `active == True`, comportamento inalterado).
- Sem teste hoje cobrindo ciclo desativar→reativar→listar terminal — precisa de teste novo (mesmo molde do `test_ord089_filtro_usuarios.py`).

### Estimativa
5 pontos — comparável ao [[ORD-089]]: filtro num endpoint existente + campo novo simples em outro + reforma de UI reaproveitando `Table`/`Modal`/`Dropdown` já usados em outras telas, sem serviço novo.

---

## Ready

**Explorer:** [x] fluxo, persona e critérios de aceite definidos, achado crítico de terminal desativado ficar irrecuperável documentado · **QA Explorer:** [x] cenários Gherkin cobrindo criação/edição via modal, cancelar, os 3 filtros de status, ativar/desativar e isolamento multi-tenant · **Tech Explorer:** [x] endpoints com solução completa (1 query param novo, 1 campo novo sem migration), riscos e estimativa · **Aprovação final:** [x] aprovado no chat pelo usuário (2026-08-19)

**Status: Ready** — pode começar a implementação.

---

## Downstream

- **Branch:** `feature/ord-098-terminais-modal-status`, a partir de `main`.
- **`services/company/main.py`:** `TerminalUpdate` ganhou `active: Optional[bool] = None`; `list_terminals` ganhou `status` (default `"active"`, mesmo padrão do [[ORD-089]]); `update_terminal` teve o filtro `active=True` removido da busca do terminal (igual `update_user` já fazia) — sem isso, reativar um terminal inativo via `PUT` retornava 404, já que o endpoint não conseguia nem encontrar o registro inativo pra atualizar.
- **`services/company/tests/test_ord098_terminais_status.py` (novo):** 7 testes — status default/inactive/all, reativar, desativar, editar MP Device ID, isolamento multi-tenant.
- **`services/company/tests/test_coverage.py` (`test_dir_list_terminals`):** mesma correção do ORD-089 — chamada direta ao endpoint quebrava por posição (o novo `status` entrou entre `company_id` e `skip`); corrigida pra keyword args.
- **Suíte completa do company-service:** **297 passed**, 4 falhas pré-existentes e não relacionadas (confirmadas idênticas em `main` limpo antes desta história: `test_require_superadmin_raises_for_owner` e 3 testes de `test_ord065_cnpj_unico.py`).
- **`frontend/admin/src/screens/CompanyScreen.tsx`:** aba Terminais reescrita — form/listagem antigos (`.item`/`.itemStack`/`.mpRow`, MP Device ID editado inline por linha) removidos; nova listagem em `Table` (mesmo componente de Usuários) com colunas Terminal/Ambiente/MP Device ID/Status/Ações; filtro de Status (`STATUS_FILTER_OPTIONS`, reaproveitado de Usuários); botão "+ Novo terminal" abre `Modal` reaproveitado pra criar e editar; ação Editar/Desativar/Reativar por linha.
- **Bug real encontrado e corrigido durante a verificação ao vivo:** o formulário do modal, inicialmente com `InputBase` controlado (`value`/`onChange` + state), perdia o foco a cada caractere digitado — mesmo bug documentado em `PaymentsScreen.tsx` (`Modal.tsx:46` do vendor, `identifier` não memoizado: cada re-render do pai recria o portal do Modal e remonta os filhos). Corrigido aplicando o mesmo contorno já usado lá: Rótulo e MP Device ID viraram inputs não-controlados (`ref` + `defaultValue`, lidos só no submit), com um `key` no `<form>` incrementado a cada abertura do modal pra forçar reaplicar o `defaultValue` certo ao editar um terminal diferente. Ambiente (Dropdown) permanece controlado — seleção é uma ação discreta, não digitação contínua, não dispara o bug.
- **`frontend/admin/src/types.ts`:** `Terminal` ganhou `terminal_code?: string | null` (já vinha do backend, faltava no tipo — usado agora pra exibir `#codigo` na coluna Terminal).
- `tsc --noEmit`: limpo. `vitest run`: **48 passed**, sem regressão.
- **Verificado ao vivo no Chrome** (owner `carlos@burgerhouse.com`, empresa Burger House): criar terminal via modal (com MP Device ID) → aparece na listagem → Desativar → some de Ativos → filtro Inativos mostra com "Reativar" → Reativar → volta a Ativos → Editar abre modal pré-preenchido com os valores corretos. Sem erros no console em nenhum passo.

### Ajuste pós-verificação (pedido do usuário)

Depois da primeira verificação: a barra de filtro (só o Status, sozinho) não seguia o padrão visual de Usuários (cartão com fundo/borda), estava grande demais, e faltava filtro por nome do terminal e por ambiente.

- **`services/company/main.py` (`list_terminals`):** ganhou `label: Optional[str]` (busca parcial, `ilike`) e `environment: Optional[str]` (`sandbox`/`production` exato).
- **`services/company/tests/test_coverage.py` (`test_dir_list_terminals`):** precisou passar `label=None, environment=None` explicitamente na chamada direta — sem isso, o valor padrão desses parâmetros na chamada direta (fora do FastAPI) é o próprio objeto `Query(...)`, não `None`, e como esse objeto é truthy, o filtro `if label:` disparava com um valor inválido e zerava o resultado. Mesma armadilha que `test_dir_list_users` já contornava (`services/company/tests/test_coverage.py:519-528`) — não é bug de produção, só da chamada direta em teste.
- **`services/company/tests/test_ord098_terminais_status.py`:** fixture ganhou um terceiro terminal (`environment="production"`) pra poder testar o filtro de ambiente; +3 testes (`test_filtro_por_label`, `test_filtro_por_environment`, `test_combinacao_label_environment_status`); `test_status_all_mostra_ambos` ajustado pro novo total (3, não 2).
- **`frontend/admin/src/screens/CompanyScreen.tsx`:** `.terminalHeaderRow` (Status sozinho, flex simples) virou duas partes — `.terminalActionsRow` só com o botão "+ Novo terminal" (alinhado à direita, acima) e `.filterBar` (mesmo cartão de fundo/borda de Usuários) com Terminal (busca por nome, debounced 500ms + race-guard, mesmo padrão de `userNameFilter`), Ambiente (`ENVIRONMENT_FILTER_OPTIONS`, novo — "Todos" + Sandbox/Produção) e Status, mais "Limpar filtros".
- **`CompanyScreen.module.scss`:** `.terminalHeaderRow` substituído por `.terminalActionsRow` (menor, só o botão); `.filterBar` reaproveitado sem alteração.
- Suíte completa do company-service: **300 passed**, mesmas 4 falhas pré-existentes. `tsc --noEmit` limpo, `vitest run`: **48 passed**.
- Containers `company-service`/`admin` reconstruídos; verificação ao vivo desta rodada delegada ao usuário.

PR aberta para `main`.
