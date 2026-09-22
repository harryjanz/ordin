---
id: ORD-195
status: QA Explorer
estimativa: null
fase: null
sprint: null
responsavel: PM + Produto
---

# ORD-195 — Vínculo automático de itens de nota de compra por EAN/GTIN de embalagem/`cProd`

## Descrição
História **C1** do épico de estoque/ERP (`docs/estudo-modulo-estoque-erp.md`, Bloco C — Vínculo
automático). Depende de A1 (`ORD-180`, EAN em Product), A6 (`ORD-182`, fornecedor) e B1 (`ORD-194`,
upload de XML — mergeada). Conecta os itens brutos de uma nota de compra já importada (B1) a
`Product`/`Option` do catálogo e dá entrada em estoque automaticamente pros itens que casarem —
sem essa história, B1 sozinho só guarda histórico, o estoque continua 100% manual.

## Persona
**Empresa** (owner/manager/admin que faz a gestão de compras/estoque) — mesma persona de B1.

## Explorer

### História
Como **Empresa**, quero que os itens de uma nota de compra já importada sejam conectados
automaticamente aos produtos/opções do meu catálogo, para que o estoque suba sozinho sem eu
precisar digitar cada entrada manualmente.

### Contexto e motivação
B1 (`ORD-194`) já resolve a parte de "não digitar a nota inteira na mão", mas entrega só
**histórico estruturado** — os itens ficam guardados em `supplier_invoice_item` como texto/números
brutos do XML, sem nenhum vínculo com o catálogo. Hoje, mesmo depois de importar a nota, a Empresa
ainda precisa abrir cada produto e lançar a entrada de estoque manualmente (A2, `ORD-181`) — exatamente
o trabalho que B1 prometia eliminar. C1 fecha esse ciclo: usa os dados que a nota já trouxe (EAN, ou
o código do próprio fornecedor) pra achar o produto/opção correspondente e lançar a entrada sozinho.

**Validado com simulação antes de escrever esta história**: uma nota fictícia de bebidas (ver
`docs/exemples/FN/nfe_fake_bebidas_c1_demo.xml` e o mapa publicado na conversa) mostrou, com dados
reais do catálogo, que 2 de 4 itens teriam vínculo imediato por EAN idêntico, e 2 ficariam sem
correspondência — confirmando que a maioria dos itens vincula sozinho, mas uma fila de pendência
pro resto (**C2**) é indispensável, não um caso raro.

### Decisão de escopo — três níveis de casamento, nesta ordem (revisado 2026-09-22: GTIN por embalagem, não conversão numérica)
**Achado do usuário, confirmado pela prática real do setor (padrão GS1)**: cada nível de embalagem
de um produto tem o **próprio** EAN/GTIN — não é o mesmo código com uma "quantidade diferente". Uma
lata de Coca-Cola 350ml tem um EAN-13 (ex: `7894900010015`); o fardo fechado com 12 latas tem um
EAN-13 **genuinamente diferente**, atribuído pelo fabricante (ex: `7894900011340`), ou um DUN-14 se
for caixa master. O motivo de existir é justamente permitir separar faturamento/estoque de "uma
lata" vs. "um fardo fechado" — se fossem o mesmo código, PDV nenhum conseguiria diferenciar. Isso
**substitui** a decisão original desta seção (que tentava resolver isso como conversão numérica via
`fator_conversao`/`unidade_compra`, G3/A5) — o problema real não é "que fator aplicar a um código
que bate", é "eu reconheço esse código de barras específico".

1. **EAN da unidade de venda** (`cEAN` do item ↔ `Product.ean`/`Option.ean`) — casamento direto, 1
   pra 1, sem multiplicador (a quantidade da nota já está na mesma unidade do produto cadastrado).
   Seguro por construção — nunca ambíguo, ver regra de EAN único já fechada.
2. **GTIN alternativo de embalagem já conhecido** (`cEAN` do item ↔ tabela nova `product_gtin_alt`)
   — GTIN de pacote é do **fabricante**, não do distribuidor: o mesmo fardo de 12 latas tem o mesmo
   código não importa qual fornecedor vendeu. Quando esse GTIN já foi cadastrado antes (aponta pra
   um `Product`/`Option` + quantidade por unidade, ex: "esse código = 12× este produto"), o
   casamento é automático e a quantidade multiplicada é **fato de catálogo**, não estimativa.
