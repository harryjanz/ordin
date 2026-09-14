---
id: ORD-166
status: Done
estimativa: 7,5 pontos (3 backend + 3 admin + 1,5 totem)
fase: 6
sprint: null
responsavel: Backend SR + Frontend (admin + totem)
branch: feature/ORD-166-promocoes-catalogo
---

# ORD-166 — Promoções no catálogo: desconto percentual por período, categoria e produto

## Descrição
O catálogo do Ordin hoje cobre categorias, produtos, combos, grupos de opção e produtos
correlacionados, mas não tem nenhum mecanismo de promoção — não existe desconto por período,
happy hour, nem liquidação de item parado. Isso é uma lacuna comercial relevante: promoção por
tempo limitado com percentual de desconto é ferramenta básica de qualquer operação de food
service. A proposta é criar uma nova aba de **Promoções** dentro do catálogo, na mesma
listagem/padrão de UI já usado pra categorias e produtos. Cada promoção:
- agrega um conjunto de categorias e/ou produtos escolhidos pelo admin;
- tem vigência definida por data e hora de início e de fim;
- aplica um percentual de desconto geral sobre todos os itens da promoção;
- permite sobrescrever esse percentual individualmente, por categoria ou por produto dentro da
  mesma promoção, quando o desconto padrão não deve valer igual pra todo mundo.

No totem, a promoção ativa e o desconto aplicado precisam ficar visualmente evidentes pro
cliente durante a compra.

## Persona
**Admin da empresa** — cria e gerencia promoções no painel admin (composição de categoria/
produto, período de vigência, percentuais geral e por item).
**Cliente no totem** — vê a promoção e o desconto aplicado durante a navegação e o carrinho.

## Contexto
Levantado pelo usuário como próxima história a abrir, antes de seguir com qualquer item do
roadmap de gap de concorrência (`docs/analise-gap-features-roadmap-futuro.md`) — é prioridade
isolada, não faz parte daquela lista. Desconto por período/percentual é recurso presente na
maioria dos concorrentes de catálogo/PDV já pesquisados (CPlug, Consumer, Mogo, CardápioWeb,
Genesis PRO), mas essa lacuna específica ainda não tinha sido mapeada como gap explícito — a
rodada anterior comparou o Ordin especificamente contra o Genesis PRO, sem cobrir promoção.
Diferente das features daquele roadmap, esta não depende de nenhuma outra feature ainda não
implementada (fidelidade, cashback etc.) — encaixa direto no catálogo existente.

## Perguntas do New — respondidas pelo usuário
- **Conflito entre promoções**: não é permitido duas promoções ativas cobrirem o mesmo item no
  mesmo período. **Cadastro é sempre permitido** mesmo com conflito; **ativação é bloqueada**,
  com mensagem informando quais itens colidem e com qual outra promoção.
- **Combo**: o desconto vale pro **combo completo como unidade** (o combo é um item selecionável
  na composição da promoção, igual categoria/produto) — nunca aplica a um produto avulso só
  porque ele também compõe um combo.
- **Relação com "tabela de preço"**: esclarecido no Explorer abaixo — não é a cadeia
  `PriceTable`/`CompanyPlan` (ORD-162-165), que é outro domínio. O desconto aplica direto sobre
  `Product.price`/`Combo.price`.
- **Timezone**: horário do servidor.
- **Expiração**: automática, sem ação manual, ao passar da data/hora final.

**Resolvido no QA Explorer**: cada item da composição sempre mostra o desconto efetivo já
calculado (geral por padrão); quando há override, o item ganha marcação visual distinta
(cor/selo) — ver seção QA Explorer abaixo.

## Explorer

### História
Como **admin da empresa**, quero criar e gerenciar promoções por período com desconto
percentual — aplicável de forma geral a um conjunto de categorias/produtos/combos e ajustável
individualmente por item — para impulsionar vendas em momentos específicos sem precisar alterar
o preço-base do catálogo manualmente.

Como **cliente no totem**, quero ver claramente quando um item está em promoção e qual desconto
está sendo aplicado, para entender o preço final antes de decidir a compra.

### Contexto e motivação
O catálogo do Ordin (categorias, produtos, combos, grupos de opção, produtos correlacionados —
ORD-108 a 160) nunca teve mecanismo de desconto temporário. É uma lacuna de posicionamento
comercial, não só de feature: praticamente todo concorrente de catálogo/PDV já pesquisado
(CPlug, Consumer, Mogo, CardápioWeb, Genesis PRO) tem cupom ou promoção como parte do produto.
Diferente das features do roadmap de gap com o Genesis PRO (`docs/analise-gap-features-roadmap-
futuro.md` — fidelidade, cashback, fiscal etc.), esta não depende de nada ainda não construído:
encaixa direto no `catalog-service` já maduro, sem dependência de outro serviço.

