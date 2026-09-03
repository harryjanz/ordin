---
id: ORD-144
status: Done
fase: 6
sprint: null
responsavel: Backend
estimativa: 5 pontos (3 backend + 2 frontend)
tipo: feature
---

# ORD-144 — Grupos de opção: máximo de seleções customizável por vínculo produto-grupo

## Descrição
Hoje, `min_selections`/`max_selections` são propriedades fixas do grupo de opção (ORD-138/139) — valem igual para todo produto que vincula aquele grupo (ORD-140). Isso quebra num caso de negócio universal em pizzaria: a mesma lista de sabores é compartilhada entre todos os tamanhos (Broto, Pequena, Média, Grande, Big), mas a **quantidade de sabores permitida varia por tamanho** (ex.: Broto = 1 sabor, Big = 4 sabores). Não existe hoje forma de expressar isso sem duplicar o grupo "Sabores" uma vez por tamanho — o que joga fora justamente o ganho de reutilização que ORD-139/140 entregaram.

A solução é mover o "máximo de seleções" de propriedade do **grupo** para propriedade do **vínculo** produto↔grupo: a tabela `product_option_groups` (ORD-138) ganha `min_selections_override`/`max_selections_override`, opcionais — ausentes, usa o padrão do grupo; presentes, sobrescrevem só para aquele produto específico. O mesmo grupo "Sabores" passa a ser vinculado à Pizza Broto com máximo=1, à Pizza Big com máximo=4, sem duplicar nada.

## Persona
Owner/manager de uma pizzaria (ou qualquer empresa com o mesmo padrão — grupo compartilhado, limite variável por produto), cadastrando o catálogo de pizzas por tamanho.

## Contexto
Motivada por feedback direto do usuário durante a revisão do ORD-139/140: "essa regra de tamanho x quantidade de sabores sempre tem em pizzaria, acabo perdendo venda para clientes se não resolver isso" — ou seja, é bloqueador de venda para o segmento de pizzaria, não um ajuste cosmético. Pesquisa de concorrência (`docs/analise-mogo-fluxo-pizza.md`) confirma que o Mogo já resolve exatamente assim: o limite de sabores é uma propriedade do tamanho (produto), não do grupo de sabores em si.

Depende de ORD-138 (schema de `product_option_groups`) e ORD-140 (endpoint de vínculo `PUT /catalog/products/{id}/option-groups`, tela `ProductEditScreen`), ambas Ready/implementadas. Não depende de ORD-141 (seleção no totem) nem ORD-142 (cálculo de preço no pedido) — essas ainda nem foram implementadas e já vão nascer lendo o valor efetivo (override ou padrão) corretamente, sem retrabalho.

---

## Explorer

## História
Como **owner/manager de uma pizzaria** (ou empresa com o mesmo padrão), quero definir um máximo de sabores diferente pra cada tamanho de pizza, mesmo todos compartilhando o mesmo grupo "Sabores", para não perder venda por não conseguir representar essa regra — hoje sou forçado a ou duplicar o grupo por tamanho, ou usar um limite único errado pra pelo menos um dos tamanhos.

## Contexto e motivação
ORD-139/140 entregaram grupos de opção reutilizáveis com um único `max_selections` fixo por grupo, válido pra todo produto vinculado. Isso não representa a regra universal de pizzaria — "quantidade de sabores permite por tamanho" — sem duplicar o grupo "Sabores" uma vez por tamanho (Broto/Pequena/Média/Grande/Big), o que joga fora o ganho de reutilização que era o objetivo central da iniciativa inteira. O usuário classificou isso como bloqueador de venda, não ajuste cosmético: "acabo perdendo venda para clientes se não resolver isso".

A pesquisa de concorrência (`docs/analise-mogo-fluxo-pizza.md`) confirma que o Mogo já resolve exatamente assim — o limite de sabores é uma propriedade do tamanho (produto), não do grupo de sabores. Esta história move `min_selections`/`max_selections` de propriedade do **grupo** pra propriedade opcional do **vínculo** produto↔grupo: quando não configurado, o produto usa o padrão do grupo (comportamento inalterado pra quem não precisa de override); quando configurado, vale só pra aquele produto específico.

