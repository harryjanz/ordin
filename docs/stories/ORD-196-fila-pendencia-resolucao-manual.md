---
id: ORD-196
status: Tech Explorer
estimativa: 13 pontos (revisado de 8, Tech Explorer — ver seção Estimativa)
---

# C2 — Fila de pendência com resolução manual + aplicação retroativa de estoque

## História

Como Empresa (dona do estabelecimento), quero resolver manualmente os itens de nota de compra que
o vínculo automático (C1) não conseguiu casar com nenhum produto do meu catálogo, para que nenhum
item comprado fique fora do controle de estoque indefinidamente.

## Contexto e motivação

C1 (`ORD-195`) resolve automaticamente a maioria dos itens de uma nota de compra via EAN de venda,
GTIN de embalagem (`product_gtin_alt`) ou código do fornecedor (`supplier_product_code`). Isso é
esperado e correto — mas item genuinamente novo (primeira vez que a Empresa compra esse produto, ou
o fornecedor usa um código que nunca apareceu antes) sempre vai ficar pendente, porque não existe
mágica que adivinhe uma correspondência que nunca foi ensinada ao sistema.

O problema real, hoje: depois que um item fica pendente, **não existe nenhuma ação disponível**. A
tela de detalhe da nota (`SupplierInvoiceScreen.tsx`, coluna "Vínculo") só mostra a Tag "Pendente —
sem correspondência" (ou variantes) e para por aí. A Empresa não tem como, dali, vincular o item a
um produto existente, criar um produto novo a partir dele, ou descartar o item como irrelevante pra
estoque (ex: copo descartável). O único jeito de contornar isso hoje é dar entrada de estoque manual
por fora (A2), mas aí perde a rastreabilidade com a nota — e a próxima nota do mesmo fornecedor com
o mesmo código vai cair pendente de novo, porque nada foi ensinado ao sistema.

Isso foi confirmado como lacuna real por uma pesquisa de mercado feita antes desta Explorer
(`docs/estudo-conciliacao-nf-estoque-mercado.md`, pesquisou Bling, Tiny, Omie, Conta Azul e Saipos):
**nenhum ERP pesquisado deixa "pendente" como destino final** — ou o item casa (automático ou
manual), ou vira produto novo. Ficar "pendente e parado" não é um estado que o mercado considera
aceitável, e essa Explorer usa essa pesquisa como insumo direto pras decisões de escopo abaixo.

## Decisões de escopo

Estas 4 decisões foram levantadas explicitamente pela pesquisa de mercado. Resolvo todas aqui —
nenhuma fica em aberto pro Tech Explorer, a menos que dependa de uma escolha genuinamente técnica.

### Decisão 1 — três ações por item pendente (não só "vincular")

**Recomendação: implementar as 3, nenhuma é opcional pro MVP.**

- **Vincular a um produto/opção já existente** — caminho mais comum pra item que já está no
  catálogo mas chegou com um código que C1 ainda não reconhece.
- **Criar um produto novo a partir do item da nota** (pré-preenchido com nome/unidade/valor) —
  pela pesquisa, é provavelmente a ação MAIS comum na prática (fornecedor novo trazendo item que a
  Empresa nunca vendeu antes). Sem essa ação, a Empresa precisaria sair da nota, ir no Catálogo,
  criar o produto do zero, voltar e vincular — dois fluxos separados por um problema só.
- **Ignorar / marcar como "não controla estoque"** — sem essa saída, item como copo descartável
  (usado no nosso próprio teste do C1) fica pendente pra sempre, inflando a fila e destruindo a
  confiança nela como sinal útil de "coisa real pra resolver".

Cortar qualquer uma das 3 reabre exatamente o problema que a pesquisa expôs.

### Decisão 2 — o que "aplicação retroativa" significa de verdade

**Recomendação: toda resolução (vincular ou criar produto novo) grava a associação nova E oferece
aplicar a mesma resolução a outros itens pendentes já importados que batem no mesmo critério —
sempre com confirmação explícita, nunca silenciosa.**

"Aplicação retroativa" já estava no nome da história antes desta Explorer (`docs/estudo-modulo-
estoque-erp.md`), mas nunca foi detalhado o que significa. Duas coisas distintas, as duas fazem
parte do escopo:

1. **Pra frente**: gravar a associação nova em `product_gtin_alt` (se o item tinha um EAN que não é
   o EAN de venda) ou `supplier_product_code` (se tinha `cProd`) — pra que a PRÓXIMA nota do mesmo
   fornecedor/GTIN já case automaticamente via C1. Isso é consenso, não é a parte nova.
2. **Pra trás** (a parte que dá nome à história): ao resolver, buscar outros `SupplierInvoiceItem`
   pendentes — de notas JÁ IMPORTADAS — que batem no mesmo critério (mesmo GTIN de embalagem, ou
   mesmo fornecedor+`cProd`) e oferecer dar entrada de estoque neles também, na mesma ação.

Recomendo (2) SEMPRE com confirmação explícita mostrando quantos itens seriam afetados antes de
aplicar — nunca automático/silencioso. Estoque é dado sensível (mercadoria/dinheiro real); aplicar
em lote sem o usuário ver o que está acontecendo é arriscado demais pra ser silencioso, mesmo que a
lógica esteja correta.

### Decisão 3 — tela dedicada de "Pendências" (cross-nota)

**Recomendação: sim, criar tela própria, mantendo a visualização inline que já existe no detalhe
da nota.**

Hoje um item pendente só é visível se alguém abrir o detalhe daquela nota específica — não existe
nenhum contador ou lista agregada de "quantos itens estão pendentes agora, de todas as notas". Isso
contradiz o próprio nome da história ("fila de pendência") — sem uma tela própria, não existe fila
de verdade, só pendência espalhada e invisível dentro de cada nota isolada. A pesquisa confirma que
Bling/Tiny tratam conciliação como fluxo de trabalho autônomo (tela dedicada), não como detalhe
passivo de cada nota.

