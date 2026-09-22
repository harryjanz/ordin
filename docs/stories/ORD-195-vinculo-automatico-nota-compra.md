---
id: ORD-195
status: Ready
estimativa: 8 pontos (revisado de 5, Tech Explorer)
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

1. **EAN da unidade de venda, com refinamento por `qTrib`/`uTrib`** (`cEAN` do item ↔
   `Product.ean`/`Option.ean`) — casamento direto, 1 pra 1. A quantidade lançada é `qTrib` (não
   `qCom`) sempre que a nota declarar `uTrib`/`qTrib` **diferentes** de `uCom`/`qCom` **e** a
   consistência bater (`qTrib × vUnTrib ≈ vProd`, dentro de uma tolerância de arredondamento) —
   esse é o mecanismo oficial da própria NF-e pra declarar "vendido em fardo, mas controlado por
   unidade" (achado do usuário, pesquisa de padrão de mercado pra itens com substituição
   tributária). **Achado técnico, verificação empírica**: rodei contra os 41 XMLs reais
   vendorizados pela `nfelib` (não só os 7 já usados nos testes de B1) — em **nenhum** `qTrib`
   diverge de `qCom`. O mecanismo é real e vale a pena aproveitar quando aparece (é de graça,
   verificável, e tem peso fiscal por trás pra ser confiável), mas **não pode ser o mecanismo
   principal** — na prática observada até agora, nunca é populado diferente. Quando `qTrib` não
   diverge (o caso comum), o casamento é simplesmente 1:1 com `qCom`, sem multiplicador, e nunca é
   ambíguo — ver regra de EAN único já fechada.
2. **GTIN alternativo de embalagem já conhecido** (`cEAN` do item ↔ tabela nova `product_gtin_alt`)
   — pro caso, mais comum na prática que o `qTrib` divergente, em que o pacote/fardo tem um EAN
   **genuinamente diferente** do EAN da unidade de venda, atribuído pelo fabricante (ex: lata
   `7894900010015`, fardo de 12 `7894900011340`). GTIN de pacote é do **fabricante**, não do
   distribuidor — o mesmo fardo tem o mesmo código não importa qual fornecedor vendeu. Quando esse
   GTIN já foi cadastrado antes (aponta pra um `Product`/`Option` + quantidade por unidade), o
   casamento é automático e a quantidade multiplicada é **fato de catálogo**, não estimativa.
3. **Código do fornecedor** (`cProd` do item ↔ tabela nova `supplier_product_code`, chave fornecedor
   + código) — mesmo mecanismo já descrito: só funciona se alguém já resolveu manualmente um item
   com esse `cProd` daquele fornecedor antes.

Os níveis 2 e 3 são **lidos** por C1, mas **escritos** por C2 (é lá que a Empresa resolve uma
pendência manualmente pela primeira vez). Na primeira nota que traz um GTIN de pacote nunca visto
(e sem `qTrib` divergente pra salvar o casamento), só o nível 1 funciona de cara — depois da
primeira resolução manual, esse GTIN específico passa a casar sozinho em **qualquer** nota futura,
de **qualquer** fornecedor (é do fabricante, não do distribuidor — diferença importante em relação
ao nível 3, que é preso a um fornecedor específico).

Item cujo `cEAN`/`cProd` não bate em nenhum dos três níveis fica **pendente** (sem vínculo,
sinalizado, mas sem travar a importação) — resolução manual é escopo de **C2**, não desta história.
`fator_conversao`/`unidade_compra` (G3/A5) continuam existindo pra entrada manual (A2), sem mudança
— só deixam de ser usados **por esta história**, que resolve o problema com sinais verificáveis da
própria nota (`qTrib`) ou de catálogo (`product_gtin_alt`) em vez de um fator genérico assumido.

### Achado do usuário — venda simultânea do pacote inteiro E decomposto: fora de escopo de C1
Cenário real trazido pelo usuário: uma distribuidora de bebidas pode querer vender **tanto** o
fardo fechado **quanto** a lata avulsa como produtos separados do próprio catálogo — e uma única
entrega pode precisar ser **dividida** entre os dois (ex: dos 100 fardos recebidos, manter 60 como
fardo e decompor 40 em 480 latas avulsas). Essa divisão é uma decisão de negócio tomada a cada
entrega, não uma regra fixa do GTIN — por definição, não dá pra automatizar (não existe "regra" pra
aprender quando a proporção muda a cada nota).

**Decisão de escopo**: se a Empresa vende o fardo como produto próprio, basta cadastrar esse
`Product`/`Option` com o EAN do fardo — cai direto no nível 1, sem nada especial. Uma entrega que
precisa ser **dividida** entre dois produtos de destino nunca casa automaticamente (nenhum dos três
níveis resolve "uma parte aqui, outra parte ali") — sempre vira pendência, e a resolução (**C2**)
precisa suportar dividir a quantidade de um item entre **múltiplos** produtos de destino, não só
escolher um. Isso é um requisito novo pro Explorer de C2, registrado aqui pra não se perder.

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
   unidade de venda) — nível 1. Se casar, a quantidade lançada é `qTrib` quando a nota declarar
   `qTrib`/`uTrib` diferentes de `qCom`/`uCom` de forma consistente (`qTrib × vUnTrib ≈ vProd`) —
   senão, `qCom` direto.
