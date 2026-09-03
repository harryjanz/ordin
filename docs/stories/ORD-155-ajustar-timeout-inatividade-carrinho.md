---
id: ORD-155
status: Done
estimativa: 0,5 ponto (frontend only)
tipo: melhoria
fase: 6
sprint: null
responsavel: Frontend
---

# ORD-155 — Ajustar timeout de inatividade que limpa o carrinho no totem

## Descrição
O totem reseta a sessão do cliente (carrinho inteiro + volta pra tela "Toque para começar")
depois de 2 minutos sem nenhum toque/clique/tecla — mecanismo em `App.tsx` (linhas 45-46,
`INACTIVITY_TIMEOUT_MS = 120_000`), com um modal de aviso "Ainda está aí?" que só aparece nos
últimos 10 segundos (`INACTIVITY_WARN_SEC = 10`). Confirmado por leitura de código em
2026-09-03 a pedido do usuário, que reportou o carrinho "constantemente" sumindo — o
comportamento é intencional (reset por inatividade, padrão comum em totens de autoatendimento),
mas os parâmetros atuais (2 min total / aviso só nos últimos 10s) parecem curtos demais pra um
cliente decidindo entre várias categorias do cardápio, causando perda de carrinho com mais
frequência do que o esperado.

## Persona
Cliente no totem — perde o carrinho inteiro (produtos escolhidos, quantidade, tudo) sem aviso
claro, precisando montar o pedido do zero. Também afeta o admin/operador durante demonstração ou
teste manual do totem.

## Contexto
Levantado pelo usuário em 2026-09-03 durante uma sessão de QA manual do totem (mesma sessão do
[[ORD-153]]/[[ORD-154]]) — não é a primeira vez que esse comportamento é mencionado; já tinha
sido citado de passagem numa conversa anterior sobre limpeza de dados de teste, mas nunca virou
história formal até agora.

## Explorer

### História
Como cliente no totem, quero mais tempo e um aviso mais visível antes do pedido ser cancelado
por inatividade, para não perder o carrinho enquanto ainda estou decidindo o que comprar.

### Contexto e motivação
O reset por inatividade existe por um motivo real: se um cliente for embora sem finalizar,
alguém precisa poder usar o totem em seguida sem herdar carrinho/CPF de outra pessoa. O problema
não é o mecanismo em si, é o ajuste fino dos parâmetros — 2 minutos é pouco pra decidir entre
várias categorias de cardápio (ORD-116 já suporta menu vertical com várias categorias, cada uma
com vários itens), e o aviso só aparecer nos últimos 10 segundos dá pouca margem de reação pra
quem não está com os olhos grudados no relógio.

### Fluxo principal
1. Cliente entra no catálogo (`screen === "catalog"`) e começa a navegar/decidir.
2. Timer de inatividade zera a cada toque/clique/tecla (`touch()`), como já funciona hoje.
3. Se passar do novo limiar de aviso, mostra o modal "Ainda está aí?" com contagem regressiva —
   com mais tempo de reação do que hoje.
4. Cliente toca em qualquer lugar do modal (ou no botão de continuar) → sessão renovada, modal
   fecha, carrinho intacto.
5. Só se ignorar o aviso até o fim → `goIdle()` limpa carrinho e volta pra tela de boas-vindas,
   como já acontece hoje.

### Fluxos alternativos / exceções
- Cliente ativo o tempo todo → nunca vê o modal, comportamento inalterado.
- Cliente ignora o aviso até o fim → mesmo reset de hoje (carrinho zerado, tela de boas-vindas).
- Telas fora do fluxo de cliente (`pin`, `success`, etc.) → o timer já não se aplica hoje
  (`watchedScreens = ["catalog", "cpf", "payment"]`), continua assim.

### Dependências
- Serviços envolvidos: só `frontend/totem` (constantes em `App.tsx`) — nenhuma mudança de
  backend.
- Sem histórias bloqueantes.

### Critérios de aceite funcionais
- [x] Tempo total de inatividade até o reset aumenta em relação ao valor atual — 2 min → 3 min
      (`INACTIVITY_TIMEOUT_MS = 180_000`).
- [x] Modal de aviso aparece com mais antecedência — 10s → 20s (`INACTIVITY_WARN_SEC = 20`).
- [x] Tocar em qualquer lugar do modal (não só no botão) renova a sessão — já era o comportamento
      do código (listener global em `window`, sem `stopPropagation`); confirmado ao vivo em
      2026-09-03 clicando no título do modal (não no botão "Continuar") e vendo a sessão
      renovar normalmente.
- [x] Comportamento de reset em si (limpar carrinho, voltar pra welcome) continua existindo caso
      a inatividade persista até o fim do prazo — confirmado ao vivo, reset dispara
      corretamente com os novos valores.
- [x] Nenhuma mudança nas telas onde o timer já não se aplica (`pin`, `success`, `pix`, etc.) —
      não tocado, `watchedScreens` inalterado.

### Wireframe / Mockup
N/A — reaproveita o modal de aviso já existente (`App.tsx`, linhas ~213-240), só ajusta
temporização e possivelmente a área de toque que renova a sessão.

## QA Explorer

