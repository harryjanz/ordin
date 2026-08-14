---
id: ORD-086
status: Done
fase: 6
sprint: null
responsavel: Frontend
estimativa: 3 pontos
---

# ORD-086 — Usuários (aba /company): formulário e listagem no padrão do design system

## Descrição
Pedido direto do usuário, abrindo uma nova sprint sobre cadastro de usuários. A aba "Usuários" dentro de `/company` (`CompanyScreen.tsx`) nunca passou pela mesma revisão de padrão visual que Transações ([[ORD-077]]–[[ORD-080]]), Pedidos ([[ORD-081]]) e Empresas ([[ORD-084]]) já passaram. É pré-requisito da próxima história da sprint ([[ORD-087]] — convite por e-mail), que muda o mesmo formulário e a mesma listagem: melhor consolidar a base visual primeiro, para o diff da história seguinte ficar limpo (só a mudança de fluxo de senha, sem misturar reskin).

## Persona
**Owner/manager** — únicos roles com `/company` na matriz de rotas (`App.tsx` `ROLE_ROUTES`; `superadmin`/`admin` não têm essa rota, eles usam `/companies` + `/companies/:id/contract`). É quem cadastra e gerencia a equipe da própria empresa.

## Contexto

### Achado 1 — listagem em `<div>` cru, não usa o componente `Table`
`CompanyScreen.tsx:610-619` renderiza cada usuário como `<div className={styles.item}>` manual. Todas as telas de listagem do admin (Transações, Pedidos, Empresas) usam o componente compartilhado `Table` (`components/Table.tsx`), com `variant="compact"`. A aba Usuários é a única lista do admin que ainda não usa esse componente.

### Achado 2 — Tag do papel conflita com Tag de status
`CompanyScreen.tsx:615`: `<Tag variant={u.active ? "success" : "error"}>{u.role}</Tag>` — uma única tag mistura duas informações (o texto mostra o **papel** — "cashier"/"manager"/"owner" — mas a **cor** reflete o status **ativo/inativo**). Resultado: um usuário `cashier` inativo aparece com tag vermelha escrito "cashier", que lê como um erro, não como "papel: cashier, inativo". São duas dimensões diferentes e precisam de duas tags.

### Achado 3 — inputs sem `label`, inconsistente com o resto do próprio arquivo
O formulário de usuário (`CompanyScreen.tsx:596-599`) usa `InputBase` só com `placeholder`, sem `label`. A `PaymentTab` **no mesmo arquivo** (linha 302-311, 345-355) já usa `label={f.label}` no `InputBase`. A aba Usuários é a única seção da própria tela fora do padrão que a tela adotou para si mesma.

### Achado 4 — sem estado de carregamento
`loadUsers()` (`CompanyScreen.tsx:437-446`) não seta nenhum estado de "carregando" — a lista pula de vazia para populada sem feedback, diferente de `PaymentTab` (linha 246-249: `Carregando…`) na mesma tela.

### Achado 5 (fora do escopo desta história) — sem paginação/filtros, sem edição de papel/reativação
`list_users` já aceita `skip`/`limit` (`services/company/main.py:1119`), mas o frontend não usa. Também não existe UI para editar papel ou reativar um usuário desativado — só criar e excluir (`deleteUser`, linha 493). **Decisão de escopo:** não incluídos aqui. Uma empresa típica tem uma equipe pequena (dezenas, não milhares) — filtro/paginação nesse volume tem pouco ganho hoje. Editar papel/reativar é uma capacidade nova, não um reskin, e fica fora do pedido original ("deixar no mesmo padrão"). Documentado aqui para não se perder — pode virar história própria se o volume de usuários por empresa crescer ou se o time sentir falta da reativação.

---

## Explorer

### História
Como **owner/manager**, quero que o cadastro e a listagem de usuários da minha empresa usem os mesmos componentes e o mesmo acabamento visual que já vejo em Transações, Pedidos e Empresas, para ter uma experiência consistente em todo o admin — e para que a próxima mudança (convite por e-mail) tenha uma base visual limpa pra construir em cima.

### Fluxo principal
1. Owner/manager abre `/company`, aba "Usuários"
2. Vê a lista em `Table` `variant="compact"`, com loading state ao carregar
3. Cada linha mostra: nome, e-mail, **duas tags separadas** (papel + status ativo/inativo)
4. Formulário de criação com `InputBase` rotulado (`label`), mesmo padrão do restante da tela
5. Cria usuário → lista atualiza (comportamento já existente, mantido)
6. Exclui usuário → `ConfirmDialog` (comportamento já existente, mantido)

### Critérios de aceite
- [ ] Listagem migrada para o componente `Table` `variant="compact"`
- [ ] Tag de papel e tag de status ativo/inativo separadas (duas tags por linha)
- [ ] Inputs do formulário de criação ganham `label` (Nome, E-mail, Senha, Papel)
- [ ] Estado de carregamento (`Carregando…`) ao buscar usuários, mesmo padrão de `PaymentTab`
- [ ] Nenhuma mudança de comportamento funcional (criar, excluir, papéis permitidos por role continuam idênticos) — esta história é só de apresentação
- [ ] Campo "Senha" **permanece** no formulário — sua remoção é escopo do [[ORD-087]], não desta história

### Wireframe / Mockup
Não desenho protótipo novo — clonar a estrutura de `Table`/`Tag`/`InputBase` já aprovada em `CompanyListScreen.tsx` e na própria `PaymentTab` deste arquivo.

---

