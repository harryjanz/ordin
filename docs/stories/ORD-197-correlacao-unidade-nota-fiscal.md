---
id: ORD-197
status: Ready
estimativa: 5 pontos (revisado de 8, Tech Explorer — ver seção Estimativa)
---

# Correlação entre unidade livre da NF-e e as unidades de estoque do Ordin

## Descrição

A NF-e não tem um enum fechado do SEFAZ pra `uCom`/`uTrib` — é texto livre, cada fornecedor escreve
do jeito que quiser ("UN", "CX", "PCT", "KG", "LT", "GR", etc.; confirmado lendo `_parse_nfe`,
`services/catalog/main.py`). O Ordin, por outro lado, tem um conjunto fechado e pequeno de unidades
de estoque (`STOCK_UNITS = ("un", "kg", "g", "L", "ml")`).

Hoje, no painel de resolução manual de item pendente (`ResolvePendingItemPanel.tsx`, C2/`ORD-196`),
a única tentativa de aproveitar a unidade da nota é uma normalização por igualdade exata
(case-insensitive) contra essas 5 opções — "UN" vira "un", "KG" vira "kg", mas qualquer variação
comum ("LT" pra litro, "GR" pra grama, "UND"/"PC" pra unidade) não casa com nada e cai direto no
fallback manual (usuário escolhe no Dropdown). Isso já é seguro hoje (nunca aplica errado, só não
pré-preenche) — a história é sobre reduzir quanto o usuário precisa escolher manualmente pra
sinônimos comuns, não sobre corrigir um bug.

## Persona

Admin da empresa — é quem resolve itens pendentes manualmente em C2 e vê o campo de unidade não
pré-preenchido mesmo quando a nota já trouxe uma unidade reconhecível (só com grafia diferente).

## Contexto

Achado pelo usuário testando ao vivo o C2 (`ORD-196`), registrado como pendência explícita na seção
"Implementação — achados adicionais" de `docs/stories/ORD-196-fila-pendencia-resolucao-manual.md`,
sem decisão de escopo ainda. Pontos que o Explorer desta história precisa resolver:

- Quais sinônimos valem a pena cobrir (lista inicial, não precisa ser exaustiva).
- Onde essa tabela deveria viver — só no frontend (like `STOCK_UNIT_OPTIONS` hoje), ou também no
  backend, considerando que outros fluxos também lidam com unidade de nota (ex: C1, casamento
  automático, que hoje grava `unidade=d.prod.uCom` sem nenhuma normalização).
- Se vale ampliar pra também reconhecer unidades de EMBALAGEM (FD, CX, PCT) como sinal — não como
  unidade de estoque em si (isso já é resolvido via "quantidade por unidade" em C2), mas talvez pra
  informar melhor a UI (ex: sugerir automaticamente que o item parece ser uma embalagem, sem exigir
  que o usuário perceba isso sozinho pelo campo EAN).

## História

Como Admin da empresa, quero que o sistema reconheça as variações comuns de escrita de unidade que
vêm nas notas de compra (`UND`/`UNI` → unidade, `LITRO`/`LT` → litro, `GR` → grama etc.), para
precisar escolher manualmente cada vez menos vezes ao resolver um item pendente — e quero que,
depois da primeira compra de um item com um fornecedor específico, o sistema lembre o fator de
conversão daquele fornecedor pra aquele item, mesmo quando o vínculo veio pelo código do fornecedor
(não por um GTIN de embalagem).

## Contexto e motivação

Pesquisa detalhada trazida pelo usuário (com fontes oficiais — portal da NF-e, FazComex, documentação
Olist/SPED — ver seção "Fontes" ao final deste documento), feita depois de testar C2 (`ORD-196`) ao
vivo. Confirma tecnicamente o que já sabíamos: `uCom`/`uTrib` da NF-e são texto livre, sem tabela
nacional obrigatória pra operações internas (a única tabela oficial do SEFAZ é pra **comércio
exterior**, não ajuda em compra nacional do dia a dia).

A pesquisa também revelou uma lacuna real no que já construímos em C1/C2, não relacionada
diretamente ao problema original de "pré-preencher o Dropdown": o "de-para por fornecedor" que a
pesquisa propõe (`CNPJ do fornecedor + cProd + unidade → produto + fator de conversão`) é
**conceitualmente o mesmo mecanismo que `SupplierProductCode` (nível 3, `ORD-195`/`ORD-196`) já
implementa** — chave `(company_id, supplier_id, c_prod)` → `product_id`/`option_id`. A diferença real:
`SupplierProductCode` **não tem campo de fator de conversão** (confirmado lendo
`services/catalog/main.py:370-390`), diferente de `ProductGtinAlt` (nível 2), que já tem
`quantidade_por_unidade`. Hoje, qualquer item casado por nível 3 (código do fornecedor) sempre
assume fator 1 implicitamente — se um fornecedor usa um código próprio pra representar uma CAIXA
(não um GTIN de caixa), não existe hoje nenhum jeito de ensinar esse fator ao sistema pelo nível 3.

## Decisões de escopo

A pesquisa do usuário cobre um espaço bem mais amplo do que "pré-preencher um Dropdown" — da
inferência automática de fator via regex em `xProd` até geração de SPED Fiscal. Resolvo aqui o que
entra nesta história e o que fica registrado como ideia futura separada, pra não inflar o escopo.

### Decisão 1 — tabela de sinônimos: curada e pequena, não a lista completa da pesquisa