3. Sem casar no nível 1, tenta casar o `cEAN` contra `product_gtin_alt` (GTIN de embalagem/pacote
   já conhecido) — nível 2. Se achar, aplica a quantidade por unidade já cadastrada pra esse GTIN.
4. Sem casar nos níveis 1 e 2, tenta casar o `cProd` contra `supplier_product_code` (fornecedor +
   código) — nível 3.
5. Item que casou em qualquer um dos três níveis recebe entrada de estoque automática com a
   quantidade correta — vinculado, sem toque humano.
6. Item que não casou em nenhum dos três níveis fica marcado como pendente — sem vínculo, sem
   entrada de estoque, disponível pra resolução manual (C2, história seguinte).
7. Empresa vê, na tela de detalhe da nota (B1), o estado de cada item: vinculado automaticamente
   (e por qual dos três níveis) ou pendente.

### Fluxos alternativos / exceções
- **Item casa com um `Product` guarda-chuva**: sem lugar pra lançar estoque — tratado como limitação
  conhecida acima, comportamento exato a fechar no Tech Explorer.
- **`cEAN` da nota é um GTIN de embalagem nunca visto** (fardo/caixa sem cadastro em
  `product_gtin_alt` ainda, e sem `qTrib` divergente pra salvar): não casa em nenhum nível, vira
  pendência igual a qualquer outra — a diferença é que, quando a Empresa resolve manualmente (C2),
  ela não está só escolhendo um produto, está **ensinando um GTIN novo** (esse código = N unidades
  desse produto), que passa a valer pra qualquer fornecedor dali em diante.
- **Entrega precisa ser dividida entre dois produtos de destino** (ex: fardo vendido em parte
  inteiro, em parte decomposto — achado do usuário, ver seção acima): nunca casa automaticamente,
  sempre pendência — C2 precisa suportar dividir a quantidade entre múltiplos produtos.
- **Nota já confirmada antes de C1 existir** (toda nota importada via B1 até aqui): não é
  revinculada retroativamente por esta história — aplicação retroativa é explicitamente escopo de
  **C2** ("fila de pendência... e aplicação retroativa de estoque").
- **Exclusão de nota com itens já vinculados e vendidos — ⚠️ REVERTIDO no repasse (ver Tech
  Explorer)**: a regra combinada na revisão de B1 (`docs/estudo-modulo-estoque-erp.md`) pressupunha
  que dava pra saber se o estoque gerado por uma nota já foi vendido — o repasse por papel achou que
  **não existe esse dado no sistema** (não há conceito de "saída por venda" em nenhuma tabela; D1,
  baixa automática no pagamento, nunca foi implementada). Fica **fora do escopo de C1** — `DELETE`
  continua sem restrição, igual hoje desde B1. Vira requisito registrado pra quando D1 existir.

### Dependências
- **Depende de A1** (`ORD-180`, EAN em Product — mergeada), **A6** (`ORD-182`, fornecedor —
  mergeada), **B1** (`ORD-194`, upload de XML — mergeada).
- **Reaproveita**: A2 (`ORD-181`, mecanismo de entrada de estoque/`StockMovement` polimórfico).
  **Não reaproveita** G3/A5 (`fator_conversao`/`unidade_compra`) — resolvido por sinais verificáveis
  (`qTrib` da própria nota, GTIN de catálogo) em vez de fator numérico assumido; G3/A5 continuam
  intactos pra entrada manual (A2).
- **Requer um pequeno complemento em B1** (`ORD-194`, já mergeada): `_parse_nfe` e
  `SupplierInvoiceItem` não capturam `qTrib`/`uTrib`/`vUnTrib` hoje (só `qCom`/`uCom`/`vUnCom`) —
  são campos novos (nullable), migration aditiva, sem quebrar nada do que já existe. Necessário
  pro nível 1 conseguir usar o refinamento por `qTrib`.
- **Histórias futuras que consomem esta**: C2 (fila de pendência com resolução inline — escreve em
  `product_gtin_alt` e em `supplier_product_code`, resolve os itens que C1 deixou pendentes, e
  precisa suportar dividir a quantidade de um item entre múltiplos produtos de destino); E4 (CMV
  automático, também listada como dependente de B1, mas se beneficia de C1 pra custo por lote real
  em vez de manual).

### Critérios de aceite funcionais
- [ ] Item de nota confirmada com EAN idêntico ao EAN de venda de um `Product`/`Option` ativo da
      empresa recebe entrada de estoque automática 1:1 (usando `qCom`), sem intervenção humana
