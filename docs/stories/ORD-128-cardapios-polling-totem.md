---
id: ORD-128
status: Ready
fase: null
sprint: null
responsavel: Frontend
estimativa: 3 pontos
---

# ORD-128 — Cardápios por horário: revalidação periódica no totem

## Descrição
Quarta e última subtarefa de ORD-124 — o totem recarrega o catálogo periodicamente em background, pra um totem parado numa tela por muito tempo refletir a virada de horário de um cardápio sem precisar de navegação manual do cliente. **Depende de ORD-127 implementado** (sem a regra de visibilidade, não há nada pra essa revalidação revelar — mas tecnicamente o mecanismo de polling em si poderia ser construído e testado contra qualquer mudança de catálogo, incluindo ativar/desativar um produto manualmente, então também poderia ser feita em paralelo a ORD-127 se o sequenciamento real do trabalho pedir isso).

Decisão já registrada em ORD-124: **polling periódico em background** (a cada 1-2 min), não só revalidação ao trocar de tela.

## Persona
Cliente final no totem — efeito só percebido indiretamente (o cardápio certo aparece sem o cliente precisar fazer nada).

---

## Explorer

### Fluxo principal
1. Totem carrega o catálogo normalmente ao abrir/voltar pra tela inicial (comportamento de hoje, sem mudança).
2. Em paralelo, um timer recarrega o catálogo a cada 1-2 minutos, mesmo que o cliente não navegue.
3. Se um cardápio mudou de estado (entrou ou saiu da janela ativa) desde a última carga, a tela de categorias/produtos reflete isso na próxima revalidação — sem piscar/resetar o que o cliente já estava fazendo (ex.: não deve interromper um cliente no meio da montagem do carrinho).

### Critérios de aceite
- [ ] Totem recarrega o catálogo (categorias + produtos) a cada 1-2 minutos, em background, independente de navegação do cliente
- [ ] A revalidação não interrompe nem reseta o carrinho do cliente em andamento
- [ ] Se um produto que estava no carrinho sai do catálogo geral por causa da virada de horário, o item **permanece no carrinho e o checkout continua funcionando normalmente** (decisão de produto já fechada em ORD-124 — sem regressão neste comportamento)
- [ ] Se a tela em que o cliente está mostra uma categoria que deixou de existir na revalidação (esvaziou por causa do horário), a tela se comporta de forma razoável (ex.: volta pra tela de categorias, ou mostra estado vazio) — sem erro ou tela branca
- [ ] Sem aumento perceptível de tráfego que prejudique a experiência (mesma escala de chamada que o totem já faz ao carregar o catálogo hoje, só repetida periodicamente)

---

## QA Explorer

```gherkin
Feature: Revalidação periódica do catálogo no totem

  Scenario: Catálogo atualiza sozinho num totem parado
    Dado um totem parado na tela de categorias, sem interação do cliente
    E um cardápio que estava ativo sai da janela (horário vira)
    Quando o intervalo de polling se completa
    Então a tela reflete a mudança (categoria/produto do cardápio expirado some), sem o cliente precisar navegar

  Scenario: Revalidação não interrompe o carrinho
    Dado um cliente com itens no carrinho, no meio da montagem do pedido
    Quando o polling recarrega o catálogo em background
    Então o carrinho do cliente permanece intacto, sem perder itens nem resetar a tela

  Scenario: Item do carrinho sobrevive à virada de horário até o checkout
    Dado um cliente com um item de cardápio no carrinho
    Quando o horário do cardápio vira antes do pagamento
    Então o cliente ainda consegue finalizar a compra normalmente (ver ORD-124, decisão já fechada)

  Scenario: Categoria que esvaziou não quebra a tela
    Dado o cliente navegando dentro de uma categoria cujo único produto era de um cardápio que acabou de expirar
    Quando o polling atualiza o catálogo
    Então a tela mostra um estado vazio ou volta pra tela anterior, sem erro
```

---

## Tech Explorer

### Serviços impactados
- `frontend/totem/` apenas.

### Direção técnica
`setInterval` (1-2 min) chamando a mesma função de carregamento de catálogo já usada hoje ao montar a tela — reaproveitar, não duplicar a lógica de fetch. Cuidado explícito pra não resetar estado de UI não relacionado ao catálogo em si (carrinho, tela atual, seleção em andamento) — a atualização deve ser "silenciosa", só trocando os dados de categorias/produtos disponíveis.

Consultar como o carrinho local do totem referencia produtos (por id apenas, ou por snapshot dos dados no momento da adição) — se for só por id, confirmar que o checkout resolve os dados do produto no momento do pagamento sem depender de ele ainda estar na lista "disponível agora" (senão o critério de aceite "carrinho sobrevive até o checkout" quebra).

### Riscos
- Maior risco é o mesmo apontado no critério de aceite: garantir que a revalidação não perturbe um cliente no meio de uma interação — testar especificamente com um carrinho parcialmente montado ativo durante o disparo do polling.
- Sem risco de sobrecarga de backend — mesma chamada que já existe hoje, só repetida em intervalo longo (1-2 min), não polling agressivo.

### Estimativa
3 pontos — mecanismo simples (timer + refetch), maior parte do esforço é garantir que não interfere no estado de carrinho/navegação do cliente.

---

## Ready

**Explorer:** [x] · **QA Explorer:** [x] · **Tech Explorer:** [x] · **Aprovação final:** [x] — decisão de produto (polling periódico, não só por navegação) já fechada em ORD-124.

**Status: Ready** — depende de ORD-127 implementado antes de ter algo visível pra testar de ponta a ponta (o mecanismo em si pode ser construído mais cedo se o sequenciamento real pedir).
