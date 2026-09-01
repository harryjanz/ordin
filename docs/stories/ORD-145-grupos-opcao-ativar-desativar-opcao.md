---
id: ORD-145
status: Ready
fase: 6
sprint: null
responsavel: Backend
estimativa: 5 pontos (2 backend + 3 frontend)
tipo: feature
---

# ORD-145 — Grupos de opção: ativar/desativar opção individual

## Descrição
`Option` (ORD-138) é a única entidade do domínio de catálogo sem campo `active` — `Category`, `Product`, `Menu` e o próprio `OptionGroup` já seguem esse padrão (ativo/inativo + ação Ativar/Desativar), mas uma opção dentro de um grupo (ex.: "Coca-Cola" dentro de "Sabores de refrigerante", "Calabresa" dentro de "Sabores de pizza") não pode ser desativada individualmente hoje — só existe editar (via replace completo do grupo) ou remover.

Esta história adiciona a capacidade de marcar uma opção específica como indisponível temporariamente, sem excluí-la (ela pode voltar) e sem mexer no grupo inteiro nem no produto inteiro. Precisa estar acessível em dois lugares: na tela de gestão do grupo (Catálogo > Opções, ORD-139) e na tela de edição do produto (`ProductEditScreen`, onde as opções aparecem como pills dentro do card do grupo vinculado, ORD-140).

## Persona
Owner/manager da empresa, durante a operação do dia a dia (não é um cadastro inicial — é uma reação a um evento de estoque/produção).

## Contexto
Motivada por um cenário de negócio concreto levantado pelo usuário: "imagine o cenário onde um refrigerante lata acaba no estoque ou um sabor de pizza não pode ser produzido por falta de ingredientes, é necessário poder inativar". A indisponibilidade é de UMA opção específica dentro de um grupo compartilhado — desativar o grupo inteiro (ex.: "Sabores de pizza") seria desproporcional (todos os outros sabores continuam disponíveis), e não vincular/desvincular o grupo do produto não resolve nada (o problema é a opção, não o vínculo).

Sem isso, a única forma de tirar uma opção de circulação hoje é editar a lista de opções do grupo (replace completo, ORD-138) removendo-a — o que perde o histórico da opção (imagem teria que ser recadastrada quando o item voltar ao estoque) e é desproporcional pra uma indisponibilidade que pode durar só algumas horas.

---

## Explorer

## História
Como **owner/manager da empresa**, quero marcar uma opção específica dentro de um grupo como indisponível temporariamente (e reverter depois), sem afetar as demais opções do grupo nem precisar desvincular nada, para reagir a eventos de estoque/produção (ex.: acabou o refrigerante de um sabor, faltou ingrediente pra uma pizza) sem impacto desproporcional no cardápio.

## Contexto e motivação
`Category`, `Product`, `Menu` e `OptionGroup` já seguem o padrão ativo/inativo com ação reversível — `Option` ficou de fora por ser a entidade mais nova (ORD-138). A lacuna é sentida na operação diária, não no cadastro: um evento de estoque acontece a qualquer momento do turno e precisa de uma reação rápida, sem re-cadastro.

**Decisão técnica central (evita reabrir o problema já resolvido em ORD-138):** a única via hoje pra mudar qualquer coisa numa opção existente é o replace completo (`PUT /catalog/option-groups/{id}/options`), que recria todas as opções do grupo e descarta imagem de quem não foi reenviado. Ativar/desativar é uma ação rápida e frequente (pode acontecer várias vezes por turno) — rotear isso pelo replace completo arriscaria perder imagem de opções não relacionadas só por causa de um toggle de estoque. Por isso, mesmo raciocínio do ORD-144 (PATCH cirúrgico pro override de seleção): endpoint novo e específico só pra isso, sem tocar no resto da opção nem do grupo.

## Fluxo principal
1. Owner percebe que uma opção específica não pode ser vendida agora (ex.: "Guaraná Antarctica" do grupo "Sabores de refrigerante" acabou no estoque)
2. **Caminho A — Catálogo > Opções**: abre o grupo (ORD-139), na lista de opções vê a coluna de Status e clica "Desativar" na linha da opção → confirma num diálogo curto → a linha passa a mostrar "Inativo" e ganha o botão "Ativar" no lugar
3. **Caminho B — edição do produto**: abre um produto que tem esse grupo vinculado (ORD-140), no card do grupo a pill da opção agora é interativa — clica pra desativar → confirma → a pill fica visualmente marcada como inativa (opacidade reduzida) no mesmo card
4. Quando o estoque normaliza, owner reativa pelo mesmo lugar (qualquer um dos dois) — ação direta, sem confirmação
5. A mudança é imediata e não depende de salvar o restante do formulário do grupo ou do produto — é uma chamada própria, direto ao clicar

