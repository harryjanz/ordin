---
id: ORD-122
status: Ready
fase: 7
sprint: null
responsavel: Frontend + UX
estimativa: M
tipo: melhoria
---

# ORD-122 — Balcão mobile-first: menu compacto, janela de 24h e itens visíveis

## User story
**Como** operador de balcão usando o app no celular (uso principal do app, não desktop),
**quero** um cabeçalho que caiba na tela sem precisar rolar horizontalmente, uma fila que carregue rápido mostrando só o que é relevante agora, e ver quais itens compõem cada pedido,
**para** operar com uma mão, sem fricção, sabendo exatamente o que estou entregando no balcão.

## Contexto e motivação
Pedido direto do usuário (2026-08-24), depois de testar a ORD-121 no celular: o app foi feito pra celular, mas o cabeçalho hoje só rola horizontalmente quando não cabe tudo (fix da ORD-121) — funcional, mas "não é muito usual" pra um app mobile-first. Três pedidos relacionados, todos sobre a operação real de balcão:

1. **Cabeçalho não usual em mobile** — rolar um menu de topo horizontalmente não é um padrão comum de navegação mobile.
2. **Fila carrega pedido de qualquer data** — hoje `GET /orders?status=paid` não tem filtro de período, carrega o histórico de pagos inteiro. Operação de balcão só precisa do que está ativo agora; 24h já cobre qualquer esquecimento razoável.
3. **Ticket mostra só um código aleatório** — nem a fila nem o detalhe do pedido mostram o que tem dentro dele (nome dos itens). Pra quem está entregando no balcão, saber "é 1 Bacon Smash Duplo + 1 Batata" antes de confirmar a coleta é informação operacional básica que falta hoje.

## Análise de UX — cabeçalho mobile
Hoje o cabeçalho tem 6 elementos: logo, status "ao vivo", Turbo, nome do usuário, seletor de tema, Sair. Nem todos têm o mesmo peso de uso — Turbo, tema e Sair são ações **esporádicas** (ligadas uma vez por turno ou raramente), enquanto logo e status "ao vivo" são **informação passiva** que faz sentido estar sempre visível.

**Padrão recomendado: cabeçalho compacto + menu overflow ("⋮").** Mesmo padrão consolidado em apps mobile (Gmail, apps de operação de campo em geral) pra esse exato cenário — poucos itens de uso constante ficam na barra, o resto vai num menu que abre sob demanda:
- **Barra (sempre visível, 1 linha, cabe em qualquer largura de celular):** logo + indicador "ao vivo" (só o ponto colorido, sem o texto em telas muito estreitas) + ícone de menu (`icon-menu`) alinhado à direita.
- **Menu (painel que abre ao tocar no ícone):** Turbo ON/OFF, seletor de tema, nome do usuário/papel, Sair — empilhados verticalmente, cada um com espaço de toque generoso (mobile).

Alternativas descartadas: (a) manter rolagem horizontal — é o que já existe e o próprio usuário apontou como não usual; (b) duas linhas fixas de cabeçalho — ocupa mais espaço vertical permanentemente numa tela que já é pequena, pior que um menu sob demanda; (c) bottom navigation bar — faria sentido se houvesse múltiplas telas/seções pra navegar entre si, mas o app tem essencialmente uma tela (fila) com um detalhe modal-like (pedido) — não há "seções" pra distribuir numa bottom bar.

## Fluxos envolvidos
- **QueueScreen:** cabeçalho reduzido a logo + status + menu; painel de menu novo (Turbo/tema/usuário/Sair); carga inicial filtrada por `date_from` (últimas 24h); busca por referência passa a consultar o servidor (não só filtrar a lista já carregada), sem o filtro de 24h — pra achar pedido de qualquer data pela referência.
- **OrderDetailScreen:** lista de tickets passa a mostrar o nome do item (já vem no `qr_data`, só não era exibido), não só o código.
- **Confirmação de coleta (QueueScreen e OrderDetailScreen):** ao confirmar coleta de um QR de pedido inteiro, mostrar a lista de itens do pedido antes de confirmar (não só o código de referência) — informação operacional real na hora de entregar.

## Dependências / impacto em outros serviços
- **Nenhuma mudança de backend** — `GET /orders` já aceita `date_from`/`date_to` (ORD-077/081) e `order_ref` já é `LIKE %...%` (partial match, não exato) — ambos já existem e cobrem exatamente o que é pedido aqui. `GET /orders/{ref}/tickets` já retorna `qr_data` com o nome do produto embutido.
- Só `frontend/balcao`.

