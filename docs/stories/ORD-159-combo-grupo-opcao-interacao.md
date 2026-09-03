---
id: ORD-159
status: New
fase: 6
sprint: null
responsavel: Produto
estimativa: null
tipo: feature
---

# ORD-159 — Interação entre combo e grupo de opção

## Descrição
Combo (ORD-150) e grupo de opção (ORD-137/138-146) foram desenvolvidos em sequência (grupo de
opção em 31/08, combo a partir de 01/09) sem nenhum ponto de contato entre os dois modelos —
`Combo`/`ComboItem` (catalog-service) não tem nenhuma referência a `OptionGroup`. Hoje, se um
produto componente de um combo tiver grupo de opção obrigatório vinculado, o fluxo de adicionar
combo ao carrinho (`addComboToCart`, `CatalogScreen.tsx`) ignora completamente a obrigatoriedade —
o cliente nunca é perguntado qual sabor/tamanho quer para aquele componente.

**Achado concreto que motivou o registro desta pendência (2026-09-03):** o único combo real do
ambiente de demonstração ("Combo Classic Cheddar") tinha seu componente "Classic Cheddar Burger"
vinculado, por engano, ao grupo obrigatório "Sabores de bebida" — vínculo de teste esquecido de
quando ORD-138/139/140 foram desenvolvidas, sem relação de negócio real (removido em
2026-09-03, ver `docs/stories/ORD-141-grupos-opcao-selecao-totem.md`). O vínculo errado expôs o
gap: nada no código teria impedido — nem sinalizado — esse combo vender um "burger com sabor de
bebida obrigatório e nunca perguntado" caso o dado estivesse certo desde o início.

Esta história não tenta resolver o gap agora — só registra formalmente a pendência, achada durante
o Tech Explorer de ORD-141, para que a decisão de prioridade/desenho fique com o usuário, e não se
perca. Fica fora do escopo de ORD-141/142/143 (produto avulso no totem), que continuam tratando
apenas o fluxo de `handleAddProduct`, sem tocar `addComboToCart`.

## Persona
Cliente final no totem, ao comprar um combo cujo componente tem grupo de opção vinculado — hoje
não tem como personalizar (sabor/tamanho) esse componente specific dentro do combo.

## Contexto
Depende, no mínimo, de ORD-141 (seleção de opção no totem) já existir pra ter um padrão de UI a
reaproveitar. Decisão de produto em aberto: seleção por componente dentro do combo é obrigatória
do mesmo jeito que produto avulso, ou o combo pode restringir/proibir vincular grupo obrigatório a
um dos seus componentes no cadastro admin (mais simples, mas limita o catálogo)? Nenhuma das duas
foi avaliada ainda — fica pro Explorer desta história.