**Esclarecimento importante levantado nesta etapa:** existe uma cadeia chamada "tabela de
preço" no Ordin (`PriceTable`/`PriceTableTransactionTier`/`CompanyPlan`, ORD-162 a 165), mas ela
é o modelo de **cobrança da plataforma sobre a empresa-cliente** (quanto o Ordin cobra por
transação processada), **não** o preço dos produtos vendidos no totem. Não existe hoje nenhuma
cadeia de "resolução de preço final" no catalog-service — o preço vem direto do campo
`Product.price`/`Combo.price`, consumido cru pelo frontend. A promoção **não interage** com a
cadeia de cobrança da plataforma; o desconto aplica sobre o preço do catálogo diretamente. Vale
manter essa distinção clara pro Tech Explorer, pra não confundir os dois domínios de "preço".

### Fluxo principal
1. Admin abre o catálogo → nova aba **Promoções**, no mesmo padrão de `Tabs` já usado em
   `CatalogScreen.tsx` (categories/products/menus/options/combos) — lista promoções existentes
   com nome, período e status (rascunho / ativa / expirada / em conflito).
2. Admin cria uma promoção: nome, data/hora de início, data/hora de fim (horário do servidor) e
   percentual de desconto geral.
3. Admin compõe a promoção adicionando categorias, produtos e/ou combos — combo sempre como
   unidade completa.
4. Admin pode, opcionalmente, sobrescrever o percentual de desconto pra um item específico da
   composição (categoria, produto ou combo individual), diferente do percentual geral.
5. Admin salva — o cadastro é aceito mesmo que algum item já esteja coberto por outra promoção
   no mesmo período (estado inicial é sempre inativo/rascunho).
6. Admin tenta ativar a promoção — sistema valida conflito contra promoções já ativas: se algum
   item colide em período, a ativação é bloqueada e o sistema informa quais itens conflitam e
   com qual outra promoção.
7. Promoção ativada (sem conflito) passa a valer: no totem, os itens afetados mostram o preço
   promocional evidenciado (ex.: preço original riscado + novo preço + indicador de promoção).
8. Ao passar da data/hora de término, a promoção deixa de aplicar automaticamente — sem
   intervenção manual — e os itens voltam ao preço normal.

### Fluxos alternativos / exceções
- **Conflito no cadastro**: promoção é salva normalmente, mas fica com status "em conflito" ou
  equivalente até o conflito ser resolvido (editar período/composição, ou a promoção
  conflitante expirar) — não trava o admin, só impede ativação.
- **Edição de promoção já ativa**: não existe edição direta. Pra alterar qualquer campo de uma
  promoção ativa (período, composição, percentuais), o admin precisa **inativá-la primeiro**,
  editar, e ativá-la de novo — passando pela validação de conflito normalmente nesse novo ciclo
  de ativação. Isso elimina por construção o cenário de "edição introduz conflito em uma
  promoção que já está valendo" — resolvido pelo usuário no QA Explorer.
- **Promoção expirada**: fica visível no histórico (não é excluída), com status "expirada";
  reativar exigiria editar o período pra um novo intervalo futuro.
- **Combo com produto que também está em promoção individual**: como o desconto de combo só
  vale pro combo como unidade, não há herança/soma com a promoção do produto avulso — são
  independentes.

### Dependências
- **Serviço envolvido**: `catalog-service` — novos modelos (`Promotion`, e uma tabela de
  associação pra composição categoria/produto/combo com override de percentual opcional),
  seguindo o padrão REST já usado por `Category`/`Combo` (CRUD + soft delete).
- **Frontend admin**: nova aba em `frontend/admin/src/screens/CatalogScreen.tsx`, reaproveitando
  o padrão de `Tabs` existente.
- **Frontend totem**: `frontend/totem/src/screens/CatalogScreen.tsx` precisa aplicar o desconto
  sobre o preço já exibido (`p.price`/`c.price`) e refletir no cálculo do carrinho — hoje não
  existe nenhuma lógica de desconto nesse arquivo.
- **Scheduler/expiração automática**: o projeto tem `APScheduler` listado em `requirements.txt`
  de vários serviços, mas **sem nenhum uso real** hoje — tudo é resolvido on-the-fly na consulta
  (mesmo padrão do `CompanyPlan.expires_at`, comparado em runtime, sem job). Recomendação pro
  Tech Explorer: resolver "promoção ativa" por comparação de data na query (`now BETWEEN
  starts_at AND ends_at`), sem introduzir a primeira dependência real de scheduler do projeto
  só pra isso — mais simples e consistente com o que já existe.