## Fluxo principal
1. Owner já tem o grupo "Sabores" cadastrado (ORD-139) e vinculado aos 5 produtos de tamanho de pizza (ORD-140) — cada vínculo, por padrão, usa o `max_selections` do próprio grupo (comportamento atual, sem mudança)
2. Owner abre `ProductEditScreen` do produto "Pizza Broto" e vê, no painel "Opções do produto", o card do grupo "Sabores" mostrando o valor **efetivo** pra aquele produto (= override se houver, senão o padrão do grupo)
3. Clica em "Editar máximo neste produto" no card → informa um valor específico pra este produto (ex.: 1, pra Broto)
4. Confirma → `PATCH /catalog/products/{product_id}/option-groups/{option_group_id}` com `{max_selections_override: 1}` — só esse vínculo específico é atualizado, a lista de grupos vinculados ao produto não muda
5. O card atualiza mostrando o novo valor efetivo (1), distinguível do padrão do grupo (que continua o que estiver configurado em Catálogo > Opções)
6. Owner repete o passo 2-4 pra "Pizza Pequena" (máximo=2), "Pizza Média" (máximo=2), "Pizza Grande" (máximo=3), "Pizza Big" (máximo=4) — cada produto com seu próprio override, mesmo grupo "Sabores" compartilhado, sem duplicar nada
7. Owner pode "Restaurar padrão" num vínculo específico (limpa os overrides, produto volta a usar o padrão do grupo)

## Fluxos alternativos / exceções
- **Override só de min ou só de max**: o campo não sobrescrito usa o padrão do grupo pra compor o par efetivo (ex.: overrideMax=1 sem overrideMin → min efetivo = min padrão do grupo, max efetivo = 1)
- **Min efetivo > max efetivo**: bloqueado (400) — mesma regra de consistência já aplicada ao grupo (ORD-138), agora aplicada ao par calculado (override combinado com o padrão do que não foi sobrescrito)
- **Restaurar padrão**: `PATCH` com `{min_selections_override: null, max_selections_override: null}` — remove os dois overrides, volta a usar o padrão do grupo
- **Editar o padrão do grupo depois de já existirem overrides por produto**: não afeta os overrides já configurados (eles são independentes do padrão) — só afeta produtos que ainda usam o padrão sem override
- **Desvincular o grupo do produto** (ORD-140, `PUT` existente): remove a linha de `product_option_groups` inteira, overrides incluídos — comportamento já existente, sem mudança
- **`GET /catalog/option-groups`** (listagem/edição do grupo, ORD-139): não muda — continua mostrando só o padrão do grupo, sem contexto de produto

## Dependências
- Serviços envolvidos: **catalog-service** (novo endpoint `PATCH /catalog/products/{product_id}/option-groups/{option_group_id}`, alteração em `_serialize_option_group`/`_get_product_option_groups` só no contexto de `ProductOut`) e **frontend/admin** (`ProductEditScreen`).
- Histórias bloqueantes: **ORD-138** (Ready, schema de `product_option_groups`), **ORD-140** (Ready, tela e vínculo produto↔grupo).
- Sem dependência de ORD-141/142/143 — essas ainda não implementadas, vão consumir o valor efetivo quando forem construídas.
- Não altera `PUT /catalog/products/{id}/option-groups` (replace completo da lista de vínculos) nem os testes/contrato já existentes do ORD-140 — endpoint novo e cirúrgico, raio de impacto mínimo.

## Critérios de aceite funcionais
- [ ] `product_option_groups` ganha `min_selections_override`/`max_selections_override` (nullable)
- [ ] Novo endpoint `PATCH /catalog/products/{product_id}/option-groups/{option_group_id}` atualiza só o override daquele vínculo, sem tocar na lista de vínculos
- [ ] `ProductOut.option_groups[]` expõe `min_selections_override`/`max_selections_override` além de `min_selections`/`max_selections` (padrão do grupo, inalterado)
- [ ] `GET /catalog/option-groups` (fora do contexto de produto) não expõe nem é afetado por overrides
- [ ] Min efetivo > max efetivo é bloqueado (400), considerando override combinado com o padrão do campo não sobrescrito
- [ ] `ProductEditScreen`: card de grupo vinculado mostra o valor efetivo (override ou padrão) e permite editá-lo especificamente pra aquele produto
- [ ] Ação de "Restaurar padrão" limpa os dois overrides do vínculo
- [ ] Isolamento multi-tenant: só é possível sobrescrever vínculo de produto/grupo da própria empresa

