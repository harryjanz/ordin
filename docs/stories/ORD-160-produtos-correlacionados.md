---
id: ORD-160
status: QA Explorer
estimativa: null
tipo: feature
fase: 6
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-160 — Produtos correlacionados (cross-sell sem combo)

## Descrição
O catálogo do Ordin já cobre cardápio, grupos de opção (ORD-137 a 146) e combos com preço
próprio (ORD-112/150/157), mas não tem um jeito de indicar que dois produtos combinam bem sem
precisar empacotar os dois num `Combo`. Esta história adiciona **produtos correlacionados**:
o admin cadastra que um produto sugere outro (ex. "Batata Frita" sugere "Molho Barbecue"), e o
totem oferece essa sugestão quando o cliente adiciona o produto avulso ao carrinho — sem alterar
preço nem depender de um combo cadastrado.

## Persona
Admin da empresa (dono/gerente), que cadastra a correlação no painel administrativo. Cliente
final no totem, que recebe a sugestão e decide se aceita — objetivo de negócio é aumentar o
ticket médio, seguindo o mesmo racional (validado por pesquisa de mercado) que já motivou o
upsell de combo.

## Contexto
Levantado pelo usuário em 2026-09-08, ao revisar o backlog do catálogo: com cardápio, opções,
combos e categorias já maduros, a lacuna identificada é justamente cross-sell independente de
combo — pesquisa de mercado em `docs/analise-concorrentes-produtos-correlacionados.md` (Toast
POS "Menu Upsells" foi a única fonte de produto real encontrada; Goomer/iFood confirmam a
prática mas sem documentação de configuração pública). A pesquisa também levantou uma
possibilidade de sugestão assistida por IA (LLM sobre metadado do catálogo para empresas novas,
association rule mining sobre pedidos para empresas maduras) — decisão do usuário (2026-09-08):
**não faz parte desta história**, fica registrada como roadmap futuro
(`[[project_produtos_correlacionados_escopo]]`). Esta história é só o CRUD manual.

## Explorer

### História
Como admin da empresa, quero cadastrar produtos correlacionados a um produto do catálogo, para
que o totem sugira esse item complementar ao cliente quando ele adicionar o produto avulso ao
carrinho, aumentando o ticket médio sem precisar criar um combo com preço próprio.

### Contexto e motivação
Hoje o único mecanismo de sugestão no totem é o modal de upsell de combo (ORD-150/157), que só
dispara quando o produto é componente de um `Combo` ativo com sugestão ligada. Isso não cobre o
caso comum de "esses dois produtos combinam, mas não fazem sentido como pacote de preço fixo"
(ex: um produto de preço variável como uma sobremesa, ou um acompanhamento que o cliente pode
querer com qualquer sanduíche do cardápio, não um combo específico). A pesquisa de mercado
confirma que essa é uma categoria própria — o Toast POS chama de "Menu Upsells" e trata como
entidade separada de bundle/combo, exatamente a lacuna identificada.

**Nome do recurso:** "produtos correlacionados", escolhido de propósito pra não colidir com
"upsell", que no domínio do Ordin já significa outra coisa (trocar por combo com desconto).

**Prioridade combo > correlacionado — decisão fechada (2026-09-08):** `handleAddProduct` no
totem continua checando primeiro se o produto é componente de algum combo elegível
(`upsell_enabled`+`triggers_upsell`) — se achar, mantém o modal "Leve o Combo X" exatamente como
hoje, **sem nenhuma mudança de comportamento**. Só quando não há combo elegível é que a nova
checagem de produtos correlacionados entra em ação. É um `if`/`else if`: nunca os dois ao mesmo
tempo, então não existe cenário de dois modais concorrentes disputando o mesmo produto.

### Fluxo principal
1. Admin edita um produto existente no painel (`ProductEditScreen.tsx`) e vê uma nova seção
   "Produtos correlacionados".
2. Admin busca e seleciona um ou mais produtos ativos do catálogo da própria empresa pra
   correlacionar (ex.: em "Batata Frita", adiciona "Molho Barbecue" e "Molho Cheddar").
3. Admin salva — a correlação fica registrada só nessa direção (produto de origem → produtos
   sugeridos), sem criar automaticamente a correlação inversa.
