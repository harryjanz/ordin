---
id: ORD-166
status: Explorer
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

Ainda em aberto, não bloqueia o avanço pro QA Explorer: **como a UI do admin deixa visualmente
claro**, pra um item de uma categoria com desconto geral, se ele está usando o percentual da
categoria ou um override próprio — fica como decisão de design a resolver no Tech Explorer.

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
