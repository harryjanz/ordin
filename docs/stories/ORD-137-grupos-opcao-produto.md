---
id: ORD-137
status: Done
fase: 6
sprint: null
responsavel: Produto
estimativa: null
tipo: feature
---

# ORD-137 — Grupos de opção no cadastro de produto (guarda-chuva)

## Descrição
Ordin ainda não tem nenhum conceito de produto com variação — hoje `Product` é um registro plano (nome, preço, categoria). O usuário quer cadastrar, por exemplo, "Refrigerante lata 350ml" como um produto único que oferece escolha obrigatória de sabor (Coca-Cola / Fanta Laranja / Fanta Uva / Guaraná Antarctica, mesmo preço), e "Batata frita" como um produto único com escolha obrigatória de tamanho (P/M/G, preços diferentes) — sem precisar cadastrar 3-4 produtos separados pra cada caso.

Pesquisa de concorrência (`docs/analise-concorrentes-grupos-opcao-produto.md`, 31/08) confirmou, com fonte primária (inclusive schema real da API do iFood), que o mercado resolve os dois casos com o **mesmo primitivo**: um "grupo de opções" reutilizável, com obrigatoriedade + seleção única/múltipla (`min`/`max`) e cada opção com preço próprio (que pode ser zero). Não são dois problemas — é um modelo só.

Decisão de arquitetura já tomada (ver análise): o grupo de opções é modelado como conceito de primeira classe no catálogo — não como truque de "produto explode em N produtos" — porque isso é o único caminho que sustenta, sem retrabalho, os casos já identificados no backlog: modificador tipo "sem cebola" (grupo com `min=0`) e pizza multi-sabor (`max>1`, achado da pesquisa aprofundada em `docs/analise-mogo-fluxo-pizza.md`). Essa decisão tem um custo reconhecido e aceito: `OrderItem` (order-service) precisa passar a carregar a opção escolhida, e o ticket impresso (`printService.ts`, totem) precisa refletir isso — hoje nenhum dos dois tem esse conceito.

Esta história (ORD-137) é a guarda-chuva de contexto/motivação — não carrega critério de aceite técnico próprio. O trabalho real está fatiado em histórias-filhas, uma por fatia de serviço, seguindo o mesmo padrão já usado em cardápios por horário (ORD-124–128):

- **ORD-138** — modelo de dados e CRUD de grupos de opção (catalog-service)
- **ORD-139** — cadastro de grupos de opção no admin (nova aba/tela em Catálogo)
- **ORD-140** — vincular grupo(s) de opção a um produto (ProductEditScreen)
- **ORD-141** — seleção obrigatória de opção no totem, antes de adicionar ao carrinho
- **ORD-142** — `OrderItem` carrega a opção escolhida + cálculo de preço (order-service)
- **ORD-143** — ticket impresso reflete a opção escolhida (`printService.ts`)

## Persona
- **Owner/manager da empresa** — cadastra grupos de opção e vincula a produtos, hoje sem esse recurso.
- **Cliente final no totem** — escolhe sabor/tamanho antes de adicionar o produto ao carrinho, hoje só vê produtos planos.
- **Operador de balcão/cozinha** — precisa ver no ticket qual opção foi escolhida (ex.: "Guaraná Antarctica"), não só o nome genérico do produto.

## Contexto
Mudança grande, priorizada pelo usuário à frente do combo/bundle (ORD-112, hoje parado em Explorer por decisão dele) e do restante do backlog adiado de 07/08 (`variantes de tamanho` e `modificadores/complementos`, ambos absorvidos por este primitivo único — ver `docs/analise-priorizacao-combo-modificadores.md` pra contexto histórico de como esses itens eram vistos antes da pesquisa de mercado).

## Sequenciamento
ORD-138 é pré-requisito de todas as outras (não existe grupo de opção sem o modelo de dado). ORD-139 e ORD-140 dependem de ORD-138 mas são independentes entre si. ORD-141 depende de ORD-139/140 (precisa ter grupo cadastrado e vinculado pra ter o que selecionar no totem). ORD-142 pode andar em paralelo com ORD-141 (schema de `OrderItem` não depende da UI do totem estar pronta). ORD-143 depende de ORD-142 (precisa da opção persistida no pedido pra imprimir).

## Pendência relacionada (não faz parte desta iniciativa)
`docs/stories/ORD-159-combo-grupo-opcao-interacao.md` — achada durante o Tech Explorer de ORD-141
(03/09): combo (ORD-150, desenvolvido depois deste épico) não tem nenhum ponto de contato com
grupo de opção — produto componente de combo com grupo obrigatório vinculado é adicionado sem
nunca perguntar a opção. Fora do escopo de ORD-141/142/143 (que tratam só produto avulso),
registrada como história separada pra decisão de prioridade do usuário.

## Nota (2026-09-04)

Esta história nunca avançou pelo próprio upstream (ficou `New`) — o guarda-chuva foi cumprido
por completo pelas histórias filhas (ORD-138 a ORD-146, todas `Done`), que implementaram modelo
de dados, cadastro admin, vínculo produto↔grupo, seleção no totem, persistência no pedido e
impressão do ticket. Status corrigido pra `Done` retroativamente — não representa trabalho
pendente.
