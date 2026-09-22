---
id: ORD-196
status: Explorer
estimativa: 8 pontos (herdado de docs/estudo-modulo-estoque-erp.md, a confirmar no Tech Explorer)
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