**Recomendação: cobrir só sinônimos sem ambiguidade real, que mapeiam limpo pra uma das 5
`STOCK_UNITS` do Ordin.**

| Entra (sem ambiguidade) | Sinônimos |
|---|---|
| `un` | UN, UND, UNI, UNID, UNIT, UNIDAD |
| `kg` | KG, KGS, KILO, QUILO, QUILOG |
| `g` | G, GR, GRS, GRAMA, GRAMAS |
| `L` | L, LT, LTS, LITRO, LITROS |
| `ml` | ML, MILILI |

**Fica de fora por ora** (registrado como ideia futura, não nesta história): siglas genuinamente
ambíguas que a própria pesquisa identifica (`LT` = litro OU lata; `PC`/`PT` = peça/pacote/pote; `CT`,
`BD`, `DP`, `TB`, `GL` etc.) — resolvê-las exigiria olhar `xProd`/NCM pra desambiguar, um mecanismo
mais caro que o escopo desta história cobre (ver Decisão 4). E unidades contáveis "de multiplicador"
(dúzia, cento, milheiro, par) — não mapeiam pra nenhuma `STOCK_UNIT` do Ordin de qualquer forma
(não são unidade de estoque, são fator embutido no nome), ficam fora por definição, não por corte de
escopo.

**Risco explícito herdado da própria pesquisa**: `LT` está na lista de "entra" acima como litro, mas
a pesquisa alerta que `LT` também é usado como sigla de lata em alguns XMLs. Recomendo NÃO incluir
`LT` na lista curada de sinônimos automáticos — é justamente o exemplo que a pesquisa usa pra ilustrar
o risco de custo 12× errado. `LITRO`/`LITROS`/`LTS` (sem ambiguidade prática) entram; `LT` sozinho
fica de fora, cai no fallback manual como hoje.

> **Correção (Tech Explorer, repasse de PM)**: a tabela acima tem 2 erros — a linha `L` inclui `LT`
> por engano (contradiz o parágrafo de risco logo abaixo, que já recomendava excluir) e a linha `ml`
> está truncada (`MILILI`). O código segue a tabela final corrigida na seção "Tech Explorer" (sem
> `LT`, com `MILILITRO`/`MILILITROS`), não a tabela acima — mantida aqui só como registro histórico
> da decisão original.

### Decisão 2 — onde a tabela vive: backend, reaproveitado pelos dois fluxos (C1 e C2)

**Recomendação: função/tabela no `catalog-service`, não só no frontend.**

Hoje só o FRONTEND tenta normalizar (`STOCK_UNIT_OPTIONS`, `ORD-196`) — C1 (casamento automático)
nunca normaliza nada, grava `unidade=d.prod.uCom` cru direto no banco (`_parse_nfe`,
`services/catalog/main.py:4385`). Mover a normalização pro backend beneficia os dois fluxos, e evita
duplicar a mesma tabela de sinônimos em dois lugares (frontend e backend divergindo com o tempo).

### Decisão 3 — fator de conversão por fornecedor: estender `SupplierProductCode`, não criar tabela nova

**Recomendação: adicionar `quantidade_por_unidade` (nullable, mesma semântica e nome de
`ProductGtinAlt`) em `SupplierProductCode`.**

Não recomendo criar a tabela `fornecedor_produto_unidade` que a pesquisa propõe do zero —
`SupplierProductCode` já é exatamente "fornecedor + código → produto", só falta o fator. Com essa
coluna adicionada:
- Nível 3 (código do fornecedor) passa a suportar embalagem com conversão, igual ao nível 2 já
  suporta pra GTIN — mesmo mecanismo (`quantidade_por_unidade` opcional na resolução manual de C2,
  usado se e só se o fornecedor não usa GTIN de caixa próprio, só código interno).
- Resolve o caso prático que o próprio Bloco C já tinha identificado como fora de escopo (a
  distribuidora que decompõe um código de fornecedor "CX12" em latas) sem inventar mecanismo novo.

### Decisão 4 — inferência automática de fator (regex em `xProd`, `qTrib`/`qCom`, GTIN-13 vs GTIN-14): fora de escopo

A pesquisa sugere inferir o fator sem nenhum cadastro prévio, cruzando `xProd` (`"C/12"`), a razão
`qTrib`/`qCom`, e comparando o tamanho do `cEAN` com o `cEANTrib`. São ideias genuinamente
interessantes, mas cada uma é um mecanismo de inferência probabilística à parte — `qTrib`/`qCom` já
foi avaliado e implementado em C1 como "sinal oportunista" (`ORD-195`) com uma regra de tolerância
específica; aplicar o mesmo racional de novo aqui, mais regex em texto livre de fornecedor, é escopo
suficiente pra uma história própria. Registro como ideia futura (`C3`?), não incluído aqui — o
objetivo desta história é só melhorar o pré-preenchimento da unidade de ESTOQUE (não de embalagem),
que é um problema mais simples e mais seguro de resolver primeiro.

### Decisão 5 — travas de sanidade (alerta de custo variando >50%): fora de escopo

Não é sobre unidade em si — é uma validação de custo anômalo na entrada, aplicável independente de
qual unidade foi usada. Registro como ideia futura separada (possível história própria).

### Decisão 6 — SPED Fiscal (registros 0190/0220): fora de escopo

Ordin não gera SPED Fiscal hoje — não existe esse módulo no produto. Mencionado pela pesquisa como
motivação adicional pra ter uma tabela de unidades bem estruturada, mas não é um requisito atual.
Registrado aqui só pra não se perder, caso o produto cresça nessa direção no futuro.