## Wireframe / Mockup
Sem protótipo visual formal — descrição funcional:

**Card de grupo vinculado (painel "Opções do produto"):** mesma estrutura já existente (nome, badges Obrigatório/Opcional e Única/Múltipla, pills de opção, botão Desvincular) — badges agora refletem o valor **efetivo** pra aquele produto. Novo botão/link "Editar máximo neste produto" abre um campo numérico pequeno (mesmo `NumberSpinInput` já usado em ORD-139) inline ou em popover, com "Salvar" e "Restaurar padrão".

---

## QA Explorer

```gherkin
Feature: Máximo de seleções customizável por vínculo produto-grupo
  Como owner/manager de uma pizzaria (ou empresa com padrão similar)
  Quero definir um máximo de seleções específico por produto, mesmo compartilhando o mesmo grupo de opção
  Para representar regras como "quantidade de sabores varia por tamanho" sem duplicar o grupo

  Background:
    Dado que estou autenticado no admin como owner/manager da empresa "Burger House"
    E existe o grupo de opção "Sabores" (min_selections=1, max_selections=4) com 5 opções
    E o grupo "Sabores" está vinculado ao produto "Pizza Broto"

  # ---------- Happy path ----------

  Scenario: Definir override só de máximo (mínimo herda o padrão do grupo)
    Quando envio PATCH /catalog/products/{id de Pizza Broto}/option-groups/{id de Sabores} com {"max_selections_override": 1}
    Então a resposta é 200
    E o vínculo passa a ter max_selections_override=1 e min_selections_override=null

  Scenario: Definir override de mínimo e máximo juntos
    Quando envio PATCH com {"min_selections_override": 1, "max_selections_override": 1}
    Então a resposta é 200
    E o vínculo reflete os dois overrides definidos

  Scenario: GET do produto reflete os overrides configurados
    Dado que o vínculo de "Pizza Broto" com "Sabores" tem max_selections_override=1
    Quando busco GET /catalog/products/{id de Pizza Broto}
    Então o grupo "Sabores" em option_groups aparece com min_selections=1, max_selections=4 (padrão do grupo, inalterado) E max_selections_override=1
    E o valor efetivo (calculado no cliente) é max=1

  Scenario: Restaurar padrão remove os overrides
    Dado que o vínculo de "Pizza Broto" com "Sabores" tem max_selections_override=1
    Quando envio PATCH com {"min_selections_override": null, "max_selections_override": null}
    Então a resposta é 200
    E o GET do produto volta a mostrar max_selections_override=null pra esse vínculo (valor efetivo volta a ser o padrão do grupo, 4)

  Scenario: Cenário completo da pizza — mesmo grupo, máximo diferente por tamanho
    Dado que o grupo "Sabores" também está vinculado ao produto "Pizza Big"
    Quando envio PATCH em "Pizza Broto"/"Sabores" com {"max_selections_override": 1}
    E envio PATCH em "Pizza Big"/"Sabores" com {"max_selections_override": 4}
    Então o GET de "Pizza Broto" mostra max_selections_override=1 pro grupo "Sabores"
    E o GET de "Pizza Big" mostra max_selections_override=4 pro mesmo grupo "Sabores"
    E existe só UM grupo "Sabores" na biblioteca de Opções (não duplicado)

  # ---------- Bordas ----------

  Scenario: Enviar só min_selections_override valida a combinação com o padrão do grupo
    Dado que o grupo "Sabores" tem max_selections=4 (padrão)
    Quando envio PATCH com {"min_selections_override": 5}
    Então a resposta é 400, pois o par efetivo (min=5, max=4 do padrão) é inválido

  Scenario: Máximo efetivo menor que mínimo efetivo é rejeitado
    Dado que o grupo "Sabores" tem min_selections=1 (padrão)
    Quando envio PATCH com {"max_selections_override": 0}
    Então a resposta é 400 ou 422 (max deve ser ao menos 1, mesma regra do grupo aplicada ao override)

  Scenario: PATCH em vínculo inexistente retorna 404
    Dado que o produto "Pizza Grande" existe mas NÃO está vinculado ao grupo "Sabores"
    Quando envio PATCH /catalog/products/{id de Pizza Grande}/option-groups/{id de Sabores} com {"max_selections_override": 3}
    Então a resposta é 404

  # ---------- Erro ----------

  Scenario: PATCH em produto de outra empresa é bloqueado
    Dado que o produto "Pizza Broto" pertence à empresa "Burger House"
    E estou autenticado como owner da empresa "Pasta & Co"
    Quando envio PATCH /catalog/products/{id de Pizza Broto}/option-groups/{id de Sabores}
    Então a resposta é 404 (mesmo padrão de isolamento já usado nos demais endpoints de produto — não revela existência do recurso de outra empresa)

  Scenario: PATCH com option_group_id de outra empresa é bloqueado
    Dado que existe um grupo "Tipo de massa" pertencente à empresa "Pasta & Co"
    E estou autenticado como owner da empresa "Burger House", editando um produto meu
    Quando envio PATCH /catalog/products/{meu produto}/option-groups/{id de "Tipo de massa"}
    Então a resposta é 404

  # ---------- Isolamento multi-tenant ----------

  Scenario: Empresa A não altera override de vínculo da empresa B
    Dado que a empresa "Pasta & Co" tem seu próprio produto vinculado a seu próprio grupo, com um override configurado
    Quando, autenticado como owner de "Burger House", tento localizar ou alterar esse vínculo por qualquer combinação de ids
    Então a operação falha com 404, e o override da empresa "Pasta & Co" permanece inalterado

  # ---------- Regressão ----------

  Scenario: GET /catalog/option-groups fora do contexto de produto não muda
    Quando busco GET /catalog/option-groups
    Então cada grupo retorna só min_selections/max_selections (padrão do grupo)
    E nenhum campo de override aparece nessa listagem

  Scenario: Vincular/desvincular produto-grupo (ORD-140) continua funcionando sem mudança de contrato
    Quando envio PUT /catalog/products/{id}/option-groups com {"option_group_ids": [...]} (formato já existente, sem overrides)
    Então a operação funciona exatamente como antes
    Quando desvinculo um grupo que tinha overrides configurados
    Então a linha de vínculo (e os overrides) é removida por completo
```