3. **Código do fornecedor** (`cProd` do item ↔ tabela nova `supplier_product_code`, chave fornecedor
   + código) — mesmo mecanismo já descrito: só funciona se alguém já resolveu manualmente um item
   com esse `cProd` daquele fornecedor antes.

Os níveis 2 e 3 são **lidos** por C1, mas **escritos** por C2 (é lá que a Empresa resolve uma
pendência manualmente pela primeira vez). Na primeira nota que traz um GTIN de pacote nunca visto,
só o nível 1 funciona de cara — depois da primeira resolução manual, esse GTIN específico passa a
casar sozinho em **qualquer** nota futura, de **qualquer** fornecedor (é do fabricante, não do
distribuidor — diferença importante em relação ao nível 3, que é preso a um fornecedor específico).

Item cujo `cEAN`/`cProd` não bate em nenhum dos três níveis fica **pendente** (sem vínculo,
sinalizado, mas sem travar a importação) — resolução manual é escopo de **C2**, não desta história.
`fator_conversao`/`unidade_compra` (G3/A5) continuam existindo pra entrada manual (A2), sem mudança
— só deixam de ser usados **por esta história**, que resolve o problema de um jeito mais seguro
(GTIN real e verificável em vez de fator genérico assumido).

### Decisão de escopo — vínculo acontece na confirmação da nota, não é um passo separado
Diferente da prévia de B1 (que exige um clique explícito de "Confirmar importação"), o vínculo
automático **não** tem uma tela ou botão próprio — acontece como parte do mesmo
`POST /catalog/supplier-invoices` que já persiste a nota. Motivo: os três níveis de casamento são
determinísticos e sem ambiguidade (ver decisão acima), não existe julgamento humano a pedir antes
de aplicar — exigir um clique extra só adicionaria fricção sem benefício. (Alternativa considerada e
descartada: um botão "Vincular" separado, populável depois da importação — rejeitada por não ter
nenhum caso de uso real que justifique adiar algo automático e seguro.)

