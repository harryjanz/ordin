# Análise de concorrentes — cardápios por horário (dayparting)

## Fonte

Pesquisa (WebSearch/WebFetch) disparada por pedido direto do usuário (2026-08-24): implementar cardápios específicos por horário/dia da semana (ex.: café da manhã das 8h às 10h, almoço das 11h30 às 15h). Cobertura:

- Concorrentes diretos já catalogados em [[project_ordin_concorrentes_referencia]]: **Goomer** e **CardápioWeb** têm central de ajuda pública documentando exatamente essa funcionalidade — os outros da lista (Consumer, Zig, Cplug, Nola, Gototem, PagTotem, Suitable, Mogo, Chama Cliente) não têm artigo público específico sobre o assunto (busca dedicada não achou nada além de menção genérica de "cardápio atualiza em tempo real").
- **Datacaixa** (achado durante a busca, não estava na lista) — tem central de ajuda sobre "disponibilidade de produto", mas é só controle por estoque mínimo, sem noção de horário. Adicionado aqui como contraste, não como recomendação de entrar na lista de concorrentes (não é um totem de autoatendimento).
- Mercado internacional, pra comparar um modelo mais maduro: **Toast POS** (grande player americano, documentação pública robusta) e **Clover** (fórum de pedidos de feature, mostra dor real de operador). Fora do nicho brasileiro de totem, mas o conceito ("dayparting") é antigo e bem resolvido nesse mercado — vale como referência de maturidade.
- **WhatsMenu** — sistema de cardápio digital/WhatsApp menor, achado por ter uma feature chamada literalmente "Daypart Menus", com documentação pública detalhada incluindo limitações reais.

## Baseline: o que o Ordin tem hoje

Catálogo simples, dois níveis: `Category` (com `active`, agora com `sort_order`) e `Product` (com `active`, `category_id`, `sort_order` por categoria). Nenhum conceito de horário — um produto/categoria está sempre visível no totem, ou nunca (via `active=false`). Sem conceito de "cardápio" como objeto — o catálogo inteiro é um cardápio só, sempre igual, o dia inteiro.

---

## Leitura por concorrente

| Sistema | Nível de aplicação | Granularidade | O que acontece fora da janela | Produto em mais de um cardápio/horário? |
|---|---|---|---|---|
| **Goomer** | Produto **e** categoria (grupo) | Dia(s) + 1 janela de horário por config | Some do cardápio (sem mensagem visível documentada) | Sim, tecnicamente — mas se o grupo tem horário próprio, o horário do produto só vale **dentro** do horário do grupo (o mais restritivo vence) |
| **CardápioWeb** | Produto **e** categoria | Dia(s) + 1 janela por entrada (várias entradas = várias janelas) | Some do cardápio | Categoria domina: se a categoria tem horário, **todos** os produtos dela ficam restritos a esse horário, mesmo que o produto tenha config própria diferente |
| **Toast POS** | **Só o menu inteiro** (não item, não categoria, não modificador) | Dias + 1 janela por menu (pra variar por dia, duplica o menu) | Menu inteiro some; item que precisa de horário próprio exige criar um menu novo só pra ele | Sim — o mesmo item pode existir em vários menus (cada menu é só uma "visão" sobre os itens, não dono deles) |
| **WhatsMenu** | Categoria | Múltiplas janelas por dia, nativamente (não precisa duplicar nada) | Item vira invisível; se o cliente tentar adicionar um item de uma página desatualizada, aparece "This item is not available at this time" | Sim — a mesma categoria pode entrar em vários "dayparts" diferentes |
| **Clover** | Item ou categoria (feature "Menus by Daypart", lançada em 2025 depois de pedido represado de anos) | Dias + janela | Não documentado em detalhe | Não detalhado, mas pedidos de merchant mencionam múltiplos cardápios coexistindo (café, almoço, tarde) |
| **Datacaixa** | Só estoque, não horário | — | "Produto indisponível no momento" | N/A |

---

## Padrão recorrente (síntese)

1. **Nenhum concorrente pesquisado usa "cardápio" como dono exclusivo do produto.** Todos tratam horário como um **atributo de disponibilidade** anexado ao produto e/ou à categoria já existente no catálogo único — não como uma entidade separada que "leva" o produto pra fora do catálogo geral. Toast é o mais próximo de "cardápio como objeto", mas mesmo lá um item pode aparecer em vários menus ao mesmo tempo, porque o menu é só uma visão, não um dono.
2. **Categoria "vence" produto quando os dois têm horário configurado** (Goomer, CardápioWeb) — evita que alguém esqueça de configurar um produto individualmente dentro de uma categoria já restrita.
3. **Produto sem nenhuma configuração de horário fica sempre visível** — é o comportamento padrão/seguro, ninguém corre risco de sumir um produto sem querer.
4. **Múltiplas janelas por dia dentro da mesma regra é comum** (WhatsMenu nativamente, CardápioWeb via múltiplas entradas, Toast via duplicação de menu) — cobre casos como happy hour (17h-19h e 22h-00h) sem precisar de gambiarra.
5. **O que acontece com o item "fora de horário" quase nunca tem uma mensagem clara pro cliente** — na maioria dos casos ele simplesmente some. Só o WhatsMenu documenta uma mensagem explícita ("não disponível neste horário").
6. **Ninguém documenta o que acontece se o horário fechar com o item já no carrinho** — ponto cego do mercado inteiro, inclusive do Toast. É uma decisão de UX que o Ordin vai ter que tomar sozinho, sem precedente claro pra copiar.
7. **Feature relativamente recente até nos grandes** — Clover só lançou "Menus by Daypart" em 2025, depois de anos de pedido representado no fórum de feedback. Não é um problema resolvido há décadas, é uma área ainda em maturação até no mercado americano.