**Critério de saída atendido:** happy path, bordas, erro, isolamento multi-tenant e regressão cobertos. Pronto para avançar ao Tech Explorer.

---

## Tech Explorer

### Serviços impactados
- **catalog-service**: migration + 1 endpoint novo + ajuste de serialização, escopado a `ProductOut.option_groups`.
- **frontend/admin**: `ProductEditScreen.tsx` (card de grupo vinculado ganha edição de override), `types.ts`.

### Migrations
- `product_option_groups` ganha `min_selections_override` (Integer, nullable) e `max_selections_override` (Integer, nullable). Sem `server_default` — `NULL` é o estado "sem override", semanticamente distinto de qualquer número.

### Endpoints

#### PATCH /catalog/products/{product_id}/option-groups/{option_group_id}
**Serviço:** catalog-service
**Auth:** JWT obrigatório | role: owner/manager/admin/superadmin (mesmo padrão de escrita em produto)
**company_id:** extraído do JWT — usado pra validar que TANTO o produto QUANTO o grupo pertencem à empresa

Request (os dois campos são opcionais e independentes — **PATCH parcial de verdade**, não substituição total):
```json
{
  "min_selections_override": 1,
  "max_selections_override": 1
}
```

Response 200:
```json
{
  "min_selections_override": 1,
  "max_selections_override": 1
}
```

