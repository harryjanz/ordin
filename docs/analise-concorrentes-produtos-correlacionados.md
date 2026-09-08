# Análise de concorrência — produtos correlacionados (cross-sell sem combo)

Pesquisa (2026-09-08) motivada pelo usuário: o catálogo do Ordin já cobre cardápio, opções
(`OptionGroup`/`Option`, ORD-137 a 146), combos (`Combo`/`ComboItem`, ORD-112/150) e cardápios por
horário (ORD-124/125) — mas falta um mecanismo de **indicar produtos correlacionados sem depender
de combo**. Objetivo: aumentar ticket médio sugerindo item complementar (ex: molho extra pra
batata, sobremesa depois do prato principal) sem precisar cadastrar um `Combo` com preço próprio
pra cada combinação possível.

## Isso já existe no Ordin hoje — só que acoplado a Combo

Vale nomear o que já está em produção antes de comparar com o mercado, porque o nome "upsell" já
está em uso: `Combo.upsell_enabled` + `ComboItem.triggers_upsell` (ORD-150/157) fazem o totem
interromper a adição de um produto avulso ao carrinho com um modal "Leve o Combo X" **sempre que**
esse produto for componente de um combo elegível (`CatalogScreen.tsx`, `handleAddProduct`). Isso
cobre um caso (combo com desconto), mas não cobre o caso que o usuário está pedindo agora:
sugerir um produto complementar **sem** empacotar os dois num preço de combo — ex. "que tal um
molho barbecue com essa batata?" sem criar um "Combo Batata+Molho" com preço próprio.

## Como o mercado nomeia e resolve isso