- [ ] Quando a nota declara `qTrib`/`uTrib` diferentes de `qCom`/`uCom` de forma consistente com o
      valor total do item, o item casado por EAN de venda recebe entrada usando `qTrib`, não `qCom`
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
- ~~`DELETE /catalog/supplier-invoices/{id}` passa a ser bloqueado se qualquer item da nota já gerou
      estoque que foi vendido~~ — **removido no repasse por papel**: não existe dado no sistema que
      represente "estoque vendido" (não há conceito de saída por venda; D1 nunca foi implementada).
      `DELETE` continua sem restrição por C1. Vira requisito registrado pra D1, não critério desta
      história — ver Tech Explorer.
- [ ] Casamento por EAN de venda (nível 1) nunca é ambíguo (não pode achar mais de um `Product`/
      `Option` ativo com o mesmo EAN — já garantido pela regra de unicidade fechada antes desta
      história)
- [ ] `product_gtin_alt` também respeita unicidade por empresa — o mesmo GTIN de embalagem não pode
      apontar pra dois produtos/opções diferentes na mesma empresa ao mesmo tempo
- [ ] Uma entrega que precisaria ser dividida entre múltiplos produtos de destino (ex: fardo em
      parte vendido inteiro, em parte decomposto) nunca casa automaticamente por nenhum dos três
      níveis — sempre pendente, resolução manual fica pra C2 (achado do usuário, ver decisão de
      escopo acima; gap encontrado no repasse PM — estava descrito em prosa mas não formalizado
      como critério)

## Wireframe / Mockup
Não introduz tela nova — estende a tela de detalhe de nota já existente (B1,
`SupplierInvoiceScreen.tsx`, view `"detail"`) com uma coluna nova ("Vínculo") na tabela de itens,
usando o mesmo padrão de `Tag` já usado no cabeçalho da prévia (`Tag variant="success"`/`"warning"`
pra "Fornecedor já cadastrado"/"Novo fornecedor").

**Resolvido no repasse de frontend** (achado da revisão PM: 7 estados possíveis — 3 vinculado + 4
pendente — sem mockup nenhum antes disso):

| Estado | Rótulo | `variant` |
|---|---|---|
| `link_source="ean"` | Vinculado (EAN) | `success` |
| `link_source="gtin_alt"` | Vinculado (embalagem) | `success` |
| `link_source="supplier_code"` | Vinculado (fornecedor) | `success` |
| `pendente_motivo=null` | Pendente | `warning` |
| `pendente_motivo="guarda_chuva"` | Pendente (produto guarda-chuva) | `warning` |
| `pendente_motivo="sem_estoque_iniciado"` | Pendente (sem estoque iniciado) | `warning` |
| `pendente_motivo="conflito_concorrencia"` | Pendente (conflito — tente novamente) | `error` |

`error` só pro conflito de concorrência (achado do repasse backend) — é o único estado que
representa uma falha técnica rara, não um "aguardando cadastro" normal; os outros 6 usam
`success`/`warning` pra manter a distinção clara entre "automático" e "precisa de ação humana".

