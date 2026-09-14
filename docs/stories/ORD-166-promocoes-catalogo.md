---
id: ORD-166
status: New
fase: 6
sprint: null
responsavel: Backend SR + Frontend (admin + totem)
---

# ORD-166 — Promoções no catálogo: desconto percentual por período, categoria e produto

## Descrição
O catálogo do Ordin hoje cobre categorias, produtos, combos, grupos de opção e produtos
correlacionados, mas não tem nenhum mecanismo de promoção — não existe desconto por período,
happy hour, nem liquidação de item parado. Isso é uma lacuna comercial relevante: promoção por
tempo limitado com percentual de desconto é ferramenta básica de qualquer operação de food
service. A proposta é criar uma nova aba de **Promoções** dentro do catálogo, na mesma
listagem/padrão de UI já usado pra categorias e produtos. Cada promoção:
- agrega um conjunto de categorias e/ou produtos escolhidos pelo admin;
- tem vigência definida por data e hora de início e de fim;
- aplica um percentual de desconto geral sobre todos os itens da promoção;
- permite sobrescrever esse percentual individualmente, por categoria ou por produto dentro da
  mesma promoção, quando o desconto padrão não deve valer igual pra todo mundo.

No totem, a promoção ativa e o desconto aplicado precisam ficar visualmente evidentes pro
cliente durante a compra.

## Persona
**Admin da empresa** — cria e gerencia promoções no painel admin (composição de categoria/
produto, período de vigência, percentuais geral e por item).
**Cliente no totem** — vê a promoção e o desconto aplicado durante a navegação e o carrinho.

## Contexto
Levantado pelo usuário como próxima história a abrir, antes de seguir com qualquer item do
roadmap de gap de concorrência (`docs/analise-gap-features-roadmap-futuro.md`) — é prioridade
isolada, não faz parte daquela lista. Desconto por período/percentual é recurso presente na
maioria dos concorrentes de catálogo/PDV já pesquisados (CPlug, Consumer, Mogo, CardápioWeb,
Genesis PRO), mas essa lacuna específica ainda não tinha sido mapeada como gap explícito — a
rodada anterior comparou o Ordin especificamente contra o Genesis PRO, sem cobrir promoção.
Diferente das features daquele roadmap, esta não depende de nenhuma outra feature ainda não
implementada (fidelidade, cashback etc.) — encaixa direto no catálogo existente.

## Perguntas em aberto pro Explorer
Não bloqueiam o avanço deste step (critério de saída do New já está atendido: título, descrição
mínima e persona/contexto), mas ficam registradas pra próxima etapa aprofundar:
- Duas promoções podem coexistir sobre o mesmo produto? Se sim, como resolve conflito (soma,
  maior desconto, mais recente)?
- O desconto de promoção se aplica a um produto quando ele está dentro de um combo, ou só
  quando vendido avulso?
- O percentual incide sobre o preço vigente da tabela de preço/plano contratado da empresa
  (ORD-162/163/164/165), certo? Vale confirmar a ordem de aplicação se houver mais de uma regra
  de preço atuando junto.
- Qual timezone rege o período de vigência (data/hora início/fim) — o da empresa, do terminal,
  ou UTC armazenado e convertido na exibição?
- Promoção expira sozinha ao passar do horário final, ou precisa de ação manual (ex.: um job/
  flag) pra deixar de valer?
- Quando uma categoria tem desconto geral e um produto dela tem override próprio, a UI do admin
  deixa claro visualmente qual dos dois está valendo pra aquele item?