4. No totem, cliente adiciona "Batata Frita" avulsa ao carrinho. Como não há combo elegível pra
   ela, o sistema verifica produtos correlacionados ativos e oferece a sugestão (ex.: "Que tal
   também um Molho Barbecue?").
5. Cliente aceita (produto sugerido é adicionado ao carrinho também) ou recusa (segue só com o
   produto original) — produto original sempre é adicionado ao carrinho independente da escolha.

### Fluxos alternativos / exceções
- Produto tem combo elegível E produtos correlacionados cadastrados → só o modal de combo
  aparece (prioridade combo > correlacionado, decisão fechada acima).
- Produto correlacionado sugerido está inativo (`active: false`) ou foi excluído
  (`deleted: true`) → não entra na lista de candidatos a sugestão, mesmo que a associação ainda
  exista no cadastro (mesmo padrão de soft-delete já usado em `Product`/`Category`/`Combo`).
- Produto sem nenhum combo elegível nem produtos correlacionados cadastrados → comportamento
  atual, adiciona direto ao carrinho sem nenhum modal.
- Admin tenta correlacionar um produto a ele mesmo → bloqueado na validação (sem sentido de
  negócio, produto não pode sugerir a si próprio).
- Produto de origem é excluído (`deleted: true`) → suas correlações somem junto (não aparecem
  mais como origem de sugestão); produtos que o tinham como *sugestão* também deixam de
  oferecê-lo, pela mesma checagem de `active`/`deleted` acima.

### Dependências
- Serviços envolvidos: `catalog` (nova tabela de associação produto-produto, novos endpoints ou
  extensão do endpoint de produto) e `frontend/admin` (`ProductEditScreen.tsx`) e
  `frontend/totem` (`CatalogScreen.tsx`, `handleAddProduct`).
- Depende do modelo já existente de `Combo`/`ComboItem` (ORD-112) como precedente estrutural, mas
  sem acoplamento de dado — é uma tabela nova, independente.
- Sem histórias bloqueantes.
- Fora de escopo, registrado à parte: sugestão automática/assistida por IA — roadmap futuro, ver
  `docs/analise-concorrentes-produtos-correlacionados.md` e
  `[[project_produtos_correlacionados_escopo]]`.

### Critérios de aceite funcionais
- [ ] Admin consegue, na edição de um produto, buscar e associar um ou mais produtos ativos do
      catálogo da mesma empresa como "produtos correlacionados".
- [ ] Admin consegue remover uma correlação já cadastrada.
- [ ] A correlação é unidirecional — cadastrar "Batata → Molho" não cria automaticamente
      "Molho → Batata".
- [ ] No totem, adicionar um produto avulso que tem produtos correlacionados ativos, e NÃO tem
      combo elegível, mostra a sugestão desses produtos.
- [ ] No totem, adicionar um produto avulso que tem combo elegível continua mostrando só o modal
      de combo (comportamento do ORD-150/157 inalterado), mesmo que esse produto também tenha
      produtos correlacionados cadastrados.
- [ ] Cliente pode aceitar (adiciona também o produto sugerido) ou recusar (segue só com o
      original) a sugestão — produto original é adicionado ao carrinho nos dois casos.
- [ ] Produto correlacionado inativo ou excluído não aparece como sugestão.
- [ ] Não é possível cadastrar um produto como correlacionado a ele mesmo.
- [ ] Isolamento multi-tenant: correlação cadastrada por uma empresa não aparece nem é editável
      por outra.

### Wireframe / Mockup
N/A — reaproveita padrão de busca+seleção múltipla já usado em outras associações do admin (ex.
seleção de produtos ao montar um `Combo` em `ComboFormScreen.tsx`).

## QA Explorer

```gherkin
Feature: Produtos correlacionados (cross-sell sem combo)
  Como admin da empresa
  Quero cadastrar produtos correlacionados a um produto do catálogo
  Para que o totem sugira esse item complementar sem depender de combo

  Background:
    Dado os produtos ativos "Batata Frita" e "Molho Barbecue" da empresa "Burger House"

  Scenario: Admin cadastra um produto correlacionado
    Quando o admin edita "Batata Frita" e adiciona "Molho Barbecue" como produto correlacionado
    E salva
    Então "Molho Barbecue" aparece na lista de produtos correlacionados de "Batata Frita"

  Scenario: Admin remove uma correlação já cadastrada
    Dado "Batata Frita" com "Molho Barbecue" como produto correlacionado
    Quando o admin remove essa correlação e salva
    Então "Molho Barbecue" não aparece mais na lista de correlacionados de "Batata Frita"

  Scenario: Correlação é unidirecional
    Dado "Batata Frita" com "Molho Barbecue" como produto correlacionado
    Quando o admin abre a edição de "Molho Barbecue"
    Então "Batata Frita" NÃO aparece automaticamente como correlacionado de "Molho Barbecue"

  Scenario: Admin não consegue correlacionar um produto a ele mesmo
    Quando o admin tenta adicionar "Batata Frita" como correlacionado dela própria
    Então o sistema bloqueia com um erro de validação
    E nenhuma correlação é salva

  Scenario: Sugestão aparece no totem quando não há combo elegível
    Dado "Batata Frita" com "Molho Barbecue" como produto correlacionado
    E "Batata Frita" não é componente de nenhum combo ativo
    Quando o cliente no totem adiciona "Batata Frita" avulsa ao carrinho
    Então aparece a sugestão oferecendo "Molho Barbecue"
    E "Batata Frita" já está no carrinho nesse momento

  Scenario: Combo tem prioridade sobre produto correlacionado
    Dado "Batata Frita" é componente do combo ativo "Combo Lanche Grande" com sugestão de upsell ligada
    E "Batata Frita" também tem "Molho Barbecue" como produto correlacionado
    Quando o cliente no totem adiciona "Batata Frita" avulsa ao carrinho
    Então aparece o modal de upsell do "Combo Lanche Grande"
    E a sugestão de produto correlacionado NÃO aparece

  Scenario: Cliente aceita a sugestão de produto correlacionado
    Dado a sugestão de "Molho Barbecue" apareceu após adicionar "Batata Frita"
    Quando o cliente aceita a sugestão
    Então "Molho Barbecue" é adicionado ao carrinho
    E "Batata Frita" continua no carrinho

  Scenario: Cliente recusa a sugestão de produto correlacionado
    Dado a sugestão de "Molho Barbecue" apareceu após adicionar "Batata Frita"
    Quando o cliente recusa a sugestão
    Então "Molho Barbecue" NÃO é adicionado ao carrinho
    E "Batata Frita" continua normalmente no carrinho

  Scenario: Múltiplos produtos correlacionados aparecem juntos na sugestão
    Dado "Batata Frita" com "Molho Barbecue" e "Molho Cheddar" como produtos correlacionados, ambos ativos
    E "Batata Frita" não é componente de nenhum combo ativo
    Quando o cliente no totem adiciona "Batata Frita" avulsa ao carrinho
    Então a sugestão oferece "Molho Barbecue" e "Molho Cheddar" juntos, não só o primeiro

  Scenario: Produto correlacionado inativo não aparece como sugestão
    Dado "Batata Frita" com "Molho Barbecue" como produto correlacionado
    E "Molho Barbecue" está com active: false
    Quando o cliente no totem adiciona "Batata Frita" avulsa ao carrinho
    Então nenhuma sugestão de "Molho Barbecue" aparece

  Scenario: Produto correlacionado excluído não aparece como sugestão
    Dado "Batata Frita" com "Molho Barbecue" como produto correlacionado
    E "Molho Barbecue" foi excluído (deleted: true)
    Quando o cliente no totem adiciona "Batata Frita" avulsa ao carrinho
    Então nenhuma sugestão de "Molho Barbecue" aparece

  Scenario: Produto de origem excluído deixa de disparar suas correlações
    Dado "Batata Frita" com "Molho Barbecue" como produto correlacionado
    Quando "Batata Frita" é excluída (deleted: true)
    Então a correlação não é mais consultada
    E "Molho Barbecue" não aparece mais como sugestão de "Batata Frita" em nenhum lugar

  Scenario: Produto sem combo e sem produtos correlacionados segue sem sugestão
    Dado um produto ativo sem nenhum combo elegível e sem produtos correlacionados cadastrados
    Quando o cliente no totem adiciona esse produto avulso ao carrinho
    Então o produto é adicionado direto, sem nenhum modal de sugestão

  Scenario: Isolamento multi-tenant
    Dado a empresa "Burger House" com "Batata Frita" correlacionada a "Molho Barbecue"
    Quando a empresa "Pasta & Co" consulta ou edita seus próprios produtos
    Então a correlação da "Burger House" não é visível nem editável pela "Pasta & Co"
```

**Cenários revisados e aprovados pelo PM:** sim — cobrem happy path (cadastrar/remover
correlação, sugestão aparecendo e sendo aceita/recusada), a borda mais arriscada da história
(prioridade combo > correlacionado, cenário que valida a decisão de coexistência do Explorer),
múltiplas sugestões simultâneas, os dois níveis de soft-delete (`active`/`deleted`) tanto do lado
sugerido quanto do lado de origem, unidirecionalidade, autocorrelação bloqueada, e isolamento
multi-tenant.

## Solução Técnica
Pendente — Tech Explorer, próxima fase do upstream.