Trade-off aceito conscientemente: a ação de resolução existe em 2 lugares (nova tela de Pendências
E inline no detalhe da nota, pra quem já está olhando uma nota específica não ser forçado a navegar
pra outro lugar por causa de 1 item). Recomendo que o painel/modal de resolução seja o MESMO
componente reaproveitado nos dois lugares — decisão de implementação pro Tech Explorer, não muda o
escopo funcional.

### Decisão 4 — cadastro de vínculo em lote (planilha)

**Recomendação: fora de escopo de C2.**

A pesquisa mostrou que "memória de associação" existe no mercado também como cadastro em lote via
planilha — mas isso é tipicamente uma feature de migração/setup inicial (quem está trazendo
histórico de outro sistema), não parte do fluxo de "recebi uma nota, um item não casou, preciso
resolver agora". Incluir isso em C2 dobra o escopo sem atacar o problema que motivou a história.
Registro como ideia futura (possível C3, ou parte de um epic de importação inicial de catálogo) —
não bloqueia C2 e não deve ser cobrado no Tech Explorer desta história.

## Fluxo principal

1. Empresa acessa a nova tela "Pendências" (nova aba em Estoque, ao lado de Fornecedores/Notas de
   compra) — OU abre o detalhe de uma nota específica que tem itens pendentes (fluxo já existente).
2. Sistema lista os itens pendentes: agregados de todas as notas na tela nova (com filtro por
   fornecedor e por motivo de pendência); só os da nota atual, no detalhe de nota.
3. Empresa escolhe uma ação pra um item pendente: **Vincular a existente**, **Criar produto novo**
   ou **Ignorar**.
4. Se **Vincular a existente**: busca produto/opção por nome/SKU/EAN → seleciona → sistema
   pré-preenche a quantidade a dar entrada (mesma lógica de `qCom`/`qTrib` já usada por C1, editável)
   → confirma.
5. Se **Criar produto novo**: formulário pré-preenchido com nome (`x_prod`), unidade e valor do
   item da nota — Empresa completa os campos obrigatórios do cadastro de produto (ex: categoria) →
   salva → produto criado E imediatamente vinculado ao item, mesma entrada de estoque do passo 4.
6. Se **Ignorar**: item marcado como "não controla estoque" — sai da fila permanentemente, sem
   gerar entrada de estoque.
7. Ao confirmar uma resolução de vínculo (passo 4 ou 5): sistema busca outros itens pendentes de
   notas já importadas que batem no mesmo critério (mesmo GTIN de embalagem, ou mesmo
   fornecedor+`cProd`) → se houver, mostra a quantidade encontrada e pergunta se a Empresa quer
   aplicar a mesma resolução a eles também → Empresa confirma ou recusa.
8. Sistema grava a associação nova em `product_gtin_alt` ou `supplier_product_code` (conforme o
   tipo de código do item) — pra que a próxima nota com esse código já case automaticamente via C1.
9. Item(ns) resolvido(s) saem da fila de pendência; estoque é atualizado (entrada) para cada item
   resolvido (o atual e, se aceito, os retroativos).

## Fluxos alternativos / exceções

- Item pendente por `guarda_chuva`: "vincular a existente" continua sem poder apontar pro produto
  guarda-chuva em si (mesma regra de C1/G4) — a busca de produto/opção precisa cobrir também opções,
  pra Empresa vincular à opção correta dentro do grupo.
- Item pendente por `sem_estoque_iniciado`: "vincular a existente" exige informar `unidade` (mesma
  regra da 1ª movimentação, herdada de A2/C1).
- Item pendente por `conflito_concorrencia` (raro — corrida entre duas notas confirmadas quase
  simultaneamente): resolver de novo simplesmente tenta a entrada de estoque outra vez; se colidir
  de novo, mantém pendente e mostra o erro.
- Empresa recusa a aplicação retroativa (passo 7): só o item da nota atual é resolvido; os outros
  pendentes que bateriam no critério continuam pendentes, sem alteração.
- Aplicação retroativa nunca alcança notas FUTURAS — essas já resolvem sozinhas via C1 automático,
  uma vez que a associação foi gravada no passo 8.
- Item "ignorado" não impede que o MESMO código apareça pendente de novo numa nota futura — "sempre
  ignorar esse código" (persistente) fica fora de escopo desta história (nenhuma associação é
  gravada quando a ação é "ignorar", só quando é "vincular" ou "criar produto novo").

## Dependências

- Serviços envolvidos: `catalog` (único serviço tocado, mesmo padrão de C1).
- Histórias bloqueantes: C1 (`ORD-195`) — já `Ready`, implementada e mergeada.
- Reaproveita: `_create_stock_movement`/`_resolve_stock_owner` (A2/G3/C1), tabelas `product_gtin_alt`
  e `supplier_product_code` (schema já criado por C1), lógica de `_resolve_qtrib_quantity` (C1),
  endpoint de criação de produto já existente no catálogo.

## Critérios de aceite funcionais

- [ ] Existe uma tela "Pendências" que lista itens pendentes de todas as notas da empresa, com
      filtro por fornecedor e por motivo de pendência.
- [ ] O detalhe de uma nota específica (tela já existente do C1) também permite resolver os itens
      pendentes daquela nota, sem precisar ir pra tela de Pendências.
- [ ] Empresa consegue vincular um item pendente a um produto ou opção já existente, buscando por
      nome, SKU ou EAN.
- [ ] Ao vincular, o sistema dá entrada de estoque na quantidade correta (mesma lógica de
      `qCom`/`qTrib` reaproveitada de C1).
- [ ] Empresa consegue criar um produto novo diretamente a partir de um item pendente, pré-preenchido
      com os dados do item da nota (nome, unidade, valor).
- [ ] Empresa consegue marcar um item pendente como "não controla estoque", removendo-o da fila
      permanentemente sem gerar entrada de estoque.
- [ ] Toda resolução por vínculo (existente ou produto novo) grava a associação em
      `product_gtin_alt` ou `supplier_product_code`, conforme o tipo de código do item, para
      casamento automático em notas futuras.