- **Histórias bloqueantes**: nenhuma. Não depende de ORD-162 a 165 (domínios de preço
  diferentes, ver esclarecimento acima).

### Critérios de aceite funcionais
- [ ] Admin cria promoção com nome, período (data/hora início e fim) e percentual geral de desconto
- [ ] Admin compõe a promoção com categorias, produtos e/ou combos (combo como unidade completa)
- [ ] Admin sobrescreve o percentual de desconto individualmente por item da composição
- [ ] Cadastro de promoção é permitido mesmo havendo conflito de item/período com outra promoção
- [ ] Ativação é bloqueada quando há conflito, com mensagem informando os itens e a promoção conflitante
- [ ] Promoção ativa aplica o desconto (geral ou override) sobre o preço do item no totem, com
      indicação visual clara (preço riscado + novo preço + selo de promoção)
- [ ] Promoção expira automaticamente ao passar do horário final (servidor), sem ação manual
- [ ] Aba de Promoções segue o mesmo padrão visual/estrutural das demais abas do catálogo

### Wireframe / Mockup
**Publicado**: [ORD-166 — Wireframe: Promoções no catálogo](https://claude.ai/code/artifact/aa3b5215-45c7-4746-848e-202ffb8429a3) — cobre os dois contextos (admin: aba Promoções na mesma
`Tabs`/`Table` do catálogo, listagem com chips de status, editor com banner de conflito e
composição com precedência produto > categoria > geral marcada visualmente; totem: vitrine com
preço riscado + preço promocional + selo, item sem promoção ao lado pra contraste), usando os
tokens de cor/tipografia reais do projeto (`themes.ts`, tema Ordin: roxo `#9900ff`, teal
`#1a9999`/`#33cccc` de preço, Lexend/Inter/Courier New). É wireframe de comportamento — a peça
final de UI fica pro Tech Explorer/implementação.

## QA Explorer

### Regra de precedência e representação visual (resolve a pendência de design do Explorer)
Pra escrever os cenários de override sem ambiguidade, fica definida a regra funcional: **o
percentual mais específico sempre vence** — override de produto > override de categoria >
percentual geral da promoção.

Representação visual definida pelo usuário nesta etapa: cada categoria/produto/combo listado na
composição da promoção **sempre exibe o desconto efetivo já calculado** (o percentual geral,
por padrão) — quando há override, o item mostra o valor sobrescrito **com uma marcação visual**
(cor ou selo diferente) indicando que aquele item não está usando o percentual geral. Aplica-se
tanto na listagem/formulário do admin quanto, de forma equivalente, no indicador de promoção do
totem. Isso fecha a pendência de design — resta só a falta de wireframe (item 1 dos blockers
abaixo) como pendência de representação exata (cores/componente específico), não mais de regra.

### Cenários Gherkin