```gherkin
Feature: Timeout de inatividade recalibrado no totem
  Como cliente no totem
  Quero mais tempo e um aviso mais visível antes do carrinho ser limpo por inatividade
  Para não perder o pedido enquanto ainda estou decidindo o que comprar

  Background:
    Dado o cliente está na tela de catálogo com itens no carrinho

  Scenario: Cliente ativo nunca vê o aviso
    Dado o cliente toca a tela (clique/touchstart/keydown) em intervalos menores que o novo
    limiar de aviso
    Quando o tempo passa normalmente
    Então o modal "Ainda está aí?" nunca aparece
    E o carrinho permanece intacto

  Scenario: Cliente inativo vê o aviso a tempo de reagir
    Dado o cliente para de tocar a tela
    Quando o tempo de inatividade atinge o novo limiar de aviso (maior que os 10s atuais)
    Então o modal "Ainda está aí?" aparece com contagem regressiva
    E o carrinho ainda não foi limpo

  Scenario: Cliente toca o modal e a sessão é renovada
    Dado o modal de aviso está visível
    Quando o cliente toca em qualquer área do modal (não só no botão de continuar)
    Então o modal fecha
    E o timer de inatividade é reiniciado
    E o carrinho permanece intacto

  Scenario: Cliente ignora o aviso até o fim — reset acontece como hoje
    Dado o modal de aviso está visível e a contagem chega a zero sem interação
    Quando o tempo total de inatividade (novo valor, maior que os 2 minutos atuais) é atingido
    Então o carrinho é limpo
    E a tela volta para "Toque para começar"

  Scenario: Timer não se aplica fora do fluxo de cliente
    Dado o totem está numa tela fora de `watchedScreens` (ex: `pin`, `success`, `pix`)
    Quando o tempo passa sem interação
    Então nenhum modal de aviso aparece
    E nenhum reset por inatividade é disparado

  Scenario: Borda — interação durante a última fração de segundo do prazo
    Dado a contagem regressiva do modal está no último segundo
    Quando o cliente toca a tela nesse instante
    Então a sessão é renovada e o carrinho não é limpo (sem condição de corrida que zere o
    carrinho mesmo com a interação registrada a tempo)
```

**Cenários revisados e aprovados pelo PM:** sim — cobrem uso ativo normal (nunca vê aviso), o
caminho de aviso-e-renovação (o ponto central da história), o caminho de abandono real (reset
preservado, não removido), a borda de telas fora do fluxo de cliente (sem regressão), e uma
borda de condição de corrida no limite exato do prazo. Não há cenário de isolamento
multi-tenant — o timer é 100% client-side, sem chamada a endpoint que precise desse teste.

## Solução Técnica

### Serviços impactados
- `frontend/totem`: único impactado. Mudança em `App.tsx` — duas constantes e um pequeno ajuste
  de UX no modal. Nenhum outro serviço/frontend envolvido.

### Endpoints
Nenhum — mecanismo 100% client-side (Zustand store local, sem chamada de rede).

### Mudança de implementação

**1. Recalibrar as constantes (`App.tsx:45-46`):**
```ts
// antes
const INACTIVITY_TIMEOUT_MS = 120_000;   // 2 min
const INACTIVITY_WARN_SEC   = 10;        // aviso só nos últimos 10s

// depois
const INACTIVITY_TIMEOUT_MS = 180_000;   // 3 min
const INACTIVITY_WARN_SEC   = 20;        // aviso nos últimos 20s
```
Proposta: 3 minutos totais (+50% sobre o atual) com 20s de aviso (2x o atual). Recalibração
moderada — resolve a queixa de "tempo curto pra decidir" sem descaracterizar a proteção de
sessão entre clientes. Números a validar com o usuário antes de implementar; fácil de ajustar
de novo depois, é só mudar as duas constantes.

**2. "Tocar em qualquer lugar do modal renova a sessão" — já funciona sem mudança de código.**
O listener de atividade é registrado em `window` (`App.tsx:98`, eventos `click`/`touchstart`/
`keydown`) e o modal não chama `stopPropagation` em lugar nenhum do código atual (confirmado por
busca no repo) — então qualquer toque no modal já borbulha até o `window` e já chama `touch()`,
que já fecha o modal no próximo tick do `setInterval` (a cada 500ms, imperceptível). Esse
critério de aceite já está satisfeito pelo código existente; não precisa de mudança, só
confirmar via teste manual que o comportamento realmente é esse (documentar no QA em vez de
implementar).

### Migrations
Nenhuma.

### Eventos de fila
Nenhum.

### Impacto em outros serviços
Nenhum — mudança isolada em duas constantes de um único arquivo do frontend do totem.

### Estimativa
- Frontend: 0,5 ponto (troca de 2 constantes + teste manual do comportamento de toque-no-modal
  que já existe).

### Riscos
- **Novo valor ainda insuficiente pra alguns clientes** — mitigado: constantes isoladas, fácil
  reajustar numa iteração futura sem nova migration/deploy complexo.
- **Timeout longo demais vira problema de fila em horário de pico** (totem "preso" com carrinho
  de um cliente que já foi embora, atrasando o próximo) — mitigado: 3 min é um aumento moderado,
  não um valor exagerado; se virar problema real no piloto presencial da Burger House, cabe nova
  história pra recalibrar de novo com dado de uso real, não achismo.

## Validação

Implementado em `App.tsx` — troca pontual de `INACTIVITY_TIMEOUT_MS` (120_000 → 180_000) e
`INACTIVITY_WARN_SEC` (10 → 20), sem tocar em mais nada (diff de 2 linhas). Testado ao vivo em
2026-09-03 em escala reduzida (valores temporários menores, só pra não esperar 3 minutos reais
por ciclo de teste, restaurados aos valores de produção depois):
- Modal "Ainda está aí?" aparece corretamente com a contagem regressiva.
- Reset por inatividade (limpar carrinho + voltar pra welcome) dispara corretamente ao fim do
  prazo se ignorado.
- Tocar em qualquer área do modal (testado no título, não no botão "Continuar") renova a sessão
  normalmente — confirma que esse critério já era satisfeito pelo código existente, sem precisar
  de mudança adicional.
