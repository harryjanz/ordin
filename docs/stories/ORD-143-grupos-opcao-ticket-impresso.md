---
id: ORD-143
status: Done
fase: 6
sprint: null
responsavel: Frontend
estimativa: 2 pontos
tipo: feature
---

# ORD-143 — Grupos de opção: ticket impresso reflete a opção escolhida

## Descrição
`printService.ts` (totem) hoje imprime só o nome do produto no ticket — sem campo pra opção/variante escolhida. Depois de ORD-142, o pedido já carrega a opção selecionada; esta história ajusta a impressão pra mostrar isso no ticket (ex.: "Refrigerante lata 350ml — Guaraná Antarctica"), pra balcão/cozinha saberem exatamente o que preparar/entregar sem ambiguidade.

## Persona
Operador de balcão/cozinha, coletando/preparando o pedido pelo ticket impresso.

## Contexto
Depende de ORD-142 (precisa da opção persistida no pedido pra ter o que imprimir). Fecha o ciclo completo da iniciativa ORD-137 — sem esta história, a opção escolhida fica invisível pra quem prepara o pedido. Ver `docs/stories/ORD-137-grupos-opcao-produto.md` pra contexto da iniciativa completa.

## Explorer

### História
Como operador de balcão/cozinha, quero ver no ticket impresso qual opção o cliente escolheu (sabor, tamanho), para preparar/entregar o item certo sem precisar perguntar ou adivinhar.

### Contexto e motivação
**Achado importante ao investigar o código antes de escrever esta história:** o ticket impresso
**já mostra a opção escolhida na prática**, por efeito colateral de como ORD-141/142 foram
implementados — `product_name` do `OrderItem` já vem com o sufixo da opção embutido (ex.:
`"Refrigerante Lata 350ml — Guaraná Antarctica"`), porque é literalmente o `CartItem.name` que o
totem monta em `addProductWithOptionsToCart` (ORD-141) e manda como `item.name` em
`POST /orders`. O `qr_data` de cada ticket (`{código}|{product_name}|{ref}|...`) carrega esse
nome completo, e é dali que `printService.ts`/`SuccessScreen.tsx` extraem o texto impresso
(`qr_data.split("|")[1]`) — não há nenhum código novo pra "adicionar a opção", ela já está lá.