## Fluxo principal

1. Empresa confirma uma nota de compra (B1) — C1 tenta casamento automático, usando a unidade
   normalizada (via a tabela de sinônimos, Decisão 1) ao invés do texto cru da nota.
2. Item que fica pendente chega em C2 com a unidade da nota já normalizada, se reconhecida.
3. Empresa abre o painel de resolução manual (C2) — se a unidade da nota bateu com um sinônimo
   conhecido, o Dropdown já vem pré-selecionado; senão, comportamento atual (fallback manual).
4. Se a Empresa vincula por código do fornecedor (nível 3) e informa uma `quantidade_por_unidade`
   (ex: "este código do fornecedor é uma caixa de 12"), o sistema grava esse fator junto com a
   associação em `SupplierProductCode` — próxima nota do mesmo fornecedor com o mesmo código já
   aplica a conversão automaticamente via C1.

## Fluxos alternativos / exceções

- Unidade da nota é uma sigla ambígua (ex: `LT` sozinho) — nunca resolve sozinho, cai no fallback
  manual, comportamento idêntico a hoje.
- Fornecedor muda a unidade usada pro mesmo código (`CX12` → `CX24`) — fora de escopo desta história
  detectar essa mudança automaticamente (não há dado suficiente pra distinguir "fornecedor mudou o
  tamanho da caixa" de "erro de digitação isolado nesta nota"); fica registrado como observação pro
  Tech Explorer considerar se vale a pena um alerta simples, sem forçar reconfirmação obrigatória.
- Item sem `c_ean` nem `c_prod` (ex: item genuinamente avulso) — normalização de unidade continua
  valendo (não depende de nível de casamento), só o fator de conversão por fornecedor (Decisão 3)
  não se aplica, já que não há candidato de nível 2 nem 3 possível (mesma regra já herdada de C1/C2).

## Dependências

- Serviços envolvidos: `catalog` (único serviço tocado).
- Histórias bloqueantes: C1 (`ORD-195`) e C2 (`ORD-196`) — reaproveita `SupplierProductCode` e o
  fluxo de resolução manual, ambos já `Ready`/implementados.

## Critérios de aceite funcionais

- [ ] Existe uma tabela de sinônimos de unidade (backend) cobrindo pelo menos os 5 grupos sem
      ambiguidade da Decisão 1.
- [ ] C1 (casamento automático) usa a unidade normalizada ao gravar `SupplierInvoiceItem.unidade`,
      não o texto cru da nota.
- [ ] C2 (resolução manual) pré-seleciona a unidade no Dropdown quando a unidade da nota bate com um
      sinônimo conhecido.
- [ ] Sigla ambígua (`LT` sozinho, sem contexto) nunca é resolvida automaticamente — sempre cai no
      fallback manual.
- [ ] `SupplierProductCode` ganha um campo `quantidade_por_unidade` opcional.
- [ ] Ao vincular manualmente por código do fornecedor (nível 3) informando
      `quantidade_por_unidade`, o fator é gravado e aplicado na entrada de estoque atual.
- [ ] Nota futura do mesmo fornecedor com o mesmo código já aplica o fator automaticamente via C1,
      sem passar pela fila de pendência de novo.
- [ ] Nenhuma sigla é adicionada à tabela de sinônimos se a própria pesquisa/Explorer já a identificou
      como ambígua (`LT` isolado é o caso explícito a excluir).

## Wireframe / Mockup

Sem mudança visual nova além do que C2 já tem — o Dropdown de unidade em `ResolvePendingItemPanel.tsx`
passa a vir pré-selecionado com mais frequência; o campo "Quantidade por unidade" (já existente,
usado hoje só quando o item tem `c_ean`) passa a também aparecer quando o vínculo é por `c_prod`
(nível 3), com o mesmo comportamento.

## QA Explorer

### Rastreabilidade — Critério (Explorer) → Cenário

| # | Critério | Cenário(s) que cobrem |
|---|---|---|
| 1 | Tabela de sinônimos (backend) cobre os 5 grupos sem ambiguidade | *Tabela de sinônimos reconhece variações comuns sem ambiguidade* (Scenario Outline, 5 exemplos) |
| 2 | C1 usa a unidade normalizada ao gravar `SupplierInvoiceItem.unidade` | *Casamento automático grava a unidade normalizada quando a nota usa um sinônimo reconhecido* |
| 3 | C2 pré-seleciona a unidade no Dropdown quando bate um sinônimo | *Dropdown de unidade vem pré-selecionado quando a unidade da nota bate um sinônimo conhecido* |
| 4 | Sigla ambígua (`LT` sozinho) nunca resolve automaticamente — sempre fallback manual | *Casamento automático preserva a unidade crua quando a nota usa a sigla ambígua "LT"*, *Dropdown de unidade não pré-seleciona quando a unidade da nota é a sigla ambígua "LT"* |
| 5 | `SupplierProductCode` ganha `quantidade_por_unidade` opcional | *Vincular manualmente por código do fornecedor informando o fator de conversão*, *Vincular manualmente por código do fornecedor sem informar o fator* |
| 6 | Vincular por código do fornecedor informando o fator grava e aplica na entrada atual | *Vincular manualmente por código do fornecedor informando o fator de conversão* |
| 7 | Nota futura do mesmo fornecedor+código aplica o fator automaticamente via C1, sem cair na fila | *Nota futura do mesmo fornecedor e código já aplica o fator automaticamente*, *Aplicação retroativa (nível 3) também aplica o fator de conversão do fornecedor* |
| 8 | Nenhuma sigla ambígua entra na tabela de sinônimos (`LT` isolado excluído) | *Sigla ambígua "LT" isolada não está na tabela de sinônimos* |

**Critério 4 vs. 8 — por que os dois existem, não é redundância**: 4 garante *comportamento em
runtime* (nem C1 nem C2 resolvem "LT" sozinho, mesmo que um bug de código tentasse); 8 garante que
o *dado* em si — a tabela de sinônimos — nunca contém "LT" como chave (protege contra alguém
adicionar "LT" de volta num PR futuro sem reler a Decisão 1). Um não implica o outro
automaticamente: um bypass que resolvesse "LT" por outro caminho, mesmo com a tabela certa,
quebraria 4 sem quebrar 8. Revisado no repasse de PM.

Cenários adicionais sem numeração 1:1 direta, cobrindo robustez e isolamento multi-tenant (mesmo
padrão já obrigatório em C1/C2, `docs/ARQUITETURA.md` §6):
*Dropdown de unidade não pré-seleciona quando a unidade da nota é desconhecida (não cadastrada)*,
*Isolamento multi-tenant do fator de conversão por fornecedor*, *Item sem GTIN de embalagem nem
código do fornecedor — unidade normaliza, fator de conversão por fornecedor não se aplica*.

**Nota técnica pro Tech Explorer (isolamento multi-tenant do fator de conversão)**: a proteção já
vem do *schema*, não é uma checagem nova a implementar. `Supplier` tem `UniqueConstraint(company_id,
cnpj)` (`main.py:265`) — duas empresas com fornecedor de mesmo CNPJ têm linhas `Supplier`
totalmente separadas, com `supplier_id` diferente (PK global, nunca reaproveitada entre empresas).
Como `SupplierProductCode` chaveia por `(company_id, supplier_id, c_prod)`, não existe caminho de
query que colida os dois `supplier_id` — o cenário de isolamento é rede de segurança contra
regressão futura, não uma trava a construir do zero.

**Critério de fronteira, sem cenário Gherkin** (mesma convenção do critério 14 de C2): o fluxo
alternativo "fornecedor muda a unidade usada pro mesmo código" (`CX12` → `CX24`), citado no Explorer
como fora de escopo detectar automaticamente — não gera cenário porque a história explicitamente não
promete nenhum comportamento aqui; fica registrado como observação pro Tech Explorer avaliar se vale
um alerta simples, não uma trava.

**Aberto pro Tech Explorer** (não é critério de aceite declarado, mas apareceu revisando os cenários
abaixo): o Explorer não define se `quantidade_por_unidade` em `SupplierProductCode` tem alguma
validação de valor (ex: rejeitar zero ou negativo) — `ProductGtinAlt.quantidade_por_unidade`
equivalente não parece ter essa trava hoje (`services/catalog/main.py:365`). Não vira cenário aqui
por não haver critério que o peça; sinalizado pro Tech Explorer decidir se replica a mesma ausência
de validação (consistência) ou introduz uma (correção de lacuna pré-existente, fora do escopo desta
história a rigor).

### Cenários Gherkin

```gherkin
Feature: Correlação entre unidade livre da NF-e e as unidades de estoque do Ordin
  Como Admin da empresa
  Quero que o sistema reconheça variações comuns de escrita de unidade e lembre o fator de conversão
  por fornecedor
  Para precisar escolher manualmente cada vez menos vezes ao resolver um item pendente

  Background:
    Dado que estou autenticado como Admin da empresa "Burger House"
    E existe o fornecedor "Alimentos Ltda." cadastrado na minha empresa

  # ── Tabela de sinônimos (Critério 1, 8) ──────────────────────────────────

  Scenario Outline: Tabela de sinônimos reconhece variações comuns sem ambiguidade
    Dado que a nota de compra traz uma unidade cujo texto é "<unidade_da_nota>"
    Quando o sistema normaliza essa unidade contra a tabela de sinônimos
    Então a unidade normalizada resultante é "<unidade_normalizada>"

    Examples:
      | unidade_da_nota | unidade_normalizada |
      | UND             | un                   |
      | KG              | kg                   |
      | GR              | g                    |
      | LITROS          | L                    |
      | ML              | ml                   |

  Scenario: Sigla ambígua "LT" isolada não está na tabela de sinônimos
    Dado que a nota de compra traz uma unidade cujo texto é "LT"
    Quando o sistema normaliza essa unidade contra a tabela de sinônimos
    Então a unidade não é reconhecida (nenhum sinônimo corresponde)
    E o texto original "LT" é preservado sem alteração

  # ── C1 — casamento automático (Critério 2, 4) ────────────────────────────

  Scenario: Casamento automático grava a unidade normalizada quando a nota usa um sinônimo reconhecido
    Dado que a nota de compra traz um item com unidade "UND" e EAN de venda já cadastrado no catálogo
    Quando C1 processa a nota e casa o item automaticamente
    Então o `SupplierInvoiceItem.unidade` gravado é "un", não o texto cru "UND"

  Scenario: Casamento automático preserva a unidade crua quando a nota usa a sigla ambígua "LT"
    Dado que a nota de compra traz um item com unidade "LT" e EAN de venda já cadastrado no catálogo
    Quando C1 processa a nota e casa o item automaticamente
    Então o `SupplierInvoiceItem.unidade` gravado é "LT", sem normalização

  # ── C2 — resolução manual (Critério 3, 4) ────────────────────────────────

  Scenario: Dropdown de unidade vem pré-selecionado quando a unidade da nota bate um sinônimo conhecido
    Dado que existe um item pendente cuja unidade na nota é "GR"
    Quando abro o painel de resolução manual desse item
    Então o campo "Unidade de estoque" já vem pré-selecionado com "g"

  Scenario: Dropdown de unidade não pré-seleciona quando a unidade da nota é a sigla ambígua "LT"
    Dado que existe um item pendente cuja unidade na nota é "LT"
    Quando abro o painel de resolução manual desse item
    Então o campo "Unidade de estoque" vem vazio, exigindo escolha manual

  Scenario: Dropdown de unidade não pré-seleciona quando a unidade da nota é desconhecida (não cadastrada)
    Dado que existe um item pendente cuja unidade na nota é um texto fora da tabela, por exemplo "SC"
    Quando abro o painel de resolução manual desse item
    Então o campo "Unidade de estoque" vem vazio, exigindo escolha manual
    E o comportamento é idêntico ao já existente antes desta história (sem regressão)

  # ── Fator de conversão por fornecedor (Critério 5, 6, 7) ─────────────────

  Scenario: Vincular manualmente por código do fornecedor informando o fator de conversão
    Dado que existe um item pendente identificado só por código do fornecedor "CX12", sem GTIN de embalagem
    Quando vinculo esse item a um produto existente informando quantidade_por_unidade igual a 12
    Então a associação é gravada em `SupplierProductCode` com quantidade_por_unidade igual a 12
    E a entrada de estoque do item atual é lançada multiplicando a quantidade recebida pelo fator (12)

  Scenario: Vincular manualmente por código do fornecedor sem informar o fator
    Dado que existe um item pendente identificado só por código do fornecedor "COD-99"
    Quando vinculo esse item a um produto existente sem informar quantidade_por_unidade
    Então a associação é gravada em `SupplierProductCode` com quantidade_por_unidade nula
    E a entrada de estoque do item atual é lançada na quantidade recebida, sem multiplicação (fator implícito 1)

  Scenario: Nota futura do mesmo fornecedor e código já aplica o fator automaticamente
    Dado que o fornecedor "Alimentos Ltda." e o código "CX12" já têm quantidade_por_unidade igual a 12
    gravado em `SupplierProductCode`
    Quando uma nova nota de compra do mesmo fornecedor chega com um item de código "CX12" e quantidade recebida 3
    Então C1 casa o item automaticamente (nível 3), sem cair na fila de pendência
    E a entrada de estoque é lançada com quantidade 36 (3 × 12)

  Scenario: Aplicação retroativa (nível 3) também aplica o fator de conversão do fornecedor
    Dado que resolvi manualmente um item pendente por código do fornecedor "CX12", informando
    quantidade_por_unidade igual a 12, e existem outros 2 itens pendentes de notas anteriores do
    mesmo fornecedor com o mesmo código
    Quando confirmo a aplicação retroativa aos 2 itens candidatos
    Então a entrada de estoque de cada candidato é lançada multiplicando a quantidade recebida dele
    pelo fator 12, não a quantidade crua

  Scenario: Isolamento multi-tenant do fator de conversão por fornecedor
    Dado que a empresa "Burger House" gravou quantidade_por_unidade igual a 12 para o fornecedor
    "Alimentos Ltda." (CNPJ X) e código "CX12"
    E a empresa "Pasta & Co" tem seu próprio cadastro do mesmo fornecedor (mesmo CNPJ X) e também
    recebe notas com o código "CX12"
    Quando uma nota de compra da empresa "Pasta & Co" chega com um item de código "CX12"
    Então o item NÃO casa automaticamente pelo fator gravado pela "Burger House"
    E fica pendente, aguardando resolução manual própria da "Pasta & Co"

  # ── Borda: item sem nível 2 nem nível 3 possível ──────────────────────────

  Scenario: Item sem GTIN de embalagem nem código do fornecedor — unidade normaliza, fator de conversão por fornecedor não se aplica
    Dado que existe um item pendente sem c_ean e sem c_prod, com unidade na nota "KG"
    Quando abro o painel de resolução manual desse item
    Então o campo "Unidade de estoque" vem pré-selecionado com "kg" (normalização independe do nível de casamento)
    E não há campo de fator de conversão por fornecedor disponível, já que não existe candidato de nível 2 nem 3 possível
```

## Tech Explorer

**Pré-requisito**: esta história pressupõe C2 (`ORD-196`) já mergeado em `main` — todo trecho de
código citado abaixo hoje só existe em `feature/ord-196-fila-pendencia-resolucao-manual` (PR #160).

### Achado — inconsistência na tabela de sinônimos do Explorer

A tabela markdown da Decisão 1 lista `L` → "L, LT, LTS, LITRO, LITROS" (incluindo `LT`), mas o
parágrafo "Risco explícito" logo abaixo recomenda excluir `LT` explicitamente — as duas partes do
mesmo documento se contradizem. O QA Explorer já escreveu os cenários seguindo a prosa (LT excluído,
"LITROS" como exemplo do grupo `L`, cenário dedicado confirmando ausência de "LT"). A implementação
segue a prosa. Tabela final corrigida (a usar no código, substitui a da Decisão 1):

| `STOCK_UNIT` | Sinônimos aceitos |
|---|---|
| `un` | UN, UND, UNI, UNID, UNIT, UNIDAD |
| `kg` | KG, KGS, KILO, QUILO, QUILOG |
| `g` | G, GR, GRS, GRAMA, GRAMAS |
| `L` | L, LTS, LITRO, LITROS *(sem `LT` — deliberado, ver Decisão 1)* |
| `ml` | ML, MILILITRO, MILILITROS *(a Decisão 1 tinha "MILILI" — truncamento, corrigido aqui)* |

Segundo achado menor, mesma natureza: `ml` → "ML, MILILI" na Decisão 1 é claramente um
truncamento (nenhuma outra sigla da tabela para pela metade) — corrigido acima pro padrão
singular/plural já usado nos outros 4 grupos.

### Serviços impactados

- `catalog`: único serviço tocado. Função de normalização nova (interna, não é endpoint), coluna
  nova em `SupplierProductCode`, mudança de comportamento em 4 endpoints já existentes de C2
  (nenhum endpoint novo). Frontend admin: 2 condições booleanas em `ResolvePendingItemPanel.tsx`.

### Onde a normalização roda (risco técnico #1, resolvido)

`_ParsedInvoiceItem` (dataclass que alimenta tanto a persistência de `SupplierInvoiceItem.unidade`
quanto o matching de C1) é construído com `unidade=d.prod.uCom` cru. A normalização entra bem
nesse ponto, não em dois lugares separados:

```python
# main.py, perto de STOCK_UNITS (linha 203)
UNIT_SYNONYMS: dict[str, str] = {
    "UN": "un", "UND": "un", "UNI": "un", "UNID": "un", "UNIT": "un", "UNIDAD": "un",
    "KG": "kg", "KGS": "kg", "KILO": "kg", "QUILO": "kg", "QUILOG": "kg",
    "G": "g", "GR": "g", "GRS": "g", "GRAMA": "g", "GRAMAS": "g",
    "L": "L", "LTS": "L", "LITRO": "L", "LITROS": "L",  # "LT" deliberadamente ausente
    "ML": "ml", "MILILITRO": "ml", "MILILITROS": "ml",
}

def normalize_unit(raw: str | None) -> str | None:
    """Sinônimo pra STOCK_UNIT, ou None se não reconhecido — nunca lança
    exceção, nunca adivinha. Sigla ambígua (ex: "LT" sozinha) some da tabela
    de propósito, não por bug — cai aqui como None igual qualquer outra
    sigla desconhecida."""
    if raw is None:
        return None
    return UNIT_SYNONYMS.get(raw.strip().upper())
```

Uso na construção do item parseado (`_ParsedInvoiceItem`, dentro do loop `for d in inf.det`):

```python
unidade=normalize_unit(d.prod.uCom) or d.prod.uCom,  # fallback preserva o texto cru, nunca None
```

Justificativa de rodar aqui (e não separadamente em C1/persistência e em C2/pré-seleção): as duas
chaves de matching (`c_ean`, `c_prod`) nunca dependem de `unidade` — normalizar antes não afeta
nenhum dos 3 níveis de casamento de C1, só o valor que acaba em `SupplierInvoiceItem.unidade`. Um
único ponto de normalização evita a tabela divergir entre dois lugares com o tempo (mesmo racional
já usado pela Decisão 2 do Explorer pra escolher backend em vez de frontend).

**Trade-off aceito, não é risco novo**: o texto cru da nota ("UND") deixa de ficar em
`SupplierInvoiceItem.unidade` (vira "un" direto) — já era o comportamento pedido pelo Critério 2,
não uma perda de dado real: `SupplierInvoice.xml_raw` (`main.py:302`) preserva o XML original
inteiro pra qualquer reprocessamento/auditoria futura, então o texto cru nunca é perdido de
verdade, só não fica mais numa coluna própria.

### Endpoints alterados (nenhum endpoint novo)

#### POST /catalog/supplier-invoices/items/{item_id}/link
**Serviço:** catalog · **Auth:** JWT, role admin/owner/manager/superadmin · **company_id:** JWT

Request — mesmo shape de `LinkItemIn` (campo `quantidade_por_unidade` já existe, sem mudança de
schema). Mudança é de comportamento: hoje, quando o item só tem `c_prod` (nível 3, sem `c_ean`), o
valor de `quantidade_por_unidade` enviado é descartado silenciosamente. Passa a ser gravado:

```python
elif item.c_prod:
    invoice = await db.get(SupplierInvoice, item.supplier_invoice_id)
    await _upsert_supplier_product_code(
        db, company_id, invoice.supplier_id, item.c_prod, body.product_id, body.option_id,
        body.quantidade_por_unidade,  # NOVO — antes não era passado
        created_by,
    )
```

Sem nova validação obrigatória pro caminho `c_prod` — a trava `if item.c_ean and
body.quantidade_por_unidade is None: raise 400` continua só pra nível 2 (GTIN), conforme Critério 5
("campo opcional") e o Fluxo Principal do Explorer ("*se* a Empresa informa"). Mesma mudança nos
outros 2 endpoints de resolução, no ramo `elif item.c_prod:` de cada um:

#### POST /catalog/supplier-invoices/items/{item_id}/create-product
Idêntico ao `/link` — mesmo ramo `elif item.c_prod:`, mesma chamada com o parâmetro novo.

#### POST /catalog/supplier-invoices/items/{item_id}/create-option
Idêntico — mesmo ramo, mesma chamada.

#### POST /catalog/supplier-invoices/items/retroactive/apply
Hoje só o candidato de nível 2 (`target.c_ean`) recalcula a quantidade com o fator de
`ProductGtinAlt`; o `else` (nível 3, código do fornecedor) usa `target.quantidade` puro sempre —
mesma classe de bug já corrigida pra nível 2 durante a implementação de C2, nunca existiu pra
nível 3 porque o fator não existia ainda. Corrigido:

```python
quantidade_lancar = target.quantidade
if target.c_ean:
    alt = (await db.execute(
        select(ProductGtinAlt).filter_by(company_id=company_id, gtin=target.c_ean)
    )).scalars().first()
    if alt:
        quantidade_lancar = target.quantidade * alt.quantidade_por_unidade
elif target.c_prod:
    # target_invoice já é buscado no bloco de validação do critério, acima
    # neste mesmo loop (`else` de `if source.c_ean`) — reaproveita, não
    # busca de novo.
    spc = (await db.execute(
        select(SupplierProductCode).filter_by(
            company_id=company_id, supplier_id=target_invoice.supplier_id, c_prod=target.c_prod,
        )
    )).scalars().first()
    if spc and spc.quantidade_por_unidade:
        quantidade_lancar = target.quantidade * spc.quantidade_por_unidade
```

### C1 — casamento automático (nível 3)

`_match_supplier_invoice_item`, ramo do nível 3, passa a multiplicar pelo fator quando ele existe
(senão mantém quantidade crua — fator implícito 1, comportamento idêntico ao atual pra toda linha
que ainda não tem fator gravado):

```python
if spc:
    fator = spc.quantidade_por_unidade or Decimal(1)
    return ("supplier_code", spc.product_id, spc.option_id, item.quantidade * fator)
```

### `_upsert_supplier_product_code` — assinatura nova

```python
async def _upsert_supplier_product_code(
    db: AsyncSession, company_id: int, supplier_id: int, c_prod: str,
    product_id: int | None, option_id: int | None,
    quantidade_por_unidade: Decimal | None,  # NOVO parâmetro
    created_by: int,
) -> None:
    db.add(SupplierProductCode(
        company_id=company_id, supplier_id=supplier_id, c_prod=c_prod,
        product_id=product_id, option_id=option_id,
        quantidade_por_unidade=quantidade_por_unidade,  # NOVO
        created_by=created_by,
    ))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
```

### Migrations

- Tabela `supplier_product_code`: adicionar coluna `quantidade_por_unidade` (`Numeric(12, 3)`,
  **nullable** — diferente de `ProductGtinAlt.quantidade_por_unidade`, que é `NOT NULL` porque
  aquela linha só existe quando há conversão; aqui a maioria das linhas nunca terá fator, é
  genuinamente opcional). Nenhum índice novo — não entra em nenhum filtro de busca.

```python
# services/catalog/migrations/versions/YYYYMMDD_HHMM_supplier_product_code_fator_conversao.py
def upgrade():
    op.add_column(
        "supplier_product_code",
        sa.Column("quantidade_por_unidade", sa.Numeric(12, 3), nullable=True),
    )

def downgrade():
    op.drop_column("supplier_product_code", "quantidade_por_unidade")
```

Modelo SQLAlchemy (`class SupplierProductCode`, `main.py:370`) ganha a coluna correspondente,
`nullable=True`.

### Impacto em outros serviços

Nenhum. Só `catalog-service` — mesmo escopo de C1/C2.

### Eventos de fila

Nenhum evento novo — não muda nenhum contrato de fila existente (C1/C2 não publicam eventos hoje).

### Frontend — `ResolvePendingItemPanel.tsx`

Duas condições booleanas mudam, nenhuma tela nova, nenhum componente novo:

```typescript
// Antes: só aparecia (e era obrigatório) com GTIN de embalagem
const showQuantidadePorUnidade = Boolean(item.c_ean);

// Depois: aparece com GTIN OU código do fornecedor — mas só é obrigatório
// no primeiro caso (Critério 5: opcional pra nível 3)
const showQuantidadePorUnidade = Boolean(item.c_ean || item.c_prod);
const requireQuantidadePorUnidade = Boolean(item.c_ean);
```

O botão de confirmar troca a condição de `disabled` de `showQuantidadePorUnidade &&
quantidadePorUnidade == null` para `requireQuantidadePorUnidade && quantidadePorUnidade == null`.
Nenhuma outra mudança necessária:

- `quantidadeFinal` (`quantidade * quantidadePorUnidade` quando ambos setados, senão `quantidade`
  cru) já trata o caso opcional corretamente por construção — se o usuário não informar o fator pro
  caminho `c_prod`, cai automaticamente no fator implícito 1, sem código novo.
- A pré-seleção do Dropdown de unidade (`STOCK_UNIT_OPTIONS.find(...)`, comparação
  case-insensitive) não muda — como C1 agora grava `SupplierInvoiceItem.unidade` já normalizado, o
  match exato que já existe passa a acertar mais vezes de graça, sem tocar nessa função. Critério 3
  sai "de brinde" da mudança de backend, não precisa de lógica nova no componente.

### Estimativa

| Frente | Estimativa |
|---|---|
| `UNIT_SYNONYMS` + `normalize_unit` + hook em `_ParsedInvoiceItem` | ~1h |
| Migration + coluna no modelo | ~0.5h |
| `_upsert_supplier_product_code` + 3 call sites | ~1h |
| C1 (nível 3 com fator) | ~0.5h |
| `apply_retroactive` (nível 3 com fator) | ~1h (mais cuidado — mesmo padrão que já gerou bug real em C2) |
| Testes backend (Scenario Outline dos 5 sinônimos, LT excluído, C1, C2 pré-seleção, fator nível 3, retroativo nível 3, isolamento multi-tenant, borda sem c_ean/c_prod) | ~3h |
| Frontend (2 condições + teste manual) | ~1h |
| **Total** | **~8h ≈ 5 pontos** |

**Revisão pra baixo em relação à estimativa do Explorer** (8 pontos "a confirmar"): a história
parecia maior na superfície (tabela de sinônimos + fator de conversão + 2 fluxos) mas não introduz
nenhum endpoint, tela ou tabela nova — é tudo mudança cirúrgica em 4 endpoints e 1 coluna já
existentes, reaproveitando 100% da infraestrutura de C1/C2. Mesmo padrão de revisão que C2 teve
(mas na direção oposta: C2 revisou 8→13, aqui revisa 8→5).

### Riscos

- **Onde normalizar** — resolvido acima (ponto único, na construção de `_ParsedInvoiceItem`).
- **Coluna nova em tabela já usada em produção pelo `apply_retroactive` e por C1** — migration é só
  `ADD COLUMN` nullable, sem backfill, sem lock longo esperado (MySQL moderno faz `ADD COLUMN`
  nullable como operação metadata-only na maioria dos casos). Risco baixo, mas vale rodar em
  horário de baixo tráfego mesmo assim, mesma cautela de toda migration em tabela quente.
  Linhas existentes de `SupplierProductCode` ficam com `quantidade_por_unidade = NULL` — C1 já
  trata isso como fator implícito 1 (`spc.quantidade_por_unidade or Decimal(1)`), sem quebrar nada
  do que já está casando automaticamente hoje.
- **Reaproveitar `target_invoice` no `apply_retroactive`**: depende de o bloco de validação do
  critério (que já busca `target_invoice` só no `else` de `if source.c_ean`) ser executado sempre
  antes do bloco de cálculo de quantidade, na mesma ordem do código atual — confirmar isso com um
  teste que exercite o candidato de nível 3 explicitamente. **Lacuna encontrada e já fechada**: o
  QA Explorer só cobria o caminho de C1 (*Nota futura do mesmo fornecedor e código já aplica o
  fator automaticamente*), não `apply_retroactive` — acrescentado o cenário *Aplicação retroativa
  (nível 3) também aplica o fator de conversão do fornecedor* no QA Explorer antes deste documento
  fechar, já mapeado no Critério 7 da tabela de rastreabilidade.

## Repasse por papel (antes de Ready)

| Papel | Achado | Ação |
|---|---|---|
| PM | Estimativa de `apply_retroactive` (nível 3) tratada igual ao resto (~1h), mas é a mesma classe de bug que só apareceu escrevendo o teste em C2 (achado real, não hipotético) | Sinalizado no doc como ponto de atenção — 5 pontos mantido, mas sem surpresa esperada de estouro nessa linha específica |
| PM | Tabela de sinônimos da Decisão 1 do Explorer tinha 2 erros (`LT` incluído, `MILILI` truncado) só corrigidos no Tech Explorer, sem ponteiro de volta | Nota de correção adicionada direto na Decisão 1, apontando pra tabela final |
| PM | Fluxo Principal (passo 4) e cobertura dos 8 critérios — checados linha a linha contra Tech Explorer, sem gap | Nenhuma ação — confirmado, não achado |

**Repasses de QA/Backend/Frontend pulados por decisão explícita do usuário** ("marca como ready e
vamos desenvolver") — não por esquecimento. Registrado aqui pra ficar claro que essa rodada não
teve as 3 revisões completas que C2 teve; a validação técnica primária já está embutida na autoria
do Tech Explorer (escrito no papel de Backend SR + Frontend), só não passou por uma segunda revisão
independente de cada papel.

**Observação não-bloqueadora da validação de Ready**: a história não tem um cenário Gherkin de erro
(4xx) no sentido tradicional — porque não introduz nenhuma superfície de validação nova (mesmo
padrão de ausência de trava já existente em `ProductGtinAlt.quantidade_por_unidade`, registrado
como item aberto pro Tech Explorer, não uma lacuna).

## Fontes (trazidas pelo usuário, preservadas para referência do Tech Explorer)

- [Unidade de Medida na NF-e: tabela oficial, uCom, uTrib e SPED — notafiscal.cnt.br](https://www.notafiscal.cnt.br/unidade-de-medida/)
- [Tabela de unidade de medida tributável no comércio exterior — FazComex](https://www.fazcomex.com.br/ncm/tabela-de-unidade-de-medida-tributavel/)
- [Diferença entre Unidade Comercial e Unidade Tributável — Guinzo](https://site.guinzo.com.br/ucomeutrib/)
- [Notas de entrada: fator de conversão de unidades — Olist](https://ajuda.olist.com/notas-fiscais-eletronicas-nfe-entrada/notas-de-entrada-fator-de-conversao-de-unidades)
- [Fatores de conversão com o mesmo produto de fornecedores diferentes — Portal SPED Brasil](https://portalspedbrasil.com.br/forum/sped-fatores-de-conversao-compra-mesmo-produto-de-fornecedores-diferentes/)
- [Tabela Unidades de Medida Tributáveis no Comércio Exterior — TaxOne](https://docs.inventsoftware.info/TaxOne.Nfe/DocumentosMarketing/TabelaUnMedTribComEx.html)
- [Portal da Nota Fiscal Eletrônica](https://www.nfe.fazenda.gov.br/portal/principal.aspx)