## Cenários (QA Explorer)

```gherkin
Funcionalidade: Balcão mobile-first — menu, janela de 24h, itens visíveis

  Cenário: Cabeçalho cabe numa linha em tela estreita
    Dado o app de balcão aberto num celular (largura de tela estreita)
    Quando a fila é exibida
    Então o cabeçalho mostra só logo, status "ao vivo" e o ícone de menu, numa linha só
    E não há rolagem horizontal nenhuma

  Cenário: Menu overflow reúne as ações secundárias
    Dado o cabeçalho compacto
    Quando o operador toca no ícone de menu
    Então um painel abre com Turbo, seletor de tema, nome do usuário e "Sair"
    E tocar fora do painel ou numa opção fecha o menu

  Cenário: Fila carrega só as últimas 24h
    Dado pedidos pagos de diferentes momentos (algumas horas atrás, alguns dias atrás)
    Quando a fila é carregada sem nenhuma busca
    Então só aparecem pedidos pagos nas últimas 24 horas

  Cenário: Busca por referência ignora a janela de 24h
    Dado um pedido pago há mais de 24 horas, ainda não coletado
    Quando o operador busca por parte da referência desse pedido
    Então o pedido aparece no resultado, mesmo fora da janela de 24h

  Cenário: Itens do pedido visíveis no detalhe
    Dado um pedido com múltiplos itens
    Quando o operador abre o detalhe do pedido
    Então cada ticket mostra o nome do item, não só um código

  Cenário: Itens visíveis na confirmação de coleta
    Dado um QR de pedido inteiro sendo escaneado (modo turbo desligado)
    Quando a tela de confirmação aparece
    Então lista os itens do pedido, não só a referência
```

## Solução técnica (Tech Explorer)

### 1. Cabeçalho compacto + menu (QueueScreen)
- Novo componente `src/components/HeaderMenu.tsx` — botão de ícone (`icon-menu`) que alterna um painel absoluto (`position: absolute`, ancorado à direita, mesmo padrão visual de card do design system — `var(--a-surface)`, `rounded('card')`, sombra) contendo os itens hoje espalhados no header: linha do Turbo (reaproveita o `<Button>` já existente), `ThemeModeSwitch`, nome do usuário, botão "Sair". Fecha ao clicar fora (listener de `mousedown` no documento, padrão já usado em componentes de dropdown) ou ao tocar numa opção.
- `QueueScreen.module.scss`: remove `overflow-x: auto`/`flex-wrap: nowrap` do `.header` (não precisa mais, sobra só 3 itens fixos).

### 2. Janela de 24h + busca sem janela
- `QueueScreen.tsx`: `loadQueue()` vira uma função parametrizada — sem busca, chama `GET /orders?status=paid&limit=50&date_from=<ISO de agora-24h>`; com busca (debounce de ~350ms), chama `GET /orders?status=paid&limit=50&order_ref=<termo>` (sem `date_from`). O filtro client-side atual (`.filter(o => o.order_ref.includes(search))`) é removido — a busca vira uma chamada de servidor.
- Evento WS `order.paid`: o reload que já existe (`api.get('/orders?status=paid&limit=50')`) ganha o mesmo `date_from` de 24h, pra não trazer de volta pedidos antigos ao recarregar em tempo real.

### 3. Itens visíveis
- `OrderDetailScreen.tsx`: no map de tickets, extrai `productName` de `t.qr_data.split("|")[1]` (mesmo padrão já usado no ticket compacto do totem, ORD-118) e exibe ao lado do ícone de status, no lugar do código cru (o código continua disponível, mas secundário — nome do item é o dado relevante pra operação).
- Modal de confirmação (QueueScreen e OrderDetailScreen): quando `isOrderQr`, busca `GET /orders/{ref}/tickets` ao abrir o modal (ou reaproveita a lista já carregada, no caso do OrderDetailScreen) e lista os nomes dos itens (com quantidade, agrupando por `product_name`) em vez de só mostrar a referência.

### Estimativa
**M** — sem mudança de backend, mas mexe em 3 frentes de UI (header, fetch/busca, exibição de item) espalhadas por 2 telas + 1 componente novo.

## Fora de escopo
- Qualquer filtro de período configurável pelo usuário (24h é fixo, não um seletor) — se precisar no futuro, é história separada.
- Paginação/scroll infinito além do `limit=50` já existente.

## Próximos passos
Ready — sem ambiguidade técnica, endpoints já suportam tudo que é pedido. Implementar direto.
