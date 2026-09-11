# Análise de concorrência — Goomer (produto, funcionalidades, preço)

Sétimo da leva de aprofundamento — Goomer já tinha `docs/analise-dashboard-concorrente-goomer.md` (2026-08-XX, gerou a ORD-101) cobrindo só o painel de analytics. Esta pesquisa (2026-09-10) completa com produto, funcionalidades do totem e preço, que a rodada anterior não cobriu. Ver `docs/project_ordin_concorrentes_referencia` (memória) pra lista completa.

**Fontes:** `goomer.com.br/totem-autoatendimento` (página de produto do totem) e `goomer.com.br/blog/quanto-custa-sistema-restaurante` (blog, referência de preço).

## O que é

Uma das maiores plataformas de cardápio digital/PDV do Brasil — **20+ mil negócios** usando, **mais de 80 integrações** de parceiros (Sischef, Desbravador, Saipos, Colibri, Teknisa, Menew, Linx, entre outras). Modelo de negócio importante: **a Goomer comercializa só o software** — pra hardware do totem, ela indica parceiros de aluguel/compra, não vende ela mesma o equipamento físico. Isso a coloca mais perto do modelo Gototem (plugável) do que do modelo CPlug/Consumer (venda de ecossistema fechado com hardware incluso).

## Modelos de totem (3 variantes)

- **Totem Vertical**: solução "tudo em um" (impressão, leitor, maquininha, software), instalável em parede/balcão/pedestal sem obra. Vendida como "preço acessível de verdade — até 50% menos que concorrentes" (claim direto de menor preço no mercado, sem citar valor).
- **Totem Mini**: maquininha Payer acoplada, com **"flexibilidade de adquirente"** — permite escolher/configurar múltiplos processadores de pagamento. Único concorrente pesquisado até agora a expor isso como feature de venda explícita (multi-adquirente configurável pelo cliente).
- **Totem Mini Clover**: modelo compacto com máquina de cartão e impressora integradas num terminal só — "máxima autonomia", indicado pra "alto fluxo/pouco espaço".

## Funcionalidades e diferenciais

Fluxo padrão do mercado (cardápio → personalização → pagamento integrado → pedido pra cozinha). Formas de pagamento: cartão crédito/débito, Pix. Claims de resultado: **ticket médio até 3x maior**, redução de fila, dispensa de operador de caixa dedicado.

## Preço — só referências indiretas de blog, sem tabela oficial do totem

Não há tabela pública específica pro totem (mesma situação de Nola/Zig/Gototem/PagTotem). Os números encontrados são de blog/terceiros, não confirmados como preço oficial atual — registrar como ordem de grandeza, não cotação:

- Cardápio Digital: Grátis (até 30 pedidos delivery/mês, R$1,39 por pedido excedente) → Básico (~R$130/mês) → Automatizar (a partir de R$140/mês) → Integrar (a partir de R$224,93/mês).
- Uma fonte terceira (Abrahão, revendedor/parceiro) citou totem+tablet "por volta de R$300/mês" pros planos com mais recursos, hardware à parte.
- PDV: R$50-300/mês (small-medium); KDS: R$100-300/mês — faixas de mercado, não confirmadas como específicas da Goomer.

## Comparação com o Ordin (observações, não recomendação)

- **Modelo "software só, hardware por parceiro"** é o terceiro visto com essa exata lógica (depois de Gototem e, em menor grau, CPlug que também tem hardware flexível mas vende ela mesma) — reforça que "vender hardware fechado" (CPlug/Consumer/SisFood/PagTotem/Zig) e "vender só software, hardware por fora" (Goomer/Gototem) são dois modelos de negócio concorrentes igualmente presentes no mercado brasileiro.
- **"Flexibilidade de adquirente" como feature vendida** é um ponto de contraste direto com o próprio posicionamento do Ordin — a memória `project_ordin_concorrentes_referencia`/doc de dashboard já registrava "multi-provedor de pagamento... diferencial real que quase nenhum concorrente pesquisado expõe dessa forma" — a Goomer é a **primeira exceção clara** encontrada até agora, mesmo que só no modelo Mini (maquininha acoplada configurável), não confirmado se cobre PayGo/Adyen/Stone especificamente.
- **80+ integrações de PDV** é o maior número visto entre os concorrentes plugáveis (Gototem citou ~10-15) — sinaliza o tamanho e maturidade de mercado da Goomer.

## Próximos passos

Fecha (junto com Suitable, próximo doc) a rodada completa dos 8 concorrentes de dashboard com aprofundamento de produto/preço.