```gherkin
Feature: Promoções no catálogo
  Como admin da empresa
  Quero criar e gerenciar promoções por período com desconto percentual
  Para impulsionar vendas em momentos específicos sem alterar o preço-base do catálogo

  Background:
    Dado que a empresa "Burger House" está autenticada no painel admin
    E o catálogo tem categorias, produtos e combos cadastrados

  # --- Criação ---

  Scenario: Admin cria promoção válida com desconto geral
    Dado que o admin está na aba Promoções do catálogo
    Quando ele cria uma promoção com nome "Happy Hour", início "2026-09-20 18:00",
      fim "2026-09-20 20:00" e desconto geral de 20%
    E adiciona a categoria "Bebidas" à composição
    Então a promoção é salva com status "rascunho"
    E nenhum desconto é aplicado no totem, pois a promoção ainda não foi ativada

  Scenario: Admin sobrescreve o percentual de um item específico
    Dado uma promoção "Combo do Dia" com desconto geral de 10% e a categoria "Lanches" na composição
    Quando o admin define um override de 25% pro produto "X-Bacon", que pertence à categoria "Lanches"
    E ativa a promoção sem conflito
    Então no totem o "X-Bacon" aparece com 25% de desconto
    E os demais produtos da categoria "Lanches" aparecem com 10% de desconto

  Scenario: Desconto de combo vale só pro combo completo, não pro produto avulso
    Dado uma promoção ativa que inclui o combo "Combo Família" com 15% de desconto
    E o produto "Refrigerante 350ml" faz parte desse combo mas também é vendido avulso
    Quando o cliente compra o "Combo Família" no totem
    Então o preço do combo aparece com 15% de desconto
    Quando o cliente compra o "Refrigerante 350ml" avulso, fora do combo
    Então nenhum desconto é aplicado ao produto avulso

  # --- Validação de cadastro ---

  Scenario Outline: Criação com dados inválidos é rejeitada
    Quando o admin tenta salvar uma promoção com "<campo_invalido>"
    Então o sistema rejeita o cadastro com uma mensagem de erro específica

    Examples:
      | campo_invalido                                         |
      | nome vazio                                             |
      | data de fim anterior à data de início                  |
      | percentual de desconto negativo                        |
      | percentual de desconto acima de 100                    |
      | nenhum item de composição selecionado                  |

  # --- Conflito ---

  Scenario: Cadastro é permitido mesmo com conflito de outra promoção ativa
    Dado uma promoção "Promo A" já ativa cobrindo o produto "X-Bacon" entre
      "2026-09-20 12:00" e "2026-09-20 23:59"
    Quando o admin cria uma nova promoção "Promo B" que também inclui o produto "X-Bacon"
      no mesmo intervalo
    Então "Promo B" é salva com sucesso

  Scenario: Ativação é bloqueada quando há conflito de item e período
    Dado a "Promo B" em conflito com "Promo A" no produto "X-Bacon"
    Quando o admin tenta ativar "Promo B"
    Então a ativação é bloqueada
    E o sistema informa que o produto "X-Bacon" já está coberto pela "Promo A" nesse período

  Scenario: Ativação é aceita quando não há conflito
    Dado uma promoção "Promo C" cuja composição não colide com nenhuma promoção ativa no mesmo período
    Quando o admin ativa "Promo C"
    Então a promoção passa a status "ativa"
    E os itens da composição passam a exibir o preço promocional no totem

  Scenario: Conflito deixa de existir depois que a promoção concorrente expira
    Dado "Promo A" ativa cobrindo "X-Bacon" até "2026-09-20 23:59", e "Promo B" em conflito com ela
    Quando o horário do servidor passa de "2026-09-20 23:59" ("Promo A" expira)
    E o admin tenta ativar "Promo B" novamente
    Então a ativação é aceita, pois não há mais conflito

  # --- Expiração automática ---

  Scenario: Promoção expira automaticamente sem ação manual
    Dado uma promoção ativa com fim marcado para "2026-09-20 20:00" (horário do servidor)
    Quando o horário do servidor passa de "2026-09-20 20:00"
    Então a promoção passa a status "expirada" automaticamente
    E os itens afetados voltam ao preço normal no totem, sem intervenção do admin

  Scenario: Promoção com início no futuro não aplica desconto antes da hora
    Dado uma promoção ativa com início marcado para "2026-09-21 18:00"
    Quando o horário atual do servidor é "2026-09-21 17:59"
    Então nenhum desconto é aplicado no totem ainda

  # --- Isolamento multi-tenant ---

  Scenario: Empresa não acessa nem ativa promoção de outra empresa
    Dado a "Promo X" pertence à empresa "Pasta & Co"
    Quando um admin autenticado como empresa "Burger House" tenta consultar, editar ou ativar
      a "Promo X"
    Então o sistema retorna erro 403
    E nenhum dado da "Promo X" é exposto na resposta

  # --- Evidência visual no totem ---

  Scenario: Totem evidencia visualmente o preço promocional
    Dado um produto com promoção ativa e desconto de 20%
    Quando o cliente visualiza esse produto no catálogo do totem
    Então o preço original aparece riscado
    E o novo preço com desconto aparece em destaque
    E um selo de promoção fica visível no card do produto (ver wireframe)

  # --- Item indisponível depois de compor a promoção ---

  Scenario: Produto excluído/inativado some do totem e é marcado como indisponível na promoção
    Dado uma promoção ativa que inclui o produto "Milk-shake Morango"
    Quando o admin exclui ou inativa o produto "Milk-shake Morango" no catálogo
    Então o "Milk-shake Morango" não aparece mais no totem (nem com nem sem desconto)
    E a promoção continua ativa normalmente pros demais itens da composição
    E a tela da promoção, no admin, marca o "Milk-shake Morango" como "Indisponível"

  # --- Edição de promoção ativa ---

  Scenario: Promoção ativa não pode ser editada diretamente
    Dado uma promoção com status "ativa"
    Quando o admin tenta editar período, composição ou percentuais
    Então a ação de edição direta não está disponível — só "Ver" e "Inativar"

  Scenario: Editar uma promoção exige inativar antes
    Dado uma promoção ativa "Happy Hour Bebidas"
    Quando o admin a inativa
    E edita o percentual geral de 20% para 30%
    E ativa a promoção novamente
    Então a nova ativação passa pela validação de conflito normalmente
    E, sem conflito, a promoção volta a "ativa" já com o percentual atualizado
```

### Critérios de aceite testáveis
- [ ] Promoção é criada com nome, período e percentual geral válidos
- [ ] Cadastro com dados inválidos (nome vazio, período invertido, percentual fora de 0-100,
      composição vazia) é rejeitado com mensagem específica por campo
