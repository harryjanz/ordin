# Análise de concorrência — fluxo de pizza no Mogo

Pesquisa (2026-08-31), salva pra uso futuro. Aprofundamento específico do achado superficial da pesquisa de grupos de opção (`docs/analise-concorrentes-grupos-opcao-produto.md`), que identificou o Mogo como o único player com fluxo de pizza dedicado (separado do mecanismo genérico de "grupo de opções"). Ainda não é Explorer — é insumo pra quando o Ordin for endereçar pizza especificamente (meio a meio, fração de sabor por tamanho), caso vire prioridade.

**Fontes:** Central de Ajuda oficial do Mogo (ajuda.mogo.com.br) — quatro artigos específicos de pizza — e a página de produto mogo.com.br/sistema-para-pizzaria/. Não há vídeos tutoriais do canal do YouTube do Mogo nem documentação pública da tela de venda (PDV/totem) em si — a Central de Ajuda cobre só o lado de cadastro.

## O que está confirmado

### 1. Cadastro de sabores
`Cadastro > Suprimentos > Sabores` ([artigo](https://ajuda.mogo.com.br/como-cadastrar-sabores-de-pizza/)): clica em "+", preenche nome do sabor, seleciona o **"grupo de sabores"** (categoria) e define a ficha técnica (ingredientes e quantidade consumida, pra baixa de estoque). O artigo não detalha campos de preço nessa tela — preço fica em outro fluxo. Sabores levam prefixo `S` na integração com iFood, confirmando que cada sabor é uma entidade própria com ID único (não um atributo solto).

### 2. Preço por grupo de sabores
`Cadastro > Suprimentos > Pizzas`, botão "Ajustar Preço" ([artigo](https://ajuda.mogo.com.br/como-ajustar-os-precos-de-sabores-por-grupo-de-sabores/)): preço é editado **por grupo de sabores** (ex.: grupo "especiais" mais caro que "tradicionais"), não por sabor individual isoladamente — confirma que sabores têm preço próprio, organizado por categoria/grupo.

### 3. Cadastro de tamanhos
`Cadastro > Suprimentos > Pizzas` ([artigo](https://ajuda.mogo.com.br/como-cadastrar-uma-pizza/)): cada tamanho é um produto/SKU próprio (prefixo `PZ`), com abas:
- **Pizza** — Descrição, Preço base, Grupo ("Pizzas"), Impressora, e o campo-chave **"Quantidade de sabores"** (número máximo de sabores permitido pra aquele tamanho)
- **Adicionais Pizza** — bordas
- **Sabores** — lista de sabores habilitados pra esse tamanho, cada um podendo sobrepor o preço padrão com "um valor diferente do valor padrão" direto no grid
- **Fiscal** — impostos

Arquitetura confirmada: **tamanho = produto/SKU com preço base + limite de sabores; sabor = entidade vinculável com preço próprio opcional que sobrepõe o padrão quando definido**.

### 4. Bordas/adicionais
`Cadastro > Suprimentos > Adicionais` (prefixo `AD` no iFood), vinculadas na aba "Adicionais Pizza" **dentro do cadastro do tamanho** — ou seja, adicional é configurado junto ao tamanho, não ao sabor, com preço próprio definido na inclusão.

## Lacunas explícitas — não documentadas publicamente, não inferidas

- **Fórmula de cálculo com múltiplos sabores** (maior preço entre os sabores / soma / média) — o campo "Quantidade de sabores" confirma que existe um limite configurável por tamanho, mas a regra de precificação da fração não está documentada em nenhuma fonte encontrada.
- **Fluxo real da tela de venda/PDV** (ordem tamanho→sabor ou sabor→tamanho) — não documentado publicamente.
- **Terminologia e UX de "meio a meio"** — sem menção explícita nos materiais oficiais. O campo "Quantidade de sabores" sugere suporte técnico a múltiplos sabores por pizza (o que viabiliza meio a meio na prática), mas não há confirmação de como isso aparece na tela nem se o sistema usa esse termo.
- **Distinção formal "doce" vs. "salgada"** nos sabores além do "grupo de sabores" genérico — não confirmada.

Se esses pontos virarem relevantes (ex.: Ordin decidir endereçar pizza meio a meio), o caminho é abrir uma conta trial do Mogo ou pedir demo comercial — a documentação pública não cobre a tela de venda.

## Fontes
- [Como Cadastrar uma Pizza](https://ajuda.mogo.com.br/como-cadastrar-uma-pizza/)
- [Como Cadastrar Sabores de Pizza](https://ajuda.mogo.com.br/como-cadastrar-sabores-de-pizza/)
- [Como ajustar os preços de sabores por grupo de sabores](https://ajuda.mogo.com.br/como-ajustar-os-precos-de-sabores-por-grupo-de-sabores/)
- [Como Vincular os Produtos no Ifood](https://ajuda.mogo.com.br/como-vincular-os-produtos-no-ifood/)
- [Sistema para Pizzaria - Mogo Gourmet](https://mogo.com.br/sistema-para-pizzaria/)
