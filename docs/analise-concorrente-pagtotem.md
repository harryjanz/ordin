# Análise de concorrência — PagTotem / PagBank (produto, funcionalidades, preço)

Sexto e último da leva de aprofundamento dos 8 concorrentes originalmente cobertos só por dashboard/BI em `docs/analise-dashboard-concorrentes-mercado.md` (achado da época: "painel com aba 'Todas' que consolida vendas de qualquer maquininha/canal PagBank num único lugar; relatório detalhado por forma de pagamento e por canal"). Pesquisa (2026-09-10). Fecha a rodada de 8 — ver `docs/project_ordin_concorrentes_referencia` (memória) pra lista completa e o que ainda falta no total do projeto.

**Fontes:** `pagbank.com.br/para-seu-negocio/solucoes-empresariais/totem-de-autoatendimento` (página de produto) e `blog.pagbank.com.br/conheca-o-pagtotem` (blog institucional). A loja pública do PagBank (`loja.pagbank.com.br`) **não lista o PagTotem** — só maquininhas de cartão (Moderninha, Minizinha) — confirma que é produto de venda comercial dedicada, não self-service de e-commerce.

## O que é — diferença de posicionamento importante

PagTotem é o hardware de totem da **PagBank** (ex-PagSeguro), ou seja, é primeiro uma empresa de **meios de pagamento** que também vende o terminal físico — não uma empresa de software de gestão de restaurante que adicionou pagamento (caminho inverso de todos os outros concorrentes pesquisados: SisFood/CPlug/Nola/Consumer/Gototem nasceram como software de PDV/gestão e integram pagamento; PagTotem nasce do lado do adquirente). Isso é coerente com o que a memória `project_integracao_stone_decidida` já registrava sobre a Stone: adquirentes de pagamento entrando no hardware de totem é um padrão de mercado, não caso isolado.

## Especificações do hardware

- Tela touchscreen **23"**.
- Câmera frontal 8MP + **reconhecimento facial** (único concorrente pesquisado com esse recurso).
- Impressora térmica integrada, leitor de cartão (chip/tarja/NFC), scanner QR/código de barras.
- Áudio (speakers) e iluminação LED.
- Conectividade: Ethernet, Wi-Fi 2.4/5GHz, Bluetooth.
- SO Android, teclado físico em metal.
- Dimensões: 97 x 39 x 18 cm, 12,98 kg, bivolt. Base de sustentação **não acompanha** (custo adicional implícito não detalhado).

Diferente do modelo "BYO hardware" (SisFood, CPlug) — o PagTotem é appliance fechado e completo, parecido em filosofia com o hardware da Zig, mas focado em varejo/retail em vez de eventos.

## Formas de pagamento e fluxo

Débito/crédito (todas as bandeiras), voucher/vale-refeição, Pix, QR Code, NFC (contactless), carteiras digitais. Fluxo: seleção de produto na tela → carrinho → pagamento → impressão de cupom com senha pra retirada no balcão.

Integração técnica via **PlugPag** (biblioteca de pagamentos própria do PagBank) — equipe de integração dá suporte técnico. Não há menção de integração com PDVs de terceiros (diferente do Gototem, que lista uma dezena de PDVs compatíveis) — sugere que o PagTotem é pensado pra rodar dentro do próprio ecossistema PagBank, não como camada plugável universal.

## Segmentos-alvo — outro dado que destoa do perfil "restaurante pequeno"

O blog institucional cita como alvo **"redes de supermercado, grandes lojas de varejo e locais de eventos"** — não restaurante pequeno/médio como foco primário (a página de produto lista "lojas, mercados, restaurantes e eventos" de forma mais ampla, mas o blog é mais específico em mirar operação grande). Terceiro concorrente da rodada (depois de Nola e Zig) cujo público declarado não é o pequeno/médio food service que o Ordin mira.

## Preço, setup e taxas — nada público, e comercialização é só por contato dedicado

- Não há preço, taxa de transação específica do totem, nem modelo de aquisição (compra x aluguel x comodato) divulgado em nenhuma das páginas.
- Aquisição só via "comercial responsável pela sua conta" ou formulário de contato — não é auto-contratável mesmo pra clientes PagBank existentes.
- Confirma o padrão já visto: quanto mais o produto depende de hardware físico fechado e de conta comercial já estabelecida (PagBank já processa pagamento do cliente), menos transparência de preço público — o inverso do padrão CPlug/Consumer (self-service, SaaS, preço público).

## Comparação com o Ordin (observações, não recomendação)

- **Adquirente entrando em hardware de totem** (PagBank aqui, e Stone com Stone Connect no achado do SisFood/CPlug) é um padrão de mercado que se repete — reforça que o modelo "totem vendido pela empresa de pagamento" é uma categoria própria, distinta de "totem vendido pela empresa de PDV/gestão". Vale ter esse mapa mental ao avaliar qualquer parceria de pagamento futura do Ordin (Adyen/Stone/PayGo já em análise — memórias `project_integracao_adyen_decidida`, `project_integracao_stone_decidida`, `docs/analise-paygo-modelo-integracao.md`).
- **Reconhecimento facial** é feature nova, não vista em nenhum outro concorrente — não há indicação de pra que serve exatamente (login de cliente recorrente? verificação de idade pra álcool? não detalhado), mas vale registrar como sinal de tendência de hardware, sem recomendação de adoção.
- **Foco em varejo/supermercado grande**, não em food service pequeno/médio — reforça, junto com Zig e Nola, que uma fração relevante da "lista de 8" na verdade não compete diretamente pelo cliente-alvo do Ordin. Vale considerar reclassificar a lista de referência por "concorrente direto" vs. "adjacente" numa próxima limpeza da memória de referência.

## Fechamento da rodada de aprofundamento (CPlug → PagTotem)

Com este, os 8 concorrentes da rodada de dashboard (`docs/analise-dashboard-concorrentes-mercado.md`) têm agora perfil aprofundado de produto/funcionalidades/preço, cada um em doc próprio: CPlug, Nola, Consumer, Zig, Gototem, PagTotem — mais Goomer e Suitable, que **ainda não têm doc de aprofundamento dedicado** (só o achado de dashboard da rodada anterior). Consultar `docs/project_ordin_concorrentes_referencia` (memória) antes de decidir os próximos passos.