- [ ] Override de item respeita a precedência produto > categoria > geral
- [ ] Desconto de combo nunca vaza pro produto avulso vendido fora do combo
- [ ] Cadastro de promoção conflitante é aceito; ativação de promoção conflitante é bloqueada
      com mensagem que identifica item(ns) e promoção concorrente
- [ ] Promoção conflitante pode ser ativada assim que o conflito deixar de existir
- [ ] Promoção ativa aplica o desconto correto (geral ou override) no preço exibido no totem
- [ ] Promoção expira automaticamente na data/hora final, sem job manual, e o item volta ao
      preço normal na consulta seguinte
- [ ] Promoção com início futuro não aplica desconto antes do horário de início
- [ ] Empresa A não consegue ler, editar ou ativar promoção de empresa B (403, sem vazamento de dado)
- [ ] Item excluído/inativado do catálogo some do totem e é marcado "Indisponível" na tela da
      promoção, sem interromper os demais itens da composição
- [ ] Promoção ativa não oferece edição direta — só "Ver"/"Inativar"; editar exige
      inativar → editar → ativar, revalidando conflito no novo ciclo de ativação

### Status — todos os pontos em aberto resolvidos nesta etapa
1. **Wireframe** — publicado (link na seção Explorer acima), cobrindo admin e totem com os
   tokens reais de cor/tipografia do projeto.
2. **Item excluído/inativado depois de compor uma promoção ativa** — resolvido: fica
   indisponível só naquela promoção (some do totem, sem quebrar o restante da composição) e é
   marcado como "Indisponível" na tela da promoção no admin. Não bloqueia a operação nem exige
   exclusão em cascata.
3. **Edição de promoção ativa** — resolvido: não existe edição direta. É preciso inativar,
   editar, e ativar de novo (passando pela validação de conflito nesse novo ciclo) — elimina por
   construção o caso de "edição introduz conflito numa promoção que já está valendo".

Cenários Gherkin (happy path, borda, erro, isolamento multi-tenant, item indisponível e ciclo de
edição) estão completos e aprovados. Critério de saída do QA Explorer atendido — pronta pra
avançar ao **Tech Explorer**.

## Tech Explorer

### Serviços impactados
- **catalog-service**: novo domínio `Promotion`/`PromotionItem` — modelos, migration, CRUD,
  algoritmo de conflito, e anotação de preço promocional nos endpoints de leitura já existentes
  (`GET /catalog/products`, `GET /catalog/combos`).
- **frontend/admin**: nova aba "Promoções" em `CatalogScreen.tsx`.
- **frontend/totem**: `CatalogScreen.tsx` consome o campo novo `promotion` (aditivo) na resposta
  de produto/combo e renderiza preço riscado + selo (reaproveitando o padrão visual que o card
  de combo já usa pra "economize R$X", ver `services/catalog` e o wireframe publicado no
  Explorer).
- **order-service, payment-service**: nenhuma mudança de código — ver nota de risco #4 abaixo.

### Modelo de dados (`fk_catalog`, MySQL/aiomysql)

**`Promotion`**
| Coluna | Tipo | Regra |
|---|---|---|
| `id` | PK | |
| `company_id` | Integer, indexado | multi-tenancy, mesmo padrão de `Category.company_id` |
| `name` | String(120), NOT NULL | |
| `starts_at` | DateTime, NOT NULL | |
| `ends_at` | DateTime, NOT NULL | CHECK `ends_at > starts_at` |
| `general_discount_percent` | Numeric(5,2), NOT NULL | CHECK `0 <= x <= 100` |
| `is_enabled` | Boolean, NOT NULL, default `false` | `true` = ativada pelo admin (passou pela checagem de conflito); status exibido é sempre **computado**, nunca um enum persistido (ver "Status computado" abaixo) |
| `deleted` | Boolean, NOT NULL, default `false` | soft delete, mesmo padrão de `Category` |
| `created_at`/`updated_at` | DateTime, server default `now()` | |

Índice: `(company_id, is_enabled, deleted)` — usado tanto na listagem quanto na resolução de
preço promocional a cada consulta de catálogo.

**`PromotionItem`** (composição)
| Coluna | Tipo | Regra |
|---|---|---|
| `id` | PK | |
| `promotion_id` | FK → `Promotion.id`, ON DELETE CASCADE, NOT NULL | |
| `item_type` | Enum(`category`,`product`,`combo`), NOT NULL | |
| `category_id` / `product_id` / `combo_id` | FK, nullable | exatamente um preenchido, condizente com `item_type` — CHECK constraint |
| `discount_percent_override` | Numeric(5,2), nullable | `NULL` = usa o geral da promoção; senão CHECK `0 <= x <= 100` |