Erros: 400 (par efetivo min>max, ou max efetivo < 1), 404 (produto não existe/não é da empresa; grupo não existe/não é da empresa; ou vínculo entre eles não existe)

**Decisão técnica crítica — omitido ≠ null:** o body precisa distinguir "campo não enviado" (mantém o valor atual do vínculo) de "campo enviado como `null`" (limpa o override, restaura o padrão do grupo). O padrão já usado em `OptionGroupUpdate` (`model_dump(exclude_none=True)`) **não serve aqui** — ele trata "não enviado" e "enviado como null" como a mesma coisa, o que impediria "Restaurar padrão" de funcionar via PATCH parcial. Este endpoint usa `body.model_dump(exclude_unset=True)` (rastreia quais campos vieram no JSON, independente do valor), aplicando só os campos presentes via `setattr` no vínculo antes de validar o par efetivo.

**Validação do par efetivo:**
```python
effective_min = link.min_selections_override if link.min_selections_override is not None else group.min_selections
effective_max = link.max_selections_override if link.max_selections_override is not None else group.max_selections
if effective_min > effective_max: raise HTTPException(400, ...)
if effective_max < 1: raise HTTPException(400, ...)
```

### Serialização — schema dedicado pro contexto de produto
`OptionGroupOut` (usado por `GET /catalog/option-groups`, `POST/PUT` do grupo — ORD-138/139) **não muda** — continua só `min_selections`/`max_selections`, sem overrides, satisfazendo o cenário de regressão.

Novo schema, usado **só** dentro de `ProductOut.option_groups`:
```python
class ProductOptionGroupOut(OptionGroupOut):
    min_selections_override: Optional[int] = None
    max_selections_override: Optional[int] = None
```
`ProductOut.option_groups: list[ProductOptionGroupOut] = []` (era `list[OptionGroupOut]`). `_get_product_option_groups` passa a fazer join com `ProductOptionGroup` (já filtra por `product_id`) e incluir as duas colunas de override no dict retornado pra cada grupo, além do que `_serialize_option_group` já monta.

### Impacto em outros serviços
Nenhum. Sem mudança em auth/company/order/payment. `PUT /catalog/products/{id}/option-groups` (ORD-140, replace completo da lista de vínculos) não muda — ao recriar um vínculo (desvincula+vincula de novo), os overrides daquele vínculo são perdidos junto (mesmo já esperado: vínculo é uma linha nova).

### Frontend
- `types.ts`: novo tipo `ProductOptionGroup extends OptionGroup { min_selections_override: number | null; max_selections_override: number | null }`; `Product.option_groups: ProductOptionGroup[]`.
- `ProductEditScreen.tsx`: cada card calcula o valor efetivo — `g.max_selections_override ?? g.max_selections` (idem min, só pra validação interna, não exibido) — e usa esse efetivo nos badges "Obrigatório/Opcional" e "Única/Múltipla". Novo botão "Editar máximo neste produto" abre um popover/modal pequeno com `NumberSpinInput` (mesmo componente do ORD-139, faixa reaproveitando `MAX_SELECTIONS_MIN`/`MAX_SELECTIONS_MAX`), botões "Salvar" (`PATCH` com `max_selections_override`) e "Restaurar padrão" (`PATCH` com `max_selections_override: null`).
- **Escopo da UI:** só o **máximo** ganha edição nesta história — o caso de negócio (pizza) nunca precisa customizar o mínimo por tamanho (fica sempre 1/obrigatório, herdado do grupo). `min_selections_override` existe no backend e é testado, mas fica "somente API" por enquanto — não expor o campo na UI evita complexidade visual sem caso de uso real hoje. Se aparecer necessidade, é extensão pequena (mesmo padrão do máximo).

### Estimativa
- Backend: **3 pontos** (migration, endpoint com validação de par efetivo, schema dedicado de serialização, testes de isolamento/regressão)
- Frontend: **2 pontos** (cálculo de efetivo nos badges, popover de edição, chamada PATCH)