- [ ] Ao resolver um item por vínculo, o sistema identifica outros itens pendentes de notas já
      importadas que batem no mesmo critério e oferece aplicar a mesma resolução a eles, mostrando
      a quantidade afetada antes de confirmar.
- [ ] Aplicação retroativa nunca é automática ou silenciosa — sempre exige confirmação explícita.
- [ ] Empresa que recusa a aplicação retroativa consegue resolver só o item atual, sem efeito nos
      demais.
- [ ] Item pendente por `guarda_chuva` só pode ser vinculado a uma opção, nunca ao produto
      guarda-chuva em si.
- [ ] Item pendente por `sem_estoque_iniciado` exige informar `unidade` ao ser vinculado.
- [ ] Item resolvido (por qualquer uma das 3 ações) sai da fila de pendências e não aparece mais
      como pendente.
- [ ] Cadastro de vínculo em lote (planilha) está fora de escopo desta história.

## Wireframe / Mockup

Sem Figma disponível — descrição funcional pro Tech Explorer/Frontend detalhar:

- Nova aba **"Pendências"** em Estoque (ao lado de Fornecedores / Notas de compra), com tabela:
  Nota (link pro detalhe) · Fornecedor · Código/EAN · Descrição · Quantidade · Motivo da pendência
  (Tag, reaproveitando as variantes já definidas em C1) · Ação (botão "Resolver").
- Botão "Resolver" abre um painel/modal com as 3 opções: campo de busca de produto/opção
  (autocomplete), botão "Criar produto novo" (expande um mini-formulário inline com os campos
  pré-preenchidos) e botão "Ignorar".
- Depois de escolher vincular ou criar produto novo: se existirem outros itens pendentes que batem
  no mesmo critério, mostrar aviso do tipo "Aplicar também a N outro(s) item(ns) pendente(s) de
  nota(s) anteriores?" com confirmação explícita (checkbox ou botão dedicado) antes de aplicar.
- Mesmo painel/modal de resolução reaproveitado na tela "Pendências" e no detalhe de nota
  (`SupplierInvoiceScreen.tsx`, view "detail") — decisão de implementação, não de escopo.

## Em aberto para o QA Explorer / Tech Explorer

Pontos que dependem de julgamento técnico e não travam a saída desta Explorer, mas precisam ser
resolvidos antes de `Ready`:

1. **Critério exato de "mesmo item" pra aplicação retroativa** — precisa ser definido com precisão
   binária: GTIN de embalagem casa por `c_ean` idêntico; código de fornecedor casa por
   (`supplier_id`, `c_prod`) idêntico. Itens sem `c_ean` nem `c_prod` (ex: `COPODESC300` do nosso
   teste) não têm nada pra persistir — resolução se aplica só a ELE, sem candidatos retroativos.
2. **Formulário de "criar produto novo"** — usar o formulário completo do Catálogo ou uma versão
   reduzida com defaults? (ex: `category_id` é obrigatório no cadastro de produto hoje — precisa de
   uma categoria "Sem categoria" default, ou bloquear a criação até a Empresa escolher uma?)
3. **Volume esperado da tela "Pendências"** — precisa paginação/filtro server-side desde o início
   (mesmo padrão já usado em `SupplierInvoiceScreen`), ou o volume típico é baixo o bastante pra uma
   lista simples? Recomendo seguir o padrão já estabelecido (server-side) por consistência, mas é
   uma confirmação técnica, não uma decisão de produto nova.

## QA Explorer

### Rastreabilidade — Critério (Explorer) → Cenário

| # | Critério | Cenário(s) que cobrem |
|---|---|---|
| 1 | Tela "Pendências" lista itens de todas as notas, filtro por fornecedor/motivo | *Listagem agregada de pendências*, *Filtro por fornecedor*, *Filtro por motivo de pendência*, *Sem itens pendentes* |
| 2 | Detalhe da nota também resolve, sem precisar ir pra Pendências | *Resolver item pendente a partir do detalhe da nota* |
| 3 | Vincular a existente por nome/SKU/EAN | *Vincular por nome*, *Vincular por SKU*, *Vincular por EAN*, *Vincular a produto de outra empresa — isolamento* |
| 4 | Entrada de estoque na quantidade correta (qCom/qTrib) | *Entrada de estoque respeita qTrib divergente e consistente* |
| 5 | Criar produto novo pré-preenchido a partir do item | *Criar produto novo — dados válidos*, *Criar produto novo — categoria obrigatória ausente* |
| 6 | Ignorar remove da fila sem gerar entrada | *Ignorar item pendente*, *Item ignorado não gera movimentação de estoque* |
| 7 | Grava associação (GTIN de embalagem ou código do fornecedor) pra casamento futuro | *Vincular grava GTIN de embalagem*, *Vincular grava código do fornecedor*, *Criar produto novo também grava associação* |
| 8 | Identifica candidatos retroativos e oferece aplicar, mostrando a quantidade | *Candidatos retroativos por GTIN de embalagem*, *Candidatos retroativos por fornecedor+código*, *Nenhum candidato retroativo encontrado* |
| 9 | Retroativo nunca é automático/silencioso | *Aplicação retroativa exige confirmação explícita* |
| 10 | Recusar retroativo resolve só o item atual | *Empresa recusa aplicação retroativa* |
| 11 | `guarda_chuva` só vincula a opção, nunca ao produto guarda-chuva | *Vincular item guarda-chuva a uma opção — sucesso*, *Vincular item guarda-chuva ao produto — erro* |
| 12 | `sem_estoque_iniciado` exige `unidade` | *Vincular informando unidade — sucesso*, *Vincular sem informar unidade — erro* |
| 13 | Item resolvido sai da fila permanentemente | *Item vinculado some da fila*, *Item ignorado some da fila*, *Item de produto novo some da fila* |
| 14 | Cadastro de vínculo em lote fora de escopo | Critério negativo (exclusão de escopo) — não gera cenário Gherkin, mesma convenção usada em C1 pra critérios de fronteira; verificado no Tech Explorer por ausência de endpoint/tela, não por comportamento em runtime |

