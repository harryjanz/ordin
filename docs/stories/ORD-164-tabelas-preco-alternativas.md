# Tabelas de preço alternativas (promocionais)

## Descrição
Hoje (ORD-162/163) só existe uma tabela de preço "vigente" por vez — a única fonte usada tanto
como padrão para novos contratos quanto como referência de renovação. A ideia é permitir tabelas
**alternativas** (promocionais) convivendo com a tabela principal vigente: o superadmin/admin
poderia vincular uma tabela alternativa a um contrato específico, quando achar que faz sentido
comercialmente (negociação pontual, campanha, cliente estratégico), sem que isso afete qual
tabela é a padrão para os demais.

## Persona
Super Admin (decide quais tabelas existem e podem ser usadas como alternativa) e Admin da
plataforma (aplica a tabela alternativa no contrato de uma empresa específica, "conforme achar
melhor").

## Contexto
Surgiu de uma reflexão durante a ORD-162/163: o modelo atual já desacopla `CompanyPlan` do status
da tabela (o vínculo é por `price_table_id`, não por "ativa"), então tecnicamente já seria possível
apontar um plano para qualquer tabela — só falta a regra de negócio e a UI para isso ser uma
decisão deliberada do admin, e não um acidente. O ponto que precisa de desenho novo: a invariante
"só uma tabela `active` por vez" da ORD-162 mistura duas coisas — "é a tabela padrão para novos
contratos" e "é a única vigente" — e isso precisa se separar para permitir tabelas alternativas em
paralelo com a principal.

## Explorer

### História
Como **Super Admin** ou **Admin da plataforma**, quero marcar tabelas de preço como
**"alternativa"** ou **"promocional"**, independente de qual tabela é a vigente/padrão, para
poder aplicar condições comerciais diferentes em contratos específicos (negociação pontual,
campanha, cliente estratégico) — tanto na atribuição do contrato quanto na renovação — sem
afetar a tabela usada por padrão em todos os outros contratos.

### Contexto e motivação
A ORD-162 fechou a invariante "só uma tabela `active` por vez" pensando em um único uso: qual
tabela é a fonte de verdade pra novos contratos e renovações automáticas. Essa invariante
continua certa para essa finalidade — mas hoje ela também é, na prática, a única forma de uma
tabela "existir de verdade" em uso (rascunho não é usável, histórica é passado). Não há hoje
nenhuma forma de ter uma tabela **utilizável mas não-padrão** ao mesmo tempo que a vigente. A
proposta valida a hipótese trazida na tarefa com um ajuste: em vez de tratar "disponível como
alternativa" como parte do ciclo de vida (`draft`/`active`/`historical`), ela deve ser uma
**marcação independente** (um novo campo, não um novo valor de `status`) — porque uma tabela
`historical` (uma vigente antiga, já substituída) é candidata perfeitamente razoável a virar
alternativa/promocional de novo mais tarde, e isso não deveria exigir reativá-la como a vigente
geral só pra ficar disponível para um cliente específico.

### Decisões (resolvidas com o usuário em 2026-09-11)
1. **Renovação com tabela alternativa:** `POST /plan/renew` deixa de reatribuir *sempre*
   automaticamente à tabela `active` — passa a **oferecer escolha manual** entre a vigente e
   qualquer tabela marcada como alternativa/promocional no momento da renovação. Sem escolha
   explícita, o comportamento padrão continua sendo a tabela `active` (não quebra o uso comum
   já decidido na ORD-163).
2. **Validade da promoção:** controle **manual**, sem data de expiração própria nem automação —
   mesma filosofia já adotada na ORD-163 para o vencimento de contrato (sem infra de
   cron/scheduler nesta fase do projeto).
3. **Quem pode marcar:** **Admin e Super Admin** — mesma dupla de acesso que já existe hoje pro
   CRUD de `price-tables` na ORD-162; não há distinção de permissão nova.
4. **Rótulo:** não é um nome único fixo — é um **campo de categoria** (`kind`) que o admin
   escolhe ao marcar a tabela: `"alternativa"` ou `"promocional"`. As duas têm exatamente o
   mesmo comportamento (controle manual, seleção em contrato e renovação); a diferença é só de
   categorização/rótulo visível na UI, útil para o admin organizar campanhas temporárias
   ("promocional") separado de acordos comerciais específicos permanentes ("alternativa").

### Fluxo principal
1. Admin ou Super Admin cria ou já tem uma tabela de preço (fluxo existente da ORD-162 — draft
   → activate).
2. Numa tabela que não está em `draft` (ou seja, `active` ou `historical`), o admin aciona
   "Marcar como alternativa/promocional" e escolhe a categoria (`kind`: "alternativa" ou
   "promocional") — uma ação independente de ativar/duplicar/excluir. Várias tabelas podem
   estar marcadas assim ao mesmo tempo, cada uma com sua própria categoria; marcar uma não
   desmarca outra.
3. Criação de empresa (`POST /companies`) **não muda em nada** — continua pegando
   automaticamente a tabela `active` no momento, sem exigir nenhuma ação manual. Quem nunca
   usar essa história não percebe diferença.
4. Na tela de contrato de uma empresa específica (`CompanyContractScreen`), o admin passa a ver
   um seletor: "Tabela vigente (padrão)" ou uma das tabelas marcadas como alternativa/
   promocional. Ao escolher uma delas, o `CompanyPlan` daquela empresa passa a referenciar essa
   tabela em vez da vigente.
5. Na **renovação** (`POST /plan/renew`), o admin agora escolhe manualmente qual tabela usar —
   a vigente ou qualquer alternativa/promocional disponível no momento. Sem escolha explícita,
   o comportamento padrão continua sendo a tabela `active` (mesmo resultado de hoje).
6. O admin pode reverter a qualquer momento, escolhendo a tabela vigente na próxima renovação
   ou atualização manual do plano.

### Fluxos alternativos / exceções
- Tentar marcar uma tabela em `draft` como alternativa/promocional → bloqueado (precisa ter sido
  ativada ao menos uma vez — tabela nunca testada em produção não deveria virar opção pra
  cliente nenhum).
- Desmarcar "alternativa/promocional" de uma tabela já vinculada a algum `CompanyPlan` →
  permitido; não desfaz vínculos existentes, só impede que ela seja escolhida em **novas**
  atribuições ou renovações (mesma filosofia do `editable` da ORD-162: vínculo existente não
  trava a operação, só a edição do conteúdo).
- Excluir uma tabela marcada como alternativa/promocional mas sem nenhum `CompanyPlan`
  vinculado → permitido, mesma regra de exclusão já existente na ORD-162.
- Tabela marcada como alternativa/promocional e depois **ativada** como a nova vigente →
  continua marcada também (os dois atributos são independentes; não há motivo pra remover
  automaticamente).
- Renovar um plano sem informar explicitamente qual tabela usar → cai no padrão (`active`),
  idêntico ao comportamento já existente na ORD-163.

### Dependências
- Serviços envolvidos: **company-service** (mesmo local de `PriceTable`/`CompanyPlan`, ORD-162/163).
- Histórias bloqueantes: **ORD-162** (Ready, mergeada em `main`) e **ORD-163** (PR aberta —
  precisa estar mergeada antes desta, já que ORD-164 estende exatamente os endpoints de
  `CompanyPlan` criados nela).

### Critérios de aceite funcionais
- [ ] Admin ou Super Admin pode marcar/desmarcar uma tabela `active` ou `historical` com
  `kind`: `"alternativa"` ou `"promocional"`, independente da tabela vigente atual.
- [ ] Tabelas em `draft` não podem receber `kind`.
- [ ] Várias tabelas podem estar marcadas (em qualquer combinação de `kind`) ao mesmo tempo.
- [ ] Criar empresa continua usando a tabela `active` automaticamente — comportamento
  inalterado para quem não usa a feature.
- [ ] Admin consegue, na tela de contrato de uma empresa, escolher explicitamente uma tabela
  alternativa/promocional para aquele contrato específico.
- [ ] Admin consegue, na renovação, escolher manualmente entre a vigente e qualquer
  alternativa/promocional disponível; sem escolha explícita, cai no padrão (`active`).
- [ ] Escolher uma tabela alternativa/promocional para uma empresa não altera qual tabela é a
  `active` padrão para as demais.
- [ ] Marcar/desmarcar `kind` não interfere na regra de edição (`editable`) ou nos vínculos já
  existentes da ORD-162.

### Wireframe / Mockup
Reaproveita telas existentes, sem tela nova:
- `PriceTableListScreen` — nova badge por linha mostrando o `kind` ("Alternativa" /
  "Promocional"), além do status existente (Rascunho/Vigente/Histórica).
- `CompanyContractScreen` — o bloco "Plano comercial" (ORD-163) troca o texto fixo da tabela
  vigente por um seletor (vigente, pré-selecionada, ou uma das marcadas), tanto na atribuição
  quanto na renovação.

## QA Explorer

> Cobertura: marcação de `kind` (CRUD), impacto zero na criação de empresa, renovação com
> escolha manual vs. padrão, isolamento entre `kind` e a regra `editable` já existente na
> ORD-162, e controle de acesso. `PriceTable` não tem `company_id` (é global da plataforma,
> decisão já tomada na ORD-162) — por isso não há cenário de isolamento multi-tenant sobre a
> tabela em si; o isolamento relevante aqui é de **papel** (só Admin/Super Admin) e o já
> existente por empresa sobre o `CompanyPlan` (ORD-163).

```gherkin
Feature: Tabelas de preço alternativas e promocionais
  Como Admin ou Super Admin da plataforma
  Quero marcar tabelas de preço como "alternativa" ou "promocional"
  Para aplicar condições comerciais diferentes em contratos específicos
  sem afetar a tabela vigente usada por padrão nos demais contratos

  Background:
    Dado que existe uma tabela de preço "Tabela Vigente" com status "active"
    E existe uma empresa "Burger House" com um CompanyPlan vinculado à "Tabela Vigente"

  # ── Marcação de kind ────────────────────────────────────────────────────

  Scenario: Super Admin marca uma tabela ativa como alternativa
    Dado que existe uma tabela de preço "Tabela Negociada" com status "active" e kind nulo
    Quando o Super Admin define kind="alternativa" para "Tabela Negociada"
    Então a resposta tem status 200
    E "Tabela Negociada" passa a ter kind="alternativa"
    E "Tabela Vigente" continua sendo a única tabela com status "active"

  Scenario: Admin marca uma tabela histórica como promocional
    Dado que existe uma tabela de preço "Tabela Antiga" com status "historical" e kind nulo
    Quando o Admin define kind="promocional" para "Tabela Antiga"
    Então a resposta tem status 200
    E "Tabela Antiga" passa a ter kind="promocional", mantendo status "historical"

  Scenario: Bloqueado marcar kind em tabela em rascunho
    Dado que existe uma tabela de preço "Tabela Nova" com status "draft"
    Quando o Super Admin tenta definir kind="alternativa" para "Tabela Nova"
    Então a resposta tem status 422
    E o corpo da resposta menciona que a tabela precisa ter sido ativada antes

  Scenario: Múltiplas tabelas com kind simultâneo, em categorias diferentes
    Dado que existe "Tabela A" com status "historical" e kind="alternativa"
    E existe "Tabela B" com status "active" e kind nulo
    Quando o Admin define kind="promocional" para "Tabela B"
    Então tanto "Tabela A" (kind="alternativa") quanto "Tabela B" (kind="promocional")
      aparecem simultaneamente na listagem com seus respectivos kinds
    E "Tabela Vigente" do Background permanece sem kind, inalterada

  Scenario: Desmarcar kind de tabela sem vínculo nenhum
    Dado que existe "Tabela Livre" com status "historical" e kind="promocional"
    E "Tabela Livre" não está vinculada a nenhum CompanyPlan
    Quando o Admin remove o kind de "Tabela Livre" (kind=null)
    Então a resposta tem status 200
    E "Tabela Livre" passa a ter kind nulo

  Scenario: Desmarcar kind de tabela já vinculada a um CompanyPlan não desfaz o vínculo
    Dado que existe "Tabela Promo Ativa" com status "historical" e kind="promocional"
    E a empresa "Sweet Corner" tem um CompanyPlan vinculado a "Tabela Promo Ativa"
    Quando o Admin remove o kind de "Tabela Promo Ativa" (kind=null)
    Então a resposta tem status 200
    E o CompanyPlan de "Sweet Corner" continua referenciando "Tabela Promo Ativa" normalmente
    E "Tabela Promo Ativa" deixa de aparecer como opção para NOVAS atribuições/renovações

  # ── Isolamento entre kind e a regra `editable` da ORD-162 ──────────────

  Scenario: Marcar kind não altera a editabilidade de uma tabela sem vínculo
    Dado que existe "Tabela Livre" com status "active" e kind nulo
    E "Tabela Livre" não está vinculada a nenhum CompanyPlan
    Quando o Admin define kind="alternativa" para "Tabela Livre"
    Então "Tabela Livre" continua com editable=true (regra inalterada da ORD-162)

  Scenario: Tabela com kind e vinculada continua bloqueada para edição de conteúdo
    Dado que existe "Tabela Promo Vinculada" com status "historical", kind="promocional"
    E "Tabela Promo Vinculada" está vinculada ao CompanyPlan de "Sweet Corner"
    Quando o Admin tenta editar o conteúdo (preços/faixas) de "Tabela Promo Vinculada"
    Então a resposta tem status 409
    E o motivo do bloqueio é o vínculo existente — não o kind

  Scenario: Excluir tabela com kind e sem vínculo é permitido
    Dado que existe "Tabela Promo Livre" com status "historical", kind="alternativa"
    E "Tabela Promo Livre" não está vinculada a nenhum CompanyPlan
    Quando o Admin exclui "Tabela Promo Livre"
    Então a resposta tem status 204

  Scenario: Excluir tabela com kind mas vinculada é bloqueado
    Dado que existe "Tabela Promo Vinculada" com kind="promocional" vinculada a um CompanyPlan
    Quando o Admin tenta excluir "Tabela Promo Vinculada"
    Então a resposta tem status 409

  Scenario: Ativar uma tabela marcada como alternativa preserva o kind
    Dado que existe "Tabela Alt Rascunho" com status "draft"
    E o Admin já ativou "Tabela Alt Rascunho" uma vez, tornando-a "historical" depois de
      substituída, e marcou kind="alternativa"
    Quando o Admin ativa "Tabela Alt Rascunho" novamente como a nova tabela vigente
    Então "Tabela Alt Rascunho" passa a ter status "active"
    E mantém kind="alternativa" (os dois atributos não se sobrescrevem)

  # ── Criação de empresa — comportamento inalterado ──────────────────────

  Scenario: Criar empresa nova ignora tabelas com kind e usa a vigente automaticamente
    Dado que existe "Tabela Vigente" (status "active", kind nulo)
    E existe "Tabela Promo" (status "historical", kind="promocional")
    Quando o Super Admin cria uma nova empresa "Pizza Express" sem informar nenhuma tabela
    Então o CompanyPlan de "Pizza Express" é criado vinculado à "Tabela Vigente"
    E "Tabela Promo" não é considerada em nenhum momento desse fluxo

  # ── Renovação — escolha manual vs. padrão ──────────────────────────────

  Scenario: Renovar plano sem informar tabela mantém o comportamento padrão (usa a vigente)
    Dado que o CompanyPlan de "Burger House" está vinculado à "Tabela Vigente"
    E existe "Tabela Promo" (status "historical", kind="promocional")
    Quando o Admin chama POST /companies/{id}/plan/renew sem informar price_table_id
    Então a resposta tem status 200
    E o CompanyPlan de "Burger House" é renovado apontando para a "Tabela Vigente" atual
    E expires_at é adiado em 365 dias a partir de agora

  Scenario: Renovar plano escolhendo explicitamente uma tabela promocional
    Dado que existe "Tabela Promo" (status "historical", kind="promocional")
    E o CompanyPlan de "Burger House" está vinculado à "Tabela Vigente"
    Quando o Admin chama POST /companies/{id}/plan/renew informando
      price_table_id="Tabela Promo"
    Então a resposta tem status 200
    E o CompanyPlan de "Burger House" passa a referenciar "Tabela Promo"
    E expires_at é adiado em 365 dias a partir de agora
    E a "Tabela Vigente" continua sendo a `active` para as demais empresas

  Scenario: Renovar escolhendo uma tabela sem kind e que não é a vigente é bloqueado
    Dado que existe "Tabela Órfã" (status "historical", kind nulo)
    Quando o Admin chama POST /companies/{id}/plan/renew informando
      price_table_id="Tabela Órfã"
    Então a resposta tem status 422
    E o corpo da resposta explica que a tabela precisa ser a vigente ou ter um kind definido

  Scenario: Renovar escolhendo uma tabela em rascunho é bloqueado
    Dado que existe "Tabela Rascunho" com status "draft"
    Quando o Admin chama POST /companies/{id}/plan/renew informando
      price_table_id="Tabela Rascunho"
    Então a resposta tem status 422

  Scenario: Desmarcar o kind de uma tabela não afeta planos que já a usam, mas bloqueia
    novas escolhas dela na renovação
    Dado que o CompanyPlan de "Sweet Corner" está vinculado à "Tabela Promo Ativa"
      (kind="promocional")
    Quando o Admin remove o kind de "Tabela Promo Ativa"
    E depois disso tenta renovar o CompanyPlan de uma OUTRA empresa escolhendo
      price_table_id="Tabela Promo Ativa"
    Então essa segunda tentativa retorna 422
    E o CompanyPlan de "Sweet Corner" continua intacto, sem ser afetado pela remoção do kind

  # ── Atribuição direta no contrato (fora do ciclo de renovação) ─────────

  Scenario: Admin aplica uma tabela alternativa ao contrato de uma empresa fora do ciclo de renovação
    Dado que existe "Tabela Negociada" (status "active", kind="alternativa")
    E o CompanyPlan de "Burger House" está vinculado à "Tabela Vigente", com expires_at
      em 200 dias
    Quando o Admin aplica "Tabela Negociada" ao contrato de "Burger House" pela tela de
      contrato, sem executar uma renovação
    Então o CompanyPlan de "Burger House" passa a referenciar "Tabela Negociada"
    E expires_at permanece inalterado (não é uma renovação, só troca de tabela)

  # ── Controle de acesso ──────────────────────────────────────────────────

  Scenario: Owner da empresa não pode marcar kind em tabela de preço
    Quando o Owner de "Burger House" tenta definir kind="alternativa" numa tabela de preço
    Então a resposta tem status 403

  Scenario: Sem token não pode marcar kind nem renovar com escolha manual
    Quando uma requisição sem token tenta definir kind numa tabela de preço
    Então a resposta tem status 401
    Quando uma requisição sem token tenta renovar um CompanyPlan com price_table_id explícito
    Então a resposta tem status 401

  Scenario: Owner da empresa não pode escolher tabela na renovação do próprio plano
    Quando o Owner de "Burger House" chama POST /companies/{id}/plan/renew
      informando price_table_id
    Então a resposta tem status 403
```

### Cenários revisados e aprovados pelo PM
Cobertura validada contra os critérios de aceite funcionais e os fluxos alternativos/exceções
do Explorer — nenhum critério ficou sem cenário correspondente. Dois pontos merecem atenção
específica no Tech Explorer, por não estarem 100% especificados no Explorer:
- O erro 422 de "renovar escolhendo tabela sem kind e que não é vigente" pressupõe uma
  validação nova no `price_table_id` do `renew` — não existia antes (o endpoint não recebia
  esse campo). Precisa decidir o schema exato da requisição.
- O cenário de "atribuição direta no contrato fora do ciclo de renovação" assume que existe
  (ou vai existir) uma forma de trocar a tabela do `CompanyPlan` **sem** mexer em `expires_at` —
  hoje o único endpoint que grava `price_table_id` é o `renew`, que sempre adianta a data. Isso
  precisa ser resolvido no Tech Explorer: endpoint novo, ou o `renew` ganha um modo
  "sem renovar data" quando só a tabela muda?

## Tech Explorer

### Serviços impactados
- **company-service**: novo campo `kind` em `PriceTable`; novo endpoint de marcação de `kind`;
  `POST /companies/{id}/plan/renew` estendido para aceitar `price_table_id` opcional; endpoint
  novo `PATCH /companies/{id}/plan` para troca de tabela sem afetar `expires_at`.
- **frontend/admin**: `PriceTableListScreen` (badge/ação de `kind`), `CompanyContractScreen`
  (seletor de tabela + duas ações: "Renovar" e "Aplicar tabela").

### Decisão 1 — schema do `renew`
`POST /companies/{id}/plan/renew` passa a aceitar body opcional:
```json
{ "price_table_id": 42 }
```
Se omitido ou `null`: comportamento atual, inalterado (usa a tabela `active`). Se informado,
valida via helper novo `_validate_plan_price_table_choice(db, price_table_id)`:
1. Busca a `PriceTable` por id — 404 se não existir.
2. Aceita se `price_table.id == active_table.id` OU `price_table.kind is not None`.
3. Rejeita com 422 nos demais casos (`draft`, ou `historical`/`active` sem `kind`).

Esse helper é compartilhado com a Decisão 2 abaixo — mesma regra de "tabela válida para uso em
contrato" nos dois endpoints, sem duplicar lógica.

### Decisão 2 — "aplicar tabela sem renovar"
**Endpoint novo**, em vez de flag no `renew`. Motivo: `renew` sempre adianta `expires_at` — dar
um flag pra ele "não renovar" contradiz o próprio nome do endpoint e cria risco de uso
acidental (esquecer o flag = renovar quando só queria trocar a tabela). Um endpoint dedicado
deixa a intenção explícita na própria rota, seguindo o padrão REST já usado no recurso
`/companies/{id}/plan`:

```
PATCH /companies/{company_id}/plan
```
**Auth:** JWT obrigatório · role: `admin` / `super_admin` (mesmo `_require_platform_admin` já
usado no `renew` e no CRUD de `price-tables` — não é um endpoint com escopo por tenant, é ação
de plataforma sobre o contrato de uma empresa, mesma natureza do `renew` já existente).

Request:
```json
{ "price_table_id": 42 }
```
(`price_table_id` obrigatório aqui — diferente do `renew`, onde é opcional.)

Response 200 — `CompanyPlanOut` (mesmo shape já usado no `GET /companies/{id}/plan`), com
`price_table_id` atualizado e **`started_at`/`expires_at`/`renewed_at` inalterados**.

Erros: `400` (`price_table_id` ausente ou tipo inválido) · `401` (sem token) · `403` (role
insuficiente) · `404` (empresa ou tabela não encontrada, ou empresa sem `CompanyPlan`) · `422`
(tabela não é a `active` nem tem `kind` definido — mesma validação da Decisão 1).

### Endpoint novo — marcar/desmarcar `kind`
```
PATCH /commercial/price-tables/{id}/kind
```
**Auth:** JWT obrigatório · role: `admin` / `super_admin` (`_require_platform_admin`).

Request:
```json
{ "kind": "alternativa" }
```
Aceita `"alternativa"`, `"promocional"` ou `null` (pra desmarcar). Validado via Pydantic
`Literal["alternativa", "promocional"] | None` no schema `PriceTableKindIn`.

Response 200 — `PriceTableOut` atualizado (já inclui `kind` no payload, ver schema abaixo).

Erros: `401` · `403` · `404` (tabela não encontrada) · `422` (tabela com `status="draft"` —
mensagem explicando que precisa ter sido ativada antes).

Importante: **nenhuma validação de vínculo aqui** — marcar/desmarcar `kind` não depende de
`_price_table_has_linked_plans`. Isso é intencional (decisão do Explorer): `kind` e `editable`
são atributos independentes, e o cenário do QA Explorer confirma que desmarcar `kind` de uma
tabela vinculada é permitido e não desfaz o vínculo existente.

### Endpoints alterados (schemas)
- `PriceTableOut` / `PriceTableSummaryOut`: adiciona `kind: Literal["alternativa", "promocional"] | None`.
- `GET /commercial/price-tables`: nenhuma mudança de lógica — `kind` é coluna direta da tabela,
  não precisa do batch-fetch que `editable` já usa (esse continua igual, calculado só a partir
  de `company_plans`).

### Migrations
- `services/company/migrations/versions/YYYYMMDD_HHMM_price_table_kind.py`: adiciona coluna
  `kind` (`VARCHAR(20)`, nullable, sem default) em `price_tables`. Idempotente via
  `inspector.get_columns("price_tables")`, seguindo a convenção já usada nas migrations da
  ORD-162/163. Sem índice — filtro por `kind` é sempre dentro de uma listagem já pequena
  (tabelas de preço da plataforma, não é uma tabela de alto volume).

### Impacto em outros serviços
Nenhum — tudo contido no company-service, mesmo módulo da ORD-162/163. Nenhuma chamada nova
entre serviços.

### Eventos de fila
Não aplicável — mesma decisão da ORD-162/163 (CRUD administrativo, sem necessidade de evento
assíncrono).

### Frontend
- **`PriceTableListScreen`**: nova coluna/badge mostrando `kind` quando não-nulo ("Alternativa"
  / "Promocional"). Em tabelas com `status !== "draft"`, novo controle (dropdown ou 3 botões:
  Nenhum/Alternativa/Promocional) chamando `PATCH /commercial/price-tables/{id}/kind`.
- **`CompanyContractScreen`**: o bloco "Plano comercial" (ORD-163) ganha um seletor de tabela
  (opções: tabela vigente + tabelas com `kind` setado, buscadas via `GET
  /commercial/price-tables` filtrando client-side por `status==="active" || kind != null`) e
  **duas ações separadas**, mapeando 1:1 pros dois endpoints:
  - **"Renovar plano"** → `POST /plan/renew` com a tabela selecionada (ou omitida = vigente) —
    sempre adianta `expires_at` em 365 dias. Copy atualizada pra deixar claro que adianta a
    data.
  - **"Aplicar tabela"** (novo botão, secundário) → `PATCH /plan` com a tabela selecionada —
    copy explícita: "troca a tabela sem alterar o vencimento do contrato".
- **`types.ts`**: adiciona `PriceTableKind = "alternativa" | "promocional" | null` e o campo em
  `PriceTable`/`PriceTableSummary`.
- **`api/companies.ts`**: adiciona `applyCompanyPlanTable(companyId, priceTableId)` (PATCH) ao
  lado do já existente `renewCompanyPlan`.

### Estimativa
- Backend: ~5h (migration + 2 endpoints alterados/novos + helper compartilhado de validação +
  testes unitários/integração cobrindo os 20 cenários do QA Explorer).
- Frontend: ~4h (badge + controle de kind na lista, seletor + duas ações no contrato, tipos e
  chamadas de API).

### Riscos
- **Corrida entre desmarcar `kind` e usar a tabela num `renew`/`PATCH /plan` concorrente**: a
  validação (Decisão 1/2) lê `kind` dentro da mesma transação que grava a mudança no
  `CompanyPlan` — suficiente pra evitar a janela de corrida sem precisar de `SELECT FOR UPDATE`
  adicional (diferente do `activate_price_table` da ORD-162, que protege uma invariante
  "só uma ativa" entre múltiplas linhas; aqui não há invariante multi-linha, só uma leitura e
  validação pontual).
- **Confusão de UX entre "Renovar" e "Aplicar tabela"**: mitigado com copy explícita nos dois
  botões (ver seção Frontend) — nenhum dos dois deveria ser ambíguo sobre o que acontece com
  `expires_at`.
- **`kind` e `status` divergirem com o tempo** (ex: uma tabela `active` marcada como
  `"alternativa"` — semanticamente redundante, já é a padrão): não é tratado como erro — a
  decisão do Explorer foi que os dois atributos são independentes de propósito, então permitir
  essa combinação é aceitável; não vale adicionar validação cruzada pra impedir algo que não
  causa dano real ao sistema.

## Ready

Checklist completo verificado — **ORD-164 está Ready**.

- **Explorer**: história no formato Como/Quero/Para ✓ · contexto e motivação ✓ · fluxo
  principal passo a passo ✓ · dependências identificadas (ORD-162, ORD-163) ✓ · wireframe
  (reaproveita `PriceTableListScreen` e `CompanyContractScreen`, sem tela nova) ✓ · critérios de
  aceite funcionais ✓ · as 4 decisões de negócio (renovação com escolha manual, controle manual
  sem expiração própria, acesso admin+superadmin, campo `kind` com duas categorias) resolvidas
  com o usuário e registradas.
- **QA Explorer**: 20 cenários Gherkin — happy path, bordas (draft bloqueado, kind sem vínculo,
  desmarcação não desfaz vínculo), erros (422/403/401), e o isolamento relevante pro caso
  (`PriceTable` é global da plataforma — sem `company_id` — então o isolamento é de **papel**:
  owner 403, sem token 401; o isolamento por empresa do `CompanyPlan` já é coberto pela
  ORD-163). Os dois pontos que ficaram abertos para o Tech Explorer (schema do `renew` e
  "aplicar sem renovar") foram resolvidos e voltam a fechar o ciclo aqui.
- **Tech Explorer**: serviços impactados ✓ · dois endpoints alterados/novos com payload
  completo (`PATCH /commercial/price-tables/{id}/kind`, `POST /plan/renew` estendido, `PATCH
  /companies/{id}/plan` novo) ✓ · migration descrita (`kind` nullable, sem índice) ✓ · filas: não
  aplicável, justificado ✓ · estimativa (~5h backend, ~4h frontend) ✓ · riscos identificados e
  com mitigação (corrida de validação, confusão de UX, divergência kind/status) ✓.

### ⚠️ Bloqueio de sequenciamento — não é bloqueio do upstream
ORD-164 está Ready, mas **não pode entrar em Código (To Do → In Progress) antes da PR #130
(ORD-163) ser mergeada em `main`** — confirmado agora via `gh pr view 130`: ainda `OPEN`, não
mergeada. ORD-164 estende diretamente os endpoints de `CompanyPlan` criados por ela
(`/companies/{id}/plan/renew`, `/companies/{id}/plan`). Isso é uma dependência de ordem de
sprint, não uma lacuna de análise — a história pode ser priorizada no backlog já como Ready,
mas o Dev só deve criar a branch (`docs/WORKFLOW.md` — step To Do) depois do merge da ORD-163.

✅ História priorizada no sprint backlog — condicionada ao merge da ORD-163.

## In Progress / Code Review / Merge

Implementada em `feature/ORD-164-tabelas-preco-alternativas`, PR
[#131](https://github.com/harryjanz/ordin/pull/131). Code Review encontrou e corrigiu 1 bug
antes do merge: o botão "Renovar plano" tinha ficado condicionado a `availableTables.length >
0` — regressão sobre o comportamento incondicional já existente desde a ORD-163 (commit
`6e6110e`). CI 100% verde, mergeada em `main` (`3b9af64`), branch deletada.

## QA

Validação manual local (sem staging), superadmin, stack rebuildada (`docker compose up -d
--build company-service admin`) a partir do `main` pós-merge. Evidências em
`docs/stories/ORD-164/evidencias/manual/`.

| # | Cenário (QA Explorer) | Resultado |
|---|---|---|
| 1 | Marcar tabela `active` como alternativa | ✅ `01-marcar-alternativa-lista.jpg` |
| 2 | Bloqueado marcar `kind` em rascunho | ✅ confirmado visualmente — linha em rascunho não exibe o seletor de categoria |
| 3 | Ativar tabela marcada como alternativa preserva o `kind` (inclusive ao ser **demovida** de `active` pra `historical`, cenário mais forte que o do QA Explorer original) | ✅ `02-preserva-kind-ao-ativar-outra-e-troca-promocional.jpg` |
| 4 | Recategorizar `kind` (alternativa → promocional) | ✅ mesma evidência #3 |
| 5 | Seletor de tabela no contrato mostra vigente + marcadas, com sufixo correto (vigente/alternativa/promocional) | ✅ |
| 6 | Aplicar tabela sem renovar — `expires_at`/`renewed_at` inalterados | ✅ `03-aplicar-tabela-sem-alterar-vencimento.jpg` — toast "vencimento do contrato não foi alterado", data idêntica antes/depois |
| 7 | Renovar escolhendo explicitamente uma tabela promocional | ✅ `04-renovar-com-escolha-manual-tabela-promocional.jpg` — `expires_at` avançou 365 dias, `renewed_at` atualizado |
| 8 | Desmarcar `kind` de tabela vinculada não desfaz o vínculo do `CompanyPlan` existente | ✅ `05-desmarcar-kind-lista.jpg` / `06-desmarcar-kind-nao-desfaz-vinculo-plano.jpg` |
| 9 | Renovar/aplicar com tabela sem `kind` e não-vigente → 422 | ✅ validado pela suíte automatizada (`test_renovar_escolhendo_tabela_sem_kind_e_nao_vigente_bloqueado`, `test_aplicar_tabela_invalida_bloqueado`) — não repetido manualmente por não ser alcançável pela UI (o seletor só lista tabelas elegíveis) |
| 10 | Controle de acesso (owner → 403) | ✅ validado pela suíte automatizada |

### 🐛 Bug encontrado no QA — corrigido

**Cenário**: desmarcar o `kind` de uma tabela que está atualmente vinculada ao `CompanyPlan` de
uma empresa (permitido, não desfaz o vínculo — item 8 acima) e, **sem tocar no seletor**,
clicar em "Renovar plano".

**Esperado** (critério de aceite da ORD-164): renovar sem escolha explícita cai no padrão (usa
a tabela `active`).

**Obtido**: erro 422 — `07-BUG-renovar-com-selecao-obsoleta.jpg`. Causa raiz: o estado
`selectedTableId` no `CompanyContractScreen` é inicializado com o id da tabela **já vinculada
ao plano**, independente de ela continuar elegível. Ao desmarcar o `kind`, a tabela vinculada
deixa de ser elegível, mas o front continuava mandando esse id "obsoleto" pro
`POST /plan/renew` — nunca de fato exercitava o caminho "sem `price_table_id`, backend usa a
`active`", mesmo quando o admin não tinha tocado em nada.

**Correção** (`frontend/admin/src/screens/CompanyContractScreen.tsx`, `renewPlan()`): só envia
`price_table_id` se `selectedTableId` estiver de fato presente em `availableTables` no momento
do clique; caso contrário, omite o campo e deixa o backend aplicar o padrão. Revalidado
end-to-end — `08-bug-corrigido-renovar-cai-no-padrao.jpg`: mesmo cenário, agora renova
corretamente usando a tabela vigente, sem erro.

PR de correção: [#132](#) *(preencher após abrir)*.

### Fluxos críticos de regressão
Não aplicável a esta história — não mexe no fluxo PIN → pedido → pagamento → coleta, rate
limiting, dupla coleta ou cancelamento. Escopo é só o módulo comercial (`price_tables` /
`company_plans`) do company-service.

### Critério de saída
- [x] Todos os cenários do QA Explorer executados (manual + suíte automatizada)
- [x] Happy path, bordas e erros passando
- [x] Isolamento por papel passando (owner → 403; `PriceTable` não tem isolamento multi-tenant por ser recurso global da plataforma, conforme já justificado no QA Explorer)
- [x] Regressão nos fluxos críticos — não aplicável, fora do escopo desta história
- [x] Evidências salvas em `docs/stories/ORD-164/evidencias/manual/`
- [ ] Nenhum bug bloqueador em aberto — **1 bug encontrado e corrigido durante este QA**, aguardando merge da PR de correção antes de fechar definitivamente o step