**Unicidade de item duplicado na composição validada na aplicação, não no banco** — MySQL não
tem índice único parcial/funcional como o Postgres pra ignorar `NULL` de forma prática nas
colunas alternativas; mais simples checar antes do insert do que montar uma constraint
funcional.

**Exclusão/hard delete de item referenciado**: soft delete (o caso normal — `Category.active`/
`deleted`, equivalente em `Product`/`Combo`) não quebra o `PromotionItem`, a FK continua válida;
é isso que sustenta o comportamento de "fica indisponível" já decidido. Hard delete
(`permanent=True`, caso raro e explícito hoje só em `Category`) usa `ON DELETE CASCADE` — se a
linha referenciada deixa de existir de verdade, o `PromotionItem` correspondente é removido
junto, não faz sentido "marcar indisponível" algo que não existe mais no banco.

### Status computado (não persistido)
```python
def compute_status(promo, now, has_conflict) -> str:
    if not promo.is_enabled:
        return "conflito" if has_conflict else "rascunho"
    if now > promo.ends_at:
        return "expirada"
    return "ativa"
```
Calculado em toda leitura (`GET /catalog/promotions` e `GET /catalog/promotions/{id}`) — não há
coluna de status nem job pra mantê-la sincronizada, consistente com a decisão já registrada no
Explorer de não introduzir scheduler novo no projeto.

### Algoritmo de conflito
Conflito é comparado por **produto/combo efetivamente afetado**, não por item bruto da
composição — uma promoção com a categoria "Lanches" conflita com outra que tenha o produto
"X-Bacon" avulso, porque "X-Bacon" pertence a "Lanches".

```python
async def resolve_affected_ids(db, promotion_id) -> tuple[set[int], set[int]]:
    """(product_ids, combo_ids) afetados, expandindo item_type=category pros
    produtos ativos/não-excluídos daquela categoria."""
    ...

async def find_conflicts(db, company_id, promotion) -> list[ConflictDetail]:
    """Compara contra toda promoção com is_enabled=True e deleted=False da mesma
    empresa cujo período [starts_at, ends_at] sobrepõe o da promoção candidata.
    Produto e combo são namespaces independentes — nunca conflitam entre si,
    consistente com a regra de que desconto de combo nunca vaza pro produto avulso."""
    ...
```
Chamado em dois pontos: (1) `POST /catalog/promotions/{id}/activate`, bloqueando com 409 se
achar conflito; (2) toda leitura de listagem/detalhe, pra mostrar o chip "Conflito"
**proativamente**, mesmo numa promoção ainda em rascunho que nunca tentou ativar — é o que o
wireframe do QA Explorer mostra.