Cenários adicionais sem numeração 1:1 direta, cobrindo exceções herdadas de C1 e isolamento
multi-tenant explícito (fora do escopo de um único critério, atravessam vários):
*Vincular item com conflito de concorrência — sucesso ao tentar de novo*, *Vincular item com
conflito de concorrência — colide de novo*, *Isolamento multi-tenant na listagem de Pendências*,
*Isolamento multi-tenant na aplicação retroativa*, *Ignorar item de outra empresa — erro*.

### Cenários Gherkin

```gherkin
Feature: Fila de pendência com resolução manual (C2)
  Como Admin da empresa
  Quero resolver manualmente os itens de nota de compra que o vínculo automático não conseguiu casar
  Para que nenhum item comprado fique fora do controle de estoque indefinidamente

  Background:
    Dado que estou autenticado como Admin da empresa "Burger House"
    E existe uma nota de compra confirmada com um item pendente, sem produto/opção vinculado

  # ── Listagem (Critério 1, 13) ──────────────────────────────────────────

  Scenario: Listagem agregada de pendências
    Dado que existem itens pendentes em 3 notas de compra diferentes da minha empresa
    Quando acesso a tela "Pendências"
    Então vejo os itens pendentes das 3 notas juntos, numa única lista
    E cada linha mostra nota, fornecedor, código/EAN, descrição, quantidade e motivo da pendência

  Scenario: Filtro por fornecedor
    Dado que existem itens pendentes de 2 fornecedores diferentes
    Quando filtro a tela "Pendências" pelo fornecedor "Distribuidora de Bebidas Sul Ltda"
    Então vejo só os itens pendentes desse fornecedor

  Scenario: Filtro por motivo de pendência
    Dado que existem itens pendentes sem correspondência e itens pendentes por "guarda-chuva"
    Quando filtro a tela "Pendências" pelo motivo "guarda-chuva"
    Então vejo só os itens pendentes por esse motivo

  Scenario: Sem itens pendentes
    Dado que não existe nenhum item pendente na minha empresa
    Quando acesso a tela "Pendências"
    Então vejo uma mensagem de lista vazia, sem erro

  Scenario: Resolver item pendente a partir do detalhe da nota
    Dado que estou vendo o detalhe de uma nota específica com um item pendente
    Quando resolvo esse item ali mesmo, sem navegar pra tela "Pendências"
    Então o item é resolvido normalmente, com o mesmo resultado de resolver pela tela "Pendências"

  # ── Vincular a existente (Critério 3, 4, 7) ────────────────────────────

  Scenario: Vincular por nome
    Dado um item pendente sem EAN nem código do fornecedor reconhecido
    E um produto "Coca-Cola Lata 350ml" já cadastrado na minha empresa
    Quando busco por "Coca-Cola" no painel de resolução e seleciono esse produto
    Então o item é vinculado a esse produto
    E uma entrada de estoque é registrada na quantidade do item

  Scenario: Vincular por SKU
    Dado um produto cadastrado com SKU "COCA-350"
    Quando busco por "COCA-350" no painel de resolução
    Então encontro e consigo selecionar esse produto

  Scenario: Vincular por EAN
    Dado um produto cadastrado com EAN "7894900010015"
    Quando busco por "7894900010015" no painel de resolução
    Então encontro e consigo selecionar esse produto

  Scenario: Vincular a produto de outra empresa — isolamento
    Dado um produto com o mesmo nome cadastrado numa empresa diferente da minha
    Quando busco esse nome no painel de resolução
    Então esse produto de outra empresa não aparece nos resultados da busca

  Scenario: Entrada de estoque respeita qTrib divergente e consistente
    Dado um item pendente cujo qTrib diverge de qCom e cuja conta bate com o valor total do item
      (mesma regra de tolerância já usada em C1)
    Quando vinculo esse item a um produto existente
    Então a entrada de estoque usa a quantidade de qTrib, não a de qCom

  Scenario: Vincular grava GTIN de embalagem
    Dado um item pendente cujo código de barras é um GTIN de embalagem (fardo/caixa), não o EAN de
      venda de nenhum produto cadastrado
    Quando vinculo esse item a um produto existente, informando quantas unidades cada embalagem
      contém
    Então o sistema guarda essa associação (GTIN de embalagem → produto)
    E uma nota de compra futura com o mesmo GTIN casa automaticamente nesse produto, sem passar
      pela fila de pendência de novo

  Scenario: Vincular grava código do fornecedor
    Dado um item pendente cujo código do fornecedor (`cProd`) não está associado a nenhum produto
    Quando vinculo esse item a um produto existente
    Então o sistema guarda essa associação (fornecedor + código → produto)
    E uma nota futura do mesmo fornecedor com o mesmo código casa automaticamente nesse produto

  # ── Criar produto novo (Critério 5, 7) ─────────────────────────────────

  Scenario: Criar produto novo — dados válidos
    Dado um item pendente sem nenhum produto correspondente no catálogo
    Quando escolho "Criar produto novo" e completo os campos pré-preenchidos (nome, unidade, valor)
      mais a categoria
    Então um novo produto é criado no catálogo
    E o item é imediatamente vinculado a esse produto, com entrada de estoque na quantidade do item

  Scenario: Criar produto novo — categoria obrigatória ausente
    Dado que estou no formulário de "Criar produto novo" a partir de um item pendente
    Quando tento salvar sem escolher uma categoria
    Então recebo um erro de validação e o produto não é criado

  Scenario: Criar produto novo também grava associação
    Dado um item pendente com GTIN de embalagem reconhecível
    Quando crio um produto novo a partir desse item
    Então a associação de GTIN de embalagem também é gravada pro produto recém-criado, igual
      aconteceria se eu tivesse vinculado a um produto já existente

  # ── Ignorar (Critério 6) ────────────────────────────────────────────────

  Scenario: Ignorar item pendente
    Dado um item pendente sem relevância pro controle de estoque (ex: copo descartável)
    Quando marco esse item como "não controla estoque"
    Então o item sai da fila de pendências permanentemente

  Scenario: Item ignorado não gera movimentação de estoque
    Dado um item pendente que acabei de marcar como "não controla estoque"
    Então nenhuma entrada de estoque foi registrada por causa desse item

  Scenario: Ignorar item de outra empresa — erro
    Dado um item pendente que pertence a uma nota de compra de outra empresa
    Quando tento marcá-lo como "não controla estoque" usando meu próprio usuário
    Então recebo um erro e nada é alterado

  # ── Aplicação retroativa (Critério 8, 9, 10) ────────────────────────────

  Scenario: Candidatos retroativos por GTIN de embalagem
    Dado 2 notas já importadas, cada uma com um item pendente com o mesmo GTIN de embalagem
    Quando vinculo o item pendente da segunda nota a um produto, informando a conversão da embalagem
    Então o sistema me avisa que existe 1 outro item pendente com o mesmo GTIN, na primeira nota
    E mostra a quantidade que seria afetada antes de eu decidir

  Scenario: Candidatos retroativos por fornecedor+código
    Dado 2 notas já importadas do mesmo fornecedor, cada uma com um item pendente com o mesmo
      código do fornecedor (`cProd`)
    Quando vinculo o item pendente de uma delas a um produto
    Então o sistema me avisa que existe 1 outro item pendente com o mesmo fornecedor+código

  Scenario: Nenhum candidato retroativo encontrado
    Dado um item pendente cujo código não aparece em nenhum outro item pendente de nenhuma outra
      nota já importada
    Quando vinculo esse item a um produto
    Então o sistema não exibe nenhuma pergunta de aplicação retroativa — só resolve o item atual

  Scenario: Aplicação retroativa exige confirmação explícita
    Dado que o sistema encontrou candidatos retroativos ao vincular um item
    Quando eu NÃO confirmo explicitamente a aplicação retroativa (ex: fecho o aviso, ou não marco a
      opção)
    Então os itens candidatos continuam pendentes, sem nenhuma entrada de estoque gerada neles

  Scenario: Empresa aceita aplicação retroativa
    Dado que o sistema encontrou 2 outros itens pendentes candidatos ao vincular o item atual
    Quando confirmo explicitamente a aplicação retroativa
    Então os 2 itens candidatos recebem entrada de estoque e saem da fila de pendência
    E o item original também é resolvido normalmente

  Scenario: Empresa recusa aplicação retroativa
    Dado que o sistema encontrou candidatos retroativos ao vincular o item atual
    Quando recuso explicitamente aplicar a resolução aos outros itens
    Então só o item atual é resolvido
    E os itens candidatos continuam pendentes, sem nenhuma alteração

  Scenario: Isolamento multi-tenant na aplicação retroativa
    Dado um item pendente de outra empresa com o mesmo GTIN de embalagem do item que estou resolvendo
    Quando vinculo o meu item e o sistema procura candidatos retroativos
    Então o item da outra empresa NUNCA aparece como candidato, mesmo com o código idêntico

  # ── Casos herdados de C1 (Critério 11, 12) ─────────────────────────────

  Scenario: Vincular item guarda-chuva a uma opção — sucesso
    Dado um item pendente por "guarda-chuva" (o EAN pertence a um produto guarda-chuva)
    Quando vinculo esse item a uma opção do grupo de opções desse produto, não ao produto em si
    Então o vínculo é aceito e a entrada de estoque é registrada na opção

  Scenario: Vincular item guarda-chuva ao produto — erro
    Dado um item pendente por "guarda-chuva"
    Quando tento vincular esse item diretamente ao produto guarda-chuva (não a uma opção)
    Então recebo um erro e o item continua pendente

  Scenario: Vincular informando unidade — sucesso
    Dado um item pendente por "sem estoque iniciado" (produto ainda nunca recebeu nenhuma
      movimentação)
    Quando vinculo esse item informando a unidade de estoque (ex: "un")
    Então a primeira movimentação de estoque é criada com essa unidade
    E o item sai da fila de pendência

  Scenario: Vincular sem informar unidade — erro
    Dado um item pendente por "sem estoque iniciado"
    Quando tento vincular esse item sem informar a unidade
    Então recebo um erro de validação e o item continua pendente

  Scenario: Vincular item com conflito de concorrência — sucesso ao tentar de novo
    Dado um item pendente por "conflito de concorrência" (corrida rara entre duas notas)
    Quando tento vincular esse item de novo, e dessa vez não há nenhuma corrida concorrente
    Então o vínculo é aceito normalmente

  Scenario: Vincular item com conflito de concorrência — colide de novo
    Dado um item pendente por "conflito de concorrência"
    Quando tento vincular esse item de novo e ocorre uma nova colisão simultânea
    Então o item continua pendente pelo mesmo motivo, e vejo uma mensagem de erro clara

  # ── Fila e isolamento (Critério 1, 13) ──────────────────────────────────

  Scenario: Item vinculado some da fila
    Dado um item pendente que acabei de vincular a um produto existente
    Então esse item não aparece mais na tela "Pendências" nem no detalhe da nota como pendente

  Scenario: Item de produto novo some da fila
    Dado um item pendente pro qual acabei de criar um produto novo
    Então esse item não aparece mais como pendente

  Scenario: Isolamento multi-tenant na listagem de Pendências
    Dado que existe um item pendente pertencente a uma empresa diferente da minha
    Quando acesso a tela "Pendências" com meu usuário
    Então esse item de outra empresa não aparece na minha lista
```

