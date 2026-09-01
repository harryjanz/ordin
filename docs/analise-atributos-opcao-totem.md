# Análise de concorrência — quais atributos incluir em `Option` pra boa apresentação no totem

Pesquisa (2026-08-31), motivada pela observação do usuário: uma opção (sabor de pizza, sabor de refrigerante) é "praticamente um produto" — por que ela tem só `label`, `price_delta`, `image_url`/`thumbnail_url`, `sort_order`, `active` (ORD-138/145), enquanto `Product` tem também `description`, `description_long`, `calories`, `sku`, `tags`, `allergens` (ORD-075)? Pergunta: quais desses campos fazem sentido migrar/estender pra `Option`?

## Como o mercado modela o "opcional individual"

| Player | Campos confirmados do opcional individual | Fonte |
|---|---|---|
| Goomer | **Nome** + **Valor** (preço). Imagem é suportada (artigo separado confirma upload de foto em "adicionais/opcionais"), mas não há menção a descrição, SKU ou calorias no cadastro do opcional. | [Criar Opcionais](https://ajuda.goomer.com.br/goomergo/painel/cardapio/opcionais/criar-opcionais), [Salvar Foto no Produto](https://ajuda.goomer.com.br/goomergo/painel/cardapio/cardapio-principal/produtos/salvar-foto-produto) |
| iFood | `id`, `name`, `description`, `externalCode` (SKU/conciliação), `imagePath`, `price`, `status` — **o mesmo conjunto de campos de um item completo do catálogo**, porque a `option` referencia um `productId` próprio (achado já registrado em `docs/analise-concorrentes-grupos-opcao-produto.md`). | [iFood Developer — Catalog](https://developer.ifood.com.br/pt-BR/docs/guides/modules/catalog/using-api/) |
| Mogo (sabor de pizza) | Nome, grupo de sabores (categoria), **ficha técnica** (ingredientes + quantidade, pra baixa de estoque). Preço vem do grupo de sabores, com possibilidade de sobrepor por sabor individual. Sabor tem SKU próprio (prefixo `S` na integração iFood). Nenhuma menção a descrição ou imagem no cadastro do sabor. | `docs/analise-mogo-fluxo-pizza.md` (pesquisa já feita) |
| Anota AI | Cadastro de "grupos de adicionais" confirmado; **não encontrei fonte que detalhe os campos do adicional individual** (só do item de cardápio: nome, preço, descrição, imagem). Tratar como lacuna, não como "Anota AI não tem". | [Cardápio Anota AI](https://anota.ai/ajuda/cardapio/) |

## Achado central: dois modelos de mercado, não um

1. **Opção "fina"** (Goomer) — nome + preço + imagem opcional. Nada de descrição, SKU ou calorias no nível do opcional. **É o modelo que o Ordin usa hoje.**
2. **Opção "é o próprio produto"** (iFood, Mogo) — a opção carrega os mesmos campos de um item de cardápio completo (descrição, SKU, ficha técnica) porque estruturalmente **ela referencia ou É um registro de produto próprio**, não um valor solto dentro do grupo.

Nenhuma fonte confirmada mostra **calorias** ou **tags** no nível de opção em nenhum player — quando esses campos existem, ficam no produto/item, nunca no modificador. Isso é sinal forte de que não são candidatos a entrar em `Option` agora.

## Atributo por atributo

| Atributo | Evidência de mercado no nível de opção | Recomendação preliminar |
|---|---|---|
| **Descrição (curta)** | Confirmada no iFood (`description` no objeto `option`) — mas só porque lá a opção É um produto. Sem confirmação em Goomer/Mogo. | Candidato razoável: custo baixo (1 campo de texto), ajuda a diferenciar sabores com nome pouco óbvio. Mas não é unânime no mercado — é "faz sentido", não "todo mundo faz". |
| **Imagem** | Já existe no Ordin (`image_url`/`thumbnail_url`, ORD-138). Confirmada em Goomer e iFood. | Já resolvido, nada a fazer. |
| **SKU / código externo** | Confirmado em iFood (`externalCode`) e Mogo (prefixo `S`). **Correção desta análise, a partir do exemplo do usuário:** Coca-Cola lata, Fanta lata e Guaraná lata dentro de "Refrigerante lata 350ml" são, na prática, três SKUs físicos distintos — códigos de barra diferentes, fornecedores/custos diferentes, contagem de estoque diferente. Não é só "conciliação com PDV" — é a mesma necessidade que já motivou `sort_order` e o próprio `active` de ORD-145 (o cenário de "acabou a lata de Guaraná" só faz sentido operacionalmente se cada sabor for uma unidade de estoque endereçável). | **Revisado:** SKU em `Option` faz sentido — não pra aparecer no totem (cliente não vê código), mas porque a opção já É uma unidade de estoque/compra distinta sempre que representa um sabor/variante físico (bebida, sabor de pizza). Não se aplica igual a toda opção (ex.: "bem passado/mal passado" num hambúrguer não é um SKU separado) — closest ao "opção-é-produto" (iFood/Mogo) quando a opção tem existência física própria. |
| **Calorias** | Nenhuma fonte confirma no nível de opção em nenhum player. | Adiar — sem evidência de mercado, e ver bloqueio abaixo. |
| **Tags** | Nenhuma fonte confirma no nível de opção. | Não entra — é atributo de organização de produto (ORD-075), não de opção. |
| **Alérgenos** | Sem confirmação direta de "alérgeno" como campo de opção em nenhum player. O precedente mais próximo é a "ficha técnica" (ingredientes) do sabor no Mogo — que é adjacente, não a mesma coisa (ingrediente ≠ declaração formal de alérgeno). | Ver seção dedicada abaixo — é o item mais delicado, não é "só adicionar um campo". |

## Alérgenos em `Option`: por que isso é maior do que parece

Duas coisas encontradas nesta pesquisa mudam a análise:

1. **A RDC 727/2022 (base legal citada em ORD-075) regula rotulagem de "alimentos embalados fora da presença do consumidor"** — ou seja, é uma norma pensada pra embalagem de prateleira, não claramente pra cardápio de restaurante/totem de autoatendimento. As outras duas bases legais que ORD-075 já cita (Lei 10.674/2003, glúten; Lei 12.849/2013, látex) têm aplicação mais ampla, mas a pesquisa não confirma uma obrigação específica de "declarar alérgeno em totem de food service" — vale uma validação jurídica antes de tratar isso como bloqueio de compliance, no lugar de assumir que a citação original de ORD-075 cobre esse caso.
2. **Mais concreto:** ORD-075 já cadastra alérgeno em `Product` desde então, mas **deixou a exibição no totem explicitamente fora do escopo** ("cadastrar o alérgeno aqui não cumpre a exigência legal sozinho — só cumpre quando o totem também mostrar, na próxima história") — e essa história seguinte **nunca foi escrita**. Conferido agora: nenhum arquivo do totem (`frontend/totem-v3.tsx` ou equivalente) referencia `allergens` ou `calories` hoje.

**Implicação:** colocar alérgeno em `Option` sem o totem sequer mostrar o alérgeno do `Product` (que já existe há várias sprints) é construir uma segunda camada em cima de uma fundação que não existe ainda. Se o objetivo é segurança alimentar de verdade — e não só um campo no admin — a ordem certa é: (1) abrir a história represada de "mostrar alérgeno/calorias no totem" pro produto, (2) só depois avaliar se `Option` precisa do mesmo tratamento (faz sentido: um sabor de pizza pode introduzir um alérgeno que o produto-base não tem, ex. "Camarão").

## Próximos passos sugeridos

Não é Explorer ainda — é insumo pra decidir prioridade. Dois caminhos independentes, que podem virar duas histórias separadas:

- **Descrição em `Option`** — evidência de mercado moderada (iFood), custo baixo, sem dependência de nada represado. Pode ir direto pro Explorer se o usuário quiser.
- **SKU em `Option`** — revisado nesta análise: útil quando a opção representa uma unidade de estoque física própria (sabor de bebida, sabor de pizza), não como dado de apresentação no totem. Candidato a entrar junto com a descrição, ou como história própria de "opção como unidade de estoque" (abriria espaço futuro pra ligar `active` a uma contagem de estoque real, em vez de toggle manual).
- **Alérgeno/calorias em `Option`** — maior valor (segurança alimentar), mas depende da história represada de "mostrar alérgeno/calorias no totem" pro `Product`, que precisa ser resolvida primeiro (ou junto, ampliando o escopo pra cobrir produto + opção de uma vez). **Combinado com o usuário (2026-08-31): fica para depois, não esquecer de retomar.**
