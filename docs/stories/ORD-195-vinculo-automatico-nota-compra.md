---
id: ORD-195
status: QA Explorer
estimativa: null
fase: null
sprint: null
responsavel: PM + Produto
---

# ORD-195 — Vínculo automático de itens de nota de compra por EAN/`cProd`

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

### Decisão de escopo — dois níveis de casamento, nesta ordem
1. **Por EAN** (`cEAN` do item ↔ `Product.ean` ou `Option.ean`, ativo, mesma empresa) — casamento
   direto, sem histórico prévio necessário. Já é seguro por construção: a pendência de EAN
   duplicado entre `Product`/`Option` foi fechada nesta mesma revisão (ver
   `docs/estudo-modulo-estoque-erp.md`, seção "Regra de negócio fechada... EAN duplicado") — nunca
   existe mais de um item **ativo** com o mesmo EAN na empresa, então o casamento por EAN nunca é
   ambíguo.
2. **Por código do fornecedor** (`cProd` do item ↔ tabela nova `supplier_product_code`, chave
   fornecedor + código) — casamento por histórico: só funciona se alguém já resolveu manualmente
   um item com esse `cProd` daquele fornecedor antes (isso é o que **C2**, história seguinte, faz
   ao resolver uma pendência — grava o mapeamento pra próxima nota do mesmo fornecedor já vincular
   sozinha). C1 **lê** essa tabela; quem **escreve** nela é C2. Na primeira nota de um fornecedor
   novo, esse segundo nível não tem efeito ainda — só o casamento por EAN funciona de cara.

Item que não casa por nenhum dos dois níveis fica **pendente** (sem vínculo, sinalizado, mas sem
travar a importação) — a resolução manual desses itens é escopo de **C2**, não desta história.

### Decisão de escopo — vínculo acontece na confirmação da nota, não é um passo separado
Diferente da prévia de B1 (que exige um clique explícito de "Confirmar importação"), o vínculo
automático **não** tem uma tela ou botão próprio — acontece como parte do mesmo
`POST /catalog/supplier-invoices` que já persiste a nota. Motivo: casamento por EAN é determinístico
e sem ambiguidade (ver decisão acima), não existe julgamento humano a pedir antes de aplicar — exigir
um clique extra só adicionaria fricção sem benefício. (Alternativa considerada e descartada: um
botão "Vincular" separado, populável depois da importação — rejeitada por não ter nenhum caso de uso
real que justifique adiar algo automático e seguro.)

### Decisão de escopo — conversão de unidade reaproveita G3/A5
A unidade da nota (`uCom`, ex: "CX" pra uma caixa de 24) pode ser diferente da unidade de compra
cadastrada no produto/opção (`unidade_compra`/`fator_conversao`, G3/`ORD-190` e A5/`ORD-184`). O
lançamento de estoque criado por C1 reaproveita a mesma conversão que a entrada manual (A2) já
aplica — não é lógica nova, é o mesmo cálculo com uma origem automática em vez de manual.