### Resolução de preço promocional (nos endpoints de leitura do catálogo)
Em `GET /catalog/products` e `GET /catalog/combos` (consumidos pelo totem), cada item passa a
carregar um campo adicional `promotion` (aditivo, `null` quando não há promoção em vigor):
1. Busca a promoção `is_enabled=true`, `deleted=false` da empresa cujo período cobre `NOW()`
   (comparação feita com o `NOW()` do **banco**, não do relógio da aplicação — ver risco #3) e
   cuja composição expandida inclui aquele produto/combo.
2. O gate de conflito garante **no máximo uma** promoção habilitada cobrindo um item num dado
   período — resolução é determinística, sem critério de desempate entre promoções diferentes.
3. Dentro da promoção encontrada, aplica a precedência **produto/combo > categoria > geral**: se
   existe um `PromotionItem` apontando direto pro item (com ou sem override próprio), usa esse;
   senão usa o `PromotionItem` de categoria que o contém (com ou sem override); senão o geral.
   Esse é também o caso de um item estar coberto tanto direto quanto via categoria **na mesma
   promoção** — a entrada direta vence.
4. Item cuja categoria/produto/combo está soft-deletado é simplesmente filtrado da resposta,
   mesmo comportamento que o catálogo já tem hoje pra item inativo — nunca aparece no totem, com
   ou sem promoção.

### Endpoints

#### `POST /catalog/promotions`
**Auth:** JWT · role `admin` · `company_id` do JWT
Cria sempre como rascunho (`is_enabled=false`).

Request:
```json
{
  "name": "Happy Hour Bebidas",
  "starts_at": "2026-09-20T18:00:00",
  "ends_at": "2026-09-20T20:00:00",
  "general_discount_percent": 20.0,
  "items": [
    {"item_type": "category", "category_id": 4},
    {"item_type": "product", "product_id": 91, "discount_percent_override": 25.0},
    {"item_type": "combo", "combo_id": 12}
  ]
}
```
Response 201: promoção completa, com `status` computado (`"rascunho"` ou `"conflito"`).
Erros: 400 (nome vazio, `ends_at <= starts_at`, percentual fora de 0–100, `items` vazio, item
duplicado na composição), 404 (categoria/produto/combo referenciado não existe ou não pertence à
empresa do JWT).

#### `PUT /catalog/promotions/{id}`
Mesmo payload do POST. 409 se `is_enabled=true` ("promoção ativa precisa ser inativada antes de
editar").

#### `POST /catalog/promotions/{id}/activate`
Revalida conflito dentro da mesma transação (lock nas promoções candidatas, ver risco #2). 409
com a lista de itens e promoções conflitantes se houver; senão seta `is_enabled=true`.

#### `POST /catalog/promotions/{id}/deactivate`
Sempre permitido — seta `is_enabled=false`, sem validação.

#### `DELETE /catalog/promotions/{id}`
Soft delete. 409 se `is_enabled=true` (mesma regra de "inativar antes").

#### `GET /catalog/promotions` / `GET /catalog/promotions/{id}`
Lista/detalhe com `status` computado, contagem de itens, e (no detalhe) cada item da composição
com `available: bool` (falso quando a entidade referenciada está soft-deletada) e o percentual
efetivo (override ou herdado).

#### `GET /catalog/products`, `GET /catalog/combos` (alterados, aditivo)
Passam a incluir `"promotion": {"promotion_id", "promotion_name", "discount_percent",
"final_price"} | null` por item, conforme a resolução descrita acima.

### Migrations
Nova revisão em `services/catalog/migrations/versions/` (convenção `YYYYMMDD_HHMM_promocoes.py`):
cria `promotions` e `promotion_items` com as colunas/constraints acima, FKs pra `categories`,
`products`, `combos` já existentes, e os índices citados.

### Eventos de fila
Nenhum. Promoção é resolvida on-the-fly pelo catalog-service; não há necessidade de notificar
outro serviço.

### Impacto em outros serviços
- **order-service**: nenhuma mudança — já recebe `unit_price` computado pelo totem sem
  revalidação server-side (mesmo padrão hoje usado pra combo e `price_delta` de opção). Ver
  risco #4.
- **payment-service**: nenhum impacto.

### Estimativa
- Backend (catalog-service): **~3 pontos** — modelos + migration + CRUD + algoritmo de conflito
  (com suíte de teste unitário dedicada) + anotação de preço nos endpoints de leitura.
- Frontend admin: **~3 pontos** — nova aba, listagem com chips de status, composer com override
  e banner de conflito, fluxo inativar → editar → ativar.
- Frontend totem: **~1,5 ponto** — consumo do campo `promotion` novo, badge + preço riscado
  (padrão visual já existe no card de combo, reaproveitável).
- **Total: ~7,5 pontos.**

### Riscos
1. **Algoritmo de conflito é a peça de maior risco de correção** — expandir categoria pra
   produtos, comparar períodos sobrepostos, tratar produto/combo como namespaces
   independentes. Mitigação: suíte de teste unitário isolada só pro resolver de conflito, antes
   de integrar aos endpoints, cobrindo os casos do Gherkin do QA Explorer.
2. **Condição de corrida na ativação** — duas ativações conflitantes simultâneas. Mitigação:
   revalidar o conflito dentro da mesma transação que seta `is_enabled=true`, com lock nas
   promoções candidatas (mesmo padrão de `SELECT ... FOR UPDATE` já usado em `collect_ticket`
   do order-service pra evitar dupla coleta).
3. **Consistência de relógio pra "ativa por data"** — usar o `NOW()` do MySQL na query, não
   `datetime.now()` da aplicação, pra não depender do relógio de cada container/réplica do
   catalog-service.
4. **order-service confia no preço enviado pelo totem sem revalidação** — já é o padrão
   pré-existente pra combo e `price_delta` de opção (`item.unit_price` do payload de
   `POST /orders`, sem chamada de volta ao catalog-service). Promoção segue o mesmo modelo —
   **não introduz superfície de risco nova**, mas se o Ordin endurecer isso no futuro
   (revalidação server-side de preço), promoção precisa entrar nesse mecanismo também. Fora de
   escopo desta história.
5. **MySQL não tem índice único parcial/funcional** — unicidade de item duplicado na composição
   é responsabilidade da camada de aplicação, não do schema.

### O que ainda impede o avanço pro Ready
Nada bloqueante. Todos os itens do critério de saída do Tech Explorer estão cobertos: serviços
impactados, endpoints (payload completo), migrations, impacto em outros serviços, estimativa e
riscos com mitigação proposta. Segue pra aprovação final (step Ready).

## Ready

**Explorer:** [x] história Como/quero/para (admin + cliente no totem) · [x] contexto e
motivação · [x] fluxo principal (8 passos) · [x] dependências identificadas (só
`catalog-service`, sem depender de ORD-162 a 165) · [x] wireframe publicado
([artifact](https://claude.ai/code/artifact/aa3b5215-45c7-4746-848e-202ffb8429a3)) · [x]
critérios de aceite funcionais.

**QA Explorer:** [x] happy path · [x] bordas (validação de dados, promoção com início futuro,
conflito que se resolve quando a promoção concorrente expira) · [x] erros (Scenario Outline de
cadastro inválido) · [x] isolamento multi-tenant (empresa A não acessa promoção de empresa B) ·
[x] item indisponível e ciclo inativar→editar→ativar · [x] cenários aprovados.

**Tech Explorer:** [x] serviços impactados (`catalog-service`; sem mudança em order/payment) ·
[x] endpoints com payload completo (CRUD + activate/deactivate) · [x] migration descrita
(`promotions`/`promotion_items` em `fk_catalog`) · [x] eventos de fila — nenhum necessário,
justificado · [x] estimativa (7,5 pontos) · [x] 5 riscos técnicos, todos com mitigação proposta
(destaque: condição de corrida na ativação, e o achado de que order-service já confia no preço
enviado pelo totem sem revalidação — padrão pré-existente, não é risco novo desta história).

**Aprovação final:** [x] solução técnica revisada e aprovada pelo usuário · [x] estimativa
7,5 pontos acordada · [x] sem bloqueios não resolvidos · [ ] sprint específico — ainda não
atribuída a um sprint do backlog (mesma situação de outras histórias Ready sem sprint definido
no momento da aprovação, ex. ORD-060); fica pra priorização quando o usuário decidir encaixar no
calendário.

**Status: Ready.** Pode começar a implementação (backend primeiro — modelo/migration/algoritmo
de conflito — depois admin, depois totem, na ordem sugerida pela estimativa).

## Implementação (In Progress)

As 3 fatias foram implementadas na branch `feature/ORD-166-promocoes-catalogo`, ainda sem PR
aberta:

1. **Backend** (`eb2df68`) — `Promotion`/`PromotionItem` em `fk_catalog`, migration aplicada e
   verificada (upgrade/downgrade no MySQL de dev), CRUD completo, algoritmo de conflito (com
   correção encontrada durante a implementação: promoção `is_enabled=true` mas já expirada não
   deve contar como concorrente — sem isso o cenário "conflito some quando a promoção
   concorrente expira" quebrava), anotação de preço promocional em `GET /catalog/products` e
   `/catalog/combos`, lock via `SELECT FOR UPDATE` na ativação. 17 testes novos, suíte completa
   do serviço sem regressão (218 passando). `ruff` limpo.
2. **Admin** (`1af85a8`) — aba Promoções, tela dedicada de criação/edição espelhando
   `ComboFormScreen`/`PriceTableFormScreen`. Testado ao vivo no navegador contra o backend real
   (criação, composição, ativação, modo somente-leitura, exclusão) — achado e corrigido um bug
   de pluralização ("itemns" → "itens") que só apareceu nesse teste visual, não no `tsc`/build.
3. **Totem** (`3a46d10`) — preço promocional evidenciado (riscado + novo preço + selo âmbar) no
   card de produto e combo, e `effectivePrice()` centralizando a leitura do desconto em todo
   ponto onde o preço entra no carrinho (produto avulso, com opção, combo, upsell). Verificado
   via `tsc`/build limpos e chamada direta à API real confirmando `final_price` correto; **não
   foi possível testar visualmente no navegador** — login por PIN falhou num servidor de dev à
   parte (sessão sem pareamento prévio, problema de ambiente de teste, não do código) e a
   tentativa foi interrompida antes de arriscar bloqueio de IP por PIN errado repetido.

**Achado fora de escopo, não corrigido**: `docker compose build totem` falha numa instalação
limpa (`npm ci` dentro do container, resolução do pacote `react-aria` quebrada) — não acontece
com o `node_modules` já resolvido do host, e não é causado por nenhum arquivo desta história
(nenhum arquivo alterado aqui importa esse caminho). CI não builda a imagem Docker do totem
hoje, então isso nunca foi pego antes. Vale abrir um item separado pra investigar.

**PR mergeada**: [#134](https://github.com/harryjanz/ordin/pull/134) — CI verde (build Docker, lint,
segurança, testes+cobertura), merge direto pra `main` a pedido do usuário (sem code review formal
antes do merge).

Ajuste pós-implementação (`dccbda8`): campos "Buscar categoria, produto ou combo pra adicionar"
dividindo 50/50 o espaço — a classe CSS compartilhada com `ComboFormScreen` (`1fr 200px`) tinha
sido pensada pra outra ordem de campos; corrigido com override local, sem tocar na classe
compartilhada.
