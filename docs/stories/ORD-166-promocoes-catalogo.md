---
id: ORD-166
status: QA Explorer
fase: 6
sprint: null
responsavel: Backend SR + Frontend (admin + totem)
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
- **Edição de promoção já ativa**: se a edição introduzir um conflito novo (ex.: adicionar um
  item já coberto por outra promoção ativa), a promoção deve ser desativada automaticamente ou a
  edição bloqueada — decisão de UX a confirmar no QA Explorer.
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
**Faltando** — não existe wireframe/mockup pra esta história ainda. Como envolve dois telas
novas (admin: formulário + listagem de promoções; totem: indicador visual de preço promocional),
isso é pendência explícita pro critério de saída do Explorer. Recomendo tratar como item a
produzir antes do QA Explorer, ou logo no início dele — especialmente a decisão de design ainda
em aberto (categoria com desconto geral vs. produto com override, clareza visual no admin).

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

  # --- Evidência visual no totem (nível funcional — sem asserção de layout, ver blockers) ---

  Scenario: Totem evidencia visualmente o preço promocional
    Dado um produto com promoção ativa e desconto de 20%
    Quando o cliente visualiza esse produto no catálogo do totem
    Então o preço original aparece riscado
    E o novo preço com desconto aparece em destaque
    E existe algum indicador visual de que o item está em promoção
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

### O que ainda impede o avanço pro Tech Explorer
Resolvido nesta etapa: a regra de precedência (produto > categoria > geral) **e** a
representação visual (item sempre mostra o desconto efetivo; override ganha marcação visual
distinta, cor/selo) — ver seção acima. Segue só como lembrete pro Tech Explorer decidir o
componente exato (não é mais decisão de produto, é implementação).

Ainda em aberto:
1. **Wireframe/mockup ausente** — a regra visual já está definida (ponto acima), mas não existe
   peça gráfica ainda. Sem ela, o cenário "Totem evidencia visualmente o preço promocional"
   segue no nível funcional (riscado + novo preço + marcação de override), sem poder virar
   asserção de pixel/componente exato. Não bloqueia entendimento do comportamento, só a
   especificação fina de UI.

Novos, levantados durante a escrita dos cenários desta etapa:
2. **Produto/categoria/combo excluído do catálogo depois de compor uma promoção ativa** — não
   há cenário definido: a promoção deveria ignorar o item silenciosamente, invalidar a
   promoção inteira, ou bloquear a exclusão enquanto a promoção estiver ativa? Precisa de
   decisão antes do Tech Explorer, porque muda o modelo de dados (FK com que comportamento de
   delete).
3. **Edição de promoção já ativa introduzindo um conflito novo** (ex.: admin adiciona um item
   já coberto por outra promoção ativa) — o Explorer já tinha marcado isso como "decisão de UX
   a confirmar", continua sem decisão: a edição deveria ser bloqueada, ou a promoção deveria
   ser desativada automaticamente?

Cenários Gherkin (happy path, borda, erro e isolamento multi-tenant) estão completos e
aprovados — a lacuna é só nesses 3 pontos, que não impedem escrever os testes de fluxo de
dados, mas impedem fechar 100% a especificação antes do Tech Explorer.