### Limitação conhecida — produto guarda-chuva não recebe entrada direta
Um produto marcado como guarda-chuva (`is_umbrella`, `ORD-189`) não tem `stock_item` próprio — quem
tem estoque são as opções filhas. Se o EAN de um item da nota casar com um `Product` guarda-chuva,
C1 **não pode** dar entrada nele diretamente (não existe onde lançar). Fica registrado como
limitação conhecida — o Tech Explorer decide se isso vira uma pendência automática (mesmo caminho
de "sem correspondência útil") ou um erro visível distinto ("achei o produto mas ele é guarda-chuva,
não dá pra lançar estoque nele").

### Fluxo principal
1. Empresa confirma a importação de uma nota de compra (fluxo de B1, sem mudança visível nesse passo).
2. Pra cada item da nota, o sistema tenta casar por EAN contra `Product`/`Option` ativos da empresa.
3. Item sem casamento por EAN é testado contra `supplier_product_code` (fornecedor + `cProd`).
4. Item que casou (por EAN ou por código do fornecedor) recebe entrada de estoque automática,
   convertendo unidade se necessário, e fica marcado como vinculado ao produto/opção encontrado.
5. Item que não casou por nenhum dos dois níveis fica marcado como pendente — sem vínculo, sem
   entrada de estoque, disponível pra resolução manual (C2, história seguinte).
6. Empresa vê, na tela de detalhe da nota (B1), quantos itens vincularam sozinhos e quantos ficaram
   pendentes.

### Fluxos alternativos / exceções
- **Item casa com um `Product` guarda-chuva**: sem lugar pra lançar estoque — tratado como limitação
  conhecida acima, comportamento exato a fechar no Tech Explorer.
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
- **Reaproveita**: A2 (`ORD-181`, mecanismo de entrada de estoque/`StockMovement` polimórfico),
  G3/A5 (`ORD-190`/`ORD-184`, conversão de unidade).
- **Histórias futuras que consomem esta**: C2 (fila de pendência com resolução inline — escreve em
  `supplier_product_code` e resolve os itens que C1 deixou pendentes); E4 (CMV automático, também
  listada como dependente de B1, mas se beneficia de C1 pra custo por lote real em vez de manual).

### Critérios de aceite funcionais
- [ ] Item de nota confirmada com EAN idêntico a um `Product` ou `Option` ativo da empresa recebe
      entrada de estoque automática, com a quantidade convertida pra unidade de compra do produto/
      opção quando a unidade da nota for diferente
- [ ] Item de nota confirmada com `cProd` que já tem mapeamento salvo em `supplier_product_code`
      pro mesmo fornecedor recebe entrada de estoque automática, mesmo sem EAN
- [ ] Item sem correspondência por nenhum dos dois métodos fica marcado como pendente, sem travar
      a confirmação da nota nem gerar erro
- [ ] Tela de detalhe da nota (B1) mostra, por item, se ele foi vinculado automaticamente (e a qual
      produto/opção) ou se ficou pendente
- [ ] Item que casa com um `Product` guarda-chuva não recebe entrada de estoque direta (comportamento
      exato — pendência ou erro distinto — decidido no Tech Explorer)
- [ ] `DELETE /catalog/supplier-invoices/{id}` passa a ser bloqueado se qualquer item da nota já
      gerou estoque que foi vendido (baixa efetivada) — antes de C1 essa checagem não existia porque
      não havia vínculo nenhum
- [ ] Casamento por EAN nunca é ambíguo (não pode achar mais de um `Product`/`Option` ativo com o
      mesmo EAN — já garantido pela regra de unicidade fechada antes desta história)

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
- **Se `supplier_product_code` guarda o vínculo por `Product` OU `Option` (colunas nullable, uma
  preenchida por vez) ou por uma FK polimórfica** — decisão de schema, Tech Explorer.

Nenhum desses três pontos é uma lacuna de escopo (todos têm um cenário de negócio claro) — são
detalhes de implementação que o Tech Explorer resolve normalmente. Pode avançar pro QA Explorer.

## QA Explorer

### Rastreabilidade — Critério de aceite → Cenário

| Critério de aceite (Explorer) | Cenário(s) Gherkin |
|---|---|
| EAN idêntico → entrada automática com conversão de unidade | `Vínculo automático por EAN idêntico`, `Conversão de unidade aplicada no lançamento automático` |
| `cProd` com mapeamento salvo → entrada automática mesmo sem EAN | `Vínculo automático por código do fornecedor já mapeado` |
| Sem correspondência → pendente, sem travar confirmação | `Item sem qualquer correspondência fica pendente` |
| Detalhe da nota mostra vinculado/pendente por item | (mesmo cenário dos dois itens acima — verifica o retorno da tela de detalhe) |
| Guarda-chuva não recebe entrada direta | `Item casa com produto guarda-chuva` |
| `DELETE` bloqueado se item já vendido | `Exclusão bloqueada após venda do estoque vinculado`, `Exclusão ainda permitida sem venda` |
| Casamento por EAN nunca ambíguo | `Regressão — dois itens ativos não podem ter o mesmo EAN` (cenário de garantia, não de comportamento novo) |

### Cenários Gherkin

```gherkin
Feature: Vínculo automático de itens de nota de compra por EAN/cProd
  Como Empresa
  Quero que os itens de uma nota de compra sejam conectados automaticamente ao catálogo
  Para que o estoque suba sozinho sem eu precisar lançar cada entrada na mão

  Background:
    Dado uma empresa com um produto "Refrigerante Lata 350ml" ativo, EAN "7891000100103"
    E uma nota de compra confirmada via B1 trazendo itens dessa mesma empresa

  # ── Vínculo por EAN (Critério 1) ──────────────────────────────────────

  Scenario: Vínculo automático por EAN idêntico
    Dado um item da nota com cEAN "7891000100103" e quantidade 24
    Quando a nota é confirmada
    Então o item fica vinculado ao Product "Refrigerante Lata 350ml"
    E uma entrada de estoque de 24 unidades é lançada nesse produto
    E o detalhe da nota mostra esse item como "vinculado automaticamente"

  Scenario: Conversão de unidade aplicada no lançamento automático
    Dado um produto com unidade_compra "CX" e fator_conversao 24 (1 caixa = 24 unidades)
    E um item da nota com cEAN desse produto, uCom "CX" e quantidade 2
    Quando a nota é confirmada
    Então a entrada de estoque lançada é de 48 unidades (2 caixas × 24)

  Scenario: EAN corresponde só a um produto/opção inativo — tratado como sem correspondência
    Dado um Product inativo com EAN "9990000000001"
    E um item da nota com cEAN "9990000000001"
    Quando a nota é confirmada
    Então o item NÃO é vinculado a esse produto inativo
    E o item fica marcado como pendente

  # ── Vínculo por código do fornecedor (Critério 2) ─────────────────────

  Scenario: Vínculo automático por código do fornecedor já mapeado
    Dado um mapeamento salvo em supplier_product_code pro fornecedor X, código "REF-X-350" → Product "Refrigerante Lata 350ml"
    E um item da nota do fornecedor X com cProd "REF-X-350" e cEAN vazio
    Quando a nota é confirmada
    Então o item fica vinculado ao Product "Refrigerante Lata 350ml"
    E uma entrada de estoque é lançada

  Scenario: Código do fornecedor sem mapeamento prévio não vincula sozinho
    Dado nenhum mapeamento salvo em supplier_product_code pro fornecedor X, código "NOVO-COD"
    E um item da nota do fornecedor X com cProd "NOVO-COD" e cEAN vazio
    Quando a nota é confirmada
    Então o item fica pendente
    E nenhuma entrada de estoque é lançada pra esse item

  Scenario: Mapeamento de cProd é isolado por fornecedor
    Dado um mapeamento salvo em supplier_product_code pro fornecedor X, código "COD-01" → Product A
    E um item de uma nota do fornecedor Y (diferente) com o mesmo cProd "COD-01"
    Quando a nota é confirmada
    Então o item do fornecedor Y NÃO é vinculado ao Product A
    E fica pendente (o mapeamento de X não vale pra Y)

  # ── Pendência (Critério 3) ────────────────────────────────────────────

  Scenario: Item sem qualquer correspondência fica pendente
    Dado um item da nota com cEAN vazio e cProd sem mapeamento salvo
    Quando a nota é confirmada
    Então a confirmação da nota continua tendo sucesso (status 201)
    E o item fica marcado como pendente, sem entrada de estoque
    E os outros itens da mesma nota que casaram continuam vinculados normalmente

  # ── Limitação guarda-chuva (Critério 5) ───────────────────────────────

  Scenario: Item casa com produto guarda-chuva
    Dado um Product guarda-chuva (is_umbrella=true) ativo com EAN "5550000000001"
    E um item da nota com cEAN "5550000000001"
    Quando a nota é confirmada
    Então nenhuma entrada de estoque é lançada diretamente no produto guarda-chuva
    E o item fica sinalizado como não resolvido automaticamente (mecanismo exato — mesma
      fila de "pendente" ou um estado distinto — decidido no Tech Explorer)

  # ── Bloqueio de exclusão pós-venda (Critério 6) ───────────────────────

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
    Dado um Product da empresa A com EAN "1112223334445"
    E uma nota confirmada pela empresa B com um item usando o mesmo EAN "1112223334445"
    Quando a nota da empresa B é confirmada
    Então o item NÃO é vinculado ao Product da empresa A
    E fica pendente (correspondência só é buscada dentro da própria empresa)

  # ── Regressão — garantia herdada da regra de EAN único ────────────────

  Scenario: Regressão — dois itens ativos não podem ter o mesmo EAN
    Dado um Product ativo com EAN "7891000100103"
    Quando alguém tenta ativar uma Option com o mesmo EAN "7891000100103" na mesma empresa
    Então a ativação é rejeitada (regra já existente, _check_active_code_conflict)
    E isso garante que o casamento por EAN em C1 nunca encontra dois itens ativos ao mesmo tempo
```

### Lacunas encontradas
- **Fator de conversão ausente**: se um item da nota tem `uCom` diferente da `unidade_compra` do
  produto casado, mas o produto não tem `fator_conversao` cadastrado (campo nullable, G3/A5), o
  Explorer não define o que acontece — vincula sem converter (quantidade errada), vincula mas com
  aviso, ou vira pendência por falta de dado suficiente? **Bloqueador pro Tech Explorer decidir**,
  não é um "detalhe de implementação" — muda o resultado que a Empresa vê no estoque.
- **`supplier_product_code` sem fornecedor ainda cadastrado**: não deveria acontecer na prática
  (B1 sempre cria o `Supplier` antes de gravar `supplier_invoice_item`), mas vale um teste de
  sanidade garantindo que o lookup por `(fornecedor_id, cProd)` nunca levanta erro se não achar
  nada — só retorna "sem mapeamento", tratado como pendência.

### O que ainda impede o avanço pro Tech Explorer
Nada bloqueia — a lacuna do fator de conversão é uma pergunta a **responder no** Tech Explorer, não
uma pendência que impede ele de começar (o cenário de teste já existe, só falta a resposta certa).
Cenários revisados e alinhados com os 7 critérios de aceite do Explorer, com 1:1 confirmado na
tabela de rastreabilidade acima.