| Player | Mecanismo | Curadoria | Onde aparece | Depende de combo? | Fonte |
|---|---|---|---|---|---|
| Toast POS | **Menu Upsells** — 4 tipos: *menu pairing*, *standalone*, *modifier recommendation*, *item upgrade* | 100% manual (admin liga item-gatilho → item-sugerido); Toast IQ só *sugere* ideias com base em dados de venda, não decide sozinho | POS (banner azul pro operador), Kiosk (botão "No thanks"), Guest-Facing Display (ao lado do comprovante) | Não — é entidade própria, independente de combo/bundle | [support.toasttab.com](https://support.toasttab.com/en/article/Get-Started-With-Menu-Upsells) |
| Goomer | "Venda sugestiva" — bebida que harmoniza com o prato escolhido | Não confirmado se é regra manual configurável ou só texto de marketing do produto — busca não achou artigo de central de ajuda com o passo a passo de configuração (só blog institucional) | Tela do totem/tablet/app, "logo após escolher prato e bebida" | Doc não deixa claro | [goomer.com.br/blog](https://goomer.com.br/blog/vendas-sugestivas-cardapio) |
| iFood | Não achado mecanismo de "produto relacionado" distinto — só "Grupo de Complementos" (mesmo primitivo do ORD-137/146, é opção/modificador, não cross-sell) e criação de combo | — | — | O que existe é combo, não cross-sell | [blog-parceiros.ifood.com.br](https://blog-parceiros.ifood.com.br/como-criar-combos-ifood/) |
| Shopify (ecossistema de apps, e-commerce) | Ecossistema inteiro de apps terceiros pra isso — sinal de que **não é feature nativa até de uma das maiores plataformas de e-commerce do mundo**, e sim um problema resolvido por camada especializada em cima do catálogo | Depende do app: curadoria manual (a maioria) ou algorítmica ("frequently bought together" aprende com histórico de pedidos) | Página de produto, carrinho, checkout | Não | [apps.shopify.com](https://apps.shopify.com/categories/marketing-and-conversion-upsell-and-bundles) |
| McDonald's / Shake Shack (kiosk) | Prompt de checkout ("Add fries? Add dessert?") — não é produto público/documentado, é sistema proprietário fechado | N/A (não é produto de mercado, é operação própria) | Kiosk, momento de fechar pedido | Não | [grubbrr.com](https://grubbrr.com/the-benefits-of-mcdonalds-self-ordering-kiosks/), [CNN Business](https://www.cnn.com/2024/09/20/business/self-service-kiosks-mcdonalds-shake-shack) |

**Achado central: Toast POS é a única fonte com documentação de produto completa e pública.** Os
outros players confirmam que a prática (venda sugestiva/cross-sell) é reconhecida e vendida como
benefício de marketing, mas só o Toast documenta o mecanismo — o resto é "acredite que funciona"
sem abrir a caixa preta de como configurar.

## Terminologia — separar 3 conceitos que o mercado mistura

A pesquisa cruzando food-service (Toast, Goomer) com e-commerce (Shopify) deixou claro que "cross-
sell" e "upsell" são usados de forma inconsistente entre plataformas. Vale fixar 3 conceitos
distintos antes de desenhar o Explorer, porque o Ordin **já usa a palavra "upsell"** pra outra
coisa (combo, ORD-150):

1. **Upsell** (sentido estrito, já usado no Ordin) — trocar por uma versão **maior/melhor** do
   mesmo item, ou empacotar com desconto (o `Combo` de hoje é essencialmente isso).
2. **Cross-sell** (o que o usuário está pedindo agora) — sugerir um item **diferente e
   complementar**, sem alterar o item original nem depender de preço de pacote. É o "Menu pairing"
   e "Standalone" do Toast.
3. **"Frequently bought together" / recomendação algorítmica** — gerado a partir de histórico de
   pedidos (`OrderItem`), não curado manualmente. Nenhum player de food-service pesquisado confirma
   isso publicamente (é conceito majoritariamente de e-commerce, ex. Amazon/Shopify AI apps) — fica
   fora de escopo de uma v1, é evolução natural depois que o Ordin tiver volume de dados de pedido
   suficiente por empresa-cliente.

**Recomendação:** para não colidir com o `upsell_enabled` já existente, nomear o novo recurso como
**"produtos correlacionados"** ou **"sugestão de item complementar"** no domínio do Ordin (schema,
UI do admin, história) — evita o operador/admin confundir com o toggle de combo do ORD-157.

## Por que isso alavanca ticket médio — evidência de mercado

- Kiosks de self-service aumentaram o ticket médio do McDonald's em **30%** via prompts de upsell/
  cross-sell visuais, e o check size médio subiu **5-6%** no primeiro ano após introdução dos
  quiosques ([CNN Business](https://www.cnn.com/2024/09/20/business/self-service-kiosks-mcdonalds-shake-shack)).
- Goomer promete até **40%** de aumento de ticket médio com venda sugestiva/cross-sell no cardápio
  digital ([goomer.com.br/blog](https://goomer.com.br/blog/vendas-sugestivas-cardapio)) — número de
  marketing do próprio vendor, tratar como teto otimista, não benchmark neutro.
- Achado comportamental relevante do McDonald's: cliente é **mais receptivo** ao prompt de upsell
  no quiosque do que quando um atendente humano oferece verbalmente — menos sensação de pressão de
  venda. Reforça que o canal certo pra isso no Ordin é o totem (self-service), não precisar de
  intervenção do operador de balcão.

## Como isso se encaixa no modelo de dado do Ordin hoje

Contexto do `catalog-service` atual (`services/catalog/main.py`):
- `Product` é um registro plano por empresa (`company_id`), sem relação produto-a-produto hoje.
- `Combo`/`ComboItem` já é uma tabela de associação N:N entre produtos (`combo_items`, chave
  composta `combo_id`+`product_id`), com um campo booleano de gatilho (`triggers_upsell`) — é o
  precedente estrutural mais próximo dentro do próprio Ordin pro que se está propondo agora.
- O modal de sugestão no totem já existe e já interrompe a adição ao carrinho
  (`CatalogScreen.tsx`, `handleAddProduct`, `upsell` state) — ponto de entrada natural a reaproveitar
  ou teto de UX a não duplicar/confundir.

**Rascunho de modelo, seguindo o mesmo padrão de `ComboItem` (não é decisão fechada, é insumo pro
Tech Explorer):**

```
class RelatedProduct(Base):
    __tablename__ = "related_products"
    product_id         = Column(Integer, ForeignKey("products.id"), primary_key=True)
    related_product_id = Column(Integer, ForeignKey("products.id"), primary_key=True)
    sort_order          = Column(Integer)  # múltiplas sugestões por produto, ordem de exibição
    active               = Column(Boolean, default=True)
```

Pontos que essa modelagem simples ainda não resolve, e que precisam de decisão no Explorer:
- **Direção da relação.** "Batata → Molho" não implica "Molho → Batata" (correlação não é
  simétrica — ninguém compra batata *depois* de já ter molho na mão). O rascunho acima já assume
  unidirecional (par ordenado), igual ao Toast ("driving item" → "suggested item").

### Decisão registrada (2026-09-08) — prioridade combo > correlacionado, um só ponto de entrada

O usuário decidiu a estratégia de coexistência com o upsell de combo existente: **`handleAddProduct`
continua com a mesma checagem de hoje primeiro** (produto é componente de algum combo elegível,
`upsell_enabled`+`triggers_upsell`) — se achar, mantém o modal "Leve o Combo X" exatamente como é
hoje, sem mudança de comportamento. **Só quando não há combo elegível** é que a nova checagem entra:
se o produto tem `RelatedProduct` ativos cadastrados, oferece esses como sugestão. Isso resolve
sozinho o problema de "dois modais concorrentes" levantado abaixo como risco — na prática nunca vai
haver colisão, porque é sempre um `if/else if`, nunca os dois ao mesmo tempo. Ainda em aberto pro
Explorer: se a sugestão de produto correlacionado usa o **mesmo estilo de modal** do combo (consistência
visual, reaproveita o componente) ou um formato mais leve/não-bloqueante como o banner do Toast —
como não há mais risco de colisão, essa escolha agora é puramente de UX, não de arquitetura de
prioridade.

- **Escopo v1 de curadoria: manual, com uma camada de sugestão assistida por IA (ver seção
  dedicada abaixo)** — o usuário pediu para explorar se dá pra sugerir automaticamente quais
  produtos do catálogo fazem sentido correlacionar, em vez de o admin cadastrar par por par do
  zero.

## É viável sugerir as correlações automaticamente? (pedido do usuário)

Existem duas famílias de técnica no mercado pra isso, e elas servem a dois momentos diferentes da
vida de uma empresa-cliente no Ordin — não são substitutas uma da outra:

### 1. Baseada em histórico de pedidos (association rule mining / "market basket analysis")

É como o Wiser (Shopify) e a literatura clássica de varejo resolvem "frequently bought together":
algoritmos como **Apriori** ou **FP-Growth** vasculham transações passadas e encontram pares de
itens que aparecem juntos com frequência acima do esperado pelo acaso
([Analytics Vidhya](https://www.analyticsvidhya.com/blog/2021/10/a-comprehensive-guide-on-market-basket-analysis/),
[Wiser](https://www.getwiser.ai/personalized-recommendations/frequently-bought-together)). É o
padrão mais "correto" estatisticamente — a correlação vem do comportamento real dos clientes
daquela empresa específica, não de suposição.

**Problema pro Ordin: exige volume.** O dado de origem seria `OrderItem` (order-service), por
`company_id`. Uma empresa nova cadastrada na Ordin (dia 1, catálogo recém-criado) não tem nenhum
pedido ainda — não tem o que minerar. Essa técnica serve bem pra empresas já maduras na
plataforma (ex. Burger House, que é a demo com mais histórico), mas deixa a empresa nova sem
nenhuma sugestão justamente quando ela mais precisaria de ajuda pra configurar o catálogo.

### 2. Baseada em metadado do catálogo (LLM / similaridade semântica) — resolve o cold-start

Linha de pesquisa mais recente: usar um LLM (ou embeddings semânticos) sobre o **texto** do
produto — nome, descrição, categoria, tags, alérgenos — pra inferir relação sem precisar de
nenhum pedido histórico. A literatura confirma isso especificamente como técnica de
**cold-start**: quando não há interação de usuário suficiente, a similaridade vem do conteúdo
textual, não do comportamento
([pesquisa sobre cold-start com LLM](https://www.computer.org/publications/tech-news/trends/llm-semantic),
[embeddings + busca por vizinho mais próximo](https://www.sciencedirect.com/science/article/abs/pii/S0925231225014250)).

**Por que isso encaixa bem no Ordin especificamente:** o catálogo já tem os campos que essa
técnica consome — `Product.name`, `description`, `description_long`, `tags` (JSON livre, ORD-075),
`Category` — sem precisar de nenhum dado novo. Dá pra desenhar como uma ação pontual do admin
("Sugerir produtos correlacionados"), não uma automação invisível: o backend manda o catálogo
ativo da empresa (nome+descrição+categoria de cada produto) pra um LLM, pede pares plausíveis com
uma justificativa curta, e devolve como **sugestão pra aprovação** — o admin ainda revê e confirma
cada par antes de ir pro ar, mesmo modelo de "sugestão assistida, decisão humana" que o Toast IQ
já usa (seção acima) e que evita o risco de uma IA relacionar produtos sem sentido comercial
(ex: sugerir sobremesa gelada com sopa quente) sem ninguém checar.

### Decisão registrada (2026-09-08) — IA fica como feature futura, fora do escopo agora

O usuário confirma que acredita nas duas técnicas, cada uma no seu momento certo da maturidade da
empresa-cliente (metadado/LLM pro dia 1 sem histórico, association rule mining pra quem já tem
volume de pedido) — mas decidiu **não implementar nenhuma das duas agora**. A história atual
("cadastro de produtos correlacionados") é só o CRUD manual: admin cadastra os pares um a um pelo
admin panel, sem nenhuma sugestão automática. As duas técnicas de IA ficam **registradas aqui como
roadmap futuro**, não como pendência bloqueante nem como algo a esboçar no Tech Explorer desta
história — não desenhar a tabela/schema pensando em acomodar a IA ainda, é decisão de quando essa
história futura for aberta. Resumo do roadmap, pra quando isso for retomado:

- **V-futuro-1 (dia 1 da empresa-cliente, sem histórico):** sugestão via LLM sobre metadado do
  catálogo (nome/descrição/categoria/tags) — resolve cold-start, sempre com aprovação do admin.
- **V-futuro-2 (empresa madura, com volume de `OrderItem`):** association rule mining sobre
  pedidos reais — refina/prioriza o que a v-futuro-1 sugeriu, não a substitui.

**Ponto de atenção novo pro Tech Explorer, sem precedente hoje no Ordin:** não existe nenhuma
integração com LLM/IA generativa no código atual (`grep` por `openai`/`anthropic`/`embedding` em
`services/` e `frontend/admin` não retornou nada) — seria a primeira. Implica decisão nova de
arquitetura que os outros serviços não tiveram que tomar: provedor (OpenAI/Anthropic/outro),
gerenciamento de credencial (variável de ambiente global do catalog-service, já que é
configuração de plataforma, não por empresa-cliente — diferente do padrão `company_payment_configs`
usado pra TEF), custo por chamada (ação pontual sob demanda do admin, não por requisição do
totem, então custo controlado), e é sempre sugestão — nunca aplica a correlação sem o admin
confirmar.

## Próximos passos sugeridos

Não é Explorer ainda — é insumo pra decidir se abre um Explorer de "produtos correlacionados"
como próxima história do catálogo. Já decidido pelo usuário (2026-09-08): nome do recurso
("produtos correlacionados"), prioridade combo > correlacionado com um só ponto de entrada em
`handleAddProduct`, e escopo v1 é **cadastro 100% manual** — sem sugestão de IA nesta história
(as duas técnicas de IA ficam documentadas como roadmap futuro, seção acima, não fazem parte do
Explorer desta história). Perguntas que o Explorer formal ainda precisa fechar: formato visual da
sugestão (modal igual ao combo vs. banner mais leve, agora que não há mais risco de colisão entre
os dois), se a sugestão aparece só no totem (fluxo goloso, aumento de ticket) ou também no balcão
(venda assistida), limite de quantas sugestões por produto, e se o gatilho é por produto
individual ou também por categoria.