## O que ainda está vago pra avançar ao QA Explorer
- ~~Formato exato do indicador de vínculo na tela de detalhe~~ — **resolvido no repasse de
  frontend**, ver tabela de rótulos/variantes acima.
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
| `qTrib`/`uTrib` divergente e consistente → usa qTrib, não qCom | `Nota declara qTrib divergente e consistente`, `qTrib inconsistente com o total cai pra qCom` |
| GTIN de embalagem conhecido (nível 2) → entrada automática multiplicada | `Vínculo por GTIN de embalagem conhecido (nível 2)`, `GTIN de embalagem vale pra qualquer fornecedor` |
| `cProd` mapeado (nível 3) → entrada automática mesmo sem EAN | `Vínculo por código do fornecedor já mapeado (nível 3)`, `Mapeamento de cProd é isolado por fornecedor` |
| Sem correspondência nos três níveis → pendente, sem travar confirmação | `Item sem qualquer correspondência fica pendente`, `GTIN de embalagem nunca visto vira pendência` |
| Entrega que precisaria dividir entre produtos nunca casa automaticamente | `Fardo com uso misto (vender inteiro e decompor) sempre casa num destino só, nunca divide` |
| (garantia adicional, achado no repasse QA) Nível 1 sempre vence em caso de colisão entre tabelas | `Nível 1 sempre vence quando o mesmo código existiria nos dois níveis` |
| Detalhe da nota mostra vinculado (por qual nível) ou pendente | (mesmos cenários acima — cada um verifica o estado retornado pra tela de detalhe) |
| Guarda-chuva não recebe entrada direta | `Item casa com produto guarda-chuva` |
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

  Scenario: Nota declara qTrib divergente e consistente
    Dado um item da nota com cEAN "7894900010015" (mesmo EAN da lata)
    E uCom "FD", qCom "1", vUnCom "42.00"
    E uTrib "UN", qTrib "12", vUnTrib "3.50" (12 × 3.50 = 42.00, bate com o total do item)
    Quando a nota é confirmada
    Então o item fica vinculado ao Product "Coca-Cola Lata 350ml" via EAN de venda
    E a entrada de estoque lançada é de 12 unidades (qTrib, não qCom)

  Scenario: qTrib inconsistente com o total cai pra qCom
    Dado um item da nota com cEAN "7894900010015"
    E uCom "FD", qCom "1", vUnCom "42.00"
    E uTrib "UN", qTrib "12", vUnTrib "1.00" (12 × 1.00 = 12.00, NÃO bate com vProd "42.00")
    Quando a nota é confirmada
    Então o item ainda fica vinculado ao Product "Coca-Cola Lata 350ml" via EAN de venda
    E a entrada de estoque lançada usa qCom (1), não o qTrib inconsistente
    E não trava a confirmação da nota nem gera erro — só ignora um sinal que não bateu

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

  Scenario: Fardo com uso misto (vender inteiro e decompor) sempre casa num destino só, nunca divide
    Dado um GTIN de fardo cadastrado em product_gtin_alt apontando SÓ pro Product "Coca-Cola Lata
      350ml" (decomposição), sem entrada equivalente pro Product "Fardo Coca-Cola 350ml"
    E um item da nota com esse mesmo cEAN de fardo
    Quando a nota é confirmada
    Então o item casa no nível 2 e vincula à Lata (comportamento determinístico, um destino só)
    E não existe nenhum mecanismo pra "dividir" automaticamente entre Lata e Fardo — se a Empresa
      quisesse os dois, precisaria resolver manualmente via C2 nota a nota (fora do escopo de C1)

  # ── Limitação guarda-chuva ─────────────────────────────────────────────

  Scenario: Item casa com produto guarda-chuva
    Dado um Product guarda-chuva (is_umbrella=true) ativo com EAN de venda "5550000000001"
    E um item da nota com cEAN "5550000000001"
    Quando a nota é confirmada
    Então nenhuma entrada de estoque é lançada diretamente no produto guarda-chuva
    E o item fica sinalizado como não resolvido automaticamente (mecanismo exato — mesma
      fila de "pendente" ou um estado distinto — decidido no Tech Explorer)

  # ── Bloqueio de exclusão pós-venda: REMOVIDO no repasse — ver Tech Explorer.
  # Não existe dado no sistema que represente "estoque vendido" (sem D1). DELETE
  # continua sem restrição por C1, mesmo comportamento de B1 — nada a testar aqui
  # que já não estivesse coberto pelos testes de exclusão de B1.

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

  Scenario: Mapeamento de cProd da empresa A não vaza pra empresa B
    Dado um mapeamento salvo em supplier_product_code pela empresa A, fornecedor X, código "COD-01"
    E o MESMO fornecedor X também tem cadastro na empresa B (CNPJ igual, Supplier é por empresa)
    E uma nota confirmada pela empresa B com um item do fornecedor X e cProd "COD-01"
    Quando a nota da empresa B é confirmada
    Então o item da empresa B NÃO vincula automaticamente
    E fica pendente (o mapeamento da empresa A nunca é visível pra empresa B, mesmo com o mesmo
      fornecedor e o mesmo código — isolamento é por company_id, símétrico aos outros dois níveis)

  # ── Precedência entre níveis ────────────────────────────────────────────

  Scenario: Nível 1 sempre vence quando o mesmo código existiria nos dois níveis
    Dado um Product "X" com EAN de venda "1234567890123"
    E um cadastro em product_gtin_alt com gtin "1234567890123" apontando pro Product "Y" (cadastro
      indevido — C2 deveria impedir isso na escrita, mas nada no schema de C1 proíbe hoje)
    Quando um item da nota chega com cEAN "1234567890123"
    E a nota é confirmada
    Então o item vincula ao Product "X" (nível 1), nunca ao Product "Y" (nível 2)
    E isso é proteção de código (ordem de checagem), não de dado — reforça que C2 precisa
      validar na escrita de product_gtin_alt que o GTIN não colide com nenhum EAN de venda
      já cadastrado na empresa

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
- **`qTrib` divergente é raro na prática observada, mas real**: verificação empírica contra os 41
  XMLs reais vendorizados pela `nfelib` (16 deles cópias diretas em `docs/exemples/FN/`, trazidas
  nesta revisão) não achou nenhum caso de `qTrib` diferente de `qCom` — o mecanismo é
  espec-compliant e faz sentido fiscal (ICMS-ST), mas a amostra disponível não confirma que
  emissores populam isso corretamente na prática. Tech Explorer deve implementar o refinamento por
  `qTrib` como **oportunista** (usa quando aparece e bate a conta), nunca como premissa — o
  casamento por `product_gtin_alt` continua sendo o caminho confiável pra pacotes com GTIN próprio.