### Limitação conhecida — produto guarda-chuva não recebe entrada direta
Um produto marcado como guarda-chuva (`is_umbrella`, `ORD-189`) não tem `stock_item` próprio — quem
tem estoque são as opções filhas. Se o EAN de um item da nota casar com um `Product` guarda-chuva,
C1 **não pode** dar entrada nele diretamente (não existe onde lançar). Fica registrado como
limitação conhecida — o Tech Explorer decide se isso vira uma pendência automática (mesmo caminho
de "sem correspondência útil") ou um erro visível distinto ("achei o produto mas ele é guarda-chuva,
não dá pra lançar estoque nele").

### Fluxo principal
1. Empresa confirma a importação de uma nota de compra (fluxo de B1, sem mudança visível nesse passo).
2. Pra cada item da nota, o sistema tenta casar o `cEAN` contra `Product.ean`/`Option.ean` (EAN da
   unidade de venda) — nível 1.
3. Sem casar no nível 1, tenta casar o `cEAN` contra `product_gtin_alt` (GTIN de embalagem/pacote
   já conhecido) — nível 2. Se achar, aplica a quantidade por unidade já cadastrada pra esse GTIN.
4. Sem casar nos níveis 1 e 2, tenta casar o `cProd` contra `supplier_product_code` (fornecedor +
   código) — nível 3.
5. Item que casou em qualquer um dos três níveis recebe entrada de estoque automática com a
   quantidade correta (multiplicada quando veio do nível 2) — vinculado, sem toque humano.
6. Item que não casou em nenhum dos três níveis fica marcado como pendente — sem vínculo, sem
   entrada de estoque, disponível pra resolução manual (C2, história seguinte).
7. Empresa vê, na tela de detalhe da nota (B1), o estado de cada item: vinculado automaticamente
   (e por qual dos três níveis) ou pendente.

### Fluxos alternativos / exceções
- **Item casa com um `Product` guarda-chuva**: sem lugar pra lançar estoque — tratado como limitação
  conhecida acima, comportamento exato a fechar no Tech Explorer.
- **`cEAN` da nota é um GTIN de embalagem nunca visto** (fardo/caixa sem cadastro em
  `product_gtin_alt` ainda): não casa em nenhum nível, vira pendência igual a qualquer outra — a
  diferença é que, quando a Empresa resolve manualmente (C2), ela não está só escolhendo um produto,
  está **ensinando um GTIN novo** (esse código = N unidades desse produto), que passa a valer pra
  qualquer fornecedor dali em diante.
- **Nota já confirmada antes de C1 existir** (toda nota importada via B1 até aqui): não é
  revinculada retroativamente por esta história — aplicação retroativa é explicitamente escopo de
  **C2** ("fila de pendência... e aplicação retroativa de estoque").
- **Exclusão de nota com itens já vinculados e vendidos**: já é regra fechada desde a revisão de B1
  (ver `docs/estudo-modulo-estoque-erp.md`) — bloquear `DELETE /catalog/supplier-invoices/{id}` nesse
  caso é **parte desta história**, já que é C1 que passa a existir o vínculo que torna a exclusão
  perigosa.

### Dependências
- **Depende de A1** (`ORD-180`, EAN em Product — mergeada), **A6** (`ORD-182`, fornecedor —
  mergeada), **B1** (`ORD-194`, upload de XML — mergeada).
- **Reaproveita**: A2 (`ORD-181`, mecanismo de entrada de estoque/`StockMovement` polimórfico).
  **Não reaproveita** G3/A5 (`fator_conversao`/`unidade_compra`) — resolvido por GTIN real
  (nível 2) em vez de fator numérico assumido; G3/A5 continuam intactos pra entrada manual (A2).
- **Histórias futuras que consomem esta**: C2 (fila de pendência com resolução inline — escreve em
  `product_gtin_alt` e em `supplier_product_code`, resolvendo os itens que C1 deixou pendentes);
  E4 (CMV automático, também listada como dependente de B1, mas se beneficia de C1 pra custo por
  lote real em vez de manual).

### Critérios de aceite funcionais
- [ ] Item de nota confirmada com EAN idêntico ao EAN de venda de um `Product`/`Option` ativo da
      empresa recebe entrada de estoque automática 1:1, sem intervenção humana
- [ ] Item de nota confirmada com `cEAN` batendo num GTIN de embalagem já cadastrado em
      `product_gtin_alt` recebe entrada de estoque automática, com a quantidade multiplicada pela
      quantidade por unidade cadastrada pra esse GTIN
- [ ] Item de nota confirmada com `cProd` que já tem mapeamento salvo em `supplier_product_code`
      pro mesmo fornecedor recebe entrada de estoque automática, mesmo sem EAN
- [ ] Item sem correspondência em nenhum dos três níveis fica marcado como pendente (sem vínculo
      nenhum), sem travar a confirmação da nota nem gerar erro
- [ ] Tela de detalhe da nota (B1) mostra, por item, se foi vinculado automaticamente (e por qual
      dos três níveis) ou se ficou pendente
- [ ] Item que casa com um `Product` guarda-chuva não recebe entrada de estoque direta (comportamento
      exato — pendência ou erro distinto — decidido no Tech Explorer)
- [ ] `DELETE /catalog/supplier-invoices/{id}` passa a ser bloqueado se qualquer item da nota já
      gerou estoque que foi vendido (baixa efetivada) — antes de C1 essa checagem não existia porque
      não havia vínculo nenhum
- [ ] Casamento por EAN de venda (nível 1) nunca é ambíguo (não pode achar mais de um `Product`/
      `Option` ativo com o mesmo EAN — já garantido pela regra de unicidade fechada antes desta
      história)
- [ ] `product_gtin_alt` também respeita unicidade por empresa — o mesmo GTIN de embalagem não pode
      apontar pra dois produtos/opções diferentes na mesma empresa ao mesmo tempo

## Wireframe / Mockup
Não introduz tela nova — estende a tela de detalhe de nota já existente (B1,
`SupplierInvoiceScreen.tsx`, view `"detail"`) com uma coluna ou indicador por item mostrando o
resultado do vínculo (ex: tag "Vinculado — Product #6" / tag "Pendente"). Mockup detalhado fica pro
Tech Explorer de frontend.

## O que ainda está vago pra avançar ao QA Explorer
- **Formato exato do indicador de vínculo na tela de detalhe** (tag, coluna nova, ícone) — decisão
  de frontend, não bloqueia QA Explorer (cenários Gherkin testam o dado, não o pixel).
- **Comportamento exato pro caso guarda-chuva** (pendência automática vs. erro visível distinto) —
  fica como pergunta explícita pro Tech Explorer, não impede escrever os cenários de QA (o
  cenário em si — "item casa com guarda-chuva" — já está claro, só a resposta exata que falta).
- **Se `supplier_product_code`/`product_gtin_alt` guardam o vínculo por `Product` OU `Option`
  (colunas nullable, uma preenchida por vez) ou por uma FK polimórfica** — decisão de schema, Tech
  Explorer.
- **Onde a Empresa cadastra manualmente um GTIN de embalagem novo fora do fluxo de pendência** (ex:
  já sabe de antemão que o fardo de 12 tem tal código, sem esperar a próxima nota cair em
  pendência) — não é bloqueador (C2 cobre o caso reativo), mas vale perguntar ao Tech Explorer se
  faz sentido já deixar um cadastro proativo em algum lugar do catálogo, ou se fica só reativo por
  enquanto e uma história futura resolve.

Nenhum desses pontos é uma lacuna de escopo (todos têm um cenário de negócio claro) — são detalhes
de implementação que o Tech Explorer resolve normalmente. Pode avançar pro QA Explorer.

## QA Explorer

### Rastreabilidade — Critério de aceite → Cenário

| Critério de aceite (Explorer) | Cenário(s) Gherkin |
|---|---|
| EAN de venda idêntico (nível 1) → entrada automática 1:1 | `Vínculo por EAN de venda (nível 1)` |
| GTIN de embalagem conhecido (nível 2) → entrada automática multiplicada | `Vínculo por GTIN de embalagem conhecido (nível 2)`, `GTIN de embalagem vale pra qualquer fornecedor` |
| `cProd` mapeado (nível 3) → entrada automática mesmo sem EAN | `Vínculo por código do fornecedor já mapeado (nível 3)`, `Mapeamento de cProd é isolado por fornecedor` |
| Sem correspondência nos três níveis → pendente, sem travar confirmação | `Item sem qualquer correspondência fica pendente`, `GTIN de embalagem nunca visto vira pendência` |
| Detalhe da nota mostra vinculado (por qual nível) ou pendente | (mesmos cenários acima — cada um verifica o estado retornado pra tela de detalhe) |
| Guarda-chuva não recebe entrada direta | `Item casa com produto guarda-chuva` |
| `DELETE` bloqueado se item já vendido | `Exclusão bloqueada após venda do estoque vinculado`, `Exclusão ainda permitida sem venda` |
| EAN de venda nunca ambíguo (nível 1) | `Regressão — dois itens ativos não podem ter o mesmo EAN` |
| `product_gtin_alt` único por empresa | `Regressão — GTIN de embalagem não pode apontar pra dois produtos` |

### Cenários Gherkin

```gherkin
Feature: Vínculo automático de itens de nota de compra por EAN/GTIN de embalagem/cProd
  Como Empresa
  Quero que os itens de uma nota de compra sejam conectados automaticamente ao catálogo
  Para que o estoque suba sozinho sem eu precisar lançar cada entrada na mão

  Background:
    Dado uma empresa com um produto "Coca-Cola Lata 350ml" ativo, EAN de venda "7894900010015"
    E uma nota de compra confirmada via B1 trazendo itens dessa mesma empresa

  # ── Nível 1: EAN de venda ──────────────────────────────────────────────

  Scenario: Vínculo por EAN de venda (nível 1)
    Dado um item da nota com cEAN "7894900010015" (mesmo EAN da lata) e quantidade 24
    Quando a nota é confirmada
    Então o item fica vinculado ao Product "Coca-Cola Lata 350ml" via EAN de venda
    E uma entrada de estoque de 24 unidades é lançada nesse produto
    E o detalhe da nota mostra esse item como "vinculado automaticamente (EAN)"

  Scenario: EAN corresponde só a um produto/opção inativo — tratado como sem correspondência
    Dado um Product inativo com EAN "9990000000001"
    E um item da nota com cEAN "9990000000001"
    Quando a nota é confirmada
    Então o item NÃO é vinculado a esse produto inativo
    E o item fica marcado como pendente

  # ── Nível 2: GTIN de embalagem (achado do usuário — cada nível de pacote tem GTIN próprio) ──

  Scenario: Vínculo por GTIN de embalagem conhecido (nível 2)
    Dado um GTIN de fardo "7894900011340" cadastrado em product_gtin_alt, apontando pro Product
      "Coca-Cola Lata 350ml" com quantidade_por_unidade 12
    E um item da nota com cEAN "7894900011340" (o GTIN do fardo, não da lata) e quantidade 5
    Quando a nota é confirmada
    Então o item fica vinculado ao Product "Coca-Cola Lata 350ml" via GTIN de embalagem
    E uma entrada de estoque de 60 unidades é lançada (5 fardos × 12 latas)
    E o detalhe da nota mostra esse item como "vinculado automaticamente (embalagem)"

  Scenario: GTIN de embalagem vale pra qualquer fornecedor
    Dado o mesmo GTIN de fardo "7894900011340" cadastrado em product_gtin_alt (fabricante, não é
      preso a um fornecedor)
    E duas notas confirmadas de fornecedores DIFERENTES, ambas trazendo um item com esse cEAN
    Quando as duas notas são confirmadas
    Então o item de cada nota vincula automaticamente, independente de qual fornecedor vendeu

  Scenario: GTIN de embalagem nunca visto vira pendência
    Dado nenhum cadastro em product_gtin_alt pro código "7894900099999"
    E um item da nota com cEAN "7894900099999" (não bate no EAN de venda de nenhum produto)
    Quando a nota é confirmada
    Então o item fica pendente
    E nenhuma entrada de estoque é lançada pra esse item

  # ── Nível 3: código do fornecedor ──────────────────────────────────────

  Scenario: Vínculo por código do fornecedor já mapeado (nível 3)
    Dado um mapeamento salvo em supplier_product_code pro fornecedor X, código "REF-X-350" →
      Product "Coca-Cola Lata 350ml"
    E um item da nota do fornecedor X com cProd "REF-X-350" e cEAN vazio
    Quando a nota é confirmada
    Então o item fica vinculado ao Product "Coca-Cola Lata 350ml" via código do fornecedor
    E uma entrada de estoque é lançada

  Scenario: Mapeamento de cProd é isolado por fornecedor
    Dado um mapeamento salvo em supplier_product_code pro fornecedor X, código "COD-01" → Product A
    E um item de uma nota do fornecedor Y (diferente) com o mesmo cProd "COD-01"
    Quando a nota é confirmada
    Então o item do fornecedor Y NÃO é vinculado ao Product A
    E fica pendente (o mapeamento de X não vale pra Y — diferente do GTIN de embalagem, que vale
      pra qualquer fornecedor)

  # ── Sem correspondência em nenhum nível ────────────────────────────────

  Scenario: Item sem qualquer correspondência fica pendente
    Dado um item da nota com cEAN vazio e cProd sem mapeamento salvo
    Quando a nota é confirmada
    Então a confirmação da nota continua tendo sucesso (status 201)
    E o item fica marcado como pendente, sem entrada de estoque
    E os outros itens da mesma nota que casaram (por qualquer um dos três níveis) continuam
      vinculados normalmente

  # ── Limitação guarda-chuva ─────────────────────────────────────────────

  Scenario: Item casa com produto guarda-chuva
    Dado um Product guarda-chuva (is_umbrella=true) ativo com EAN de venda "5550000000001"
    E um item da nota com cEAN "5550000000001"
    Quando a nota é confirmada
    Então nenhuma entrada de estoque é lançada diretamente no produto guarda-chuva
    E o item fica sinalizado como não resolvido automaticamente (mecanismo exato — mesma
      fila de "pendente" ou um estado distinto — decidido no Tech Explorer)

  # ── Bloqueio de exclusão pós-venda ─────────────────────────────────────

  Scenario: Exclusão bloqueada após venda do estoque vinculado
    Dado uma nota confirmada com um item vinculado que gerou entrada de estoque
    E esse estoque já foi baixado por uma venda
    Quando a Empresa tenta excluir a nota
    Então a exclusão é rejeitada com uma mensagem explicando o motivo
    E a nota continua existindo

  Scenario: Exclusão ainda permitida sem venda
    Dado uma nota confirmada com itens vinculados, mas nenhum estoque gerado por ela foi vendido ainda
    Quando a Empresa exclui a nota
    Então a exclusão funciona normalmente (mesmo comportamento já existente desde B1)

  # ── Isolamento multi-tenant ────────────────────────────────────────────

  Scenario: Vínculo nunca atravessa empresas
    Dado um Product da empresa A com EAN de venda "1112223334445"
    E uma nota confirmada pela empresa B com um item usando o mesmo EAN "1112223334445"
    Quando a nota da empresa B é confirmada
    Então o item NÃO é vinculado ao Product da empresa A
    E fica pendente (correspondência só é buscada dentro da própria empresa, nos três níveis)

  Scenario: GTIN de embalagem cadastrado pela empresa A não vaza pra empresa B
    Dado um GTIN de fardo cadastrado em product_gtin_alt só pela empresa A
    E uma nota confirmada pela empresa B trazendo um item com esse mesmo cEAN
    Quando a nota da empresa B é confirmada
    Então o item da empresa B NÃO vincula automaticamente
    E fica pendente (GTIN de embalagem é global de fabricante, mas o CADASTRO dele em
      product_gtin_alt é por empresa — cada empresa ensina o próprio catálogo)

  # ── Regressão — garantias herdadas das regras de unicidade ────────────

  Scenario: Regressão — dois itens ativos não podem ter o mesmo EAN de venda
    Dado um Product ativo com EAN "7894900010015"
    Quando alguém tenta ativar uma Option com o mesmo EAN "7894900010015" na mesma empresa
    Então a ativação é rejeitada (regra já existente, _check_active_code_conflict)
    E isso garante que o casamento de nível 1 em C1 nunca encontra dois itens ativos ao mesmo tempo

  Scenario: Regressão — GTIN de embalagem não pode apontar pra dois produtos
    Dado um GTIN de fardo já cadastrado em product_gtin_alt apontando pro Product A
    Quando alguém tenta cadastrar o mesmo GTIN apontando pro Product B (mesma empresa)
    Então o cadastro é rejeitado
    E isso garante que o casamento de nível 2 em C1 também nunca é ambíguo
```

### Lacunas encontradas
- **`product_gtin_alt` sem fornecedor ainda cadastrado**: mesmo teste de sanidade do `cProd` —
  garantir que o lookup por `cEAN` em `product_gtin_alt` nunca levanta erro se não achar nada, só
  retorna "sem mapeamento", tratado como pendência.
- **Quantidade fracionária multiplicada**: se `quantidade_por_unidade` do GTIN de embalagem for,
  por exemplo, 6 e a nota trouxer `qCom` fracionário (ex: 2.5 fardos — incomum, mas a NF-e permite
  `qCom` decimal), o resultado multiplicado também é fracionário. Não é um bloqueador — mesma
  situação que já existe hoje em qualquer conversão de unidade — mas vale um cenário de teste
  explícito no Tech Explorer pra confirmar que não há arredondamento silencioso incorreto.

### O que ainda impede o avanço pro Tech Explorer
Nada bloqueia. Cenários revisados e alinhados com os 9 critérios de aceite do Explorer, com 1:1
confirmado na tabela de rastreabilidade acima — incluindo os dois cenários de regressão que
formalizam as garantias de unicidade (EAN de venda e GTIN de embalagem) que o casamento automático
depende pra nunca ser ambíguo.