### Riscos
- **`exclude_unset` mal aplicado** (ex.: usar `exclude_none` por engano, copiando o padrão de `OptionGroupUpdate`) quebraria silenciosamente o "Restaurar padrão" — mitigado por teste dedicado que envia `{"max_selections_override": null}` e confirma que o override é de fato limpo (não apenas ignorado).
- **Dois schemas de grupo divergirem com o tempo** (`OptionGroupOut` vs `ProductOptionGroupOut`) se um campo novo for adicionado só num dos dois por descuido — mitigado por `ProductOptionGroupOut` herdar de `OptionGroupOut` (não duplicar campos), e por teste de regressão que trava explicitamente "sem campos de override" na listagem fora do contexto de produto.
- **Override esquecido depois de recriar vínculo via `PUT` (ORD-140)**: se o owner desvincula e revincula o mesmo grupo (em vez de só editar), o override se perde — comportamento esperado (é uma linha nova), mas vale um aviso futuro na UI se isso se mostrar uma armadilha recorrente; não é crítico pro escopo desta história.

---

## Ready

Checklist de saída conferido contra o conteúdo já escrito neste arquivo:

**Explorer**
- [x] História no formato Como/Quero/Para
- [x] Contexto e motivação documentados (bloqueador de venda relatado pelo usuário, referência ao modelo do Mogo)
- [x] Fluxo principal passo a passo (7 passos, incluindo o caso completo de 2 tamanhos com overrides diferentes)
- [x] Dependências identificadas (ORD-138 e ORD-140, ambas Ready/implementadas; sem dependência de ORD-141/142/143)
- [x] Wireframe/mockup descrito (card existente + popover de edição de máximo)
- [x] Critérios de aceite funcionais escritos (8 itens)

**QA Explorer**
- [x] Happy path em Gherkin (5 cenários, incluindo o cenário completo da pizza com 2 produtos e 1 grupo compartilhado)
- [x] Cenários de borda (3 cenários: override parcial validando com o padrão, max efetivo < 1, PATCH em vínculo inexistente)
- [x] Cenários de erro (2 cenários: produto de outra empresa, grupo de outra empresa)
- [x] Isolamento multi-tenant coberto (vínculo de outra empresa não é alterável nem localizável)
- [x] Regressão coberta (listagem de grupo sem overrides; vincular/desvincular do ORD-140 sem mudança de contrato)
- [x] Cenários aprovados pelo PM (usuário revisou a sequência completa)

**Tech Explorer**
- [x] Serviços impactados documentados (catalog-service + frontend/admin)
- [x] Endpoint novo documentado (`PATCH /catalog/products/{product_id}/option-groups/{option_group_id}`, request/response, decisão crítica de `exclude_unset`)
- [x] Migration descrita (2 colunas nullable em `product_option_groups`)
- [x] "Eventos de fila": N/A — sem impacto assíncrono
- [x] Estimativa definida (5 pontos: 3 backend + 2 frontend)
- [x] Riscos identificados (3, todos com mitigação: `exclude_unset` mal aplicado, schemas divergirem, override perdido ao recriar vínculo)

**Aprovação final**
- [x] Time revisou e concordou com a solução técnica (usuário: "aprovado")
- [x] Estimativa acordada (5 pontos)
- [x] Sem bloqueios não resolvidos
- [x] Priorizada no sprint backlog

**Status final: Ready.**

---

## Correção pós-implementação (02/09)

Depois de testar o cenário real da pizzaria (grupo "Sabores" com override em "Pizza Broto"=1 e sem override em "Pizza Big"=4), o usuário pediu pra deixar o máximo mais visível no card do grupo — antes ele só aparecia embutido no texto do badge "Múltipla (máx. X neste produto)" e sumia de vista quando a seleção era "Única" (já que single-select tem `max=1` implícito, o texto não mostrava nada).

Ajuste: o badge "Única"/"Múltipla" voltou a ser só o rótulo simples, e o valor efetivo ganhou um badge próprio, sempre visível — "Máximo neste produto: {N}" — com variant `emphasys` (destacado) quando há override configurado pra aquele produto, e `neutral` quando está usando o padrão do grupo. Dá pra diferenciar visualmente, num relance, quais produtos têm um limite customizado sem precisar abrir o editor.