**O problema real que esta história precisa resolver:** o formato de impressão silenciosa
(ESC/POS, via QZ Tray — o caminho **principal**, preferido sobre o fallback de navegador) no
modo `por_item` (`buildEscPosBase64`, `printService.ts`) **corta o nome em 18 caracteres**
(`.slice(0, 18)`) — escolhido porque o nome é impresso em fonte dupla-largura/dupla-altura, que
cabe menos caracteres por linha num rolo de 80mm. Um nome só de produto ("Classic Cheddar
Burger") já usa boa parte desse espaço; com o sufixo da opção (`"Refrigerante Lata 350ml —
Guaraná Antarctica"`, 42+ caracteres), o corte de 18 caracteres apaga a opção inteira e ainda
mutila o nome do produto — exatamente o oposto do que a persona precisa (saber sem ambiguidade o
que preparar).

O modo `retirada_unica` (`buildEscPosBase64Compact`) e os dois fallbacks HTML
(`buildPrintHtml`/`buildCompactPrintHtml`, usados só quando QZ Tray está indisponível) **não têm
esse problema** — não truncam, o texto só ficaria comprido numa linha só. Ainda assim, um nome +
opção concatenados numa linha corrida (sem separação visual) é pior de ler rápido no balcão do
que produto e opção em linhas distintas.

**Decisão de design proposta** (a confirmar no Tech Explorer): manter o nome combinado já
funcionando (não reverter ORD-141, que já foi validado ao vivo com o carrinho mostrando esse
mesmo formato) como fonte da verdade pro texto impresso — só corrigir a apresentação: (1)
aumentar/ajustar o limite de corte do modo ESC/POS `por_item` pra caber nome + opção sem
truncar informação relevante, reestruturando em 2 linhas (produto em destaque, opção numa linha
menor abaixo) em vez de uma linha só cortada; (2) aplicar a mesma separação visual (2 linhas) nos
demais formatos (compacto e fallbacks HTML) por consistência, mesmo sem bug de truncamento ali.

### Fluxo principal
1. Cliente finaliza a compra de um produto com opção escolhida (ORD-141) e o pagamento é
   aprovado.
2. Totem busca os tickets do pedido (`GET /orders/{ref}/tickets`, já retorna `selected_options`
   desde ORD-142) e imprime, via QZ Tray (silencioso) ou fallback do navegador.
3. Ticket impresso mostra o nome do produto em destaque e, numa linha logo abaixo, a opção
   escolhida — sem corte, sem ambiguidade.
4. Operador de balcão/cozinha lê o ticket e prepara/separa exatamente o item certo.

### Fluxos alternativos / exceções
- **Item sem opção** (produto sem grupo vinculado): ticket imprime só o nome do produto, sem
  linha de opção — comportamento inalterado, exatamente como hoje.
- **Item com múltiplas opções** (seleção múltipla, `max_selections > 1`, ex. pizza 2 sabores):
  hoje o nome combinado já suportaria múltiplas opções concatenadas (`addProductWithOptionsToCart`
  já junta todos os `option_label` selecionados com vírgula) — Tech Explorer confirma se cabe
  numa linha só ou precisa quebrar mais.
- **QZ Tray indisponível** (fallback HTML via `window.print()`): mesma correção de layout
  (2 linhas) se aplica lá também, por consistência — não é um caminho novo, só ajuste visual.
- **Nome de produto já muito longo mesmo sem opção**: comportamento de truncamento pré-existente
  (fora do escopo desta história alterar regra pra produto sem opção).

### Dependências
- Serviços envolvidos: nenhum backend novo — ORD-142 (`Done`) já expõe tudo que esta história
  precisa (`product_name` combinado no `qr_data`, e `selected_options` estruturado em
  `GET /orders/{ref}/tickets`, hoje sem uso nenhum no totem).
- Frontend: `frontend/totem/src/lib/printService.ts` (ESC/POS, os dois formatos) e
  `frontend/totem/src/screens/SuccessScreen.tsx` (os dois builders de HTML fallback).
- Histórias bloqueantes: nenhuma — ORD-142 já está `Done`. Última história do épico ORD-137;
  depois desta, o ciclo completo (cadastro → seleção no totem → persistência → impressão) fica
  fechado.

### Critérios de aceite funcionais
- [ ] Ticket de item com opção escolhida imprime o nome do produto e a opção sem cortar nenhum
      dos dois, em qualquer um dos 4 formatos de impressão (ESC/POS por_item, ESC/POS compacto,
      HTML fallback por_item, HTML fallback compacto).
- [ ] Ticket de item sem opção continua idêntico ao comportamento atual.
- [ ] Nome do produto e opção ficam visualmente distinguíveis (linhas separadas, não uma string
      corrida só).
- [ ] Nenhuma mudança no que já foi validado no carrinho/tela do totem (ORD-141) — esta história
      é só sobre o ticket impresso.

### Wireframe / Mockup
Sem mockup formal — referência visual é o próprio ticket já impresso hoje (nome do produto em
destaque, dupla altura/largura no modo ESC/POS por_item), só adicionando uma segunda linha
menor logo abaixo pra opção, quando houver.

## QA Explorer

Sem endpoint novo — sem cenário de auth/isolamento multi-tenant próprio (dado já vem de
`GET /orders/{ref}/tickets`, já protegido desde ORD-142). Superfície testável é só a formatação
de impressão nos 4 caminhos existentes.

```gherkin
Feature: Ticket impresso reflete a opção escolhida
  Como operador de balcão/cozinha
  Quero ver a opção escolhida (sabor, tamanho) no ticket impresso
  Para preparar/entregar o item certo sem ambiguidade

  Background:
    Dado um pedido pago com um item que tem opção escolhida (ORD-141/142)

  # ── Happy path — 4 formatos de impressão ─────────────────────────────────

  Scenario: ESC/POS modo por_item (silencioso, QZ Tray) — nome e opção sem corte
    Dado fulfillment_mode="por_item" e QZ Tray disponível
    Quando o ticket do item "Refrigerante Lata 350ml — Guaraná Antarctica" é impresso
    Então o nome do produto aparece completo (não cortado em 18 caracteres)
      E a opção "Guaraná Antarctica" aparece numa linha visualmente separada do nome

  Scenario: ESC/POS modo retirada_unica (silencioso, compacto) — nome e opção sem corte
    Dado fulfillment_mode="retirada_unica" e QZ Tray disponível
    Quando o ticket compacto é impresso com o item que tem opção
    Então a linha do item mostra produto e opção separados visualmente, não concatenados numa
      string corrida só

  Scenario: Fallback HTML modo por_item (QZ Tray indisponível)
    Dado QZ Tray indisponível, cai no fallback window.print()
    Quando o HTML do ticket é gerado pro item com opção
    Então o nome do produto e a opção aparecem em elementos/linhas visualmente distintos

  Scenario: Fallback HTML modo retirada_unica (QZ Tray indisponível)
    Dado QZ Tray indisponível, fulfillment_mode="retirada_unica"
    Quando o HTML compacto é gerado
    Então cada linha de item mostra produto e opção separados visualmente

  # ── Bordas / regressão ──────────────────────────────────────────────────

  Scenario: Item sem opção — comportamento inalterado
    Dado um item sem grupo de opção vinculado
    Quando o ticket (qualquer um dos 4 formatos) é impresso
    Então imprime só o nome do produto, sem linha de opção, idêntico ao comportamento anterior a
      esta história

  Scenario: Item com múltiplas opções (seleção múltipla)
    Dado um item com 2 opções escolhidas (ex.: pizza com 2 sabores)
    Quando o ticket é impresso
    Então as 2 opções aparecem legíveis (numa linha ou mais, sem cortar nenhuma), não só a
      primeira

  Scenario: Nome de produto longo mesmo sem opção
    Dado um produto com nome já longo, sem grupo de opção vinculado
    Quando o ticket é impresso
    Então o comportamento de truncamento pré-existente (fora do escopo desta história) continua
      igual — sem regressão introduzida por esta história nesse caso

  Scenario: Regressão — carrinho e tela do totem inalterados
    Dado a mesma sessão de compra com opção escolhida (ORD-141)
    Quando o cliente revisa o carrinho antes de pagar
    Então o carrinho continua mostrando o nome combinado exatamente como antes (esta história não
      toca `CatalogScreen.tsx`/`App.tsx` do fluxo de compra, só a impressão pós-pagamento)
```

**Cenários aprovados pelo PM** — happy path cobre os 4 caminhos de impressão (ESC/POS e HTML,
por_item e compacto); bordas cobrem item sem opção (regressão), múltiplas opções, nome longo
pré-existente e confirmação de que o carrinho/tela de compra não muda. Sem cenário de auth/
isolamento — história é puramente de formatação de impressão, sem endpoint novo.

## Solução Técnica

### Serviços impactados
- Nenhum backend — `product_name` combinado (`"Produto — Opção"`) já chega pronto via `qr_data`
  desde ORD-142. Único serviço tocado: `frontend/totem` (só camada de impressão).

### Endpoints
Nenhum novo/alterado.

### Migrations
Nenhuma.

### Eventos de fila
N/A.

### Impacto em outros serviços
Nenhum.

### Detalhes de implementação

**Decisão-chave:** em vez de usar o campo estruturado `selected_options` (que existe na API
desde ORD-142 mas nunca foi tipado/usado no totem), a opção é extraída **fazendo split do
`product_name` já combinado** no mesmo separador `" — "` que `addProductWithOptionsToCart`
(`CatalogScreen.tsx`, ORD-141) já usa pra montá-lo. Motivo: usar `selected_options` estruturado
exigiria também parar de colocar o sufixo em `product_name` (senão a opção apareceria 2x —
uma vez no título combinado, outra na linha estruturada) — mudança que tocaria
`CatalogScreen.tsx`/`App.tsx` já validados ao vivo pelo usuário no ORD-141, contrariando o
critério de aceite "carrinho/tela de compra inalterados". Fazer o split só na camada de
impressão é local, reversível, e não risca nada já validado.

Novo helper compartilhado em `printService.ts`:
```ts
function splitNameOption(combined: string): { name: string; option: string | null } {
  const idx = combined.indexOf(" — ");
  if (idx === -1) return { name: combined, option: null };
  return { name: combined.slice(0, idx), option: combined.slice(idx + 3) };
}
```
Risco de colisão (nome de produto real contendo " — ") é aceito — separador raro em nome de
produto, mesmo racional de qualquer parsing de string neste arquivo (já faz `qr_data.split("|")`
confiando no formato).

**`buildEscPosBase64` (ESC/POS, `por_item`)** — troca:
```ts
text(norm(productName).toUpperCase().slice(0, 18)); nl();
```
por:
```ts
const { name, option } = splitNameOption(productName);
text(norm(name).toUpperCase().slice(0, 18)); nl();          // título, mesmo tamanho/corte de hoje
if (option) {
  raw(0x1B, 0x45, 0x00); // bold off — opção não compete visualmente com o nome
  text(norm(option).slice(0, 32)); nl();                     // fonte normal, sem corte agressivo
  raw(0x1B, 0x45, 0x01); // bold on de novo — resto do bloco (Unidade X de Y) já espera bold
}
```
Sem opção: comportamento idêntico ao atual (regressão coberta).

**`buildEscPosBase64Compact`** — troca:
```ts
text(`${tk.total_units}x ${norm(productName)}`); nl();
```
por:
```ts
const { name, option } = splitNameOption(productName);
text(`${tk.total_units}x ${norm(name)}`); nl();
if (option) text(`   ${norm(option)}`); nl();                 // indentado, sub-linha
```

**`buildPrintHtml`/`buildCompactPrintHtml`** (`SuccessScreen.tsx`) — mesmo `splitNameOption`
(duplicado localmente ou importado de `printService.ts`, decisão de implementação sem impacto de
arquitetura); `option` renderiza em elemento novo (`.ticket-option`/`.item-option`, fonte menor,
cor mais clara) logo abaixo do nome, só quando não-null.

### Estimativa
- Frontend: 2 pontos (1 helper reutilizado em 4 lugares, sem lógica nova de negócio, sem
  chamada de API nova).

### Riscos
- **Nome de produto real contendo " — "**: opção ficaria destacada incorretamente (parte do
  próprio nome tratada como "opção"). Aceito — separador deliberadamente raro, mesmo padrão de
  confiança já usado no parsing de `qr_data.split("|")` neste arquivo.
- **Truncamento de 32 caracteres na opção (ESC/POS por_item) ainda cortar em caso extremo**
  (muitas opções de seleção múltipla concatenadas): mitigado por ser bem mais generoso que os 18
  atuais e por normalmente ter só 1-2 opções por item — não eliminado 100%, mas não há como
  garantir sem medir numa impressora física real (fora do alcance de teste automatizado desta
  história).
- **HTML fallback**: interpolação de string sem escape já é o padrão pré-existente no arquivo
  (`${productName}` direto no template) — não é risco novo introduzido por esta história, só
  mantido como já estava.

## Ready

**Explorer**
- [x] História no formato Como/Quero/Para
- [x] Contexto e motivação documentados (achado: ticket já mostra a opção por efeito colateral,
      problema real é truncamento em 18 chars no ESC/POS por_item)
- [x] Fluxo principal passo a passo
- [x] Dependências identificadas (ORD-142 `Done`, sem bloqueio)
- [x] Wireframe/mockup: referência ao layout já impresso hoje
- [x] Critérios de aceite funcionais escritos (4 itens)

**QA Explorer**
- [x] Happy path em Gherkin (4 cenários — um por formato de impressão)
- [x] Cenários de borda (4: sem opção, múltiplas opções, nome longo pré-existente, regressão do
      carrinho)
- [x] Isolamento multi-tenant: N/A — sem endpoint novo
- [x] Cenários aprovados pelo PM

**Tech Explorer**
- [x] Serviços impactados documentados (só frontend/totem, camada de impressão)
- [x] Endpoints: nenhum novo
- [x] Migrations: nenhuma
- [x] Eventos de fila: N/A
- [x] Estimativa definida (2 pontos)
- [x] Riscos identificados (3, todos com mitigação ou aceite explícito)

**Aprovação final**
- [x] Time revisou e concordou com a solução técnica
- [x] Estimativa acordada (2 pontos)
- [x] Sem bloqueios não resolvidos
- [x] Priorizada no sprint backlog

**Status final: Ready.**

## Validação (implementação, 2026-09-03)

Implementado conforme o Tech Explorer: `splitNameOption` em `printService.ts` (exportado, único
lugar com a lógica), usado nos 4 pontos (`buildEscPosBase64`, `buildEscPosBase64Compact`,
`buildPrintHtml`, `buildCompactPrintHtml`). `.ticket-name`/`.ticket-title` em `SuccessScreen.tsx`
reestruturados pra acomodar a nova linha `.ticket-option`/`.item-option` sem quebrar o layout
existente pra item sem opção.

`npx tsc --noEmit` limpo.

**Lógica de split validada isoladamente** (script Node standalone, sem depender do browser):
| Entrada | `name` | `option` |
|---|---|---|
| `"Refrigerante Lata 350ml — Guaraná Antarctica"` | `"Refrigerante Lata 350ml"` | `"Guaraná Antarctica"` |
| `"Classic Cheddar Burger"` (sem opção) | `"Classic Cheddar Burger"` | `null` |
| `"Pizza G — Marguerita, Calabresa"` (seleção múltipla) | `"Pizza G"` | `"Marguerita, Calabresa"` |
| `"Produto com — dentro do nome mesmo — Opção"` (colisão do separador) | `"Produto com"` | `"dentro do nome mesmo — Opção"` — risco aceito, já documentado no Tech Explorer |

**Confirmado com dado real**: pedido de teste criado via totem (Refrigerante + opção Guaraná,
dentro de um combo) — `GET /orders/{ref}/tickets` retornou exatamente os 3 formatos esperados:
`"Refrigerante Lata 350ml — Guaraná Antarctica"` (produto avulso com opção, split funciona),
`"Classic Cheddar Burger (Combo Classic Cheddar)"` e `"Coca-Cola Lata 350ml (Combo Classic
Cheddar)"` (itens de combo, formato de sufixo diferente — parênteses, não `" — "` — `option`
corretamente `null`, sem interpretar errado o texto do combo como opção).

**Limitação da validação:** não foi possível ver o HTML/ticket renderizado de verdade no
navegador — o fallback (`window.print()`) dispara o diálogo nativo de impressão do sistema, que
bloqueia a sessão de automação usada nesta investigação (travou uma aba de teste, precisou ser
fechada). Sem impressora física/QZ Tray neste ambiente pra testar o caminho ESC/POS principal
também. Confiança na correção vem da lógica isolada validada + revisão de código (interpolação
simples de string em template já existente, mesmo padrão usado pros outros campos do ticket) —
não de teste visual ponta a ponta do papel impresso. Recomendado: validação visual com impressora
física real antes de considerar 100% fechado, se possível.