## Fluxos alternativos / exceções
- **Editar label/preço de uma opção depois de desativar outra do mesmo grupo**: o replace completo disparado por essa edição precisa preservar o `active` de todas as opções, inclusive as não tocadas — `OptionIn` ganha `active: bool = True`, e a tela sempre reenvia o estado atual de cada linha ao montar o payload (não reseta pra ativo por omissão)
- **Desativar a única opção não-obrigatória-mas-única de um grupo `min_selections>=1`**: permitido — a consistência entre "quantas opções ativas existem" e "quantas são exigidas" é responsabilidade do ORD-141 (seleção no totem, ainda não implementado), não desta história
- **Tentar desativar/ativar opção de outro grupo/empresa**: 404, mesmo padrão de isolamento já usado em `_get_option_scoped` (ORD-138)
- **Opção inativa continua aparecendo nas telas de admin**: sim, em ambos os lugares (Catálogo > Opções e produto) — só fica marcada visualmente, nunca escondida, pra permitir reativar

## Dependências
- Serviços envolvidos: **catalog-service** (migration + endpoint novo) e **frontend/admin** (`OptionGroupFormScreen`, `ProductEditScreen`).
- Histórias bloqueantes: **ORD-138** (Ready, modelo de `Option`), **ORD-139** (Ready, tela de gestão do grupo), **ORD-140** (Ready, pills de opção no produto).
- Fora de escopo: ORD-141 (seleção no totem) e ORD-142 (cálculo de preço) — vão nascer já respeitando `active`, sem retrabalho aqui.

## Critérios de aceite funcionais
- [ ] `Option` ganha `active: bool` (default `true`)
- [ ] Endpoint novo pra ativar/desativar UMA opção sem tocar no resto do grupo
- [ ] `OptionIn`/replace completo preserva `active` das opções não alteradas
- [ ] Catálogo > Opções: lista de opções do grupo ganha coluna de Status + ação Ativar/Desativar por linha
- [ ] `ProductEditScreen`: pill de opção fica interativa, com indicação visual de inativa e ação de ativar/desativar
- [ ] Desativar exige confirmação curta (`ConfirmDialog`); ativar é direto
- [ ] Opção inativa continua visível nas telas de admin (nunca escondida), só marcada
- [ ] Isolamento multi-tenant: só altera opção de grupo da própria empresa

## Wireframe / Mockup
Sem protótipo visual formal — descrição funcional:

**Catálogo > Opções (lista de opções dentro do grupo):** mesma tabela de hoje (Opção/Acréscimo/Ações), ganha coluna "Status" com `Tag` "Ativo"/"Inativo" (mesmo componente já usado em Categoria/Produto) e o botão de ação vira "Desativar" (ativo) ou "Ativar" (inativo), ao lado de Editar/Remover.

**ProductEditScreen (pill de opção no card do grupo):** pill ativa continua como hoje (label + acréscimo); pill inativa ganha opacidade reduzida e um indicador visual (ex.: "(indisponível)" ou ícone). Clicar na pill alterna o estado — desativar pede confirmação curta, ativar é direto.

---

## QA Explorer