## Tech Explorer

### Serviços impactados

- `catalog-service`: único serviço tocado (mesmo padrão de C1). Reaproveita `_create_stock_movement`/
  `_resolve_stock_owner` (A2/G3/C1), as tabelas `product_gtin_alt`/`supplier_product_code` (schema já
  existe, criado por C1 — nenhuma tabela nova nesta história), e o endpoint de criação de produto
  já existente (refatorado, ver abaixo).

### Decisão de design — o que grava em `link_source` numa resolução manual

C1 usa `link_source: "ean" | "gtin_alt" | "supplier_code" | None`. Adiciono dois valores novos:

- **`"manual"`** — item resolvido por uma ação humana em C2 (vincular a existente ou criar produto
  novo), distinto dos 3 valores automáticos de C1. Importante manter a distinção: a associação nova
  gravada em `product_gtin_alt`/`supplier_product_code` é o que faz a PRÓXIMA nota casar sozinha —
  mas o item ATUAL foi resolvido por um humano, e isso é informação relevante pra UI (Tag "Vinculado
  (manual)") e pra qualquer relatório futuro de "quanto do vínculo é automático vs. manual".
- **`"ignorado"`** — item marcado como "não controla estoque". `product_id`/`option_id` continuam
  `None`, `pendente_motivo` é limpo pra `None`. Como a query de pendências filtra por
  `link_source IS NULL`, um item ignorado sai da fila automaticamente, sem precisar de coluna nova.

**Nenhuma migration de schema pra colunas existentes** — `link_source` já é `String(20)`, sem
`CHECK` de banco (só documentado em comentário), os 2 valores novos cabem sem alterar o tipo. A
migration desta história só adiciona índices (ver "Migrations" abaixo).

### Decisão de design — quando grava `product_gtin_alt` vs. `supplier_product_code` vs. nada

Resolve o item #1 "Em aberto" do Explorer com uma regra binária, sem ambiguidade:

- **Item pendente TEM `c_ean`** → é candidato a nível 2 (nenhum item com `c_ean` que bateria com o
  EAN de venda de um produto ficaria pendente — C1 já teria casado no nível 1). Grava
  `ProductGtinAlt(company_id, gtin=item.c_ean, product_id/option_id, quantidade_por_unidade)`.
  `quantidade_por_unidade` é informada pelo usuário no formulário de vínculo (não dá pra inferir
  sozinho — é a mesma limitação que já existia em C1, aqui só quem resolve manualmente sabe quantas
  unidades tem a embalagem).
- **Item pendente NÃO tem `c_ean` mas TEM `c_prod`** → candidato a nível 3. Grava
  `SupplierProductCode(company_id, supplier_id, c_prod=item.c_prod, product_id/option_id)`, onde
  `supplier_id` vem da nota (`SupplierInvoice.supplier_id`) à qual o item pertence.
  `quantidade_por_unidade` não se aplica aqui — código do fornecedor não carrega proporção.
- **Item pendente não tem nem `c_ean` nem `c_prod`** (ex: `COPODESC300` do teste do C1) → nada pra
  persistir. `link_source="manual"`, sem nenhuma linha nova em `product_gtin_alt`/
  `supplier_product_code`. A resolução vale só pra ESTE item — não existe candidato retroativo
  possível (não há critério de correspondência pra buscar outros).
- **`UniqueConstraint`s já existentes** (`uq_product_gtin_alt_company_gtin`,
  `uq_supplier_product_code`) cobrem o caso de dois usuários resolverem o mesmo GTIN/código quase
  simultaneamente — trata como o mesmo `IntegrityError` → `pendente_motivo="conflito_concorrencia"`
  já usado por C1, reaproveitado aqui.

### Decisão de design — dois passos pra aplicação retroativa (Critério 9)

Pra garantir que "nunca é automático/silencioso" (Critério 9) sem precisar de um endpoint de
"preview" separado, a resolução acontece em até 2 chamadas:

1. `POST .../link` (ou `.../create-product`) resolve SÓ o item atual e devolve, na resposta, a
   lista de candidatos retroativos encontrados (pode ser vazia).
2. Se a Empresa confirma explicitamente (Critério 9/10), o frontend chama
   `POST .../retroactive/apply` com os ids escolhidos — nunca acontece dentro da mesma chamada que
   resolveu o item original.

Isso resolve certo o cenário "nenhum candidato encontrado → não pergunta nada" (não existe uma
segunda chamada se a lista vier vazia) e "recusar → só o item atual muda" (frontend simplesmente não
chama o passo 2).

### Endpoints

#### `GET /catalog/supplier-invoices/pending-items`

**Serviço:** catalog-service · **Auth:** JWT, role admin/owner · **company_id:** do JWT

Query params: `fornecedor: str | None`, `motivo: Literal["sem_correspondencia","guarda_chuva",
"sem_estoque_iniciado","conflito_concorrencia"] | None` (`"sem_correspondencia"` = `pendente_motivo
IS NULL`), `skip: int = 0`, `limit: int = 50` — mesmo padrão de paginação/filtro server-side de
`GET /catalog/supplier-invoices` (resolve o item #3 "Em aberto" do Explorer: sim, server-side desde
o início, por consistência).

Query: `SELECT ... FROM supplier_invoice_items JOIN supplier_invoices ON ... WHERE
supplier_invoices.company_id = :company_id AND supplier_invoice_items.link_source IS NULL` +
filtros opcionais, `JOIN suppliers` pro nome do fornecedor.

Response 200:
```json
{
  "items": [
    {
      "id": 42, "supplier_invoice_id": 8, "numero": "12345", "serie": "1",
      "fornecedor_nome": "Distribuidora de Bebidas Sul Ltda",
      "c_prod": "GUA350", "c_ean": "7891991010924", "x_prod": "GUARANA ANTARCTICA LATA 350ML",
      "unidade": "UN", "quantidade": 12.0, "valor_unitario": 3.60, "valor_total": 43.20,
      "pendente_motivo": null
    }
  ],
  "total": 1
}
```

#### `POST /catalog/supplier-invoices/items/{item_id}/link`

**Auth:** JWT, role admin/owner · **company_id:** do JWT (valida que o item pertence a uma nota da
empresa, senão 404)

Request:
```json
{
  "product_id": 1026, "option_id": null,
  "quantidade": 24.0,
  "unidade": null,
  "quantidade_por_unidade": null
}
```
- `product_id` XOR `option_id` (igual G3/C1).
- `quantidade`: pré-preenchida pelo frontend com `item.quantidade` (ou `item.quantidade *
  quantidade_por_unidade` se o item tem `c_ean`), mas editável — mesmo espírito de C1.
- `unidade`: obrigatória só quando o dono (produto/opção) ainda não tem `StockItem`
  (`pendente_motivo == "sem_estoque_iniciado"`) — mesma regra de `_create_stock_movement`,
  reaproveitada sem mudança (Critério 12).
- `quantidade_por_unidade`: obrigatória quando `item.c_ean is not None` (vira nível 2), ignorada
  quando `item.c_ean is None`.

Corpo do handler (pseudocódigo):
```python
item = await _get_pending_item_scoped(db, item_id, company_id)  # 404 se não existir/outra empresa
if item.link_source is not None:
    raise HTTPException(400, detail="item já resolvido")

await _create_stock_movement(
    db, company_id,
    StockMovementIn(tipo="entrada", quantidade=body.quantidade, unidade=body.unidade,
                     motivo=f"Resolução manual — nota de compra #{item.supplier_invoice_id}"),
    current_user, product_id=body.product_id, option_id=body.option_id,
)  # mesma exceção HTTPException 400 se guarda-chuva/dados inválidos — propaga, não silencia

item.product_id, item.option_id = body.product_id, body.option_id
item.link_source = "manual"
item.pendente_motivo = None
await db.commit()

retroactive_candidates = []
if item.c_ean:
    await _upsert_product_gtin_alt(db, company_id, item.c_ean, body.product_id, body.option_id,
                                    body.quantidade_por_unidade)
    retroactive_candidates = await _find_retroactive_candidates_by_ean(db, company_id, item.c_ean,
                                                                        exclude_item_id=item.id)
elif item.c_prod:
    invoice = await db.get(SupplierInvoice, item.supplier_invoice_id)
    await _upsert_supplier_product_code(db, company_id, invoice.supplier_id, item.c_prod,
                                         body.product_id, body.option_id)
    retroactive_candidates = await _find_retroactive_candidates_by_supplier_code(
        db, company_id, invoice.supplier_id, item.c_prod, exclude_item_id=item.id)

return {"item": _serialize_item(item), "retroactive_candidates": retroactive_candidates}
```

`_upsert_*`: tenta `INSERT`, captura `IntegrityError` (já existe — outra resolução ganhou a corrida)
e simplesmente ignora (a associação já está lá, é exatamente o que este `INSERT` tentaria criar).

Erros: 400 (produto/opção não encontrado, guarda-chuva, unidade obrigatória ausente), 404 (item não
existe ou é de outra empresa), 409 (item já resolvido por outra requisição — variante do mesmo
`conflito_concorrencia`).

#### `POST /catalog/supplier-invoices/items/{item_id}/create-product`

Mesmo formato do `POST /catalog/products` (reaproveita `ProductIn`) **+** os campos
`quantidade`/`unidade`/`quantidade_por_unidade` do endpoint anterior. Internamente:

```python
product = await _create_product_row(db, company_id, body_product_in)  # ver refatoração abaixo
# resto idêntico ao handler de /link, usando product.id como product_id
```

Response 201 inclui o produto criado (`ProductOut`) + o mesmo formato de `retroactive_candidates`.

#### `POST /catalog/supplier-invoices/items/{item_id}/ignore`

Sem corpo. `item.link_source = "ignorado"`, `product_id`/`option_id` continuam `None`,
`pendente_motivo = None`. Também retorna `retroactive_candidates` (mesmo critério de busca por
`c_ean`/`c_prod`, mas os candidatos aqui seriam marcados como ignorados também, não vinculados —
oferece a mesma pergunta de aplicação retroativa, só que pra "ignorar em lote").

#### `POST /catalog/supplier-invoices/items/retroactive/apply`

Request: `{"source_item_id": 42, "item_ids": [43, 51], "action": "link" | "ignore"}`

```python
source = await _get_pending_item_scoped(db, body.source_item_id, company_id)
# source já foi resolvido pela chamada anterior — reusa product_id/option_id/link_source dele
for target_id in body.item_ids:
    target = await _get_pending_item_scoped(db, target_id, company_id)
    if target.link_source is not None:
        continue  # já resolvido nesse meio-tempo, não é erro, só pula
    # valida que o candidato REALMENTE bate no critério (defesa contra manipulação do client)
    if source.c_ean and target.c_ean != source.c_ean: raise HTTPException(400, ...)
    if not source.c_ean and (target.c_prod != source.c_prod or ...): raise HTTPException(400, ...)
    if body.action == "ignore":
        target.link_source = "ignorado"
    else:
        try:
            await _create_stock_movement(db, company_id, StockMovementIn(tipo="entrada", ...),
                                          current_user, product_id=source.product_id, option_id=source.option_id)
            target.product_id, target.option_id = source.product_id, source.option_id
            target.link_source = "manual"
        except (HTTPException, IntegrityError):
            continue  # este candidato específico falha, não derruba os outros — mesmo espírito de C1
    target.pendente_motivo = None
    await db.commit()  # por item, mesmo motivo do loop de C1 (rollback não pode expirar os outros)
return {"aplicados": ..., "falhas": ...}
```

**Validação servidor-side do critério, não só confiar no que o client mandou em `item_ids`** — acima
(`if source.c_ean and target.c_ean != source.c_ean`) é essencial: o endpoint nunca aplica a um item
que não bate de verdade no critério, mesmo que o client peça (defesa contra bug de frontend OU
manipulação direta da API) — é também o que garante o isolamento multi-tenant do Critério de
isolamento retroativo: `_get_pending_item_scoped` já filtra por `company_id`, então um item de outra
empresa nunca é resolvido nem como candidato nem como alvo direto.

### Reaproveitamento — refatoração de `create_product`

`services/catalog/main.py:2612-2668` (handler de `POST /catalog/products`) mistura validação +
criação do `Product` + resposta HTTP. Extraio a parte de validação+criação (linhas ~2617-2668, tudo
antes do `return`) pra uma função `_create_product_row(db, company_id, body: ProductIn) -> Product`,
chamada pelos DOIS lugares (endpoint existente E o novo `/create-product`). O endpoint existente vira
uma casca fina que chama a função e monta o `ProductOut`. **Risco baixo**: a função extraída não
muda nenhum comportamento, é puro reaproveitamento de código já testado — rodar a suíte completa de
testes de `POST /catalog/products` depois da extração é suficiente pra confirmar que nada quebrou.

### Endpoints novos de busca (autocomplete de "vincular a existente")

`GET /catalog/products` (`services/catalog/main.py:2322`) ganha um parâmetro novo `q: str | None`
(filtra por `name ILIKE`/`sku`/`ean` contendo o texto) — reaproveitado tanto pelo catálogo quanto por
este autocomplete, sem endpoint novo.

`GET /catalog/options/search?q=...` — **endpoint novo**, porque hoje não existe nenhuma forma de
listar opções fora do contexto de um grupo específico. Retorna opções de todos os grupos da empresa
cujo `label`/`sku`/`ean` contém o texto, com o nome do grupo (`option_group.name`) junto no label
pra dar contexto (ex: "Coca-Cola — grupo Refrigerantes"). O frontend chama os dois endpoints em
paralelo e mistura os resultados num único combobox com um indicador visual de tipo (Produto/Opção).

### Migrations

Só índices — nenhuma tabela ou coluna nova:

```python
op.create_index("ix_supplier_invoice_items_c_ean", "supplier_invoice_items", ["c_ean"])
op.create_index("ix_supplier_invoice_items_c_prod", "supplier_invoice_items", ["c_prod"])
op.create_index("ix_supplier_invoice_items_link_source", "supplier_invoice_items", ["link_source"])
```

Justificativa: as 3 novas queries desta história (busca de candidatos retroativos por `c_ean`, por
`c_prod`, e listagem de pendências filtrando `link_source IS NULL`) rodam com frequência bem maior
que qualquer leitura pré-C2 dessas colunas — sem índice, cada resolução de item paga um table scan
de `supplier_invoice_items` pra achar candidatos, e a tela "Pendências" pagaria o mesmo a cada
carregamento.

### Impacto em outros serviços

Nenhum — tudo dentro de `catalog-service`, mesmo padrão de B1/C1.

### Frontend

- **Nova tela `PendingItemsScreen.tsx`** — nova aba "Pendências" em Estoque, ao lado de Fornecedores
  / Notas de compra. Estrutura igual à listagem de `SupplierInvoiceScreen` (filtro server-side +
  `Table` + `Pagination`, mesmo padrão de debounce nos campos de texto).
- **Componente compartilhado `ResolvePendingItemPanel.tsx`** (modal ou painel lateral) — usado tanto
  pela tela nova quanto pelo botão "Resolver" adicionado à coluna "Vínculo" de
  `SupplierInvoiceScreen.tsx` (view "detail") pra itens pendentes. 3 seções: busca de produto/opção
  (autocomplete combinando os dois endpoints acima), formulário de criar produto novo (reaproveita
  os mesmos campos do formulário de Catálogo, sem duplicar componente), botão "Ignorar". Depois de
  confirmar vincular/criar, se `retroactive_candidates` vier não-vazio, mostra um segundo passo:
  lista dos candidatos (nota, fornecedor, quantidade) com botão explícito "Aplicar também a estes N
  itens" — só chama `retroactive/apply` se a Empresa clicar nesse botão.
- **`SupplierInvoiceScreen.tsx`**: coluna "Vínculo" (já existe, ver C1) ganha um botão "Resolver" ao
  lado da Tag quando `link_source === null`. `linkStatusTag` (já existe) ganha 2 variantes novas:
  `"manual"` → `success`, "Vinculado (manual)"; `"ignorado"` → `neutral`/`greyscale`, "Ignorado".
- **`types.ts`**: `SupplierInvoiceDetailItem.link_source` ganha `"manual" | "ignorado"` na union.
  Novos tipos: `PendingItem`, `RetroactiveCandidate`, `LinkItemIn`, `CreateProductFromItemIn`.

### Estimativa

**13 pontos** (revisado de 8, o placeholder do `docs/estudo-modulo-estoque-erp.md` — igual a C1, que
também subiu de 5 pra 8 no próprio Tech Explorer). Justificativa: 4 endpoints novos + 1 refatoração +
2 endpoints de busca no backend, mais 1 tela nova + 1 componente compartilhado complexo (3 modos de
resolução + fluxo de confirmação retroativa) no frontend — escopo real é maior que C1, que teve só 1
tela alterada (Tag/coluna) e nenhuma tela nova.

### Riscos

1. **Refatoração de `create_product`** — risco baixo, mas é código em produção já usado pelo
   Catálogo; mitigação: suíte de testes existente de `POST /catalog/products` roda inalterada depois
   da extração, qualquer regressão aparece imediatamente.
2. **Autocomplete de opções é endpoint novo, sem precedente no serviço** — primeira vez que se lista
   opções fora do contexto de um grupo; atenção redobrada ao isolamento multi-tenant (join com
   `OptionGroup.company_id`, mesmo padrão de `_resolve_stock_owner`) já que é código genuinamente
   novo, não reaproveitado.
3. **Validação servidor-side do critério de retroatividade é obrigatória, não só confiança no
   client** — se o endpoint `retroactive/apply` confiasse cegamente em `item_ids` vindo do frontend,
   um bug ali (ou uma chamada direta à API) poderia aplicar uma resolução errada a um item que não
   bate no critério. Mitigado no pseudocódigo acima com a validação explícita antes de cada
   aplicação.
4. **Corrida entre o passo 1 (resolver item atual) e o passo 2 (aplicar retroativo)** — um candidato
   pode ter sido resolvido por outra pessoa nesse meio-tempo; o loop de `retroactive/apply` já trata
   isso (`if target.link_source is not None: continue`, sem erro) — comportamento definido, não
   uma lacuna.