---

## ⚠️ Divergência importante entre o que você propôs e o padrão de mercado

Você descreveu a regra assim: **"entrou em um cardápio só fica disponível nas regras do mesmo, ficando indisponível no catálogo geral."** Testei essa frase contra os 6 sistemas pesquisados e **nenhum deles funciona exatamente assim** — todos tratam "cardápio por horário" como uma regra de disponibilidade em cima do catálogo único, não como uma entidade que tira o produto do catálogo geral.

**Por quê isso importa na prática:** se um produto só pode pertencer a exatamente 1 cardápio (exclusividade real), um item comum a dois períodos — ex. **café coado**, que faz sentido tanto no cardápio de café da manhã (8h-10h) quanto no almoço (11h30-15h) como acompanhamento — precisaria ser **cadastrado duas vezes** (dois produtos diferentes, dois SKUs, vendas contadas separadamente, imagem/descrição duplicada e precisando ser mantida em sincronia manualmente). Isso é exatamente o tipo de dor que o Clover carregou por anos antes de resolver, e nenhum concorrente atual aceita esse trade-off.

**Recomendação (PM):** manter a ideia central que você pediu — um cardápio nomeado, com dias/horários e uma composição de categorias/produtos, e produto vinculado a esse cardápio **deixa de ser "sempre visível"** — mas ajustar a regra de exclusividade:

> Um produto pode pertencer a **um ou mais** cardápios por horário. Assim que ele entra em pelo menos um, deixa de aparecer no catálogo "sempre ligado" — ele só fica visível durante a **união** das janelas de todos os cardápios aos quais está vinculado. Um produto sem nenhum cardápio associado continua se comportando como hoje (sempre visível, sujeito só ao `active`).

Isso preserva 100% da clareza que você pediu ("entrou em cardápio, só aparece nas regras dele") e evita a duplicação de produto que nenhum concorrente aceita. Se, depois de ver isso, você preferir a exclusividade estrita mesmo (só 1 cardápio por produto), é perfeitamente possível implementar do jeito que você descreveu originalmente — só queria trazer o trade-off antes de fechar a história.

---

## Achados que valem entrar na história

1. **Cardápio composto por categoria inteira OU produtos avulsos** (Goomer/CardápioWeb) — você já tinha pedido isso ("selecionar através de categoria e produto"), a pesquisa confirma que é o padrão, incluindo a regra de "categoria vence produto" pra evitar esquecimento — recomendo herdar essa regra: se um cardápio inclui a categoria inteira, todo produto dela entra automaticamente, sem precisar marcar um por um; produtos adicionados avulsos (de categorias não incluídas por inteiro) continuam configuráveis individualmente.
2. **Múltiplas janelas de horário por cardápio** (ex.: happy hour 17h-19h e 22h-00h) — não pedido explicitamente por você, mas é comum o suficiente (3 de 6 sistemas) pra eu sugerir incluir desde a v1, evitando ter que criar dois cardápios com o mesmo nome pra cobrir os dois blocos.
3. **Produto sem cardápio nenhum = sempre visível** (comportamento padrão/seguro em todos os 6 sistemas) — recomendo manter esse default, evita que a feature nova quebre silenciosamente o catálogo de quem não usar cardápios.
4. **Mensagem clara se o item some do carrinho no meio do pedido** (achado do WhatsMenu, único que documenta isso) — o Ordin precisa decidir isso de qualquer forma, já que ninguém mais documenta a solução; sugiro tratar como uma variação do que provavelmente já existe pra produto que vira `active=false` no meio de uma sessão (se já existir handling pra isso, reaproveitar).

## Fora de escopo (não sugerido pra essa história)

- **Fuso horário múltiplo** — irrelevante pro modelo atual do Ordin (empresa única, sem indicação de operar em mais de um fuso); mencionar só como nota técnica pro backend usar horário local do servidor sem se preocupar com timezone por empresa.
- **Preço diferente por cardápio** (Toast/Clover mencionam por cima) — mudaria o modelo de preço do produto de "um preço fixo" pra "preço por contexto", escopo bem maior; não foi pedido, não sugiro adicionar agora.
- **Publish/draft explícito antes de ir ao ar** (Goomer exige clicar "Publicar") — interessante como ideia de segurança operacional, mas é uma mudança de fluxo maior que afetaria o catálogo inteiro, não só cardápios por horário; deixar como ideia registrada, não pra essa história.

---

## Perguntas em aberto — preciso da sua decisão antes de formalizar a história

1. **Exclusividade:** aceita a versão ajustada (produto pode estar em vários cardápios, união das janelas) ou prefere a exclusividade estrita como você descreveu originalmente (produto só pode estar em 1 cardápio)?
2. **Carrinho no meio do horário fechando:** o pedido já em andamento deve continuar valendo (cliente já pagou/está pagando) mesmo que o horário feche no meio, ou deve travar o checkout e avisar?
3. **Múltiplas janelas por cardápio** (happy hour-style) — entra na v1 ou fica pra depois?
4. **Cardápios sobrepostos** com o mesmo produto em horários que se cruzam (erro de configuração do dono) — bloquear ao salvar, ou permitir e deixar por conta de quem configurou?
5. **Granularidade de dia:** dia da semana fixo (seg-dom) é suficiente, ou precisa de exceção por data específica (feriado, evento)? Nenhum concorrente pesquisado documenta exceção por data — se quiser isso, seria diferencial real, não cópia de mercado.