```gherkin
Feature: Ativar/desativar opção individual dentro de um grupo
  Como owner/manager da empresa
  Quero marcar uma opção específica como indisponível temporariamente, sem afetar as demais
  Para reagir a eventos de estoque/produção sem impacto desproporcional no cardápio

  Background:
    Dado que estou autenticado no admin como owner/manager da empresa "Burger House"
    E existe o grupo "Sabores de refrigerante" com as opções "Coca-Cola", "Fanta Laranja" e "Guaraná Antarctica", todas ativas

  # ---------- Happy path ----------

  Scenario: Desativar uma opção pela tela do grupo (Catálogo > Opções)
    Quando abro o grupo "Sabores de refrigerante" em Catálogo > Opções
    E clico em "Desativar" na linha de "Guaraná Antarctica"
    E confirmo no diálogo
    Então a linha de "Guaraná Antarctica" passa a mostrar status "Inativo"
    E o botão da linha vira "Ativar"
    E "Coca-Cola" e "Fanta Laranja" continuam "Ativo", sem nenhuma mudança

  Scenario: Reativar uma opção é direto, sem confirmação
    Dado que "Guaraná Antarctica" está inativa
    Quando clico em "Ativar" na linha de "Guaraná Antarctica"
    Então o status muda pra "Ativo" imediatamente, sem diálogo de confirmação

  Scenario: Desativar uma opção pela edição do produto
    Dado que o grupo "Sabores de refrigerante" está vinculado ao produto "Refrigerante lata 350ml"
    Quando abro a edição de "Refrigerante lata 350ml" e vejo a pill "Guaraná Antarctica" no card do grupo
    E clico na pill e confirmo a desativação
    Então a pill de "Guaraná Antarctica" aparece marcada como inativa (opacidade reduzida / indicador visual)
    E ao reabrir Catálogo > Opções, a mesma opção também aparece "Inativo" — é o mesmo dado, não uma cópia

  Scenario: Desativar uma opção não afeta as demais do grupo em nenhum produto vinculado
    Dado que "Sabores de refrigerante" está vinculado a dois produtos
    Quando desativo "Guaraná Antarctica"
    Então nos dois produtos a pill de "Guaraná Antarctica" aparece inativa
    E as pills de "Coca-Cola" e "Fanta Laranja" continuam normais nos dois produtos

  # ---------- Bordas ----------

  Scenario: Editar outra opção do mesmo grupo preserva o active da opção desativada
    Dado que "Guaraná Antarctica" está inativa
    Quando edito o label de "Coca-Cola" pra "Coca-Cola Lata" (o que dispara o replace completo das opções do grupo)
    E salvo o grupo
    Então "Guaraná Antarctica" continua "Inativo" depois do replace
    E "Coca-Cola Lata" e "Fanta Laranja" continuam "Ativo"

  Scenario: Cancelar a confirmação de desativar não muda nada
    Quando clico em "Desativar" na linha de "Coca-Cola"
    E clico em "Cancelar" no diálogo de confirmação
    Então "Coca-Cola" continua "Ativo", sem nenhuma chamada de alteração

  # ---------- Erro ----------

  Scenario: Ativar/desativar opção inexistente retorna 404
    Quando tento desativar uma opção com id que não existe
    Então a resposta é 404

  Scenario: Ativar/desativar opção de grupo de outra empresa retorna 404
    Dado que existe uma opção pertencente a um grupo da empresa "Pasta & Co"
    Quando, autenticado como owner de "Burger House", tento desativar essa opção
    Então a resposta é 404

  # ---------- Isolamento multi-tenant ----------

  Scenario: Empresa A não altera active de opção da empresa B
    Dado que a empresa "Pasta & Co" tem uma opção própria, ativa
    Quando, autenticado como owner de "Burger House", tento desativá-la por qualquer id
    Então a operação falha com 404
    E a opção da empresa "Pasta & Co" continua ativa, inalterada

  # ---------- Regressão ----------

  Scenario: Criar grupo com opções novas sem informar active assume ativo por padrão
    Quando crio um novo grupo com 2 opções, sem enviar o campo active em nenhuma
    Então as duas opções são criadas com active=true

  Scenario: Listagem de grupos e de produtos não quebra com o campo novo
    Quando busco GET /catalog/option-groups
    Então cada opção de cada grupo retorna o campo active, sem quebrar os campos já existentes (id, label, price_delta, image_url, thumbnail_url, sort_order)
    Quando busco GET /catalog/products/{id de um produto com grupo vinculado}
    Então as opções dentro de option_groups também retornam active corretamente
```

**Critério de saída atendido:** happy path, bordas, erro, isolamento multi-tenant e regressão cobertos. Pronto para avançar ao Tech Explorer.

---

## Tech Explorer

### Serviços impactados
- **catalog-service**: migration + 1 endpoint novo + 2 ajustes de schema/serialização já existentes (`_get_option_group_options`, `_set_option_group_options`).
- **frontend/admin**: `OptionGroupFormScreen.tsx` (ORD-139) e `ProductEditScreen.tsx` (ORD-140), `types.ts`.

### Migrations
- `options` ganha `active` (Boolean, `nullable=False`, `server_default=sa.true()`) — default garante que toda opção pré-existente (criada antes desta história) já nasce ativa, sem precisar de backfill manual.

### Endpoints

