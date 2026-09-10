# Análise de concorrência — SisFood, totem de autoatendimento

Pesquisa (2026-09-08) sobre o conteúdo público do SisFood a respeito do produto de totem de autoatendimento, fonte: [sisfood.com.br/saiba-mais/autoatendimento/totem-autoatendimento-restaurante](https://www.sisfood.com.br/saiba-mais/autoatendimento/totem-autoatendimento-restaurante) (página de conteúdo/SEO, atualizada em 28/08/2026, parte de um cluster "Guia de Autoatendimento em Restaurante").

Não havia uma pergunta de produto específica motivando essa pesquisa — é levantamento geral de concorrente direto (SisFood também vende totem de autoatendimento pra food service, mesmo mercado do Ordin).

## O que é o produto SisFood

Totem = **hardware da própria loja** (PC Windows + monitor touch vertical + impressora térmica 80mm) rodando o **software** SisFood, não um appliance proprietário vendido por eles. É um dos 4 modos do "cardápio digital" da plataforma:

1. Totem
2. Tablet na mesa
3. QR Code na mesa
4. Cardápio digital por link

Os quatro modos compartilham o **mesmo cardápio cadastrado uma vez no PDV** — cadastra o produto uma vez, aparece em todos os canais.

## Fluxo do pedido (igual em essência ao do Ordin)

Tipo de pedido (consumir/levar) → navega cardápio com foto/descrição/preço → personaliza (combo, modificador tipo "sem cebola") → confirma → paga (cartão, PIX QR, ou cédula/moeda em alguns modelos) → cupom impresso com senha → vai automático pro KDS → chamada por senha quando pronto.

## Pagamento — ponto de maior diferença com o Ordin

- Cobrança pode ficar **no totem ou no caixa** (configurável).
- No totem: **pinpad com TEF integrado** OU **Stone Connect** (alternativa que "dispensa o TEF dedicado").
- Formas de pagamento criadas na ativação já nascem marcadas como "Totem Autoatendimento", separadas das do PDV normal — mantém relatório do dia segregado por canal.
- NFC-e sai automaticamente na impressora térmica junto com a senha.

Vale registrar: Stone Connect como alternativa ao TEF dedicado é relevante porque **[[project_integracao_stone_decidida]]** já está em andamento — o SisFood usando isso em produção é sinal de que o modelo funciona no mercado, pode valer revisitar quando as respostas do suporte Stone chegarem.

## Segmentação de hardware (linha de produto deles)

**Por gabinete:**
| Tipo | Tamanho | Uso |
|---|---|---|
| Chão | 1,80m | fast-food, food court |
| Bancada | 50-80cm | cafeteria, sorveteria |
| Outdoor | 1,80m + IP65 | drive-thru, área externa |
| Premium personalizado | customizado | rede com identidade visual própria |

**Por tela:** 15" (básico/bancada) · 21" (padrão de mercado) · 27" (recomendado fast-food, cardápio amplo) · 32" (premium, identidade visual forte).

**Por pagamento:** cartão+PIX (padrão) · cartão+PIX+cédula/moeda (mais caro, fast-food popular) · só PIX QR (mais barato, restringe quem não tem app de banco).

## Regra de dimensionamento (conteúdo de PM/vendas, não é feature)

1 totem para cada 30-50 pedidos no horário de pico (2h):

| Volume/dia | Pico (2h) | Totens recomendados |
|---|---|---|
| 30-60 | 15-30 | 1 (+ atendente humano em paralelo) |
| 60-120 | 30-60 | 1-2 |
| 120-250 | 60-125 | 2-4 |
| 250+ | 125+ | 4-6 + reforço |

Recomendam manter **sempre pelo menos 1 atendente humano de plantão**, independente do número de totens — pra casos fora do fluxo padrão (cliente sem cartão, dúvida, reclamação) e pra apoiar cliente 55+ nos primeiros 6-12 meses de adoção.

## Checklist de integração com PDV que eles vendem pro comprador cobrar do fornecedor

- Totem conecta com o PDV atual?
- Cardápio do totem é o mesmo do PDV (atualização automática)?
- Pedido vai pro KDS automaticamente?
- NFC-e é emitida automaticamente?
- Estoque é decrementado no momento do pedido?

Framing deles: "integração nativa é inegociável… sem isso, o resto não importa". Meio de venda for a favor do próprio produto integrado (contra concorrentes que vendem totem solto sem integração nativa de PDV).

## Erros de compra que eles apontam (conteúdo de objeção/venda)

1. Comprar pelo preço sem testar integração.
2. Subestimar número de totens (1 totem pra 100 pedidos/dia só desloca a fila pra tela).
3. Não treinar atendente pra orientar cliente nos primeiros 30 dias.
4. Cardápio com fotos ruins (maior alavanca de venda visual, foto amadora rende pior que nenhuma foto).
5. Não monitorar dados do totem (tempo médio de pedido, prato mais visto, abandono no carrinho) — citam esses três relatórios especificamente.

## Requisitos de infraestrutura que eles deixam explícitos

- Internet obrigatória o tempo todo (cardápio + pagamento cartão/PIX).
- Recomendação: internet fixa por cabo + chip 4G de backup no roteador.
- Suporte técnico em 24h como critério de compra ("totem quebrado é receita parada").
- Robustez de hardware pra operar 12-16h/dia contínuas.

## Comparação com o Ordin (observações, não recomendação)

- **Convergência:** fluxo de pedido é essencialmente o mesmo (tipo de pedido → cardápio → personalização → pagamento → senha → KDS → chamada), e a preocupação com decremento de estoque, NFC-e e integração nativa é idêntica ao que o Ordin já resolve nativamente por ser uma plataforma única (não dois sistemas).
- **Diferença de modelo de hardware:** SisFood roda como software em cima do PC/monitor/impressora que o cliente já tem ou compra à parte (BYO hardware); não ficou claro pela página se o Ordin hoje assume premissa parecida ou hardware mais fechado — vale conferir com `docs/roles/devops.md` / arquitetura de terminal se isso já está definido.
- **Multi-canal de cardápio compartilhado** (totem, tablet de mesa, QR de mesa, link) é um ponto de amplitude de produto que o Ordin não cobre hoje (Ordin é focado em totem/kiosk) — pode ser insumo pra roadmap futuro, sem decisão implícita aqui.
- **Segregação de forma de pagamento por canal** ("Totem Autoatendimento" separado do PDV nos relatórios) é um detalhe de UX de relatório que pode valer conferir se o `payment-service`/`order-service` do Ordin já expõe algo equivalente.
- Página é conteúdo de marketing/SEO, não documentação técnica — números de dimensionamento e "erros de compra" são posicionamento de vendas, tratar como tal, não como benchmark técnico validado.

## Próximos passos sugeridos

Nenhum decidido aqui — é levantamento cru. Se o usuário quiser aprofundar, os links internos da própria página do SisFood (não visitados nesta pesquisa) apontam pra: "quanto custa um totem de autoatendimento" (preços/ROI), "vantagens do autoatendimento", "sistema para restaurante: como escolher", e o guia geral do cluster de autoatendimento — podem valer uma segunda passada se o foco virar pricing/ROI competitivo.