- **Achado no repasse QA — `product_gtin_alt` pode colidir silenciosamente com EAN de venda**:
  nada no schema impede cadastrar em `product_gtin_alt` um GTIN que já é `Product.ean`/`Option.ean`
  de outro item na mesma empresa. Quando isso acontece, o nível 2 fica permanentemente inalcançável
  pra aquele código (nível 1 sempre intercepta primeiro) — sem erro, sem aviso. Não é bug do C1 (o
  algoritmo em si é determinístico), mas **C2** (quem escreve em `product_gtin_alt`) precisa
  validar na escrita que o GTIN não colide com nenhum EAN de venda já cadastrado — registrado aqui
  pra não se perder até C2 ser desenhada.

### 🛑 Achado no repasse QA — Critério de Aceite #6 (bloqueio de exclusão pós-venda) é inviável hoje

Verificação no código antes de aceitar o critério como "pronto pra Tech Explorer": `StockMovementIn.tipo`
só aceita `Literal["entrada", "ajuste"]` (`services/catalog/main.py:2840`) — **não existe nenhum
tipo de movimentação "saída"/venda em todo o catalog-service**. D1 (baixa automática no pagamento,
Bloco D do épico, `docs/estudo-modulo-estoque-erp.md`) nunca foi implementado.

O Critério de Aceite "`DELETE` bloqueado se qualquer item da nota já gerou estoque que foi vendido"
(herdado da revisão de B1, antes desta investigação de código) **não tem como ser verdadeiro nem
falso hoje** — não existe nenhum dado no banco que represente "este estoque foi vendido". O Tech
Explorer desta história também nunca detalhou o mecanismo desse endpoint (ficou só na promessa
herdada, sem desenho) — não é falta de detalhe, é uma dependência não declarada (C1 → D1, que não
está no grafo de dependências do épico).

**Isto bloqueia Ready até ser resolvido com o usuário** — ver seção "O que ainda impede o avanço".

### O que ainda impede o avanço pro Tech Explorer
**Na época em que este QA Explorer foi originalmente escrito**: nada bloqueava — cenários alinhados
com os 10 critérios do Explorer, 1:1 confirmado na rastreabilidade.