#### PATCH /catalog/options/{option_id}
**Serviço:** catalog-service
**Auth:** JWT obrigatório | role: owner/manager/admin/superadmin (mesmo padrão de escrita em opção já usado em `POST/DELETE /catalog/options/{id}/image`)
**company_id:** extraído do JWT — validado via `_get_option_scoped` (join com `OptionGroup`, já existente desde ORD-138, sem reescrever a lógica de isolamento)

Request:
```json
{ "active": false }
```

Response 200 (`OptionOut`, já com o campo `active`):
```json
{
  "id": 236, "label": "Guaraná Antarctica", "price_delta": 0.0,
  "image_url": null, "thumbnail_url": null, "sort_order": 2, "active": false
}
```

Erros: 404 (opção não existe ou não pertence à empresa)

**Por que não reaproveitar `PUT /catalog/option-groups/{id}/options` (replace completo):** ativar/desativar é ação rápida e frequente (evento de estoque, várias vezes por turno) — o replace completo recria TODAS as opções do grupo e descarta imagem de quem não foi reenviado (efeito colateral já aceito desde ORD-138, mas seria agravado se toda mudança de estoque também passasse por ali). Mesmo raciocínio do PATCH cirúrgico do ORD-144 (override de seleção): uma ação pequena e frequente merece um endpoint pequeno e frequente, sem herdar o raio de efeito do replace.

### Decisões técnicas

**1. `OptionIn.active: bool = True` — preservar estado no replace completo.** Hoje `_set_option_group_options` recria cada `Option` só com `label`/`price_delta`/`sort_order` — se não ler `active` do payload, TODA opção voltaria a "ativa" no próximo replace (ex.: editar o label de "Coca-Cola" reativaria "Guaraná Antarctica" sem ninguém pedir). `OptionIn` ganha `active: bool = True`; `_set_option_group_options` passa a criar `Option(..., active=opt.active)`; o frontend sempre envia o `active` atual de cada linha (não um valor fixo), inclusive das linhas que não foram tocadas nesta edição.

**2. Onde cada tela dispara o quê:**
- **Opção já existente** (tem `id`, veio do backend): clicar Ativar/Desativar chama `PATCH /catalog/options/{id}` **na hora**, independente do botão "Salvar" do grupo/produto — mesmo padrão já usado pra imagem de opção (`POST/DELETE /catalog/options/{id}/image`, ORD-139) e pro máximo por produto (`PATCH` do ORD-144). Atualiza o estado local (`rows` em `OptionGroupFormScreen`, `editProd.option_groups[].options[]` em `ProductEditScreen`) direto da response, sem esperar F5.
- **Opção nova** (ainda não salva, `id === null`, só existe em `OptionGroupFormScreen` antes de clicar "Salvar" do grupo): togglar `active` é só estado local — vai junto no `options` do `POST`/`PUT` quando o grupo for salvo. Não existe esse caso em `ProductEditScreen` (lá as opções sempre já vêm do backend, o produto só READ as opções do grupo vinculado).

**3. `ProductEditScreen` não edita `label`/`price_delta`, só `active`.** As pills de opção no card do grupo vinculado nunca tiveram edição de conteúdo (isso é exclusivo de `OptionGroupFormScreen`/ORD-139) — o clique na pill SÓ alterna `active`, via o mesmo `PATCH` cirúrgico. Não precisa se preocupar com o replace completo nessa tela, porque `ProductEditScreen` nunca chama `PUT /catalog/option-groups/{id}/options`.

### Arquivos modificados
- `services/catalog/main.py`: model `Option` (+`active`), `OptionIn`/`OptionOut` (+`active`), `_get_option_group_options`, `_set_option_group_options`, endpoint novo.
- `services/catalog/migrations/versions/<nova>.py`.
- `frontend/admin/src/screens/OptionGroupFormScreen.tsx`: `OptionRow.active`; `Table` ganha coluna Status + ação Ativar/Desativar; `save()` inclui `active` no payload de cada opção.
- `frontend/admin/src/screens/ProductEditScreen.tsx`: pill de opção interativa + `ConfirmDialog` de desativação (mesmo padrão já usado pra "Desvincular", só que por opção em vez de por grupo).
- `frontend/admin/src/types.ts`: `OptionGroupOption.active: boolean`.

### Impacto em outros serviços
Nenhum. Sem mudança em auth/company/order/payment. `GET /catalog/products` e `GET /catalog/option-groups` continuam retornando o que já retornavam, só com o campo `active` a mais dentro de cada opção — aditivo, não quebra nada existente (mesmo padrão de compatibilidade já seguido em ORD-138/139/144).

