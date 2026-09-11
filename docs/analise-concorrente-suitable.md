# Análise de concorrência — Suitable (produto, funcionalidades, preço)

Oitavo e último da leva de aprofundamento dos 8 concorrentes originalmente cobertos só por dashboard/BI em `docs/analise-dashboard-concorrentes-mercado.md` (achado da época: "relatórios de totem citam tempo médio de pedido, prato mais visto, abandono de carrinho — métricas de sessão/funil, não de pedido finalizado"). Pesquisa (2026-09-10). Fecha a rodada de 8 por completo — ver `docs/project_ordin_concorrentes_referencia` (memória) pra consolidado.

**Fontes:** `suitable.com.br` (home, bloqueado no WebFetch simples — HTTP 403 — precisou navegador real) e `suitable.com.br/preco/` (planos e preços, tabela completa e pública).

## O que é

"O ecossistema definitivo para o food service" — plataforma com forte ênfase em **delivery, marketing e WhatsApp**, não em totem/salão como diferencial central (diferente de SisFood/CPlug/Consumer/Goomer). Destaque de posicionamento único: **"ÚNICO sistema para o food-service com Integração Oficial ao WhatsApp, sem risco de banimentos"** — mais de 20 integrações de marketplace/delivery listadas (iFood, AiqFome, Delivery Much, 99Food, Keeta, Cardápio Web, Brendi, Pedidos 10, Repediu, Accon, Open Delivery, entre outras) — o maior catálogo de integrações de canal de venda visto até agora na pesquisa (mais amplo que o foco em PDV do Gototem/Goomer).

Segmentos: pizzaria, hamburgueria, restaurante, lancheria, açaiteria, comida oriental, comida saudável, pub, doceria, frango assado, pastelaria, saladeria, distribuidora de bebidas, padaria, cafeteria, sorveteria.

## Autoatendimento — achado central: não é totem físico clássico, é QR code + tablet

Diferente de todos os outros 7 concorrentes da rodada (que vendem ou pelo menos mencionam totem físico como produto central), a Suitable trata autoatendimento como **duas ofertas distintas, nenhuma delas um totem-appliance tradicional**:

1. **"Autoatendimento com QR code"** — recurso incluído a partir do plano Premium, cliente pede pelo próprio celular.
2. **"Suit Tablet"** — tablet físico na mesa, "onde o cliente monta e envia pedidos diretamente à cozinha" — mais parecido com o modelo tablet-de-mesa de outros concorrentes (SisFood, CPlug) do que com um totem de chão/bancada dedicado.

Não há qualquer menção, nas páginas pesquisadas, a um totem físico tradicional (gabinete de chão/bancada como SisFood/CPlug/Consumer/Goomer vendem). Pode ser lacuna de produto real, ou só não estar na vitrine pública — não confirmado nesta pesquisa.

## Tabela de preços (`suitable.com.br/preco/`) — a mais completa e pública vista na rodada inteira

| Plano | Preço/mês | Preço à vista anual | Principais recursos |
|---|---|---|---|
| **Starter** | R$269,00 | R$3.228,00 | Cardápio digital, robô de WhatsApp, CRM, impressão automática de pedidos, controle por mesa/comanda |
| **Advanced** | R$368,00 | R$4.416,00 | + XML automático, emissão NFC-e, emissão automática por forma de pagamento, nota fiscal avulsa |
| **Premium** (mais popular) | R$459,00 | R$5.508,00 | + controle por comandas, **Autoatendimento com QR code**, app pro garçom lançar pedido no salão |
| **Ultra** | Consultar | — | + suporte prioritário, relatórios personalizados, múltiplas lojas, notas ilimitadas |

**Suit Tablet — precificação por volume, único modelo assim visto na pesquisa inteira:**
| Quantidade de tablets | Preço/mês por unidade |
|---|---|
| 1-10 | R$39,90 |
| 11-20 | R$34,90 |
| 21-30 | R$29,90 |
| 31-40 | R$24,90 |
| 41+ | R$19,90 |

Desconto de até 10% no plano anual. Parcelamento do plano anual exige saldo no cartão pro valor total.

**Achado central pro benchmark de pricing**: autoatendimento (via QR code) só entra no **terceiro degrau de preço** (Premium, R$459/mês) — parecido com o padrão Consumer (só no plano mais caro), mas aqui é ainda mais caro em termos absolutos. O Suit Tablet, por outro lado, é a **primeira e única precificação por volume/unidade com desconto progressivo** vista em toda a rodada — todos os outros concorrentes (quando expõem preço) cobram por plano fixo, não por unidade de hardware com tiers de quantidade.

## FAQ (perguntas capturadas, respostas não abertas nesta rodada — accordion não expandiu de forma confiável)

Perguntas listadas na página: personalização de mensagens do atendente virtual, necessidade de internet, se fazem os cadastros, emissão de nota fiscal, fidelidade de contrato, funcionamento do suporte/horários, integração com marketplaces, limite de telas/usuários, o que precisa pra funcionar. Conteúdo das respostas não foi capturado — se for necessário aprofundar, vale nova visita à página com mais tentativas de clique no accordion.

## Comparação com o Ordin (observações, não recomendação)

- **Foco em WhatsApp oficial + marketing/delivery**, não em totem, é um ângulo de produto que nenhum concorrente da rodada tinha mostrado com esse peso — se o Ordin algum dia expandir pra canais de pedido fora do totem físico (WhatsApp, QR de mesa), a Suitable é a referência mais madura vista até agora nesse ângulo específico.
- **Precificação por volume no hardware/dispositivo** (Suit Tablet) é um modelo comercial novo na pesquisa — únca vez que "quanto mais unidades, menor o preço unitário" apareceu de forma pública e explícita. Vale registrar como opção de modelo comercial caso o Ordin/parceiros comerciais algum dia discutam precificação por terminal.
- **Autoatendimento gated no plano mais caro** (Premium, R$459/mês) segue o mesmo padrão observado no Consumer — reforça que "totem/autoatendimento só no topo do funil de planos" é mais comum do que "incluso desde o básico" (só a CPlug fez isso na rodada inteira).
- Tabela de preço **pública e completa** (segunda depois da CPlug, e mais detalhada) — junto com Consumer, confirma que existe sim um grupo de concorrentes menores/self-service que competem com pricing transparente, mesmo que a maioria dos "grandes" (Nola, Zig, Gototem, PagTotem, Goomer) não exponha.

## Fechamento da rodada completa

Com Goomer e Suitable, os 8 concorrentes de `docs/analise-dashboard-concorrentes-mercado.md` têm agora perfil de produto/funcionalidades/preço em doc dedicado. Resumo consolidado do padrão de mercado sobre "onde o totem entra no preço", pros 4 concorrentes com tabela pública:
- **CPlug**: incluso desde o plano básico (R$249/mês)
- **Consumer**: só no plano mais caro (R$269,90/mês)
- **Suitable**: só no plano mais caro (R$459/mês, ou tablet à parte por volume)
- **Nola**: hardware separado, sob consulta, gated por faturamento do cliente

Ver `docs/project_ordin_concorrentes_referencia` (memória) — próxima atualização deve consolidar essa visão comparativa e decidir se compensa reclassificar "direto" vs. "adjacente" na lista de referência.