**Correção feita no repasse por papel, antes de Ready**: o critério de bloqueio de exclusão
pós-venda (#6) foi escrito sem verificar se o código já suporta o conceito de "estoque vendido" —
não suporta (ver achado acima). Isso não impediu o Tech Explorer de avançar pra maior parte do
escopo (o resto da história é independente), mas o Tech Explorer também não detalhou esse endpoint
por causa disso — a lacuna só ficou visível nesta revisão. Resolução fica pra decisão do usuário
antes de Ready (ver seção correspondente no Tech Explorer).

## Tech Explorer

### Serviços impactados
- **catalog-service**: único serviço tocado. `services/catalog/main.py` ganha 2 tabelas novas, 3
  colunas novas em `supplier_invoice_items` (2 conjuntos: link de vínculo + `qTrib`/`uTrib`/`vUnTrib`
  capturados do XML), a lógica de casamento em 3 níveis, e reaproveita `_create_stock_movement` e
  `_resolve_stock_owner` já existentes (A2/G3, `ORD-181`/`ORD-190`) sem alterá-los.
- **Nenhum outro serviço**. Vínculo é 100% interno ao catalog-service — não chama nenhum outro
  serviço, não publica evento de fila.

### Modelos e migrations

```python
class ProductGtinAlt(Base):
    """C1 (ORD-195) — GTIN de embalagem/pacote (fardo, caixa, DUN-14) diferente do EAN da unidade
    de venda, atribuído pelo fabricante — não do fornecedor. Um GTIN aponta pra um único
    Product OU Option (XOR, mesmo padrão de StockItem) + quantidade por unidade. Escrito por C2
    (resolução de pendência), lido por C1 (casamento automático nível 2)."""
    __tablename__ = "product_gtin_alt"
    __table_args__ = (
        UniqueConstraint("company_id", "gtin", name="uq_product_gtin_alt_company_gtin"),
        CheckConstraint(
            "(product_id IS NOT NULL AND option_id IS NULL) OR (product_id IS NULL AND option_id IS NOT NULL)",
            name="ck_product_gtin_alt_owner_xor",
        ),
    )
    id                      = Column(Integer, primary_key=True)
    company_id              = Column(Integer, nullable=False, index=True)
    gtin                    = Column(String(14), nullable=False)
    product_id              = Column(Integer, ForeignKey("products.id"), nullable=True)
    option_id               = Column(Integer, ForeignKey("options.id"), nullable=True)
    quantidade_por_unidade  = Column(Numeric(12, 3), nullable=False)
    created_by              = Column(Integer, nullable=False)
    created_at              = Column(DateTime, default=datetime.utcnow)


class SupplierProductCode(Base):
    """C1 (ORD-195) — código do fornecedor (cProd) → produto, aprendido na primeira resolução
    manual (C2). Preso a um fornecedor específico (diferente de ProductGtinAlt, que é global de
    fabricante) — mesmo código de fornecedores diferentes não colide."""
    __tablename__ = "supplier_product_code"
    __table_args__ = (
        UniqueConstraint("company_id", "supplier_id", "c_prod", name="uq_supplier_product_code"),
        CheckConstraint(
            "(product_id IS NOT NULL AND option_id IS NULL) OR (product_id IS NULL AND option_id IS NOT NULL)",
            name="ck_supplier_product_code_owner_xor",
        ),
    )
    id          = Column(Integer, primary_key=True)
    company_id  = Column(Integer, nullable=False, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    c_prod      = Column(String(60), nullable=False)
    product_id  = Column(Integer, ForeignKey("products.id"), nullable=True)
    option_id   = Column(Integer, ForeignKey("options.id"), nullable=True)
    created_by  = Column(Integer, nullable=False)
    created_at  = Column(DateTime, default=datetime.utcnow)
```

`SupplierInvoiceItem` (B1, já existe) ganha colunas novas — migration aditiva, nenhuma quebra:

```python
# Vínculo (C1)
product_id           = Column(Integer, ForeignKey("products.id"), nullable=True)
option_id            = Column(Integer, ForeignKey("options.id"), nullable=True)
link_source          = Column(String(20), nullable=True)  # "ean" | "gtin_alt" | "supplier_code" | None
pendente_motivo      = Column(String(30), nullable=True)  # só quando link_source é None; "guarda_chuva" | "sem_estoque_iniciado" | "conflito_concorrencia" | None (sem correspondência em nenhum nível)

# Dados brutos da nota que B1 descartava (achado desta revisão — necessário pro refinamento por qTrib)
unidade_tributavel          = Column(String(10), nullable=True)
quantidade_tributavel       = Column(Numeric(15, 4), nullable=True)
valor_unitario_tributavel   = Column(Numeric(15, 4), nullable=True)
```

`_ParsedInvoiceItem`/`_parse_nfe` (B1) ganham os 3 campos tributáveis, direto do XML:
```python
unidade_tributavel=d.prod.uTrib,
quantidade_tributavel=Decimal(d.prod.qTrib) if d.prod.qTrib is not None else None,
valor_unitario_tributavel=Decimal(d.prod.vUnTrib) if d.prod.vUnTrib is not None else None,
```

### Algoritmo de casamento

```python
async def _match_supplier_invoice_item(
    db: AsyncSession, company_id: int, supplier_id: int, item: SupplierInvoiceItem,
) -> tuple[str | None, int | None, int | None, Decimal]:
    """Retorna (link_source, product_id, option_id, quantidade_a_lancar).
    link_source None = sem correspondência (pendente)."""

    # Nível 1 — EAN de venda (mesma query de _check_active_code_conflict, só leitura)
    if item.c_ean:
        p = (await db.execute(
            select(Product).filter_by(company_id=company_id, ean=item.c_ean, active=True, deleted=False)
        )).scalars().first()
        owner_id, is_option = (p.id, False) if p else (None, False)
        if not p:
            o = (await db.execute(
                select(Option).join(OptionGroup, OptionGroup.id == Option.option_group_id)
                .filter(OptionGroup.company_id == company_id, Option.ean == item.c_ean, Option.active == True)
            )).scalars().first()
            owner_id, is_option = (o.id, True) if o else (None, False)
        if owner_id:
            qtd = _resolve_qtrib_quantity(item)  # ver função abaixo
            return ("ean", None if is_option else owner_id, owner_id if is_option else None, qtd)

    # Nível 2 — GTIN de embalagem conhecido
    if item.c_ean:
        alt = (await db.execute(
            select(ProductGtinAlt).filter_by(company_id=company_id, gtin=item.c_ean)
        )).scalars().first()
        if alt:
            qtd = item.quantidade * alt.quantidade_por_unidade
            return ("gtin_alt", alt.product_id, alt.option_id, qtd)

    # Nível 3 — código do fornecedor
    if item.c_prod:
        spc = (await db.execute(
            select(SupplierProductCode).filter_by(
                company_id=company_id, supplier_id=supplier_id, c_prod=item.c_prod
            )
        )).scalars().first()
        if spc:
            return ("supplier_code", spc.product_id, spc.option_id, item.quantidade)

    return (None, None, None, item.quantidade)


def _resolve_qtrib_quantity(item: SupplierInvoiceItem) -> Decimal:
    """qTrib só é usado quando diverge de qCom E a conta bate com o total do item
    (tolerância de R$0,05 pra arredondamento) — ver achado da revisão (verificação
    empírica: 0/41 XMLs reais da nfelib têm essa divergência, mas o mecanismo é
    real e vale aproveitar quando aparece)."""
    if (
        item.quantidade_tributavel is not None
        and item.valor_unitario_tributavel is not None
        and item.quantidade_tributavel != item.quantidade
    ):
        total_tributavel = (item.quantidade_tributavel * item.valor_unitario_tributavel).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        if abs(total_tributavel - item.valor_total) <= Decimal("0.05"):
            return item.quantidade_tributavel
    return item.quantidade
```

### Endpoints — nenhum endpoint novo, dois já existentes ganham comportamento

**`POST /catalog/supplier-invoices`** (confirmar importação, B1) — depois do `db.add_all` dos itens
e antes do `return`, pra cada item já persistido (tem `.id`):

```python
vinculados, pendentes = 0, 0
for db_item, parsed_item in zip(persisted_items, parsed.itens):
    link_source, product_id, option_id, qtd = await _match_supplier_invoice_item(
        db, company_id, supplier.id, db_item,
    )
    pendente_motivo = None
    if link_source:
        try:
            await _create_stock_movement(
                db, company_id,
                StockMovementIn(tipo="entrada", quantidade=qtd, motivo=f"Vínculo automático — nota #{invoice.id}"),
                current_user, product_id=product_id, option_id=option_id,
            )
        except (HTTPException, IntegrityError) as e:
            # HTTPException: guarda-chuva (_resolve_stock_owner) ou StockItem inexistente ainda.
            # IntegrityError (achado no repasse backend): duas notas diferentes com item do mesmo
            # EAN confirmadas quase ao mesmo tempo podem colidir no INSERT do StockItem novo (só
            # uma sobrevive à UniqueConstraint) — sem isso na captura, um 500 derrubava a
            # confirmação inteira da nota por causa de uma corrida rara no vínculo automático,
            # quebrando a garantia de que a nota nunca fica inconsistente por causa de C1.
            await db.rollback()  # desfaz só a tentativa de stock movement, não a nota já commitada
            link_source, product_id, option_id = None, None, None
            pendente_motivo = (
                "guarda_chuva" if isinstance(e, HTTPException) and "guarda-chuva" in e.detail
                else "sem_estoque_iniciado" if isinstance(e, HTTPException)
                else "conflito_concorrencia"
            )
    db_item.product_id, db_item.option_id = product_id, option_id
    db_item.link_source, db_item.pendente_motivo = link_source, pendente_motivo
    if link_source: vinculados += 1
    else: pendentes += 1
await db.commit()
return {"id": invoice.id, "supplier_id": supplier.id, "itens_vinculados": vinculados, "itens_pendentes": pendentes}
```

**Nota importante sobre transação**: `_create_stock_movement` já faz seu próprio `commit()`
internamente (função pensada pra ser chamada isolada, via A2) — numa nota com N itens, isso
significa até N commits independentes dentro da mesma requisição. Cada entrada de estoque é
atômica em si mesma; a nota e seus itens **já estão commitados antes** desse loop começar (mesma
garantia de B1, sem mudança) — se o vínculo falhar no meio, a nota importada nunca fica em estado
inconsistente, só alguns itens ficam sem vínculo (viram pendência, resolvidos depois por C2).

**`GET /catalog/supplier-invoices/{id}`** (detalhe, B1) — response de cada item ganha:
```python
"product_id": it.product_id, "option_id": it.option_id, "link_source": it.link_source,
"link_label": <nome do produto/opção vinculado, resolvido via join>,
"pendente_motivo": it.pendente_motivo,
```

### Migration
- `supplier_invoice_items`: 6 colunas novas, todas nullable (`product_id`, `option_id`,
  `link_source`, `pendente_motivo`, `unidade_tributavel`, `quantidade_tributavel`,
  `valor_unitario_tributavel`) + 2 FKs.
- `product_gtin_alt`: tabela nova (schema acima).
- `supplier_product_code`: tabela nova (schema acima).
- **Achado no repasse backend**: `Product.ean` (`main.py:173`) e `Option.ean` (`main.py:383`) não
  têm índice — hoje só custa caro na escrita ocasional (`_check_active_code_conflict`); C1 faz essa
  mesma busca por item de nota, ficando quente. Adicionar `Index("ix_products_company_ean",
  "company_id", "ean")` e equivalente em `Option` **nesta migration**, já que C1 é quem torna isso
  necessário.
- **`product_gtin_alt`/`supplier_product_code` ficam vazias até C2 existir** — nada de errado
  nisso (mesmo padrão de B1 criando `supplier_invoice_item` antes de C1 existir pra consumir),
  mas vale avisar no rollout: logo após o deploy de C1, só o nível 1 (EAN de venda) vai
  efetivamente vincular algo — a maioria dos itens sem EAN cadastrado vai ficar pendente até
  alguém resolver manualmente pela primeira vez (C2).

### Impacto em outros serviços
Nenhum. Toda a lógica é interna ao catalog-service, sobre tabelas que já pertencem a ele.

### Riscos
- **Primeira movimentação de um produto sem estoque iniciado**: `_create_stock_movement` exige
  `unidade` (uma das `STOCK_UNITS`) na primeira movimentação de um `StockItem` — não existe humano
  pra informar isso no fluxo automático. **Decisão**: se o `StockItem` ainda não existe pro
  produto/opção casado, C1 **não tenta criar** — vira pendência (`pendente_motivo=
  "sem_estoque_iniciado"`), resolvida quando a Empresa lançar a primeira entrada manual (A2) uma
  vez — depois disso, vínculos futuros pro mesmo produto funcionam normalmente. Evita o risco de
  adivinhar errado a unidade e travar o `StockItem` nela pra sempre (não dá pra mudar depois).
- **N commits por nota** (um por item vinculado) — ver nota na seção de Endpoints. Sem problema de
  atomicidade (cada entrada já é uma unidade independente por natureza, mesmo no fluxo manual A2),
  mas é uma característica a documentar, não um bug.
- **`qTrib` como sinal oportunista, não confiável isoladamente** — mitigado pela checagem de
  consistência (`qTrib × vUnTrib ≈ vProd`) antes de confiar nele; sem essa checagem, um XML mal
  formado poderia gerar uma entrada de estoque com quantidade completamente errada.
- **Volume de itens por nota**: `nfe_grande.xml` (fixture real já usada em B1) tem 41 itens — o
  loop de casamento faz até 3 queries de leitura + 1 `_create_stock_movement` por item; pra uma
  nota grande isso é ~164 queries + commits. Aceitável pro volume esperado (compra de food
  service, não centenas de itens por nota), sem necessidade de otimização agora.

### Estimativa
**8 pontos** (revisado pra cima do estimado original de 5 no levantamento do épico — a
investigação desta revisão, com GTIN de embalagem e refinamento por `qTrib`, é
significativamente mais rica que "vínculo por EAN + tabela de código de fornecedor" original).
- Backend: 2 tabelas novas + migration de `supplier_invoice_items` + algoritmo de casamento (3
  níveis) + integração com `_create_stock_movement`/`_resolve_stock_owner` + resposta enriquecida
  em 2 endpoints já existentes + testes (pelo menos os 18 cenários do QA Explorer).
- Frontend: indicador de vínculo por item na tela de detalhe (B1) — pequeno, reaproveita a
  tabela/Table.tsx já existente, só uma coluna/tag nova.

### O que ainda impede o avanço pro Ready
Nada bloqueia. Todos os pontos que ficaram "vagos" no Explorer foram resolvidos com evidência do
código existente, não suposição:
- Comportamento guarda-chuva → resolvido, `_resolve_stock_owner` já bloqueia isso, C1 só precisa
  capturar a exceção.
- Schema `product_id`/`option_id` nullable com XOR → mesmo padrão exato de `StockItem` (A2),
  reaproveitado sem inventar nada novo.
- Cadastro proativo de GTIN fora do fluxo de pendência → confirmado que fica fora do escopo de
  C1, é uma pergunta pra quando C2 for desenhada (não bloqueia C1 sozinha).
- Formato do indicador de vínculo na tela → resolvido no repasse de frontend (tabela de
  rótulos/variantes na seção Wireframe/Mockup).

## Repasse por papel (antes de Ready)

Revisão formal PM → QA → Backend → Frontend, cada um lendo o doc fresco e buscando inconsistência
real, não confirmando por confirmar (mesmo padrão já usado em B1/`ORD-194`). Achados, todos já
corrigidos no próprio doc:

| Papel | Achado | Correção |
|---|---|---|
| PM | Critério de aceite faltando pra "nunca divide entre produtos" (só estava em prosa/Gherkin) | Critério de aceite #11 adicionado |
| PM | Título de cenário Gherkin contradizia o próprio corpo ("nunca casa sozinho" vs. "casa no nível 2") | Título corrigido |
| QA | Sem cenário testando precedência entre nível 1 e nível 2 quando os dois bateriam | Cenário de regressão adicionado + achado de risco de dado (nada impede `product_gtin_alt` colidir com EAN de venda — registrado pra C2 validar) |
| QA | Isolamento multi-tenant tinha cenário pra nível 1 e 2, faltava nível 3 (`cProd`) | Cenário adicionado |
| QA | **Critério #6 (bloqueio de exclusão pós-venda) é inviável** — não existe "saída por venda" no sistema, D1 nunca foi implementada | **Removido do escopo de C1**, registrado como requisito pendente na descrição de D1 (`docs/estudo-modulo-estoque-erp.md`) |
| Backend | `except HTTPException` no loop de vínculo não capturava `IntegrityError` de uma corrida real (duas notas com o mesmo EAN quase simultâneas) — um 500 derrubaria a nota inteira | `except (HTTPException, IntegrityError)`, novo `pendente_motivo="conflito_concorrencia"` |
| Backend | `Product.ean`/`Option.ean` sem índice — C1 torna essa busca quente | Índice novo adicionado à migration desta história |
| Frontend | Wireframe/Mockup subespecificado (7 estados possíveis, nenhum rótulo definido) | Tabela de rótulos/variantes de `Tag` adicionada |

Nenhum achado ficou sem correção. História pronta pra **Ready**.