### Estimativa
- Backend: **2 pontos** (migration simples, 1 endpoint pequeno, ajuste em 2 funções já existentes)
- Frontend: **3 pontos** (2 telas ganham interação nova + `ConfirmDialog` + wiring de estado local em ambas)

### Riscos
- **Replace completo esquecer de enviar `active`** (bug de regressão futuro, se alguém mexer em `save()` de `OptionGroupFormScreen` sem perceber a dependência): mitigado pelo cenário de QA "editar outra opção do mesmo grupo preserva o `active` da opção desativada" — cobre exatamente esse caso.
- **Pill clicável em `ProductEditScreen` confundir com "Desvincular" o grupo inteiro** (dois níveis de ação parecidos no mesmo card): mitigado por manter a ação de opção restrita à PRÓPRIA pill (não ao card inteiro) e por indicação visual clara (opacidade/rótulo) de que o clique afeta só aquela opção.
- **Opção inativa em grupo `min_selections>=1` sem opções ativas suficientes**: aceito como fora de escopo (nota já no Explorer) — quem resolve isso é ORD-141, ao decidir como o totem se comporta nesse caso.

---

## Ready

Checklist de saída conferido contra o conteúdo já escrito neste arquivo:

**Explorer**
- [x] História no formato Como/Quero/Para
- [x] Contexto e motivação documentados (paridade com Category/Product/Menu/OptionGroup, cenário de estoque do usuário)
- [x] Fluxo principal passo a passo (5 passos, cobrindo os dois caminhos de UI)
- [x] Dependências identificadas (ORD-138/139/140, todas Ready/implementadas; fora de escopo ORD-141/142)
- [x] Wireframe/mockup descrito (coluna Status + ação por linha; pill interativa)
- [x] Critérios de aceite funcionais escritos (8 itens)

**QA Explorer**
- [x] Happy path em Gherkin (4 cenários, cobrindo os dois caminhos de UI e o efeito nos demais produtos vinculados)
- [x] Cenários de borda (2 cenários: replace completo preserva active, cancelar confirmação não muda nada)
- [x] Cenários de erro (2 cenários: opção inexistente, opção de outra empresa)
- [x] Isolamento multi-tenant coberto
- [x] Regressão coberta (criação sem informar active assume true; listagem não quebra)
- [x] Cenários aprovados pelo PM

**Tech Explorer**
- [x] Serviços impactados documentados (catalog-service + frontend/admin)
- [x] Endpoint novo documentado (`PATCH /catalog/options/{option_id}`, request/response/erros, justificativa de não reaproveitar o replace completo)
- [x] Migration descrita (coluna `active` com `server_default`, sem backfill manual necessário)
- [x] "Eventos de fila": N/A — sem impacto assíncrono
- [x] Estimativa definida (5 pontos: 2 backend + 3 frontend)
- [x] Riscos identificados (3, todos com mitigação)

**Aprovação final**
- [x] Time revisou e concordou com a solução técnica (usuário: "aprovado, vamos implementar")
- [x] Estimativa acordada (5 pontos)
- [x] Sem bloqueios não resolvidos
- [x] Priorizada no sprint backlog

**Status final: Ready.**

---

## Correção pós-implementação

Durante o teste manual em browser, o usuário pediu que **ativar também exija confirmação**, não só desativar (Explorer/QA Explorer originais previam ativação direta, sem `ConfirmDialog`, no mesmo padrão de Category/Product). Ajustado nos dois pontos de UI:

- `OptionGroupFormScreen.tsx`: estado `deactivateConfirm`/`confirmDeactivate` generalizado para `toggleConfirm: { row, active }`/`confirmToggle`, cobrindo os dois sentidos. Botão "Ativar" da tabela passou a abrir o mesmo `ConfirmDialog` (título/mensagem/label condicionais a `active`).
- `ProductEditScreen.tsx`: mesmo tratamento — `optionDeactivateTarget` generalizado para `optionToggleTarget: { groupId, option, active }`/`confirmOptionToggle`. Clique na pill (ativa ou inativa) sempre abre confirmação antes de disparar o PATCH.

Sem mudança de contrato do backend (`PATCH /catalog/options/{option_id}` já aceitava `{active: bool}` nos dois sentidos). Reverificado manualmente nas duas telas: desativar e ativar agora pedem confirmação, com título/mensagem corretos por opção, sem afetar outras opções do mesmo grupo. `npx tsc --noEmit` limpo, `npx vitest run` 48/48.