## QA Explorer

```gherkin
Feature: Padrão visual do cadastro e listagem de usuários

  Scenario: Listagem usa o componente Table compacto
    Dado que o usuário abre /company, aba Usuários
    Então a lista de usuários usa o componente Table na variante compacta

  Scenario: Papel e status aparecem em tags separadas
    Dado que existe um usuário inativo com papel "cashier"
    Então a linha mostra uma tag com o papel "cashier" (cor neutra)
    E uma tag separada indicando "inativo" (cor de erro)

  Scenario: Estado de carregamento
    Dado que a lista de usuários ainda não terminou de carregar
    Então uma mensagem "Carregando…" é exibida, mesmo padrão da aba Pagamento

  Scenario: Criação de usuário sem regressão
    Dado que o owner/manager preenche nome, e-mail, senha e papel
    Quando submete o formulário
    Então o usuário é criado exatamente como hoje (endpoint e payload inalterados)

  Scenario: Regra de permissão de papel preservada
    Dado que um usuário com role "manager" está logado
    Quando tenta criar um usuário com papel "owner"
    Então recebe erro 403, mesmo comportamento já existente

  Scenario: Exclusão de usuário sem regressão
    Dado que o owner/manager clica em "Excluir" numa linha
    Então o ConfirmDialog aparece e, ao confirmar, o usuário é removido — comportamento inalterado
```

---

## Tech Explorer

### Serviços impactados
- `frontend/admin/` apenas — `CompanyScreen.tsx`, `CompanyScreen.module.scss`. **Nenhuma mudança de backend** (endpoints, payloads e regras de permissão de `services/company/main.py` ficam intocados).

### Direção técnica proposta

**Tabela de usuários:**
```tsx
<Table
  variant="compact"
  columns={[
    { key: "name", header: "Nome", render: (u) => u.name },
    { key: "email", header: "E-mail", render: (u) => u.email },
    { key: "role", header: "Papel", render: (u) => <Tag variant="neutral">{roleLabel(u.role)}</Tag> },
    { key: "status", header: "Status", render: (u) =>
        <Tag variant={u.active ? "success" : "error"}>{u.active ? "Ativo" : "Inativo"}</Tag> },
    { key: "action", header: "", render: (u) =>
        <Button size="small" variant="secondary" onClick={() => deleteUser(u.id)}>Excluir</Button> },
  ]}
  rows={users}
/>
```
`roleLabel` reaproveita o mapeamento que já existe em `ROLE_OPTIONS` (linha 85-89), invertido (`value → label`).

**Formulário:** adicionar `label` a cada `InputBase` existente — sem mudar `type`, `value`, `onChange`. Zero mudança de payload.

**Loading:** replicar o padrão já usado em `PaymentTab` (`loading` state + `{loading ? <div className={styles.muted}>Carregando…</div> : ...}`) em volta do bloco de listagem de usuários.

### Riscos
Risco muito baixo — puramente de apresentação, reuso de componentes já validados nas outras 3 telas de listagem, sem tocar em nenhum endpoint. Único cuidado: o layout de `Table` com colunas em vez de `<div>` livre pode precisar ajustar largura de coluna pro e-mail não truncar — mesmo cuidado de sempre, não é risco novo.

### Estimativa
3 pontos — menor que o [[ORD-084]] (5): não há filtro, paginação nem endpoint novo, é reskin puro de componentes já provados.

---

## Ready

**Explorer:** [x] fluxo, persona e critérios de aceite definidos, achados de UI documentados (incluindo o que fica fora do escopo e por quê) · **QA Explorer:** [x] cenários Gherkin cobrindo padrão visual e não-regressão de todas as ações existentes · **Tech Explorer:** [x] direção técnica frontend-only, sem impacto em backend, riscos e estimativa definidos · **Aprovação final:** [x] escopo derivado diretamente do pedido do usuário (2026-08-13); decisão de deixar paginação/edição de papel fora do escopo é uma leitura de PM, sinalizada explicitamente para o usuário poder corrigir se discordar.

**Status: Ready** — pode começar a implementação.

---

## Downstream

- **Branch:** `feature/ord-086-usuarios-padrao-design-system`, a partir de `main`.
- **`CompanyScreen.tsx`:** listagem migrada para `Table` `variant="compact"`; papel e status agora são duas `Tag` separadas (`variant="neutral"` pro papel via `ROLE_LABELS`, `variant={active ? "success" : "error"}` pro status); `InputBase`/`Dropdown` do formulário ganharam `label`; novo estado `loadingUsers` com o mesmo texto "Carregando…" da `PaymentTab`. Nenhuma mudança de endpoint, payload ou regra de permissão — confirmado, zero diff em `services/company/main.py`.
- `tsc --noEmit`: limpo. `vitest run`: **48 passed** (6 arquivos), sem regressão.
- Verificado ao vivo no Chrome (owner `carlos@burgerhouse.com`, Burger House): tabela compacta renderiza corretamente, tag de papel (roxo neutro) separada da tag de status (verde "Ativo"), formulário com labels, sem erros no console.
- **Achado colateral, fora do escopo:** a listagem mostra `admin@ordin.app` (role `superadmin`) como usuário da empresa Burger House — parece dado de seed pré-existente misturando um usuário de plataforma na tabela `users` de uma empresa específica. Não é regressão desta história (comportamento já existia antes, só ficou mais visível com a tabela nova) — documentado aqui para virar um Achado formal numa história futura, não investigado a fundo agora.
- PR aberta para `main`.
